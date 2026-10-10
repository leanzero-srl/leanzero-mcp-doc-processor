// Workspace confinement for hosted (HTTP) API keys — the 2026-10-10 fix.
//
// Every hosted key must stay inside its own workspace: no reads or writes
// outside it (absolute paths, "..", "~", symlinks, other keys' workspaces), no
// fetches of loopback/private URLs, and no view of another key's documents,
// drift watchlist, lineage, DNA or blueprints. Each block below fails against
// the pre-fix server (verified: 14 of 18 probe checks succeeded before).
//
// DATA_DIR must be set BEFORE src/auth.js is evaluated (it reads it into a
// top-level const), so the server is imported dynamically after the env is set.
import { test, before, after, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";

import { makeTextPdf } from "./fixtures/make-pdf.js";

const TMP = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "dp-confine-test-")));
const DATA_DIR = path.join(TMP, "data");
const OUTSIDE = path.join(TMP, "outside");
fs.mkdirSync(OUTSIDE, { recursive: true });
process.env.DATA_DIR = DATA_DIR;
process.env.DOC_PROCESSOR_ADMIN_TOKEN = "test-admin-token-confine";
process.env.PUBLIC_HOST = "127.0.0.1";
process.env.TENANT_RATE_LIMIT = "10000";

const SECRET = "OUTSIDE-SECRET-5150";
const OUTSIDE_PDF = path.join(OUTSIDE, "outside.pdf");
fs.writeFileSync(OUTSIDE_PDF, makeTextPdf([SECRET, "This file lives outside every workspace and must never be readable by a hosted key."]));

// Capture log lines (the logger writes every line through console.error).
const logLines = [];
const origConsoleError = console.error;
console.error = (...args) => { logLines.push(args.map(String).join(" ")); };

let httpServer;
let baseUrl;
let A; // { tenantId, bearer }
let B;
let wsA;
let wsB;
let closeBrowser;

// Loopback canary: any hit means the server fetched an internal URL for a key.
const canaryHits = [];
const canary = http.createServer((req, res) => { canaryHits.push(`${req.method} ${req.url}`); res.writeHead(200, { "Content-Type": "text/html" }); res.end("<p>CANARY-BODY</p>"); });
let canaryPort;

before(async () => {
  const { buildApp } = await import("../src/server.js");
  ({ closeBrowser } = await import("../src/services/pdf-renderer.js"));
  const app = buildApp();
  httpServer = await new Promise((resolve, reject) => {
    const s = app.listen(0, "127.0.0.1", () => resolve(s));
    s.on("error", reject);
  });
  baseUrl = `http://127.0.0.1:${httpServer.address().port}`;
  await new Promise((r) => canary.listen(0, "127.0.0.1", r));
  canaryPort = canary.address().port;

  A = await mint("tenant-A");
  B = await mint("tenant-B");
  wsA = path.join(DATA_DIR, "workspaces", A.tenantId);
  wsB = path.join(DATA_DIR, "workspaces", B.tenantId);
});

after(async () => {
  console.error = origConsoleError;
  if (closeBrowser) await closeBrowser();
  if (httpServer) await new Promise((r) => httpServer.close(r));
  await new Promise((r) => canary.close(r));
  fs.rmSync(TMP, { recursive: true, force: true });
});

async function mint(displayName) {
  const r = await fetch(`${baseUrl}/v1/admin/tenants`, {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.DOC_PROCESSOR_ADMIN_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ displayName }),
  });
  assert.equal(r.status, 201);
  return r.json();
}

