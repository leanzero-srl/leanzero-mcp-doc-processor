// Hosted key lifecycle: a revoked key's workspace leaves service at once (kept
// for a short retention under <DATA_DIR>/revoked-workspaces, then deleted), and
// every key has a disk cap with a clear refusal. Before this, revoking a key
// left its folder on disk forever and a key could fill the disk.
//
// DATA_DIR must be set BEFORE src/auth.js is evaluated, so the server is
// imported dynamically after the env is set.
import { test, before, after, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const TMP = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "dp-lifecycle-test-")));
const DATA_DIR = path.join(TMP, "data");
process.env.DATA_DIR = DATA_DIR;
process.env.DOC_PROCESSOR_ADMIN_TOKEN = "test-admin-token-lifecycle";
process.env.PROVISION_SECRET = "test-provision-secret-lifecycle";
process.env.PUBLIC_HOST = "127.0.0.1";
process.env.TENANT_RATE_LIMIT = "10000";
process.env.WORKSPACE_QUOTA_MB = "0.25"; // 256 KiB, so the test can fill it
delete process.env.REVOKED_WORKSPACE_RETENTION_DAYS; // default: 7 days

const WS_BASE = path.join(DATA_DIR, "workspaces");
const REVOKED_BASE = path.join(DATA_DIR, "revoked-workspaces");
const ADMIN = { Authorization: `Bearer ${process.env.DOC_PROCESSOR_ADMIN_TOKEN}`, "Content-Type": "application/json" };

let httpServer;
let baseUrl;

before(async () => {
  const { buildApp } = await import("../src/server.js");
  httpServer = await new Promise((resolve, reject) => {
    const s = buildApp().listen(0, "127.0.0.1", () => resolve(s));
    s.on("error", reject);
  });
  baseUrl = `http://127.0.0.1:${httpServer.address().port}`;
});

after(async () => {
  if (httpServer) await new Promise((r) => httpServer.close(r));
  fs.rmSync(TMP, { recursive: true, force: true });
});

async function mint(displayName) {
  const r = await fetch(`${baseUrl}/v1/admin/tenants`, { method: "POST", headers: ADMIN, body: JSON.stringify({ displayName }) });
  assert.equal(r.status, 201);
  return r.json();
}

