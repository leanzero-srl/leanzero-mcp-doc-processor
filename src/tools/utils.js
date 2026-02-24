import fs from "fs/promises";
import { constants as fsConstants } from "fs";
import path from "path";

// Import categorization utilities
import { classifyDocument, getCategoryInfo, getAvailableCategories as getCategoriesFromClassifier } from "../utils/categorizer.js";
import {
  registerDocument,
  findDocuments
} from "../utils/registry.js";

/**
 * Enforces docs/ folder structure for file organization
 * @param {string} outputPath - The requested output path
 * @param {boolean} enforceDocsFolder - Whether to enforce docs/ folder (default: true)
 * @param {string} projectRoot - Project root directory (default: process.cwd())
 * @returns {Object} { outputPath, wasEnforced }
 */
export function enforceDocsFolder(
  outputPath,
  enforceDocsFolder = true,
  projectRoot = process.cwd(),
) {
  if (!enforceDocsFolder) {
    return { outputPath, wasEnforced: false };
  }

  const resolvedPath = path.isAbsolute(outputPath)
    ? outputPath
    : path.resolve(projectRoot, outputPath);

  // Check if path is outside project root
  // If path is absolute and outside project root, respect it (don't enforce docs/)
  let relativePath;
  try {
    relativePath = path.relative(projectRoot, resolvedPath);
    // Path is outside project root (starts with "../" or "..")
    if (relativePath.startsWith("../") || relativePath === "..") {
      return { outputPath: resolvedPath, wasEnforced: false };
    }
  } catch (err) {
    // Can't resolve relative path, will enforce docs/
    relativePath = "";
  }

  // Check if already in docs/ folder (fixed: check first path component)
  const alreadyInDocs =
    relativePath.startsWith("docs" + path.sep) ||
    relativePath.startsWith("docs/") ||
    relativePath.split(path.sep)[0] === "docs";

  if (alreadyInDocs) {
    console.error(
      `[enforceDocsFolder] Path already in docs/: ${outputPath}, no enforcement needed`,
    );
    return { outputPath: resolvedPath, wasEnforced: false };
  }

  // Enforce docs/ folder for paths not already in docs/
  const parsedPath = path.parse(path.basename(resolvedPath));
  const docsPath = path.join(projectRoot, "docs", parsedPath.base);
  console.error(
    `[enforceDocsFolder] Input: ${outputPath}, Output: ${docsPath}, Was enforced: true`,
  );
  return { outputPath: docsPath, wasEnforced: true };
}

/**
 * Generates a unique filename to prevent duplicate file creation using ATOMIC locks
 *
 * Uses mkdir() with recursive=false as an exclusive lock (atomic on POSIX).
 * This prevents TOCTOU (Time Of Check To Time Of Use) race conditions where
 * concurrent calls could all see "file doesn't exist" and all write the same path.
 *
 * The key insight: all concurrent calls must compete for the SAME lock directory,
 * not unique ones. We use a shared lock per base filename, with spin-wait retry.
 *
 * CRITICAL: To truly prevent race conditions, we create a placeholder file while
 * holding the lock. This ensures subsequent callers see the file as "taken".
 *
 * @param {string} filePath - The desired file path
 * @param {boolean} preventDuplicates - Whether to prevent duplicates (default: true)
 * @returns {Promise<string>} Unique file path (with _1, _2, etc. appended if needed)
 */
