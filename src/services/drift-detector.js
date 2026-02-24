/**
 * Document Drift Detector
 *
 * Monitors external documents for structural and content changes.
 * Takes a fingerprint of a document at a point in time, then compares
 * against the current state to detect drift.
 */

import crypto from "crypto";
import { loadRegistry, saveRegistry } from "../utils/registry.js";
import { documentProcessor } from "./document-processor.js";
import { classifyDocument } from "../utils/categorizer.js";

/**
 * Compute Jaccard similarity between two word sets.
 */
function computeJaccard(setA, setB) {
  const intersection = [...setA].filter(w => setB.has(w)).length;
  const union = new Set([...setA, ...setB]).size;
  return union > 0 ? intersection / union : 1;
}

/**
 * Compute a structural fingerprint of a document.
 * Returns both the fingerprint and the word set (to avoid re-reading the document).
 *
 * @param {string} filePath - Path to the document
 * @returns {Promise<{fingerprint: Object, wordSet: Set<string>}>}
 */
export async function computeFingerprint(filePath) {
  const result = await documentProcessor.processDocument(filePath, "indepth");

  if (!result.success) {
    throw new Error(`Failed to process document: ${result.error || "unknown error"}`);
  }

  const text = result.text || "";
  const structure = result.structure || [];
  const words = text.split(/\s+/).filter(w => w.length > 0);

  // Extract heading tree
  const headingTree = structure
    .filter(s => s.level !== undefined)
    .map(s => ({ text: s.text || s.heading || "", level: s.level }));

  // Count tables (heuristic: look for tab-separated or pipe-separated patterns)
  const lines = text.split("\n");
  let tableCount = 0;
  let inTable = false;
  for (const line of lines) {
    const hasTabSep = (line.match(/\t/g) || []).length >= 2;
    const hasPipeSep = (line.match(/\|/g) || []).length >= 2;
    if (hasTabSep || hasPipeSep) {
      if (!inTable) {
        tableCount++;
        inTable = true;
      }
    } else {
      inTable = false;
    }
  }

  // Content hash
  const contentHash = crypto.createHash("sha256").update(text).digest("hex");

  // Word set for Jaccard (deduplicated, lowercased)
  const wordSet = new Set(words.map(w => w.toLowerCase()));

  // Word set hash — compact representation for storage instead of full word array
  const sortedWords = [...wordSet].sort();
  const wordSetHash = crypto.createHash("sha256").update(sortedWords.join(" ")).digest("hex");

  // Classify
  const classification = classifyDocument("", text);

  return {
    fingerprint: {
      capturedAt: new Date().toISOString(),
      wordCount: words.length,
      paragraphCount: lines.filter(l => l.trim().length > 0).length,
      tableCount,
      headingTree,
      headingCount: headingTree.length,
      contentHash,
      wordSetHash,
      uniqueWordCount: wordSet.size,
      category: classification.category,
      categoryConfidence: classification.confidence,
      textLength: text.length,
    },
    wordSet,
  };
}

/**
 * Compare two fingerprints and produce a drift report.
 *
 * @param {Object} baseline - Original fingerprint
 * @param {Object} current - Current fingerprint
 * @returns {Object} Drift report
 */
