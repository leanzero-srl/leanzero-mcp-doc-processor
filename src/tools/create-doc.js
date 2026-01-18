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
} from "docx";
import fs from "fs";
import path from "path";
import { validateAndNormalizeInput, ensureDirectory } from "./utils.js";
import {
  createStyledTextRun,
  createStyledParagraph,
  createStyledCell,
  createStyledTable,
  getStyleConfig,
} from "./styling.js";

/**
 * Creates a DOCX document from structured content using docx.js with styling support
 * @param {Object} input - Tool input
 * @param {string} input.title - Document title (required)
 * @param {string[]} input.paragraphs - Array of paragraph strings or objects with style info
 * @param {Array<Array<string>>} input.tables - 2D array for table data
 * @param {Object} [input.style] - Style configuration options (optional)
 *   - font: { size, color, fontFamily } — Font styling options
 *   - paragraph: { alignment, spacingBefore, spacingAfter, lineSpacing } — Paragraph formatting
 *   - table: { borderColor, borderStyle, borderWidth } — Table styling options
 * @param {string} [input.stylePreset] - Name of style preset to use ("minimal", "professional", "colorful")
 * @param {string} [input.outputPath] - Output file path (default: ./output/document.docx)
 * @param {Object} [input.header] - Header configuration options
 *   - text: string — Text to display in header
 *   - alignment: "left" | "center" | "right" — Header text alignment
 * @param {Object} [input.footer] - Footer configuration options
 *   - text: string — Text to display in footer (use {{page}} for page number)
 *   - alignment: "left" | "center" | "right" — Footer text alignment
 * @param {string} [input.backgroundColor] - Background color as hex (e.g., "FFFFFF")
 * @returns {Promise<Object>} Result object with filePath and message
 */
