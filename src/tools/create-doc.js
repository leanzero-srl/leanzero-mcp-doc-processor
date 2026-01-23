import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  Table,
  TableCell,
  TableRow,
  Header,
  Footer,
  AlignmentType,
  HeadingLevel,
  PageBreak,
  BorderStyle,
} from "docx";
import fs from "fs/promises";
import path from "path";
import {
  getStyleConfig,
  getAvailablePresets,
  getPresetDescription,
} from "./styling.js";
import {
  validateAndNormalizeInput,
  ensureDirectory,
  enforceDocsFolder,
  preventDuplicateFiles,
} from "./utils.js";

/**
 * Creates a styled text run for paragraphs
 */
function createText(text, options = {}) {
  return new TextRun({
    text: String(text || ""),
    bold: options.bold ?? false,
    italics: options.italics ?? false,
    underline: options.underline ? { style: "single" } : undefined,
    size: (options.size || 12) * 2, // Convert points to half-points
    color: options.color || "000000",
    font: options.fontFamily || "Arial",
  });
}

/**
 * Creates a styled paragraph with proper formatting
 */
function createParagraph(textOrRuns, options = {}) {
  const alignmentMap = {
    left: AlignmentType.LEFT,
    right: AlignmentType.RIGHT,
    center: AlignmentType.CENTER,
    both: AlignmentType.BOTH,
  };

  return new Paragraph({
    children: Array.isArray(textOrRuns)
      ? textOrRuns
      : [createText(textOrRuns, options)],
    heading: options.heading || undefined,
    alignment: alignmentMap[options.alignment || "left"] || AlignmentType.LEFT,
    spacing: {
      before: options.spacingBefore ?? 0, // Already in twips
      after: options.spacingAfter ?? 120, // Default 120 twips (6pt)
      line: options.lineSpacing
        ? Math.round(options.lineSpacing * 240)
        : undefined,
    },
  });
}

/**
 * Creates a table with proper borders and column widths
 */
function createTableFromData(data, options = {}) {
  const borderColor = options.borderColor || "D9D9D9";
  const borderStyle = options.borderStyle || "single";
  const borderWidth = options.borderWidth ?? 4;

  return new Table({
    rows: data.map((row, rowIndex) => {
      return new TableRow({
        children: row.map(
          (cell) =>
            new TableCell({
              children: [
                typeof cell === "string"
                  ? createParagraph(cell, { size: options.cellSize || 11 })
                  : createParagraph(String(cell), options),
              ],
              shading: {
                fill:
                  rowIndex === 0 && options.headerFill
                    ? options.headerFill
                    : undefined,
              },
            }),
        ),
        tableHeader: rowIndex === 0,
      });
    }),
    width: { size: 100, type: "pct" },
    borders: {
      top: { style: borderStyle, size: borderWidth, color: borderColor },
      bottom: { style: borderStyle, size: borderWidth, color: borderColor },
      left: { style: borderStyle, size: borderWidth, color: borderColor },
      right: { style: borderStyle, size: borderWidth, color: borderColor },
      insideHorizontal: {
        style: borderStyle,
        size: borderWidth,
        color: borderColor,
      },
      insideVertical: {
        style: borderStyle,
        size: borderWidth,
        color: borderColor,
      },
    },
  });
}

/**
 * Creates a header with optional alignment
 */
function createHeader(text, options = {}) {
  return new Header({
    children: [
      createParagraph(text, {
        alignment: options.alignment || "left",
        size: 10,
        color: options.color || "666666",
      }),
    ],
  });
}

/**
 * Creates a footer with optional page numbers
 */
function createFooter(options = {}) {
  const parts = [];

  if (options.text) {
    // Split text by {{page}} placeholder
    const segments = options.text.split("{{page}}");

    segments.forEach((segment, index) => {
      if (segment) {
        parts.push(
          createText(segment, {
            size: options.fontSize || 10,
            color: options.color || "666666",
          }),
        );
      }

      if (index < segments.length - 1) {
        // Add page number field
        parts.push(
          new TextRun({
            text: "",
            pageNumber:
              options.pageType === "total"
                ? { type: "totalPages" }
                : { type: "current" },
            size: (options.fontSize || 10) * 2,
            color: options.color || "666666",
          }),
        );
      }
    });
  }

  return new Footer({
    children: [
      new Paragraph({
        children: parts.length > 0 ? parts : [new TextRun({ text: "" })],
        alignment:
          options.alignment === "center"
            ? AlignmentType.CENTER
            : options.alignment === "right"
              ? AlignmentType.RIGHT
              : AlignmentType.LEFT,
      }),
    ],
  });
}

