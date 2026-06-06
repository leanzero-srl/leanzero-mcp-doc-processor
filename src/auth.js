import { promises as fs } from "node:fs";
import { randomBytes, randomUUID } from "node:crypto";
import path from "node:path";
import argon2 from "argon2";
import express from "express";
import rateLimit from "express-rate-limit";
import { log } from "./utils/logger.js";

const DATA_DIR = process.env.DATA_DIR || process.cwd();
const TENANTS_PATH = path.join(DATA_DIR, "tenants.json");
const ROTATE_GRACE_MS = 5 * 60 * 1000;

let cache = null;

async function loadTenants() {
  if (cache) return cache;
  try {
    const raw = await fs.readFile(TENANTS_PATH, "utf8");
    cache = JSON.parse(raw);
  } catch (err) {
    if (err.code === "ENOENT") cache = {};
    else throw err;
  }
  return cache;
}

async function saveTenants(tenants) {
  await fs.mkdir(path.dirname(TENANTS_PATH), { recursive: true });
  const tmp = `${TENANTS_PATH}.tmp.${process.pid}`;
  await fs.writeFile(tmp, JSON.stringify(tenants, null, 2), { mode: 0o600 });
  await fs.rename(tmp, TENANTS_PATH);
  try { await fs.chmod(TENANTS_PATH, 0o600); } catch { /* best effort on non-POSIX FS */ }
  cache = tenants;
}

export function invalidateTenantsCache() {
  cache = null;
}

function activeHashes(record) {
  const now = Date.now();
  const hashes = [];
  if (record.bearerHash) hashes.push(record.bearerHash);
  if (Array.isArray(record.expiringHashes)) {
    for (const e of record.expiringHashes) {
      if (e?.hash && typeof e.expiresAt === "number" && now <= e.expiresAt) {
        hashes.push(e.hash);
      }
    }
  }
  return hashes;
}

/**
 * Verify a raw bearer token against the tenant store (argon2, incl. rotation
 * grace hashes). Returns { id, displayName } for the matching tenant, or null.
 * Shared by the static-bearer middleware (`requireBearer`) and the OAuth bridge
 * (src/oauth/provider.js) so both auth paths resolve tenants identically.
 */
export async function verifyTenantToken(token) {
  if (!token) return null;
  const tenants = await loadTenants();
  for (const [tenantId, record] of Object.entries(tenants)) {
    for (const h of activeHashes(record)) {
      try {
        if (await argon2.verify(h, token)) {
          return { id: tenantId, displayName: record.displayName };
        }
      } catch { /* malformed hash — skip */ }
    }
  }
  return null;
}

// When OAuth is enabled, 401s on protected resources advertise where the
// authorization-server / protected-resource metadata lives, so MCP clients
// (e.g. claude.ai) can discover the OAuth flow. Left null when OAuth is off.
let resourceMetadataUrl = null;
export function setResourceMetadataUrl(url) { resourceMetadataUrl = url; }

function unauthorized(res) {
  if (resourceMetadataUrl) {
    res.setHeader("WWW-Authenticate", `Bearer resource_metadata="${resourceMetadataUrl}"`);
  }
  return res.status(401).json({ error: "unauthorized" });
}

export const requireBearer = async (req, res, next) => {
  const auth = req.headers.authorization;
  if (!auth || !/^Bearer\s+/i.test(auth)) return unauthorized(res);
  const token = auth.replace(/^Bearer\s+/i, "").trim();
  if (!token) return unauthorized(res);

  try {
    const tenant = await verifyTenantToken(token);
    if (tenant) {
      req.tenant = tenant;
      return next();
    }
  } catch (err) {
    log("error", "[auth] tenant load failed", { error: err.message });
    return res.status(500).json({ error: "internal error" });
  }

  return unauthorized(res);
};

