import fs from "fs/promises";
import { constants as fsConstants } from "fs";
import path from "path";

import { classifyDocument, getCategoryInfo } from "../utils/categorizer.js";
import {
  registerDocument,
  findDocuments
} from "../utils/registry.js";
import { log } from "../utils/logger.js";
import { requestContext } from "../utils/request-context.js";

/**
 * Root directory for all generated files.
 *
 * Defaults to the MCP process's current working directory. For a stdio MCP
 * launched by an agent (e.g. Claude Code), cwd is the workspace/project the
 * agent was opened from — so files land THERE, on the caller's machine, not on
 * a remote host. Set the DOC_OUTPUT_DIR env var to pin a fixed location instead
 * (e.g. an LM Studio config that should always write to ~/Documents/...).
 *
 * NOTE: this only puts files on the caller's machine when the server runs
 * locally (stdio). A REMOTE/hosted server writes to the HOST's disk — that is a
 * hard client/server boundary, not a setting.
 *
 * @returns {string} absolute output root
 */
export function getOutputRoot() {
  // 1) Per-request override from the hosted HTTP layer (X-Output-Dir header),
  //    carried via AsyncLocalStorage. SANDBOXED under a server base so a remote
  //    tenant can only organize files within an allowed area — it can NOT write
  //    to arbitrary server paths, and (being server-side) it does NOT reach the
  //    caller's own machine. For files on your machine, self-host over stdio.
  const ctx = requestContext.getStore && requestContext.getStore();
  if (ctx && ctx.outputDir && String(ctx.outputDir).trim()) {
    const base = process.env.CLIENT_OUTPUT_BASE
      || path.join(process.env.DATA_DIR || process.cwd(), "client-output");
    const sub = path.normalize(String(ctx.outputDir))
      .replace(/^([./\\]|\.\.[/\\]?)+/, "")  // strip leading ./ ../ and slashes
      .replace(/^[/\\]+/, "");
    const resolved = path.resolve(base, sub);
    return resolved.startsWith(path.resolve(base)) ? resolved : path.resolve(base);
  }

  // 2) Operator/self-host env (trusted — your own machine), unsandboxed.
  const override = process.env.DOC_OUTPUT_DIR;
  if (override && override.trim()) {
    return path.isAbsolute(override)
      ? override
      : path.resolve(process.cwd(), override);
  }

  // 3) Default: the launch dir (stdio agents → their workspace).
  return process.cwd();
}

/**
 * Enforces docs/ folder structure for file organization
 * @param {string} outputPath - The requested output path
 * @param {boolean} enforceDocsFolder - Whether to enforce docs/ folder (default: true)
 * @param {string} projectRoot - Project root directory (default: getOutputRoot())
 * @returns {Object} { outputPath, wasEnforced }
 */
