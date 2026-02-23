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
