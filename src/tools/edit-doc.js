import fs from "fs/promises";
import path from "path";
import mammoth from "mammoth";
import { Document, Packer, Paragraph, AlignmentType, HeadingLevel } from "docx";
import {
  getStyleConfig,
  getAvailablePresets,
  selectStyleBasedOnCategory,
} from "./styling.js";
import {
  appendToDocx,
  replaceDocxContent,
  inspectDocx,
  applyStylingToDocx,
} from "./docx-patch.js";
import { registerDocumentInRegistry } from "./utils.js";
import { recordWrite } from "../services/lineage-tracker.js";
// Import shared utilities from doc-utils.js (eliminates code duplication)
import {
  parseInlineMarkdown,
  extractHeadingLevels,
  createText,
  createParagraph,
  createTableFromData,
  createDocHeader,
  createDocFooter,
  createCodeBlock,
} from "./doc-utils.js";

/**
 * Edits an existing DOCX document by appending or replacing content.
 *
 * ARCHITECTURE UPDATE - Now uses XML patching to preserve formatting!
 *
 * The new approach:
 * 1. Reads the existing DOCX as a ZIP archive
 * 2. Parses word/document.xml
 * 3. Generates new content XML using the docx library
 * 4. Inserts new XML nodes into the original document
 * 5. Re-packages the DOCX file
 *
 * This preserves:
 * - Original styles and formatting
 * - Headers and footers
 * - Images and relationships
 * - Custom document properties
 *
 * For backward compatibility, you can use legacy mode (useLegacy: true)
 * which recreates the document from scratch (loses formatting).
 *
 * @param {Object} input - Edit parameters
 * @param {string} input.filePath - Path to existing DOCX file (required)
 * @param {string} input.action - "append" or "replace" (required)
 * @param {Array} [input.paragraphs] - Paragraphs to append or replace with
 * @param {Array} [input.tables] - Tables to append or replace with
 * @param {string} [input.title] - New title (replace mode only)
 * @param {string} [input.stylePreset] - Style preset for new content
 * @param {Object} [input.style] - Custom style overrides
 * @param {boolean} [input.useLegacy] - Use legacy mode (loses formatting)
 * @param {string} [input.category] - Document category for registry update
 * @param {Array<string>} [input.tags] - Tags for document search and organization
 * @param {boolean} [input.addSeparator] - Add blank line before new content (append mode)
 * @returns {Promise<Object>} Result with filePath and message
 */