export function enforceDocsFolder(
  outputPath,
  enforceDocsFolder = true,
  projectRoot = getOutputRoot(),
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
    return { outputPath: resolvedPath, wasEnforced: false };
  }

  // Enforce docs/ folder for paths not already in docs/
  const parsedPath = path.parse(path.basename(resolvedPath));
  const docsPath = path.join(projectRoot, "docs", parsedPath.base);
  log("debug",
    `[enforceDocsFolder] redirected ${outputPath} → ${docsPath}`,
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
  log("warn",
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

  // Set default output path if not provided — derive from title when available
  if (!normalized.outputPath) {
    const slug = normalized.title
      ? normalized.title
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")   // non-alphanumeric → hyphen
          .replace(/^-+|-+$/g, "")         // trim leading/trailing hyphens
          .slice(0, 80)                    // cap length
      : null;
    const defaultFilename = slug
      ? `${slug}.${defaultExtension}`
      : `document.${defaultExtension}`;
    normalized.outputPath = path.join(getOutputRoot(), "output", defaultFilename);
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
    : path.resolve(getOutputRoot(), outputPath);

  const categoryInfo = getCategoryPath(category);
  const docsRoot = path.join(getOutputRoot(), "docs");

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
    log("warn", "Failed to register document:", { error: err.message });
    return null;
  }
}

// NOTE: getDuplicateCandidates was removed — it was exported but never called.
// Duplicate detection lives in src/services/ai-guidance-system.js → checkForExistingDocument.

/**
 * Resolve a `clientHint` value into a concrete output mode.
 *
 * Inputs (priority order):
 *   1. params.clientHint, if "agent" or "interactive" — explicit caller wins.
 *   2. params.clientHint === "auto" or absent → run the heuristic.
 *
 * Heuristic for "auto":
 *   a. MCP_CLIENT_TYPE env var if set to "interactive" or "agent".
 *   b. Input shape: a single huge markdown string suggests a human-style
 *      paste (lean toward "interactive"); structured paragraph blocks with
 *      explicit headingLevel suggest agent calls.
 *   c. Default to "agent" so existing automation keeps its verbose response.
 *
 * @param {Object} params - The full caller arguments
 * @returns {"agent" | "interactive"}
 */
export function resolveClientHint(params = {}) {
  const explicit = params.clientHint;
  if (explicit === "agent" || explicit === "interactive") return explicit;

  const env = (process.env.MCP_CLIENT_TYPE || "").toLowerCase();
  if (env === "interactive" || env === "agent") return env;

  // Heuristic: structured input (objects with headingLevel) → agent
  if (Array.isArray(params.paragraphs)) {
    const structuredCount = params.paragraphs.filter(
      (p) => p && typeof p === "object" && (p.headingLevel || p.text),
    ).length;
    if (structuredCount > 0) return "agent";
    // Single string paragraph longer than 1KB suggests a human paste
    const singleBigString =
      params.paragraphs.length === 1 &&
      typeof params.paragraphs[0] === "string" &&
      params.paragraphs[0].length > 1024;
    if (singleBigString) return "interactive";
  }

  return "agent";
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
    log("warn", "Failed to list documents:", { error: err.message });
    return [];
  }
}

// ============================================================================
// REMOTE UPLOAD (mirror of read-doc URL fetch path)
// ============================================================================

/**
 * Map a file extension to its MIME type. Used by the upload helper to fill the
 * envelope's `mimeType` field so the receiving endpoint can choose the right
 * content type when forwarding to e.g. Jira's attachment endpoint.
 *
 * @param {string} filePath - Path or filename
 * @returns {string} A best-guess MIME type (defaults to application/octet-stream)
 */
const MIME_BY_EXT = {
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".md":   "text/markdown",
  ".pdf":  "application/pdf",
  ".txt":  "text/plain",
  ".csv":  "text/csv",
};

export function mimeTypeFromExtension(filePath) {
  if (!filePath || typeof filePath !== "string") return "application/octet-stream";
  return MIME_BY_EXT[path.extname(filePath).toLowerCase()] || "application/octet-stream";
}

/**
 * Build a redacted version of a URL for logging — keeps the host + path so
 * traces are useful, drops the `?t=<token>` query parameter and any other
 * query/fragment that might carry secrets.
 *
 * @param {string} urlString
 * @returns {string} `<host><pathname>` or `(unparseable URL)` on error
 */
function safeUrlForLogging(urlString) {
  try {
    const u = new URL(urlString);
    return `${u.host}${u.pathname}`;
  } catch {
    return "(unparseable URL)";
  }
}

