/**
 * Per-key workspace confinement for the HOSTED (HTTP) transport.
 *
 * Every hosted API key ("tenant") gets its own directory,
 *   <DATA_DIR or cwd>/workspaces/<tenantId>/
 * and every path a tool reads or writes on that key's behalf must resolve —
 * after symlink resolution — inside it. Tenant-scoped state (document
 * registry, drift watchlist, lineage, DNA, blueprints) is rooted there too
 * (getProjectRoot), so one key never sees or changes another key's entries.
 * URLs a hosted key hands us (read-doc url, uploadUrl, fact-check
 * webSearchUrl, sub-resources of a rendered PDF) must be https:// and must not
 * resolve to a loopback / private / link-local address.
 *
 * WHY: before 2026-10-10 a demo key could read or overwrite any file the
 * server process could reach (absolute paths, `..`), see every other key's
 * documents through list-documents / drift-monitor, and make the server call
 * loopback services. See the "Workspace confinement" section in README.md.
 *
 * The stdio transport never sets a workspace: a local agent runs the server
 * as its own user on its own machine, so stdio behaviour is unchanged.
 */
import fs from "node:fs";
import path from "node:path";
import net from "node:net";
import dns from "node:dns/promises";

import { requestContext } from "./request-context.js";

const HINT =
  "Hosted API keys can only use files inside their own workspace: pass a path relative to it " +
  '(e.g. "docs/report.docx") or a filePath returned by an earlier call.';

export class PathNotAllowedError extends Error {
  constructor(message) {
    super(message);
    this.name = "PathNotAllowedError";
    this.code = "PATH_NOT_ALLOWED";
  }
}

export class UrlNotAllowedError extends Error {
  constructor(message) {
    super(message);
    this.name = "UrlNotAllowedError";
    this.code = "URL_NOT_ALLOWED";
  }
}

/** Directory that holds one sub-directory per hosted key. */
export function getWorkspacesBase() {
  return path.join(process.env.DATA_DIR || process.cwd(), "workspaces");
}

/**
 * Create (if needed) and return the real path of a tenant's workspace.
 * @param {string} tenantId
 */
export function workspaceForTenant(tenantId) {
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(String(tenantId || ""))) {
    throw new Error("invalid tenant id for workspace");
  }
  const dir = path.join(getWorkspacesBase(), tenantId);
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  return fs.realpathSync(dir);
}

/** The calling key's workspace, or null for stdio / trusted local callers. */
export function getTenantWorkspace() {
  const ctx = requestContext.getStore && requestContext.getStore();
  return ctx && ctx.workspace ? ctx.workspace : null;
}

/** The calling key's tenant id, or null outside a hosted request. */
export function getTenantId() {
  const ctx = requestContext.getStore && requestContext.getStore();
  return ctx && ctx.tenantId ? ctx.tenantId : null;
}

/**
 * Root for per-project state (registry, DNA, blueprints): the calling key's
 * workspace when hosted, else the process cwd (stdio, unchanged).
 */
export function getProjectRoot() {
  return getTenantWorkspace() || process.cwd();
}

function isInside(root, p) {
  const rel = path.relative(root, p);
  return rel === "" || (rel !== ".." && !rel.startsWith(".." + path.sep) && !path.isAbsolute(rel));
}

/**
 * Real path of `abs`: the file itself when it exists, else the real path of its
 * deepest existing ancestor joined with the missing tail. A dangling symlink
 * throws (a write would follow it to wherever it points).
 */
function realpathDeepest(abs) {
  const tail = [];
  let cur = abs;
  for (;;) {
    try {
      fs.lstatSync(cur);
    } catch (err) {
      if (err.code !== "ENOENT" && err.code !== "ENOTDIR") throw err;
      const parent = path.dirname(cur);
      if (parent === cur) return abs;
      tail.unshift(path.basename(cur));
      cur = parent;
      continue;
    }
    return path.join(fs.realpathSync(cur), ...tail);
  }
}

/**
 * Confine a caller-supplied path to the calling key's workspace.
 *
 * Hosted: refuses `~`, `..` segments, file:// URLs, absolute paths outside the
 * workspace (including other keys' workspaces) and symlinks that resolve
 * outside it; relative paths resolve against the workspace. Returns the real
 * absolute path. Stdio (no workspace): returns the input unchanged.
 *
 * @param {string} input
 * @param {string} [label] - parameter name, for the error message
 * @returns {string}
 * @throws {PathNotAllowedError}
 */
