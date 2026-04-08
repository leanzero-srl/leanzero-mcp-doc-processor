import {
  AlignmentType,
  Paragraph as DocxParagraph,
  TextRun,
  TableCell,
  TableRow,
  Table as DocxTable,
  HeadingLevel,
  RunFonts,
  BorderStyle,
  ShadingType,
  WidthType,
  PageNumber,
  TabStopType,
  TabStopPosition,
  LevelFormat,
  Header,
  Footer,
} from "docx";

// ============================================================================
// Enhanced Color Palettes - Professional & Modern
// ============================================================================

/**
 * Comprehensive color palette for high-end document generation.
 */
export const CLAUDE_COLORS = {
  // Brand colors (Claude-inspired)
  PRIMARY: {
    BLUE: "1F4E79",      // Main brand blue
    LIGHT_BLUE: "2B579A", // Lighter accent
    DARK_BLUE: "3A5F8F",  // Darker variant
    EXTRA_LIGHT: "D6E4ED", // Very light blue
  },

  // Modern Professional (Slate/Navy)
  MODERN: {
    NAVY: "1B263B",      // Deep navy for headings
    SLATE: "415A77",     // Muted slate for subheadings
    LIGHT_SLATE: "778DA9", // Lighter slate
    ICE: "E0E1DD",       // Very light ice blue/gray
  },

  // High-Tech (Cyber/Dark)
  TECH: {
    CYBER_BLUE: "00B4D8", // Bright cyan accent
    DEEP_SPACE: "0D1B2A", // Very dark navy/black
    MIDNIGHT: "1B263B",   // Dark background
    NEON_BLUE: "48CAE4",  // High contrast blue
  },

  // Background colors
  BACKGROUND: {
    WHITE: "FFFFFF",
    OFF_WHITE: "F8F9FA",
    LIGHT_GRAY: "F2F2F2",
    GRAY: "E5E5E5",
    DARK_GRAY: "333333",
  },
  
  // Text colors
  TEXT: {
    PRIMARY: "1A1A1A",     // Main text color
    SECONDARY: "4A4A4A",   // Secondary text
    LIGHT: "6B6B6B",       // Lighter text
    EXTRA_LIGHT: "888888", // Hint text
    WHITE: "FFFFFF",
  },
  
  // Status colors
  STATUS: {
    SUCCESS: "2E8B57",     // Sea green
    WARNING: "FFA500",     // Orange
    DANGER: "DC143C",      // Crimson
    INFO: "1F4E79",        // Blue
  },
  
  // Table styling colors
  TABLE: {
    HEADER_BG: "1F4E79",
    HEADER_TEXT: "FFFFFF",
    ZEBRA_BG: "F8F9FA",
    BORDER: "D0D7DE",
    LIGHT_BORDER: "E1E5EA",
  },
  
  // Code block colors
  CODE: {
    BACKGROUND: "F6F8FA",
    BORDER: "E3E8ED",
    TEXT: "24292E",
    KEYWORD: "D73A49",
    STRING: "50A54F",
    FUNCTION: "6F42C1",
  },
  
  // Divider colors
  DIVIDER: {
    PRIMARY: "1F4E79",
    LIGHT: "CCCCCC",
    EXTRA_LIGHT: "E0E0E0",
  },
  
  // Icon badge colors (for info/notes sections)
  INFO_BADGE: {
    BG: "E6F0FF",
    TEXT: "1F4E79",
    ICON: "2B579A",
  },
};

/**
 * Creates a font configuration using docx RunFonts class
 * @param {string} fontFamily - Font family name
 * @returns {RunFonts} Configured font object for docx
 */
export function createFontConfig(fontFamily) {
  return new RunFonts({
    ascii: fontFamily,
    highAnsi: fontFamily,
    eastAsia: fontFamily,
  });
}

