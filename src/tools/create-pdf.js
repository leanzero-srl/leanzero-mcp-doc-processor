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
import {
  getStyleConfig,
  getAvailablePresets,
  getPresetDescription,
  selectStyleBasedOnCategory,
} from "./styling.js";
import { findMatchingTemplate } from "../utils/document-tags.js";
import { applyDNAToInput, loadDNA } from "../utils/dna-manager.js";
import { assessFormattingQuality, shouldRejectPlainText, suggestBetterFormat } from "../utils/formatting-quality.js";
import { renderMarkdownToPdf } from "../services/pdf-renderer.js";
import { log } from "../utils/logger.js";
import { recordWrite } from "../services/lineage-tracker.js";

const GENERIC_TITLES = new Set([
  "untitled", "untitled document", "new document", "document", "doc",
  "file", "output", "temp", "tmp", "new file", "unnamed", "no title",
]);

/**
 * Convert a paragraphs array (strings and/or {text, headingLevel, bold,...})
 * into a single markdown string for the PDF renderer. `content` (a full
 * markdown string) takes precedence when provided.
 */
function buildMarkdownBody(parsedInput) {
  if (typeof parsedInput.content === "string" && parsedInput.content.trim()) {
    return parsedInput.content;
  }
  const paragraphs = Array.isArray(parsedInput.paragraphs) ? parsedInput.paragraphs : [];
  const lines = [];
  for (let para of paragraphs) {
    if (typeof para === "string" && para.startsWith("{") && para.endsWith("}")) {
      try { para = JSON.parse(para); } catch { /* keep string */ }
    }
    if (typeof para === "string") {
      lines.push(para);
    } else if (para && typeof para === "object" && typeof para.text === "string") {
      let text = para.text;
      if (para.bold) text = `**${text}**`;
      if (para.italics) text = `*${text}*`;
      if (para.headingLevel === "heading1") text = `# ${para.text}`;
      else if (para.headingLevel === "heading2") text = `## ${para.text}`;
      else if (para.headingLevel === "heading3") text = `### ${para.text}`;
      lines.push(text);
    }
  }
  return lines.join("\n\n");
}

/**
 * Append a markdown table per `tables` 2D-array entry (first row = header).
 */
function tablesToMarkdown(tables) {
  if (!Array.isArray(tables) || tables.length === 0) return "";
  const blocks = [];
  for (const table of tables) {
    if (!Array.isArray(table) || table.length === 0) continue;
    const rows = table.map((r) => (Array.isArray(r) ? r.map((c) => String(c ?? "")) : []));
    const header = rows[0];
    const sep = header.map(() => "---");
    const body = rows.slice(1);
    const lines = [
      `| ${header.join(" | ")} |`,
      `| ${sep.join(" | ")} |`,
      ...body.map((r) => `| ${r.join(" | ")} |`),
    ];
    blocks.push(lines.join("\n"));
  }
  return blocks.join("\n\n");
}

/**
 * Resolve the style preset: explicit > tag template > category > claude-like.
 * Mirrors create-doc's priority but compact. Never dereferences null.
 */
function resolveStylePreset(parsedInput, userExplicitlySetStyle, category, resolvedTags, title) {
  if (userExplicitlySetStyle) return { preset: parsedInput.stylePreset, reason: "user-specified" };
  if (resolvedTags.length > 0) {
    const matched = findMatchingTemplate(title, "", resolvedTags);
    if (matched && matched.stylePreset) {
      return { preset: matched.stylePreset, reason: `tag-based ("${matched.key}")` };
    }
  }
  if (category) return { preset: selectStyleBasedOnCategory(category), reason: `category "${category}"` };
  if (parsedInput.stylePreset) return { preset: parsedInput.stylePreset, reason: "DNA default" };
  return { preset: "claude-like", reason: "default (claude-like)" };
}

/**
 * Create a styled PDF from markdown content.
 *
 * Same input shape as create-doc (title, content/paragraphs, tables,
 * stylePreset, category, tags, header, footer, margins, dryRun, upload*).
 * Rendered via marked → HTML → CSS-from-preset → Puppeteer (see pdf-renderer).
 */
