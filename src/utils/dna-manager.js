import fs from "fs";
import path from "path";

const DNA_FILENAME = ".document-dna.json";

// Import inheritance system (use aliases to avoid circular references)
import {
  getSystemDefaults,
  loadProjectDNA as _loadProjectDNA,
  loadUserDNA as _loadUserDNA,
  mergeDNALevels as _mergeDNALevels,
  clearDNACache as clearInheritanceCache
} from "./dna-inheritance.js";

// Import schema validation for DNA configuration
import { validateDNA, applyMigration } from "./dna-schema.js";

// Module-level cache for DNA config (backward compatibility)
let _cache = { path: null, mtime: 0, data: null };

/**
 * Returns the default DNA configuration template.
 * @returns {Object} Default DNA config
 */
export function getDefaultDNA() {
  return getSystemDefaults();
}

/**
 * Loads the .document-dna.json file from the project root.
 * Uses an in-memory cache with mtime checking for performance.
 *
 * @param {string} [projectRoot] - Project root directory (default: process.cwd())
 * @returns {Object|null} Parsed DNA config, or null if file doesn't exist
 */
export function loadDNA(projectRoot) {
  const root = projectRoot || process.cwd();
  const filePath = path.join(root, DNA_FILENAME);

  try {
    const stat = fs.statSync(filePath);
    const mtime = stat.mtimeMs;

    // Return cached data if file hasn't changed
    if (_cache.path === filePath && _cache.mtime === mtime) {
      return _cache.data;
    }

    const content = fs.readFileSync(filePath, "utf-8");
    const data = JSON.parse(content);

    // Validate loaded DNA
    const validation = validateDNA(data);
    
    if (!validation.valid) {
      console.warn(
        `[dna-manager] DNA validation failed for ${DNA_FILENAME}: ${validation.errors.join(", ")}`
      );
      console.warn("[dna-manager] Using DNA but validation issues should be addressed.");
    }

    // Apply migration if needed
    const migrated = applyMigration(data);

    // Update cache
    _cache = { path: filePath, mtime, data: migrated };

    return migrated;
  } catch (err) {
    if (err.code === "ENOENT") {
      return null;
    }
    console.warn(`[dna-manager] Failed to load ${DNA_FILENAME}:`, err.message);
    return null;
  }
}

/**
 * Loads the .document-dna.json file from the project root.
 * Wrapper for loadProjectDNA to maintain backward compatibility.
 *
 * @param {string} [projectRoot] - Project root directory (default: process.cwd())
 * @returns {Object|null} Parsed project DNA config, or null if file doesn't exist
 */
export function loadProjectDNA(projectRoot) {
  return _loadProjectDNA(projectRoot);
}

/**
 * Creates a .document-dna.json file by merging provided config with defaults.
 *
 * @param {Object} config - Partial DNA config to merge with defaults
 * @param {string} [projectRoot] - Project root directory (default: process.cwd())
 * @returns {Object} Result with path and final config
 */
export function createDNAFile(config = {}, projectRoot) {
  const root = projectRoot || process.cwd();
  const filePath = path.join(root, DNA_FILENAME);
  const defaults = getDefaultDNA();

  // Deep merge: config wins over defaults
  const merged = {
    version: config.version || defaults.version,
    company: {
      ...defaults.company,
      ...stripUndefined(config.company || {}),
    },
    defaults: {
      ...defaults.defaults,
      ...stripUndefined(config.defaults || {}),
    },
    header: {
      ...defaults.header,
      ...stripUndefined(config.header || {}),
    },
    footer: {
      ...defaults.footer,
      ...stripUndefined(config.footer || {}),
    },
  };

  // Preserve memories if provided (not part of defaults, user-managed)
  if (config.memories && typeof config.memories === "object") {
    merged.memories = config.memories;
  }

  // Preserve usage stats if provided (auto-tracked)
  if (config.usage && typeof config.usage === "object") {
    merged.usage = config.usage;
  }

  // Preserve blueprints if provided (learned from documents)
  if (config.blueprints && typeof config.blueprints === "object") {
    merged.blueprints = config.blueprints;
  }

  // Validate merged DNA
  const validation = validateDNA(merged);
  
  if (!validation.valid) {
    console.warn(
      `[dna-manager] DNA validation failed: ${validation.errors.join(", ")}`
    );
    console.warn("[dna-manager] Using DNA but validation issues should be addressed.");
  }

  fs.writeFileSync(filePath, JSON.stringify(merged, null, 2), "utf-8");

  // Invalidate cache
  _cache = { path: null, mtime: 0, data: null };

  return { path: filePath, config: merged };
}

