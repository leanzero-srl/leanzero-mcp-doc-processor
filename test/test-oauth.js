// End-to-end test for the OAuth 2.1 bridge + static bearer over HTTP transport.
// Boots the real buildApp() with OAuth + DNS-rebinding protection enabled on a
// fixed port and exercises: metadata discovery, 401 WWW-Authenticate discovery,
// static tenant bearer on /mcp, dynamic client registration, the authorize →
// consent → token (PKCE) code flow, OAuth access token on /mcp, PKCE-mismatch
// rejection, and the refresh-token grant. Plain `node` runner (exits non-zero on
// failure) — env must be set before the server module's top-level reads.
// Run: npm run test:oauth   (or: node test/test-oauth.js)
import { createHash, randomBytes } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:net";

// Pick a free port up front so PUBLIC_HOST/ISSUER_URL can reference it before the
// server module is loaded (those env vars are read at module top-level).
const port = await new Promise((res) => {
  const s = createServer();
  s.listen(0, "127.0.0.1", () => { const p = s.address().port; s.close(() => res(p)); });
});

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), "dp-oauth-smoke-"));
process.env.DOC_PROCESSOR_ADMIN_TOKEN = "smoke-admin";
process.env.PUBLIC_HOST = `127.0.0.1:${port}`;          // must match the Host header
process.env.ISSUER_URL = `http://127.0.0.1:${port}`;    // localhost http allowed by SDK

const { buildApp } = await import("../src/server.js");

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.error("  ✔", m); } else { fail++; console.error("  ✘", m); } };

const srv = await new Promise((res) => { const s = buildApp().listen(port, "127.0.0.1", () => res(s)); });
const B = `http://127.0.0.1:${port}`;
const j = async (r) => { try { return await r.json(); } catch { return null; } };
const ACCEPT = "application/json, text/event-stream";
const initBody = (id) => JSON.stringify({ jsonrpc: "2.0", id, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "smoke", version: "0" } } });

try {
  // 1. healthz
  ok((await j(await fetch(`${B}/healthz`)))?.ok === true, "healthz ok");

  // 2. metadata discovery
  const asMeta = await j(await fetch(`${B}/.well-known/oauth-authorization-server`));
  ok(asMeta?.authorization_endpoint === `${B}/authorize`, "AS metadata authorization_endpoint");
  ok(asMeta?.token_endpoint === `${B}/token`, "AS metadata token_endpoint");
  ok(asMeta?.registration_endpoint === `${B}/register`, "AS metadata registration_endpoint");
  ok(asMeta?.code_challenge_methods_supported?.includes("S256"), "AS supports S256 PKCE");
  const prMeta = await j(await fetch(`${B}/.well-known/oauth-protected-resource/mcp`));
  ok(prMeta?.authorization_servers?.[0] === asMeta?.issuer, "protected-resource points at AS");

  // 3. unauth /mcp -> 401 + WWW-Authenticate resource_metadata
  const un = await fetch(`${B}/mcp`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} }) });
  ok(un.status === 401, "unauth /mcp -> 401");
  ok(/resource_metadata=/.test(un.headers.get("www-authenticate") || ""), "401 carries WWW-Authenticate resource_metadata");

  // mint a tenant
  const minted = await j(await fetch(`${B}/v1/admin/tenants`, { method: "POST", headers: { "Authorization": "Bearer smoke-admin", "Content-Type": "application/json" }, body: JSON.stringify({ displayName: "smoke" }) }));
  const tenantToken = minted?.bearer;
  ok(!!tenantToken, "minted tenant bearer");

  // 4. static bearer -> 200 (also proves DNS-rebinding allows the correct Host)
  const stat = await fetch(`${B}/mcp`, { method: "POST", headers: { "Authorization": `Bearer ${tenantToken}`, "Content-Type": "application/json", "Accept": ACCEPT }, body: initBody(2) });
  ok(stat.status === 200, "static tenant bearer -> /mcp initialize 200");

  // 5. full OAuth flow
  const reg = await j(await fetch(`${B}/register`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ client_name: "smoke-cli", redirect_uris: ["http://127.0.0.1:9999/cb"], token_endpoint_auth_method: "none", grant_types: ["authorization_code", "refresh_token"], response_types: ["code"] }) }));
  ok(!!reg?.client_id, "dynamic client registration");

  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  const RU = "http://127.0.0.1:9999/cb";

  const authResp = await fetch(`${B}/authorize?response_type=code&client_id=${encodeURIComponent(reg.client_id)}&redirect_uri=${encodeURIComponent(RU)}&code_challenge=${challenge}&code_challenge_method=S256&state=xyz&scope=mcp`);
  ok(authResp.status === 200 && /tenant_token/.test(await authResp.text()), "GET /authorize renders consent page");

  const consent = (tok, state) => fetch(`${B}/oauth/consent`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, redirect: "manual", body: new URLSearchParams({ client_id: reg.client_id, redirect_uri: RU, code_challenge: challenge, state, scope: "mcp", tenant_token: tok }) });

  ok((await consent("nope", "x")).status === 401, "consent with bad token -> 401");

  const good = await consent(tenantToken, "xyz");
  const loc = good.headers.get("location") || "";
  const code = new URL(loc).searchParams.get("code");
  ok(good.status === 302 && !!code && new URL(loc).searchParams.get("state") === "xyz", "consent -> 302 redirect with code+state");

  const tok = await j(await fetch(`${B}/token`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ grant_type: "authorization_code", code, code_verifier: verifier, redirect_uri: RU, client_id: reg.client_id }) }));
  ok(!!tok?.access_token && tok.token_type === "Bearer" && !!tok.refresh_token, "token exchange returns access+refresh");

  const oauthCall = await fetch(`${B}/mcp`, { method: "POST", headers: { "Authorization": `Bearer ${tok.access_token}`, "Content-Type": "application/json", "Accept": ACCEPT }, body: initBody(3) });
  ok(oauthCall.status === 200, "OAuth access token -> /mcp initialize 200");

  // tampered redirect_uri (not registered for the client) must be rejected even
  // with a valid tenant token — no auth code is issued to an unregistered URI.
  const tamper = await fetch(`${B}/oauth/consent`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, redirect: "manual", body: new URLSearchParams({ client_id: reg.client_id, redirect_uri: "http://evil.example/cb", code_challenge: challenge, state: "t", scope: "mcp", tenant_token: tenantToken }) });
  ok(tamper.status === 401 && !tamper.headers.get("location"), "consent with unregistered redirect_uri -> 401, no redirect");

  // wrong PKCE verifier rejected
  const good2 = await consent(tenantToken, "s2");
  const code2 = new URL(good2.headers.get("location")).searchParams.get("code");
  const badTok = await fetch(`${B}/token`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ grant_type: "authorization_code", code: code2, code_verifier: "wrong", redirect_uri: RU, client_id: reg.client_id }) });
  ok(badTok.status >= 400, "wrong PKCE verifier rejected");

  // refresh grant works
  const refresh = await j(await fetch(`${B}/token`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: tok.refresh_token, client_id: reg.client_id }) }));
  ok(!!refresh?.access_token, "refresh_token grant returns new access token");
} catch (e) {
  fail++; console.error("  ✘ threw:", e.stack || e.message);
} finally {
  srv.close();
  console.error(`\n  oauth-smoke: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}