/**
 * Upload a locally-written file to a remote HTTPS endpoint as a JSON envelope.
 *
 * The envelope shape is identical to what `fetchToTempFile` consumes on the
 * read side — symmetric on the wire so both directions of the bridge use the
 * same security model and audit shape:
 *
 *   POST <uploadUrl>
 *   Authorization: <uploadAuthHeader>
 *   Content-Type: application/json
 *   { "data": "<base64>", "filename": "...", "mimeType": "...", "size": <bytes> }
 *
 * Designed for one-shot upload capabilities (e.g. CogniRunner's per-issue
 * `attachment-upload` web trigger), so the security rules are STRICT:
 *
 *  - `uploadUrl` must be `https://`. Non-HTTPS is rejected before any fetch.
 *  - Redirects are refused (`redirect: "error"`). A legitimate single-use
 *    capability never 3xx's.
 *  - No auto-retry: a 401 means the bearer was wrong (caller error); a 404
 *    means the token was already consumed or expired (single-use).
 *  - `uploadAuthHeader` is NEVER logged. The URL token (if present in `?t=`)
 *    is redacted from log output — only host+path are emitted.
 *  - Payload size is capped by `WRITE_DOC_MAX_BYTES` env var (default 25 MB).
 *  - 60-second timeout to bound stuck network calls.
 *
 * The local file is NOT touched on upload failure — the caller can decide
 * whether to keep it as a record or delete it.
 *
 * @param {Object} args
 * @param {string} args.filePath - Absolute path to the file to upload
 * @param {string} args.uploadUrl - HTTPS URL to POST to
 * @param {string} args.uploadAuthHeader - Authorization header value (e.g. "Bearer abc123")
 * @param {string} [args.filename] - Optional override for the envelope filename (defaults to basename)
 * @param {string} [args.mimeType] - Optional MIME type (defaults to mimeTypeFromExtension)
 * @returns {Promise<{success:true, status:number, attachment:object|null, raw:any}>}
 * @throws {Error} on validation failure, oversize, fetch failure, or non-2xx response
 */
export async function uploadFileToTarget({ filePath, uploadUrl, uploadAuthHeader, filename, mimeType }) {
  if (!filePath || typeof filePath !== "string") {
    throw new Error("uploadFileToTarget: filePath is required");
  }
  if (!uploadUrl || typeof uploadUrl !== "string") {
    throw new Error("uploadFileToTarget: uploadUrl is required");
  }
  if (!uploadAuthHeader || typeof uploadAuthHeader !== "string") {
    throw new Error("uploadFileToTarget: uploadAuthHeader is required");
  }
  if (!/^https:\/\//i.test(uploadUrl)) {
    throw new Error("uploadFileToTarget: uploadUrl must use https://");
  }

  // Safe-to-log breadcrumb — host + path only, never the ?t= token or auth header.
  log("info", "[upload] sending", { url: safeUrlForLogging(uploadUrl) });

  // Read + size-check before allocating the base64 string so we can fail fast
  // on oversize without doubling memory.
  const buf = await fs.readFile(filePath);
  const maxBytes = Number(process.env.WRITE_DOC_MAX_BYTES) || 25 * 1024 * 1024;
  if (buf.length > maxBytes) {
    throw new Error(`uploadFileToTarget: payload too large: ${buf.length} bytes (limit ${maxBytes})`);
  }

  const envelope = {
    data: buf.toString("base64"),
    filename: filename || path.basename(filePath),
    mimeType: mimeType || mimeTypeFromExtension(filePath),
    size: buf.length,
  };

  const resp = await fetch(uploadUrl, {
    method: "POST",
    headers: {
      Authorization: uploadAuthHeader,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    redirect: "error",
    signal: AbortSignal.timeout(60_000),
    body: JSON.stringify(envelope),
  });

  if (!resp.ok) {
    // Do NOT auto-retry — 401 = wrong bearer, 404 = token consumed/expired, 413 = too large, etc.
    const bodyPreview = await resp.text().catch(() => "");
    throw new Error(`upload failed: HTTP ${resp.status} ${bodyPreview.slice(0, 200)}`);
  }

  const ct = resp.headers.get("Content-Type") || "";
  let parsed = null;
  if (/json/i.test(ct)) {
    parsed = await resp.json().catch(() => null);
  }

  // Receiver SHOULD return { success: true, attachment: {...} } but we tolerate
  // any 2xx JSON shape — pull out a sensible attachment object if present.
  const attachment = parsed?.attachment || parsed || null;
  return { success: true, status: resp.status, attachment, raw: parsed };
}