// Simple cell reference encoder for Excel (0,0 -> A1, 0,1 -> B1, etc.)
export function encodeCell(row, col) {
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
  // MINIMAL - Clean Swiss-style, lots of whitespace, subtle details
  minimal: {
    font: { size: 11, color: "333333", bold: false, family: "Arial" },
    headingFont: null, // same as body
    heading1: {
      size: 16,
      color: "111111",
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
      color: "111111",
      bold: true,
      spacingBefore: 240,
      spacingAfter: 120,
    },
    title: {
      size: 24,
      color: "111111",
      bold: true,
      spacingBefore: 240,
      spacingAfter: 120,
      alignment: "center",
      smallCaps: false,
      characterSpacing: 0,
      borderBottom: null,
    },
    paragraph: {
      alignment: "left",
      spacingBefore: 120,
      spacingAfter: 120,
      lineSpacing: 1.0,
    },
    table: {
      borderColor: "D9D9D9",
      borderStyle: "single",
      borderWidth: 4,
      headerFill: "F2F2F2",
      headerFontColor: "333333",
      zebraFill: "FAFAFA",
      zebraInterval: 2,
      insideBorderColor: "E8E8E8",
      insideBorderWidth: 2,
      outsideBorderWidth: 4,
    },
    code: {
      fontFamily: "Courier New",
      fontSize: 9,
      color: "1A1A1A",
      backgroundColor: "F5F5F5",
      borderColor: "E0E0E0",
    },
    // Excel styling
    columnWidths: {},
    rowHeights: {},
    headerBold: true,
    headerSize: 11,
    headerColor: "FFFFFF",
    headerBackground: "4472C4",
  },

  // PROFESSIONAL - Executive report with serif typography and refined details
  professional: {
    font: { size: 11, color: "2C2C2C", bold: false, family: "Garamond" },
    headingFont: "Cambria",
    heading1: {
      size: 16,
      color: "1A1A1A",
      bold: true,
      underline: { type: "single", color: null },
      spacingBefore: 360,
      spacingAfter: 200,
    },
    heading2: {
      size: 14,
      color: "3A3A3A",
      bold: true,
      italic: true,
      underline: { type: "double", color: null },
      spacingBefore: 300,
      spacingAfter: 160,
    },
    heading3: {
      size: 12,
      color: "3A3A3A",
      bold: true,
      spacingBefore: 240,
      spacingAfter: 140,
    },
    title: {
      size: 22,
      color: "1A1A1A",
      bold: true,
      spacingBefore: 480,
      spacingAfter: 300,
      alignment: "center",
      smallCaps: true,
      characterSpacing: 60,
      borderBottom: { color: "999999", size: 4, style: "single", space: 4 },
    },
    paragraph: {
      alignment: "both",
      spacingBefore: 180,
      spacingAfter: 180,
      lineSpacing: 1.25,
    },
    table: {
      borderColor: "999999",
      borderStyle: "single",
      borderWidth: 6,
      headerFill: "2C2C2C",
      headerFontColor: "FFFFFF",
      zebraFill: "F5F5F3",
      zebraInterval: 2,
      insideBorderColor: "CCCCCC",
      insideBorderWidth: 2,
      outsideBorderWidth: 6,
    },
    code: {
      fontFamily: "Courier New",
      fontSize: 9,
      color: "2C2C2C",
      backgroundColor: "F5F0EB",
      borderColor: "D9D0C7",
    },
    // Excel styling
    columnWidths: {},
    rowHeights: {},
    headerBold: true,
    headerSize: 11,
    headerColor: "FFFFFF",
    headerBackground: "3A3A3A",
  },

  // TECHNICAL - Developer docs with clear hierarchy and high contrast
  technical: {
    font: { size: 11, color: "1A1A1A", bold: false, family: "Arial" },
    headingFont: "Segoe UI",
    heading1: {
      size: 16,
      color: "1A1A1A",
      bold: true,
      spacingBefore: 280,
      spacingAfter: 140,
    },
    heading2: {
      size: 14,
      color: "3A3A3A",
      bold: true,
      underline: { type: "single", color: null },
      spacingBefore: 240,
      spacingAfter: 160,
    },
    heading3: {
      size: 12,
      color: "333333",
      bold: true,
      spacingBefore: 200,
      spacingAfter: 100,
    },
    title: {
      size: 24,
      color: "1A1A1A",
      bold: true,
      spacingBefore: 240,
      spacingAfter: 120,
      alignment: "left",
      smallCaps: false,
      characterSpacing: 0,
      borderBottom: { color: "333333", size: 6, style: "single", space: 2 },
    },
    paragraph: {
      alignment: "left",
      spacingBefore: 120,
      spacingAfter: 120,
      lineSpacing: 1.15,
    },
    table: {
      borderColor: "333333",
      borderStyle: "single",
      borderWidth: 6,
      headerFill: "1A1A1A",
      headerFontColor: "FFFFFF",
      zebraFill: "F0F0F0",
      zebraInterval: 2,
      insideBorderColor: "D0D0D0",
      insideBorderWidth: 2,
      outsideBorderWidth: 6,
    },
    code: {
      fontFamily: "Courier New",
      fontSize: 9,
      color: "1A1A1A",
      backgroundColor: "F5F5F5",
      borderColor: "E0E0E0",
    },
    // Excel styling
    columnWidths: {},
    rowHeights: {},
    headerBold: true,
    headerSize: 11,
    headerColor: "FFFFFF",
    headerBackground: "000000",
  },

  // LEGAL - Conservative formal formatting, double-spaced, no frills
  legal: {
    font: { size: 12, color: "000000", bold: false, family: "Times New Roman" },
    headingFont: null,
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
      color: "3A3A3A",
      bold: true,
      underline: { type: "double", color: null },
      spacingBefore: 240,
      spacingAfter: 160,
    },
    heading3: {
      size: 12,
      color: "4C4C4C",
      bold: true,
      underline: { type: "single", color: null },
      spacingBefore: 200,
      spacingAfter: 120,
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
      smallCaps: false,
      characterSpacing: 0,
      borderBottom: null,
    },
    paragraph: {
      alignment: "both",
      spacingBefore: 240,
      spacingAfter: 240,
      lineSpacing: 2.0,
    },
    table: {
      borderColor: "000000",
      borderStyle: "single",
      borderWidth: 8,
      headerFill: null,
      headerFontColor: "000000",
      zebraFill: null,
      zebraInterval: 2,
      insideBorderColor: null,
      insideBorderWidth: null,
      outsideBorderWidth: null,
    },
    code: {
      fontFamily: "Courier New",
      fontSize: 10,
      color: "000000",
      backgroundColor: "F5F5F5",
      borderColor: "D9D9D9",
    },
    // Excel styling
    columnWidths: {},
    rowHeights: {},
    headerBold: true,
    headerSize: 12,
    headerColor: "000000",
    headerBackground: "FFFFFF",
  },

  // BUSINESS - Modern corporate with refined navy/slate palette
  business: {
    font: { size: 11, color: "333333", bold: false, family: "Calibri" },
    headingFont: "Calibri Light",
    heading1: {
      size: 18,
      color: "1B263B", // MODERN.NAVY
      bold: true,
      spacingBefore: 320,
      spacingAfter: 180,
    },
    heading2: {
      size: 15,
      color: "415A77", // MODERN.SLATE
      bold: true,
      spacingBefore: 260,
      spacingAfter: 140,
    },
    heading3: {
      size: 13,
      color: "778DA9", // MODERN.LIGHT_SLATE
      bold: true,
      spacingBefore: 200,
      spacingAfter: 120,
    },
    heading: {
      size: 16,
      color: "1B263B",
      bold: true,
      spacingBefore: 280,
      spacingAfter: 140,
    },
    title: {
      size: 28,
      color: "1B263B",
      bold: true,
      spacingBefore: 360,
      spacingAfter: 280,
      alignment: "center",
      smallCaps: false,
      characterSpacing: 40,
      borderBottom: { color: "1B263B", size: 8, style: "single", space: 6 },
    },
    paragraph: {
      alignment: "left",
      spacingBefore: 140,
      spacingAfter: 140,
      lineSpacing: 1.2,
    },
    table: {
      borderColor: "778DA9",
      borderStyle: "single",
      borderWidth: 6,
      headerFill: "1B263B",
      headerFontColor: "FFFFFF",
      zebraFill: "E0E1DD", // MODERN.ICE
      zebraInterval: 2,
      insideBorderColor: "778DA9",
      insideBorderWidth: 2,
      outsideBorderWidth: 6,
    },
    code: {
      fontFamily: "Courier New",
      fontSize: 9,
      color: "1B263B",
      backgroundColor: "E0E1DD",
      borderColor: "778DA9",
    },
    // Excel styling
    columnWidths: {},
    rowHeights: {},
    headerBold: true,
    headerSize: 11,
    headerColor: "FFFFFF",
    headerBackground: "1B263B",
  },

  // MODERN EXECUTIVE - Clean, high-end corporate styling
  modern_executive: {
    font: { size: 11, color: "333333", bold: false, family: "Arial" },
    headingFont: "Arial",
    heading1: {
      size: 20,
      color: "1B263B",
      bold: true,
      spacingBefore: 360,
      spacingAfter: 180,
    },
    heading2: {
      size: 16,
      color: "415A77",
      bold: true,
      spacingBefore: 280,
      spacingAfter: 140,
    },
    heading3: {
      size: 13,
      color: "778DA9",
      bold: true,
      spacingBefore: 220,
      spacingAfter: 100,
    },
    heading: {
      size: 16,
      color: "1B263B",
      bold: true,
      spacingBefore: 240,
      spacingAfter: 120,
    },
    title: {
      size: 26,
      color: "1B263B",
      bold: true,
      spacingBefore: 480,
      spacingAfter: 320,
      alignment: "left",
      smallCaps: true,
      characterSpacing: 20,
      borderBottom: { color: "1B263B", size: 4, style: "single", space: 8 },
    },
    paragraph: {
      alignment: "left",
      spacingBefore: 140,
      spacingAfter: 140,
      lineSpacing: 1.15,
    },
    table: {
      borderColor: "E0E1DD",
      borderStyle: "single",
      borderWidth: 4,
      headerFill: "1B263B",
      headerFontColor: "FFFFFF",
      zebraFill: "F8F9FA",
      zebraInterval: 2,
      insideBorderColor: "E0E1DD",
      insideBorderWidth: 1,
      outsideBorderWidth: 4,
    },
    code: {
      fontFamily: "Courier New",
      fontSize: 9,
      color: "1B263B",
      backgroundColor: "F8F9FA",
      borderColor: "E0E1DD",
    },
    // Excel styling
    columnWidths: {},
    rowHeights: {},
    headerBold: true,
    headerSize: 11,
    headerColor: "FFFFFF",
    headerBackground: "1B263B",
  },

  // TECHNICAL - Developer docs with clear hierarchy and high contrast
  technical: {
    font: { size: 11, color: "1A1A1A", bold: false, family: "Arial" },
    headingFont: "Segoe UI",
    heading1: {
      size: 18,
      color: "0D1B2A", // TECH.DEEP_SPACE
      bold: true,
      spacingBefore: 320,
      spacingAfter: 160,
    },
    heading2: {
      size: 15,
      color: "1B263B", // TECH.MIDNIGHT
      bold: true,
      underline: { type: "single", color: null },
      spacingBefore: 280,
      spacingAfter: 160,
    },
    heading3: {
      size: 13,
      color: "415A77", // TECH.SLATE
      bold: true,
      spacingBefore: 220,
      spacingAfter: 120,
    },
    title: {
      size: 26,
      color: "0D1B2A",
      bold: true,
      spacingBefore: 280,
      spacingAfter: 160,
      alignment: "left",
      smallCaps: false,
      characterSpacing: 0,
      borderBottom: { color: "00B4D8", size: 6, style: "single", space: 2 }, // TECH.CYBER_BLUE
    },
    paragraph: {
      alignment: "left",
      spacingBefore: 140,
      spacingAfter: 140,
      lineSpacing: 1.2,
    },
    table: {
      borderColor: "1B263B",
      borderStyle: "single",
      borderWidth: 6,
      headerFill: "0D1B2A",
      headerFontColor: "FFFFFF",
      zebraFill: "E0E1DD", // TECH.ICE
      zebraInterval: 2,
      insideBorderColor: "778DA9",
      insideBorderWidth: 2,
      outsideBorderWidth: 6,
    },
    code: {
      fontFamily: "Courier New",
      fontSize: 10,
      color: "0D1B2A",
      backgroundColor: "F8F9FA",
      borderColor: "48CAE4", // TECH.NEON_BLUE
    },
    // Excel styling
    columnWidths: {},
    rowHeights: {},
    headerBold: true,
    headerSize: 11,
    headerColor: "FFFFFF",
    headerBackground: "0D1B2A",
  },

  // HIGH-TECH - Cyberpunk/Developer aesthetic with neon accents
  high_tech: {
    font: { size: 11, color: "E0E1DD", bold: false, family: "Consolas" },
    headingFont: "Consolas",
    heading1: {
      size: 22,
      color: "00B4D8", // TECH.CYBER_BLUE
      bold: true,
      spacingBefore: 400,
      spacingAfter: 200,
    },
    heading2: {
      size: 18,
      color: "48CAE4", // TECH.NEON_BLUE
      bold: true,
      spacingBefore: 320,
      spacingAfter: 160,
    },
    heading3: {
      size: 15,
      color: "778DA9",
      bold: true,
      spacingBefore: 260,
      spacingAfter: 120,
    },
    heading: {
      size: 18,
      color: "00B4D8",
      bold: true,
      spacingBefore: 280,
      spacingAfter: 140,
    },
    title: {
      size: 32,
      color: "00B4D8",
      bold: true,
      spacingBefore: 480,
      spacingAfter: 320,
      alignment: "center",
      smallCaps: false,
      characterSpacing: 100,
      borderBottom: { color: "48CAE4", size: 10, style: "double", space: 6 },
    },
    paragraph: {
      alignment: "left",
      spacingBefore: 160,
      spacingAfter: 160,
      lineSpacing: 1.3,
    },
    table: {
      borderColor: "00B4D8",
      borderStyle: "single",
      borderWidth: 4,
      headerFill: "0D1B2A",
      headerFontColor: "48CAE4",
      zebraFill: "1B263B",
      zebraInterval: 2,
      insideBorderColor: "415A77",
      insideBorderWidth: 2,
      outsideBorderWidth: 4,
    },
    code: {
      fontFamily: "Consolas",
      fontSize: 10,
      color: "48CAE4",
      backgroundColor: "0D1B2A",
      borderColor: "00B4D8",
    },
    // Excel styling
    columnWidths: {},
    rowHeights: {},
    headerBold: true,
    headerSize: 12,
    headerColor: "48CAE4",
    headerBackground: "0D1B2A",
  },

  // LEGAL - Conservative formal formatting, double-spaced, no frills
  // LEGAL - Conservative formal formatting, double-spaced, no frills

  // LEGAL - Conservative formal formatting, double-spaced, no frills
  // LEGAL - Conservative formal formatting, double-spaced, no frills
  casual: {
    font: { size: 12, color: "333333", bold: false, family: "Verdana" },
    headingFont: "Trebuchet MS",
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
      smallCaps: false,
      characterSpacing: 0,
      borderBottom: { color: "FF9800", size: 6, style: "single", space: 4 },
    },
    paragraph: {
      alignment: "left",
      spacingBefore: 120,
      spacingAfter: 120,
      lineSpacing: 1.15,
    },
    table: {
      borderColor: "FF9800",
      borderStyle: "single",
      borderWidth: 6,
      headerFill: "E65100",
      headerFontColor: "FFFFFF",
      zebraFill: "FFF3E0",
      zebraInterval: 2,
      insideBorderColor: "FFD180",
      insideBorderWidth: 2,
      outsideBorderWidth: 6,
    },
    code: {
      fontFamily: "Courier New",
      fontSize: 10,
      color: "5D4037",
      backgroundColor: "FFF8E1",
      borderColor: "FFD180",
    },
    // Excel styling
    columnWidths: {},
    rowHeights: {},
    headerBold: true,
    headerSize: 12,
    headerColor: "FFFFFF",
    headerBackground: "FF9800",
  },

  // COLORFUL - Vibrant presentation/infographic style with geometric headings
  colorful: {
    font: { size: 12, color: "4A148C", bold: false, family: "Arial" },
    headingFont: "Century Gothic",
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
      color: "4A148C",
      bold: true,
      spacingBefore: 200,
      spacingAfter: 200,
      alignment: "center",
      smallCaps: true,
      characterSpacing: 80,
      borderBottom: { color: "7B1FA2", size: 8, style: "double", space: 4 },
    },
    paragraph: {
      alignment: "center",
      spacingBefore: 120,
      spacingAfter: 120,
      lineSpacing: 1.0,
    },
    table: {
      borderColor: "7B1FA2",
      borderStyle: "double",
      borderWidth: 8,
      headerFill: "4A148C",
      headerFontColor: "FFFFFF",
      zebraFill: "F3E5F5",
      zebraInterval: 2,
      insideBorderColor: "CE93D8",
      insideBorderWidth: 4,
      outsideBorderWidth: 8,
    },
    code: {
      fontFamily: "Courier New",
      fontSize: 10,
      color: "4A148C",
      backgroundColor: "F3E5F5",
      borderColor: "CE93D8",
    },
    // Excel styling
    columnWidths: {},
    rowHeights: {},
    headerBold: true,
    headerSize: 12,
    headerColor: "FFFFFF",
    headerBackground: "7B1FA2",
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

  // Handle underline - convert boolean to object if needed
  let underlineConfig;
  if (styleOptions.underline) {
    if (typeof styleOptions.underline === "boolean") {
      underlineConfig = { style: "single" };
    } else if (typeof styleOptions.underline === "object") {
      // Map our type property to docx's expected format
      underlineConfig = {
        style: styleOptions.underline.type || "single",
        ...(styleOptions.underline.color
          ? { color: styleOptions.underline.color }
          : {}),
      };
    }
  }

  const style = {
    bold: styleOptions.bold ?? false,
    italics: styleOptions.italics ?? false,
    underline: underlineConfig,
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

  // Handle underline - convert boolean to object if needed
  let underlineConfig;
  if (headingConfig.underline) {
    if (typeof headingConfig.underline === "boolean") {
      underlineConfig = { style: "single" };
    } else if (typeof headingConfig.underline === "object") {
      // Map our type property to docx's expected format
      underlineConfig = {
        style: headingConfig.underline.type || "single",
        ...(headingConfig.underline.color
          ? { color: headingConfig.underline.color }
          : {}),
      };
    }
  }

  const headingFontFamily = config.headingFont || config.font.family;

  return new DocxParagraph({
    children: [
      new TextRun({
        text,
        bold: headingConfig.bold,
        italics: headingConfig.italic || false,
        color: headingConfig.color,
        size: headingConfig.size * 2,
        font: headingFontFamily,
        underline: underlineConfig,
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
    headingFont:
      customOptions.headingFont !== undefined
        ? customOptions.headingFont
        : basePreset.headingFont || null,
    heading1: { ...basePreset.heading1, ...(customOptions.heading1 || {}) },
    heading2: { ...basePreset.heading2, ...(customOptions.heading2 || {}) },
    heading3: { ...basePreset.heading3, ...(customOptions.heading3 || {}) },
    heading: { ...basePreset.heading, ...(customOptions.heading || {}) },
    title: { ...basePreset.title, ...(customOptions.title || {}) },
    paragraph: { ...basePreset.paragraph, ...(customOptions.paragraph || {}) },
    table: { ...basePreset.table, ...(customOptions.table || {}) },
    code: { ...basePreset.code, ...(customOptions.code || {}) },
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

/**
 * Automatically select style preset based on document category
 * Maps document categories to appropriate styling presets for AI guidance
 *
 * @param {string} category - Document category (contracts, technical, business, legal, meeting, research)
 * @returns {string} Style preset name (minimal, professional, technical, legal, business, casual, colorful)
 */
export function selectStyleBasedOnCategory(category) {
  if (!category || typeof category !== "string") {
    return "minimal"; // Default to minimal for unknown categories
  }

  const categoryToPresetMap = {
    contracts: "legal", // Legal agreements need formal legal formatting
    legal: "legal", // Legal documents use legal preset with double spacing
    technical: "technical", // Technical docs use technical preset with clear hierarchy
    business: "business", // Business documents need professional business formatting
    meeting: "professional", // Meeting minutes use professional format with clear structure
    research: "professional", // Research papers need sophisticated serif typography
  };

  return categoryToPresetMap[category.toLowerCase()] || "minimal";
}

/**
 * Converts a resolved styleConfig into the `styles` object accepted by the
 * docx library's Document constructor.  This embeds heading / title / body
 * definitions directly into the DOCX file's styles.xml so that Word,
 * LibreOffice, etc. render them correctly without relying solely on inline
 * TextRun formatting.
 *
 * @param {Object} styleConfig - Merged style configuration from getStyleConfig()
 * @returns {Object} A styles object for `new Document({ styles: ... })`
 */
export function buildDocumentStyles(styleConfig) {
  const font = styleConfig.font || {};
  const h1 = styleConfig.heading1 || {};
  const h2 = styleConfig.heading2 || {};
  const h3 = styleConfig.heading3 || {};
  const title = styleConfig.title || {};
  const para = styleConfig.paragraph || {};

  const bodyFont = font.family || "Arial";
  const headingFontFamily = styleConfig.headingFont || bodyFont;

  return {
    default: {
      document: {
        run: {
          font: bodyFont,
          size: (font.size || 11) * 2,
          color: font.color || "000000",
        },
        paragraph: {
          spacing: {
            line: Math.round((para.lineSpacing || 1.15) * 240),
          },
        },
      },
      heading1: {
        run: {
          font: headingFontFamily,
          size: (h1.size || 16) * 2,
          bold: h1.bold !== false,
          color: h1.color || "000000",
          ...(h1.italic ? { italics: true } : {}),
          ...(h1.underline ? { underline: resolveUnderline(h1.underline) } : {}),
        },
        paragraph: {
          spacing: {
            before: h1.spacingBefore || 280,
            after: h1.spacingAfter || 140,
          },
        },
      },
      heading2: {
        run: {
          font: headingFontFamily,
          size: (h2.size || 14) * 2,
          bold: h2.bold !== false,
          color: h2.color || "1A1A1A",
          ...(h2.italic ? { italics: true } : {}),
          ...(h2.underline ? { underline: resolveUnderline(h2.underline) } : {}),
        },
        paragraph: {
          spacing: {
            before: h2.spacingBefore || 240,
            after: h2.spacingAfter || 120,
          },
        },
      },
      heading3: {
        run: {
          font: headingFontFamily,
          size: (h3.size || 12) * 2,
          bold: h3.bold !== false,
          color: h3.color || "333333",
          ...(h3.italic ? { italics: true } : {}),
          ...(h3.underline ? { underline: resolveUnderline(h3.underline) } : {}),
        },
        paragraph: {
          spacing: {
            before: h3.spacingBefore || 200,
            after: h3.spacingAfter || 100,
          },
        },
      },
    },
    paragraphStyles: [
      {
        id: "Title",
        name: "Title",
        basedOn: "Normal",
        next: "Normal",
        quickFormat: true,
        run: {
          font: headingFontFamily,
          size: (title.size || 24) * 2,
          bold: title.bold !== false,
          color: title.color || "333333",
          ...(title.smallCaps ? { smallCaps: true } : {}),
          ...(title.characterSpacing ? { characterSpacing: title.characterSpacing } : {}),
        },
        paragraph: {
          spacing: {
            before: title.spacingBefore || 240,
            after: title.spacingAfter || 120,
          },
          ...(title.borderBottom ? {
            border: {
              bottom: {
                style: title.borderBottom.style || "single",
                size: title.borderBottom.size || 6,
                color: title.borderBottom.color || "000000",
                space: title.borderBottom.space || 1,
              },
            },
          } : {}),
        },
      },
    ],
  };
}

/**
 * Resolves underline config from boolean or object to docx-compatible format
 */
function resolveUnderline(underlineConfig) {
  if (!underlineConfig) return undefined;
  if (typeof underlineConfig === "boolean") {
    return { type: "single" };
  }
  if (typeof underlineConfig === "object") {
    return {
      type: underlineConfig.type || "single",
      ...(underlineConfig.color ? { color: underlineConfig.color } : {}),
    };
  }
  return undefined;
}

// ============================================================================
// ENHANCED STYLING HELPERS - Inspired by Claude Opus 4.6 template system
// ============================================================================

// Reusable color constants for consistent theming
export const COLORS = {
  // Primary colors
  BLUE: "1F4E79",
  DARK: "333333",
  LIGHT_BLUE: "D6E4F0",
  LIGHT_GRAY: "F2F2F2",
  WARN_BG: "FFF3CD",
  WHITE: "FFFFFF",
  // Additional colors
  RED: "C6EFCE", // Green for "Yes"
  RED_ALERT: "FFC7CE", // Red for "No"
  GRAY: "999999",
  GRAY_LIGHT: "888888",
  GRAY_DARK: "777777",
  GRAY_BORDER: "CCCCCC",
  GRAY_BORDER_LIGHT: "E0E0E0",
  // Business colors
  BUSINESS_BLUE: "1F4E79",
  BUSINESS_BLUE_LIGHT: "2B579A",
  BUSINESS_BLUE_DARK: "3A5F8F",
  // Alert colors
  SUCCESS: "C6EFCE",
  WARNING: "FFF3CD",
  DANGER: "FFC7CE",
};

// Page dimensions
export const PAGE_WIDTH = 12240; // 8.5" * 1440
export const MARGIN = 1440; // 1" * 1440
export const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2; // 9360

// Border configurations
export const BORDERS = {
  // Standard border
  standard: { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" },
  // No border
  none: { style: BorderStyle.NONE, size: 0 },
  // Thick border
  thick: { style: BorderStyle.SINGLE, size: 4, color: "1F4E79" },
  // Thin border
  thin: { style: BorderStyle.SINGLE, size: 1, color: "E0E0E0" },
  // Header border
  header: { style: BorderStyle.SINGLE, size: 2, color: "1F4E79" },
  // Bottom border only
  bottom: { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" },
};

/**
 * Creates a border configuration object
 * @param {Object} options - Border options
 * @param {string} options.style - Border style (single, double, dotted, dashed)
 * @param {number} options.size - Border size
 * @param {string} options.color - Border color hex
 * @param {number} options.space - Border space
 * @returns {Object} Border configuration
 */
export function createBorder(options = {}) {
  const { style = BorderStyle.SINGLE, size = 1, color = "CCCCCC", space = 0 } = options;
  return { style, size, color, space };
}

/**
 * Creates a border configuration for table cells
 * @returns {Object} Cell borders configuration
 */
export function createCellBorders() {
  return {
    top: BORDERS.standard,
    bottom: BORDERS.standard,
    left: BORDERS.standard,
    right: BORDERS.standard,
  };
}

/**
 * Creates a no-border configuration
 * @returns {Object} No borders configuration
 */
export function createNoBorders() {
  return {
    top: BORDERS.none,
    bottom: BORDERS.none,
    left: BORDERS.none,
    right: BORDERS.none,
  };
}

/**
 * Creates cell margins configuration
 * @param {Object} options - Margin options
 * @param {number} options.top - Top margin
 * @param {number} options.bottom - Bottom margin
 * @param {number} options.left - Left margin
 * @param {number} options.right - Right margin
 * @returns {Object} Cell margins configuration
 */
export function createCellMargins(options = {}) {
  return {
    top: options.top ?? 60,
    bottom: options.bottom ?? 60,
    left: options.left ?? 100,
    right: options.right ?? 100,
  };
}

// ============================================================================
// HEADING HELPERS
// ============================================================================

/**
 * Creates a Heading 1 paragraph
 * @param {string} text - Heading text
 * @param {Object} options - Additional options
 * @returns {Paragraph} Heading 1 paragraph
 */
export function heading1(text, options = {}) {
  return new DocxParagraph({
    heading: HeadingLevel.HEADING_1,
    children: [new TextRun({ text, size: 32, bold: true, color: COLORS.BLUE, ...options.run })],
    spacing: { before: 360, after: 200 },
    ...options,
  });
}

/**
 * Creates a Heading 2 paragraph
 * @param {string} text - Heading text
 * @param {Object} options - Additional options
 * @returns {Paragraph} Heading 2 paragraph
 */
export function heading2(text, options = {}) {
  return new DocxParagraph({
    heading: HeadingLevel.HEADING_2,
    children: [new TextRun({ text, size: 26, bold: true, color: COLORS.BLUE, ...options.run })],
    spacing: { before: 280, after: 160 },
    ...options,
  });
}

/**
 * Creates a Heading 3 paragraph
 * @param {string} text - Heading text
 * @param {Object} options - Additional options
 * @returns {Paragraph} Heading 3 paragraph
 */
export function heading3(text, options = {}) {
  return new DocxParagraph({
    heading: HeadingLevel.HEADING_3,
    children: [new TextRun({ text, size: 22, bold: true, color: "2E75B6", ...options.run })],
    spacing: { before: 200, after: 120 },
    ...options,
  });
}

/**
 * Creates a regular paragraph with consistent styling
 * @param {string} text - Paragraph text
 * @param {Object} options - Additional options
 * @returns {Paragraph} Styled paragraph
 */
export function para(text, options = {}) {
  return new DocxParagraph({
    spacing: { after: 120 },
    ...options,
    children: [new TextRun({ font: "Arial", size: 20, color: COLORS.DARK, ...options.run, text })],
  });
}

/**
 * Creates bold text as a TextRun
 * @param {string} text - Text to make bold
 * @param {Object} options - Additional TextRun options
 * @returns {TextRun} Bold text run
 */
export function bold(text, options = {}) {
  return new TextRun({ font: "Arial", size: 20, color: COLORS.DARK, bold: true, ...options, text });
}

/**
 * Creates normal (regular) text as a TextRun
 * @param {string} text - Text
 * @param {Object} options - Additional TextRun options
 * @returns {TextRun} Normal text run
 */
export function normal(text, options = {}) {
  return new TextRun({ font: "Arial", size: 20, color: COLORS.DARK, ...options, text });
}

/**
 * Creates a vertical spacer paragraph
 * @param {number} height - Height of the spacer in twips
 * @returns {Paragraph} Spacer paragraph
 */
export function spacer(height = 100) {
  return new DocxParagraph({ spacing: { after: height }, children: [] });
}

/**
 * Creates a horizontal divider (bordered paragraph)
 * @param {Object} options - Divider options
 * @returns {Paragraph} Divider paragraph
 */
export function divider(options = {}) {
  return new DocxParagraph({
    spacing: { before: 200, after: 200 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: COLORS.BLUE, space: 4 } },
    children: [],
    ...options,
  });
}

// ============================================================================
// BULLET LIST HELPERS
// ============================================================================

/**
 * Creates a bullet list item
 * @param {TextRun|TextRun[]|string} runs - Content of the bullet item
 * @param {string} ref - Numbering reference name
 * @returns {Paragraph} Bullet item paragraph
 */
export function bulletItem(runs, ref = "bullets") {
  return new DocxParagraph({
    numbering: { reference: ref, level: 0 },
    spacing: { after: 60 },
    children: Array.isArray(runs) ? runs : [normal(runs)],
  });
}

/**
 * Creates a sub-bullet list item
 * @param {TextRun|TextRun[]|string} runs - Content of the sub-bullet item
 * @returns {Paragraph} Sub-bullet item paragraph
 */
export function subBulletItem(runs) {
  return new DocxParagraph({
    numbering: { reference: "subbullets", level: 0 },
    spacing: { after: 40 },
    children: Array.isArray(runs) ? runs : [normal(runs, { size: 18 })],
  });
}

// ============================================================================
// STATUS BADGE HELPERS
// ============================================================================

/**
 * Creates a status badge table (single cell colored box)
 * @param {string} label - Badge text
 * @param {string} color - Background color hex
 * @param {string} textColor - Text color hex
 * @returns {Table} Status badge table
 */
export function statusBadge(label, color, textColor = COLORS.DARK) {
  return new DocxTable({
    width: { size: 2200, type: WidthType.DXA },
    columnWidths: [2200],
    rows: [new TableRow({
      children: [new TableCell({
        borders: createNoBorders(),
        shading: { fill: color, type: ShadingType.CLEAR },
        margins: { top: 30, bottom: 30, left: 80, right: 80 },
        width: { size: 2200, type: WidthType.DXA },
        children: [new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [new TextRun({ text: label, font: "Arial", size: 16, bold: true, color: textColor })],
        })],
      })],
    })],
  });
}

// ============================================================================
// INFO TABLE HELPERS
// ============================================================================

/**
 * Creates an info table row (label | value)
 * @param {string} label - Label text
 * @param {string} value - Value text
 * @returns {TableRow} Info table row
 */
export function infoRow(label, value) {
  return new TableRow({
    children: [
      new TableCell({
        borders: createCellBorders(),
        width: { size: 2400, type: WidthType.DXA },
        shading: { fill: COLORS.LIGHT_GRAY, type: ShadingType.CLEAR },
        margins: createCellMargins({ top: 30, bottom: 30, left: 80, right: 80 }),
        children: [new Paragraph({ children: [bold(label, { size: 18 })] })],
      }),
      new TableCell({
        borders: createCellBorders(),
        width: { size: 6960, type: WidthType.DXA },
        margins: createCellMargins(),
        children: [new Paragraph({ spacing: { after: 0 }, children: [normal(value, { size: 18 })] })],
      }),
    ],
  });
}

/**
 * Creates an info table (label/value pairs)
 * @param {Array<[string, string]>} rows - Array of [label, value] pairs
 * @returns {Table} Info table
 */
export function infoTable(rows) {
  return new DocxTable({
    width: { size: CONTENT_WIDTH, type: WidthType.DXA },
    columnWidths: [2400, 6960],
    rows: rows.map(([l, v]) => infoRow(l, v)),
  });
}

// ============================================================================
// GAP TABLE HELPERS
// ============================================================================

/**
 * Creates a gap table header row
 * @returns {TableRow} Gap table header
 */
export function gapTableHeader() {
  return new TableRow({
    tableHeader: true,
    children: [
      new TableCell({
        borders: createCellBorders(),
        width: { size: 3200, type: WidthType.DXA },
        shading: { fill: COLORS.BLUE, type: ShadingType.CLEAR },
        margins: createCellMargins(),
        children: [new Paragraph({ children: [bold("Gap / Limitation", { size: 18, color: COLORS.WHITE })] })],
      }),
      new TableCell({
        borders: createCellBorders(),
        width: { size: 6160, type: WidthType.DXA },
        shading: { fill: COLORS.BLUE, type: ShadingType.CLEAR },
        margins: createCellMargins(),
        children: [new Paragraph({ children: [bold("Impact During UAT", { size: 18, color: COLORS.WHITE })] })],
      }),
    ],
  });
}

/**
 * Creates a gap table row
 * @param {string} gap - Gap/limitation text
 * @param {string} impact - Impact text
 * @param {boolean} highlight - Whether to highlight with warning color
 * @returns {TableRow} Gap table row
 */
export function gapRow(gap, impact, highlight = false) {
  const bg = highlight ? COLORS.WARN_BG : COLORS.WHITE;
  return new TableRow({
    children: [
      new TableCell({
        borders: createCellBorders(),
        width: { size: 3200, type: WidthType.DXA },
        shading: { fill: bg, type: ShadingType.CLEAR },
        margins: createCellMargins(),
        children: [new Paragraph({ children: [bold(gap, { size: 18 })] })],
      }),
      new TableCell({
        borders: createCellBorders(),
        width: { size: 6160, type: WidthType.DXA },
        shading: { fill: bg, type: ShadingType.CLEAR },
        margins: createCellMargins(),
        children: [new Paragraph({ spacing: { after: 0 }, children: [normal(impact, { size: 18 })] })],
      }),
    ],
  });
}

/**
 * Creates a gap table
 * @param {Array<[string, string, boolean]>} rows - Array of [gap, impact, highlight] tuples
 * @returns {Table} Gap table
 */
export function gapTable(rows) {
  return new DocxTable({
    width: { size: CONTENT_WIDTH, type: WidthType.DXA },
    columnWidths: [3200, 6160],
    rows: [gapTableHeader(), ...rows.map(([g, i, h]) => gapRow(g, i, h))],
  });
}

// ============================================================================
// TABLE HELPERS (Enhanced)
// ============================================================================

/**
 * Creates a table cell with standard styling
 * @param {Paragraph|Paragraph[]} children - Cell content
 * @param {Object} options - Cell options
 * @returns {TableCell} Styled table cell
 */
export function createStyledCell(children, options = {}) {
  return new TableCell({
    borders: options.borders || createCellBorders(),
    width: options.width ? { size: options.width, type: WidthType.DXA } : undefined,
    shading: options.shading,
    margins: options.margins || createCellMargins(),
    children: Array.isArray(children) ? children : [children],
  });
}

/**
 * Creates a table row with standard styling
 * @param {TableCell[]} children - Cell children
 * @param {Object} options - Row options
 * @returns {TableRow} Styled table row
 */
export function createStyledRow(children, options = {}) {
  return new TableRow({
    children,
    tableHeader: options.tableHeader || false,
  });
}

/**
 * Creates a table with header and rows
 * @param {Array<TableCell[]>} columns - Column definitions with labels
 * @param {Array<TableRow[]>} rows - Table data rows
 * @param {Object} options - Table options
 * @returns {Table} Styled table
 */
export function createTableWithHeader(columns, rows, options = {}) {
  const { width = CONTENT_WIDTH, columnWidths } = options;
  
  // Create header row
  const headerRow = new TableRow({
    tableHeader: true,
    children: columns.map((col, idx) => {
      const width = columnWidths?.[idx] || Math.floor(width / columns.length);
      return new TableCell({
        borders: createCellBorders(),
        width: { size: width, type: WidthType.DXA },
        shading: { fill: COLORS.BLUE, type: ShadingType.CLEAR },
        margins: createCellMargins(),
        children: [new Paragraph({
          children: [new TextRun({ text: col, bold: true, size: 18, color: COLORS.WHITE })],
        })],
      });
    }),
  });
  
  return new DocxTable({
    width: { size: width, type: WidthType.DXA },
    columnWidths: columnWidths || columns.map(() => Math.floor(width / columns.length)),
    rows: [headerRow, ...rows],
  });
}

// ============================================================================
// NUMBERING & BULLET CONFIGURATION
// ============================================================================

/**
 * Creates numbering configuration for docx Document constructor
 * @returns {Object} Numbering configuration
 */
export function createNumberingConfig() {
  return {
    config: [
      {
        reference: "bullets",
        levels: [{
          level: 0,
          format: LevelFormat.BULLET,
          text: "\u2022",
          alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 720, hanging: 360 } } },
        }],
      },
      {
        reference: "subbullets",
        levels: [{
          level: 0,
          format: LevelFormat.BULLET,
          text: "\u2013",
          alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 1080, hanging: 360 } } },
        }],
      },
      {
        reference: "numbers",
        levels: [{
          level: 0,
          format: LevelFormat.DECIMAL,
          text: "%1.",
          alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 720, hanging: 360 } } },
        }],
      },
    ],
  };
}

