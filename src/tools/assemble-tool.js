/**
 * Assemble Document Tool Handler
 *
 * Assembles a new document from multiple sources. 'concatenate' joins all
 * sequentially, 'cherry-pick' selects specific sections. Optionally validates
 * against a blueprint. Respects DNA defaults.
 */

import { assembleDocument } from "../services/document-assembler.js";

/**
 * Handle assemble-document tool.
 *
 * @param {Object} params - Tool parameters
 * @param {Array} params.sources - Source documents and section selections
 * @param {string} params.outputTitle - Title for the assembled document
 * @param {string} [params.mode] - Assembly mode: 'concatenate' (default) or 'cherry-pick'
 * @param {string} [params.blueprint] - Blueprint name to validate against
 * @param {string} [params.stylePreset] - Style preset
 * @param {string} [params.outputPath] - Output file path
 * @param {string} [params.category] - Document category
 * @param {Array} [params.tags] - Tags for registry
 * @returns {Object} MCP response { content: [{ type: "text", text }], isError? }
 */
export async function handleAssembleDocument(params) {
  try {
    const assembleResult = await assembleDocument({
      sources: params.sources,
      outputTitle: params.outputTitle,
      mode: params.mode || "concatenate",
      blueprint: params.blueprint,
      stylePreset: params.stylePreset,
      outputPath: params.outputPath,
      category: params.category,
      tags: params.tags,
    });

    return {
      content: [{ type: "text", text: JSON.stringify(assembleResult, null, 2) }],
      isError: !assembleResult.success,
    };
  } catch (err) {
    return {
      content: [{ type: "text", text: JSON.stringify({ success: false, error: err.message }, null, 2) }],
      isError: true,
    };
  }
}
