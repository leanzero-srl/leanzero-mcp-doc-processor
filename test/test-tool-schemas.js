/**
 * Schema regression tests.
 *
 * Spawns the MCP server, requests its tool list via stdio, and asserts
 * structural invariants — most importantly that no inputSchema uses
 * top-level anyOf/oneOf/allOf (which the Anthropic API rejects).
 *
 * Also asserts detect-format ends up working end-to-end (regression for
 * the missing-await bug).
 */

import { describe, test, before, after } from "node:test";
import assert from "node:assert";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SERVER_PATH = path.join(__dirname, "..", "src", "index.js");

/**
 * Minimal MCP client over stdio. Send JSON-RPC requests, return parsed responses.
 */
class StdioMcpClient {
  constructor() {
    this.proc = null;
    this.buf = "";
    this.pending = new Map();
    this.nextId = 1;
  }

  async start() {
    this.proc = spawn("node", [SERVER_PATH], {
      stdio: ["pipe", "pipe", "pipe"],
      cwd: path.dirname(SERVER_PATH),
    });
    this.proc.stdout.setEncoding("utf8");
    this.proc.stdout.on("data", (chunk) => this._onData(chunk));
    this.proc.stderr.on("data", () => {}); // discard stderr (server logging)
    // wait for the server to print its "running on stdio" line
    await new Promise((r) => setTimeout(r, 800));
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
          const { resolve } = this.pending.get(msg.id);
          this.pending.delete(msg.id);
          resolve(msg);
        }
      } catch {
        // ignore non-JSON
      }
    }
  }

  request(method, params) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      const payload = JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n";
      this.proc.stdin.write(payload);
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(new Error(`MCP request timeout: ${method}`));
        }
      }, 5000);
    });
  }

  async stop() {
    if (this.proc) {
      this.proc.kill();
      this.proc = null;
    }
  }
}

let client;

before(async () => {
  client = new StdioMcpClient();
  await client.start();
  // MCP requires initialize before any other request
  await client.request("initialize", {
    protocolVersion: "2024-11-05",
    capabilities: {},
    clientInfo: { name: "schema-regression-test", version: "1.0.0" },
  });
});

after(async () => {
  if (client) await client.stop();
});

describe("tool list schemas", () => {
  test("no inputSchema uses top-level anyOf, oneOf, or allOf (Anthropic API rejects this)", async () => {
    const resp = await client.request("tools/list", {});
    assert.ok(resp.result, "tools/list must return a result");
    assert.ok(Array.isArray(resp.result.tools), "tools must be an array");

    const offenders = [];
    for (const tool of resp.result.tools) {
      const schema = tool.inputSchema;
      if (!schema) continue;
      for (const banned of ["anyOf", "oneOf", "allOf"]) {
        if (banned in schema) {
          offenders.push(`${tool.name}.inputSchema.${banned}`);
        }
      }
    }

    assert.deepStrictEqual(
      offenders,
      [],
      `Top-level anyOf/oneOf/allOf rejected by Anthropic API. Offenders: ${offenders.join(", ")}`,
    );
  });

  test("all 13 advertised tools are present", async () => {
    const resp = await client.request("tools/list", {});
    const names = resp.result.tools.map((t) => t.name).sort();

    const expected = [
      "blueprint",
      "create-doc",
      "create-excel",
      "create-markdown",
      "detect-format",
      "dna",
      "drift-monitor",
      "edit-doc",
      "edit-excel",
      "get-lineage",
      "list-documents",
      "list-templates",
      "read-doc",
    ];

    for (const tool of expected) {
      assert.ok(names.includes(tool), `expected tool "${tool}" to be advertised`);
    }
    assert.strictEqual(names.length, expected.length, `expected exactly ${expected.length} tools, got ${names.length}: ${names.join(", ")}`);
  });

  test("read-doc still validates filePath OR url+authHeader at runtime", async () => {
    // No filePath, no url → should return isError
    const resp = await client.request("tools/call", {
      name: "read-doc",
      arguments: { mode: "summary" },
    });
    assert.ok(resp.result, "tools/call must return a result");
    assert.strictEqual(resp.result.isError, true, "read-doc with no source must be isError");
    assert.match(
      resp.result.content[0].text,
      /requires either filePath OR url\+authHeader/i,
      "error message must mention the required input shape",
    );
  });
});

describe("detect-format end-to-end", () => {
  test("returns a real format object, not an empty {} (regression for missing-await bug)", async () => {
    const resp = await client.request("tools/call", {
      name: "detect-format",
      arguments: { userQuery: "I need a budget spreadsheet for Q1 forecasts" },
    });
    assert.ok(resp.result, "tools/call must return a result");
    const text = resp.result.content[0].text;
    const parsed = JSON.parse(text);
    assert.notDeepStrictEqual(parsed, {}, "detect-format must not return {} — that's the await bug");
    assert.ok(parsed.format, `expected a format field, got: ${text}`);
    assert.ok(["markdown", "docx", "excel"].includes(parsed.format), `format must be markdown/docx/excel, got: ${parsed.format}`);
    assert.ok(parsed.confidence, "expected a confidence field");
    assert.ok(parsed.suggestedTool, "expected a suggestedTool field");
  });

  test("uses category-aware reason text — Excel-leaning input mentions data/spreadsheet", async () => {
    // Avoid trigger words from KEYWORDS.explicit (excel/xlsx/spreadsheet/xls).
    // Use only KEYWORDS.data terms so the keyword-category path runs, not the explicit-format short-circuit.
    const resp = await client.request("tools/call", {
      name: "detect-format",
      arguments: { userQuery: "track revenue and expenses with a quarterly forecast for Q1 budget" },
    });
    const parsed = JSON.parse(resp.result.content[0].text);
    assert.strictEqual(parsed.format, "excel");
    assert.match(
      parsed.reason,
      /data\/spreadsheet/,
      `Excel reason must use the data/spreadsheet label, got: "${parsed.reason}"`,
    );
  });

  test("uses category-aware reason text — DOCX-leaning input mentions stakeholder/business", async () => {
    const resp = await client.request("tools/call", {
      name: "detect-format",
      arguments: { userQuery: "executive board briefing memo for stakeholder review" },
    });
    const parsed = JSON.parse(resp.result.content[0].text);
    assert.strictEqual(parsed.format, "docx");
    assert.match(
      parsed.reason,
      /stakeholder\/business/,
      `DOCX reason must use the stakeholder/business label, got: "${parsed.reason}"`,
    );
  });
});
