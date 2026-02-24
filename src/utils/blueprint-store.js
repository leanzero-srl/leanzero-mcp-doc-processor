/**
 * Blueprint Store
 *
 * Stores and retrieves document blueprints in a dedicated
 * .document-blueprints.json file. Blueprints are structural schemas
 * extracted from existing documents.
 *
 * Previously stored in .document-dna.json under "blueprints" key,
 * now separated to avoid bloating the DNA config.
 */

import fs from "fs";
import path from "path";

const BLUEPRINT_FILENAME = ".document-blueprints.json";

let _cache = null;
let _cacheMtime = 0;

/**
 * Get the blueprint file path.
 */
function getBlueprintPath(projectRoot) {
  return path.join(projectRoot || process.cwd(), BLUEPRINT_FILENAME);
}

/**
 * Load blueprints from disk with mtime caching.
 */
function loadBlueprints(projectRoot) {
  const filePath = getBlueprintPath(projectRoot);

  try {
    const stat = fs.statSync(filePath);
    if (_cache && _cacheMtime === stat.mtimeMs) {
      return _cache;
    }
    const data = JSON.parse(fs.readFileSync(filePath, "utf-8"));
    _cache = data;
    _cacheMtime = stat.mtimeMs;
    return data;
  } catch (err) {
    if (err.code === "ENOENT") return {};
    console.error(`[blueprint-store] Failed to load ${BLUEPRINT_FILENAME}:`, err.message);
    return {};
  }
}

/**
 * Write blueprints to disk and invalidate cache.
 */
function writeBlueprints(blueprints, projectRoot) {
  const filePath = getBlueprintPath(projectRoot);
  fs.writeFileSync(filePath, JSON.stringify(blueprints, null, 2), "utf-8");
  _cache = blueprints;
  _cacheMtime = fs.statSync(filePath).mtimeMs;
}

/**
 * Save a blueprint.
 *
 * @param {string} name - Blueprint name (e.g., "quarterly-report")
 * @param {Object} blueprint - Blueprint data
 * @param {string} [description] - Optional description
 * @returns {Object} Result
 */
export function saveBlueprint(name, blueprint, description) {
  const blueprints = loadBlueprints();

  blueprints[name] = {
    ...blueprint,
    name,
    description: description || `Blueprint learned from ${blueprint.learnedFrom}`,
    createdAt: new Date().toISOString(),
  };

  writeBlueprints(blueprints);

  return { success: true, name, blueprint: blueprints[name] };
}

/**
 * Load a blueprint by name.
 *
 * @param {string} name - Blueprint name
 * @returns {Object|null} Blueprint or null if not found
 */
export function loadBlueprint(name) {
  const blueprints = loadBlueprints();
  return blueprints[name] || null;
}

/**
 * List all stored blueprints.
 *
 * @returns {Array<Object>} Array of blueprint summaries
 */
export function listBlueprints() {
  const blueprints = loadBlueprints();

  return Object.entries(blueprints).map(([name, bp]) => ({
    name,
    description: bp.description,
    learnedFrom: bp.learnedFrom,
    sectionCount: bp.sections?.length || 0,
    stylePreset: bp.stylePreset,
    autoLearned: bp.autoLearned || false,
    signature: bp.signature || null,
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
  const blueprints = loadBlueprints();
  if (!blueprints[name]) return false;

  delete blueprints[name];
  writeBlueprints(blueprints);

  return true;
}

/**
 * Clear the blueprint cache. Useful for testing.
 */
export function clearBlueprintCache() {
  _cache = null;
  _cacheMtime = 0;
}
