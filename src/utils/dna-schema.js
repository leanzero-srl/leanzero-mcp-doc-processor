/**
 * DNA Schema Definition, Validation, and Migration
 *
 * This module is ONLY responsible for:
 *   - Schema definition (DNA_SCHEMA)
 *   - Validation (validateDNA)
 *   - Migration (applyMigration, validateAndMigrateDNA)
 *
 * All DNA I/O (loading, saving, caching, applying defaults) lives in dna-manager.js.
 * Do NOT add loadDNA, createDNAFile, applyDNAToInput, or cache logic here.
 */

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
  memories: {
    type: "object",
    required: false,
    description: "Key-value store for document creation preferences and personality. Each memory has a text and createdAt timestamp.",
  },
  usage: {
    type: "object",
    required: false,
    description: "Auto-tracked usage statistics. Categories and styles used, total document count. Updated automatically by create-doc.",
  },
  blueprints: {
    type: "object",
    required: false,
    description: "Learned document blueprints. Each key is a blueprint name, value contains sections, stylePreset, and metadata.",
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
      if (
        dna.header.enabled !== undefined &&
        typeof dna.header.enabled !== "boolean"
      ) {
        errors.push("header.enabled must be a boolean if provided");
      }
      if (
        dna.header.text !== undefined &&
        typeof dna.header.text !== "string"
      ) {
        errors.push("header.text must be a string if provided");
      }
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
      if (
        dna.footer.enabled !== undefined &&
        typeof dna.footer.enabled !== "boolean"
      ) {
        errors.push("footer.enabled must be a boolean if provided");
      }
      if (
        dna.footer.text !== undefined &&
        typeof dna.footer.text !== "string"
      ) {
        errors.push("footer.text must be a string if provided");
      }
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

  // Validate memories (optional, object with string keys)
  if (dna.memories !== undefined) {
    if (typeof dna.memories !== "object" || dna.memories === null || Array.isArray(dna.memories)) {
      errors.push("memories must be an object if provided");
    }
  }

  // Validate usage (optional, auto-tracked)
  if (dna.usage !== undefined) {
    if (typeof dna.usage !== "object" || dna.usage === null || Array.isArray(dna.usage)) {
      errors.push("usage must be an object if provided");
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

// Re-export from dna-manager for backward compatibility with test imports
// These are the SINGLE source of truth — do NOT reimplement here
export {
  loadDNA,
  createDNAFile,
  applyDNAToInput,
  clearDNACache,
  getDefaultDNA,
} from "./dna-manager.js";
