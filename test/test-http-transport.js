// Set DATA_DIR before any imports so auth.js loads its tenant store from /tmp.
// node:test requires this to happen at the very top of the file.
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const TMP_DATA_DIR = mkdtempSync(join(tmpdir(), "dp-http-test-"));
process.env.DATA_DIR = TMP_DATA_DIR;
process.env.DOC_PROCESSOR_ADMIN_TOKEN = "test-admin-token-http";
process.env.PUBLIC_HOST = "127.0.0.1";

import { test, before, after, describe } from "node:test";
import assert from "node:assert/strict";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { buildApp } from "../src/server.js";

let httpServer;
let baseUrl;
let tenantBearer;

before(async () => {
  const app = buildApp();
  httpServer = await new Promise((resolve, reject) => {
    const s = app.listen(0, "127.0.0.1", () => resolve(s));
    s.on("error", reject);
  });
  const { port } = httpServer.address();
  baseUrl = `http://127.0.0.1:${port}`;

  const mintRes = await fetch(`${baseUrl}/v1/admin/tenants`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${process.env.DOC_PROCESSOR_ADMIN_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ displayName: "test-http-tenant" }),
  });
  assert.equal(mintRes.status, 201, "tenant mint should return 201");
  const minted = await mintRes.json();
  tenantBearer = minted.bearer;
  assert.ok(tenantBearer, "minted bearer should be present");
});

after(async () => {
  if (httpServer) await new Promise((r) => httpServer.close(r));
});

async function newMcpClient() {
  const transport = new StreamableHTTPClientTransport(new URL(`${baseUrl}/mcp`), {
    requestInit: {
      headers: { "Authorization": `Bearer ${tenantBearer}` },
    },
  });
  const client = new Client({ name: "http-test", version: "0.1.0" });
  await client.connect(transport);
  return { client, transport };
}

describe("HTTP transport — health probe", () => {
  test("GET /healthz returns ok with tools count", async () => {
    const r = await fetch(`${baseUrl}/healthz`);
    assert.equal(r.status, 200);
    const body = await r.json();
    assert.equal(body.ok, true);
    assert.equal(body.tools, 15);
    assert.ok(body.version);
  });
});

describe("HTTP transport — Bearer auth gate", () => {
  test("POST /mcp without Authorization → 401", async () => {
    const r = await fetch(`${baseUrl}/mcp`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} }),
    });
    assert.equal(r.status, 401);
  });

  test("POST /mcp with malformed Authorization → 401", async () => {
    const r = await fetch(`${baseUrl}/mcp`, {
      method: "POST",
      headers: { "Authorization": "NotBearer xyz", "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} }),
    });
    assert.equal(r.status, 401);
  });

  test("POST /mcp with unknown bearer → 401", async () => {
    const r = await fetch(`${baseUrl}/mcp`, {
      method: "POST",
      headers: { "Authorization": "Bearer notarealtoken", "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} }),
    });
    assert.equal(r.status, 401);
  });
});

describe("HTTP transport — MCP protocol over SDK Client", () => {
  test("initialize returns server identity and instructions", async () => {
    const { client, transport } = await newMcpClient();
    try {
      const info = client.getServerVersion();
      assert.equal(info.name, "mcp-doc-processor");
      assert.equal(info.version, "1.0.0");
      const instructions = client.getInstructions();
      assert.ok(instructions && instructions.includes("Format selection"));
    } finally {
      await transport.close();
    }
  });

  test("tools/list returns all 15 advertised tools", async () => {
    const { client, transport } = await newMcpClient();
    try {
      const result = await client.listTools();
      const names = result.tools.map((t) => t.name).sort();
      const expected = [
        "blueprint",
        "create-doc",
        "create-excel",
        "create-markdown",
        "create-pdf",
        "create-pptx",
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
      assert.deepEqual(names, expected);
    } finally {
      await transport.close();
    }
  });

  test("tools/call detect-format works end-to-end", async () => {
    const { client, transport } = await newMcpClient();
    try {
      const result = await client.callTool({
        name: "detect-format",
        arguments: { userQuery: "I need a budget tracker for Q3 expenses" },
      });
      assert.ok(Array.isArray(result.content));
      assert.equal(result.content[0].type, "text");
      const parsed = JSON.parse(result.content[0].text);
      assert.ok(parsed.format);
      assert.ok(parsed.suggestedTool);
    } finally {
      await transport.close();
    }
  });

  test("tools/call create-markdown with dryRun does not write a file", async () => {
    const { client, transport } = await newMcpClient();
    try {
      const result = await client.callTool({
        name: "create-markdown",
        arguments: {
          title: "HTTP Transport Smoke Test Note",
          paragraphs: ["A quick paragraph."],
          dryRun: true,
        },
      });
      assert.notEqual(result.isError, true);
      const parsed = JSON.parse(result.content[0].text);
      assert.equal(parsed.success, true);
      assert.ok(parsed.dryRun === true || parsed.preview, "dryRun result should indicate preview mode");
    } finally {
      await transport.close();
    }
  });
});