export function confinePath(input, label = "filePath") {
  const ws = getTenantWorkspace();
  if (!ws) return input;

  if (typeof input !== "string" || !input.trim()) {
    throw new PathNotAllowedError(`${label} not allowed: it must be a non-empty path string. ${HINT}`);
  }
  const raw = input.trim();
  if (raw.includes("\0")) {
    throw new PathNotAllowedError(`${label} not allowed: it contains a NUL byte. ${HINT}`);
  }
  if (raw.startsWith("~")) {
    throw new PathNotAllowedError(`${label} not allowed: "${raw}" — home-directory (~) paths are not allowed. ${HINT}`);
  }
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(raw)) {
    throw new PathNotAllowedError(`${label} not allowed: "${raw}" — URLs (file:// etc.) are not file paths. ${HINT}`);
  }
  if (raw.split(/[\\/]+/).includes("..")) {
    throw new PathNotAllowedError(`${label} not allowed: "${raw}" — ".." segments are not allowed. ${HINT}`);
  }

  const abs = path.resolve(ws, raw);
  if (!isInside(ws, abs)) {
    throw new PathNotAllowedError(`${label} not allowed: "${raw}" is outside your workspace. ${HINT}`);
  }
  let real;
  try {
    real = realpathDeepest(abs);
  } catch {
    throw new PathNotAllowedError(`${label} not allowed: "${raw}" cannot be resolved (broken symbolic link?). ${HINT}`);
  }
  if (!isInside(ws, real)) {
    throw new PathNotAllowedError(`${label} not allowed: "${raw}" resolves through a symbolic link to a location outside your workspace. ${HINT}`);
  }
  return real;
}

/**
 * Whether a resolved path is inside the calling key's workspace (true for
 * stdio). Used for the tool-call audit log.
 */
export function isInsideWorkspace(p) {
  const ws = getTenantWorkspace();
  if (!ws) return true;
  try {
    return isInside(ws, realpathDeepest(path.resolve(ws, p)));
  } catch {
    return false;
  }
}

// Loopback, private, link-local, CGNAT (Tailscale's 100.64/10), multicast,
// reserved and NAT64 ranges. A hosted key must not be able to make this server
// call anything on the host or its networks. Node's BlockList checks an
// IPv4-mapped IPv6 address (::ffff:127.0.0.1) against the IPv4 rules itself —
// do NOT add ::ffff:0:0/96 here: BlockList then matches EVERY IPv4 address.
const BLOCKED = new net.BlockList();
for (const [subnet, prefix] of [
  ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8],
  ["169.254.0.0", 16], ["172.16.0.0", 12], ["192.0.0.0", 24], ["192.0.2.0", 24],
  ["192.168.0.0", 16], ["198.18.0.0", 15], ["198.51.100.0", 24], ["203.0.113.0", 24],
  ["224.0.0.0", 4], ["240.0.0.0", 4],
]) BLOCKED.addSubnet(subnet, prefix, "ipv4");
for (const [subnet, prefix] of [
  ["::", 128], ["::1", 128], ["64:ff9b::", 96], ["100::", 64],
  ["2001:db8::", 32], ["fc00::", 7], ["fe80::", 10], ["fec0::", 10], ["ff00::", 8],
]) BLOCKED.addSubnet(subnet, prefix, "ipv6");

export function isBlockedAddress(ip) {
  const family = net.isIP(ip);
  if (family === 4) return BLOCKED.check(ip, "ipv4");
  if (family === 6) return BLOCKED.check(ip, "ipv6");
  return true;
}

/**
 * Why a URL is not a public https endpoint, or null when it is.
 * @param {string} input
 * @returns {Promise<string|null>}
 */
async function publicHttpsProblem(input) {
  let u;
  try {
    u = new URL(String(input));
  } catch {
    return "not a valid URL";
  }
  if (u.protocol !== "https:") return `only https:// URLs are accepted (got "${u.protocol}")`;
  const host = u.hostname.replace(/^\[|\]$/g, "");
  if (/^localhost$/i.test(host) || /\.localhost$/i.test(host)) return `"${host}" is a loopback host`;
  let addresses;
  if (net.isIP(host)) {
    addresses = [host];
  } else {
    try {
      addresses = (await dns.lookup(host, { all: true, verbatim: true })).map((a) => a.address);
    } catch {
      return `host "${host}" does not resolve`;
    }
  }
  if (!addresses.length || addresses.some(isBlockedAddress)) {
    return `"${host}" is a private, loopback or link-local address`;
  }
  return null;
}

/**
 * Refuse a caller-supplied URL unless it is https:// and every address its
 * host resolves to is public. Hosted keys only; stdio callers keep the old
 * behaviour (the fetching tools themselves still require https).
 *
 * Residual risk (documented): DNS is resolved once here; a hostile DNS server
 * could answer differently for the actual fetch (rebinding). Every fetch site
 * refuses redirects, so a public URL cannot bounce inwards.
 *
 * @param {string} input
 * @param {string} [label] - parameter name, for the error message
 * @throws {UrlNotAllowedError}
 */
export async function assertPublicHttpsUrl(input, label = "url") {
  if (!getTenantWorkspace()) return;
  const problem = await publicHttpsProblem(input);
  if (problem) {
    throw new UrlNotAllowedError(`${label} not allowed: ${problem}. Hosted API keys may only call public https endpoints.`);
  }
}

/** Boolean form of the same check, applied regardless of transport. */
export async function isPublicHttpsUrl(input) {
  return (await publicHttpsProblem(input)) === null;
}
