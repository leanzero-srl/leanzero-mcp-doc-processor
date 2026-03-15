import fs from "fs/promises";
import path from "path";
import {
  validateAndNormalizeInput,
  ensureDirectory,
  enforceDocsFolder,
  preventDuplicateFiles,
  applyCategoryToPath,
  registerDocumentInRegistry,
  getCategoryPath,
  classifyDocumentContent,
} from "./utils.js";
import { applyImplementationStyle } from "../utils/markdown-formatter.js";

/**
 * Creates a markdown document from structured content with implementation-style formatting
 * 
 * @param {Object} input - Document creation parameters
 * @param {string} input.title - Document title (becomes H1 heading)
 * @param {Array} input.paragraphs - Array of paragraph objects or strings
 * @param {string} [input.outputPath] - Output file path (default: derived from title)
 * @param {string} [input.category] - Document category for folder organization
 * @param {Array<string>} [input.tags] - Tags for registry search
 * @param {string} [input.description] - Brief description for registry
 * @param {boolean} [input.dryRun=false] - Preview without writing to disk
 * @returns {Promise<Object>} Result with filePath, success status, message
 */
export async function createMarkdown(input) {
  try {
    // Parse input if it's a JSON string (for MCP compatibility)
    const parsedInput = typeof input === "string" ? JSON.parse(input) : input;

    // Validate title is semantically meaningful — reject generic placeholders
    const GENERIC_TITLES = new Set([
      "untitled", "untitled document", "new document", "document", "doc",
      "file", "output", "temp", "tmp",
      "new file", "unnamed", "no title",
    ]);
    const rawTitle = (parsedInput.title || "").trim();
    if (!rawTitle) {
      return {
        success: false,
        error: "GENERIC_TITLE",
        message: `Title is empty. Please provide a specific, descriptive title that reflects the document's actual content.\n\n` +
          `Good examples: "Q1 2026 Engineering Strategy", "REST API Design Guidelines", "Authentication Implementation Guide"`,
      };
    }
    if (GENERIC_TITLES.has(rawTitle.toLowerCase())) {
      return {
        success: false,
        error: "GENERIC_TITLE",
        message: `Title "${rawTitle}" is too generic. Please provide a specific, descriptive title that reflects the document's actual content.\n\n` +
          `Good examples: "Q1 2026 Engineering Strategy", "REST API Design Guidelines", "Authentication Implementation Guide"\n` +
          `Bad examples: "Document", "Untitled", "File", "Output"`,
      };
    }
    const title = rawTitle;

    // Process paragraphs - parse JSON strings if needed
    let paragraphs = Array.isArray(parsedInput.paragraphs)
      ? parsedInput.paragraphs
      : [];

    // Parse paragraph objects if they're JSON strings
    paragraphs = paragraphs.map((para) => {
      if (
        typeof para === "string" &&
        para.startsWith("{") &&
        para.endsWith("}")
      ) {
        try {
          return JSON.parse(para);
        } catch (e) {
          return para;
        }
      }
      return para;
    });

    // Get category and tags from input
    let category = input.category || null;
    const tags = Array.isArray(input.tags) ? input.tags : [];

    // Auto-classify if no category provided and title/content available
    if (!category && input.title) {
      const classification = classifyDocumentContent(input.title, "");
      if (classification.category !== "misc") {
        category = classification.category;
        console.error(
          `[create-markdown] Auto-classified document as "${category}" (confidence: ${classification.confidence})`,
        );
      }
    }

    // Normalize input with extension handling FIRST
    const normalized = validateAndNormalizeInput(input, [], "md");
    let outputPath = normalized.outputPath;
    if (!path.isAbsolute(outputPath)) {
      outputPath = path.resolve(process.cwd(), outputPath);
    }

    // Apply category-based subfolder organization
    const { outputPath: categorizedPath, wasCategorized } = applyCategoryToPath(
      outputPath,
      category,
    );
    outputPath = categorizedPath;

    // Enforce docs/ folder FIRST so duplicate prevention checks the final location
    const enforceDocs = input.enforceDocsFolder !== false;
    let { outputPath: docsPath, wasEnforced: docsEnforced } = enforceDocsFolder(
      outputPath,
      enforceDocs,
    );

    if (docsEnforced) {
      outputPath = docsPath;
    }

    // Dry run mode: return a preview without writing to disk
    // Must be checked BEFORE preventDuplicateFiles which creates placeholder files
    if (input.dryRun) {
      const paraCount = paragraphs.length;
      const totalParaChars = paragraphs.reduce((sum, p) => {
        const text = typeof p === "string" ? p : (p && p.text) || "";
        return sum + text.length;
      }, 0);

      return {
        success: true,
        dryRun: true,
        preview: {
          title: title,
          outputPath: outputPath,
          paragraphCount: paraCount,
          approximateContentLength: totalParaChars,
          category: category || null,
          tags: tags.length > 0 ? tags : null,
          wasCategorized: wasCategorized,
        },
        enforcement: {
          docsFolderEnforced: docsEnforced,
          categorized: wasCategorized,
          categoryApplied: category || null,
        },
        message: `DRY RUN - No file written. Preview of markdown document that would be created:\n\nTitle: "${title}"\nPath: ${outputPath}\nParagraphs: ${paraCount}\n\nCall this tool again without dryRun (or with dryRun: false) to create the file.`,
      };
    }

    // THEN prevent duplicate files (checks the final docs/ location)
    const preventDupes = input.preventDuplicates !== false;
    const uniquePath = await preventDuplicateFiles(outputPath, preventDupes);
    const wasDuplicatePrevented = uniquePath !== outputPath;
    outputPath = uniquePath;

    // Ensure output directory exists
    await ensureDirectory(path.dirname(outputPath));

    // Log enforcement actions to teach AI models
    if (docsEnforced) {
      console.error(
        `[create-markdown] Enforced docs/ folder structure. File placed in: ${path.relative(
          process.cwd(),
          outputPath,
        )}`,
      );
    }
    if (wasDuplicatePrevented) {
      console.error(
        `[create-markdown] Prevented duplicate file. Created: ${path.basename(
          outputPath,
        )}`,
      );
    }

    // Build markdown content with implementation style formatting
    const markdownContent = buildMarkdownContent(title, paragraphs);

    // Write the markdown file directly (no user confirmation required)
    await fs.writeFile(outputPath, markdownContent, "utf-8");

    // Register document in registry (non-blocking, failure is non-fatal)
    let registryEntry = null;
    try {
      const autoDescription = input.description || (() => {
        const firstTextPara = paragraphs.find(p => typeof p === "string" ? p.trim() : (p.text && !p.headingLevel));
        const text = typeof firstTextPara === "string" ? firstTextPara : firstTextPara?.text;
        return text ? text.slice(0, 200).trim() : title;
      })();

      registryEntry = await registerDocumentInRegistry({
        title: title,
        filePath: outputPath,
        category: category || "misc",
        tags: tags,
        description: autoDescription,
      });
    } catch (err) {
      console.warn("Failed to register document:", err.message);
    }

    // Build message with enforcement information
    let enforcementMessage = "";
    if (docsEnforced) {
      enforcementMessage += `NOTE: File was automatically placed in docs/ folder for organization. To disable this, set enforceDocsFolder: false.\n`;
    }
    if (wasDuplicatePrevented) {
      enforcementMessage += `NOTE: Duplicate file detected and prevented. Used unique filename: ${path.basename(
        outputPath,
      )}. To allow duplicates, set preventDuplicates: false.\n`;
    }
    if (wasCategorized) {
      enforcementMessage += `NOTE: Document categorized as "${category}" and placed in docs/${getCategoryPath(category).subfolder}/.\n`;
    }
    if (registryEntry) {
      enforcementMessage += `NOTE: Document registered in registry (ID: ${registryEntry.id}).\n`;
    }

    return {
      success: true,
      filePath: outputPath,
      category: category || null,
      tags: tags.length > 0 ? tags : null,
      wasCategorized: wasCategorized,
      registryEntry: registryEntry
        ? { id: registryEntry.id, category: registryEntry.category }
        : null,
      enforcement: {
        docsFolderEnforced: docsEnforced,
        duplicatePrevented: wasDuplicatePrevented,
        categorized: wasCategorized,
        categoryApplied: category || null,
      },
      message: `MARKDOWN FILE WRITTEN TO DISK at: ${outputPath}\n\nIMPORTANT: This tool has created an actual .md file on your filesystem. The document is available at the absolute path shown above.\n\n${enforcementMessage}`,
    };
  } catch (err) {
    return {
      success: false,
      error: err.message,
      message: `Failed to create markdown document: ${err.message}`,
    };
  }
}

/**
 * Build markdown content from title and paragraphs with implementation style formatting
 * @param {string} title - Document title (becomes H1)
 * @param {Array<string|Object>} paragraphs - Array of paragraph objects or strings
 * @returns {string} Formatted markdown content
 */
function buildMarkdownContent(title, paragraphs) {
  const lines = [];

  // Add title as H1 heading
  lines.push(`# ${title}`);
  lines.push(""); // Blank line after title

  // Apply implementation style formatting to paragraphs
  const formattedContent = applyImplementationStyle(paragraphs);
  
  if (formattedContent) {
    lines.push(formattedContent);
  }

  return lines.join("\n");
}