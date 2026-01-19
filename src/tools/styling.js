import {
  AlignmentType,
  Paragraph as DocxParagraph,
  TextRun,
  TableCell,
  TableRow,
  Table as DocxTable,
  HeadingLevel,
} from "docx";

// Simple cell reference encoder for Excel (0,0 -> A1, 0,1 -> B1, etc.)
function encodeCell(row, col) {
  let result = "";
  while (col >= 0) {
    result = String.fromCharCode(65 + (col % 26)) + result;
    col = Math.floor(col / 26) - 1;
  }
  return result + (row + 1);
}

/**
 * Centralized styling configuration module for document generation
 * Provides consistent styling standards and helper functions for DOCX and Excel documents
 * Based on industry best practices for different document types
 */

// ============================================================================
// STYLE PRESETS - Comprehensive formatting for different document types
// ============================================================================

const STYLE_PRESETS = {
  // MINIMAL - Clean, simple, minimal styling
  minimal: {
    // DOCX styling
    font: { size: 11, color: "000000", bold: false, family: "Arial" },
    heading1: {
      size: 16,
      color: "000000",
      bold: true,
      spacingBefore: 280,
      spacingAfter: 140,
    },
    heading2: {
      size: 14,
      color: "1A1A1A",
      bold: true,
      spacingBefore: 240,
      spacingAfter: 120,
    },
    heading3: {
      size: 12,
      color: "333333",
      bold: true,
      spacingBefore: 200,
      spacingAfter: 100,
    },
    heading: {
      size: 14,
      color: "000000",
      bold: true,
      spacingBefore: 240,
      spacingAfter: 120,
    },
    title: {
      size: 24,
      color: "333333",
      bold: true,
      spacingBefore: 240,
      spacingAfter: 120,
      alignment: "center",
    },
    paragraph: {
      alignment: "left",
      spacingBefore: 120,
      spacingAfter: 120,
      lineSpacing: 1.0,
    },
    table: { borderColor: "D9D9D9", borderStyle: "single", borderWidth: 4 },
    // Excel styling
    columnWidths: {},
    rowHeights: {},
    headerBold: true,
    headerSize: 11,
    headerColor: "FFFFFF",
    headerBackground: "4472C4", // Excel blue
  },

  // PROFESSIONAL - Sophisticated, traditional professional formatting with serif typography
  professional: {
    // DOCX styling - Traditional, refined aesthetic with Garamond serif font
    font: { size: 11, color: "2C2C2C", bold: false, family: "Garamond" },
    heading1: {
      size: 16,
      color: "1A1A1A",
      bold: true,
      underline: true,
      spacingBefore: 360,
      spacingAfter: 200,
    },
    heading2: {
      size: 14,
      color: "2C2C2C",
      bold: true,
      italic: true,
      spacingBefore: 300,
      spacingAfter: 180,
    },
    heading3: {
      size: 12,
      color: "3A3A3A",
      bold: true,
      spacingBefore: 240,
      spacingAfter: 140,
    },
    heading: {
      size: 14,
      color: "1A1A1A",
      bold: true,
      spacingBefore: 300,
      spacingAfter: 180,
    },
    title: {
      size: 22,
      color: "1A1A1A",
      bold: true,
      spacingBefore: 480,
      spacingAfter: 300,
      alignment: "center",
    },
    paragraph: {
      alignment: "both", // Full justification for professional, polished look
      spacingBefore: 180,
      spacingAfter: 180,
      lineSpacing: 1.25,
    },
    table: { borderColor: "999999", borderStyle: "single", borderWidth: 6 },
    // Excel styling
    columnWidths: {},
    rowHeights: {},
    headerBold: true,
    headerSize: 11,
    headerColor: "FFFFFF",
    headerBackground: "3A3A3A", // Sophisticated dark gray
  },

  // TECHNICAL - Optimized for technical documentation
  technical: {
    // DOCX styling - Based on technical documentation best practices
    font: { size: 11, color: "000000", bold: false, family: "Arial" },
    heading1: {
      size: 16,
      color: "000000",
      bold: true,
      spacingBefore: 280,
      spacingAfter: 140,
    },
    heading2: {
      size: 14,
      color: "1A1A1A",
      bold: true,
      spacingBefore: 240,
      spacingAfter: 120,
    },
    heading3: {
      size: 12,
      color: "333333",
      bold: true,
      spacingBefore: 200,
      spacingAfter: 100,
    },
    heading: {
      size: 14,
      color: "000000",
      bold: true,
      spacingBefore: 240,
      spacingAfter: 120,
    },
    title: {
      size: 24,
      color: "000000",
      bold: true,
      spacingBefore: 240,
      spacingAfter: 120,
      alignment: "left",
    },
    paragraph: {
      alignment: "left",
      spacingBefore: 120,
      spacingAfter: 120,
      lineSpacing: 1.15,
    },
    table: { borderColor: "000000", borderStyle: "single", borderWidth: 6 },
    // Excel styling
    columnWidths: {},
    rowHeights: {},
    headerBold: true,
    headerSize: 11,
    headerColor: "FFFFFF",
    headerBackground: "000000", // Black headers for technical data
  },

  // LEGAL - Professional legal document formatting
  legal: {
    // DOCX styling - Based on legal document standards
    font: { size: 12, color: "000000", bold: false, family: "Times New Roman" },
    heading1: {
      size: 16,
      color: "000000",
      bold: true,
      underline: true,
      spacingBefore: 360,
      spacingAfter: 240,
    },
    heading2: {
      size: 14,
      color: "1A1A1A",
      bold: true,
      underline: true,
      spacingBefore: 300,
      spacingAfter: 240,
    },
    heading3: {
      size: 13,
      color: "2C2C2C",
      bold: true,
      spacingBefore: 280,
      spacingAfter: 200,
    },
    heading: {
      size: 14,
      color: "000000",
      bold: true,
      spacingBefore: 240,
      spacingAfter: 240,
      underline: true,
    },
    title: {
      size: 16,
      color: "000000",
      bold: true,
      spacingBefore: 480,
      spacingAfter: 480,
      alignment: "center",
      underline: true,
    },
    paragraph: {
      alignment: "both", // Justified text for legal docs
      spacingBefore: 240,
      spacingAfter: 240,
      lineSpacing: 2.0, // Double spacing for legal documents
    },
    table: { borderColor: "000000", borderStyle: "single", borderWidth: 8 },
    // Excel styling
    columnWidths: {},
    rowHeights: {},
    headerBold: true,
    headerSize: 12,
    headerColor: "000000",
    headerBackground: "FFFFFF", // White background, black text
  },

  // BUSINESS - Modern, polished business formatting with sophisticated aesthetics
  business: {
    // DOCX styling - Contemporary, "spiffy" modern business look
    font: { size: 11, color: "333333", bold: false, family: "Calibri" },
    heading1: {
      size: 18,
      color: "1F4E79",
      bold: true,
      spacingBefore: 320,
      spacingAfter: 180,
    },
    heading2: {
      size: 15,
      color: "2B579A",
      bold: true,
      spacingBefore: 260,
      spacingAfter: 140,
    },
    heading3: {
      size: 13,
      color: "3A5F8F",
      bold: true,
      spacingBefore: 200,
      spacingAfter: 120,
    },
    heading: {
      size: 16,
      color: "1F4E79",
      bold: true,
      spacingBefore: 280,
      spacingAfter: 140,
    },
    title: {
      size: 28,
      color: "1F4E79",
      bold: true,
      spacingBefore: 360,
      spacingAfter: 280,
      alignment: "center",
    },
    paragraph: {
      alignment: "left",
      spacingBefore: 140,
      spacingAfter: 140,
      lineSpacing: 1.2,
    },
    table: { borderColor: "B7C9D6", borderStyle: "single", borderWidth: 6 },
    // Excel styling
    columnWidths: {},
    rowHeights: {},
    headerBold: true,
    headerSize: 11,
    headerColor: "FFFFFF",
    headerBackground: "1F4E79", // Refined business blue
  },

  // CASUAL - Friendly, readable formatting
  casual: {
    // DOCX styling - More relaxed, friendly formatting
    font: { size: 12, color: "333333", bold: false, family: "Verdana" },
    heading1: {
      size: 18,
      color: "E65100",
      bold: true,
      spacingBefore: 240,
      spacingAfter: 140,
    },
    heading2: {
      size: 16,
      color: "F57C00",
      bold: true,
      spacingBefore: 200,
      spacingAfter: 120,
    },
    heading3: {
      size: 14,
      color: "FF9800",
      bold: true,
      spacingBefore: 180,
      spacingAfter: 100,
    },
    heading: {
      size: 16,
      color: "E65100",
      bold: true,
      spacingBefore: 200,
      spacingAfter: 100,
    },
    title: {
      size: 28,
      color: "E65100",
      bold: true,
      spacingBefore: 200,
      spacingAfter: 200,
      alignment: "center",
    },
    paragraph: {
      alignment: "left",
      spacingBefore: 120,
      spacingAfter: 120,
      lineSpacing: 1.15,
    },
    table: { borderColor: "FF9800", borderStyle: "single", borderWidth: 6 },
    // Excel styling
    columnWidths: {},
    rowHeights: {},
    headerBold: true,
    headerSize: 12,
    headerColor: "FFFFFF",
    headerBackground: "FF9800", // Orange for casual
  },

  // COLORFUL - Vibrant, eye-catching formatting
  colorful: {
    // DOCX styling
    font: { size: 12, color: "C2185B", bold: false, family: "Arial" },
    heading1: {
      size: 20,
      color: "7B1FA2",
      bold: true,
      spacingBefore: 280,
      spacingAfter: 160,
    },
    heading2: {
      size: 17,
      color: "8E24AA",
      bold: true,
      spacingBefore: 240,
      spacingAfter: 140,
    },
    heading3: {
      size: 15,
      color: "9C27B0",
      bold: true,
      spacingBefore: 200,
      spacingAfter: 120,
    },
    heading: {
      size: 16,
      color: "7B1FA2",
      bold: true,
      spacingBefore: 200,
      spacingAfter: 100,
    },
    title: {
      size: 28,
      color: "C2185B",
      bold: true,
      spacingBefore: 200,
      spacingAfter: 200,
      alignment: "center",
    },
    paragraph: {
      alignment: "center",
      spacingBefore: 120,
      spacingAfter: 120,
      lineSpacing: 1.0,
    },
    table: { borderColor: "7B1FA2", borderStyle: "double", borderWidth: 8 },
    // Excel styling
    columnWidths: {},
    rowHeights: {},
    headerBold: true,
    headerSize: 12,
    headerColor: "FFFFFF",
    headerBackground: "7B1FA2", // Purple for colorful
  },
};