let rpcId = 0;
async function call(key, name, args = {}, headers = {}) {
  const r = await fetch(`${baseUrl}/mcp`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key.bearer}`,
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      ...headers,
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: ++rpcId, method: "tools/call", params: { name, arguments: args } }),
  });
  const raw = await r.text();
  let msg = null;
  for (const line of raw.split("\n")) if (line.startsWith("data:")) msg = JSON.parse(line.slice(5));
  if (!msg) { try { msg = JSON.parse(raw); } catch { msg = { raw }; } }
  const text = (msg.result?.content || []).filter((c) => c.type === "text").map((c) => c.text).join("\n")
    || JSON.stringify(msg.error || msg);
  let json = null;
  try { json = JSON.parse(text); } catch { /* plain-text tool output */ }
  return { status: r.status, isError: !!msg.result?.isError || !msg.result, text, json };
}

function assertRefused(res, what) {
  assert.equal(res.isError, true, `${what}: expected a refusal, got ${res.text.slice(0, 200)}`);
  assert.match(res.text, /not allowed/i, `${what}: refusal should say "not allowed": ${res.text.slice(0, 200)}`);
  assert.ok(!res.text.includes(SECRET), `${what}: leaked outside content`);
}

describe("path confinement — reads", () => {
  test("absolute path outside the workspace is refused", async () => {
    assertRefused(await call(A, "read-doc", { filePath: OUTSIDE_PDF, mode: "indepth" }), "absolute read");
  });

  test("absolute outside path is refused even with a url decoy", async () => {
    assertRefused(await call(A, "read-doc", { filePath: OUTSIDE_PDF, url: "https://example.invalid/x", authHeader: "x", mode: "indepth" }), "url decoy");
  });

  test(".. traversal is refused", async () => {
    assertRefused(await call(A, "read-doc", { filePath: `../../../../../../../../..${OUTSIDE_PDF}`, mode: "indepth" }), "../ read");
    assertRefused(await call(A, "read-doc", { filePath: "docs/../../outside.pdf" }), "inner ..");
  });

  test("~ (home directory) paths are refused", async () => {
    assertRefused(await call(A, "read-doc", { filePath: "~/.ssh/id_ed25519" }), "~ read");
  });

  test("a symlink inside the workspace that points outside is refused", async () => {
    fs.mkdirSync(wsA, { recursive: true });
    fs.symlinkSync(OUTSIDE_PDF, path.join(wsA, "link.pdf"));
    fs.symlinkSync(OUTSIDE, path.join(wsA, "linkdir"));
    assertRefused(await call(A, "read-doc", { filePath: "link.pdf", mode: "indepth" }), "file symlink");
    assertRefused(await call(A, "read-doc", { filePath: "linkdir/outside.pdf", mode: "indepth" }), "dir symlink");
  });

  test("every other path-taking tool refuses an outside filePath", async () => {
    const cases = [
      ["blueprint", { action: "learn", filePath: OUTSIDE_PDF, name: "bp-outside" }],
      ["drift-monitor", { action: "watch", filePath: OUTSIDE_PDF, name: "outside" }],
      ["drift-monitor", { action: "check", filePath: OUTSIDE_PDF }],
      ["get-lineage", { filePath: OUTSIDE_PDF }],
      ["fact-check", { filePath: OUTSIDE_PDF, webSearchBearer: "x", serperKey: "x" }],
      ["edit-excel", { filePath: path.join(OUTSIDE, "x.xlsx"), action: "preview" }],
      ["get-doc-indepth", { filePath: OUTSIDE_PDF }], // legacy alias
    ];
    for (const [tool, args] of cases) assertRefused(await call(A, tool, args), tool);
  });
});

describe("path confinement — writes", () => {
  test("absolute outputPath outside the workspace is refused and nothing is written", async () => {
    const target = path.join(OUTSIDE, "written-abs.md");
    assertRefused(await call(A, "create-markdown", { title: "Absolute Write Check", content: "## A\n- b", outputPath: target }), "abs write");
    assert.equal(fs.existsSync(target), false);
  });

  test(".. outputPath is refused and nothing is written", async () => {
    const target = path.join(OUTSIDE, "written-rel.docx");
    assertRefused(await call(A, "create-doc", { title: "Relative Write Check", content: "## A\n- b", outputPath: `../../../../../../../../..${target}` }), "../ write");
    assert.equal(fs.existsSync(target), false);
  });

  test("a dangling symlink cannot redirect a write outside", async () => {
    const target = path.join(OUTSIDE, "via-dangling-link.md");
    fs.mkdirSync(path.join(wsA, "docs"), { recursive: true });
    fs.symlinkSync(target, path.join(wsA, "docs", "dangling.md"));
    assertRefused(await call(A, "create-markdown", { title: "Dangling Link Check", content: "## A\n- b", outputPath: "docs/dangling.md", preventDuplicates: false }), "dangling link");
    assert.equal(fs.existsSync(target), false);
  });

  test("edit-doc cannot modify a docx outside the workspace", async () => {
    const created = await call(A, "create-doc", { title: "Edit Target Source Doc", content: "## Intro\n- one" });
    assert.equal(created.isError, false, created.text);
    const victim = path.join(OUTSIDE, "victim.docx");
    fs.copyFileSync(created.json.filePath, victim);
    const before = fs.readFileSync(victim);
    assertRefused(await call(A, "edit-doc", { filePath: victim, action: "append", paragraphs: ["appended"] }), "edit-doc outside");
    assert.deepEqual(fs.readFileSync(victim), before);
  });

  test("edit-pptx cannot write its outputPath outside the workspace", async () => {
    const deck = await call(A, "create-pptx", { title: "Deck For Edit Check", content: "## S1\n- x" });
    assert.equal(deck.isError, false, deck.text);
    const target = path.join(OUTSIDE, "edited.pptx");
    assertRefused(await call(A, "edit-pptx", { filePath: deck.json.filePath, action: "append-slides", content: "## S2\n- y", outputPath: target }), "edit-pptx outputPath");
    assert.equal(fs.existsSync(target), false);
  });

  test("X-Output-Dir cannot climb out; a plain sub-folder lands inside the workspace", async () => {
    const bad = await call(A, "create-markdown", { title: "Output Dir Escape Check", content: "## A\n- b" }, { "X-Output-Dir": "../../outside" });
    assert.equal(bad.status, 400);
    assert.match(bad.text, /X-Output-Dir not allowed/);
    const good = await call(A, "create-markdown", { title: "Output Dir Subfolder Check", content: "## A\n- b" }, { "X-Output-Dir": "reports" });
    assert.equal(good.isError, false, good.text);
    assert.ok(good.json.filePath.startsWith(path.join(wsA, "reports") + path.sep), good.json.filePath);
  });
});

describe("cross-key isolation", () => {
  test("key B cannot open key A's file by its absolute path", async () => {
    const mk = await call(A, "create-markdown", { title: "Private Note Of A", content: "## Secret plans\n- A only" });
    assert.equal(mk.isError, false, mk.text);
    assert.ok(mk.json.filePath.startsWith(wsA + path.sep));
    assertRefused(await call(B, "read-doc", { filePath: mk.json.filePath }), "B reads A");
    assertRefused(await call(B, "drift-monitor", { action: "watch", filePath: mk.json.filePath }), "B watches A");
  });

  test("list-documents returns only the caller's own documents", async () => {
    await call(A, "create-markdown", { title: "Registry Entry Owned By A", content: "## A\n- a" });
    await call(B, "create-markdown", { title: "Registry Entry Owned By B", content: "## B\n- b" });
    const listA = await call(A, "list-documents", {});
    const listB = await call(B, "list-documents", {});
    const titles = (r) => r.json.map((d) => d.title);
    assert.ok(titles(listA).includes("Registry Entry Owned By A"), "positive control: A sees its own doc");
    assert.ok(!titles(listA).includes("Registry Entry Owned By B"));
    assert.ok(titles(listB).includes("Registry Entry Owned By B"), "positive control: B sees its own doc");
    assert.ok(!titles(listB).includes("Registry Entry Owned By A"));
    for (const d of listB.json) assert.ok(!d.filePath.startsWith(wsA), "B's listing must not carry A's paths");
  });

  test("drift-monitor check without a path covers only the caller's watchlist", async () => {
    const doc = await call(A, "create-doc", { title: "Drift Watched By A", content: "## Section\n- item" });
    const watched = await call(A, "drift-monitor", { action: "watch", filePath: doc.json.filePath, name: "a-watch" });
    assert.equal(watched.isError, false, watched.text);
    const checkA = await call(A, "drift-monitor", { action: "check" });
    assert.ok(checkA.text.includes(doc.json.filePath), "positive control: A's check covers its watch");
    const checkB = await call(B, "drift-monitor", { action: "check" });
    assert.ok(!checkB.text.includes(doc.json.filePath), `B's check must not show A's watchlist: ${checkB.text.slice(0, 300)}`);
  });

  test("lineage never records another key's reads", async () => {
    const src = await call(A, "create-doc", { title: "Lineage Source Of A", content: "## Facts\n- one" });
    const read = await call(A, "read-doc", { filePath: src.json.filePath });
    assert.equal(read.isError, false, read.text);
    const derived = await call(B, "create-markdown", { title: "Derived By B", content: "## B\n- b" });
    const lineage = await call(B, "get-lineage", { filePath: derived.json.filePath });
    assert.equal(lineage.isError, false, lineage.text);
    assert.ok(!lineage.text.includes(src.json.filePath), `B's lineage must not reference A's files: ${lineage.text.slice(0, 300)}`);
  });

  test("DNA and learned blueprints are per key", async () => {
    const init = await call(A, "dna", { action: "init", companyName: "Tenant A Corp" });
    assert.equal(init.isError, false, init.text);
    assert.ok(fs.existsSync(path.join(wsA, ".document-dna.json")), "A's DNA lives in A's workspace");
    const dnaB = await call(B, "dna", { action: "get" });
    assert.ok(!dnaB.text.includes("Tenant A Corp"), `B must not see A's DNA: ${dnaB.text.slice(0, 200)}`);

    const docx = await call(A, "create-doc", { title: "Blueprint Source Of A", content: "## Scope\n- s\n\n## Plan\n- p" });
    const learned = await call(A, "blueprint", { action: "learn", filePath: docx.json.filePath, name: "bp-tenant-a" });
    assert.equal(learned.isError, false, learned.text);
    const tplA = await call(A, "list-templates", {});
    const tplB = await call(B, "list-templates", {});
    assert.ok(tplA.text.includes("bp-tenant-a"), "positive control: A lists its blueprint");
    assert.ok(!tplB.text.includes("bp-tenant-a"), "B must not list A's blueprint");
  });
});