/**
 * Applies DNA defaults to a tool input object.
 * Only injects values for fields that are NOT explicitly provided.
 * Uses the inheritance system to merge DNA from multiple levels.
 *
 * @param {Object} input - The tool input (e.g., create-doc params)
 * @returns {Object} The input with DNA defaults injected where missing
 */
export function applyDNAToInput(input) {
  // Load all DNA levels
  const userDNA = loadUserDNA();
  const projectDNA = loadProjectDNA();
  
  // If neither userDNA nor projectDNA exists, return input unchanged
  if (!userDNA && !projectDNA) {
    return input;
  }
  
  // Use inheritance system to merge DNA
  const effectiveDNA = _mergeDNALevels(userDNA, projectDNA);
  
  if (!effectiveDNA) {
    return input;
  }

  // Inject header if not explicitly provided and DNA header is enabled.
  // Check for key existence (not truthiness) so callers can pass header: null to suppress.
  if (!("header" in input) && effectiveDNA.header && effectiveDNA.header.enabled !== false && effectiveDNA.header.text) {
    input.header = {
      text: effectiveDNA.header.text,
      alignment: effectiveDNA.header.alignment || "right",
    };
  }

  // Inject footer if not explicitly provided and DNA footer is enabled.
  if (!("footer" in input) && effectiveDNA.footer && effectiveDNA.footer.enabled !== false && effectiveDNA.footer.text) {
    input.footer = {
      text: effectiveDNA.footer.text,
      alignment: effectiveDNA.footer.alignment || "center",
    };
  }

  // Inject stylePreset if not explicitly provided
  if (!input.stylePreset && effectiveDNA.defaults && effectiveDNA.defaults.stylePreset) {
    input.stylePreset = effectiveDNA.defaults.stylePreset;
  }

  return input;
}

/**
 * Removes undefined values from an object (shallow).
 * Prevents undefined from overwriting defaults during merge.
 */
function stripUndefined(obj) {
  const result = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined) {
      result[key] = value;
    }
  }
  return result;
}

/**
 * Clears all DNA caches. Useful for testing.
 */
export function clearDNACache() {
  // Clear backward compatibility cache
  _cache = { path: null, mtime: 0, data: null };
  
  // Clear inheritance cache
  clearInheritanceCache();
}

/**
 * Loads the .document-user.json file from the project root.
 * Wrapper for loadUserDNA to maintain backward compatibility.
 *
 * @param {string} [projectRoot] - Project root directory (default: process.cwd())
 * @returns {Object|null} Parsed user DNA config, or null if file doesn't exist
 */
export function loadUserDNA(projectRoot) {
  return _loadUserDNA(projectRoot);
}

/**
 * Record a document creation event in DNA usage stats.
 * This builds up a profile of what the project actually produces,
 * so the system can auto-tune defaults over time.
 *
 * Non-blocking, non-fatal — failures are silently ignored.
 *
 * @param {string} category - Document category used
 * @param {string} stylePreset - Style preset used
 * @param {Object} [overrides] - Which DNA defaults the user explicitly overrode
 * @param {boolean} [overrides.stylePreset] - User overrode style preset
 * @param {boolean} [overrides.header] - User overrode header
 * @param {boolean} [overrides.footer] - User overrode footer
 */