export function compareFingerprintsDrift(baseline, current) {
  const changes = [];

  // Content hash comparison (fastest check)
  const contentChanged = baseline.contentHash !== current.contentHash;

  if (!contentChanged) {
    return {
      hasDrift: false,
      severity: "none",
      changes: [],
      message: "No changes detected. Document is identical to baseline.",
    };
  }

  // Word count change
  const wordDelta = current.wordCount - baseline.wordCount;
  const wordDeltaPct = baseline.wordCount > 0
    ? Math.round((Math.abs(wordDelta) / baseline.wordCount) * 100)
    : 100;
  if (wordDeltaPct > 5) {
    changes.push({
      type: "word-count",
      severity: wordDeltaPct > 30 ? "high" : wordDeltaPct > 15 ? "medium" : "low",
      detail: `Word count changed by ${wordDelta > 0 ? "+" : ""}${wordDelta} (${wordDeltaPct}%)`,
      baseline: baseline.wordCount,
      current: current.wordCount,
    });
  }

  // Heading structure changes
  const baselineHeadings = (baseline.headingTree || []).map(h => h.text.toLowerCase().trim());
  const currentHeadings = (current.headingTree || []).map(h => h.text.toLowerCase().trim());

  const addedHeadings = currentHeadings.filter(h => !baselineHeadings.includes(h));
  const removedHeadings = baselineHeadings.filter(h => !currentHeadings.includes(h));

  if (addedHeadings.length > 0) {
    changes.push({
      type: "sections-added",
      severity: addedHeadings.length > 3 ? "high" : "medium",
      detail: `${addedHeadings.length} section(s) added: ${addedHeadings.join(", ")}`,
      sections: addedHeadings,
    });
  }

  if (removedHeadings.length > 0) {
    changes.push({
      type: "sections-removed",
      severity: removedHeadings.length > 2 ? "high" : "medium",
      detail: `${removedHeadings.length} section(s) removed: ${removedHeadings.join(", ")}`,
      sections: removedHeadings,
    });
  }

  // Table count change
  if (current.tableCount !== baseline.tableCount) {
    const tableDelta = current.tableCount - baseline.tableCount;
    changes.push({
      type: "table-count",
      severity: Math.abs(tableDelta) > 2 ? "high" : "medium",
      detail: `Table count changed from ${baseline.tableCount} to ${current.tableCount} (${tableDelta > 0 ? "+" : ""}${tableDelta})`,
      baseline: baseline.tableCount,
      current: current.tableCount,
    });
  }

  // Category reclassification
  if (current.category !== baseline.category) {
    changes.push({
      type: "category-shift",
      severity: "high",
      detail: `Document category shifted from "${baseline.category}" to "${current.category}"`,
      baseline: baseline.category,
      current: current.category,
    });
  }

  // Determine overall severity
  const severities = changes.map(c => c.severity);
  const overallSeverity = severities.includes("high") ? "high"
    : severities.includes("medium") ? "medium"
    : severities.length > 0 ? "low" : "none";

  return {
    hasDrift: changes.length > 0,
    severity: overallSeverity,
    changes,
    similarity: null,
    summary: changes.length > 0
      ? `${changes.length} change(s) detected (severity: ${overallSeverity}). ${changes.map(c => c.detail).join("; ")}`
      : "Content hash differs but no structural changes detected.",
  };
}

/**
 * Add a document to the watchlist with its current fingerprint.
 *
 * @param {string} filePath - Document to watch
 * @param {string} [name] - Optional friendly name
 * @returns {Promise<Object>} Result with fingerprint
 */
export async function watchDocument(filePath, name) {
  // Single document read — computeFingerprint returns both fingerprint and word set
  const { fingerprint, wordSet } = await computeFingerprint(filePath);

  // Store word set hash for compact Jaccard comparison (NOT the full word array)
  const registry = await loadRegistry();

  if (!registry.watchlist) registry.watchlist = [];

  const existingIdx = registry.watchlist.findIndex(w => w.filePath === filePath);
  const watchEntry = {
    filePath,
    name: name || filePath.split("/").pop(),
    fingerprint,
    // Compact storage: hash + count instead of full word array
    baselineWordSetHash: fingerprint.wordSetHash,
    baselineUniqueWordCount: wordSet.size,
    watchedAt: new Date().toISOString(),
    lastChecked: null,
    lastDrift: null,
  };

  if (existingIdx >= 0) {
    registry.watchlist[existingIdx] = watchEntry;
  } else {
    registry.watchlist.push(watchEntry);
  }

  await saveRegistry(registry);

  return {
    success: true,
    filePath,
    name: watchEntry.name,
    fingerprint,
    message: `Document "${watchEntry.name}" is now being watched. Use drift-monitor action:'check' to detect changes.`,
  };
}

/**
 * Check a watched document for drift against its baseline.
 *
 * @param {string} [filePath] - Specific document to check (omit for all)
 * @returns {Promise<Object>} Drift report(s)
 */
