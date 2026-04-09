/**
 * Document Lineage Tracker
 *
 * Tracks causal relationships between documents: when an AI reads document A
 * and then creates document B, the system records that B was derived from A.
 * This builds a provenance graph across the document registry.
 */

import { loadRegistry, saveRegistry } from "../utils/registry.js";

// Session-scoped state: tracks which documents were read recently
const recentlyRead = new Map(); // filePath -> { readAt, tool }

/**
 * Record that a document was read in the current session.
 * Called by reading tools (get-doc-summary, get-doc-indepth, get-doc-focused).
 *
 * @param {string} filePath - Absolute path to the document read
 * @param {string} tool - Name of the tool that read it
 */
export function recordRead(filePath, tool) {
  recentlyRead.set(filePath, {
    readAt: new Date().toISOString(),
    tool,
  });
}

/**
 * Record that a document was written, capturing lineage from recently-read documents.
 * Called by creation/editing tools (create-doc, edit-doc).
 *
 * After recording, clears the recently-read set so the next write cycle starts fresh.
 *
 * @param {string} outputPath - Absolute path to the written document
 * @returns {Promise<Object|null>} Lineage record or null if no sources
 */
export async function recordWrite(outputPath) {
  if (recentlyRead.size === 0) return null;

  const sources = [];
  for (const [filePath, info] of recentlyRead.entries()) {
    // Don't record self-references (editing the same file you read)
    if (filePath === outputPath) continue;
    sources.push({
      filePath,
      readAt: info.readAt,
      tool: info.tool,
    });
  }

  if (sources.length === 0) {
    recentlyRead.clear();
    return null;
  }

  const lineageRecord = {
    sources,
    createdAt: new Date().toISOString(),
  };

  // Update registry with lineage information
  try {
    const registry = await loadRegistry();

    // Find the target document in registry and add sources
    const targetDoc = registry.documents.find(d => d.filePath === outputPath);
    if (targetDoc) {
      if (!targetDoc.lineage) targetDoc.lineage = { sources: [], derivatives: [] };
      // Append new sources (avoid duplicates by filePath)
      for (const src of sources) {
        const exists = targetDoc.lineage.sources.some(s => s.filePath === src.filePath);
        if (!exists) {
          targetDoc.lineage.sources.push(src);
        }
      }
    }

    // Update each source document's derivatives list
    for (const src of sources) {
      const sourceDoc = registry.documents.find(d => d.filePath === src.filePath);
      if (sourceDoc) {
        if (!sourceDoc.lineage) sourceDoc.lineage = { sources: [], derivatives: [] };
        const exists = sourceDoc.lineage.derivatives.some(d => d.filePath === outputPath);
        if (!exists) {
          sourceDoc.lineage.derivatives.push({
            filePath: outputPath,
            createdAt: lineageRecord.createdAt,
          });
        }
      }
    }

    await saveRegistry(registry);
  } catch (err) {
    // Lineage tracking is non-fatal
    console.warn("[lineage-tracker] Failed to update registry:", err.message);
  }

  // Clear reads for next cycle
  recentlyRead.clear();

  return lineageRecord;
}

/**
 * Get the lineage graph for a document.
 * Traverses upstream (sources) and downstream (derivatives) to the requested depth.
 *
 * @param {string} filePath - Document to trace lineage for
 * @param {number} [depth=3] - How many levels deep to traverse
 * @returns {Promise<Object>} Lineage graph
 */
export async function getLineage(filePath, depth = 3) {
  const registry = await loadRegistry();
  const doc = registry.documents.find(d => d.filePath === filePath);

  if (!doc) {
    return {
      success: false,
      error: `Document not found in registry: ${filePath}`,
    };
  }

  const visited = new Set();

  // Traverse upstream (sources)
  function traceUpstream(docEntry, currentDepth) {
    if (currentDepth <= 0 || !docEntry || visited.has(docEntry.filePath)) return [];
    visited.add(docEntry.filePath);

    const sources = docEntry.lineage?.sources || [];
    return sources.map(src => {
      const srcDoc = registry.documents.find(d => d.filePath === src.filePath);
      return {
        filePath: src.filePath,
        title: srcDoc?.title || "(external)",
        readAt: src.readAt,
        tool: src.tool,
        category: srcDoc?.category || null,
        upstream: traceUpstream(srcDoc, currentDepth - 1),
      };
    });
  }

  // Traverse downstream (derivatives)
  visited.clear();
  function traceDownstream(docEntry, currentDepth) {
    if (currentDepth <= 0 || !docEntry || visited.has(docEntry.filePath)) return [];
    visited.add(docEntry.filePath);

    const derivatives = docEntry.lineage?.derivatives || [];
    return derivatives.map(der => {
      const derDoc = registry.documents.find(d => d.filePath === der.filePath);
      return {
        filePath: der.filePath,
        title: derDoc?.title || "(unknown)",
        createdAt: der.createdAt,
        category: derDoc?.category || null,
        downstream: traceDownstream(derDoc, currentDepth - 1),
      };
    });
  }

  visited.clear();
  const upstream = traceUpstream(doc, depth);
  visited.clear();
  const downstream = traceDownstream(doc, depth);

  return {
    success: true,
    document: {
      filePath: doc.filePath,
      title: doc.title,
      category: doc.category,
      createdAt: doc.createdAt,
    },
    upstream,
    downstream,
    totalSources: doc.lineage?.sources?.length || 0,
    totalDerivatives: doc.lineage?.derivatives?.length || 0,
  };
}

/**
 * Get the current set of recently-read documents (for debugging/inspection).
 * @returns {Array<Object>} Recently read documents
 */
export function getRecentlyRead() {
  return Array.from(recentlyRead.entries()).map(([filePath, info]) => ({
    filePath,
    ...info,
  }));
}

/**
 * Clear the recently-read set (useful for testing).
 */
export function clearRecentlyRead() {
  recentlyRead.clear();
}