// ============================================================================
// PAGE SETUP HELPERS
// ============================================================================

/**
 * Creates page properties configuration
 * @param {Object} options - Page options
 * @returns {Object} Page properties
 */
export function createPageProperties(options = {}) {
  return {
    page: {
      size: {
        width: options.width || PAGE_WIDTH,
        height: options.height || 15840, // 11" * 1440
      },
      margin: {
        top: options.margin || MARGIN,
        bottom: options.margin || MARGIN,
        left: options.margin || MARGIN,
        right: options.margin || MARGIN,
      },
    },
  };
}

/**
 * Creates header configuration
 * @param {Object} options - Header options
 * @returns {Header} Header configuration
 */
export function createHeader(options = {}) {
  const { text, alignment = "left", color = COLORS.GRAY_LIGHT } = options;
  return new Header({
    children: [new DocxParagraph({
      border: { bottom: { style: BorderStyle.SINGLE, size: 2, color: COLORS.BLUE, space: 4 } },
      children: [
        bold(text, { size: 16, color }),
      ],
    })],
  });
}

/**
 * Creates footer configuration
 * @param {Object} options - Footer options
 * @returns {Footer} Footer configuration
 */
export function createFooter(options = {}) {
  const { text, alignment = "center" } = options;
  
  return new Footer({
    children: [new DocxParagraph({
      border: { top: { style: BorderStyle.SINGLE, size: 1, color: COLORS.GRAY_BORDER, space: 4 } },
      tabStops: [{ type: TabStopType.RIGHT, position: TabStopPosition.MAX }],
      children: [
        normal(text, { size: 14, color: COLORS.GRAY }),
        new TextRun({ text: "\tPage ", size: 14, color: COLORS.GRAY }),
        new TextRun({ children: [PageNumber.CURRENT], size: 14, color: COLORS.GRAY }),
      ],
    })],
  });
}

