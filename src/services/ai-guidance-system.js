/**
 * AI Guidance System for Document Quality Control
 *
 * Design philosophy: Don't add tools for models to orchestrate.
 * Make the existing tools smarter by embedding guidance INTO the flow.
 *
 * This module provides:
 * 1. Pre-creation duplicate detection (called by create-doc internally)
 * 2. Document memory system (stored in DNA, not separate files)
 * 3. Actionable guidance text that models of any size can follow
 */

import fs from "fs/promises";
import { findDuplicateCandidates, unregisterDocument } from "../utils/registry.js";
import { log } from "../utils/logger.js";

/**
 * Check if a document with this title/category already exists in the registry.
 * Returns actionable guidance: create, augment, or replace.
 *
 * This is called INTERNALLY by create-doc before writing, so models
 * don't need to remember to call a separate tool first.
 *
 * @param {string} title - Document title
 * @param {string} [category] - Document category
 * @returns {Promise<Object>} Guidance result
 */
export async function checkForExistingDocument(title, category) {
  try {
    const candidates = await findDuplicateCandidates(title, category);

    if (candidates.length === 0) {
      return { action: "create", existing: null };
    }

    // Check which candidates still exist on disk
    const alive = [];
    const stale = [];

    for (const candidate of candidates) {
      try {
        await fs.access(candidate.filePath);
        const stats = await fs.stat(candidate.filePath);
        alive.push({ ...candidate, size: stats.size });
      } catch {
        stale.push(candidate);
      }
    }

    // Clean up stale registry entries (file was deleted but registry wasn't updated)
    for (const entry of stale) {
      try {
        await unregisterDocument(entry.filePath);
        log("info", "Cleaned stale registry entry:", { path: entry.filePath });
      } catch {
        // Non-fatal
      }
    }

    if (alive.length === 0) {
      return { action: "create", existing: null };
    }

    // Find the best existing document (most recent, largest)
    const best = alive.sort((a, b) => {
      const dateA = new Date(b.updatedAt || b.createdAt).getTime();
      const dateB = new Date(a.updatedAt || a.createdAt).getTime();
      return dateA - dateB || b.size - a.size;
    })[0];

    // If there are too many versions (3+), recommend replacing the best one
    if (alive.length >= 3) {
      return {
        action: "replace",
        existing: best,
        allVersions: alive,
        reason: `Found ${alive.length} versions of "${title}". The newest version should be replaced rather than creating yet another copy.`
      };
    }

    // Otherwise recommend augmenting the existing one
    return {
      action: "augment",
      existing: best,
      reason: `A document titled "${best.title}" already exists at ${best.filePath}. Use edit-doc to augment it instead of creating a duplicate.`
    };

  } catch (error) {
    log("error", "checkForExistingDocument failed:", { title, error: error.message });
    // On error, allow creation to proceed
    return { action: "create", existing: null };
  }
}

/**
 * Clean up excess document versions.
 * Keeps the most recent version and deletes older ones.
 * Called when too many versions are detected.
 *
 * @param {Array} versions - Array of document entries to clean up
 * @param {number} [keepCount=1] - Number of versions to keep
 * @returns {Promise<Object>} Cleanup result
 */
export async function cleanupExcessVersions(versions, keepCount = 1) {
  if (!versions || versions.length <= keepCount) {
    return { deleted: [], kept: versions || [] };
  }

  // Sort by most recent first
  const sorted = [...versions].sort((a, b) => {
    const dateA = new Date(b.updatedAt || b.createdAt).getTime();
    const dateB = new Date(a.updatedAt || a.createdAt).getTime();
    return dateA - dateB;
  });

  const kept = sorted.slice(0, keepCount);
  const toDelete = sorted.slice(keepCount);
  const deleted = [];

  for (const entry of toDelete) {
    try {
      await fs.unlink(entry.filePath);
      await unregisterDocument(entry.filePath);
      deleted.push(entry.filePath);
      log("info", "Deleted excess document version:", { path: entry.filePath });
    } catch (error) {
      log("warn", "Failed to delete excess version:", {
        path: entry.filePath,
        error: error.message
      });
    }
  }

  return { deleted, kept };
}

/**
 * Build the guidance message that gets included in create-doc's response.
 * This is what models actually see and act on. Must be clear enough for
 * a 7B parameter model to follow.
 *
 * @param {Object} check - Result from checkForExistingDocument
 * @returns {string} Guidance text
 */
export function buildGuidanceMessage(check) {
  if (check.action === "create") {
    return "";
  }

  if (check.action === "augment") {
    return (
      `\n\nDUPLICATE DETECTED: ${check.reason}\n` +
      `ACTION REQUIRED: Use edit-doc with filePath "${check.existing.filePath}" and action "append" to add content to the existing document.\n` +
      `DO NOT call create-doc again for this document.`
    );
  }

  if (check.action === "replace") {
    return (
      `\n\nTOO MANY VERSIONS DETECTED: ${check.reason}\n` +
      `ACTION REQUIRED: Use edit-doc with filePath "${check.existing.filePath}" and action "replace" to overwrite the existing document with better content.\n` +
      `DO NOT create another version. The old excess versions have been cleaned up.`
    );
  }

  return "";
}
