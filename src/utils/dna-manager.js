import fs from "fs";
import path from "path";

const DNA_FILENAME = ".document-dna.json";
const USER_DNA_FILENAME = ".document-user.json";

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

  // Inject header if not explicitly provided and DNA header is enabled
  if (!input.header && effectiveDNA.header && effectiveDNA.header.enabled !== false && effectiveDNA.header.text) {
    input.header = {
      text: effectiveDNA.header.text,
      alignment: effectiveDNA.header.alignment || "right",
    };
  }

  // Inject footer if not explicitly provided and DNA footer is enabled
  if (!input.footer && effectiveDNA.footer && effectiveDNA.footer.enabled !== false && effectiveDNA.footer.text) {
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
 */
export function recordUsage(category, stylePreset) {
  try {
    const dna = loadDNA();
    if (!dna) return; // No DNA file, nothing to update

    const usage = dna.usage || { categories: {}, styles: {}, totalDocs: 0 };

    usage.totalDocs = (usage.totalDocs || 0) + 1;

    if (category) {
      usage.categories[category] = (usage.categories[category] || 0) + 1;
    }
    if (stylePreset) {
      usage.styles[stylePreset] = (usage.styles[stylePreset] || 0) + 1;
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