// ============================================================================
// HELPER CONSTRUCTS (Direct from Claude's template)
// ============================================================================

/**
 * Creates a simple paragraph with default styling
 * @param {string} text - Paragraph text
 * @returns {Paragraph} Styled paragraph
 */
export function p(text) {
  return para(text);
}

/**
 * Creates a bold text run
 * @param {string} text - Text to bold
 * @returns {TextRun} Bold text run
 */
export function b(text) {
  return bold(text);
}

/**
 * Creates normal text
 * @param {string} text - Text
 * @returns {TextRun} Normal text run
 */
export function n(text) {
  return normal(text);
}

/**
 * Creates a page break
 * @returns {Paragraph} Page break paragraph
 */
export function pageBreak() {
  return new DocxParagraph({ children: [new PageBreak()] });
}

/**
 * Creates a center-aligned paragraph
 * @param {string} text - Text to center
 * @param {Object} options - Paragraph options
 * @returns {Paragraph} Centered paragraph
 */
export function center(text, options = {}) {
  return new DocxParagraph({
    alignment: AlignmentType.CENTER,
    children: [new TextRun({ text, ...options })],
    ...options,
  });
}

// ============================================================================
// CLAUDE-LIKE DOCUMENT HELPERS - Beautiful professional document templates
// ============================================================================