export function recordUsage(category, stylePreset, overrides = {}, structureSignature = null) {
  try {
    const dna = loadDNA();
    if (!dna) return; // No DNA file, nothing to update

    const usage = dna.usage || {
      categories: {},
      styles: {},
      totalDocs: 0,
      overrides: {},
      correlations: {},
    };

    usage.totalDocs = (usage.totalDocs || 0) + 1;

    if (category) {
      usage.categories = usage.categories || {};
      usage.categories[category] = (usage.categories[category] || 0) + 1;
    }
    if (stylePreset) {
      usage.styles = usage.styles || {};
      usage.styles[stylePreset] = (usage.styles[stylePreset] || 0) + 1;
    }

    // Track overrides (when user explicitly overrode DNA defaults)
    usage.overrides = usage.overrides || {};
    for (const [key, wasOverridden] of Object.entries(overrides)) {
      if (wasOverridden) {
        usage.overrides[key] = (usage.overrides[key] || 0) + 1;
      }
    }

    // Track category+style correlations
    if (category && stylePreset) {
      usage.correlations = usage.correlations || {};
      const corrKey = `${category}+${stylePreset}`;
      usage.correlations[corrKey] = (usage.correlations[corrKey] || 0) + 1;
    }

    // Track structure signatures for template detection
    if (structureSignature) {
      usage.structures = usage.structures || [];
      usage.structures.push({
        signature: structureSignature,
        category: category || null,
        style: stylePreset || null,
        createdAt: new Date().toISOString(),
      });
      // Keep only last 50 entries to avoid unbounded growth
      if (usage.structures.length > 50) {
        usage.structures = usage.structures.slice(-50);
      }
    }

    // Write updated DNA with usage stats
    const updated = { ...dna, usage };
    const root = process.cwd();
    const filePath = path.join(root, DNA_FILENAME);
    fs.writeFileSync(filePath, JSON.stringify(updated, null, 2), "utf-8");

    // Invalidate cache so next read picks up changes
    _cache = { path: null, mtime: 0, data: null };
  } catch {
    // Non-fatal — usage tracking should never break document creation
  }
}

/**
 * Analyze DNA usage stats and return project profile insights.
 * Used by get-dna and init-dna to show what the project actually does.
 *
 * @returns {Object|null} Profile analysis or null if no usage data
 */
export function analyzeProjectProfile() {
  const dna = loadDNA();
  if (!dna || !dna.usage || !dna.usage.totalDocs) return null;

  const { categories, styles, totalDocs } = dna.usage;

  // Find dominant category
  let topCategory = null;
  let topCategoryCount = 0;
  for (const [cat, count] of Object.entries(categories || {})) {
    if (count > topCategoryCount) {
      topCategory = cat;
      topCategoryCount = count;
    }
  }

  // Find dominant style
  let topStyle = null;
  let topStyleCount = 0;
  for (const [style, count] of Object.entries(styles || {})) {
    if (count > topStyleCount) {
      topStyle = style;
      topStyleCount = count;
    }
  }

  return {
    totalDocs,
    dominantCategory: topCategory,
    dominantCategoryPct: topCategory ? Math.round((topCategoryCount / totalDocs) * 100) : 0,
    dominantStyle: topStyle,
    dominantStylePct: topStyle ? Math.round((topStyleCount / totalDocs) * 100) : 0,
    categories,
    styles,
    suggestion: topCategory && topCategoryCount >= 3
      ? `This project mostly creates ${topCategory} documents. Consider setting defaults.category to "${topCategory}" in DNA.`
      : null
  };
}

/**
 * Analyze usage trends and generate evolution suggestions.
 * Detects patterns in document creation and proposes DNA mutations
 * that would better match the project's actual behavior.
 *
 * @param {number} [threshold=5] - Minimum documents before suggesting changes
 * @returns {Object} Analysis with suggestions
 */