export const tenantRateLimiter = rateLimit({
  windowMs: 60_000,
  max: () => Number(process.env.TENANT_RATE_LIMIT) || 60,
  keyGenerator: (req) => req.tenant?.id || req.ip,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    log("warn", "[auth] rate limit hit", { tenant: req.tenant?.id });
    res.status(429).json({ error: "rate_limit_exceeded" });
  },
});

function adminAuth(req, res, next) {
  const expected = process.env.DOC_PROCESSOR_ADMIN_TOKEN;
  if (!expected) return res.status(503).json({ error: "admin disabled (set DOC_PROCESSOR_ADMIN_TOKEN)" });
  const auth = req.headers.authorization;
  if (auth !== `Bearer ${expected}`) return res.status(401).json({ error: "unauthorized" });
  next();
}

// Defense-in-depth for the token-minting admin API: it is the highest-value
// surface (the admin token can mint/revoke any tenant), and the operator only
// ever calls it from the host itself (curl localhost). Tailscale Funnel publishes
// the whole server publicly, so we reject admin requests that arrive via Funnel.
//
// Funnel proxies through the local tailscaled, which adds X-Forwarded-For (the
// real public client IP). With `trust proxy: loopback` (set in server.js) req.ip
// then resolves to that public IP — not loopback. A direct localhost call has no
// forwarding header and a loopback req.ip. We require BOTH (loopback + no
// forwarding header) so the check fails closed. Set ALLOW_ADMIN_OVER_FUNNEL=true
// to opt back in to a publicly reachable admin API.
function isLocalAdminRequest(req) {
  const ip = req.ip || "";
  const isLoopback = ip === "127.0.0.1" || ip === "::1" || ip === "::ffff:127.0.0.1";
  const forwarded = req.get("x-forwarded-for") || req.get("tailscale-funnel-request");
  return isLoopback && !forwarded;
}

function restrictAdminToLocal(req, res, next) {
  if (process.env.ALLOW_ADMIN_OVER_FUNNEL === "true") return next();
  if (!isLocalAdminRequest(req)) {
    log("warn", "[admin] blocked non-local admin request", { ip: req.ip, path: req.path });
    return res.status(404).json({ error: "not found" }); // 404, not 403 — don't reveal the endpoint
  }
  next();
}

function generateBearer() {
  return randomBytes(32).toString("base64url");
}

/**
 * Mint a new tenant + bearer. Shared by the admin API (POST /v1/admin/tenants)
 * and the self-service provisioning endpoint (POST /v1/provision). Returns the
 * raw bearer ONCE — only the argon2id hash is persisted.
 */
export async function createTenant(displayName) {
  const tenants = await loadTenants();
  const tenantId = randomUUID();
  const bearer = generateBearer();
  const bearerHash = await argon2.hash(bearer, { type: argon2.argon2id });
  tenants[tenantId] = {
    displayName,
    bearerHash,
    expiringHashes: [],
    createdAt: new Date().toISOString(),
    lastUsedAt: null,
  };
  await saveTenants(tenants);
  return { tenantId, bearer, displayName };
}

/** Revoke (delete) a tenant by id. Returns false if it did not exist. */
export async function revokeTenant(tenantId) {
  const tenants = await loadTenants();
  if (!tenants[tenantId]) return false;
  delete tenants[tenantId];
  await saveTenants(tenants);
  return true;
}

