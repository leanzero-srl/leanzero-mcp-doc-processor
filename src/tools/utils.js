import fs from "fs";
import path from "path";

/**
 * Validates and normalizes input object by checking required fields
 * @param {Object} input - Input object to validate
 * @param {string[]} requiredFields - Array of required field names
 * @returns {Object} Normalized copy of input with default outputPath if missing
 * @throws {Error} If input is invalid or required fields are missing
 */
export function validateAndNormalizeInput(input, requiredFields) {
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
    const defaultFilename = "document.docx";
    normalized.outputPath = path.join(process.cwd(), "output", defaultFilename);
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
    await fs.promises.mkdir(dirPath, { recursive: true });
  } catch (err) {
    throw new Error(
      `Failed to create output directory '${dirPath}': ${err.message}`,
    );
  }
}
