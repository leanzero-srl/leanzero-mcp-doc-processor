/**
 * Signed, time-limited download links for files created on a HOSTED server.
 *
 * The proper way a remote MCP delivers a generated file to the caller's machine:
 * the server keeps the bytes and returns a short-lived signed URL. A human in a
 * chat UI clicks it; an agent GETs it. No client filesystem access required.
 *
 * Stateless HMAC tokens (no server store): token = base64url(JSON{p,exp}).sig,
 * where sig = HMAC-SHA256(secret, payload). We only ever sign files we created,
 * and verification re-checks the signature, the expiry, and that the resolved
 * path is under an allowed base — so a token can't be forged or point elsewhere.
 *
 * Only active when a public base URL is known (FILE_DOWNLOAD_BASE or PUBLIC_HOST,
 * i.e. the hosted HTTP server). On stdio/self-host it returns null — files are
 * already on the caller's machine, so no link is needed.
 */
import crypto from "crypto";
import path from "path";
import fs from "fs";

const TTL_MS = Number(process.env.FILE_DOWNLOAD_TTL_MS || 24 * 3600 * 1000);

let _ephemeralSecret;
function secret() {
  return (
    process.env.FILE_TOKEN_SECRET ||
    process.env.PROVISION_SECRET ||
    process.env.DOC_PROCESSOR_ADMIN_TOKEN ||
    (_ephemeralSecret ||= crypto.randomBytes(32).toString("hex"))
  );
}

function downloadBase() {
  if (process.env.FILE_DOWNLOAD_BASE) return process.env.FILE_DOWNLOAD_BASE.replace(/\/+$/, "");
  if (process.env.PUBLIC_HOST) return `https://${process.env.PUBLIC_HOST}`;
  return null;
}

// Files may only be served from under these roots (defense in depth).
function allowedBases() {
  const bases = [process.cwd()];
  if (process.env.DATA_DIR) bases.push(process.env.DATA_DIR);
  if (process.env.CLIENT_OUTPUT_BASE) bases.push(process.env.CLIENT_OUTPUT_BASE);
  if (process.env.DOC_OUTPUT_DIR) bases.push(process.env.DOC_OUTPUT_DIR);
  return bases.map((b) => path.resolve(b));
}

function sign(b64) {
  return crypto.createHmac("sha256", secret()).update(b64).digest("base64url");
}

/**
 * Build a signed download URL for a just-written file.
 * @param {string} filePath
 * @returns {string|null} URL, or null when no public base is configured (stdio).
 */
export function buildDownloadUrl(filePath) {
  const base = downloadBase();
  if (!base || !filePath) return null;
  const payload = { p: path.resolve(filePath), exp: Date.now() + TTL_MS };
  const b64 = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const token = `${b64}.${sign(b64)}`;
  return `${base}/files/download?token=${encodeURIComponent(token)}`;
}

/**
 * Verify a download token and return the file path to serve, or null.
 * @param {string} token
 * @returns {{path:string}|null}
 */
export function verifyDownloadToken(token) {
  if (!token || typeof token !== "string") return null;
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return null;
  const b64 = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = sign(b64);
  const sigBuf = Buffer.from(sig);
  const expBuf = Buffer.from(expected);
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) return null;
  let payload;
  try { payload = JSON.parse(Buffer.from(b64, "base64url").toString()); } catch { return null; }
  if (!payload.p || !payload.exp || Date.now() > payload.exp) return null;
  const resolved = path.resolve(payload.p);
  if (!allowedBases().some((b) => resolved.startsWith(b))) return null;
  if (!fs.existsSync(resolved)) return null;
  return { path: resolved };
}