export async function preventDuplicateFiles(
  filePath,
  preventDuplicates = true,
) {
  if (!preventDuplicates) {
    return filePath;
  }

  // Ensure we're using absolute path for file existence checks
  const absolutePath = path.isAbsolute(filePath)
    ? filePath
    : path.resolve(filePath);

  const parsedPath = path.parse(absolutePath);
  const baseName = parsedPath.name;
  const ext = parsedPath.ext;
  const dir = parsedPath.dir;

  // SHARED lock directory - all calls for the same base filename compete for this
  const lockDir = path.join(dir, `.lock.${baseName}`);

  const maxRetries = 50;
  const retryDelayMs = 20;

  // Spin-wait to acquire the shared lock
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      // Atomic mkdir - only one caller wins, others get EEXIST
      await fs.mkdir(lockDir, { recursive: false });

      // We acquired the lock - now find unique path
      try {
        let targetPath = absolutePath;
        let counter = 0;

        // Check if base file exists
        try {
          await fs.access(absolutePath, fsConstants.F_OK);
          // Base file exists, need to find unique suffix
          counter = 1;
        } catch {
          // Base file doesn't exist - create placeholder and return
          await fs.writeFile(absolutePath, "");
          return absolutePath;
        }

        // Find next available _N suffix
        while (true) {
          targetPath = path.join(dir, `${baseName}_${counter}${ext}`);
          try {
            await fs.access(targetPath, fsConstants.F_OK);
            // This _N exists, try next
            counter++;
          } catch {
            // Found available slot - create placeholder to reserve it
            await fs.writeFile(targetPath, "");
            return targetPath;
          }
        }
      } finally {
        // Always release lock
        try {
          await fs.rmdir(lockDir);
        } catch {
          // Ignore cleanup errors
        }
      }
    } catch (err) {
      if (err.code === "EEXIST") {
        // Another caller holds the lock - wait and retry
        await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
        continue;
      }
      if (err.code === "ENOENT") {
        // Directory doesn't exist yet - create it and retry
        try {
          await fs.mkdir(dir, { recursive: true });
        } catch {
          // Ignore - may have been created by another caller
        }
        continue;
      }
      throw err;
    }
  }

  // Exhausted retries - fall back to timestamp-based unique name
  console.warn(
    `[preventDuplicateFiles] Lock acquisition timed out, using timestamp fallback`,
  );
  const timestamp = Date.now();
  const fallbackPath = path.join(dir, `${baseName}_${timestamp}${ext}`);
  return fallbackPath;
}

/**
 * Validates and normalizes input object by checking required fields
 * @param {Object} input - Input object to validate
 * @param {string[]} requiredFields - Array of required field names
 * @param {string} [defaultExtension="docx"] - Default file extension (e.g., "docx", "xlsx")
 * @returns {Object} Normalized copy of input with default outputPath if missing
 * @throws {Error} If input is invalid or required fields are missing
 */
export function validateAndNormalizeInput(
  input,
  requiredFields,
  defaultExtension = "docx",
) {
  if (!input || typeof input !== "object") {
    throw new Error("Input must be an object");
  }

  const normalized = { ...input };

  // Check all required fields exist
  for (const field of requiredFields) {
    if (!(field in normalized)) {
      throw new Error(`Required field '${field}' is missing`);
    }
  }

  // Set default output path if not provided
  if (!normalized.outputPath) {
    const defaultFilename = `document.${defaultExtension}`;
    normalized.outputPath = path.join(process.cwd(), "output", defaultFilename);
  } else {
    // Force correct extension on provided path
    // This handles .md → .docx, .txt → .xlsx conversions automatically
    const parsedPath = path.parse(normalized.outputPath);
    if (parsedPath.ext.toLowerCase() !== `.${defaultExtension}`) {
      normalized.outputPath = path.format({
        ...parsedPath,
        base: undefined,
        ext: `.${defaultExtension}`,
      });
    }
  }

  return normalized;
}

/**
 * Ensures a directory exists, creating it if necessary
 * @param {string} dirPath - Path to the directory
 * @throws {Error} If directory creation fails
 */
export async function ensureDirectory(dirPath) {
  try {
    await fs.mkdir(dirPath, { recursive: true });
  } catch (err) {
    throw new Error(
      `Failed to create output directory '${dirPath}': ${err.message}`,
    );
  }
}

// ============================================================================
// CATEGORY-RELATED UTILITIES
// ============================================================================

/**
 * Resolve category to subfolder path within docs/
 * @param {string} category - Category name
 * @returns {Object} { subfolder, fullPath }
 */
export function getCategoryPath(category) {
  const categoryInfo = getCategoryInfo(category);

  if (!categoryInfo) {
    // Default to documents/ for unknown categories
    return { subfolder: "documents", fullPath: path.join("docs", "documents") };
  }

  return {
    subfolder: categoryInfo.path,
    fullPath: path.join("docs", categoryInfo.path)
  };
}

/**
 * Apply category to output path (adds subfolder if needed)
 * @param {string} outputPath - Original output path
 * @param {string} category - Category to apply
 * @returns {Object} { outputPath, wasCategorized }
 */