/**
 * Creates an info badge (note/attention box) with icon and colored background
 * @param {string} noteText - The note content
 * @param {Object} options - Options for color customization
 * @returns {TableRow} Info badge table row
 */
export function infoBadgeRow(noteText, options = {}) {
  const colors = CLAUDE_COLORS.INFO_BADGE;
  
  return new TableRow({
    children: [
      new TableCell({
        columnSpan: 2,
        borders: createCellBorders(),
        width: { size: CONTENT_WIDTH, type: WidthType.DXA },
        shading: { fill: options.bg || colors.BG, type: ShadingType.CLEAR },
        margins: createCellMargins({ top: 100, bottom: 100, left: 160, right: 160 }),
        children: [
          new DocxParagraph({
            spacing: { after: 40 },
            children: [
              new TextRun({
                text: "\u2139  ",
                font: "Arial",
                size: 18,
                color: options.icon || colors.ICON,
                bold: true
              }),
              new TextRun({
                text: noteText,
                font: "Arial",
                size: 18,
                color: options.text || colors.TEXT,
                italics: true
              })
            ]
          })
        ]
      })
    ]
  });
}

/**
 * Creates a section title with professional styling
 * @param {string} text - The section title text
 * @param {Object} options - Options for customization
 * @returns {Paragraph} Section title paragraph
 */