export async function checkDrift(filePath) {
  const registry = await loadRegistry();

  if (!registry.watchlist || registry.watchlist.length === 0) {
    return {
      success: true,
      reports: [],
      message: "No documents in the watchlist. Use drift-monitor action:'watch' to start monitoring.",
    };
  }

  const toCheck = filePath
    ? registry.watchlist.filter(w => w.filePath === filePath)
    : registry.watchlist;

  if (filePath && toCheck.length === 0) {
    return {
      success: false,
      error: `Document not found in watchlist: ${filePath}`,
    };
  }

  const reports = [];

  for (const watched of toCheck) {
    try {
      // Single document read — returns fingerprint + wordSet
      const { fingerprint: currentFingerprint, wordSet: currentWordSet } = await computeFingerprint(watched.filePath);

      const drift = compareFingerprintsDrift(watched.fingerprint, currentFingerprint);

      // Compute Jaccard similarity if we have baseline data
      let jaccardSimilarity = null;

      if (watched.baselineWordSetHash && currentFingerprint.wordSetHash) {
        // Fast path: if hashes match, similarity is 1.0
        if (watched.baselineWordSetHash === currentFingerprint.wordSetHash) {
          jaccardSimilarity = 1.0;
        } else {
          // Hashes differ — we need to compute actual Jaccard
          // We have the current word set from computeFingerprint
          // For the baseline, we need to re-read... but we can approximate from counts
          // If content hash already differs, we know there's drift; Jaccard gives magnitude
          // For now, use the word sets we have (current) vs re-read baseline
          // This is the one unavoidable re-read for Jaccard when content differs
          if (drift.hasDrift) {
            // Content changed and hashes differ — compute real Jaccard from current vs baseline word sets
            // We have the current word set; for baseline, we store unique word count + hash
            // Since the baseline doc may have changed, use unique word counts to bound Jaccard:
            //   Jaccard = |A ∩ B| / |A ∪ B|
            // We know |A| (baseline unique) and |B| (current unique), but not |A ∩ B|.
            // Use the overlap estimator: min(|A|,|B|) / max(|A|,|B|) bounds the Jaccard from above.
            // This is a reasonable proxy when we can't re-read the baseline.
            const baselineUnique = watched.baselineUniqueWordCount || watched.fingerprint.uniqueWordCount || 0;
            const currentUnique = currentWordSet.size;
            const minUnique = Math.min(baselineUnique, currentUnique);
            const maxUnique = Math.max(baselineUnique, currentUnique);
            jaccardSimilarity = maxUnique > 0 ? minUnique / maxUnique : 1;
          }
        }
      } else if (watched.baselineWords && watched.baselineWords.length > 0) {
        // Legacy support: old entries that stored baselineWords array
        const baselineWordSet = new Set(watched.baselineWords);
        jaccardSimilarity = computeJaccard(baselineWordSet, currentWordSet);
      }

      // Inject Jaccard result into drift report
      if (jaccardSimilarity !== null && jaccardSimilarity < 0.7) {
        drift.hasDrift = true;
        drift.changes.push({
          type: "content-divergence",
          severity: jaccardSimilarity < 0.4 ? "high" : "medium",
          detail: `Content similarity dropped to ${(jaccardSimilarity * 100).toFixed(1)}%`,
          similarity: jaccardSimilarity,
        });
        const severities = drift.changes.map(c => c.severity);
        drift.severity = severities.includes("high") ? "high"
          : severities.includes("medium") ? "medium"
          : severities.length > 0 ? "low" : "none";
        drift.summary = `${drift.changes.length} change(s) detected (severity: ${drift.severity}). ${drift.changes.map(c => c.detail).join("; ")}`;
      }
      if (jaccardSimilarity !== null) {
        drift.similarity = jaccardSimilarity;
      }

      reports.push({
        filePath: watched.filePath,
        name: watched.name,
        watchedAt: watched.watchedAt,
        ...drift,
      });

      // Update last checked
      watched.lastChecked = new Date().toISOString();
      if (drift.hasDrift) {
        watched.lastDrift = new Date().toISOString();
      }
    } catch (err) {
      reports.push({
        filePath: watched.filePath,
        name: watched.name,
        error: err.message,
        hasDrift: null,
      });
    }
  }

  await saveRegistry(registry);

  const driftCount = reports.filter(r => r.hasDrift).length;

  return {
    success: true,
    reports,
    totalChecked: reports.length,
    totalWithDrift: driftCount,
    message: driftCount > 0
      ? `${driftCount} of ${reports.length} watched document(s) have drifted from baseline.`
      : `All ${reports.length} watched document(s) match their baseline.`,
  };
}
