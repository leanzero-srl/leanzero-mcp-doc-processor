/**
 * Document Registry System
 * Tracks all created documents in docs/registry.json for deduplication and discovery
 */

import fs from "fs/promises";
import path from "path";

const REGISTRY_PATH = path.join(process.cwd(), "docs", "registry.json");
const LOCK_FILE_PATH = path.join(process.cwd(), "docs", ".registry.lock");

/**
 * Get the absolute registry file path
 */
export function getRegistryPath() {
  return REGISTRY_PATH;
}

/**
 * Get the absolute lock file path
 */
export function getLockFilePath() {
  return LOCK_FILE_PATH;
}

/**
 * Acquire a file lock
 * @returns {boolean} True if lock acquired, false otherwise
 */
export async function acquireLock() {
  try {
    await fs.writeFile(LOCK_FILE_PATH, String(process.pid), { flag: "wx" });
    return true;
  } catch (err) {
    if (err.code === "EEXIST") {
      return false;
    }
    throw err;
  }
}

/**
 * Release the file lock
 */
export async function releaseLock() {
  try {
    await fs.unlink(LOCK_FILE_PATH);
  } catch (err) {
    // Only ignore the expected case where lock file doesn't exist
    if (err.code !== "ENOENT") {
      console.warn("Failed to release registry lock:", err.message);
    }
  }
}

/**
 * Load the document registry with locking
 * @returns {Object} Registry object with documents array
 */
export async function loadRegistry() {
  try {
    // Wait for lock
    while (!await acquireLock()) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    try {
      const data = await fs.readFile(REGISTRY_PATH, "utf8");
      return JSON.parse(data);
    } finally {
      await releaseLock();
    }
  } catch (err) {
    if (err.code === "ENOENT") {
      return { documents: [], version: 1, lastUpdated: null };
    }
    throw err;
  }
}

/**
 * Save the document registry with locking
 * @param {Object} registry - Registry object to save
 */
export async function saveRegistry(registry) {
  // Wait for lock
  while (!await acquireLock()) {
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  
  try {
    // Ensure docs directory exists
    const docsDir = path.dirname(REGISTRY_PATH);
    await fs.mkdir(docsDir, { recursive: true });
    
    registry.lastUpdated = new Date().toISOString();
    await fs.writeFile(
      REGISTRY_PATH,
      JSON.stringify(registry, null, 2),
      "utf8"
    );
  } finally {
    await releaseLock();
  }
}

/**
 * Add a document to the registry
 * @param {Object} doc - Document information
 * @param {string} doc.title - Document title
 * @param {string} doc.filePath - Absolute file path
 * @param {string} [doc.category] - Document category
 * @param {Array<string>} [doc.tags] - Tags for search
 * @param {string} [doc.description] - Document description
 */
export async function registerDocument(doc) {
  const registry = await loadRegistry();

  // Check if document already exists
  const existingIndex = registry.documents.findIndex(
    d => d.filePath === doc.filePath || (d.title === doc.title && d.category === doc.category)
  );

  if (existingIndex >= 0) {
    // Update existing entry
    registry.documents[existingIndex] = {
      ...registry.documents[existingIndex],
      ...doc,
      updatedAt: new Date().toISOString()
    };
  } else {
    // Add new entry
    registry.documents.push({
      id: `doc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      title: doc.title,
      filePath: path.normalize(doc.filePath),
      category: doc.category || "misc",
      tags: doc.tags || [],
      description: doc.description || "",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
  }

  await saveRegistry(registry);
  return registry.documents[existingIndex >= 0 ? existingIndex : registry.documents.length - 1];
}

/**
 * Find documents by criteria
 * @param {Object} criteria - Search criteria
 * @param {string} [criteria.title] - Document title (exact or partial)
 * @param {string} [criteria.category] - Category
 * @param {Array<string>} [criteria.tags] - Tags to match
 */
export async function findDocuments(criteria = {}) {
  const registry = await loadRegistry();

  return registry.documents.filter(doc => {
    if (criteria.title && !doc.title.toLowerCase().includes(criteria.title.toLowerCase())) {
      return false;
    }
    if (criteria.category && doc.category !== criteria.category) {
      return false;
    }
    if (criteria.tags && !doc.tags.some(tag => criteria.tags.includes(tag))) {
      return false;
    }
    return true;
  });
}

/**
 * Get document by path or ID
 */
export async function getDocument(identifier) {
  const registry = await loadRegistry();

  return registry.documents.find(
    d => d.filePath === identifier || d.id === identifier
  ) || null;
}

/**
 * Check if a document with similar title/category already exists
 * @param {string} title - Document title to check
 * @param {string} [category] - Expected category
 */
export async function findDuplicateCandidates(title, category) {
  const registry = await loadRegistry();

  return registry.documents.filter(doc => {
    // Exact title match in same category
    if (doc.title === title && doc.category === category) {
      return true;
    }

    // Similar title (fuzzy match)
    const docTitle = doc.title.toLowerCase();
    const checkTitle = title.toLowerCase();

    // Check for common patterns
    if (checkTitle.includes(docTitle) || docTitle.includes(checkTitle)) {
      return true;
    }

    // Check if one is a substring of the other
    const normalizedTitle = checkTitle.replace(/[_-]/g, " ");
    const normalizedDocTitle = docTitle.replace(/[_-]/g, " ");

    if (normalizedTitle.includes(normalizedDocTitle) || normalizedDocTitle.includes(normalizedTitle)) {
      return true;
    }

    return false;
  });
}

/**
 * Remove a document from the registry (for deletions)
 */
export async function unregisterDocument(filePath) {
  const registry = await loadRegistry();

  const filteredDocs = registry.documents.filter(d => d.filePath !== filePath);

  if (filteredDocs.length < registry.documents.length) {
    registry.documents = filteredDocs;
    await saveRegistry(registry);
    return true;
  }

  return false;
}

/**
 * Get statistics about the document registry
 */
export async function getRegistryStats() {
  const registry = await loadRegistry();

  const stats = {
    totalDocuments: registry.documents.length,
    byCategory: {},
    byTag: {}
  };

  for (const doc of registry.documents) {
    // Count by category
    stats.byCategory[doc.category] = (stats.byCategory[doc.category] || 0) + 1;

    // Count by tag
    for (const tag of doc.tags) {
      stats.byTag[tag] = (stats.byTag[tag] || 0) + 1;
    }
  }

  return stats;
}