describe("URL confinement (SSRF)", () => {
  test("read-doc refuses loopback, private and file:// URLs", async () => {
    for (const url of [`https://127.0.0.1:${canaryPort}/x`, "https://localhost/x", "https://[::1]/x", "https://10.0.0.1/x", "https://169.254.169.254/latest", "file:///etc/passwd", `http://127.0.0.1:${canaryPort}/x`]) {
      assertRefused(await call(A, "read-doc", { url, authHeader: "Bearer x" }), url);
    }
  });

  test("fact-check refuses a loopback webSearchUrl and never contacts it", async () => {
    canaryHits.length = 0;
    for (const webSearchUrl of [`http://127.0.0.1:${canaryPort}/mcp`, `https://localhost:${canaryPort}/mcp`, "file:///etc/passwd"]) {
      assertRefused(await call(A, "fact-check", { claims: ["The sky is blue"], webSearchBearer: "x", serperKey: "x", webSearchUrl }), webSearchUrl);
    }
    assert.equal(canaryHits.length, 0, `canary was contacted: ${canaryHits.join(", ")}`);
  });

  test("create-* refuses a loopback uploadUrl before writing or sending", async () => {
    const r = await call(A, "create-markdown", { title: "Upload Ssrf Check", content: "## A\n- b", uploadUrl: `https://127.0.0.1:${canaryPort}/up`, uploadAuthHeader: "Bearer x" });
    assertRefused(r, "uploadUrl");
    assert.ok(!logLines.some((l) => l.includes("[upload] sending") && l.includes("127.0.0.1")), "upload must not be attempted");
  });

  test("create-pdf does not fetch loopback sub-resources from raw HTML in the markdown", async () => {
    canaryHits.length = 0;
    const r = await call(A, "create-pdf", {
      title: "Pdf Subresource Check",
      content: `## Report\n\nBody text.\n\n<img src="http://127.0.0.1:${canaryPort}/img">\n\n<iframe src="http://127.0.0.1:${canaryPort}/frame"></iframe>\n`,
    });
    assert.equal(r.isError, false, r.text);
    assert.equal(canaryHits.length, 0, `renderer fetched: ${canaryHits.join(", ")}`);
    assert.ok(r.json.filePath.startsWith(wsA + path.sep));
  });
});

