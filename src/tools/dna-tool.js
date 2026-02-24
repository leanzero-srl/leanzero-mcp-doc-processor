/**
 * DNA Tool Handler
 *
 * Consolidated handler for Document DNA management.
 * Actions: 'init' creates DNA with defaults, 'get' returns current config/memories/usage,
 * 'evolve' analyzes usage patterns and suggests improvements.
 *
 * Backward-compatible aliases: init-dna, get-dna, evolve-dna
 */

import { loadDNA, createDNAFile, analyzeProjectProfile, analyzeTrends, applyEvolution } from "../utils/dna-manager.js";

/**
 * Handle DNA tool actions.
 *
 * @param {Object} params - Tool parameters
 * @param {string} params.action - DNA action: 'init', 'get', or 'evolve'
 * @param {string} [params.companyName] - Company name (init only)
 * @param {string} [params.stylePreset] - Style preset (init only)
 * @param {string} [params.headerText] - Header text (init only)
 * @param {string} [params.headerAlignment] - Header alignment (init only)
 * @param {string} [params.footerText] - Footer text (init only)
 * @param {string} [params.footerAlignment] - Footer alignment (init only)
 * @param {boolean} [params.apply] - Auto-apply top suggestion (evolve only)
 * @param {number} [params.threshold] - Minimum docs threshold (evolve only)
 * @param {string} toolName - Original tool name for backward compat alias resolution
 * @returns {Object} MCP response { content: [{ type: "text", text }], isError? }
 */
export async function handleDNA(params, toolName) {
  const dnaAction = params.action || (toolName === "init-dna" ? "init" : toolName === "get-dna" ? "get" : toolName === "evolve-dna" ? "evolve" : null);

  if (dnaAction === "init") {
    try {
      const result = createDNAFile({
        company: { name: params.companyName },
        defaults: { stylePreset: params.stylePreset },
        header: { text: params.headerText || params.companyName, alignment: params.headerAlignment },
        footer: { text: params.footerText, alignment: params.footerAlignment },
      });
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            success: true,
            path: result.path,
            config: result.config,
            message:
              `Document DNA initialized at: ${result.path}\n\n` +
              `All future documents will automatically include:\n` +
              `- Header: "${result.config.header.text}" (${result.config.header.alignment}-aligned)\n` +
              `- Footer: "${result.config.footer.text}" (${result.config.footer.alignment}-aligned)\n` +
              `- Style: ${result.config.defaults.stylePreset}\n\n` +
              `Override any of these by explicitly passing header, footer, or stylePreset to create-doc.`,
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

  if (dnaAction === "get") {
    const dna = loadDNA();
    const memoriesList = dna && dna.memories
      ? Object.entries(dna.memories).map(([key, val]) => `  - ${key}: "${val.text}"`)
      : [];
    const profile = analyzeProjectProfile();

    let profileMsg = "";
    if (profile) {
      profileMsg = `\n\nProject profile (${profile.totalDocs} documents created):`;
      if (profile.dominantCategory) profileMsg += `\n  Most used category: ${profile.dominantCategory} (${profile.dominantCategoryPct}%)`;
      if (profile.dominantStyle) profileMsg += `\n  Most used style: ${profile.dominantStyle} (${profile.dominantStylePct}%)`;
      if (profile.suggestion) profileMsg += `\n  Suggestion: ${profile.suggestion}`;
    }

    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          initialized: dna !== null,
          config: dna || null,
          memoriesCount: memoriesList.length,
          projectProfile: profile,
          message: dna
            ? "Document DNA is configured." +
              (memoriesList.length > 0
                ? `\n\nActive memories (${memoriesList.length}):\n${memoriesList.join("\n")}`
                : "\n\nNo document memories stored yet.") +
              profileMsg
            : "Document DNA is not initialized. Use dna action:'init' to set up.",
        }, null, 2),
      }],
    };
  }

  if (dnaAction === "evolve") {
    try {
      const trends = analyzeTrends(params.threshold || 5);
      if (!trends.ready) {
        return { content: [{ type: "text", text: JSON.stringify(trends, null, 2) }] };
      }

      if (params.apply && trends.suggestions && trends.suggestions.length > 0) {
        const topSuggestion = trends.suggestions.find(s => s.mutation);
        if (topSuggestion) {
          const evolutionResult = applyEvolution(topSuggestion.mutation);
          return {
            content: [{
              type: "text",
              text: JSON.stringify({ ...trends, applied: evolutionResult, message: `Evolution applied: ${evolutionResult.message}` }, null, 2),
            }],
          };
        }
      }

      return { content: [{ type: "text", text: JSON.stringify(trends, null, 2) }] };
    } catch (err) {
      return {
        content: [{ type: "text", text: JSON.stringify({ success: false, error: err.message }, null, 2) }],
        isError: true,
      };
    }
  }

  return {
    content: [{ type: "text", text: JSON.stringify({ success: false, error: `Unknown dna action: ${dnaAction}. Use 'init', 'get', or 'evolve'.` }, null, 2) }],
    isError: true,
  };
}
