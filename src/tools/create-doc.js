import {
  Document,
  Packer,
  Paragraph,
  AlignmentType,
  HeadingLevel,
} from "docx";

// ============================================================================
// Document Tags System - MCP AI awareness
// ============================================================================

/**
 * Document Tags System - MCP AI awareness
 *
 * Enables tag-based template detection so the model can hint at document type
 * (e.g. tags: ["claude-like"]) and the tool auto-applies an appropriate preset.
 */
import {
  findMatchingTemplate,
  TAG_TO_TEMPLATE,
} from "../utils/document-tags.js";
import fs from "fs/promises";
import path from "path";
import {
  getStyleConfig,
  getAvailablePresets,
  getPresetDescription,
  selectStyleBasedOnCategory,
  buildDocumentStyles,
  createNumberingConfig,
} from "./styling.js";
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
import { applyDNAToInput, loadDNA, recordUsage, signatureSimilarity } from "../utils/dna-manager.js";
import { assessFormattingQuality, shouldRejectPlainText, suggestBetterFormat } from "../utils/formatting-quality.js";
import { resolveClientProfile } from "../utils/client-profile.js";
import { logInsight, memoryNudge } from "../utils/insights.js";
import { log } from "../utils/logger.js";
import { checkForExistingDocument, cleanupExcessVersions, buildGuidanceMessage } from "../services/ai-guidance-system.js";
import { recordWrite } from "../services/lineage-tracker.js";
import { loadBlueprint, listBlueprints } from "../utils/blueprint-store.js";
import { validateAgainstBlueprint } from "../services/blueprint-extractor.js";
// Import shared utilities from doc-utils.js
import {
  stripMarkdownLinePrefixes,
  parseInlineMarkdown,
  parseMarkdownToDocx,
  stripMarkdownPlain,
  extractHeadingLevels,
  createParagraph,
  createTableFromData,
  createDocHeader,
  createDocFooter,
} from "./doc-utils.js";

// Re-export for backwards compatibility (other modules import from create-doc.js)
export { stripMarkdownLinePrefixes, parseInlineMarkdown, stripMarkdownPlain };

/**
 * Compute a compact structure signature from document paragraphs.
 * The signature captures the heading hierarchy as a pipe-separated string.
 * E.g., "h1:introduction|h2:background|h1:methods|h2:data collection"
 */
function computeStructureSignature(paragraphs) {
  if (!paragraphs || !Array.isArray(paragraphs)) return null;

  const headings = paragraphs
    .filter(p => p && typeof p === "object" && p.headingLevel)
    .map(p => {
      const level = p.headingLevel.replace("heading", "h");
      // Normalize the text: lowercase, trim, first 50 chars
      const text = (p.text || "").trim().toLowerCase().substring(0, 50);
      return `${level}:${text}`;
    });

  if (headings.length === 0) return null;
  return headings.join("|");
}

/**
 * Creates a DOCX document from structured content with professional formatting.
 * 
 * The MCP system uses document tags to understand what types of beautiful documents to create:
 * - "claude-like" / "professional": Clean, modern professional documents with blue accents
 * - "marketing": Vibrant, engaging documents for campaigns and launches  
 * - "technical-docs" / "api": Clear structured technical documentation
 * - "business-report" / "report": Professional reports with executive summaries
 * - "legal": Formal legal documents with proper hierarchy
 *
 * @param {Object} input - Document creation parameters
 * @param {string} input.title - Document title (should reflect actual content)
 * @param {Array} input.paragraphs - Array of paragraph content (strings or objects)
 * @param {Array<Array>} input.tables - Array of table data
 * @param {string} input.outputPath - Output file path
 * @param {string} [input.category] - Document category for folder organization (contracts, technical, business, legal, meetings, research)
 * @param {string} [input.stylePreset] - Style preset name (minimal, professional, technical, legal, business, casual, colorful)
 * @param {Object} [input.style] - Custom style overrides
 * @param {Object} [input.header] - Header configuration {text, alignment, color}
 * @param {Object} [input.footer] - Footer configuration {text, alignment, color, includeTotal}
 * @param {string} [input.description] - Document description
 * @param {Array<string>} [input.tags] - Tags for document search and organization (e.g., ["claude-like", "blog-post"])
 * @param {string} [input.backgroundColor] - Background color
 * @param {Object} [input.margins] - Custom margins {top, bottom, left, right} in inches
 * @returns {Promise<Object>} Result object with filePath and message
 */
