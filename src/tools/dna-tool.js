/**
 * DNA Tool Handler
 *
 * Consolidated handler for Document DNA management and memory.
 * Actions: 'init', 'get', 'evolve', 'save-memory', 'delete-memory'
 *
 * Backward-compatible aliases: init-dna, get-dna, evolve-dna, save-memory, delete-memory, memory
 */

import { loadDNA, createDNAFile, analyzeProjectProfile, analyzeTrends, applyEvolution, detectRecurringStructures, convertSignatureToBlueprint, generateAutoBlueprintName } from "../utils/dna-manager.js";
import { saveBlueprint, listBlueprints } from "../utils/blueprint-store.js";
import { log } from "../utils/logger.js";

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
  // Resolve action from params or legacy tool name
  let dnaAction = params.action;
  if (!dnaAction) {
    if (toolName === "init-dna") dnaAction = "init";
    else if (toolName === "get-dna") dnaAction = "get";
    else if (toolName === "evolve-dna") dnaAction = "evolve";
    else if (toolName === "save-memory") dnaAction = "save-memory";
    else if (toolName === "delete-memory") dnaAction = "delete-memory";
    else if (toolName === "memory") dnaAction = params.memory ? "save-memory" : "delete-memory";
  }
  // Legacy "memory" tool used action: "save"/"delete" — map to "save-memory"/"delete-memory"
  if (dnaAction === "save") dnaAction = "save-memory";
  if (dnaAction === "delete") dnaAction = "delete-memory";

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

      let evolveResult = { ...trends };

      if (params.apply && trends.suggestions && trends.suggestions.length > 0) {
        const topSuggestion = trends.suggestions.find(s => s.mutation);
        if (topSuggestion) {
          const evolutionResult = applyEvolution(topSuggestion.mutation);
          evolveResult.applied = evolutionResult;
          evolveResult.message = `Evolution applied: ${evolutionResult.message}`;
        }
      }

      // Check for recurring structures and auto-learn as blueprints
      const structureAnalysis = detectRecurringStructures();
      if (structureAnalysis.found) {
        evolveResult.recurringStructures = structureAnalysis.suggestions;

        // Auto-save recurring structures as blueprints (non-fatal)
        try {
          const existingBps = listBlueprints();
          const autoLearnedBlueprints = [];

          for (const suggestion of structureAnalysis.suggestions) {
            const name = generateAutoBlueprintName(suggestion, existingBps);
            const blueprint = convertSignatureToBlueprint(suggestion);
            saveBlueprint(name, blueprint, blueprint.learnedFrom);
            autoLearnedBlueprints.push({ name, headingCount: suggestion.headingCount, occurrences: suggestion.occurrences });
          }

          if (autoLearnedBlueprints.length > 0) {
            evolveResult.autoLearnedBlueprints = autoLearnedBlueprints;
          }
        } catch (bpErr) {
          log("warn", "Auto-blueprint learning failed (non-fatal):", { error: bpErr.message });
        }
      }

      return { content: [{ type: "text", text: JSON.stringify(evolveResult, null, 2) }] };
    } catch (err) {
      return {
        content: [{ type: "text", text: JSON.stringify({ success: false, error: err.message }, null, 2) }],
        isError: true,
      };
    }
  }

  // === MEMORY ACTIONS ===
  if (dnaAction === "save-memory") {
    const { memory, key } = params;
    if (!memory) {
      return {
        content: [{ type: "text", text: "Error: memory is required (a string describing the preference)" }],
        isError: true,
      };
    }
    try {
      const dna = loadDNA() || {};
      const memories = dna.memories || {};
      const memoryKey = key || generateMemoryKey(memory);
      memories[memoryKey] = { text: memory, createdAt: new Date().toISOString() };
      createDNAFile({ ...dna, memories });
      log("info", "Saved document memory:", { key: memoryKey, memory });
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            success: true,
            key: memoryKey,
            totalMemories: Object.keys(memories).length,
            message: `Memory saved: "${memory}". This will influence future document creation.`,
          }, null, 2),
        }],
      };
    } catch (error) {
      log("error", "save-memory failed:", { memory, error: error.message });
      return {
        content: [{ type: "text", text: `Error saving memory: ${error.message}` }],
        isError: true,
      };
    }
  }

  if (dnaAction === "delete-memory") {
    const { key } = params;
    if (!key) {
      return {
        content: [{ type: "text", text: "Error: key is required" }],
        isError: true,
      };
    }
    try {
      const dna = loadDNA() || {};
      const memories = dna.memories || {};
      if (!memories[key]) {
        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              success: false,
              message: `No memory found with key "${key}". Use dna action:'get' to see current memories.`,
            }, null, 2),
          }],
        };
      }
      delete memories[key];
      createDNAFile({ ...dna, memories });
      log("info", "Deleted document memory:", { key });
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            success: true,
            key,
            totalMemories: Object.keys(memories).length,
            message: `Memory "${key}" deleted.`,
          }, null, 2),
        }],
      };
    } catch (error) {
      log("error", "delete-memory failed:", { key, error: error.message });
      return {
        content: [{ type: "text", text: `Error deleting memory: ${error.message}` }],
        isError: true,
      };
    }
  }

  return {
    content: [{ type: "text", text: JSON.stringify({ success: false, error: `Unknown dna action: ${dnaAction}. Use 'init', 'get', 'evolve', 'save-memory', or 'delete-memory'.` }, null, 2) }],
    isError: true,
  };
}

/**
 * Generate a short key from memory text.
 */
function generateMemoryKey(text) {
  const stopWords = new Set(["a", "an", "the", "is", "are", "was", "were", "be",
    "been", "being", "have", "has", "had", "do", "does", "did", "will", "would",
    "could", "should", "may", "might", "shall", "can", "to", "of", "in", "for",
    "on", "with", "at", "by", "from", "as", "into", "through", "during", "before",
    "after", "above", "below", "between", "and", "but", "or", "not", "no", "all",
    "each", "every", "both", "few", "more", "most", "other", "some", "such",
    "than", "too", "very", "just", "always", "use", "never"]);

  const words = text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .split(/\s+/)
    .filter(w => w.length > 1 && !stopWords.has(w))
    .slice(0, 4);

  return words.join("-") || `memory-${Date.now()}`;
}