export async function createDoc(input) {
  try {
    // Step 1: Validate and normalize input
    const normalized = validateAndNormalizeInput(input, ["title"]);

    // Optional fields with defaults
    const paragraphs = Array.isArray(input.paragraphs) ? input.paragraphs : [];
    const tables = Array.isArray(input.tables) ? input.tables : [];

    // Get style configuration (merge preset with custom options)
    const styleConfig = getStyleConfig(input.stylePreset, input.style || {});

    // Step 2: Ensure output directory exists
    await ensureDirectory(path.dirname(normalized.outputPath));

    // Step 3: Build document using docx.js API

    // Create header if specified
    let header = null;
    if (input.header && input.header.text) {
      const headerAlignmentMap = {
        left: AlignmentType.LEFT,
        center: AlignmentType.CENTER,
        right: AlignmentType.RIGHT,
      };

      header = new Header({
        children: [
          createStyledParagraph(
            [createStyledTextRun(input.header.text, styleConfig.font)],
            { alignment: input.header.alignment || "center" },
          ),
        ],
      });
    }

    // Create footer if specified
    let footer = null;
    if (input.footer && input.footer.text) {
      const footerAlignmentMap = {
        left: AlignmentType.LEFT,
        center: AlignmentType.CENTER,
        right: AlignmentType.RIGHT,
      };

      // Parse the footer text for page number placeholder {{page}}
      let footerChildren = [];
      let remainingText = input.footer.text;

      while (remainingText.includes("{{page}}")) {
        const splitIndex = remainingText.indexOf("{{page}}");
        if (splitIndex > 0) {
          // Add regular text before the placeholder
          const textPart = remainingText.substring(0, splitIndex);
          footerChildren.push(createStyledTextRun(textPart, styleConfig.font));
        }

        // Add page number field
        const fontSize = styleConfig.font.size * 20; // Convert points to twips
        footerChildren.push(
          new TextRun({
            text: "",
            pageNumber: {
              type: "current", // Current page number
            },
            size: fontSize,
            color: styleConfig.font.color,
          }),
        );

        remainingText = remainingText.substring(splitIndex + "{{page}}".length);
      }

      // Add any remaining text after the last placeholder
      if (remainingText.length > 0) {
        footerChildren.push(
          createStyledTextRun(remainingText, styleConfig.font),
        );
      }

      footer = new Footer({
        children: [
          new Paragraph({
            children: footerChildren,
            alignment: footerAlignmentMap[input.footer.alignment || "center"],
          }),
        ],
      });
    }

    // Build document children
    const children = [];

    // Add title with styled text run
    const titleStyle = {
      bold: true,
      color: styleConfig.font.color,
      size: styleConfig.font.size * 20,
      fontFamily: styleConfig.font.family,
    };
    children.push(
      createStyledParagraph(
        [createStyledTextRun(normalized.title, titleStyle)],
        { alignment: "center", spacingBefore: 300 },
      ),
    );

    // Add paragraphs with styling support
    for (const para of paragraphs) {
      if (typeof para === "string") {
        // Simple string paragraph - use default styling
        children.push(
          createStyledParagraph(
            [createStyledTextRun(para, styleConfig.font)],
            styleConfig.paragraph,
          ),
        );
      } else if (para && typeof para === "object" && para.text) {
        // Paragraph object with custom styling options
        const textStyle = {
          bold: para.bold,
          italics: para.italics,
          underline: para.underline,
          color: para.color || styleConfig.font.color,
          size: (para.size || styleConfig.font.size) * 20,
          fontFamily: para.fontFamily || styleConfig.font.family,
        };
        const paragraphStyle = {
          alignment: para.alignment || styleConfig.paragraph.alignment,
          spacingBefore:
            para.spacingBefore ?? styleConfig.paragraph.spacingBefore,
          spacingAfter: para.spacingAfter ?? styleConfig.paragraph.spacingAfter,
          lineSpacing: para.lineSpacing ?? styleConfig.paragraph.lineSpacing,
        };
        children.push(
          createStyledParagraph(
            [createStyledTextRun(para.text, textStyle)],
            paragraphStyle,
          ),
        );
      }
    }

    // Add tables
    for (const tableData of tables) {
      if (!Array.isArray(tableData) || tableData.length === 0) continue;

      // Build rows with styled cells
      const rows = tableData.map((rowData, rowIndex) => {
        const cells = rowData.map((cellValue) =>
          createStyledCell(
            [new Paragraph(String(cellValue || ""))],
            styleConfig.table,
          ),
        );

        return new TableRow({
          children: cells,
          tableHeader: rowIndex === 0,
        });
      });

      // Create styled table
      const tableStyle = {
        borderColor: styleConfig.table.borderColor,
        borderStyle: styleConfig.table.borderStyle,
        borderWidth: styleConfig.table.borderWidth,
      };
      const table = createStyledTable(rows, tableStyle);

      children.push(table);
    }

    // Build section properties with header/footer if specified
    const sectionProperties = {};

    if (header) {
      sectionProperties.header = header;
    }
    if (footer) {
      sectionProperties.footer = footer;
    }

    // Create document with sections and background color if specified
    const docConfig = {
      sections: [
        {
          properties: sectionProperties,
          children,
        },
      ],
    };

    // Add background color to document configuration if specified
    if (input.backgroundColor) {
      docConfig.background = {
        color: input.backgroundColor.replace("#", "").toUpperCase(),
      };
    }

    const doc = new Document(docConfig);

    // Step 4: Generate buffer using Packer
    const buffer = await Packer.toBuffer(doc);

    // Step 5: Write to file
    await fs.promises.writeFile(normalized.outputPath, buffer);

    // Build feature summary for response
    const features = [];
    if (header) features.push("header");
    if (footer) features.push("footer");
    if (input.backgroundColor)
      features.push(`background(${input.backgroundColor})`);

    const featureDesc =
      features.length > 0 ? ` with ${features.join(", ")}` : "";

    // Step 6: Return success
    return {
      success: true,
      filePath: path.resolve(normalized.outputPath),
      styleConfig,
      message: `DOCX document created successfully${featureDesc} (preset: ${input.stylePreset || "minimal"}) - ${paragraphs.length} paragraphs and ${tables.length} tables.`,
    };
  } catch (err) {
    return {
      success: false,
      error: err.message,
      message: `Failed to create DOCX document: ${err.message}`,
    };
  }
}