/**
 * Creates a DOCX document from structured content with professional formatting
 *
 * @param {Object} input - Document creation parameters
 * @param {string} input.title - Document title
 * @param {Array} input.paragraphs - Array of paragraph content (strings or objects)
 * @param {Array<Array>} input.tables - Array of table data
 * @param {string} input.outputPath - Output file path
 * @param {string} [input.stylePreset] - Style preset name (minimal, professional, technical, legal, business, casual, colorful)
 * @param {Object} [input.style] - Custom style overrides
 * @param {Object} [input.header] - Header configuration {text, alignment, color}
 * @param {Object} [input.footer] - Footer configuration {text, alignment, color, includeTotal}
 * @param {string} [input.description] - Document description
 * @param {string} [input.backgroundColor] - Background color
 * @param {Object} [input.margins] - Custom margins {top, bottom, left, right} in inches
 * @returns {Promise<Object>} Result object with filePath and message
 */
export async function createDoc(input) {
  try {
    const title = input.title || "Untitled Document";
    const paragraphs = Array.isArray(input.paragraphs) ? input.paragraphs : [];
    const tables = Array.isArray(input.tables) ? input.tables : [];

    // Normalize input with extension handling FIRST (fixes .md → .docx before docs folder check)
    const normalized = validateAndNormalizeInput(input, [], "docx");
    let outputPath = normalized.outputPath;
    if (!path.isAbsolute(outputPath)) {
      outputPath = path.resolve(process.cwd(), outputPath);
    }

    // Enforce docs/ folder FIRST so duplicate prevention checks the final location
    const enforceDocs = input.enforceDocsFolder !== false;
    const { outputPath: docsPath, wasEnforced: docsEnforced } =
      enforceDocsFolder(outputPath, enforceDocs);

    if (docsEnforced) {
      outputPath = docsPath;
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
      console.log(
        `[create-doc] Enforced docs/ folder structure. File placed in: ${path.relative(
          process.cwd(),
          outputPath,
        )}`,
      );
    }
    if (wasDuplicatePrevented) {
      console.log(
        `[create-doc] Prevented duplicate file. Created: ${path.basename(
          outputPath,
        )}`,
      );
    }

    // Validate and apply style preset
    const stylePreset = input.stylePreset || "minimal";
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
      headerObj = createHeader(input.header.text, {
        alignment: input.header.alignment || "left",
        color: input.header.color,
      });
      hasHeader = true;
    }

    // Add footer if specified
    let hasFooter = false;
    let footerObj = undefined;
    if (input.footer && input.footer.text) {
      footerObj = createFooter({
        text: input.footer.text,
        alignment: input.footer.alignment || "center",
        fontSize: 10,
        color: input.footer.color,
        pageType: input.footer.includeTotal ? "total" : "current",
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
          fontFamily: styleConfig.font.family,
        }),
      );
    }

    // Add paragraphs with proper styling
    for (const para of paragraphs) {
      if (!para) continue;

      if (typeof para === "string") {
        children.push(
          createParagraph(para, {
            alignment: styleConfig.paragraph.alignment,
            spacingBefore: styleConfig.paragraph.spacingBefore,
            spacingAfter: styleConfig.paragraph.spacingAfter,
            lineSpacing: styleConfig.paragraph.lineSpacing,
            size: styleConfig.font.size,
            fontFamily: styleConfig.font.family,
            color: styleConfig.font.color,
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

        children.push(
          createParagraph(para.text, {
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
            size: para.size || paragraphStyle.size,
            bold: para.bold ?? (isHeading ? paragraphStyle.bold : false),
            italics:
              para.italics ?? (isHeading ? paragraphStyle.italic : false),
            underline: para.underline
              ? isHeading
                ? paragraphStyle.underline
                : false
              : false,
            fontFamily: styleConfig.font.family,
            color:
              para.color ||
              (isHeading ? paragraphStyle.color : styleConfig.font.color),
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
          headerFill: input.tableHeaderFill,
          cellSize: styleConfig.font.size,
        }),
      );
    }

    // Create document with proper section configuration
    const doc = new Document({
      creator: "MCP Doc Processor",
      title: title,
      description: input.description || "",
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

    return {
      success: true,
      filePath: outputPath,
      stylePreset: stylePreset,
      styleConfig: {
        preset: stylePreset,
        description: getPresetDescription(stylePreset),
        font: styleConfig.font,
        paragraph: styleConfig.paragraph,
        table: styleConfig.table,
      },
      header: hasHeader ? input.header : null,
      footer: hasFooter ? input.footer : null,
      enforcement: {
        docsFolderEnforced: docsEnforced,
        duplicatePrevented: wasDuplicatePrevented,
      },
      message: `DOCX FILE WRITTEN TO DISK at: ${outputPath}\n\nIMPORTANT: This tool has created an actual .docx file on your filesystem. Do NOT create any additional markdown or text files. The document is available at the absolute path shown above.\n\n${enforcementMessage}`,
    };
  } catch (err) {
    return {
      success: false,
      error: err.message,
      message: `Failed to create document: ${err.message}`,
    };
  }
}