export function applyCategoryToPath(outputPath, category) {
  if (!category) {
    return { outputPath, wasCategorized: false };
  }

  const resolvedPath = path.isAbsolute(outputPath)
    ? outputPath
    : path.resolve(process.cwd(), outputPath);

  const categoryInfo = getCategoryPath(category);
  const docsRoot = path.join(process.cwd(), "docs");

  // If already in docs/, check if it's in the correct subfolder
  let relativePath;
  try {
    relativePath = path.relative(docsRoot, resolvedPath);
  } catch {
    return { outputPath, wasCategorized: false };
  }

  if (relativePath.startsWith(categoryInfo.subfolder + path.sep)) {
    // Already in correct category folder
    return { outputPath, wasCategorized: false };
  }

  // Need to add category subfolder
  const parsedPath = path.parse(path.basename(resolvedPath));
  const newFilePath = `${parsedPath.name}${parsedPath.ext}`;
  const newPath = path.join(docsRoot, categoryInfo.subfolder, newFilePath);

  return {
    outputPath: newPath,
    wasCategorized: true
  };
}

/**
 * Get available categories for AI models to choose from
 * @returns {Array} Array of category objects with name, path, and description
 */
export function getAvailableCategories() {
  return getCategoriesFromClassifier().map(cat => ({
    name: cat.name,
    path: `docs/${cat.path}/`,
    description: cat.description
  }));
}

/**
 * Register a document in the registry
 * @param {Object} doc - Document info to register
 */
export async function registerDocumentInRegistry(doc) {
  try {
    return await registerDocument({
      title: doc.title,
      filePath: path.isAbsolute(doc.filePath) ? doc.filePath : path.resolve(process.cwd(), doc.filePath),
      category: doc.category,
      tags: doc.tags || [],
      description: doc.description
    });
  } catch (err) {
    console.warn("Failed to register document:", err.message);
    return null;
  }
}

/**
 * Check for duplicate documents in registry
 * @param {string} title - Document title to check
 * @param {string} [category] - Expected category
 * @returns {Array} Array of duplicate candidates
 */
export async function getDuplicateCandidates(title, category) {
  try {
    return await findDocuments({ title, category });
  } catch (err) {
    console.warn("Failed to check for duplicates:", err.message);
    return [];
  }
}

/**
 * Classify document content and return category
 * @param {string} title - Document title
 * @param {string} [content] - Document content for analysis
 * @returns {Object} Category classification result
 */
export function classifyDocumentContent(title, content) {
  return classifyDocument(title, content);
}

// ============================================================================
// REGISTRY QUERY UTILITIES
// ============================================================================

/**
 * List all documents in the registry with optional filtering
 * @param {Object} filters - Optional filtering criteria
 * @param {string} [filters.category] - Filter by category
 * @param {Array<string>} [filters.tags] - Filter by tags (matches any)
 * @param {string} [filters.title] - Filter by title (partial match)
 * @returns {Array} Array of document objects from registry
 */
export async function listDocuments(filters = {}) {
  try {
    const docs = await findDocuments({});

    return docs.filter(doc => {
      if (filters.category && doc.category !== filters.category) {
        return false;
      }
      if (filters.tags && !doc.tags.some(tag => filters.tags.includes(tag))) {
        return false;
      }
      if (filters.title && !doc.title.toLowerCase().includes(filters.title.toLowerCase())) {
        return false;
      }
      return true;
    });
  } catch (err) {
    console.warn("Failed to list documents:", err.message);
    return [];
  }
}

/**
 * Search registry by title, category, or tags
 * @param {Object} criteria - Search parameters
 * @param {string} [criteria.title] - Title to search for (partial match)
 * @param {string} [criteria.category] - Category to filter by
 * @param {Array<string>} [criteria.tags] - Tags to match (any tag)
 * @returns {Object} Search results with matches and metadata
 */
export async function searchRegistry(criteria = {}) {
  try {
    const allDocs = await findDocuments({});

    let matches = allDocs.filter(doc => {
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

    // Group by category
    const byCategory = {};
    for (const doc of matches) {
      if (!byCategory[doc.category]) {
        byCategory[doc.category] = [];
      }
      byCategory[doc.category].push(doc);
    }

    return {
      query: criteria,
      totalMatches: matches.length,
      byCategory,
      documents: matches
    };
  } catch (err) {
    console.warn("Failed to search registry:", err.message);
    return { query: criteria, totalMatches: 0, byCategory: {}, documents: [] };
  }
}
