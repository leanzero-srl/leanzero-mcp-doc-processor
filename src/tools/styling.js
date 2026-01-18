import {
  AlignmentType,
  Paragraph as DocxParagraph,
  TextRun,
  TableCell,
  TableRow,
  Table as DocxTable,
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
 */

// ============================================================================
// STYLE PRESETS (DOCX and Excel)
// ============================================================================

const STYLE_PRESETS = {
  minimal: {
    // DOCX styling
    font: { size: 11, color: "000000", bold: false },
    paragraph: {
      alignment: "left",
      spacingBefore: 200,
      spacingAfter: 200,
      lineSpacing: 1.0,
    },
    table: { borderColor: "FFFFFF", borderStyle: "single", borderWidth: 9 },
    // Excel styling
    columnWidths: {},
    rowHeights: {},
    headerBold: false,
  },
  professional: {
    // DOCX styling
    font: { size: 12, color: "336699", bold: true },
    paragraph: {
      alignment: "left",
      spacingBefore: 240,
      spacingAfter: 240,
      lineSpacing: 1.15,
    },
    table: { borderColor: "D9D9D9", borderStyle: "single", borderWidth: 12 },
    // Excel styling
    columnWidths: {},
    rowHeights: {},
    headerBold: true,
  },
  colorful: {
    // DOCX styling
    font: { size: 11, color: "FF0000", bold: false },
    paragraph: {
      alignment: "center",
      spacingBefore: 200,
      spacingAfter: 200,
      lineSpacing: 1.0,
    },
    table: { borderColor: "00AA00", borderStyle: "double", borderWidth: 18 },
    // Excel styling
    columnWidths: {},
    rowHeights: {},
    headerBold: false,
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
    bold: styleOptions.bold || false,
    italics: styleOptions.italics || false,
    underline: styleOptions.underline || false,
    color: styleOptions.color || defaults.color,
    size: (styleOptions.size || defaults.size) * 20, // Convert points to twips
    font: styleOptions.fontFamily || "Arial",
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
      lineSpacing: styleOptions.lineSpacing ?? defaults.lineSpacing,
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
    width: { size: 100, unit: "percentage" },
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
    },
  });
}

// ============================================================================
// EXCEL STYLE HELPERS
// ============================================================================

/**
 * Creates Excel style object for cells with font properties
 * @param {Object} options - Style options (bold, italic, underline, color)
 * @returns {Object} Style configuration compatible with xlsx library
 */
export function createExcelStyle(options = {}) {
  const defaults = STYLE_PRESETS.minimal.font;

  return {
    font: {
      bold: options.bold || false,
      italic: options.italics || false,
      underline: options.underline || false,
      color: parseColorToRGB(options.color || defaults.color),
      size: options.size || defaults.size,
    },
    pattern: options.pattern || 1, // Cell pattern type
  };
}

/**
 * Creates column width configuration for Excel
 * @param {Object} widths - Map of column indices to character widths
 * @returns {Array<Object>} Column configuration array
 */
export function createExcelColumnWidths(widths) {
  if (!widths || typeof widths !== "object") return [];

  return Object.entries(widths).map(([colIndex, width]) => ({
    wch: Number(width),
    style: { font: { bold: false } },
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
    hpx: Number(height),
  }));
}

/**
 * Applies styles to Excel worksheet cells
 * @param {Object} ws - Worksheet object from xlsx library
 * @param {Array<Array<any>>} data - Original data array for reference
 * @param {Object} styleConfig - Style configuration with font options
 */
export function applyExcelStyles(ws, data, styleConfig = {}) {
  if (!ws || !data) return;

  // Apply styling to all cells
  for (let row = 0; row < data.length; row++) {
    for (let col = 0; col < data[row].length; col++) {
      const cellRef = encodeCell(row, col);
      if (!ws[cellRef]) continue;

      ws[cellRef].s = ws[cellRef].s || {};
      ws[cellRef].s.font = ws[cellRef].s.font || {};

      // Header bold styling (first row)
      const isHeader = row === 0;

      // Font properties
      if (styleConfig.font) {
        if (styleConfig.font.color) {
          ws[cellRef].s.font.color = parseColorToRGB(styleConfig.font.color);
        }
        if (styleConfig.font.size) {
          ws[cellRef].s.font.sz = styleConfig.font.size;
        }
        ws[cellRef].s.font.b = styleConfig.font.bold ? 1 : 0;
        ws[cellRef].s.font.i = styleConfig.font.italics ? 1 : 0;
      }

      // Override header with bold if specified
      if (styleConfig.headerBold && isHeader) {
        ws[cellRef].s.font.b = 1;
      }
    }
  }
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
  };
}
