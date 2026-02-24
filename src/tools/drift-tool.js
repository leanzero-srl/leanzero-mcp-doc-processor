/**
 * Drift Monitor Tool Handler
 *
 * Consolidated handler for document drift monitoring.
 * Actions: 'watch' registers a document with a baseline fingerprint,
 * 'check' compares current state against baseline.
 *
 * Backward-compatible aliases: watch-document, check-drift
 */

import { watchDocument, checkDrift } from "../services/drift-detector.js";

/**
 * Handle drift-monitor tool actions.
 *
 * @param {Object} params - Tool parameters
 * @param {string} params.action - Drift action: 'watch' or 'check'
 * @param {string} [params.filePath] - Document path (required for watch, optional for check)
 * @param {string} [params.name] - Optional friendly name (watch only)
 * @param {string} toolName - Original tool name for backward compat alias resolution
 * @returns {Object} MCP response { content: [{ type: "text", text }], isError? }
 */
export async function handleDriftMonitor(params, toolName) {
  const driftAction = params.action || (toolName === "watch-document" ? "watch" : toolName === "check-drift" ? "check" : null);

  if (driftAction === "watch") {
    try {
      const watchResult = await watchDocument(params.filePath, params.name);
      return {
        content: [{ type: "text", text: JSON.stringify(watchResult, null, 2) }],
        isError: !watchResult.success,
      };
    } catch (err) {
      return {
        content: [{ type: "text", text: JSON.stringify({ success: false, error: err.message }, null, 2) }],
        isError: true,
      };
    }
  }

  if (driftAction === "check") {
    try {
      const driftResult = await checkDrift(params.filePath);
      return {
        content: [{ type: "text", text: JSON.stringify(driftResult, null, 2) }],
        isError: !driftResult.success,
      };
    } catch (err) {
      return {
        content: [{ type: "text", text: JSON.stringify({ success: false, error: err.message }, null, 2) }],
        isError: true,
      };
    }
  }

  return {
    content: [{ type: "text", text: JSON.stringify({ success: false, error: `Unknown drift-monitor action: ${driftAction}. Use 'watch' or 'check'.` }, null, 2) }],
    isError: true,
  };
}
