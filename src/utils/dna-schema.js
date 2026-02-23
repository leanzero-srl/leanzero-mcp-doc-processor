import fs from "fs";
import path from "path";

const DNA_FILENAME = ".document-dna.json";

// Valid style presets
const VALID_STYLE_PRESETS = [
  "minimal",
  "professional",
  "technical",
  "legal",
  "business",
  "casual",
  "colorful",
];

// Valid header/footer alignments
const VALID_ALIGNMENTS = ["left", "center", "right"];

/**
 * DNA Schema Definition
 * @type {Object}
 */
export const DNA_SCHEMA = {
  version: {
    type: "number",
    required: true,
    min: 1,
  },
  company: {
    type: "object",
    required: true,
    properties: {
      name: {
        type: "string",
        required: true,
        minLength: 1,
      },
      department: {
        type: "string",
        required: false,
      },
    },
  },
  defaults: {
    type: "object",
    required: true,
    properties: {
      stylePreset: {
        type: "string",
        required: false,
        validValues: VALID_STYLE_PRESETS,
      },
      category: {
        type: "string",
        required: false,
      },
    },
  },
  header: {
    type: "object",
    required: false,
    properties: {
      enabled: {
        type: "boolean",
        required: false,
        default: true,
      },
      text: {
        type: "string",
        required: false,
      },
      alignment: {
        type: "string",
        required: false,
        validValues: VALID_ALIGNMENTS,
        default: "right",
      },
    },
  },
  footer: {
    type: "object",
    required: false,
    properties: {
      enabled: {
        type: "boolean",
        required: false,
        default: true,
      },
      text: {
        type: "string",
        required: false,
      },
      alignment: {
        type: "string",
        required: false,
        validValues: VALID_ALIGNMENTS,
        default: "center",
      },
    },
  },
};

// Migration system for version upgrades
const MIGRATIONS = {
  1: (dna) => dna, // No migration needed for version 1
};

/**
 * Validates DNA configuration against the schema
 * @param {Object} dna - DNA configuration to validate
 * @returns {{ valid: boolean, errors: string[], warnings: string[] }}
 */
