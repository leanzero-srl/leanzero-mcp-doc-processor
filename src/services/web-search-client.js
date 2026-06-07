import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

import { log } from "../utils/logger.js";

/**
 * Cross-MCP bridge: doc-processor acts as an MCP CLIENT to the hosted
 * mcp-web-search server. This lets doc-processor tools (e.g. fact-check) reuse
 * web-search's live search/extraction — a real function spanning the two MCPs,
 * rather than duplicating search here.
 *
 * Connect over the PUBLIC (Funnel) URL: web-search enables DNS-rebinding
 * protection when PUBLIC_HOST is set, so a 127.0.0.1 Host header would be 403'd;
 * the Funnel URL's Host matches the allow-list.
 */
export const DEFAULT_WEB_SEARCH_URL =
  process.env.WEB_SEARCH_MCP_URL || "https://worksmacstudio.tailfc4700.ts.net:8443/mcp";

/**
 * Call one tool on the web-search MCP. Returns { ok, text, isError }.
 * @param {{url?:string, bearer?:string, serperKey?:string, githubToken?:string}} cfg
 * @param {string} toolName
 * @param {Object} args
 */
export async function callWebSearchTool(cfg, toolName, args) {
  const target = cfg.url || DEFAULT_WEB_SEARCH_URL;
  const headers = {};
  if (cfg.bearer) headers["Authorization"] = `Bearer ${cfg.bearer}`;
  if (cfg.serperKey) headers["X-Serper-Key"] = cfg.serperKey;
  if (cfg.githubToken) headers["X-GitHub-Token"] = cfg.githubToken;

  const transport = new StreamableHTTPClientTransport(new URL(target), { requestInit: { headers } });
  const client = new Client({ name: "doc-processor-cross-mcp", version: "1.0.0" });
  await client.connect(transport);
  try {
    const res = await client.callTool({ name: toolName, arguments: args });
    const text = (res?.content || [])
      .filter((b) => b && b.type === "text")
      .map((b) => b.text)
      .join("\n");
    return { ok: !res?.isError, text, isError: !!res?.isError };
  } catch (err) {
    log("warn", "[web-search-client] call failed", { tool: toolName, error: err.message });
    throw err;
  } finally {
    await client.close().catch(() => { /* best effort */ });
  }
}

/** Run async tasks with a small concurrency cap (keeps cross-MCP calls bounded). */
export async function mapWithConcurrency(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return out;
}