// ============================================================================
// DOCX STYLE HELPERS
// ============================================================================

/**
 * Creates a styled TextRun with specified options
 * @param {string} text - The text content
 * @param {Object} styleOptions - Style options (bold, italic, underline, color, size)
 * @returns {TextRun} Styled TextRun instance
 */
export function createStyledTextRun(text, styleOptions = {}) {
  const defaults = STYLE_PRESETS.minimal.font;
  const style = {
    bold: styleOptions.bold ?? false,
    italics: styleOptions.italics ?? false,
    underline: styleOptions.underline ? { style: "single" } : undefined,
    color: styleOptions.color || defaults.color,
    size: (styleOptions.size || defaults.size) * 2, // Convert points to half-points (docx format)
    font: styleOptions.fontFamily || defaults.family,
  };

  return new TextRun({
    text,
    ...style,
  });
}

/**
 * Creates a styled Paragraph with specified options
 * @param {Array<TextRun|Paragraph>} children - Content of the paragraph
 * @param {Object} styleOptions - Style options (alignment, spacingBefore, spacingAfter)
 * @returns {DocxParagraph} Styled Paragraph instance
 */
export function createStyledParagraph(children, styleOptions = {}) {
  const defaults = STYLE_PRESETS.minimal.paragraph;
  const alignmentMap = {
    left: AlignmentType.LEFT,
    right: AlignmentType.RIGHT,
    center: AlignmentType.CENTER,
    both: AlignmentType.BOTH,
  };

  return new DocxParagraph({
    children: Array.isArray(children) ? children : [children],
    alignment: styleOptions.alignment || alignmentMap[defaults.alignment],
    spacing: {
      before: styleOptions.spacingBefore ?? defaults.spacingBefore,
      after: styleOptions.spacingAfter ?? defaults.spacingAfter,
      line: styleOptions.lineSpacing
        ? Math.round(styleOptions.lineSpacing * 240)
        : undefined,
    },
  });
}

