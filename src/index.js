#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { setupLogging, log } from "./utils/logger.js";
import { registerAllTools, SERVER_INSTRUCTIONS } from "./tool-registry.js";

setupLogging();

const server = new Server(
  { name: "mcp-doc-processor", version: "1.0.0" },
  {
    capabilities: { tools: {} },
    instructions: SERVER_INSTRUCTIONS,
  },
);

registerAllTools(server);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  log("info", "MCP Document Processor running on stdio");
}

main().catch((error) => {
  log("fatal", "Server startup failed:", { error: error.message });
  process.exit(1);
});