export function analyzeTrends(threshold = 5) {
  const dna = loadDNA();
  if (!dna || !dna.usage) {
    return { ready: false, message: "No usage data yet. Create more documents to enable evolution." };
  }

  const { totalDocs, categories, styles, overrides, correlations } = dna.usage;

  if (!totalDocs || totalDocs < threshold) {
    return {
      ready: false,
      totalDocs: totalDocs || 0,
      threshold,
      message: `Need ${threshold - (totalDocs || 0)} more document(s) before evolution suggestions are available.`,
    };
  }

  const suggestions = [];

  // Thresholds rationale:
  //   70% for style: high bar since changing default style affects all new docs
  //   60% for category: lower bar since category defaults are less disruptive
  //   50% for override warnings: alerts when DNA doesn't match actual use
  //   90% for category-style affinity: very high bar for informational correlation

  // Suggestion: default style preset
  if (styles) {
    const entries = Object.entries(styles).sort((a, b) => b[1] - a[1]);
    if (entries.length > 0) {
      const [topStyle, topCount] = entries[0];
      const pct = Math.round((topCount / totalDocs) * 100);

      if (pct >= 70 && dna.defaults?.stylePreset !== topStyle) {
        suggestions.push({
          type: "default-style",
          confidence: pct >= 85 ? "high" : "medium",
          reason: `${pct}% of documents use "${topStyle}" style (${topCount}/${totalDocs})`,
          mutation: { path: "defaults.stylePreset", value: topStyle },
          currentValue: dna.defaults?.stylePreset || "professional",
        });
      }
    }
  }

  // Suggestion: default category
  if (categories) {
    const entries = Object.entries(categories).sort((a, b) => b[1] - a[1]);
    if (entries.length > 0) {
      const [topCat, topCount] = entries[0];
      const pct = Math.round((topCount / totalDocs) * 100);

      if (pct >= 60 && dna.defaults?.category !== topCat) {
        suggestions.push({
          type: "default-category",
          confidence: pct >= 80 ? "high" : "medium",
          reason: `${pct}% of documents are "${topCat}" category (${topCount}/${totalDocs})`,
          mutation: { path: "defaults.category", value: topCat },
          currentValue: dna.defaults?.category || null,
        });
      }
    }
  }

  // Suggestion: stop overriding defaults (indicates DNA doesn't match actual use)
  if (overrides) {
    const overrideEntries = Object.entries(overrides);
    for (const [key, count] of overrideEntries) {
      const pct = Math.round((count / totalDocs) * 100);
      if (pct >= 50) {
        suggestions.push({
          type: "frequent-override",
          confidence: pct >= 70 ? "high" : "medium",
          reason: `"${key}" is overridden in ${pct}% of documents (${count}/${totalDocs}), suggesting DNA defaults don't match actual use`,
          mutation: null, // No auto-fix — this is diagnostic
          recommendation: `Review and update the DNA default for "${key}" to match your most common usage.`,
        });
      }
    }
  }

  // Suggestion: strong category-style correlations
  if (correlations) {
    const entries = Object.entries(correlations).sort((a, b) => b[1] - a[1]);
    for (const [corrKey, count] of entries) {
      const [cat, style] = corrKey.split("+");
      const catTotal = categories?.[cat] || 0;
      if (catTotal >= 3) {
        const corrPct = Math.round((count / catTotal) * 100);
        if (corrPct >= 90) {
          suggestions.push({
            type: "category-style-affinity",
            confidence: "high",
            reason: `${corrPct}% of "${cat}" documents use "${style}" style (${count}/${catTotal})`,
            mutation: null, // Informational
            recommendation: `The "${cat}" → "${style}" mapping is strongly confirmed by usage.`,
          });
        }
      }
    }
  }

  return {
    ready: true,
    totalDocs,
    suggestions,
    lastEvolutionAt: dna.usage.lastEvolutionAt || null,
    message: suggestions.length > 0
      ? `${suggestions.length} evolution suggestion(s) available based on ${totalDocs} documents.`
      : `No evolution suggestions at this time. Current DNA defaults match usage patterns well.`,
  };
}

/**
 * Compute Levenshtein edit distance between two strings.
 * Used for fuzzy signature matching in template detection.
 */
function levenshtein(a, b) {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  const m = a.length;
  const n = b.length;
  // Use single-row optimization (O(n) space instead of O(m*n))
  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  let curr = new Array(n + 1);

  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[n];
}

/**
 * Compute normalized similarity between two signatures using fuzzy heading matching.
 * Returns a score from 0.0 (completely different) to 1.0 (identical).
 *
 * Two signatures match if they have the same heading count and each heading pair
 * has the same level and similar text (Levenshtein distance normalized by length ≤ 0.4).
 */
export function signatureSimilarity(sigA, sigB) {
  if (sigA === sigB) return 1.0;

  const headingsA = sigA.split("|").filter(h => h.length > 0);
  const headingsB = sigB.split("|").filter(h => h.length > 0);

  // Different heading counts = different structure
  if (headingsA.length !== headingsB.length) return 0.0;
  if (headingsA.length === 0) return 1.0;

  let totalSim = 0;
  for (let i = 0; i < headingsA.length; i++) {
    const [levelA, ...textPartsA] = headingsA[i].split(":");
    const [levelB, ...textPartsB] = headingsB[i].split(":");
    const textA = textPartsA.join(":");
    const textB = textPartsB.join(":");

    // Different heading levels at same position = different structure
    if (levelA !== levelB) return 0.0;

    // Compute text similarity via normalized Levenshtein
    const maxLen = Math.max(textA.length, textB.length);
    if (maxLen === 0) {
      totalSim += 1.0;
    } else {
      const dist = levenshtein(textA, textB);
      totalSim += 1.0 - (dist / maxLen);
    }
  }

  return totalSim / headingsA.length;
}

