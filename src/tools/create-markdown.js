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
  resolveClientHint,
  uploadFileToTarget,
  mimeTypeFromExtension,
} from "./utils.js";
import { applyImplementationStyle } from "../utils/markdown-formatter.js";
import { assessFormattingQuality, shouldRejectPlainText } from "../utils/formatting-quality.js";
import { resolveClientProfile } from "../utils/client-profile.js";
import { logInsight, memoryNudge } from "../utils/insights.js";
import { log } from "../utils/logger.js";

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

    // Process paragraphs - parse JSON strings if needed. Weak-model convenience:
    // accept the whole body as a single markdown string via `content` when no
    // explicit paragraphs array is given.
    let paragraphs = Array.isArray(parsedInput.paragraphs) && parsedInput.paragraphs.length > 0
      ? parsedInput.paragraphs
      : (typeof parsedInput.content === "string" && parsedInput.content.trim()
          ? [parsedInput.content]
          : []);

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

    // Assess structural formatting for the correction signal / optional guard.
    const formattingQuality = assessFormattingQuality({
      paragraphs,
      content: parsedInput.content,
    });
    if (!parsedInput.dryRun && shouldRejectPlainText(formattingQuality)) {
      return {
        success: false,
        error: "PLAIN_TEXT",
        message: `Refusing to create an unformatted plain-text document (REQUIRE_FORMATTING is on). ${formattingQuality.hint}`,
        hint: formattingQuality.hint,
        formattingQuality,
      };
    }

    // Get category and tags from parsedInput (handles JSON-string inputs)
    let category = parsedInput.category || null;
    const tags = Array.isArray(parsedInput.tags) ? parsedInput.tags : [];

    // Auto-classify if no category provided and title/content available
    if (!category && parsedInput.title) {
      const classification = classifyDocumentContent(parsedInput.title, "");
      if (classification.category !== "misc") {
        category = classification.category;
        log("info",
          `[create-markdown] Auto-classified document as "${category}" (confidence: ${classification.confidence})`,
        );
      }
    }

    // Normalize input with extension handling FIRST
    const normalized = validateAndNormalizeInput(parsedInput, [], "md");
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
    const enforceDocs = parsedInput.enforceDocsFolder !== false;
    let { outputPath: docsPath, wasEnforced: docsEnforced } = enforceDocsFolder(
      outputPath,
      enforceDocs,
    );

    if (docsEnforced) {
      outputPath = docsPath;
    }

    // Dry run mode: return a preview without writing to disk
    // Must be checked BEFORE preventDuplicateFiles which creates placeholder files
    if (parsedInput.dryRun) {
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
          formattingQuality,
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
    const preventDupes = parsedInput.preventDuplicates !== false;
    const uniquePath = await preventDuplicateFiles(outputPath, preventDupes);
    const wasDuplicatePrevented = uniquePath !== outputPath;
    outputPath = uniquePath;

    // Ensure output directory exists
    await ensureDirectory(path.dirname(outputPath));

    if (docsEnforced) {
      log("info",
        `[create-markdown] Enforced docs/ folder structure. File placed in: ${path.relative(
          process.cwd(),
          outputPath,
        )}`,
      );
    }
    if (wasDuplicatePrevented) {
      log("info",
        `[create-markdown] Prevented duplicate file. Created: ${path.basename(
          outputPath,
        )}`,
      );
    }

    // Build markdown content with implementation style formatting. Markdown-only
    // superpowers: auto Table of Contents (anchor links) and YAML frontmatter.
    const markdownContent = buildMarkdownContent(title, paragraphs, {
      toc: parsedInput.toc === true,
      frontmatter:
        parsedInput.frontmatter && typeof parsedInput.frontmatter === "object"
          ? parsedInput.frontmatter
          : null,
    });

    // Write the markdown file directly (no user confirmation required)
    await fs.writeFile(outputPath, markdownContent, "utf-8");

    // Register document in registry (non-blocking, failure is non-fatal)
    let registryEntry = null;
    try {
      const autoDescription = parsedInput.description || (() => {
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
      log("warn", "[create-markdown] Failed to register document:", { error: err.message });
    }

    // Optional: upload the freshly-written file to a remote endpoint via JSON envelope.
    let uploadResult = null;
    let uploadError = null;
    if (parsedInput.uploadUrl && parsedInput.uploadAuthHeader) {
      try {
        uploadResult = await uploadFileToTarget({
          filePath: outputPath,
          uploadUrl: parsedInput.uploadUrl,
          uploadAuthHeader: parsedInput.uploadAuthHeader,
          filename: parsedInput.uploadFilename,
          mimeType: mimeTypeFromExtension(outputPath),
        });
      } catch (err) {
        uploadError = err.message;
        log("warn", "[create-markdown] upload failed (file still written locally)", { error: err.message });
      }
    } else if (parsedInput.uploadUrl || parsedInput.uploadAuthHeader) {
      uploadError = "uploadUrl and uploadAuthHeader must be provided together";
      log("warn", "[create-markdown] partial upload params — both uploadUrl and uploadAuthHeader required");
    }

    const clientMode = resolveClientHint(parsedInput);
    const isInteractive = clientMode === "interactive";

    // Learning loop: record the event (for the creator) + nudge memory-capable agents.
    const profile = resolveClientProfile(parsedInput);
    logInsight({
      server: "doc-processor", tool: "create-markdown", event: "success",
      client: profile.clientName, memoryCapable: profile.canPersistMemory,
      title, format: "markdown", category: category || null,
      toc: parsedInput.toc === true, frontmatter: !!parsedInput.frontmatter,
    });
    const learning = `For ${category || "technical"} markdown, create-markdown${parsedInput.toc === true ? " with toc:true" : ""}${parsedInput.frontmatter ? " + frontmatter" : ""} and a single \`content\` string worked — reuse for repo/dev docs.`;

    // Build message with enforcement information (agent mode only)
    let enforcementMessage = "";
    if (!isInteractive) {
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
    }

    const uploadInteractiveMsg = uploadResult
      ? `Created and uploaded: ${outputPath} → ${uploadResult.attachment?.content || uploadResult.attachment?.id || "remote endpoint"}`
      : uploadError
        ? `Created locally at ${outputPath}; upload failed: ${uploadError}`
        : `Created: ${outputPath}`;

    const uploadAgentNote = uploadResult
      ? `\nUPLOADED: file POSTed to remote endpoint (status ${uploadResult.status}). Receiver returned: ${JSON.stringify(uploadResult.attachment).slice(0, 300)}\n`
      : uploadError
        ? `\nUPLOAD FAILED: ${uploadError}\nThe local file is still available at ${outputPath}.\n`
        : "";

    const interactiveMessage = uploadInteractiveMsg;
    const agentMessage = `MARKDOWN FILE WRITTEN TO DISK at: ${outputPath}\n\nIMPORTANT: This tool has created an actual .md file on your filesystem. The document is available at the absolute path shown above.\n\n${enforcementMessage}` + uploadAgentNote;

    // Only surface upload fields when the caller opted into the upload path.
    const uploadAttempted = !!uploadResult || !!uploadError;
    const uploadFields = uploadAttempted
      ? {
          uploaded: !!uploadResult,
          uploadAttachment: uploadResult?.attachment || null,
          uploadStatus: uploadResult?.status || null,
          uploadError: uploadError || null,
        }
      : {};

    return {
      success: true,
      filePath: outputPath,
      clientMode,
      ...uploadFields,
      category: category || null,
      tags: tags.length > 0 ? tags : null,
      wasCategorized: wasCategorized,
      registryEntry: registryEntry
        ? { id: registryEntry.id, category: registryEntry.category }
        : null,
      formattingQuality: isInteractive ? undefined : formattingQuality,
      memoryNudge: (isInteractive || !profile.canPersistMemory) ? undefined : memoryNudge(learning, `create-markdown:${category || "technical"}`),
      enforcement: isInteractive ? undefined : {
        docsFolderEnforced: docsEnforced,
        duplicatePrevented: wasDuplicatePrevented,
        categorized: wasCategorized,
        categoryApplied: category || null,
      },
      message: isInteractive ? interactiveMessage : agentMessage,
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
 * GitHub-style anchor slug for a heading (lowercase, spaces→-, punctuation
 * stripped). Mirrors how GitHub/most static-site renderers generate anchors so
 * the TOC links actually resolve.
 */
function slugify(text) {
  return String(text)
    .toLowerCase()
    .replace(/[`*_~]/g, "")        // strip inline markdown markers
    .replace(/[^\w\s-]/g, "")      // drop punctuation
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

/**
 * Build a Markdown Table of Contents from the H2/H3 headings in a body.
 * Skips headings inside fenced code blocks and de-dupes slugs the GitHub way
 * (foo, foo-1, foo-2). Returns "" when there are no sub-headings.
 */
function generateToc(body) {
  const noCode = body.replace(/```[\s\S]*?```/g, "");
  const re = /^(#{2,3})\s+(.+?)\s*#*$/gm;
  const items = [];
  const seen = Object.create(null);
  let m;
  while ((m = re.exec(noCode)) !== null) {
    const depth = m[1].length; // 2 or 3
    const text = m[2].replace(/[`*_~]/g, "").trim();
    let slug = slugify(text);
    if (slug in seen) { seen[slug] += 1; slug = `${slug}-${seen[slug]}`; }
    else { seen[slug] = 0; }
    const indent = depth === 3 ? "  " : "";
    items.push(`${indent}- [${text}](#${slug})`);
  }
  return items.join("\n");
}

/** Serialize a flat/array YAML frontmatter object into a --- block. */
function serializeFrontmatter(fm) {
  const yamlValue = (v) => {
    const s = String(v);
    return /[:#[\]{}",]|^\s|\s$/.test(s) ? JSON.stringify(s) : s;
  };
  const out = ["---"];
  for (const [k, v] of Object.entries(fm)) {
    if (Array.isArray(v)) {
      out.push(`${k}:`);
      for (const item of v) out.push(`  - ${yamlValue(item)}`);
    } else if (v !== null && typeof v === "object") {
      out.push(`${k}:`);
      for (const [ik, iv] of Object.entries(v)) out.push(`  ${ik}: ${yamlValue(iv)}`);
    } else {
      out.push(`${k}: ${yamlValue(v)}`);
    }
  }
  out.push("---", "");
  return out.join("\n");
}

/**
 * Build markdown content from title and paragraphs with implementation style
 * formatting, plus markdown-native extras: optional YAML frontmatter and an
 * auto-generated, anchor-linked Table of Contents.
 *
 * @param {string} title - Document title (becomes H1)
 * @param {Array<string|Object>} paragraphs - Paragraph objects or strings
 * @param {Object} [opts]
 * @param {boolean} [opts.toc] - Prepend an auto TOC of the H2/H3 headings
 * @param {Object|null} [opts.frontmatter] - YAML frontmatter key/values
 * @returns {string} Formatted markdown content
 */
function buildMarkdownContent(title, paragraphs, opts = {}) {
  const lines = [];

  // YAML frontmatter first (must be the very top of the file).
  if (opts.frontmatter && typeof opts.frontmatter === "object") {
    lines.push(serializeFrontmatter(opts.frontmatter));
  }

  // Title as H1 heading
  lines.push(`# ${title}`);
  lines.push(""); // Blank line after title

  const formattedContent = applyImplementationStyle(paragraphs) || "";

  // Auto Table of Contents (markdown-only superpower) from the body headings.
  if (opts.toc) {
    const toc = generateToc(formattedContent);
    if (toc) {
      lines.push("## Table of Contents", "", toc, "");
    }
  }

  if (formattedContent) {
    lines.push(formattedContent);
  }

  return lines.join("\n");
}