export async function createDoc(input) {
  try {
    // Parse input if it's a JSON string (for MCP compatibility)
    const parsedInput = typeof input === "string" ? JSON.parse(input) : input;

    // Track whether user explicitly provided a stylePreset BEFORE DNA injects one
    const userExplicitlySetStyle = !!parsedInput.stylePreset;

    // Apply Document DNA defaults (header, footer, stylePreset) if not explicitly provided
    const dnaConfig = loadDNA();
    const hasDNA = dnaConfig !== null;
    applyDNAToInput(parsedInput);

    // Resolve document tags - enable MCP to know what type of beautiful document to create
    let resolvedTags = Array.isArray(parsedInput.tags) ? [...parsedInput.tags] : [];
    
    // If no explicit tags, try to detect from template or content analysis
    if (resolvedTags.length === 0 && parsedInput.title) {
      const docTitle = parsedInput.title || "";
      const docDescription = parsedInput.description || "";
      const firstParagraph = Array.isArray(parsedInput.paragraphs)
        ? (typeof parsedInput.paragraphs[0] === "string" ? parsedInput.paragraphs[0] : "")
        : "";

      // Try to find a matching template based on content (returns null if no match)
      const matchedTemplate = findMatchingTemplate(docTitle, docDescription + firstParagraph, []);

      if (matchedTemplate && matchedTemplate.key) {
        // findMatchingTemplate now returns { key, ...template } so the reverse-lookup is gone
        for (const [tag, templateKey] of Object.entries(TAG_TO_TEMPLATE)) {
          if (templateKey === matchedTemplate.key) {
            resolvedTags.push(tag);
            log("info", `[create-doc] Detected document tag: "${tag}" based on content analysis`);
            break;
          }
        }
      }
    }

    // NOTE: tag-based style resolution happens later in the style-priority
    // chain (see below) via findMatchingTemplate(), which safely returns the
    // full template object ({key, name, stylePreset}) or null. The previous
    // early block here used getTemplateByTag() — which returns only a string
    // key (or null) — and dereferenced it as an object, silently producing
    // `undefined` styles and crashing on unmapped tags. Resolution is now in
    // one place to avoid that bug.

    // Load document memories from DNA to include in response
    const memories = (dnaConfig && dnaConfig.memories) ? dnaConfig.memories : null;

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
          `Good examples: "Q1 2026 Engineering Strategy", "Software License Agreement — Acme Corp", "REST API Design Guidelines"`,
      };
    }
    if (GENERIC_TITLES.has(rawTitle.toLowerCase())) {
      return {
        success: false,
        error: "GENERIC_TITLE",
        message: `Title "${rawTitle}" is too generic. Please provide a specific, descriptive title that reflects the document's actual content.\n\n` +
          `Good examples: "Q1 2026 Engineering Strategy", "Software License Agreement — Acme Corp", "REST API Design Guidelines"\n` +
          `Bad examples: "Document", "Untitled", "File", "Output"`,
      };
    }
    const title = rawTitle;

    // Weak-model convenience: accept the entire body as a single markdown string
    // via `content`. A string paragraph is rendered through the block-level
    // markdown renderer (parseMarkdownToDocx), so one markdown blob produces a
    // fully-formatted document — far easier for small models than assembling the
    // string-or-object `paragraphs` array. Explicit `paragraphs` still win.
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

    const tables = Array.isArray(parsedInput.tables) ? parsedInput.tables : [];

    // Auto-extract heading levels from markdown content
    const processedParagraphs = extractHeadingLevels(paragraphs);

    // Assess structural formatting (headings/lists/emphasis/tables). Returned as
    // a non-fatal `formattingQuality` field so the model gets a correction signal
    // when it produced flat text. With REQUIRE_FORMATTING enabled, a wholly
    // unformatted substantive body is hard-rejected instead of written.
    const formattingQuality = assessFormattingQuality({
      paragraphs: processedParagraphs,
      content: parsedInput.content,
      tables,
    });
    if (!parsedInput.dryRun && shouldRejectPlainText(formattingQuality)) {
      return {
        success: false,
        error: "PLAIN_TEXT",
        message:
          `Refusing to create an unformatted plain-text document (REQUIRE_FORMATTING is on). ${formattingQuality.hint}`,
        hint: formattingQuality.hint,
        formattingQuality,
      };
    }

    // Get category and tags from parsedInput (handles both object and JSON-string inputs)
    let category = parsedInput.category || null;
    const tags = Array.isArray(parsedInput.tags) ? parsedInput.tags : [];

    // Auto-classify if no category provided and title/content available
    if (!category && parsedInput.title) {
      const classification = classifyDocumentContent(parsedInput.title, "");
      if (classification.category !== "misc") {
        category = classification.category;
        log("info",
          `[create-doc] Auto-classified document as "${category}" (confidence: ${classification.confidence})\n` +
          `Category scores: ${Object.entries(classification.scores || {})
            .filter(([_, score]) => score > 0)
            .map(([cat, score]) => `${cat}: ${score}`).join(", ")}`,
        );
      }
    }

    // Check for existing documents with the same title/category BEFORE creating
    // This prevents the model from creating duplicates
    if (!parsedInput.dryRun && parsedInput.preventDuplicates !== false) {
      const duplicateCheck = await checkForExistingDocument(title, category);

      if (duplicateCheck.action === "augment") {
        // Document exists - tell the model to use edit-doc instead
        const guidance = buildGuidanceMessage(duplicateCheck);
        return {
          success: false,
          duplicate: true,
          existingPath: duplicateCheck.existing.filePath,
          existingTitle: duplicateCheck.existing.title,
          message: `DOCUMENT ALREADY EXISTS: "${duplicateCheck.existing.title}" at ${duplicateCheck.existing.filePath}.\n\n` +
            `Use edit-doc with filePath "${duplicateCheck.existing.filePath}" and action "append" to add content to the existing document.\n` +
            `If you want to replace its content entirely, use edit-doc with action "replace".\n` +
            `To force creating a new file anyway, set preventDuplicates to false.` + guidance,
        };
      }

      if (duplicateCheck.action === "replace") {
        // Too many versions - clean up and tell model to use edit-doc
        if (duplicateCheck.allVersions) {
          await cleanupExcessVersions(duplicateCheck.allVersions, 1);
        }
        const guidance = buildGuidanceMessage(duplicateCheck);
        return {
          success: false,
          duplicate: true,
          tooManyVersions: true,
          existingPath: duplicateCheck.existing.filePath,
          existingTitle: duplicateCheck.existing.title,
          message: `TOO MANY VERSIONS of "${title}" detected. Old versions have been cleaned up.\n\n` +
            `Use edit-doc with filePath "${duplicateCheck.existing.filePath}" and action "replace" to write the correct content.\n` +
            `DO NOT create another version.` + guidance,
        };
      }
    }

    // Validate against blueprint if specified
    if (parsedInput.blueprint) {
      const blueprint = loadBlueprint(parsedInput.blueprint);
      if (!blueprint) {
        return {
          success: false,
          error: `Blueprint "${parsedInput.blueprint}" not found. Use list-blueprints to see available blueprints.`,
        };
      }

      const validation = validateAgainstBlueprint(processedParagraphs, blueprint);
      if (!validation.valid) {
        return {
          success: false,
          blueprintValidation: validation,
          message: `Document does not match blueprint "${parsedInput.blueprint}".\n\n` +
            `Missing required sections:\n${validation.errors.map(e => `  - ${e.expectedPattern} (${e.heading})`).join("\n")}\n\n` +
            `Please add the missing sections and try again.`,
        };
      }
    }

    // Normalize input with extension handling FIRST (fixes .md → .docx before docs folder check)
    const normalized = validateAndNormalizeInput(input, [], "docx");
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
      const tableCount = tables.length;
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
          tableCount: tableCount,
          approximateContentLength: totalParaChars,
          stylePreset: parsedInput.stylePreset || "minimal",
          hasHeader: !!(parsedInput.header && parsedInput.header.text),
          hasFooter: !!(parsedInput.footer && parsedInput.footer.text),
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
        message: `DRY RUN - No file written. Preview of document that would be created:\n\nTitle: "${title}"\nPath: ${outputPath}\nParagraphs: ${paraCount}\nTables: ${tableCount}\nStyle: ${parsedInput.stylePreset || "minimal"}\n\nCall this tool again without dryRun (or with dryRun: false) to create the file.`,
      };
    }

    // THEN prevent duplicate files (checks the final docs/ location)
    const preventDupes = parsedInput.preventDuplicates !== false;
    const uniquePath = await preventDuplicateFiles(outputPath, preventDupes);
    const wasDuplicatePrevented = uniquePath !== outputPath;
    outputPath = uniquePath;

    // Ensure output directory exists
    await ensureDirectory(path.dirname(outputPath));

    // Log enforcement actions for debug visibility (info-level, not error)
    if (docsEnforced) {
      log("info",
        `[create-doc] Enforced docs/ folder structure. File placed in: ${path.relative(
          process.cwd(),
          outputPath,
        )}`,
      );
    }
    if (wasDuplicatePrevented) {
      log("info",
        `[create-doc] Prevented duplicate file. Created: ${path.basename(
          outputPath,
        )}`,
      );
    }

    // Style resolution priority:
    //   1. User explicitly passed stylePreset → use it
    //   2. Tag-based template detection → use template's recommended preset
    //   3. Category detected → auto-select matching style (even over DNA default)
    //   4. Claude-like professional (blue theme) → DEFAULT for most documents
    //   5. DNA default preset → use as fallback
    //   6. "minimal" → last resort
    let stylePreset;
    let styleReason;

    if (userExplicitlySetStyle) {
      stylePreset = parsedInput.stylePreset;
      styleReason = "user-specified";
    } else if (resolvedTags.length > 0 && parsedInput.stylePreset) {
      // User provided tags AND style - use the specified style
      stylePreset = parsedInput.stylePreset;
      styleReason = `tag-based with user override (${resolvedTags.join(", ")})`;
    } else if (resolvedTags.length > 0 && findMatchingTemplate(title, "", resolvedTags)) {
      // Tag-based detection matched a known template - use its recommended
      // preset. findMatchingTemplate returns {key, name, stylePreset} or null,
      // so unmapped tags (e.g. ["baboons"]) fall through to category/default
      // instead of crashing.
      const matched = findMatchingTemplate(title, "", resolvedTags);
      stylePreset = matched.stylePreset;
      styleReason = `tag-based auto-detection ("${matched.key}" → "${matched.name}")`;
    } else if (category) {
      // Category-based selection
      stylePreset = selectStyleBasedOnCategory(category);
      styleReason = `auto-selected for "${category}" category`;
    } else if (parsedInput.stylePreset) {
      // DNA default preset
      stylePreset = parsedInput.stylePreset;
      styleReason = "DNA default";
    } else {
      // DEFAULT: claude-like — modern blue-accented professional with
      // generous whitespace and proper list/blockquote/link rendering.
      stylePreset = "claude-like";
      styleReason = "default (claude-like)";
      log("info",
        `[create-doc] Using default style "${stylePreset}"`,
      );
    }

    if (!getAvailablePresets().includes(stylePreset)) {
      log("warn",
        `[create-doc] Style preset "${stylePreset}" not found. Falling back to "minimal".`,
      );
      stylePreset = "minimal";
    }

    // Get merged style configuration
    const styleConfig = getStyleConfig(stylePreset, parsedInput.style || {});

    // Build section properties with proper headers/footers
    const sectionProps = {};

    // Add header if specified
    let hasHeader = false;
    let headerObj = undefined;
    if (parsedInput.header && parsedInput.header.text) {
      headerObj = createDocHeader(parsedInput.header.text, {
        alignment: parsedInput.header.alignment || "left",
        color: parsedInput.header.color,
      });
      hasHeader = true;
    }

    // Add footer if specified
    let hasFooter = false;
    let footerObj = undefined;
    if (parsedInput.footer && parsedInput.footer.text) {
      footerObj = createDocFooter({
        text: parsedInput.footer.text,
        alignment: parsedInput.footer.alignment || "center",
        fontSize: 10,
        color: parsedInput.footer.color,
      });
      hasFooter = true;
    }

    // Set margins (with extra space for header/footer if present)
    const defaultTopMargin = hasHeader ? 1440 : 720; // 1" or 0.5"
    const defaultBottomMargin = hasFooter ? 1440 : 720; // 1" or 0.5"

    sectionProps.properties = {
      margin: {
        top: (parsedInput.margins?.top || defaultTopMargin) * 20,
        bottom: (parsedInput.margins?.bottom || defaultBottomMargin) * 20,
        left: (parsedInput.margins?.left || 1080) * 20, // 0.75"
        right: (parsedInput.margins?.right || 1080) * 20, // 0.75"
      },
    };

    if (headerObj) {
      sectionProps.headers = { default: headerObj };
    }

    if (footerObj) {
      sectionProps.footers = { default: footerObj };
    }

    const children = [];

    // Add title using preset styling
    if (title) {
      const titleStyle = styleConfig.title;
      const headingFontFamily = styleConfig.headingFont || styleConfig.font.family;
      children.push(
        createParagraph(title, {
          heading: HeadingLevel.TITLE,
          alignment:
            titleStyle.alignment === "center"
              ? AlignmentType.CENTER
              : titleStyle.alignment === "right"
                ? AlignmentType.RIGHT
                : AlignmentType.LEFT,
          spacingBefore: titleStyle.spacingBefore,
          spacingAfter: titleStyle.spacingAfter,
          size: titleStyle.size,
          bold: titleStyle.bold,
          color: titleStyle.color,
          fontFamily: headingFontFamily,
          smallCaps: titleStyle.smallCaps || false,
          characterSpacing: titleStyle.characterSpacing || 0,
          ...(titleStyle.borderBottom ? {
            border: {
              bottom: {
                style: titleStyle.borderBottom.style || "single",
                size: titleStyle.borderBottom.size || 6,
                color: titleStyle.borderBottom.color || "000000",
                space: titleStyle.borderBottom.space || 1,
              },
            },
          } : {}),
        }),
      );
    }

    // Add paragraphs with proper styling.
    //
    // STRING entries: pass through `parseMarkdownToDocx` which handles
    // bullet/numbered lists, blockquotes, horizontal rules, hyperlinks,
    // inline markdown tables, fenced code blocks, and inline emphasis.
    //
    // OBJECT entries with explicit `headingLevel`: use the legacy inline
    // path so the caller's intent (this is a heading, not a paragraph) is
    // preserved exactly — block-level parsing would re-tokenize the text
    // and could split it.
    for (const para of processedParagraphs) {
      if (!para) continue;

      if (typeof para === "string") {
        const baseStyle = {
          size: styleConfig.font.size,
          fontFamily: styleConfig.font.family,
          color: styleConfig.font.color,
          codeColor: styleConfig.code?.color,
          codeBackground: styleConfig.code?.backgroundColor,
          linkColor: styleConfig.link?.color,
        };
        children.push(...parseMarkdownToDocx(para, baseStyle, styleConfig));
      } else if (para && typeof para === "object" && para.text) {
        // Determine heading level and apply preset styling
        const isHeading =
          para.headingLevel === "heading1" ||
          para.headingLevel === "heading2" ||
          para.headingLevel === "heading3";

        // Get specific heading level config or fallback to font style
        let paragraphStyle;
        if (isHeading) {
          paragraphStyle =
            styleConfig[para.headingLevel] || styleConfig.heading;
        } else {
          paragraphStyle = styleConfig.font;
        }

        // Parse inline markdown from para.text, using the paragraph's explicit style as base
        const objBaseStyle = {
          size: para.size || paragraphStyle.size,
          bold: para.bold ?? (isHeading ? paragraphStyle.bold : false),
          italics: para.italics ?? (isHeading ? paragraphStyle.italic : false),
          underline: para.underline
            ? isHeading
              ? paragraphStyle.underline
              : false
            : false,
          fontFamily: isHeading
            ? (styleConfig.headingFont || styleConfig.font.family)
            : styleConfig.font.family,
          color:
            para.color ||
            (isHeading ? paragraphStyle.color : styleConfig.font.color),
          codeColor: styleConfig.code?.color,
          codeBackground: styleConfig.code?.backgroundColor,
        };
        const objTextRuns = parseInlineMarkdown(para.text, objBaseStyle);

        children.push(
          createParagraph(objTextRuns, {
            heading:
              para.headingLevel === "heading1"
                ? HeadingLevel.HEADING_1
                : para.headingLevel === "heading2"
                  ? HeadingLevel.HEADING_2
                  : para.headingLevel === "heading3"
                    ? HeadingLevel.HEADING_3
                    : undefined,
            alignment: para.alignment || styleConfig.paragraph.alignment,
            spacingBefore: isHeading
              ? paragraphStyle.spacingBefore
              : styleConfig.paragraph.spacingBefore,
            spacingAfter: isHeading
              ? paragraphStyle.spacingAfter
              : styleConfig.paragraph.spacingAfter,
            lineSpacing: styleConfig.paragraph.lineSpacing,
          }),
        );
      }
    }

    // Add tables
    for (const tableData of tables) {
      if (!Array.isArray(tableData) || tableData.length === 0) continue;

      children.push(
        createTableFromData(tableData, {
          borderColor: styleConfig.table.borderColor,
          borderStyle: styleConfig.table.borderStyle,
          borderWidth: styleConfig.table.borderWidth,
          headerFill: parsedInput.tableHeaderFill || styleConfig.table.headerFill,
          headerFontColor: styleConfig.table.headerFontColor,
          zebraFill: styleConfig.table.zebraFill,
          zebraInterval: styleConfig.table.zebraInterval,
          insideBorderColor: styleConfig.table.insideBorderColor,
          insideBorderWidth: styleConfig.table.insideBorderWidth,
          outsideBorderWidth: styleConfig.table.outsideBorderWidth,
          cellSize: styleConfig.font.size,
          fontFamily: styleConfig.font.family,
          color: styleConfig.font.color,
        }),
      );
    }

    // Create document with proper section configuration and embedded styles
    // Auto-generate description from first paragraph if not provided
    const autoDescription = parsedInput.description || (() => {
      const firstTextPara = paragraphs.find(p => typeof p === "string" ? p.trim() : (p.text && !p.headingLevel));
      const text = typeof firstTextPara === "string" ? firstTextPara : firstTextPara?.text;
      return text ? text.slice(0, 200).trim() : title;
    })();

    const doc = new Document({
      creator: "MCP Doc Processor",
      title: title,
      description: autoDescription,
      styles: buildDocumentStyles(styleConfig),
      // Numbering config is REQUIRED for bullet/numbered list paragraphs
      // emitted by parseMarkdownToDocx to render correctly. Without it the
      // numbering: { reference: "bullets" } property is dropped and lists
      // become unindented plain paragraphs.
      numbering: createNumberingConfig(),
      sections: [
        {
          ...sectionProps,
          children:
            children.length > 0 ? children : [new Paragraph({ text: "" })],
        },
      ],
    });

    // Handle background color
    if (parsedInput.backgroundColor) {
      doc.background = {
        color: parsedInput.backgroundColor.replace("#", "").toUpperCase(),
      };
    }

    const buffer = await Packer.toBuffer(doc);
    await fs.writeFile(outputPath, buffer);

    // Register document in registry (non-blocking, failure is non-fatal)
    let registryEntry = null;
    try {
      registryEntry = await registerDocumentInRegistry({
        title: title,
        filePath: outputPath,
        category: category || "misc",
        tags: tags,
        description: autoDescription,
      });
    } catch (err) {
      log("warn", "[create-doc] Failed to register document:", { error: err.message });
    }

    // Compute structure signature (pure function, no side effects)
    const structSig = computeStructureSignature(processedParagraphs);

    // Record usage in DNA for auto-learning with override tracking (non-fatal)
    if (hasDNA) {
      recordUsage(category || "misc", stylePreset, {
        stylePreset: userExplicitlySetStyle,
        header: !!parsedInput.header,
        footer: !!parsedInput.footer,
      }, structSig);
    }

    // Auto-match against auto-learned blueprints (non-fatal, soft hint)
    let blueprintMatch = null;
    if (structSig) {
      try {
        const allBlueprints = listBlueprints();
        const autoBlueprints = allBlueprints.filter(bp => bp.autoLearned && bp.signature);
        let bestMatch = null;
        let bestSimilarity = 0;

        for (const bp of autoBlueprints) {
          const sim = signatureSimilarity(structSig, bp.signature);
          if (sim >= 0.6 && sim > bestSimilarity) {
            bestSimilarity = sim;
            bestMatch = bp;
          }
        }

        if (bestMatch) {
          blueprintMatch = {
            name: bestMatch.name,
            similarity: Math.round(bestSimilarity * 100) / 100,
            message: `This document matches auto-learned blueprint "${bestMatch.name}" (${Math.round(bestSimilarity * 100)}% similarity). Use blueprint: "${bestMatch.name}" in future create-doc calls to enforce this structure.`,
          };
        }
      } catch {
        // Blueprint matching is non-fatal
      }
    }

    // Record lineage (track which read documents informed this creation)
    let lineageRecord = null;
    try {
      lineageRecord = await recordWrite(outputPath);
    } catch {
      // Lineage tracking is non-fatal
    }

    // Optional: upload the freshly-written file to a remote endpoint via
    // JSON envelope. Used by CogniRunner's attachment-upload web trigger and
    // any other one-shot upload capability. The local file is kept either way
    // so the caller can still reference it on upload failure.
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
        log("warn", "[create-doc] upload failed (file still written locally)", { error: err.message });
      }
    } else if (parsedInput.uploadUrl || parsedInput.uploadAuthHeader) {
      // Caller supplied only one — surface a clear error so they don't think it worked.
      uploadError = "uploadUrl and uploadAuthHeader must be provided together";
      log("warn", "[create-doc] partial upload params — both uploadUrl and uploadAuthHeader required");
    }

    // Resolve interactive vs agent output shape
    const clientMode = resolveClientHint(parsedInput);
    const isInteractive = clientMode === "interactive";

    // Learning loop: record the event (for the creator) + nudge memory-capable agents.
    const profile = resolveClientProfile(parsedInput);
    logInsight({
      server: "doc-processor", tool: "create-doc", event: "success",
      client: profile.clientName, memoryCapable: profile.canPersistMemory,
      title, format: "docx", stylePreset, category: category || null,
    });
    const learning = `For ${category || "general"} Word docs, create-doc with the "${stylePreset}" preset and a single markdown \`content\` string worked well — reuse this combo for similar editable deliverables.`;

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

    // Compose upload-aware message fragments
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
    const agentMessage = `DOCX FILE WRITTEN TO DISK at: ${outputPath}\n\nIMPORTANT: This tool has created an actual .docx file on your filesystem. Do NOT create any additional markdown or text files. The document is available at the absolute path shown above.\n\n${enforcementMessage}` +
      (blueprintMatch ? `\nBLUEPRINT MATCH: ${blueprintMatch.message}\n` : "") +
      (memories ? `\nDocument memories active (${Object.keys(memories).length}): ${Object.values(memories).map(m => m.text).join("; ")}` : "") +
      uploadAgentNote;

    // Only surface upload fields when the caller actually opted into the
    // upload path. For "normal" agent calls (no uploadUrl), the response
    // shape is identical to the pre-upload-bridge era — backward compat.
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
      stylePreset: stylePreset,
      styleReason: styleReason,
      formattingQuality: isInteractive ? undefined : formattingQuality,
      formatSuggestion: isInteractive ? undefined : suggestBetterFormat({ paragraphs: processedParagraphs, content: parsedInput.content, tables }, "docx"),
      memoryNudge: (isInteractive || !profile.canPersistMemory) ? undefined : memoryNudge(learning, `create-doc:${category || "general"}:${stylePreset}`),
      styleConfig: isInteractive ? undefined : {
        preset: stylePreset,
        description: getPresetDescription(stylePreset),
        font: styleConfig.font,
        paragraph: styleConfig.paragraph,
        table: styleConfig.table,
      },
      dnaApplied: hasDNA,
      header: hasHeader ? parsedInput.header : null,
      footer: hasFooter ? parsedInput.footer : null,
      enforcement: isInteractive ? undefined : {
        docsFolderEnforced: docsEnforced,
        duplicatePrevented: wasDuplicatePrevented,
        categorized: wasCategorized,
        categoryApplied: category || null,
      },
      memoriesApplied: isInteractive ? undefined : (memories ? Object.keys(memories).length : 0),
      blueprintMatch: blueprintMatch || null,
      lineage: isInteractive ? undefined : (lineageRecord ? {
        sourceCount: lineageRecord.sources.length,
        sources: lineageRecord.sources.map(s => s.filePath),
      } : null),
      message: isInteractive ? interactiveMessage : agentMessage,
    };
  } catch (err) {
    return {
      success: false,
      error: err.message,
      message: `Failed to create document: ${err.message}`,
    };
  }
}
