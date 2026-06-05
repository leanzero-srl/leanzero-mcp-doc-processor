import { promises as fs } from "node:fs";
import { randomBytes, createHash } from "node:crypto";
import path from "node:path";

import { FileClientsStore } from "./clients-store.js";
import { renderConsentPage } from "./consent.js";
import { verifyTenantToken } from "../auth.js";
import { log } from "../utils/logger.js";

// OAuth 2.1 authorization-server provider for the MCP SDK's mcpAuthRouter.
// Bridges the OAuth login step to the existing per-tenant bearer tokens: the
// "user authentication" is pasting a tenant token, which we verify with argon2
// (verifyTenantToken) and then mint OAuth access/refresh tokens bound to that
// tenant. This lets claude.ai web (OAuth-only) reach the same /mcp endpoint that
// Claude Code/Desktop/API reach with a static bearer.
//
// Persistence: clients + issued tokens are written to DATA_DIR (mode 0600) so
// they survive launchd restarts. Authorization codes are short-lived and kept
// in memory only (the code→token exchange happens within seconds).

const DATA_DIR = process.env.DATA_DIR || process.cwd();
const TOKENS_PATH = path.join(DATA_DIR, "oauth-tokens.json");

const ACCESS_TTL_MS = Number(process.env.OAUTH_ACCESS_TTL_MS) || 60 * 60 * 1000;          // 1h
const REFRESH_TTL_MS = Number(process.env.OAUTH_REFRESH_TTL_MS) || 30 * 24 * 60 * 60 * 1000; // 30d
const CODE_TTL_MS = 5 * 60 * 1000; // 5 min

function newToken() {
  return randomBytes(32).toString("base64url");
}

// Tokens are 256-bit random, so a fast hash (not argon2) is sufficient and is
// used as the at-rest key — the raw token is returned to the client but never
// written to disk, matching the "never store the secret" posture of tenants.json.
function hashToken(token) {
  return createHash("sha256").update(token).digest("hex");
}

export class DocProcessorOAuthProvider {
  constructor({ consentPostPath = "/oauth/consent" } = {}) {
    this.clientsStore = new FileClientsStore();
    this.consentPostPath = consentPostPath;
    this.codes = new Map(); // code -> { clientId, codeChallenge, redirectUri, tenantId, displayName, scopes, expiresAt }
    this._tokens = null;    // { access: {token: rec}, refresh: {token: rec} }
  }

  async _loadTokens() {
    if (this._tokens) return this._tokens;
    try {
      this._tokens = JSON.parse(await fs.readFile(TOKENS_PATH, "utf8"));
    } catch (err) {
      if (err.code === "ENOENT") this._tokens = { access: {}, refresh: {} };
      else throw err;
    }
    this._tokens.access ||= {};
    this._tokens.refresh ||= {};
    return this._tokens;
  }

  async _saveTokens() {
    await fs.mkdir(path.dirname(TOKENS_PATH), { recursive: true });
    const tmp = `${TOKENS_PATH}.tmp.${process.pid}`;
    await fs.writeFile(tmp, JSON.stringify(this._tokens, null, 2), { mode: 0o600 });
    await fs.rename(tmp, TOKENS_PATH);
    try { await fs.chmod(TOKENS_PATH, 0o600); } catch { /* best effort */ }
  }

  // --- OAuthServerProvider interface -------------------------------------

  // Begins the flow: render the consent/login page. The page POSTs the tenant
  // token + carried-through params to `consentPostPath` (handled in server.js),
  // which calls completeAuthorization() to issue the code + redirect.
  async authorize(client, params, res) {
    const html = renderConsentPage({
      action: this.consentPostPath,
      clientName: client.client_name || client.client_id,
      params: {
        client_id: client.client_id,
        redirect_uri: params.redirectUri,
        code_challenge: params.codeChallenge,
        state: params.state ?? "",
        scope: (params.scopes || []).join(" "),
        resource: params.resource?.href ?? "",
      },
    });
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.status(200).send(html);
  }

  async challengeForAuthorizationCode(client, authorizationCode) {
    const rec = this._validCode(client, authorizationCode);
    return rec.codeChallenge;
  }

  async exchangeAuthorizationCode(client, authorizationCode, _codeVerifier, redirectUri) {
    const rec = this._validCode(client, authorizationCode);
    if (redirectUri && redirectUri !== rec.redirectUri) {
      throw new Error("invalid_grant: redirect_uri mismatch");
    }
    this.codes.delete(authorizationCode);
    return this._issueTokens(rec.tenantId, rec.displayName, client.client_id, rec.scopes);
  }