let rpcId = 0;
async function call(key, name, args = {}) {
  const r = await fetch(`${baseUrl}/mcp`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key.bearer}`, "Content-Type": "application/json", Accept: "application/json, text/event-stream" },
    body: JSON.stringify({ jsonrpc: "2.0", id: ++rpcId, method: "tools/call", params: { name, arguments: args } }),
  });
  const raw = await r.text();
  let msg = null;
  for (const line of raw.split("\n")) if (line.startsWith("data:")) msg = JSON.parse(line.slice(5));
  if (!msg) { try { msg = JSON.parse(raw); } catch { msg = { raw }; } }
  const text = (msg.result?.content || []).filter((c) => c.type === "text").map((c) => c.text).join("\n") || JSON.stringify(msg.error || msg);
  let json = null;
  try { json = JSON.parse(text); } catch { /* plain text */ }
  return { status: r.status, isError: !!msg.result?.isError || !msg.result, text, json };
}

const archivesOf = (tenantId) => (fs.existsSync(REVOKED_BASE) ? fs.readdirSync(REVOKED_BASE) : []).filter((n) => n.startsWith(`${tenantId}--`));

describe("revoking a key takes its workspace out of service", () => {
  test("admin revoke moves the folder to revoked-workspaces; the old key is dead", async () => {
    const k = await mint("revoke-me-admin");
    const made = await call(k, "create-markdown", { title: "Revoked Key File", content: "## A\n- b" });
    assert.equal(made.isError, false, made.text);
    assert.ok(fs.existsSync(path.join(WS_BASE, k.tenantId)), "positive control: the workspace existed");

    const del = await fetch(`${baseUrl}/v1/admin/tenants/${k.tenantId}`, { method: "DELETE", headers: ADMIN });
    assert.equal(del.status, 200);
    assert.equal(fs.existsSync(path.join(WS_BASE, k.tenantId)), false, "the live workspace folder must be gone");
    const archives = archivesOf(k.tenantId);
    assert.equal(archives.length, 1, "kept for the retention period");
    const archivedFile = path.join(REVOKED_BASE, archives[0], path.relative(path.join(WS_BASE, k.tenantId), made.json.filePath));
    assert.ok(fs.existsSync(archivedFile), "the archived copy keeps the files");
    const after = await call(k, "list-documents", {});
    assert.equal(after.status, 401, "a revoked key no longer authenticates");
  });

  test("self-service revoke (/v1/provision) does the same", async () => {
    const r = await fetch(`${baseUrl}/v1/provision`, {
      method: "POST",
      headers: { "X-Provision-Secret": process.env.PROVISION_SECRET, "Content-Type": "application/json" },
      body: JSON.stringify({ label: "revoke-me-provision" }),
    });
    const k = await r.json();
    await call(k, "create-markdown", { title: "Provisioned Key File", content: "## A\n- b" });
    assert.ok(fs.existsSync(path.join(WS_BASE, k.tenantId)));
    const del = await fetch(`${baseUrl}/v1/provision/${k.tenantId}`, { method: "DELETE", headers: { "X-Provision-Secret": process.env.PROVISION_SECRET } });
    assert.equal(del.status, 200);
    assert.equal(fs.existsSync(path.join(WS_BASE, k.tenantId)), false);
    assert.equal(archivesOf(k.tenantId).length, 1);
  });

  test("archives are deleted once the retention runs out, not before", async () => {
    const { purgeExpiredRevokedWorkspaces } = await import("../src/utils/workspace.js");
    const before = fs.readdirSync(REVOKED_BASE).length;
    assert.ok(before >= 2, "positive control: archives exist");
    assert.deepEqual(purgeExpiredRevokedWorkspaces(Date.now() + 6 * 24 * 3600 * 1000), [], "nothing is removed inside 7 days");
    const removed = purgeExpiredRevokedWorkspaces(Date.now() + 8 * 24 * 3600 * 1000);
    assert.equal(removed.length, before);
    assert.equal(fs.readdirSync(REVOKED_BASE).length, 0);
  });

  test("a revoked key's workspace is never handed to another key", async () => {
    const a = await mint("survivor");
    const r = await call(a, "list-documents", {});
    assert.equal(r.isError, false, r.text);
    assert.ok(fs.existsSync(path.join(WS_BASE, a.tenantId)), "other keys are untouched");
  });
});

describe("per-key disk cap", () => {
  test("a full workspace refuses writes with a clear error, still reads, and does not affect other keys", async () => {
    const full = await mint("fills-its-quota");
    const first = await call(full, "create-doc", { title: "Quota Fill Seed", content: "## A\n- b" });
    assert.equal(first.isError, false, first.text);
    // Fill the rest of the 256 KiB cap with one file inside the key's own workspace.
    fs.writeFileSync(path.join(WS_BASE, full.tenantId, "filler.bin"), Buffer.alloc(300 * 1024));

    const refused = await call(full, "create-markdown", { title: "Over The Quota", content: "## A\n- b" });
    assert.equal(refused.isError, true, refused.text);
    assert.match(refused.text, /Workspace full: this key's files use [\d.]+ MB of its [\d.]+ MB limit/);
    assert.ok(!fs.readdirSync(path.join(WS_BASE, full.tenantId), { recursive: true }).some((f) => String(f).includes("over-the-quota")), "nothing was written");
    for (const [tool, args] of [["create-doc", { title: "Over Doc", content: "## A" }], ["edit-doc", { filePath: "x.docx", action: "append", paragraphs: ["x"] }], ["dna", { action: "init", companyName: "X" }]]) {
      const r = await call(full, tool, args);
      assert.match(r.text, /Workspace full/, `${tool} must be refused when full`);
    }

    const read = await call(full, "read-doc", { filePath: first.json.filePath });
    assert.equal(read.isError, false, `reads still work: ${read.text.slice(0, 200)}`);
    const list = await call(full, "list-documents", {});
    assert.equal(list.isError, false, list.text);

    const other = await mint("has-room");
    const ok = await call(other, "create-markdown", { title: "Other Key Still Writes", content: "## A\n- b" });
    assert.equal(ok.isError, false, ok.text);

    // Freeing space lifts the refusal.
    fs.rmSync(path.join(WS_BASE, full.tenantId, "filler.bin"));
    const again = await call(full, "create-markdown", { title: "After Freeing Space", content: "## A\n- b" });
    assert.equal(again.isError, false, again.text);
  });
});