export function sectionTitle(text, options = {}) {
  return new DocxParagraph({
    spacing: { before: 360, after: 80 },
    children: [
      new TextRun({
        text: text,
        font: "Arial",
        size: 18,
        bold: true,
        color: CLAUDE_COLORS.TEXT.LIGHT,
        allCaps: true
      })
    ],
    ...options
  });
}

/**
 * Creates a field row (label | value) with Claude-like styling
 * @param {string} label - The field label
 * @param {string} value - The field value
 * @param {Object} options - Options for customization
 * @returns {TableRow} Field row table row
 */
export function fieldRow(label, value, options = {}) {
  return new TableRow({
    children: [
      new TableCell({
        borders: createCellBorders(),
        width: { size: 2400, type: WidthType.DXA },
        shading: { fill: CLAUDE_COLORS.BACKGROUND.LIGHT_GRAY, type: ShadingType.CLEAR },
        margins: createCellMargins({ top: 120, bottom: 120, left: 160, right: 160 }),
        children: [
          new DocxParagraph({
            children: [
              new TextRun({
                text: label,
                font: "Arial",
                size: 20,
                bold: true,
                color: CLAUDE_COLORS.TEXT.PRIMARY
              })
            ]
          })
        ]
      }),
      new TableCell({
        borders: createCellBorders(),
        width: { size: CONTENT_WIDTH - 2400, type: WidthType.DXA },
        margins: createCellMargins({ top: 120, bottom: 120, left: 160, right: 160 }),
        children: [
          new DocxParagraph({
            children: [
              new TextRun({
                text: value,
                font: "Arial",
                size: 20,
                color: CLAUDE_COLORS.TEXT.PRIMARY
              })
            ]
          })
        ]
      })
    ]
  });
}