export async function editDoc(input) {
  try {
    const { filePath, action } = input;

    // Get category and tags from input
    const category = input.category || null;
    const tags = Array.isArray(input.tags) ? input.tags : [];

    if (!filePath) {
      throw new Error("filePath is required");
    }
    if (!action || !["append", "replace", "style", "preview"].includes(action)) {
      throw new Error(
        `Invalid action. Valid actions: 'append' (add content after existing), 'replace' (overwrite all content), 'style' (apply formatting), 'preview' (show what would change).`
      );
    }

    const resolvedPath = path.isAbsolute(filePath)
      ? filePath
      : path.resolve(process.cwd(), filePath);

    // Verify file exists
    try {
      await fs.access(resolvedPath);
    } catch {
      throw new Error(`File not found: ${resolvedPath}`);
    }

    const newParagraphs = Array.isArray(input.paragraphs)
      ? input.paragraphs
      : [];

    // Auto-extract heading levels from markdown content
    const processedParagraphs = extractHeadingLevels(newParagraphs);

    const newTables = Array.isArray(input.tables) ? input.tables : [];

    // Get style config with automatic category-based selection
    let stylePreset = input.stylePreset;

    // If no preset specified but category is available, automatically select style
    if (!stylePreset && input.category) {
      stylePreset = selectStyleBasedOnCategory(input.category);
      console.error(
        `[edit-doc] Automatically selected style preset "${stylePreset}" for category "${input.category}"`,
      );
    }

    // Use minimal as fallback if still no preset
    stylePreset = stylePreset || "minimal";

    const styleConfig = getStyleConfig(
      getAvailablePresets().includes(stylePreset) ? stylePreset : "minimal",
      input.style || {},
    );

    // Check if legacy mode is requested
    const useLegacy = input.useLegacy === true;

    // If not using legacy mode, use the new XML patching approach
    if (!useLegacy) {
      if (action === "append") {
        // Use XML patching for append - preserves formatting!
        const result = await appendToDocx(resolvedPath, {
          paragraphs: processedParagraphs,
          tables: newTables,
          stylePreset,
          style: input.style,
          addSeparator: input.addSeparator !== false,
        });

        if (result.success) {
          // Record lineage AFTER successful edit (non-fatal)
          try { await recordWrite(resolvedPath); } catch { /* non-fatal */ }

          // Inspect the document to provide more info
          const inspection = await inspectDocx(resolvedPath);

          // Always update registry regardless of result
          let registryEntry = null;
          try {
            registryEntry = await registerDocumentInRegistry({
              title: input.title || path.basename(resolvedPath, ".docx"),
              filePath: resolvedPath,
              category: category || "misc",
              tags: tags,
            });
          } catch (err) {
            console.warn("Failed to update registry:", err.message);
          }

          return {
            success: true,
            filePath: resolvedPath,
            action: "append",
            paragraphsAppended: processedParagraphs.length,
            tablesAppended: newTables.length,
            formattingPreserved: true,
            documentStructure: inspection.success ? inspection.structure : null,
            registryEntry: registryEntry
              ? { id: registryEntry.id, category: registryEntry.category }
              : null,
            message:
              `DOCX file UPDATED at: ${resolvedPath}\n\n` +
              `✓ FORMATTING PRESERVED: The original document formatting has been maintained.\n` +
              `✓ Appended ${processedParagraphs.length} paragraph(s) and ${newTables.length} table(s).\n` +
              `${inspection.success && inspection.structure.hasHeaders ? "✓ Headers preserved\n" : ""}` +
              `${inspection.success && inspection.structure.hasFooters ? "✓ Footers preserved\n" : ""}` +
              `${inspection.success && inspection.structure.hasImages ? "✓ Images preserved\n" : ""}` +
              `\nNew content uses the "${stylePreset}" style preset.`,
          };
        } else {
          return result;
        }
      }

      if (action === "replace") {
        // Use XML patching for replace - preserves structure!
        const result = await replaceDocxContent(resolvedPath, {
          title: input.title,
          paragraphs: processedParagraphs,
          tables: newTables,
          stylePreset,
          style: input.style,
        });

        if (result.success) {
          // Record lineage AFTER successful edit (non-fatal)
          try { await recordWrite(resolvedPath); } catch { /* non-fatal */ }

          // Always update registry regardless of result
          let registryEntry = null;
          try {
            registryEntry = await registerDocumentInRegistry({
              title: input.title || path.basename(resolvedPath, ".docx"),
              filePath: resolvedPath,
              category: category || "misc",
              tags: tags,
            });
          } catch (err) {
            console.warn("Failed to update registry:", err.message);
          }

          return {
            success: true,
            filePath: resolvedPath,
            action: "replace",
            paragraphsReplaced: newParagraphs.length,
            tablesReplaced: newTables.length,
            structurePreserved: true,
            registryEntry: registryEntry
              ? { id: registryEntry.id, category: registryEntry.category }
              : null,
            message:
              `DOCX file REPLACED at: ${resolvedPath}\n\n` +
              `✓ STRUCTURE PRESERVED: Document headers, footers, and styles remain intact.\n` +
              `✓ Replaced content with ${newParagraphs.length} paragraph(s) and ${newTables.length} table(s).\n` +
              `\nNew content uses the "${stylePreset}" style preset.`,
          };
        } else {
          return result;
        }
      }

      if (action === "style") {
        // Style mode: apply proper formatting to existing document
        const result = await applyStylingToDocx(resolvedPath, {
          stylePreset,
          style: input.style,
        });

        if (result.success) {
          // Record lineage AFTER successful edit (non-fatal)
          try { await recordWrite(resolvedPath); } catch { /* non-fatal */ }

          // Always update registry regardless of result
          let registryEntry = null;
          try {
            registryEntry = await registerDocumentInRegistry({
              title: input.title || path.basename(resolvedPath, ".docx"),
              filePath: resolvedPath,
              category: category || "misc",
              tags: tags,
            });
          } catch (err) {
            console.warn("Failed to update registry:", err.message);
          }

          return {
            success: true,
            filePath: resolvedPath,
            action: "style",
            paragraphsStyled: result.paragraphsStyled,
            stylePreset: result.stylePreset,
            registryEntry: registryEntry
              ? { id: registryEntry.id, category: registryEntry.category }
              : null,
            message:
              `DOCX file STYLED at: ${resolvedPath}\n\n` +
              `✓ STYLING APPLIED: Proper formatting has been applied to the document.\n` +
              `✓ Used "${stylePreset}" style preset for category "${input.category || "unknown"}".\n` +
              `✓ Applied to ${result.paragraphsStyled} paragraph(s).\n\n` +
              `Document now has proper styling including:\n` +
              `- Correct heading hierarchy (heading1, heading2, heading3)\n` +
              `- Proper font sizes and colors based on preset\n` +
              `- Consistent paragraph spacing and alignment\n`,
          };
        } else {
          return result;
        }
      }

      if (action === "preview") {
        // Preview mode: show what would change without making any changes
        return {
          success: true,
          filePath: resolvedPath,
          action: "preview",
          preview: await generateEditPreview(resolvedPath, input),
          message:
            `DOCX file PREVIEW at: ${resolvedPath}\n\n` +
            `This shows what would change if you apply these edits:\n` +
            `  - Action: ${input.action}\n` +
            `  - Paragraphs: ${input.paragraphs?.length || 0}\n` +
            `  - Tables: ${input.tables?.length || 0}\n` +
            `  - Title: ${input.title || "(unchanged)"}\n` +
            `  - Style preset: ${stylePreset}\n\n` +
            `To apply these changes, run the same command without preview mode.`,
        };
      }
    }

    // LEGACY MODE - This is the old approach that loses formatting
    // Kept for backward compatibility and edge cases

    console.warn(
      `[edit-doc] Using legacy mode - original formatting will be lost. ` +
        `Remove useLegacy: true to preserve formatting.`,
    );

    const baseStyle = {
      size: styleConfig.font.size,
      fontFamily: styleConfig.font.family,
      color: styleConfig.font.color,
    };

    if (action === "replace") {
      // Replace mode: overwrite all content, keeping same file path
      const children = [];

      // Add title if provided
      if (input.title) {
        const titleStyle = styleConfig.title;
        children.push(
          createParagraph(input.title, {
            heading: HeadingLevel.TITLE,
            alignment: titleStyle.alignment || "center",
            spacingBefore: titleStyle.spacingBefore,
            spacingAfter: titleStyle.spacingAfter,
            size: titleStyle.size,
            bold: titleStyle.bold,
            color: titleStyle.color,
            fontFamily: styleConfig.font.family,
          }),
        );
      }

      // Add new paragraphs with markdown parsing
      const editBaseStyle1 = {
        ...baseStyle,
        codeColor: styleConfig.code?.color,
        codeBackground: styleConfig.code?.backgroundColor,
      };
      for (const para of newParagraphs) {
        if (!para) continue;
        if (typeof para === "string") {
          if (para.trimStart().startsWith("```")) {
            children.push(...createCodeBlock(para, styleConfig.code));
            continue;
          }
          const textRuns = parseInlineMarkdown(para, editBaseStyle1);
          children.push(
            createParagraph(textRuns, {
              alignment: styleConfig.paragraph.alignment,
              spacingBefore: styleConfig.paragraph.spacingBefore,
              spacingAfter: styleConfig.paragraph.spacingAfter,
              lineSpacing: styleConfig.paragraph.lineSpacing,
            }),
          );
        } else if (para && typeof para === "object" && para.text) {
          const textRuns = parseInlineMarkdown(para.text, editBaseStyle1);
          children.push(
            createParagraph(textRuns, {
              alignment: para.alignment || styleConfig.paragraph.alignment,
              spacingBefore: styleConfig.paragraph.spacingBefore,
              spacingAfter: styleConfig.paragraph.spacingAfter,
              lineSpacing: styleConfig.paragraph.lineSpacing,
            }),
          );
        }
      }

      // Add new tables
      for (const tableData of newTables) {
        if (!Array.isArray(tableData) || tableData.length === 0) continue;
        children.push(
          createTableFromData(tableData, {
            borderColor: styleConfig.table.borderColor,
            borderStyle: styleConfig.table.borderStyle,
            borderWidth: styleConfig.table.borderWidth,
            headerFill: styleConfig.table.headerFill,
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

      const doc = new Document({
        creator: "MCP Doc Processor",
        title: input.title || "",
        sections: [
          {
            children:
              children.length > 0 ? children : [new Paragraph({ text: "" })],
          },
        ],
      });

      const buffer = await Packer.toBuffer(doc);
      await fs.writeFile(resolvedPath, buffer);

      // Update registry timestamp with category and tags
      await registerDocumentInRegistry({
        title: input.title || path.basename(resolvedPath, ".docx"),
        filePath: resolvedPath,
        category: category || "misc",
        tags: tags,
      }).catch(() => {});

      return {
        success: true,
        filePath: resolvedPath,
        action: "replace",
        legacyMode: true,
        message: `DOCX file REPLACED at: ${resolvedPath}\n\nAll content has been replaced with the new content provided.`,
      };
    }

    // Append mode (legacy): read existing content, then recreate with old + new
    // ⚠️ WARNING: This loses ALL original formatting due to mammoth's text-only extraction
    const dataBuffer = await fs.readFile(resolvedPath);
    const textResult = await mammoth.extractRawText({ buffer: dataBuffer });
    const existingText = textResult.value || "";

    const children = [];

    // Recreate existing content as paragraphs (preserving text, NOT formatting)
    const existingLines = existingText.split("\n").filter((l) => l.trim());
    for (const line of existingLines) {
      children.push(
        createParagraph(line.trim(), {
          alignment: styleConfig.paragraph.alignment,
          spacingBefore: styleConfig.paragraph.spacingBefore,
          spacingAfter: styleConfig.paragraph.spacingAfter,
          lineSpacing: styleConfig.paragraph.lineSpacing,
          size: styleConfig.font.size,
          fontFamily: styleConfig.font.family,
          color: styleConfig.font.color,
        }),
      );
    }

    // Add a separator
    children.push(new Paragraph({ text: "" }));

    // Add new paragraphs with markdown parsing
    const editBaseStyle2 = {
      ...baseStyle,
      codeColor: styleConfig.code?.color,
      codeBackground: styleConfig.code?.backgroundColor,
    };
    for (const para of newParagraphs) {
      if (!para) continue;
      if (typeof para === "string") {
        if (para.trimStart().startsWith("```")) {
          children.push(...createCodeBlock(para, styleConfig.code));
          continue;
        }
        const textRuns = parseInlineMarkdown(para, editBaseStyle2);
        children.push(
          createParagraph(textRuns, {
            alignment: styleConfig.paragraph.alignment,
            spacingBefore: styleConfig.paragraph.spacingBefore,
            spacingAfter: styleConfig.paragraph.spacingAfter,
            lineSpacing: styleConfig.paragraph.lineSpacing,
          }),
        );
      } else if (para && typeof para === "object" && para.text) {
        const textRuns = parseInlineMarkdown(para.text, editBaseStyle2);
        children.push(
          createParagraph(textRuns, {
            alignment: para.alignment || styleConfig.paragraph.alignment,
            spacingBefore: styleConfig.paragraph.spacingBefore,
            spacingAfter: styleConfig.paragraph.spacingAfter,
            lineSpacing: styleConfig.paragraph.lineSpacing,
          }),
        );
      }
    }

    // Add new tables
    for (const tableData of newTables) {
      if (!Array.isArray(tableData) || tableData.length === 0) continue;
      children.push(
        createTableFromData(tableData, {
          borderColor: styleConfig.table.borderColor,
          borderStyle: styleConfig.table.borderStyle,
          borderWidth: styleConfig.table.borderWidth,
          headerFill: styleConfig.table.headerFill,
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

    const doc = new Document({
      creator: "MCP Doc Processor",
      sections: [
        {
          children:
            children.length > 0 ? children : [new Paragraph({ text: "" })],
        },
      ],
    });

    const buffer = await Packer.toBuffer(doc);
    await fs.writeFile(resolvedPath, buffer);

    // Update registry timestamp with category and tags
    await registerDocumentInRegistry({
      title: input.title || path.basename(resolvedPath, ".docx"),
      filePath: resolvedPath,
      category: category || "misc",
      tags: tags,
    }).catch(() => {});

    return {
      success: true,
      filePath: resolvedPath,
      action: "append",
      legacyMode: true,
      existingParagraphs: existingLines.length,
      addedParagraphs: newParagraphs.length,
      addedTables: newTables.length,
      message:
        `DOCX file UPDATED at: ${resolvedPath}\n\n` +
        `⚠️ LEGACY MODE: Formatting was NOT preserved.\n` +
        `Original document formatting (fonts, colors, images, headers, footers, styles) has been lost.\n` +
        `The existing ${existingLines.length} paragraph(s) were converted to plain text with the "${stylePreset}" style preset.\n` +
        `Appended ${newParagraphs.length} new paragraph(s) and ${newTables.length} table(s).\n\n` +
        `TIP: Remove useLegacy: true to preserve formatting in the future.`,
    };
  } catch (err) {
    return {
      success: false,
      error: err.message,
      message: `Failed to edit document: ${err.message}`,
    };
  }
}

// ============================================================================
// PREVIEW GENERATION
// ============================================================================

/**
 * Generates a preview of what would change if edits are applied
 * @param {string} filePath - Path to the existing DOCX file
 * @param {Object} input - Edit parameters
 * @returns {Object} Preview data showing what would change
 */
async function generateEditPreview(filePath, input) {
  const preview = {
    filePath: filePath,
    action: input.action,
    changes: [],
    impact: {}
  };

  // Read existing document structure using inspectDocx
  const existing = await inspectDocx(filePath);

  if (existing.success) {
    preview.changes.push({
      type: "existing-structure",
      description: "Current document structure",
      current: existing.structure || {}
    });
  }

  // Preview append changes
  if (input.action === "append") {
    preview.changes.push({
      type: "append",
      description: "Content being added",
      paragraphs: input.paragraphs?.length || 0,
      tables: input.tables?.length || 0,
      title: input.title || "(no title change)"
    });
    preview.impact = {
      location: "After existing content",
      preservesFormatting: true,
      addsSeparator: input.addSeparator !== false
    };
  }

  // Preview replace changes
  if (input.action === "replace") {
    preview.changes.push({
      type: "replace",
      description: "Content being added",
      paragraphs: input.paragraphs?.length || 0,
      tables: input.tables?.length || 0,
      title: input.title || "(no title change)"
    });
    preview.impact = {
      location: "Replacing all content",
      preservesStructure: true,
      preservesHeadersFooters: true
    };
  }

  // Preview style changes
  if (input.action === "style") {
    preview.changes.push({
      type: "style",
      description: "Styling being applied",
      stylePreset: input.stylePreset || "minimal"
    });
    preview.impact = {
      location: "All paragraphs",
      changes: ["Heading hierarchy", "Font sizes", "Colors", "Spacing", "Alignment"]
    };
  }

  preview.warnings = [];
  if (!input.paragraphs || input.paragraphs.length === 0) {
    preview.warnings.push("No paragraphs provided - no content changes will occur");
  }

  return preview;
}