  async exchangeRefreshToken(client, refreshToken, scopes) {
    const store = await this._loadTokens();
    const key = hashToken(refreshToken);
    const rec = store.refresh[key];
    if (!rec || rec.clientId !== client.client_id || rec.expiresAt < Date.now()) {
      throw new Error("invalid_grant: refresh token invalid or expired");
    }
    // Rotate the refresh token on use.
    delete store.refresh[key];
    const nextScopes = scopes && scopes.length ? scopes : rec.scopes;
    return this._issueTokens(rec.tenantId, rec.displayName, client.client_id, nextScopes);
  }

  async verifyAccessToken(token) {
    const store = await this._loadTokens();
    const key = hashToken(token);
    const rec = store.access[key];
    if (!rec) throw new Error("invalid_token");
    if (rec.expiresAt < Date.now()) {
      delete store.access[key];
      await this._saveTokens();
      throw new Error("invalid_token: expired");
    }
    return {
      token,
      clientId: rec.clientId,
      scopes: rec.scopes || [],
      expiresAt: Math.floor(rec.expiresAt / 1000),
      extra: { tenantId: rec.tenantId, displayName: rec.displayName },
    };
  }

  async revokeToken(_client, request) {
    const store = await this._loadTokens();
    const key = hashToken(request.token);
    let changed = false;
    if (store.access[key]) { delete store.access[key]; changed = true; }
    if (store.refresh[key]) { delete store.refresh[key]; changed = true; }
    if (changed) await this._saveTokens();
  }

  // --- bridge helper, called by the consent POST route in server.js -------

  async completeAuthorization({ client_id, redirect_uri, code_challenge, state, scope, tenantToken }) {
    // Re-validate the client + redirect_uri at the consent POST (the SDK validated
    // them on GET /authorize, but this endpoint is reachable directly). Prevents a
    // tampered form from redirecting an auth code to an unregistered URI.
    const client = await this.clientsStore.getClient(client_id);
    if (!client || !code_challenge || !Array.isArray(client.redirect_uris) || !client.redirect_uris.includes(redirect_uri)) {
      return { ok: false };
    }

    const tenant = await verifyTenantToken((tenantToken || "").trim());
    if (!tenant) return { ok: false };

    const code = newToken();
    this.codes.set(code, {
      clientId: client_id,
      codeChallenge: code_challenge,
      redirectUri: redirect_uri,
      tenantId: tenant.id,
      displayName: tenant.displayName,
      scopes: scope ? scope.split(" ").filter(Boolean) : [],
      expiresAt: Date.now() + CODE_TTL_MS,
    });

    const url = new URL(redirect_uri);
    url.searchParams.set("code", code);
    if (state) url.searchParams.set("state", state);

    log("info", "[oauth] authorization granted", { client_id, tenant: tenant.id });
    return { ok: true, redirectTo: url.href };
  }

  // --- internals ----------------------------------------------------------

  _validCode(client, code) {
    const rec = this.codes.get(code);
    if (!rec || rec.clientId !== client.client_id || rec.expiresAt < Date.now()) {
      if (rec && rec.expiresAt < Date.now()) this.codes.delete(code);
      throw new Error("invalid_grant: authorization code invalid or expired");
    }
    return rec;
  }

  async _issueTokens(tenantId, displayName, clientId, scopes) {
    const store = await this._loadTokens();
    const now = Date.now();

    const access_token = newToken();
    const refresh_token = newToken();
    store.access[hashToken(access_token)] = { tenantId, displayName, clientId, scopes: scopes || [], expiresAt: now + ACCESS_TTL_MS };
    store.refresh[hashToken(refresh_token)] = { tenantId, displayName, clientId, scopes: scopes || [], expiresAt: now + REFRESH_TTL_MS };

    // Opportunistic cleanup of expired tokens to keep the store small.
    for (const [t, r] of Object.entries(store.access)) if (r.expiresAt < now) delete store.access[t];
    for (const [t, r] of Object.entries(store.refresh)) if (r.expiresAt < now) delete store.refresh[t];

    await this._saveTokens();

    const scopeStr = (scopes || []).join(" ");
    return {
      access_token,
      token_type: "Bearer",
      expires_in: Math.floor(ACCESS_TTL_MS / 1000),
      refresh_token,
      ...(scopeStr ? { scope: scopeStr } : {}),
    };
  }
}
