#!/usr/bin/env node

import express from "express";
import cors from "cors";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";

import { setupLogging, log } from "./utils/logger.js";
import { registerAllTools, SERVER_INSTRUCTIONS } from "./tool-registry.js";
import { requireBearer, tenantRateLimiter, mountAdminRoutes } from "./auth.js";

setupLogging();

const PORT = Number(process.env.PORT) || 8443;
const PUBLIC_HOST = process.env.PUBLIC_HOST;

export function buildApp() {
  const app = express();
  app.set("trust proxy", true);

  app.use(cors({
    origin: "*",
    exposedHeaders: ["WWW-Authenticate", "Mcp-Session-Id", "Mcp-Protocol-Version"],
  }));

  app.use(express.json({ limit: "40mb" }));

  app.get("/healthz", (_req, res) => {
    res.json({ ok: true, version: "1.0.0", tools: 13 });
  });

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

  app.post("/mcp", requireBearer, tenantRateLimiter, async (req, res) => {
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
  app.listen(PORT, () => {
    log("info", `doc-processor HTTP listening on :${PORT}`);
  });
}