/**
 * Analyze stored structure signatures to detect recurring patterns.
 * Uses fuzzy matching so that "h1:introduction" and "h1:intro" are grouped together.
 * Returns suggestions for auto-creating blueprints when similar
 * documents are repeatedly created.
 *
 * @param {number} [minOccurrences=3] - Minimum times a pattern must appear
 * @returns {Object} Analysis result with suggestions
 */
export function detectRecurringStructures(minOccurrences = 3) {
  const dna = loadDNA();
  if (!dna?.usage?.structures || dna.usage.structures.length < minOccurrences) {
    return { found: false, suggestions: [], message: "Not enough documents created yet." };
  }

  const structures = dna.usage.structures;

  // Fuzzy grouping: cluster signatures with similarity >= 0.6
  const SIMILARITY_THRESHOLD = 0.6;
  const groups = []; // Each group: { representative: string, entries: [] }

  for (const entry of structures) {
    let matched = false;
    for (const group of groups) {
      if (signatureSimilarity(group.representative, entry.signature) >= SIMILARITY_THRESHOLD) {
        group.entries.push(entry);
        matched = true;
        break;
      }
    }
    if (!matched) {
      groups.push({ representative: entry.signature, entries: [entry] });
    }
  }

  const suggestions = [];

  for (const group of groups) {
    if (group.entries.length >= minOccurrences) {
      const headings = group.representative.split("|").filter(h => h.length > 0);

      // Determine most common category for this pattern
      const catCounts = {};
      for (const e of group.entries) {
        if (e.category) {
          catCounts[e.category] = (catCounts[e.category] || 0) + 1;
        }
      }
      const topCat = Object.entries(catCounts).sort((a, b) => b[1] - a[1])[0];

      // Collect unique signature variants in this fuzzy group
      const variants = [...new Set(group.entries.map(e => e.signature))];

      suggestions.push({
        type: "recurring-structure",
        occurrences: group.entries.length,
        signature: group.representative,
        variants: variants.length > 1 ? variants : undefined,
        headingCount: headings.length,
        headings,
        dominantCategory: topCat ? topCat[0] : null,
        message: `A document structure with ${headings.length} section(s) has been used ${group.entries.length} times${variants.length > 1 ? ` (${variants.length} variants)` : ""}. Consider creating a blueprint for it.`,
      });
    }
  }

  // Sort by occurrence count (most frequent first)
  suggestions.sort((a, b) => b.occurrences - a.occurrences);

  return {
    found: suggestions.length > 0,
    suggestions,
    totalStructuresTracked: structures.length,
    message: suggestions.length > 0
      ? `${suggestions.length} recurring document structure(s) detected.`
      : "No recurring patterns detected yet.",
  };
}

/**
 * Apply an evolution mutation to the DNA configuration.
 *
 * @param {Object} mutation - Mutation to apply
 * @param {string} mutation.path - Dot-separated path (e.g., "defaults.stylePreset")
 * @param {*} mutation.value - New value
 * @returns {Object} Result
 */
export function applyEvolution(mutation) {
  if (!mutation || !mutation.path || mutation.value === undefined) {
    return { success: false, error: "Invalid mutation: requires path and value." };
  }

  const dna = loadDNA();
  if (!dna) {
    return { success: false, error: "DNA not initialized." };
  }

  // Apply the mutation by path
  const parts = mutation.path.split(".");
  let target = dna;
  for (let i = 0; i < parts.length - 1; i++) {
    if (!target[parts[i]] || typeof target[parts[i]] !== "object") {
      target[parts[i]] = {};
    }
    target = target[parts[i]];
  }

  const lastKey = parts[parts.length - 1];
  const oldValue = target[lastKey];
  target[lastKey] = mutation.value;

  // Record evolution timestamp
  if (!dna.usage) dna.usage = {};
  dna.usage.lastEvolutionAt = new Date().toISOString();

  // Write back
  const root = process.cwd();
  const filePath = path.join(root, DNA_FILENAME);
  fs.writeFileSync(filePath, JSON.stringify(dna, null, 2), "utf-8");

  // Invalidate cache
  _cache = { path: null, mtime: 0, data: null };

  return {
    success: true,
    path: mutation.path,
    oldValue,
    newValue: mutation.value,
    message: `DNA evolved: ${mutation.path} changed from "${oldValue}" to "${mutation.value}"`,
  };
}
