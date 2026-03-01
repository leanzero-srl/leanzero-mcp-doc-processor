import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  AlignmentType,
  HeadingLevel,
} from "docx";
import fs from "fs/promises";
import path from "path";
import {
  getStyleConfig,
  getAvailablePresets,
  getPresetDescription,
  selectStyleBasedOnCategory,
  buildDocumentStyles,
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
} from "./utils.js";
import { applyDNAToInput, loadDNA, recordUsage, signatureSimilarity } from "../utils/dna-manager.js";
import { checkForExistingDocument, cleanupExcessVersions, buildGuidanceMessage } from "../services/ai-guidance-system.js";
import { recordWrite } from "../services/lineage-tracker.js";
import { loadBlueprint, listBlueprints } from "../utils/blueprint-store.js";
import { validateAgainstBlueprint } from "../services/blueprint-extractor.js";
// Import shared utilities from doc-utils.js
import {
  stripMarkdownLinePrefixes,
  parseInlineMarkdown,
  stripMarkdownPlain,
  extractHeadingLevels,
  createText,
  createParagraph,
  createTableFromData,
  createDocHeader,
  createDocFooter,
  createCodeBlock,
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
 * Creates a DOCX document from structured content with professional formatting
 *
 * @param {Object} input - Document creation parameters
 * @param {string} input.title - Document title
 * @param {Array} input.paragraphs - Array of paragraph content (strings or objects)
 * @param {Array<Array>} input.tables - Array of table data
 * @param {string} input.outputPath - Output file path
 * @param {string} [input.category] - Document category for folder organization (contracts, technical, business, legal, meetings, research)
 * @param {string} [input.stylePreset] - Style preset name (minimal, professional, technical, legal, business, casual, colorful)
 * @param {Object} [input.style] - Custom style overrides
 * @param {Object} [input.header] - Header configuration {text, alignment, color}
 * @param {Object} [input.footer] - Footer configuration {text, alignment, color, includeTotal}
 * @param {string} [input.description] - Document description
 * @param {Array<string>} [input.tags] - Tags for document search and organization
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

    const tables = Array.isArray(parsedInput.tables) ? parsedInput.tables : [];

    // Auto-extract heading levels from markdown content
    const processedParagraphs = extractHeadingLevels(paragraphs);

    // Get category and tags from input
    let category = input.category || null;
    const tags = Array.isArray(input.tags) ? input.tags : [];

    // Auto-classify if no category provided and title/content available
    if (!category && input.title) {
      const classification = classifyDocumentContent(input.title, "");
      if (classification.category !== "misc") {
        category = classification.category;
        console.error(
          `[create-doc] Auto-classified document as "${category}" (confidence: ${classification.confidence})\n` +
          `Category scores: ${Object.entries(classification.scores || {})
            .filter(([_, score]) => score > 0)
            .map(([cat, score]) => `${cat}: ${score}`).join(", ")}`,
        );
      }
    }

    // Check for existing documents with the same title/category BEFORE creating
    // This prevents the model from creating duplicates
    if (!input.dryRun && input.preventDuplicates !== false) {
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
          stylePreset: input.stylePreset || "minimal",
          hasHeader: !!(input.header && input.header.text),
          hasFooter: !!(input.footer && input.footer.text),
          category: category || null,
          tags: tags.length > 0 ? tags : null,
          wasCategorized: wasCategorized,
        },
        enforcement: {
          docsFolderEnforced: docsEnforced,
          categorized: wasCategorized,
          categoryApplied: category || null,
        },
        message: `DRY RUN - No file written. Preview of document that would be created:\n\nTitle: "${title}"\nPath: ${outputPath}\nParagraphs: ${paraCount}\nTables: ${tableCount}\nStyle: ${input.stylePreset || "minimal"}\n\nCall this tool again without dryRun (or with dryRun: false) to create the file.`,
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
        `[create-doc] Enforced docs/ folder structure. File placed in: ${path.relative(
          process.cwd(),
          outputPath,
        )}`,
      );
    }
    if (wasDuplicatePrevented) {
      console.error(
        `[create-doc] Prevented duplicate file. Created: ${path.basename(
          outputPath,
        )}`,
      );
    }

    // Style resolution priority:
    //   1. User explicitly passed stylePreset → use it
    //   2. Category detected → auto-select matching style (even over DNA default)
    //   3. DNA default preset → use as general fallback
    //   4. "minimal" → last resort
    let stylePreset;
    let styleReason;

    if (userExplicitlySetStyle) {
      stylePreset = input.stylePreset;
      styleReason = "user-specified";
    } else if (category) {
      stylePreset = selectStyleBasedOnCategory(category);
      styleReason = `auto-selected for "${category}" category`;
      console.error(
        `[create-doc] Auto-selected style "${stylePreset}" for category "${category}"`,
      );
    } else if (input.stylePreset) {
      stylePreset = input.stylePreset;
      styleReason = "DNA default";
    } else {
      stylePreset = "minimal";
      styleReason = "fallback (no category or DNA)";
    }

    if (!getAvailablePresets().includes(stylePreset)) {
      console.warn(
        `Warning: Style preset "${stylePreset}" not found. Using "minimal" preset.`,
      );
      input.stylePreset = "minimal";
    }

    // Get merged style configuration
    const styleConfig = getStyleConfig(stylePreset, input.style || {});

    // Build section properties with proper headers/footers
    const sectionProps = {};

    // Add header if specified
    let hasHeader = false;
    let headerObj = undefined;
    if (input.header && input.header.text) {
      headerObj = createDocHeader(input.header.text, {
        alignment: input.header.alignment || "left",
        color: input.header.color,
      });
      hasHeader = true;
    }

    // Add footer if specified
    let hasFooter = false;
    let footerObj = undefined;
    if (input.footer && input.footer.text) {
      footerObj = createDocFooter({
        text: input.footer.text,
        alignment: input.footer.alignment || "center",
        fontSize: 10,
        color: input.footer.color,
      });
      hasFooter = true;
    }

    // Set margins (with extra space for header/footer if present)
    const defaultTopMargin = hasHeader ? 1440 : 720; // 1" or 0.5"
    const defaultBottomMargin = hasFooter ? 1440 : 720; // 1" or 0.5"

    sectionProps.properties = {
      margin: {
        top: (input.margins?.top || defaultTopMargin) * 20,
        bottom: (input.margins?.bottom || defaultBottomMargin) * 20,
        left: (input.margins?.left || 1080) * 20, // 0.75"
        right: (input.margins?.right || 1080) * 20, // 0.75"
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

    // Add paragraphs with proper styling (markdown ornaments are parsed into formatting)
    for (const para of processedParagraphs) {
      if (!para) continue;

      if (typeof para === "string") {
        // Detect fenced code blocks (```...```)
        if (para.trimStart().startsWith("```")) {
          children.push(...createCodeBlock(para, styleConfig.code));
          continue;
        }

        // Parse inline markdown into styled TextRun array
        const baseStyle = {
          size: styleConfig.font.size,
          fontFamily: styleConfig.font.family,
          color: styleConfig.font.color,
          codeColor: styleConfig.code?.color,
          codeBackground: styleConfig.code?.backgroundColor,
        };
        const textRuns = parseInlineMarkdown(para, baseStyle);

        children.push(
          createParagraph(textRuns, {
            alignment: styleConfig.paragraph.alignment,
            spacingBefore: styleConfig.paragraph.spacingBefore,
            spacingAfter: styleConfig.paragraph.spacingAfter,
            lineSpacing: styleConfig.paragraph.lineSpacing,
          }),
        );
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
          headerFill: input.tableHeaderFill || styleConfig.table.headerFill,
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
    const autoDescription = input.description || (() => {
      const firstTextPara = paragraphs.find(p => typeof p === "string" ? p.trim() : (p.text && !p.headingLevel));
      const text = typeof firstTextPara === "string" ? firstTextPara : firstTextPara?.text;
      return text ? text.slice(0, 200).trim() : title;
    })();

    const doc = new Document({
      creator: "MCP Doc Processor",
      title: title,
      description: autoDescription,
      styles: buildDocumentStyles(styleConfig),
      sections: [
        {
          ...sectionProps,
          children:
            children.length > 0 ? children : [new Paragraph({ text: "" })],
        },
      ],
    });

    // Handle background color
    if (input.backgroundColor) {
      doc.background = {
        color: input.backgroundColor.replace("#", "").toUpperCase(),
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
      console.warn("Failed to register document:", err.message);
    }

    // Compute structure signature (pure function, no side effects)
    const structSig = computeStructureSignature(processedParagraphs);

    // Record usage in DNA for auto-learning with override tracking (non-fatal)
    if (hasDNA) {
      recordUsage(category || "misc", stylePreset, {
        stylePreset: userExplicitlySetStyle,
        header: !!input.header,
        footer: !!input.footer,
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
      stylePreset: stylePreset,
      styleReason: styleReason,
      styleConfig: {
        preset: stylePreset,
        description: getPresetDescription(stylePreset),
        font: styleConfig.font,
        paragraph: styleConfig.paragraph,
        table: styleConfig.table,
      },
      dnaApplied: hasDNA,
      header: hasHeader ? input.header : null,
      footer: hasFooter ? input.footer : null,
      enforcement: {
        docsFolderEnforced: docsEnforced,
        duplicatePrevented: wasDuplicatePrevented,
        categorized: wasCategorized,
        categoryApplied: category || null,
      },
      memoriesApplied: memories ? Object.keys(memories).length : 0,
      blueprintMatch: blueprintMatch || null,
      lineage: lineageRecord ? {
        sourceCount: lineageRecord.sources.length,
        sources: lineageRecord.sources.map(s => s.filePath),
      } : null,
      message: `DOCX FILE WRITTEN TO DISK at: ${outputPath}\n\nIMPORTANT: This tool has created an actual .docx file on your filesystem. Do NOT create any additional markdown or text files. The document is available at the absolute path shown above.\n\n${enforcementMessage}` +
        (blueprintMatch ? `\nBLUEPRINT MATCH: ${blueprintMatch.message}\n` : "") +
        (memories ? `\nDocument memories active (${Object.keys(memories).length}): ${Object.values(memories).map(m => m.text).join("; ")}` : ""),
    };
  } catch (err) {
    return {
      success: false,
      error: err.message,
      message: `Failed to create document: ${err.message}`,
    };
  }
}