export function validateDNA(dna) {
  const errors = [];
  const warnings = [];

  if (!dna || typeof dna !== "object") {
    errors.push("DNA configuration must be an object");
    return { valid: false, errors, warnings };
  }

  // Validate version
  if (!DNA_SCHEMA.version.required || dna.version === undefined) {
    errors.push("version is required");
  } else if (typeof dna.version !== "number") {
    errors.push("version must be a number");
  } else if (dna.version < DNA_SCHEMA.version.min) {
    errors.push(`version must be at least ${DNA_SCHEMA.version.min}`);
  }

  // Validate company
  if (!DNA_SCHEMA.company.required || dna.company === undefined) {
    errors.push("company is required");
  } else if (typeof dna.company !== "object" || dna.company === null) {
    errors.push("company must be an object");
  } else {
    // Validate company.name
    if (DNA_SCHEMA.company.properties.name.required) {
      if (!dna.company.name || typeof dna.company.name !== "string") {
        errors.push("company.name is required and must be a string");
      } else if (
        dna.company.name.length < DNA_SCHEMA.company.properties.name.minLength
      ) {
        errors.push(
          `company.name must be at least ${DNA_SCHEMA.company.properties.name.minLength} characters`
        );
      }
    }

    // Validate company.department (optional)
    if (
      dna.company.department !== undefined &&
      typeof dna.company.department !== "string"
    ) {
      warnings.push("company.department should be a string if provided");
    }
  }

  // Validate defaults
  if (!DNA_SCHEMA.defaults.required || dna.defaults === undefined) {
    errors.push("defaults is required");
  } else if (typeof dna.defaults !== "object" || dna.defaults === null) {
    errors.push("defaults must be an object");
  } else {
    // Validate defaults.stylePreset
    if (dna.defaults.stylePreset !== undefined) {
      if (
        !DNA_SCHEMA.defaults.properties.stylePreset.validValues.includes(
          dna.defaults.stylePreset
        )
      ) {
        errors.push(
          `defaults.stylePreset must be one of: ${DNA_SCHEMA.defaults.properties.stylePreset.validValues.join(", ")}`
        );
      }
    }

    // Validate defaults.category (optional)
    if (
      dna.defaults.category !== undefined &&
      typeof dna.defaults.category !== "string"
    ) {
      warnings.push("defaults.category should be a string if provided");
    }
  }

  // Validate header
  if (dna.header !== undefined) {
    if (typeof dna.header !== "object" || dna.header === null) {
      errors.push("header must be an object if provided");
    } else {
      // Validate header.enabled
      if (
        dna.header.enabled !== undefined &&
        typeof dna.header.enabled !== "boolean"
      ) {
        errors.push("header.enabled must be a boolean if provided");
      }

      // Validate header.text
      if (
        dna.header.text !== undefined &&
        typeof dna.header.text !== "string"
      ) {
        errors.push("header.text must be a string if provided");
      }

      // Validate header.alignment
      if (
        dna.header.alignment !== undefined &&
        !DNA_SCHEMA.header.properties.alignment.validValues.includes(
          dna.header.alignment
        )
      ) {
        errors.push(
          `header.alignment must be one of: ${DNA_SCHEMA.header.properties.alignment.validValues.join(", ")}`
        );
      }
    }
  }

  // Validate footer
  if (dna.footer !== undefined) {
    if (typeof dna.footer !== "object" || dna.footer === null) {
      errors.push("footer must be an object if provided");
    } else {
      // Validate footer.enabled
      if (
        dna.footer.enabled !== undefined &&
        typeof dna.footer.enabled !== "boolean"
      ) {
        errors.push("footer.enabled must be a boolean if provided");
      }

      // Validate footer.text
      if (
        dna.footer.text !== undefined &&
        typeof dna.footer.text !== "string"
      ) {
        errors.push("footer.text must be a string if provided");
      }

      // Validate footer.alignment
      if (
        dna.footer.alignment !== undefined &&
        !DNA_SCHEMA.footer.properties.alignment.validValues.includes(
          dna.footer.alignment
        )
      ) {
        errors.push(
          `footer.alignment must be one of: ${DNA_SCHEMA.footer.properties.alignment.validValues.join(", ")}`
        );
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Applies migration to DNA configuration based on version
 * @param {Object} dna - DNA configuration
 * @returns {Object} Migrated DNA configuration
 */
export function applyMigration(dna) {
  const version = dna.version || 1;

  if (MIGRATIONS[version]) {
    return MIGRATIONS[version](dna);
  }

  return dna;
}

/**
 * Validates and migrates DNA configuration
 * @param {Object} dna - DNA configuration
 * @returns {{ valid: boolean, errors: string[], warnings: string[], dna: Object }}
 */
export function validateAndMigrateDNA(dna) {
  const result = validateDNA(dna);

  if (result.valid) {
    return {
      valid: true,
      errors: [],
      warnings: result.warnings,
      dna: applyMigration(dna),
    };
  }

  return {
    valid: false,
    errors: result.errors,
    warnings: result.warnings,
    dna: null,
  };
}

// Module-level cache for DNA config (preserving existing functionality)
let _cache = { path: null, mtime: 0, data: null };

/**
 * Returns the default DNA configuration template (preserving existing functionality)
 * @returns {Object} Default DNA config
 */
export function getDefaultDNA() {
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
    const validation = validateAndMigrateDNA(data);

    if (!validation.valid) {
      console.warn(
        `[dna-schema] DNA validation failed: ${validation.errors.join(", ")}`
      );
      return null;
    }

    // Update cache
    _cache = { path: filePath, mtime, data: validation.dna };

    return validation.dna;
  } catch (err) {
    if (err.code === "ENOENT") {
      return null;
    }
    console.warn(`[dna-manager] Failed to load ${DNA_FILENAME}:`, err.message);
    return null;
  }
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
    throw new Error(
      `DNA validation failed: ${validation.errors.join(", ")}`
    );
  }

  fs.writeFileSync(filePath, JSON.stringify(merged, null, 2), "utf-8");

  // Invalidate cache
  _cache = { path: null, mtime: 0, data: null };

  return { path: filePath, config: merged };
}

/**
 * Applies DNA defaults to a tool input object.
 * Only injects values for fields that are NOT explicitly provided.
 * Explicit user values always win.
 *
 * @param {Object} input - The tool input (e.g., create-doc params)
 * @returns {Object} The input with DNA defaults injected where missing
 */
export function applyDNAToInput(input) {
  const dna = loadDNA();
  if (!dna) {
    return input;
  }

  // Inject header if not explicitly provided and DNA header is enabled
  if (!input.header && dna.header && dna.header.enabled !== false && dna.header.text) {
    input.header = {
      text: dna.header.text,
      alignment: dna.header.alignment || "right",
    };
  }

  // Inject footer if not explicitly provided and DNA footer is enabled
  if (!input.footer && dna.footer && dna.footer.enabled !== false && dna.footer.text) {
    input.footer = {
      text: dna.footer.text,
      alignment: dna.footer.alignment || "center",
    };
  }

  // Inject stylePreset if not explicitly provided
  if (!input.stylePreset && dna.defaults && dna.defaults.stylePreset) {
    input.stylePreset = dna.defaults.stylePreset;
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
 * Clears the DNA cache. Useful for testing.
 */
export function clearDNACache() {
  _cache = { path: null, mtime: 0, data: null };
}