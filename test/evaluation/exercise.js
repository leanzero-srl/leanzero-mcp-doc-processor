#!/usr/bin/env node
/**
 * Deterministic tool exerciser for mcp-doc-processor.
 *
 * Spawns the stdio server and fires a fixed battery of representative + malformed
 * tool calls so the learning loop (logs/insights.jsonl) fills with attributed,
 * REAL events — success AND every failure path the dispatch chokepoint now logs
 * (GENERIC_TITLE/validation failure, duplicate, PLAIN_TEXT, file-not-found, and
 * a top-level error). It proves the instrumentation works and seeds a baseline.
 * Read the result with:  npm run insights <the printed INSIGHTS_LOG path>
 *
 * Usage:
 *   node test/evaluation/exercise.js
 *   INSIGHTS_LOG=/path/insights.jsonl node test/evaluation/exercise.js
 *
 * Env: INSIGHTS_LOG (default: temp file, printed), DOC_OUTPUT_DIR (default: temp
 * dir, so the repo isn't polluted), MCP_CLIENT_TYPE (default "exerciser"). Sets
 * REQUIRE_FORMATTING=1 so the PLAIN_TEXT rejection path is exercised.
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SERVER = path.join(__dirname, "..", "..", "src", "index.js");

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "dp-exercise-"));
const INSIGHTS_LOG = process.env.INSIGHTS_LOG || path.join(tmp, "insights.jsonl");
const DOC_OUTPUT_DIR = process.env.DOC_OUTPUT_DIR || path.join(tmp, "out");
fs.mkdirSync(DOC_OUTPUT_DIR, { recursive: true });

/** Minimal stdio JSON-RPC MCP client (line-delimited). */
class StdioClient {
  constructor(env) {
    this.env = env;
    this.proc = null;
    this.buf = "";
    this.pending = new Map();
    this.nextId = 1;
  }
  async start() {
    this.proc = spawn("node", [SERVER], {
      stdio: ["pipe", "pipe", "pipe"],
      // Run with cwd = the output dir so the registry read (duplicate check) and
      // write resolve against the same root — otherwise the duplicate path never
      // fires under a temp DOC_OUTPUT_DIR. ESM imports resolve from the module
      // URL, so cwd doesn't affect the server's own code.
      cwd: this.env.DOC_OUTPUT_DIR,
      env: this.env,
    });
    this.proc.stdout.setEncoding("utf8");
    this.proc.stdout.on("data", (c) => this._onData(c));
    this.proc.stderr.on("data", () => {});
    await this._request("initialize", {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "exerciser", version: "1.0.0" },
    });
    this._notify("notifications/initialized", {});
    await new Promise((r) => setTimeout(r, 150));
  }
  _onData(chunk) {
    this.buf += chunk;
    let idx;
    while ((idx = this.buf.indexOf("\n")) !== -1) {
      const line = this.buf.slice(0, idx).trim();
      this.buf = this.buf.slice(idx + 1);
      if (!line) continue;
      try {
        const msg = JSON.parse(line);
        if (msg.id != null && this.pending.has(msg.id)) {
          this.pending.get(msg.id).resolve(msg);
          this.pending.delete(msg.id);
        }
      } catch { /* non-JSON line */ }
    }
  }
  _notify(method, params) {
    this.proc.stdin.write(JSON.stringify({ jsonrpc: "2.0", method, params }) + "\n");
  }
  _request(method, params) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.proc.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n");
      setTimeout(() => {
        if (this.pending.has(id)) { this.pending.delete(id); reject(new Error(`timeout: ${method}`)); }
      }, 30000);
    });
  }
  async call(name, args) {
    const resp = await this._request("tools/call", { name, arguments: args });
    return resp.result || resp.error;
  }
  async stop() {
    if (this.proc) { this.proc.kill(); this.proc = null; }
  }
}

