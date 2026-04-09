/**
 * Lineage Tool Handler
 *
 * Handler for the get-lineage tool. Traces the provenance chain for a document,
 * showing which sources informed it and what was derived from it.
 */

import { getLineage } from "../services/lineage-tracker.js";

/**
 * Handle get-lineage tool.
 *
 * @param {Object} params - Tool parameters
 * @param {string} params.filePath - Document path to trace lineage for
 * @param {number} [params.depth] - Traversal depth (default: 3)
 * @returns {Object} MCP response { content: [{ type: "text", text }], isError? }
 */
export async function handleGetLineage(params) {
  try {
    const lineageResult = await getLineage(params.filePath, params.depth || 3);
    return {
      content: [{ type: "text", text: JSON.stringify(lineageResult, null, 2) }],
      isError: !lineageResult.success,
    };
  } catch (err) {
    return {
      content: [{ type: "text", text: JSON.stringify({ success: false, error: err.message }, null, 2) }],
      isError: true,
    };
  }
}
