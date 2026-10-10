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
import dns from "node:dns";
import tls from "node:tls";
import https from "node:https";
import { execFileSync } from "node:child_process";

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

// A CONFIRMED upload delivery (uploadUrl + uploadAuthHeader, receiver answered
// 2xx) leaves no server copy: the receiver holds the file. CogniRunner's key
// delivers every document it generates to a Jira issue this way and reads
// attachments back from Jira through its own web trigger, never from here — so
// before this, every delivery stayed in its workspace until WORKSPACE_QUOTA_MB
// refused the next one.
//
// The stand-in receiver: `upload-receiver.test` resolves to a public address
// (so the hosted URL checks pass, as for a real receiver) and the TLS connect
// to it is redirected to a local HTTPS server with a throwaway certificate.
describe("a confirmed upload delivery keeps no server copy", () => {
  const HOST = "upload-receiver.test";
  const received = [];
  let receiverStatus = 200;
  let receiver;
  let receiverPort;
  let closeBrowser;
  const realLookup = dns.lookup;
  const realPromisesLookup = dns.promises.lookup;
  const realTlsConnect = tls.connect;

  before(async () => {
    const certDir = path.join(TMP, "receiver-cert");
    fs.mkdirSync(certDir);
    execFileSync("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-days", "1", "-subj", `/CN=${HOST}`,
      "-keyout", path.join(certDir, "key.pem"), "-out", path.join(certDir, "cert.pem")], { stdio: "ignore" });
    receiver = https.createServer({ key: fs.readFileSync(path.join(certDir, "key.pem")), cert: fs.readFileSync(path.join(certDir, "cert.pem")) }, (req, res) => {
      let body = "";
      req.on("data", (c) => { body += c; });
      req.on("end", () => {
        if (req.method !== "POST" || !req.url.startsWith("/up")) { res.writeHead(404); res.end("not found"); return; }
        const env = JSON.parse(body);
        received.push({ ...env, auth: req.headers.authorization, bytes: Buffer.from(env.data, "base64") });
        if (receiverStatus !== 200) { res.writeHead(receiverStatus); res.end("token consumed"); return; }
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: true, attachment: { id: String(10000 + received.length), filename: env.filename, content: `https://jira.example/attachment/${10000 + received.length}` } }));
      });
    });
    await new Promise((r) => receiver.listen(0, "127.0.0.1", r));
    receiverPort = receiver.address().port;
    dns.lookup = function lookup(host, options, cb) {
      if (typeof options === "function") { cb = options; options = {}; }
      if (host !== HOST) return realLookup.call(dns, host, options, cb);
      return options && options.all ? cb(null, [{ address: "93.184.215.14", family: 4 }]) : cb(null, "93.184.215.14", 4);
    };
    dns.promises.lookup = async function lookup(host, options = {}) {
      if (host !== HOST) return realPromisesLookup.call(dns.promises, host, options);
      return options.all ? [{ address: "93.184.215.14", family: 4 }] : { address: "93.184.215.14", family: 4 };
    };
    tls.connect = function connect(...args) {
      const o = args[0];
      if (o && typeof o === "object" && (o.servername === HOST || o.host === HOST)) {
        args[0] = { ...o, host: "127.0.0.1", port: receiverPort, lookup: undefined, rejectUnauthorized: false };
      }
      return realTlsConnect.apply(this, args);
    };
    ({ closeBrowser } = await import("../src/services/pdf-renderer.js"));
  });

  after(async () => {
    dns.lookup = realLookup;
    dns.promises.lookup = realPromisesLookup;
    tls.connect = realTlsConnect;
    if (closeBrowser) await closeBrowser();
    if (receiver) await new Promise((r) => receiver.close(r));
  });

  const upload = { uploadUrl: `https://${HOST}/up?t=one-shot`, uploadAuthHeader: "Bearer one-shot-bearer", clientHint: "interactive" };
  const titles = (list) => (Array.isArray(list.json) ? list.json : []).map((d) => d.title);

  test("every create-* tool: the receiver gets the file; the server copy, its registry entry and its download link are gone", async () => {
    receiverStatus = 200;
    const k = await mint("delivers-everything");
    const cases = [
      ["create-doc", { title: "Delivered Word Brief", content: "## Problem\n- one\n\n## Impact\n- two" }, /wordprocessingml/],
      ["create-markdown", { title: "Delivered Markdown Notes", content: "## A\n- b" }, /markdown/],
      ["create-excel", { sheets: [{ name: "Delivered Totals", data: [["Month", "Units"], ["Apr", 120]] }] }, /spreadsheetml/],
      ["create-pptx", { title: "Delivered Slide Deck", content: "## First\n- a\n\n## Second\n- b" }, /presentationml/],
      ["create-pdf", { title: "Delivered Pdf Letter", content: "## Dear team\n- one" }, /pdf/],
    ];
    for (const [tool, args, mime] of cases) {
      const before = received.length;
      const r = await call(k, tool, { ...args, ...upload });
      assert.equal(r.isError, false, `${tool}: ${r.text.slice(0, 300)}`);
      assert.equal(received.length, before + 1, `${tool}: the receiver got the file`);
      const got = received[received.length - 1];
      assert.match(got.mimeType, mime, tool);
      assert.ok(got.bytes.length > 0 && got.bytes.length === got.size, `${tool}: the whole file was delivered`);
      assert.equal(got.auth, "Bearer one-shot-bearer");
      assert.equal(r.json.uploaded, true, `${tool}: upload confirmed`);
      assert.ok(r.json.filePath.startsWith(path.join(WS_BASE, k.tenantId) + path.sep), `${tool}: positive control, it was written inside the key's workspace`);
      assert.equal(fs.existsSync(r.json.filePath), false, `${tool}: the server copy must be removed after a confirmed upload`);
      assert.equal(r.json.serverCopyRemoved, true, `${tool}: the response says so`);
      assert.equal(r.json.downloadUrl, undefined, `${tool}: no download link to a removed file`);
      assert.doesNotMatch(r.json.message, /Download it/, `${tool}: the message offers no download`);
    }
    const list = await call(k, "list-documents", {});
    assert.equal(list.isError, false, list.text);
    assert.deepEqual(titles(list), [], "no registry entry is left for a delivered document");
  });

  test("the fact-check report delivered by upload keeps no server copy either", async () => {
    receiverStatus = 200;
    const k = await mint("fact-check-delivery");
    const before = received.length;
    const r = await call(k, "fact-check", {
      claims: ["Water boils at 100 degrees Celsius at sea level"], webSearchBearer: "x", serperKey: "x",
      webSearchUrl: `https://${HOST}/mcp`, generateReport: true, reportTitle: "Delivered Fact Check Report", ...upload,
    });
    assert.equal(r.isError, false, r.text.slice(0, 300));
    assert.equal(received.length, before + 1, "the receiver got the report");
    assert.match(received[received.length - 1].mimeType, /pdf/);
    assert.ok(r.json.report?.filePath, `positive control: a report was written: ${r.text.slice(0, 300)}`);
    assert.equal(fs.existsSync(r.json.report.filePath), false, "the report's server copy must be removed");
    assert.equal(r.json.report.uploaded, true);
    assert.equal(r.json.report.serverCopyRemoved, true);
    assert.equal(r.json.report.downloadUrl, null);
  });

  test("a FAILED delivery keeps the server copy, its registry entry and its download link", async () => {
    receiverStatus = 404;
    const k = await mint("delivery-fails");
    const r = await call(k, "create-doc", { title: "Undelivered Word Brief", content: "## A\n- b", ...upload });
    assert.equal(r.isError, false, r.text);
    assert.equal(r.json.uploaded, false);
    assert.match(r.json.uploadError, /HTTP 404/);
    assert.ok(fs.existsSync(r.json.filePath), "the copy is kept when the receiver did not take it");
    assert.ok(r.json.downloadUrl, "and stays downloadable");
    assert.equal(r.json.serverCopyRemoved, undefined);
    assert.deepEqual(titles(await call(k, "list-documents", {})), ["Undelivered Word Brief"]);
    receiverStatus = 200;
  });

  test("control: a create without an upload keeps its file, entry and link", async () => {
    const k = await mint("no-delivery");
    const r = await call(k, "create-doc", { title: "Kept Word Brief", content: "## A\n- b" });
    assert.equal(r.isError, false, r.text);
    assert.ok(fs.existsSync(r.json.filePath));
    assert.ok(r.json.downloadUrl);
    assert.deepEqual(titles(await call(k, "list-documents", {})), ["Kept Word Brief"]);
  });

  test("CogniRunner's pattern: more deliveries than the cap could hold never fill the workspace", async () => {
    receiverStatus = 200;
    const k = await mint("cognirunner-like");
    const cap = 0.25 * 1024 * 1024;
    let delivered = 0;
    for (let i = 0; i < 40; i++) {
      const r = await call(k, "create-doc", { title: "Docproc Bridge Live Brief", content: `## Problem\n- run ${i}\n\n## Impact\n- ${"x".repeat(200)}`, ...upload });
      assert.doesNotMatch(r.text, /Workspace full/, `delivery ${i + 1} was refused: the server copies filled the ${cap} byte cap`);
      assert.equal(r.json?.uploaded, true, r.text.slice(0, 300));
      delivered += received[received.length - 1].size;
    }
    assert.ok(delivered > cap, `positive control: the deliveries (${delivered} bytes) are more than the cap (${cap})`);
    const { directorySizeBytes } = await import("../src/utils/workspace.js");
    const left = directorySizeBytes(path.join(WS_BASE, k.tenantId));
    assert.ok(left < 16 * 1024, `the workspace holds only bookkeeping after 40 deliveries (${left} bytes)`);
  });
});