export async function createPdf(input) {
  try {
    const parsedInput = typeof input === "string" ? JSON.parse(input) : input;

    // Track explicit style before DNA injects one.
    const userExplicitlySetStyle = !!parsedInput.stylePreset;
    const dnaConfig = loadDNA();
    const hasDNA = dnaConfig !== null;
    applyDNAToInput(parsedInput);

    // Title validation
    const rawTitle = (parsedInput.title || "").trim();
    if (!rawTitle || GENERIC_TITLES.has(rawTitle.toLowerCase())) {
      return {
        success: false,
        error: "GENERIC_TITLE",
        message: `Title ${rawTitle ? `"${rawTitle}" is too generic` : "is empty"}. Provide a specific, descriptive title.\n\n` +
          `Good examples: "Q1 2026 Engineering Strategy", "Acme Service Agreement 2026".`,
      };
    }
    const title = rawTitle;

    // Body markdown (content preferred; paragraphs + tables folded in)
    let markdown = buildMarkdownBody(parsedInput);
    const tablesMd = tablesToMarkdown(parsedInput.tables);
    if (tablesMd) markdown = markdown ? `${markdown}\n\n${tablesMd}` : tablesMd;

    // Formatting assessment + optional hard guard
    const formattingQuality = assessFormattingQuality({
      paragraphs: parsedInput.paragraphs,
      content: markdown,
      tables: parsedInput.tables,
    });
    if (!parsedInput.dryRun && shouldRejectPlainText(formattingQuality)) {
      return {
        success: false,
        error: "PLAIN_TEXT",
        message: `Refusing to create an unformatted plain-text PDF (REQUIRE_FORMATTING is on). ${formattingQuality.hint}`,
        hint: formattingQuality.hint,
        formattingQuality,
      };
    }

    // Category (auto-classify if absent)
    let category = parsedInput.category || null;
    const tags = Array.isArray(parsedInput.tags) ? parsedInput.tags : [];
    if (!category) {
      const classification = classifyDocumentContent(title, "");
      if (classification.category !== "misc") category = classification.category;
    }

    // Style resolution
    const { preset: rawPreset, reason: styleReason } = resolveStylePreset(
      parsedInput, userExplicitlySetStyle, category, tags, title,
    );
    let stylePreset = rawPreset;
    if (!getAvailablePresets().includes(stylePreset)) {
      log("warn", `[create-pdf] Style preset "${stylePreset}" not found. Falling back to "minimal".`);
      stylePreset = "minimal";
    }
    const styleConfig = getStyleConfig(stylePreset, parsedInput.style || {});

    // Path resolution (mirror create-doc): normalize → category → enforce docs/
    const normalized = validateAndNormalizeInput(parsedInput, [], "pdf");
    let outputPath = normalized.outputPath;
    if (!path.isAbsolute(outputPath)) outputPath = path.resolve(process.cwd(), outputPath);

    const { outputPath: categorizedPath, wasCategorized } = applyCategoryToPath(outputPath, category);
    outputPath = categorizedPath;

    const enforceDocs = parsedInput.enforceDocsFolder !== false;
    const { outputPath: docsPath, wasEnforced: docsEnforced } = enforceDocsFolder(outputPath, enforceDocs);
    if (docsEnforced) outputPath = docsPath;

    // Dry run
    if (parsedInput.dryRun) {
      return {
        success: true,
        dryRun: true,
        preview: {
          title,
          outputPath,
          stylePreset,
          styleReason,
          approximateContentLength: markdown.length,
          category: category || null,
          tags: tags.length > 0 ? tags : null,
          wasCategorized,
          formattingQuality,
        },
        message: `DRY RUN - No file written. PDF that would be created:\n\nTitle: "${title}"\nPath: ${outputPath}\nStyle: ${stylePreset}\n\nCall again without dryRun to create the file.`,
      };
    }

    // Duplicate prevention + ensure dir
    const preventDupes = parsedInput.preventDuplicates !== false;
    const uniquePath = await preventDuplicateFiles(outputPath, preventDupes);
    const wasDuplicatePrevented = uniquePath !== outputPath;
    outputPath = uniquePath;
    await ensureDirectory(path.dirname(outputPath));

    // Render + write
    const pdfBuffer = await renderMarkdownToPdf({
      title,
      markdown,
      styleConfig,
      toc: parsedInput.toc === true,
      header: parsedInput.header && parsedInput.header.text ? parsedInput.header : null,
      footer: parsedInput.footer && parsedInput.footer.text ? parsedInput.footer : null,
      margins: parsedInput.margins || null,
    });
    await fs.writeFile(outputPath, pdfBuffer);

    // Registry (non-fatal)
    let registryEntry = null;
    try {
      registryEntry = await registerDocumentInRegistry({
        title,
        filePath: outputPath,
        category: category || "misc",
        tags,
        description: parsedInput.description || title,
      });
    } catch (err) {
      log("warn", "[create-pdf] Failed to register document:", { error: err.message });
    }

    // Lineage (non-fatal)
    try { await recordWrite(outputPath); } catch { /* non-fatal */ }

    // Optional upload
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
        log("warn", "[create-pdf] upload failed (file still written locally)", { error: err.message });
      }
    } else if (parsedInput.uploadUrl || parsedInput.uploadAuthHeader) {
      uploadError = "uploadUrl and uploadAuthHeader must be provided together";
    }

    const clientMode = resolveClientHint(parsedInput);
    const isInteractive = clientMode === "interactive";

    let enforcementMessage = "";
    if (!isInteractive) {
      if (docsEnforced) enforcementMessage += `NOTE: File placed in docs/ folder. Set enforceDocsFolder: false to disable.\n`;
      if (wasDuplicatePrevented) enforcementMessage += `NOTE: Duplicate prevented. Used unique filename: ${path.basename(outputPath)}.\n`;
      if (wasCategorized) enforcementMessage += `NOTE: Categorized as "${category}" → docs/${getCategoryPath(category).subfolder}/.\n`;
      if (registryEntry) enforcementMessage += `NOTE: Registered (ID: ${registryEntry.id}).\n`;
    }

    const uploadAttempted = !!uploadResult || !!uploadError;
    const uploadFields = uploadAttempted
      ? {
          uploaded: !!uploadResult,
          uploadAttachment: uploadResult?.attachment || null,
          uploadStatus: uploadResult?.status || null,
          uploadError: uploadError || null,
        }
      : {};

    const interactiveMessage = uploadResult
      ? `Created and uploaded: ${outputPath}`
      : uploadError
        ? `Created locally at ${outputPath}; upload failed: ${uploadError}`
        : `Created: ${outputPath}`;
    const agentMessage = `PDF FILE WRITTEN TO DISK at: ${outputPath}\n\nIMPORTANT: This tool created an actual .pdf file. Do NOT create any additional files. The document is at the absolute path above.\n\n${enforcementMessage}` +
      (uploadResult ? `\nUPLOADED (status ${uploadResult.status}).\n` : uploadError ? `\nUPLOAD FAILED: ${uploadError}\n` : "");

    return {
      success: true,
      filePath: outputPath,
      clientMode,
      ...uploadFields,
      category: category || null,
      tags: tags.length > 0 ? tags : null,
      wasCategorized,
      registryEntry: registryEntry ? { id: registryEntry.id, category: registryEntry.category } : null,
      stylePreset,
      styleReason,
      formattingQuality: isInteractive ? undefined : formattingQuality,
      formatSuggestion: isInteractive ? undefined : suggestBetterFormat({ paragraphs: parsedInput.paragraphs, content: markdown, tables: parsedInput.tables }, "pdf"),
      styleConfig: isInteractive ? undefined : {
        preset: stylePreset,
        description: getPresetDescription(stylePreset),
        font: styleConfig.font,
      },
      dnaApplied: hasDNA,
      message: isInteractive ? interactiveMessage : agentMessage,
    };
  } catch (err) {
    return {
      success: false,
      error: err.message,
      message: `Failed to create PDF: ${err.message}`,
    };
  }
}
