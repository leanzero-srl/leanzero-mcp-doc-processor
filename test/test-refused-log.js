// Refused-request audit log: every 401/403/404/405/429 from the real app lands
// in <DATA_DIR>/logs/refused.jsonl with sane fields and NO secrets (bearer,
// query string, body). Env is set BEFORE the dynamic import (see test gotcha
// in auth.js/server.js: DATA_DIR / PUBLIC_HOST are read into top-level consts).
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, before, after } from "node:test";
import assert from "node:assert/strict";

const TMP = mkdtempSync(join(tmpdir(), "dp-refused-test-"));
process.env.DATA_DIR = TMP;
process.env.PUBLIC_HOST = "127.0.0.1";
delete process.env.INSIGHTS_LOG;
delete process.env.REFUSED_LOG;

const { buildApp } = await import("../src/server.js");
const { flushRefused, appendRefused } = await import("../src/utils/refused-log.js");

const SECRET_BEARER = "dp-super-secret-bearer-value-123";
const SECRET_QUERY = "zai-secret-in-query-456";
const logFile = join(TMP, "logs", "refused.jsonl");
const readLines = () => readFileSync(logFile, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));

let httpServer;
let baseUrl;

before(async () => {
  const app = buildApp();
  httpServer = await new Promise((resolve, reject) => {
    const s = app.listen(0, "127.0.0.1", () => resolve(s));
    s.on("error", reject);
  });
  baseUrl = `http://127.0.0.1:${httpServer.address().port}`;
});

after(async () => {
  if (httpServer) await new Promise((r) => httpServer.close(r));
  delete process.env.REFUSED_LOG_MAX_BYTES;
  rmSync(TMP, { recursive: true, force: true });
});

test("logs 401 and 404 with sane fields and never the bearer, query or body", async () => {
  assert.equal((await fetch(`${baseUrl}/healthz`)).status, 200);
  const r401 = await fetch(`${baseUrl}/mcp?zai_key=${SECRET_QUERY}`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${SECRET_BEARER}`,
      "Content-Type": "application/json",
      "User-Agent": "scanner/1.0",
      "X-Forwarded-For": "203.0.113.9, 100.64.0.1",
      "Tailscale-Funnel-Request": "?1",
    },
    body: JSON.stringify({ jsonrpc: "2.0", method: "tools/list", id: 1, params: { k: SECRET_BEARER } }),
  });
  assert.equal(r401.status, 401);
  assert.equal((await fetch(`${baseUrl}/.env`)).status, 404);
  await flushRefused();

  const raw = readFileSync(logFile, "utf8");
  assert.ok(!raw.includes(SECRET_BEARER), "bearer leaked");
  assert.ok(!raw.includes(SECRET_QUERY), "query string leaked");
  assert.ok(!raw.includes("zai_key"), "query key leaked");

  const lines = readLines();
  assert.equal(lines.length, 2, "healthz 200 must not be logged");
  const [a, b] = lines;
  assert.equal(a.server, "doc-processor");
  assert.equal(a.status, 401);
  assert.equal(a.method, "POST");
  assert.equal(a.path, "/mcp");
  assert.equal(a.ua, "scanner/1.0");
  assert.equal(a.xff, "203.0.113.9");
  assert.equal(a.xff_last, "100.64.0.1");
  assert.equal(a.auth, true);
  assert.equal(a["tailscale-funnel-request"], "?1");
  assert.ok(a.hn.includes("authorization"));
  assert.equal(typeof a.ts, "string");
  assert.equal(b.status, 404);
  assert.equal(b.path, "/.env");
  assert.equal(b.auth, false);
});

test("caps path length and rotates past the size cap (one generation)", async () => {
  assert.equal((await fetch(`${baseUrl}/${"a".repeat(500)}`)).status, 404);
  await flushRefused();
  assert.equal(readLines().pop().path.length, 200);

  process.env.REFUSED_LOG_MAX_BYTES = "10";
  appendRefused({ ts: "x", note: "after-rotate" });
  await flushRefused();
  assert.ok(readFileSync(logFile + ".1", "utf8").includes('"/.env"'));
  const fresh = readLines();
  assert.equal(fresh.length, 1);
  assert.equal(fresh[0].note, "after-rotate");
});