// (toolName, args, label) — mix of representative and adversarial inputs.
const BATTERY = [
  ["detect-format", { userQuery: "create a pitch deck for investors about our roadmap" }, "detect → pptx"],
  ["detect-format", { userQuery: "quarterly budget tracker with formulas and totals" }, "detect → excel"],
  ["detect-format", { userQuery: "a README for our API with code examples" }, "detect → markdown"],
  ["detect-format", { userQuery: 12345 }, "detect → ERROR (numeric query)"],
  ["create-doc", { title: "Q2 2026 Operations Review", content: "## Summary\n- Throughput up 18%\n- Costs down\n\n## Risks\n- Vendor lock-in" }, "create-doc OK"],
  ["create-markdown", { title: "Service API Reference 2026", content: "## Auth\n- Bearer token\n\n## Endpoints\n- `GET /health`\n- `POST /jobs`" }, "create-markdown OK"],
  ["create-excel", { title: "Q3 2026 Budget Plan", sheets: [{ name: "Budget", data: [["Item", "Cost"], ["Cloud", "=100*12"], ["Total", "=SUM(B2:B2)"]] }] }, "create-excel OK"],
  ["create-pdf", { title: "Acme Invoice 2026-0042", content: "## Invoice 0042\n- Subtotal: $1,200\n\n| Item | Amount |\n|---|---|\n| Consulting | $1,200 |" }, "create-pdf OK"],
  ["create-pptx", { title: "Product Strategy Deck 2026", content: "## Vision\n- Win the market\n\n## Plan\n- Ship weekly\n\n## Metrics\n| KPI | Target |\n|---|---|\n| NPS | 60 |" }, "create-pptx OK"],
  ["create-doc", { title: "Unformatted Plain Memo 2026", content: "This is just a long plain sentence with absolutely no markdown structure whatsoever, long enough to exceed the plain-text rejection threshold so that REQUIRE_FORMATTING triggers a refusal." }, "create-doc PLAIN_TEXT"],
  ["create-doc", { title: "Duplicate Demo Doc 2026", content: "## A\n- x" }, "create-doc duplicate #1 (OK)"],
  ["create-doc", { title: "Duplicate Demo Doc 2026", content: "## A\n- x" }, "create-doc duplicate #2 (dup)"],
  ["create-doc", { title: "Document" }, "create-doc GENERIC_TITLE"],
  ["read-doc", { filePath: "/nonexistent/missing-file-xyz.docx", mode: "summary" }, "read-doc file-not-found"],
  ["read-doc", { mode: "summary" }, "read-doc no-source"],
  ["list-documents", {}, "list-documents OK"],
  ["list-templates", {}, "list-templates OK"],
];

function tally(file) {
  if (!fs.existsSync(file)) return {};
  const counts = {};
  for (const line of fs.readFileSync(file, "utf8").split("\n").filter(Boolean)) {
    try { const e = JSON.parse(line); counts[e.event] = (counts[e.event] || 0) + 1; } catch { /* skip */ }
  }
  return counts;
}

async function main() {
  const env = {
    ...process.env,
    INSIGHTS_LOG,
    DOC_OUTPUT_DIR,
    MCP_CLIENT_TYPE: process.env.MCP_CLIENT_TYPE || "exerciser",
    REQUIRE_FORMATTING: "1",
  };
  const client = new StdioClient(env);
  console.log(`[exercise] doc-processor — INSIGHTS_LOG=${INSIGHTS_LOG}`);
  await client.start();
  for (const [name, args, label] of BATTERY) {
    try {
      const r = await client.call(name, args);
      const isError = r && r.isError === true;
      console.log(`  ${isError ? "·" : "✓"} ${label}`);
    } catch (err) {
      console.log(`  ✗ ${label} — ${err.message}`);
    }
  }
  await new Promise((r) => setTimeout(r, 250)); // let async appends flush
  await client.stop();
  const counts = tally(INSIGHTS_LOG);
  console.log(`[exercise] events by type: ${JSON.stringify(counts)}`);
  console.log(`[exercise] review with:  npm run insights "${INSIGHTS_LOG}"`);
}

main().catch((err) => { console.error("[exercise] fatal:", err); process.exit(1); });
