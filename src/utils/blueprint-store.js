/**
 * Blueprint Store
 *
 * Stores and retrieves document blueprints from .document-dna.json
 * under a "blueprints" key. Blueprints are structural schemas
 * extracted from existing documents.
 */

import { loadDNA, createDNAFile } from "./dna-manager.js";

/**
 * Save a blueprint to DNA storage.
 *
 * @param {string} name - Blueprint name (e.g., "quarterly-report")
 * @param {Object} blueprint - Blueprint data
 * @param {string} blueprint.learnedFrom - Source file path
 * @param {Array} blueprint.sections - Section definitions
 * @param {string} blueprint.stylePreset - Detected style preset
 * @param {number} blueprint.avgParagraphsPerSection - Average paragraph count
 * @param {string} [description] - Optional description
 * @returns {Object} Result
 */
export function saveBlueprint(name, blueprint, description) {
  const dna = loadDNA();
  if (!dna) {
    throw new Error("Document DNA is not initialized. Use init-dna first.");
  }

  const blueprints = dna.blueprints || {};

  blueprints[name] = {
    ...blueprint,
    name,
    description: description || `Blueprint learned from ${blueprint.learnedFrom}`,
    createdAt: new Date().toISOString(),
  };

  // Write back to DNA (preserve everything else)
  createDNAFile({
    ...dna,
    blueprints,
  });

  return { success: true, name, blueprint: blueprints[name] };
}

/**
 * Load a blueprint by name.
 *
 * @param {string} name - Blueprint name
 * @returns {Object|null} Blueprint or null if not found
 */
export function loadBlueprint(name) {
  const dna = loadDNA();
  if (!dna || !dna.blueprints) return null;
  return dna.blueprints[name] || null;
}

/**
 * List all stored blueprints.
 *
 * @returns {Array<Object>} Array of blueprint summaries
 */
export function listBlueprints() {
  const dna = loadDNA();
  if (!dna || !dna.blueprints) return [];

  return Object.entries(dna.blueprints).map(([name, bp]) => ({
    name,
    description: bp.description,
    learnedFrom: bp.learnedFrom,
    sectionCount: bp.sections?.length || 0,
    stylePreset: bp.stylePreset,
    createdAt: bp.createdAt,
  }));
}

/**
 * Delete a blueprint by name.
 *
 * @param {string} name - Blueprint name to delete
 * @returns {boolean} True if deleted, false if not found
 */
export function deleteBlueprint(name) {
  const dna = loadDNA();
  if (!dna || !dna.blueprints || !dna.blueprints[name]) return false;

  delete dna.blueprints[name];

  createDNAFile({
    ...dna,
  });

  return true;
}