export function mountAdminRoutes(app) {
  const router = express.Router();
  router.use(restrictAdminToLocal);
  router.use(express.json({ limit: "16kb" }));

  router.post("/tenants", adminAuth, async (req, res) => {
    const displayName = (req.body?.displayName || "").trim();
    if (!displayName) return res.status(400).json({ error: "displayName required" });
    const created = await createTenant(displayName);
    log("info", "[admin] minted tenant", { tenantId: created.tenantId, displayName });
    res.status(201).json(created);
  });

  router.get("/tenants", adminAuth, async (_req, res) => {
    const tenants = await loadTenants();
    const list = Object.entries(tenants).map(([id, r]) => ({
      tenantId: id,
      displayName: r.displayName,
      createdAt: r.createdAt,
      lastUsedAt: r.lastUsedAt,
      activeHashCount: activeHashes(r).length,
    }));
    res.json({ tenants: list });
  });

  router.delete("/tenants/:id", adminAuth, async (req, res) => {
    const ok = await revokeTenant(req.params.id);
    if (!ok) return res.status(404).json({ error: "tenant not found" });
    log("info", "[admin] revoked tenant", { tenantId: req.params.id });
    res.json({ revoked: req.params.id });
  });

  router.post("/tenants/:id/rotate", adminAuth, async (req, res) => {
    const tenants = await loadTenants();
    const record = tenants[req.params.id];
    if (!record) return res.status(404).json({ error: "tenant not found" });

    const newBearer = generateBearer();
    const newHash = await argon2.hash(newBearer, { type: argon2.argon2id });

    const expiresAt = Date.now() + ROTATE_GRACE_MS;
    const expiring = Array.isArray(record.expiringHashes) ? record.expiringHashes : [];
    if (record.bearerHash) {
      expiring.push({ hash: record.bearerHash, expiresAt });
    }

    record.bearerHash = newHash;
    record.expiringHashes = expiring.filter((e) => Date.now() <= e.expiresAt);
    record.rotatedAt = new Date().toISOString();
    await saveTenants(tenants);

    log("info", "[admin] rotated tenant", { tenantId: req.params.id, graceMs: ROTATE_GRACE_MS });
    res.json({
      tenantId: req.params.id,
      bearer: newBearer,
      oldBearerExpiresAt: new Date(expiresAt).toISOString(),
    });
  });

  app.use("/v1/admin", router);
}

/**
 * Gate for the self-service provisioning endpoint. Unlike /v1/admin (localhost
 * only, full power), /v1/provision is reachable over Funnel but guarded by a
 * shared secret (PROVISION_SECRET) known ONLY to a trusted backend — e.g. the
 * LeanZero website's server-side route, after it has authenticated its own user.
 * End users never see this secret or the admin token. Disabled until the secret
 * is set. Accepts the secret via X-Provision-Secret or Authorization: Bearer.
 */
function provisionAuth(req, res, next) {
  const expected = process.env.PROVISION_SECRET;
  if (!expected) return res.status(503).json({ error: "provisioning disabled (set PROVISION_SECRET)" });
  const presented = req.get("x-provision-secret")
    || (req.headers.authorization || "").replace(/^Bearer\s+/i, "").trim();
  if (presented !== expected) return res.status(401).json({ error: "unauthorized" });
  next();
}

const provisionRateLimiter = rateLimit({
  windowMs: 60_000,
  max: () => Number(process.env.PROVISION_RATE_LIMIT) || 10,
  keyGenerator: (req) => req.ip || "unknown",
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => res.status(429).json({ error: "rate_limit_exceeded" }),
});

export function mountProvisionRoutes(app) {
  const router = express.Router();
  router.use(express.json({ limit: "16kb" }));
  router.use(provisionAuth);
  router.use(provisionRateLimiter);

  // Mint a tenant bearer for one self-service user. `label` is a free-text tag
  // (e.g. the user's email) stored as the tenant displayName for the audit log.
  router.post("/", async (req, res) => {
    const label = String(req.body?.label || req.body?.displayName || "self-service")
      .trim().slice(0, 120) || "self-service";
    const created = await createTenant(label);
    log("info", "[provision] minted tenant", { tenantId: created.tenantId, label });
    res.status(201).json(created);
  });

  // Revoke a previously-provisioned tenant by id.
  router.delete("/:id", async (req, res) => {
    const ok = await revokeTenant(req.params.id);
    if (!ok) return res.status(404).json({ error: "tenant not found" });
    log("info", "[provision] revoked tenant", { tenantId: req.params.id });
    res.json({ revoked: req.params.id });
  });

  app.use("/v1/provision", router);
}