describe("remote read-doc envelope cannot steer the temp write", () => {
  test("a '../' filename from the remote server stays inside the per-call temp dir", async () => {
    const { fetchToTempFile } = await import("../src/tools/read-doc-tool.js");
    const original = globalThis.fetch;
    const escapeName = `escape-${process.pid}-${Date.now()}.txt`;
    globalThis.fetch = async () => new Response(JSON.stringify({ data: Buffer.from("x").toString("base64"), filename: `../../../../../../${escapeName}` }), { status: 200, headers: { "Content-Type": "application/json" } });
    try {
      const got = await fetchToTempFile("https://example.com/f", "Bearer x");
      assert.equal(path.dirname(got.tempPath), got.tempDir);
      assert.equal(path.basename(got.tempPath), escapeName);
      fs.rmSync(got.tempDir, { recursive: true, force: true });
      assert.equal(fs.existsSync(path.join("/", escapeName)), false);
    } finally {
      globalThis.fetch = original;
    }
  });
});

describe("normal in-workspace operations still work", () => {
  test("create → read (relative and absolute) → edit across formats", async () => {
    const md = await call(A, "create-markdown", { title: "Normal Flow Markdown", content: "## Overview\n- point one" });
    assert.equal(md.isError, false, md.text);
    assert.ok(md.json.filePath.startsWith(wsA + path.sep));

    const doc = await call(A, "create-doc", { title: "Normal Flow Word", content: "## Intro\n- point one\n- point two" });
    assert.equal(doc.isError, false, doc.text);
    assert.ok(doc.json.filePath.startsWith(wsA + path.sep));
    const rel = path.relative(wsA, doc.json.filePath);
    const readRel = await call(A, "read-doc", { filePath: rel, mode: "indepth" });
    assert.equal(readRel.isError, false, readRel.text);
    assert.match(readRel.text, /point one/);
    const readAbs = await call(A, "read-doc", { filePath: doc.json.filePath });
    assert.equal(readAbs.isError, false, readAbs.text);
    const edited = await call(A, "edit-doc", { filePath: doc.json.filePath, action: "append", paragraphs: ["Appended line"] });
    assert.equal(edited.isError, false, edited.text);

    const xls = await call(A, "create-excel", { title: "Normal Flow Sheet", sheets: [{ name: "S", data: [["a", "b"], [1, 2]] }] });
    assert.equal(xls.isError, false, xls.text);
    const xlsEdit = await call(A, "edit-excel", { filePath: xls.json.filePath, action: "append-rows", sheetName: "S", rows: [[3, 4]] });
    assert.equal(xlsEdit.isError, false, xlsEdit.text);

    const deck = await call(A, "create-pptx", { title: "Normal Flow Deck", content: "## One\n- x" });
    const deck2 = await call(A, "edit-pptx", { filePath: deck.json.filePath, action: "append-slides", content: "## Two\n- y", outputPath: "docs/normal-flow-deck-v2.pptx" });
    assert.equal(deck2.isError, false, deck2.text);
    assert.equal(deck2.json.filePath, path.join(wsA, "docs", "normal-flow-deck-v2.pptx"));
  });
});

