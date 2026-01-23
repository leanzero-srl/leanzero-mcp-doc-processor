import fs from "fs/promises";
import { constants as fsConstants } from "fs";
import path from "path";

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
    console.log(
      `[enforceDocsFolder] Path already in docs/: ${outputPath}, no enforcement needed`,
    );
    return { outputPath: resolvedPath, wasEnforced: false };
  }

  // Enforce docs/ folder for paths not already in docs/
  const parsedPath = path.parse(path.basename(resolvedPath));
  const docsPath = path.join(projectRoot, "docs", parsedPath.base);
  console.log(
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
