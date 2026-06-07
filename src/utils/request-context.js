/**
 * Per-request context carried through the async call tree via AsyncLocalStorage.
 *
 * Why this exists: the HTTP transport builds a fresh MCP Server per request, but
 * the tools and the shared VisionService close over process-level config. To let
 * each caller bring their OWN Z.AI vision/OCR key — without threading it through
 * every tool schema (which would also leak the key into tool-call logs) — the HTTP
 * layer stashes it here for the duration of the request and vision-service.js reads
 * it back at call time, falling back to process.env (Z_AI_API_KEY / ZAI_API_KEY /
 * ANTHROPIC_AUTH_TOKEN).
 *
 * The stdio transport never populates the store, so it transparently falls back to
 * the process env (the user's mcp.json `env` block) — behaviour unchanged.
 *
 * Mirrors the X-Serper-Key / X-GitHub-Token pattern in mcp-web-search.
 */
import { AsyncLocalStorage } from "node:async_hooks";

/**
 * @typedef {Object} RequestCtx
 * @property {string} [zaiKey] Per-request Z.AI vision key (X-ZAI-Key header or ?zai_key).
 * @property {string} [outputDir] Per-request output sub-dir (X-Output-Dir header or
 *   ?output_dir), sandboxed under the server output base by getOutputRoot().
 */

/** @type {AsyncLocalStorage<RequestCtx>} */
export const requestContext = new AsyncLocalStorage();