/**
 * Creates a two-column row for side-by-side fields
 * @param {string} label1 - First column label
 * @param {string} value1 - First column value
 * @param {string} label2 - Second column label
 * @param {string} value2 - Second column value
 * @returns {TableRow} Two-column row table row
 */
export function twoColRow(label1, value1, label2, value2) {
  const cellWidth = (CONTENT_WIDTH / 2) - 80;
  
  return new TableRow({
    children: [
      new TableCell({
        borders: createCellBorders(),
        width: { size: cellWidth, type: WidthType.DXA },
        margins: createCellMargins({ top: 100, bottom: 100, left: 160, right: 80 }),
        children: [
          new DocxParagraph({
            children: [
              new TextRun({
                text: label1 + ": ",
                font: "Arial",
                size: 20,
                bold: true,
                color: CLAUDE_COLORS.TEXT.PRIMARY
              }),
              new TextRun({
                text: value1,
                font: "Arial",
                size: 20,
                color: CLAUDE_COLORS.TEXT.SECONDARY
              })
            ]
          })
        ]
      }),
      new TableCell({
        borders: createCellBorders(),
        width: { size: cellWidth, type: WidthType.DXA },
        margins: createCellMargins({ top: 100, bottom: 100, left: 80, right: 160 }),
        children: [
          new DocxParagraph({
            children: [
              new TextRun({
                text: label2 + ": ",
                font: "Arial",
                size: 20,
                bold: true,
                color: CLAUDE_COLORS.TEXT.PRIMARY
              }),
              new TextRun({
                text: value2,
                font: "Arial",
                size: 20,
                color: CLAUDE_COLORS.TEXT.SECONDARY
              })
            ]
          })
        ]
      })
    ]
  });
}