describe("key bookkeeping and audit log", () => {
  test("lastUsedAt is recorded for a key that made a call", async () => {
    const r = await fetch(`${baseUrl}/v1/admin/tenants`, { headers: { Authorization: `Bearer ${process.env.DOC_PROCESSOR_ADMIN_TOKEN}` } });
    const { tenants } = await r.json();
    const a = tenants.find((t) => t.tenantId === A.tenantId);
    assert.ok(a.lastUsedAt, "lastUsedAt should be set");
    assert.ok(Date.now() - Date.parse(a.lastUsedAt) < 10 * 60_000);
  });

  test("each tool call logs tool, key id, workspace verdict and result — never contents", async () => {
    const marker = "CONTENT-MARKER-8842";
    logLines.length = 0;
    const ok = await call(A, "create-markdown", { title: "Audit Log Check", content: `## Body\n- ${marker}` });
    assert.equal(ok.isError, false, ok.text);
    await call(A, "read-doc", { filePath: ok.json.filePath });
    await call(A, "read-doc", { filePath: OUTSIDE_PDF });
    const audits = logLines.filter((l) => l.includes(" tool_call ")).map((l) => JSON.parse(l.slice(l.indexOf("{"))));
    assert.ok(audits.some((a) => a.tenant === A.tenantId && a.tool === "create-markdown" && a.workspace === "inside" && a.result === "ok"));
    assert.ok(audits.some((a) => a.tenant === A.tenantId && a.tool === "read-doc" && a.workspace === "outside" && a.result === "refused"));
    assert.ok(!logLines.some((l) => l.includes(marker)), "document contents must never be logged");
  });
});

describe("regression gate: every path/URL parameter is confined", () => {
  test("tool schemas grow no path- or URL-like parameter outside PATH_ARGS / URL_ARGS", async () => {
    const { TOOL_DEFINITIONS, PATH_ARGS, URL_ARGS } = await import("../src/tool-registry.js");
    // Names that look path/URL-like but never touch the server's filesystem or
    // network: read-doc's `filename` (basename-only temp name hint) and
    // `uploadFilename` (a label sent to the receiver).
    const NOT_A_PATH = new Set(["filename", "uploadFilename"]);
    const offenders = [];
    for (const tool of TOOL_DEFINITIONS) {
      for (const [prop, schema] of Object.entries(tool.inputSchema.properties || {})) {
        if (schema?.type === "boolean") continue; // e.g. enforceDocsFolder
        if (!/path|dir|file|url|uri|root|folder/i.test(prop) || NOT_A_PATH.has(prop)) continue;
        if (!PATH_ARGS.includes(prop) && !URL_ARGS.includes(prop)) offenders.push(`${tool.name}.${prop}`);
      }
    }
    assert.deepEqual(offenders, [], "add new path/URL parameters to PATH_ARGS / URL_ARGS in src/tool-registry.js");
  });
});
