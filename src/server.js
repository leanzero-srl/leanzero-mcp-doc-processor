#!/usr/bin/env node

import express from "express";
import cors from "cors";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";

import { mcpAuthRouter, getOAuthProtectedResourceMetadataUrl } from "@modelcontextprotocol/sdk/server/auth/router.js";

import { setupLogging, log } from "./utils/logger.js";
import { registerAllTools, SERVER_INSTRUCTIONS } from "./tool-registry.js";
import { requireBearer, tenantRateLimiter, mountAdminRoutes, setResourceMetadataUrl } from "./auth.js";
import { DocProcessorOAuthProvider } from "./oauth/provider.js";
import { renderConsentPage } from "./oauth/consent.js";

setupLogging();

const PORT = Number(process.env.PORT) || 8443;
const PUBLIC_HOST = process.env.PUBLIC_HOST;
// Public HTTPS base URL of this server (e.g. https://works-mac-studio.<tailnet>.ts.net).
// When set, the OAuth 2.1 authorization server is enabled so claude.ai web — which
// only supports OAuth, not static bearer headers — can connect. Unset → bearer-only,
// preserving the original behavior used by Claude Code/Desktop/API and the tests.
const ISSUER_URL = process.env.ISSUER_URL;
const CONSENT_PATH = "/oauth/consent";

export function buildApp() {
  const app = express();
  // Trust only the local reverse proxy (Tailscale serve/funnel connects to
  // localhost:PORT and sets X-Forwarded-For to the real client). "loopback" lets
  // req.ip resolve to the actual client for rate limiting without letting remote
  // callers spoof X-Forwarded-For to bypass it — which a permissive `true` allows.
  app.set("trust proxy", "loopback");

  app.use(cors({
    origin: "*",
    exposedHeaders: ["WWW-Authenticate", "Mcp-Session-Id", "Mcp-Protocol-Version"],
  }));

  app.use(express.json({ limit: "40mb" }));

  app.get("/healthz", (_req, res) => {
    res.json({ ok: true, version: "1.0.0", tools: 13 });
  });

  // OAuth 2.1 authorization server (enabled only when ISSUER_URL is set). Mounts
  // /authorize, /token, /register (dynamic client registration), /revoke and the
  // .well-known metadata at the app root, per the MCP SDK contract. The login step
  // bridges to the existing tenant tokens via DocProcessorOAuthProvider.
  let oauthProvider = null;
  if (ISSUER_URL) {
    oauthProvider = new DocProcessorOAuthProvider({ consentPostPath: CONSENT_PATH });
    const issuerUrl = new URL(ISSUER_URL);
    const resourceServerUrl = new URL("/mcp", issuerUrl);

    // Advertise where MCP clients should look for OAuth metadata on a 401.
    setResourceMetadataUrl(getOAuthProtectedResourceMetadataUrl(resourceServerUrl));

    app.use(mcpAuthRouter({
      provider: oauthProvider,
      issuerUrl,
      resourceServerUrl,
      resourceName: "MCP Document Processor",
      scopesSupported: ["mcp"],
    }));

    // Consent form target: validate the pasted tenant token, mint an auth code,
    // and redirect back to the client. Re-render with an error on a bad token.
    app.post(CONSENT_PATH, express.urlencoded({ extended: false }), async (req, res) => {
      const { ok, redirectTo } = await oauthProvider.completeAuthorization({
        client_id: req.body.client_id,
        redirect_uri: req.body.redirect_uri,
        code_challenge: req.body.code_challenge,
        state: req.body.state,
        scope: req.body.scope,
        tenantToken: req.body.tenant_token,
      });
      if (!ok) {
        res.status(401).setHeader("Content-Type", "text/html; charset=utf-8");
        return res.send(renderConsentPage({
          action: CONSENT_PATH,
          clientName: req.body.client_id || "client",
          error: "That token was not recognized. Please try again.",
          params: {
            client_id: req.body.client_id || "",
            redirect_uri: req.body.redirect_uri || "",
            code_challenge: req.body.code_challenge || "",
            state: req.body.state || "",
            scope: req.body.scope || "",
            resource: req.body.resource || "",
          },
        }));
      }
      return res.redirect(302, redirectTo);
    });

    log("info", "[boot] OAuth authorization server enabled", { issuer: issuerUrl.href });
  }

  // Combined /mcp auth: accept an OAuth access token (claude.ai web) first, then
  // fall back to the static tenant bearer (Claude Code/Desktop/API). Either path
  // sets req.tenant so rate limiting + audit logging are unchanged.
  const mcpAuth = async (req, res, next) => {
    if (oauthProvider) {
      const m = /^Bearer\s+(.+)$/i.exec(req.headers.authorization || "");
      const token = m?.[1]?.trim();
      if (token) {
        try {
          const info = await oauthProvider.verifyAccessToken(token);
          req.tenant = { id: info.extra.tenantId, displayName: info.extra.displayName };
          return next();
        } catch { /* not an OAuth token — fall through to static bearer */ }
      }
    }
    return requireBearer(req, res, next);
  };

  mountAdminRoutes(app);

  const auditOnFinish = (req, res, started, toolName) => {
    res.on("finish", () => {
      const ms = Date.now() - started;
      const result = res.statusCode >= 400 ? "err" : "ok";
      log("info", "mcp_call", {
        tenant: req.tenant?.id || null,
        tool: toolName || "unknown",
        bytes_in: Number(req.headers["content-length"]) || 0,
        ms,
        result,
        status: res.statusCode,
      });
    });
  };

  app.post("/mcp", mcpAuth, tenantRateLimiter, async (req, res) => {
    const started = Date.now();
    const toolName = req.body?.method === "tools/call"
      ? req.body?.params?.name
      : req.body?.method;
    auditOnFinish(req, res, started, toolName);

    const server = new Server(
      { name: "mcp-doc-processor", version: "1.0.0" },
      {
        capabilities: { tools: {} },
        instructions: SERVER_INSTRUCTIONS,
      },
    );
    registerAllTools(server);

    const transportOpts = { sessionIdGenerator: undefined };
    if (PUBLIC_HOST) {
      transportOpts.enableDnsRebindingProtection = true;
      transportOpts.allowedHosts = [PUBLIC_HOST];
    }
    const transport = new StreamableHTTPServerTransport(transportOpts);

    res.on("close", () => {
      transport.close().catch(() => { /* best effort cleanup */ });
    });

    try {
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (err) {
      log("error", "[mcp] handleRequest failed", { error: err.message });
      if (!res.headersSent) {
        res.status(500).json({ jsonrpc: "2.0", error: { code: -32603, message: "internal error" }, id: req.body?.id ?? null });
      }
    }
  });

  return app;
}

const isDirectRun = import.meta.url === `file://${process.argv[1]}`;

if (isDirectRun) {
  const app = buildApp();
  if (!PUBLIC_HOST) {
    log("warn", "[boot] PUBLIC_HOST not set — DNS rebinding protection disabled. Set PUBLIC_HOST before exposing this server publicly.");
  }
  if (!ISSUER_URL) {
    log("warn", "[boot] ISSUER_URL not set — OAuth disabled (static bearer only). claude.ai web requires OAuth; set ISSUER_URL to the public https URL to enable it.");
  }
  app.listen(PORT, () => {
    log("info", `doc-processor HTTP listening on :${PORT}`);
  });
}
