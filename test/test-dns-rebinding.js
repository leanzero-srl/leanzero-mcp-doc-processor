// DNS rebinding for hosted keys: the URL check and the fetch must use ONE
// resolution. A hostile DNS server can answer "public" when the server checks a
// caller's URL and "127.0.0.1" a moment later when it connects. Before the fix
// (workspace.js callerFetch/guardedFetch) every fetch site resolved again on its
// own, so these tests reached the loopback canary.
//
// The stub resolver below answers a PUBLIC address on the first lookup of each
// rebind host and 127.0.0.1 on every later one. Chromium (create-pdf) has its
// own resolver, so it is pointed at 127.0.0.1 with --host-resolver-rules — the
// same "second answer is private" a rebinding DNS would give it.
//
// DATA_DIR must be set BEFORE src/auth.js is evaluated, so the server is
// imported dynamically after the env is set.
import { test, before, after, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import dns from "node:dns";
import puppeteer from "puppeteer";

const TMP = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "dp-rebind-test-")));
process.env.DATA_DIR = path.join(TMP, "data");
process.env.DOC_PROCESSOR_ADMIN_TOKEN = "test-admin-token-rebind";
process.env.PUBLIC_HOST = "127.0.0.1";
process.env.TENANT_RATE_LIMIT = "10000";

const PUBLIC_IP = "93.184.215.14";
const lookups = new Map(); // host -> number of lookups so far
const isRebindHost = (h) => /^rebind-[a-z0-9-]+\.test$/.test(h);
function answerFor(host) {
  const n = (lookups.get(host) || 0) + 1;
  lookups.set(host, n);
  return n === 1 ? PUBLIC_IP : "127.0.0.1";
}
const origLookup = dns.lookup;
const origPromisesLookup = dns.promises.lookup;
dns.lookup = function stubLookup(host, options, cb) {
  if (typeof options === "function") { cb = options; options = {}; }
  if (!isRebindHost(host)) return origLookup.call(dns, host, options, cb);
  const address = answerFor(host);
  return options && options.all ? cb(null, [{ address, family: 4 }]) : cb(null, address, 4);
};
dns.promises.lookup = async function stubPromisesLookup(host, options = {}) {
  if (!isRebindHost(host)) return origPromisesLookup.call(dns.promises, host, options);
  const address = answerFor(host);
  return options.all ? [{ address, family: 4 }] : { address, family: 4 };
};

// Chromium's view of the PDF sub-resource host: the private answer.
const origLaunch = puppeteer.launch;
puppeteer.launch = function launchWithRebind(opts = {}) {
  return origLaunch.call(puppeteer, { ...opts, args: [...(opts.args || []), "--host-resolver-rules=MAP rebind-pdf.test 127.0.0.1"] });
};

// Loopback canary: ANY TCP connection is a hit (the SSRF primitive), whatever
// protocol the client tries to speak on it.
const hits = [];
const canary = net.createServer((sock) => { hits.push(Date.now()); sock.destroy(); });
let port;
let httpServer;
let baseUrl;
let key;
let closeBrowser;

before(async () => {
  await new Promise((r) => canary.listen(0, "127.0.0.1", r));
  port = canary.address().port;
  const { buildApp } = await import("../src/server.js");
  ({ closeBrowser } = await import("../src/services/pdf-renderer.js"));
  httpServer = await new Promise((resolve, reject) => {
    const s = buildApp().listen(0, "127.0.0.1", () => resolve(s));
    s.on("error", reject);
  });
  baseUrl = `http://127.0.0.1:${httpServer.address().port}`;
  const r = await fetch(`${baseUrl}/v1/admin/tenants`, {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.DOC_PROCESSOR_ADMIN_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ displayName: "rebind-tenant" }),
  });
  key = await r.json();
});

after(async () => {
  dns.lookup = origLookup;
  dns.promises.lookup = origPromisesLookup;
  puppeteer.launch = origLaunch;
  if (closeBrowser) await closeBrowser();
  if (httpServer) await new Promise((r) => httpServer.close(r));
  await new Promise((r) => canary.close(r));
  fs.rmSync(TMP, { recursive: true, force: true });
});

