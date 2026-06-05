// Set DATA_DIR + admin token + low rate-limit BEFORE importing auth/server.
// node:test ESM imports are hoisted but env reads inside the modules happen
// when the modules execute, so this ordering still works because the relevant
// reads (DATA_DIR in auth.js, TENANT_RATE_LIMIT in tenantRateLimiter.max
// callback) happen after this file's top runs.
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const TMP_DATA_DIR = mkdtempSync(join(tmpdir(), "dp-auth-test-"));
process.env.DATA_DIR = TMP_DATA_DIR;
process.env.DOC_PROCESSOR_ADMIN_TOKEN = "test-admin-token-auth";
process.env.PUBLIC_HOST = "127.0.0.1";
process.env.TENANT_RATE_LIMIT = "3";

import { test, before, after, describe } from "node:test";
import assert from "node:assert/strict";
import { buildApp } from "../src/server.js";
import { invalidateTenantsCache } from "../src/auth.js";

const ADMIN_TOKEN = process.env.DOC_PROCESSOR_ADMIN_TOKEN;

let httpServer;
let baseUrl;

before(async () => {
  const app = buildApp();
  httpServer = await new Promise((resolve, reject) => {
    const s = app.listen(0, "127.0.0.1", () => resolve(s));
    s.on("error", reject);
  });
  const { port } = httpServer.address();
  baseUrl = `http://127.0.0.1:${port}`;
});

after(async () => {
  if (httpServer) await new Promise((r) => httpServer.close(r));
});

async function mintTenant(displayName = "auth-test") {
  const r = await fetch(`${baseUrl}/v1/admin/tenants`, {
    method: "POST",
    headers: { "Authorization": `Bearer ${ADMIN_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ displayName }),
  });
  assert.equal(r.status, 201);
  const body = await r.json();
  invalidateTenantsCache();
  return body;
}

async function callMcpInit(bearer) {
  return fetch(`${baseUrl}/mcp`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${bearer}`,
      "Content-Type": "application/json",
      "Accept": "application/json, text/event-stream",
    },
    body: JSON.stringify({
      jsonrpc: "2.0", id: 1, method: "initialize",
      params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "auth-test", version: "0" } },
    }),
  });
}

describe("auth — admin Bearer", () => {
  test("admin route via Funnel (X-Forwarded-For) → 404 even with valid token", async () => {
    const r = await fetch(`${baseUrl}/v1/admin/tenants`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${ADMIN_TOKEN}`,
        "Content-Type": "application/json",
        "X-Forwarded-For": "203.0.113.7", // simulates a public Funnel hop
      },
      body: JSON.stringify({ displayName: "should-be-blocked" }),
    });
    assert.equal(r.status, 404);
  });

  test("admin route without token → 401", async () => {
    const r = await fetch(`${baseUrl}/v1/admin/tenants`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ displayName: "x" }),
    });
    assert.equal(r.status, 401);
  });

  test("admin route with wrong token → 401", async () => {
    const r = await fetch(`${baseUrl}/v1/admin/tenants`, {
      method: "POST",
      headers: { "Authorization": "Bearer wrong", "Content-Type": "application/json" },
      body: JSON.stringify({ displayName: "x" }),
    });
    assert.equal(r.status, 401);
  });

  test("admin mint without displayName → 400", async () => {
    const r = await fetch(`${baseUrl}/v1/admin/tenants`, {
      method: "POST",
      headers: { "Authorization": `Bearer ${ADMIN_TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    assert.equal(r.status, 400);
  });

  test("admin list returns minted tenants", async () => {
    await mintTenant("listed-tenant");
    const r = await fetch(`${baseUrl}/v1/admin/tenants`, {
      headers: { "Authorization": `Bearer ${ADMIN_TOKEN}` },
    });
    assert.equal(r.status, 200);
    const body = await r.json();
    assert.ok(Array.isArray(body.tenants));
    const found = body.tenants.find((t) => t.displayName === "listed-tenant");
    assert.ok(found, "minted tenant should appear in list");
    assert.ok(!Object.prototype.hasOwnProperty.call(found, "bearer"), "list must not echo bearer");
    assert.ok(!Object.prototype.hasOwnProperty.call(found, "bearerHash"), "list must not echo hash");
  });
});

describe("auth — tenant Bearer on /mcp", () => {
  test("missing Authorization → 401", async () => {
    const r = await fetch(`${baseUrl}/mcp`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} }),
    });
    assert.equal(r.status, 401);
  });

  test("malformed Authorization → 401", async () => {
    const r = await fetch(`${baseUrl}/mcp`, {
      method: "POST",
      headers: { "Authorization": "Token abc", "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} }),
    });
    assert.equal(r.status, 401);
  });

  test("empty bearer token → 401", async () => {
    const r = await fetch(`${baseUrl}/mcp`, {
      method: "POST",
      headers: { "Authorization": "Bearer ", "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} }),
    });
    assert.equal(r.status, 401);
  });

  test("unknown bearer → 401", async () => {
    const r = await callMcpInit("definitely-not-a-real-bearer");
    assert.equal(r.status, 401);
  });

  test("valid bearer → handshake succeeds", async () => {
    const { bearer } = await mintTenant("valid-tenant");
    const r = await callMcpInit(bearer);
    assert.equal(r.status, 200);
  });
});

