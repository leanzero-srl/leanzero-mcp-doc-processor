/**
 * Blueprint Tool Handler
 *
 * Consolidated handler for document blueprint management.
 * Actions: 'learn' extracts a blueprint from DOCX/PDF, 'list' shows all saved blueprints,
 * 'delete' removes one. Use blueprint name in create-doc to enforce structure.
 *
 * Backward-compatible aliases: learn-blueprint, list-blueprints
 */

import { extractBlueprintFromDocx, extractBlueprintFromPdf } from "../services/blueprint-extractor.js";
import { saveBlueprint, listBlueprints, deleteBlueprint } from "../utils/blueprint-store.js";

/**
 * Handle blueprint tool actions.
 *
 * @param {Object} params - Tool parameters
 * @param {string} params.action - Blueprint action: 'learn', 'list', or 'delete'
 * @param {string} [params.filePath] - Path to source document (learn only)
 * @param {string} [params.name] - Blueprint name (learn and delete)
 * @param {string} [params.description] - Optional description (learn only)
 * @param {string} toolName - Original tool name for backward compat alias resolution
 * @returns {Object} MCP response { content: [{ type: "text", text }], isError? }
 */
export async function handleBlueprint(params, toolName) {
  const bpAction = params.action || (toolName === "learn-blueprint" ? "learn" : toolName === "list-blueprints" ? "list" : null);

  if (bpAction === "learn") {
    try {
      const detected = params.filePath.toLowerCase();
      let blueprintData;

      if (detected.endsWith(".docx")) {
        blueprintData = await extractBlueprintFromDocx(params.filePath);
      } else if (detected.endsWith(".pdf")) {
        blueprintData = await extractBlueprintFromPdf(params.filePath);
      } else {
        return {
          content: [{ type: "text", text: JSON.stringify({ success: false, error: "Only DOCX and PDF files are supported for blueprint extraction." }, null, 2) }],
          isError: true,
        };
      }

      blueprintData.learnedFrom = params.filePath;
      const result = saveBlueprint(params.name, blueprintData, params.description);
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            ...result,
            message: `Blueprint "${params.name}" learned from ${params.filePath}.\nSections: ${blueprintData.sections.length}\nStyle: ${blueprintData.stylePreset}\nUse blueprint: "${params.name}" in create-doc.`,
          }, null, 2),
        }],
      };
    } catch (err) {
      return {
        content: [{ type: "text", text: JSON.stringify({ success: false, error: err.message }, null, 2) }],
        isError: true,
      };
    }
  }

  if (bpAction === "list") {
    const bpList = listBlueprints();
    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          success: true,
          count: bpList.length,
          blueprints: bpList,
          message: bpList.length > 0
            ? `${bpList.length} blueprint(s) available.`
            : "No blueprints yet. Use blueprint action:'learn' to extract from an existing document.",
        }, null, 2),
      }],
    };
  }

  if (bpAction === "delete") {
    if (!params.name) {
      return {
        content: [{ type: "text", text: JSON.stringify({ success: false, error: "Blueprint name is required for delete." }, null, 2) }],
        isError: true,
      };
    }
    const deleted = deleteBlueprint(params.name);
    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          success: deleted,
          message: deleted ? `Blueprint "${params.name}" deleted.` : `Blueprint "${params.name}" not found.`,
        }, null, 2),
      }],
    };
  }

  return {
    content: [{ type: "text", text: JSON.stringify({ success: false, error: `Unknown blueprint action: ${bpAction}. Use 'learn', 'list', or 'delete'.` }, null, 2) }],
    isError: true,
  };
}
