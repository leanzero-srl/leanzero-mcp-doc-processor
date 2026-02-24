import fs from "fs";
import path from "path";

const DNA_FILENAME = ".document-dna.json";
const USER_DNA_FILENAME = ".document-user.json";

// Module-level cache for DNA inheritance system
let _inheritanceCache = {
  system: null,
  project: null,
  user: null,
  merged: null,
  mtime: {
    system: 0,
    project: 0,
    user: 0
  }
};

/**
 * Returns the default DNA configuration template (system defaults).
 * @returns {Object} Default DNA config
 */
export function getSystemDefaults() {
  return {
    version: 1,
    company: {
      name: "My Project",
      department: "",
    },
    defaults: {
      stylePreset: "professional",
      category: null,
    },
    header: {
      enabled: true,
      text: "My Project",
      alignment: "right",
    },
    footer: {
      enabled: true,
      text: "Page {current} of {total}",
      alignment: "center",
    },
  };
}

/**
 * Loads the .document-user.json file from the project root.
 * Uses an in-memory cache with mtime checking for performance.
 *
 * @param {string} [projectRoot] - Project root directory (default: process.cwd())
 * @returns {Object|null} Parsed user DNA config, or null if file doesn't exist
 */
export function loadUserDNA(projectRoot) {
  const root = projectRoot || process.cwd();
  const filePath = path.join(root, USER_DNA_FILENAME);

  try {
    const stat = fs.statSync(filePath);
    const mtime = stat.mtimeMs;

    // Return cached data if file hasn't changed
    if (_inheritanceCache.user && _inheritanceCache.mtime.user === mtime) {
      return _inheritanceCache.user;
    }

    const content = fs.readFileSync(filePath, "utf-8");
    const data = JSON.parse(content);

    // Update cache
    _inheritanceCache.user = data;
    _inheritanceCache.mtime.user = mtime;

    return data;
  } catch (err) {
    if (err.code === "ENOENT") {
      return null;
    }
    console.warn(`[dna-inheritance] Failed to load ${USER_DNA_FILENAME}:`, err.message);
    return null;
  }
}

/**
 * Loads the .document-dna.json file from the project root.
 * Uses an in-memory cache with mtime checking for performance.
 *
 * @param {string} [projectRoot] - Project root directory (default: process.cwd())
 * @returns {Object|null} Parsed project DNA config, or null if file doesn't exist
 */
export function loadProjectDNA(projectRoot) {
  const root = projectRoot || process.cwd();
  const filePath = path.join(root, DNA_FILENAME);

  try {
    const stat = fs.statSync(filePath);
    const mtime = stat.mtimeMs;

    // Return cached data if file hasn't changed
    if (_inheritanceCache.project && _inheritanceCache.mtime.project === mtime) {
      return _inheritanceCache.project;
    }

    const content = fs.readFileSync(filePath, "utf-8");
    const data = JSON.parse(content);

    // Update cache
    _inheritanceCache.project = data;
    _inheritanceCache.mtime.project = mtime;

    return data;
  } catch (err) {
    if (err.code === "ENOENT") {
      return null;
    }
    console.warn(`[dna-inheritance] Failed to load ${DNA_FILENAME}:`, err.message);
    return null;
  }
}

/**
 * Merges DNA from multiple inheritance levels with proper priority.
 * Priority: User overrides > Project DNA > System defaults
 *
 * @param {Object} [userDNA] - User-specific overrides (optional)
 * @param {Object} [projectDNA] - Project DNA config (optional)
 * @param {Object} [systemDefaults] - System defaults (optional)
 * @returns {Object|null} Merged DNA config with inheritance applied
 */
export function mergeDNALevels(userDNA, projectDNA, systemDefaults) {
  // Use provided values or defaults
  const defaults = systemDefaults || getSystemDefaults();
  const project = projectDNA || {};
  const user = userDNA || {};

  // Deep merge with proper priority: user > project > defaults
  return {
    version: user.version || project.version || defaults.version,
    company: {
      ...defaults.company,
      ...(project.company ? stripUndefined(project.company) : {}),
      ...(user.company ? stripUndefined(user.company) : {}),
    },
    defaults: {
      ...defaults.defaults,
      ...(project.defaults ? stripUndefined(project.defaults) : {}),
      ...(user.defaults ? stripUndefined(user.defaults) : {}),
    },
    header: {
      ...defaults.header,
      ...(project.header ? stripUndefined(project.header) : {}),
      ...(user.header ? stripUndefined(user.header) : {}),
    },
    footer: {
      ...defaults.footer,
      ...(project.footer ? stripUndefined(project.footer) : {}),
      ...(user.footer ? stripUndefined(user.footer) : {}),
    },
  };
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
 * Clears the DNA inheritance cache. Useful for testing or when files change.
 */
export function clearDNACache() {
  _inheritanceCache = {
    system: null,
    project: null,
    user: null,
    merged: null,
    mtime: {
      system: 0,
      project: 0,
      user: 0
    }
  };
}

/**
 * Gets all DNA levels for debugging or inspection.
 * @returns {Object} Object containing system, project, user, and merged DNA
 */
export function getAllDNALevels() {
  const systemDefaults = getSystemDefaults();
  const projectDNA = loadProjectDNA();
  const userDNA = loadUserDNA();
  
  return {
    system: systemDefaults,
    project: projectDNA,
    user: userDNA,
    merged: mergeDNALevels(userDNA, projectDNA, systemDefaults)
  };
}