/**
 * Creates a styled TableCell with content only (table-level borders used instead)
 * @param {Array|Paragraph} children - Content of the cell
 * @returns {TableCell} TableCell instance
 */
export function createStyledCell(children) {
  return new TableCell({
    children: Array.isArray(children) ? children : [children],
  });
}

/**
 * Creates styled Table with specified borders and width
 * @param {Array<TableRow>} rows - Table rows
 * @param {Object} tableOptions - Table styling options (borderColor, borderStyle, borderWidth)
 * @returns {DocxTable} Styled Table instance
 */
export function createStyledTable(rows, tableOptions = {}) {
  const defaults = STYLE_PRESETS.minimal.table;

  const borderColor = tableOptions.borderColor || defaults.borderColor;
  const borderStyle = tableOptions.borderStyle || defaults.borderStyle;
  const borderWidth = tableOptions.borderWidth ?? defaults.borderWidth;

  return new DocxTable({
    rows,
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
 * Creates a styled heading paragraph based on preset
 * @param {string} text - The heading text
 * @param {string} level - Heading level (heading1, heading2, heading3)
 * @param {string} preset - Style preset name
 * @returns {DocxParagraph} Styled heading paragraph
 */
export function createStyledHeading(
  text,
  level = "heading1",
  preset = "minimal",
) {
  const config = STYLE_PRESETS[preset] || STYLE_PRESETS.minimal;

  // Get specific heading level config or fallback to generic heading
  const headingConfig =
    config[`heading${level.replace("heading", "")}`] || config.heading;

  const headingLevelMap = {
    heading1: HeadingLevel.HEADING_1,
    heading2: HeadingLevel.HEADING_2,
    heading3: HeadingLevel.HEADING_3,
  };

  return new DocxParagraph({
    children: [
      new TextRun({
        text,
        bold: headingConfig.bold,
        italics: headingConfig.italic || false,
        color: headingConfig.color,
        size: headingConfig.size * 2,
        font: config.font.family,
        underline: headingConfig.underline ? { style: "single" } : undefined,
      }),
    ],
    heading: headingLevelMap[level],
    alignment:
      config.paragraph.alignment === "both"
        ? AlignmentType.BOTH
        : config.paragraph.alignment,
    spacing: {
      before: headingConfig.spacingBefore,
      after: headingConfig.spacingAfter,
    },
  });
}

// ============================================================================
// EXCEL STYLE HELPERS
// ============================================================================

/**
 * Creates column width configuration for Excel
 * @param {Object} widths - Map of column indices to character widths
 * @returns {Array<Object>} Column configuration array
 */
export function createExcelColumnWidths(widths) {
  if (!widths || typeof widths !== "object") return [];

  return Object.entries(widths).map(([colIndex, width]) => ({
    wch: Number(width),
  }));
}

/**
 * Creates row height configuration for Excel
 * @param {Object} heights - Map of row indices to point heights
 * @returns {Array<Object>} Row configuration array
 */
export function createExcelRowHeights(heights) {
  if (!heights || typeof heights !== "object") return [];

  return Object.entries(heights).map(([rowIndex, height]) => ({
    hpt: Number(height),
  }));
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Converts hex color string to Excel-compatible RGB format
 * @param {string} hexColor - Hex color code (e.g., "FF0000")
 * @returns {Object} RGB object with r, g, b properties for Excel styling
 */
function parseColorToRGB(hexColor) {
  const cleanHex = hexColor.replace(/[^0-9A-Fa-f]/g, "");

  if (cleanHex.length !== 6) {
    return { r: "00", g: "00", b: "00" };
  }

  return {
    r: cleanHex.substring(0, 2),
    g: cleanHex.substring(2, 4),
    b: cleanHex.substring(4, 6),
  };
}

/**
 * Merges custom style options with a base preset
 * @param {string} presetName - Name of the preset to use as base
 * @param {Object} customOptions - Custom style options to override defaults
 * @returns {Object} Merged style configuration object (includes both DOCX and Excel properties)
 */
export function getStyleConfig(presetName = "minimal", customOptions = {}) {
  const basePreset = STYLE_PRESETS[presetName] || STYLE_PRESETS.minimal;

  return {
    font: { ...basePreset.font, ...(customOptions.font || {}) },
    heading1: { ...basePreset.heading1, ...(customOptions.heading1 || {}) },
    heading2: { ...basePreset.heading2, ...(customOptions.heading2 || {}) },
    heading3: { ...basePreset.heading3, ...(customOptions.heading3 || {}) },
    heading: { ...basePreset.heading, ...(customOptions.heading || {}) },
    title: { ...basePreset.title, ...(customOptions.title || {}) },
    paragraph: { ...basePreset.paragraph, ...(customOptions.paragraph || {}) },
    table: { ...basePreset.table, ...(customOptions.table || {}) },
    // Excel-specific styling
    columnWidths:
      customOptions.columnWidths !== undefined
        ? customOptions.columnWidths
        : basePreset.columnWidths,
    rowHeights:
      customOptions.rowHeights !== undefined
        ? customOptions.rowHeights
        : basePreset.rowHeights,
    headerBold:
      customOptions.headerBold !== undefined
        ? customOptions.headerBold
        : basePreset.headerBold,
    headerSize:
      customOptions.headerSize !== undefined
        ? customOptions.headerSize
        : basePreset.headerSize,
    headerColor:
      customOptions.headerColor !== undefined
        ? customOptions.headerColor
        : basePreset.headerColor,
    headerBackground:
      customOptions.headerBackground !== undefined
        ? customOptions.headerBackground
        : basePreset.headerBackground,
  };
}

/**
 * Get list of available style presets
 * @returns {Array<string>} Array of preset names
 */
export function getAvailablePresets() {
  return Object.keys(STYLE_PRESETS);
}

/**
 * Get description for a style preset
 * @param {string} presetName - Name of the preset
 * @returns {string} Description of the preset
 */
export function getPresetDescription(presetName) {
  const descriptions = {
    minimal: "Clean, simple, minimal styling suitable for basic documents",
    professional:
      "Sophisticated traditional formatting with serif typography and full justification for established professional documents",
    technical: "Optimized for technical documentation with clear hierarchy",
    legal: "Professional legal document formatting with double spacing",
    business:
      "Modern, polished business formatting with refined color palette and sophisticated contemporary design",
    casual: "Friendly, readable formatting with warm colors",
    colorful: "Vibrant, eye-catching formatting for presentations",
  };
  return descriptions[presetName] || "Unknown preset";
}
