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

export const requireBearer = async (req, res, next) => {
  const auth = req.headers.authorization;
  if (!auth || !/^Bearer\s+/i.test(auth)) {
    return res.status(401).json({ error: "unauthorized" });
  }
  const token = auth.replace(/^Bearer\s+/i, "").trim();
  if (!token) return res.status(401).json({ error: "unauthorized" });

  try {
    const tenants = await loadTenants();
    for (const [tenantId, record] of Object.entries(tenants)) {
      for (const h of activeHashes(record)) {
        try {
          if (await argon2.verify(h, token)) {
            req.tenant = { id: tenantId, displayName: record.displayName };
            return next();
          }
        } catch { /* malformed hash — skip */ }
      }
    }
  } catch (err) {
    log("error", "[auth] tenant load failed", { error: err.message });
    return res.status(500).json({ error: "internal error" });
  }

  return res.status(401).json({ error: "unauthorized" });
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

function generateBearer() {
  return randomBytes(32).toString("base64url");
}

export function mountAdminRoutes(app) {
  const router = express.Router();
  router.use(express.json({ limit: "16kb" }));

  router.post("/tenants", adminAuth, async (req, res) => {
    const displayName = (req.body?.displayName || "").trim();
    if (!displayName) return res.status(400).json({ error: "displayName required" });

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
    log("info", "[admin] minted tenant", { tenantId, displayName });
    res.status(201).json({ tenantId, bearer, displayName });
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
    const tenants = await loadTenants();
    if (!tenants[req.params.id]) return res.status(404).json({ error: "tenant not found" });
    delete tenants[req.params.id];
    await saveTenants(tenants);
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