describe("auth — revocation and rotation", () => {
  test("revoked tenant bearer → 401", async () => {
    const { bearer, tenantId } = await mintTenant("revoke-tenant");
    let r = await callMcpInit(bearer);
    assert.equal(r.status, 200, "bearer should work pre-revoke");

    const del = await fetch(`${baseUrl}/v1/admin/tenants/${tenantId}`, {
      method: "DELETE",
      headers: { "Authorization": `Bearer ${ADMIN_TOKEN}` },
    });
    assert.equal(del.status, 200);
    invalidateTenantsCache();

    r = await callMcpInit(bearer);
    assert.equal(r.status, 401, "bearer must be rejected after revoke");
  });

  test("rotate produces new bearer; old still works during grace", async () => {
    const { bearer: oldBearer, tenantId } = await mintTenant("rotate-tenant");

    const rot = await fetch(`${baseUrl}/v1/admin/tenants/${tenantId}/rotate`, {
      method: "POST",
      headers: { "Authorization": `Bearer ${ADMIN_TOKEN}` },
    });
    assert.equal(rot.status, 200);
    const { bearer: newBearer } = await rot.json();
    assert.ok(newBearer);
    assert.notEqual(newBearer, oldBearer);
    invalidateTenantsCache();

    const rNew = await callMcpInit(newBearer);
    assert.equal(rNew.status, 200, "new bearer should work immediately");

    const rOld = await callMcpInit(oldBearer);
    assert.equal(rOld.status, 200, "old bearer should still work during 5-min grace");
  });

  test("rotate against unknown tenant → 404", async () => {
    const r = await fetch(`${baseUrl}/v1/admin/tenants/00000000-0000-0000-0000-000000000000/rotate`, {
      method: "POST",
      headers: { "Authorization": `Bearer ${ADMIN_TOKEN}` },
    });
    assert.equal(r.status, 404);
  });
});

describe("auth — rate limiting (TENANT_RATE_LIMIT=3)", () => {
  test("4th request in the window → 429", async () => {
    const { bearer } = await mintTenant("rate-limit-tenant");

    for (let i = 0; i < 3; i++) {
      const r = await callMcpInit(bearer);
      assert.equal(r.status, 200, `request #${i + 1} should succeed`);
    }

    const fourth = await callMcpInit(bearer);
    assert.equal(fourth.status, 429);
    const retryAfter = fourth.headers.get("retry-after") || fourth.headers.get("ratelimit-reset");
    assert.ok(retryAfter, "429 response should include rate-limit headers");
  });
});