let rpcId = 0;
async function call(name, args) {
  const r = await fetch(`${baseUrl}/mcp`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key.bearer}`, "Content-Type": "application/json", Accept: "application/json, text/event-stream" },
    body: JSON.stringify({ jsonrpc: "2.0", id: ++rpcId, method: "tools/call", params: { name, arguments: args } }),
  });
  const raw = await r.text();
  let msg = null;
  for (const line of raw.split("\n")) if (line.startsWith("data:")) msg = JSON.parse(line.slice(5));
  if (!msg) msg = JSON.parse(raw);
  const text = (msg.result?.content || []).filter((c) => c.type === "text").map((c) => c.text).join("\n");
  let json = null;
  try { json = JSON.parse(text); } catch { /* plain text */ }
  return { isError: !!msg.result?.isError, text, json };
}

describe("a URL that rebinds to loopback after the check is never connected to", () => {
  test("read-doc url", async () => {
    hits.length = 0;
    const res = await call("read-doc", { url: `https://rebind-read.test:${port}/doc`, authHeader: "Bearer x" });
    assert.equal(lookups.get("rebind-read.test") >= 1, true, "positive control: the check resolved the host");
    assert.equal(hits.length, 0, "read-doc connected to the loopback canary");
    assert.equal(res.isError, true, res.text);
    assert.match(res.text, /not allowed/i);
  });

  test("create-* uploadUrl", async () => {
    hits.length = 0;
    const res = await call("create-markdown", {
      title: "Rebind Upload Check", content: "## A\n- b",
      uploadUrl: `https://rebind-upload.test:${port}/up`, uploadAuthHeader: "Bearer x",
    });
    assert.equal(lookups.get("rebind-upload.test") >= 1, true, "positive control: the check resolved the host");
    assert.equal(hits.length, 0, "the upload connected to the loopback canary");
    assert.match(String(res.json?.uploadError || res.text), /not allowed/i, res.text.slice(0, 300));
  });

  test("fact-check webSearchUrl", async () => {
    hits.length = 0;
    const res = await call("fact-check", {
      claims: ["Water boils at 100 degrees Celsius at sea level"],
      webSearchBearer: "x", serperKey: "x", webSearchUrl: `https://rebind-ws.test:${port}/mcp`,
    });
    assert.equal(lookups.get("rebind-ws.test") >= 1, true, "positive control: the check resolved the host");
    assert.equal(hits.length, 0, "fact-check connected to the loopback canary");
    assert.match(res.text, /not allowed/i, res.text.slice(0, 300));
  });

  test("create-pdf sub-resource (Chromium never resolves it itself)", async () => {
    hits.length = 0;
    const res = await call("create-pdf", {
      title: "Rebind Pdf Check",
      content: `## Report\n\nBody.\n\n<img src="https://rebind-pdf.test:${port}/img.png">\n`,
    });
    assert.equal(res.isError, false, res.text);
    assert.equal(hits.length, 0, "the PDF renderer connected to the loopback canary");
  });
});

describe("guardedFetch resolver (unit)", () => {
  test("a public answer is used for the connection; a private one is refused", async () => {
    const { guardedFetch, UrlNotAllowedError } = await import("../src/utils/workspace.js");
    // First lookup (public) — the pinned agent connects to it; nothing answers
    // on 93.184.215.14:4433, so the fetch ends in a NETWORK error or timeout,
    // not a refusal: proof the public answer was accepted. (Not port 1: fetch
    // refuses its "bad ports" before any lookup.)
    lookups.delete("rebind-unit.test");
    const first = await guardedFetch("https://rebind-unit.test:4433/x", { signal: AbortSignal.timeout(1500) }).catch((e) => e);
    assert.equal(lookups.get("rebind-unit.test"), 1, "positive control: the first fetch did resolve the host");
    assert.ok(!(first instanceof UrlNotAllowedError), `public answer was refused: ${first?.message}`);
    // Second lookup (private) — refused before any socket opens.
    hits.length = 0;
    const second = await guardedFetch(`https://rebind-unit.test:${port}/x`).catch((e) => e);
    assert.ok(second instanceof UrlNotAllowedError, `expected a refusal, got ${second?.message}`);
    assert.equal(hits.length, 0);
  });

  test("IP-literal private targets are refused (Node skips lookup for literals)", async () => {
    const { guardedFetch, UrlNotAllowedError } = await import("../src/utils/workspace.js");
    hits.length = 0;
    for (const u of [`https://127.0.0.1:${port}/x`, `https://[::ffff:127.0.0.1]:${port}/x`, "https://100.100.100.100/x"]) {
      const e = await guardedFetch(u).catch((err) => err);
      assert.ok(e instanceof UrlNotAllowedError, `${u}: ${e?.message}`);
    }
    assert.equal(hits.length, 0);
  });
});

describe("regression gate: no new unpinned outbound fetch", () => {
  test("every fetch() in src/ goes through callerFetch/guardedFetch, except the operator-configured vision API", async () => {
    // A new tool that fetches a caller-supplied URL with the bare global fetch
    // would reopen DNS rebinding. Allowed bare fetch() calls: callerFetch's own
    // stdio branch (workspace.js) and vision-service.js, whose URL comes from the
    // operator's env (Z.AI), never from a caller.
    const ALLOWED = new Set(["src/utils/workspace.js", "src/services/vision-service.js"]);
    const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
    const offenders = [];
    const walk = (dir) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) walk(p);
        else if (e.name.endsWith(".js")) {
          const rel = path.relative(root, p);
          fs.readFileSync(p, "utf8").split("\n").forEach((line, i) => {
            if (/^\s*(\/\/|\*)/.test(line)) return;
            if (/(^|[^A-Za-z_.])fetch\(/.test(line) && !ALLOWED.has(rel)) offenders.push(`${rel}:${i + 1}`);
          });
        }
      }
    };
    walk(path.join(root, "src"));
    assert.deepEqual(offenders, [], "use callerFetch() (src/utils/workspace.js) for any URL a caller can influence");
  });
});