/**
 * Creates a professional divider with Claude-style blue accent
 * @param {Object} options - Options for customization
 * @returns {Paragraph} Divider paragraph
 */
export function professionalDivider(options = {}) {
  return new DocxParagraph({
    spacing: { before: 240, after: 240 },
    border: {
      bottom: {
        style: BorderStyle.SINGLE,
        size: options.size || 4,
        color: CLAUDE_COLORS.DIVIDER.PRIMARY,
        space: options.space || 4
      }
    },
    children: [],
    ...options
  });
}

/**
 * Creates a gap/spacing paragraph
 * @param {number} height - Height in twips (default: 120)
 * @returns {Paragraph} Spacer paragraph
 */
export function gap(height = 120) {
  return new DocxParagraph({
    spacing: { before: 0, after: height },
    children: []
  });
}

/**
 * Creates a bullet item with Claude-style formatting
 * @param {string|TextRun|TextRun[]} content - Bullet content
 * @returns {Paragraph} Bullet item paragraph
 */
export function claudeBullet(content) {
  const text = typeof content === "string" ? content : null;
  return new DocxParagraph({
    numbering: { reference: "bullets", level: 0 },
    spacing: { before: 40, after: 40 },
    children: [
      new TextRun({
        text: text || (Array.isArray(content) ? "" : ""),
        font: "Arial",
        size: 20,
        color: CLAUDE_COLORS.TEXT.PRIMARY
      }),
      ...(Array.isArray(content) ? content : [])
    ]
  });
}

/**
 * Creates a code block container with Claude-style background and border
 * @param {string} code - Code content
 * @param {Object} options - Options for customization
 * @returns {Paragraph} Code block paragraph
 */
export function codeBlock(code, options = {}) {
  return new DocxParagraph({
    spacing: { before: 120, after: 120 },
    border: {
      all: {
        style: BorderStyle.SINGLE,
        size: options.borderSize || 1,
        color: CLAUDE_COLORS.CODE.BORDER
      }
    },
    shading: { fill: CLAUDE_COLORS.CODE.BACKGROUND, type: ShadingType.CLEAR },
    margins: createCellMargins({ top: 80, bottom: 80, left: 120, right: 120 }),
    children: [
      new TextRun({
        text: code,
        font: "Courier New",
        size: options.fontSize || 9 * 2,
        color: CLAUDE_COLORS.CODE.TEXT
      })
    ],
    ...options
  });
}

/**
 * Creates a callout box (highlighted section) for important information
 * @param {string} title - The callout title
 * @param {string|TextRun[]} content - The callout content
 * @param {Object} options - Options for customization
 * @returns {TableRow} Callout table row
 */
export function calloutRow(title, content, options = {}) {
  const colors = CLAUDE_COLORS.STATUS;
  
  return new TableRow({
    children: [
      new TableCell({
        columnSpan: 2,
        borders: createCellBorders(),
        width: { size: CONTENT_WIDTH, type: WidthType.DXA },
        shading: { fill: options.bg || colors.INFO + "33", type: ShadingType.CLEAR },
        margins: createCellMargins({ top: 100, bottom: 100, left: 160, right: 160 }),
        children: [
          new DocxParagraph({
            spacing: { before: 40, after: 20 },
            children: [
              new TextRun({
                text: title,
                font: "Arial",
                size: 18,
                bold: true,
                color: options.titleColor || colors.INFO
              })
            ]
          }),
          new DocxParagraph({
            spacing: { before: 20, after: 40 },
            children: Array.isArray(content) ? content : [new TextRun({ text: String(content), font: "Arial", size: 18, color: options.textColor || CLAUDE_COLORS.TEXT.SECONDARY })]
          })
        ]
      })
    ]
  });
}

/**
 * Creates a professional info table row (Claude-style)
 * @param {string} label - The label text
 * @param {string} value - The value text
 * @returns {TableRow} Info table row with Claude styling
 */
export function claudeInfoRow(label, value) {
  return new TableRow({
    children: [
      new TableCell({
        borders: createCellBorders(),
        width: { size: 2400, type: WidthType.DXA },
        shading: { fill: CLAUDE_COLORS.TABLE.ZEBRA_BG, type: ShadingType.CLEAR },
        margins: createCellMargins({ top: 30, bottom: 30, left: 80, right: 80 }),
        children: [
          new DocxParagraph({
            children: [
              new TextRun({
                text: label,
                font: "Arial",
                size: 18,
                bold: true,
                color: CLAUDE_COLORS.TABLE.HEADER_TEXT
              })
            ]
          })
        ]
      }),
      new TableCell({
        borders: createCellBorders(),
        width: { size: CONTENT_WIDTH - 2400, type: WidthType.DXA },
        margins: createCellMargins({ top: 30, bottom: 30, left: 80, right: 80 }),
        children: [
          new DocxParagraph({
            spacing: { after: 0 },
            children: [
              new TextRun({
                text: value,
                font: "Arial",
                size: 18,
                color: CLAUDE_COLORS.TEXT.PRIMARY
              })
            ]
          })
        ]
      })
    ]
  });
}

/**
 * Creates a Claude-style info table from key-value pairs
 * @param {Array<[string, string]>} rows - Array of [label, value] pairs
 * @returns {Table} Info table with Claude styling
 */
export function claudeInfoTable(rows) {
  return new DocxTable({
    width: { size: CONTENT_WIDTH, type: WidthType.DXA },
    columnWidths: [2400, CONTENT_WIDTH - 2400],
    rows: rows.map(([label, value]) => claudeInfoRow(label, value))
  });
}

/**
 * Creates a status badge with Claude-style blue theme
 * @param {string} label - Badge text
 * @param {Object} options - Options for customization
 * @returns {Table} Status badge table
 */
export function claudeStatusBadge(label, options = {}) {
  return new DocxTable({
    width: { size: 2200, type: WidthType.DXA },
    columnWidths: [2200],
    rows: [
      new TableRow({
        children: [
          new TableCell({
            borders: createNoBorders(),
            shading: { fill: options.bg || CLAUDE_COLORS.TABLE.HEADER_BG, type: ShadingType.CLEAR },
            margins: createCellMargins({ top: 30, bottom: 30, left: 80, right: 80 }),
            width: { size: 2200, type: WidthType.DXA },
            children: [
              new DocxParagraph({
                alignment: AlignmentType.CENTER,
                children: [
                  new TextRun({
                    text: label,
                    font: "Arial",
                    size: 16,
                    bold: true,
                    color: options.textColor || CLAUDE_COLORS.TABLE.HEADER_TEXT
                  })
                ]
              })
            ]
          })
        ]
      })
    ]
  });
}

/**
 * Creates a Claude-style section table container
 * @param {TableRow[]} rows - Array of table rows
 * @returns {Table} Section table with Claude styling
 */
export function claudeSectionTable(rows) {
  return new DocxTable({
    width: { size: CONTENT_WIDTH, type: WidthType.DXA },
    columnWidths: [2400, CONTENT_WIDTH - 2400],
    rows: rows
  });
}
