/**
 * AI Guidance Tools for MCP Server
 *
 * Two lean tools instead of seven bloated ones:
 * 1. check-document - Pre-creation check: should I create, augment, or replace?
 * 2. save-memory    - Store document preferences/personality in DNA memories
 */

import { checkForExistingDocument, cleanupExcessVersions } from "../services/ai-guidance-system.js";
import { loadDNA, createDNAFile } from "../utils/dna-manager.js";
import { log } from "../utils/logger.js";

/**
 * Check if a document should be created, augmented, or replaced.
 * Models call this BEFORE creating a document to get clear, actionable guidance.
 *
 * Returns one of:
 *   action: "create"  → No existing document, proceed with create-doc
 *   action: "augment" → Document exists, use edit-doc with action "append"
 *   action: "replace" → Too many versions, use edit-doc with action "replace"
 */
export async function handleCheckDocument(params) {
  const { title, category } = params || {};

  if (!title) {
    return {
      content: [{ type: "text", text: "Error: title is required" }],
      isError: true
    };
  }

  try {
    const check = await checkForExistingDocument(title, category);

    // If too many versions, clean up automatically
    if (check.action === "replace" && check.allVersions) {
      const cleanup = await cleanupExcessVersions(check.allVersions, 1);
      log("info", "Auto-cleaned excess versions:", {
        deleted: cleanup.deleted.length,
        kept: cleanup.kept.length
      });
      check.cleanedUp = cleanup.deleted;
    }

    // Build a clear response that even small models can act on
    let guidance;
    if (check.action === "create") {
      guidance = `PROCEED: No existing document found for "${title}". Use create-doc to create it.`;
    } else if (check.action === "augment") {
      guidance = (
        `EXISTING DOCUMENT FOUND: "${check.existing.title}" at ${check.existing.filePath}\n` +
        `ACTION: Use edit-doc with filePath "${check.existing.filePath}" and action "append" to add your content.\n` +
        `DO NOT use create-doc — it would create a duplicate.`
      );
    } else if (check.action === "replace") {
      guidance = (
        `TOO MANY VERSIONS: Found multiple versions of "${title}". Old copies have been cleaned up.\n` +
        `ACTION: Use edit-doc with filePath "${check.existing.filePath}" and action "replace" to write the correct content.\n` +
        `DO NOT use create-doc — use edit-doc with action "replace" instead.`
      );
    }

    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          action: check.action,
          guidance,
          existingPath: check.existing?.filePath || null,
          cleanedUp: check.cleanedUp || null
        }, null, 2)
      }]
    };
  } catch (error) {
    log("error", "handleCheckDocument failed:", { title, error: error.message });
    return {
      content: [{ type: "text", text: `Error checking document: ${error.message}` }],
      isError: true
    };
  }
}

/**
 * Save a document-related memory to the DNA configuration.
 * This is the ByteRover-style memory store but scoped to document creation.
 *
 * Memories are stored in .document-dna.json under the "memories" key.
 * They persist across sessions and influence how documents are created.
 *
 * Examples:
 *   "Always use formal tone for business documents"
 *   "Company reports should include an executive summary"
 *   "Use metric units, not imperial"
 */
export async function handleSaveMemory(params) {
  const { memory, key } = params || {};

  if (!memory) {
    return {
      content: [{ type: "text", text: "Error: memory is required (a string describing the preference)" }],
      isError: true
    };
  }

  try {
    const dna = loadDNA() || {};
    const memories = dna.memories || {};

    // Use provided key or generate one from the memory text
    const memoryKey = key || generateMemoryKey(memory);

    memories[memoryKey] = {
      text: memory,
      createdAt: new Date().toISOString()
    };

    // Save back to DNA
    createDNAFile({
      ...dna,
      memories
    });

    log("info", "Saved document memory:", { key: memoryKey, memory });

    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          success: true,
          key: memoryKey,
          totalMemories: Object.keys(memories).length,
          message: `Memory saved: "${memory}". This will influence future document creation.`
        }, null, 2)
      }]
    };
  } catch (error) {
    log("error", "handleSaveMemory failed:", { memory, error: error.message });
    return {
      content: [{ type: "text", text: `Error saving memory: ${error.message}` }],
      isError: true
    };
  }
}

/**
 * Delete a specific memory from DNA.
 */
export async function handleDeleteMemory(params) {
  const { key } = params || {};

  if (!key) {
    return {
      content: [{ type: "text", text: "Error: key is required" }],
      isError: true
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
            message: `No memory found with key "${key}". Use get-dna to see current memories.`
          }, null, 2)
        }]
      };
    }

    delete memories[key];

    createDNAFile({
      ...dna,
      memories
    });

    log("info", "Deleted document memory:", { key });

    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          success: true,
          key,
          totalMemories: Object.keys(memories).length,
          message: `Memory "${key}" deleted.`
        }, null, 2)
      }]
    };
  } catch (error) {
    log("error", "handleDeleteMemory failed:", { key, error: error.message });
    return {
      content: [{ type: "text", text: `Error deleting memory: ${error.message}` }],
      isError: true
    };
  }
}

/**
 * Generate a short key from memory text.
 * Takes first few meaningful words and joins with hyphens.
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
