import { AlignmentType, LevelFormat } from "docx";


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

   // RISK ASSESSMENT - Professional migration assessment style
   risk_assessment: {
     font: { size: 11, color: "333333", bold: false, family: "Arial" },
     headingFont: "Arial",
     heading1: {
       size: 20,
       color: "2F5496",
       bold: true,
       spacingBefore: 360,
       spacingAfter: 180,
     },
     heading2: {
       size: 16,
       color: "2F5496",
       bold: true,
       spacingBefore: 280,
       spacingAfter: 140,
     },
     heading3: {
       size: 14,
       color: "415A77",
       bold: true,
       spacingBefore: 220,
       spacingAfter: 100,
     },
     title: {
       size: 36,
       color: "2F5496",
       bold: true,
       spacingBefore: 480,
       spacingAfter: 320,
       alignment: "center",
     },
     paragraph: {
       alignment: "left",
       spacingBefore: 120,
       spacingAfter: 120,
       lineSpacing: 1.15,
     },
     table: {
       borderColor: "CCCCCC",
       borderStyle: "single",
       borderWidth: 1,
       headerFill: "2F5496",
       headerFontColor: "FFFFFF",
       zebraFill: "F8F9FA",
       zebraInterval: 2,
       insideBorderColor: "CCCCCC",
       insideBorderWidth: 1,
       outsideBorderWidth: 1,
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
     headerBackground: "2F5496",
   },

   // MIGRATION RUNBOOK - High-density Excel tracking style
   migration_runbook: {
     font: { size: 10, color: "000000", bold: false, family: "Arial" },
     headingFont: "Arial",
     heading1: {
       size: 14,
       color: "1B263B",
       bold: true,
       spacingBefore: 240,
       spacingAfter: 120,
     },
     heading2: {
       size: 12,
       color: "415A77",
       bold: true,
       spacingBefore: 200,
       spacingAfter: 100,
     },
     heading3: {
       size: 11,
       color: "778DA9",
       bold: true,
       spacingBefore: 160,
       spacingAfter: 80,
     },
     title: {
       size: 16,
       color: "1B263B",
       bold: true,
       spacingBefore: 360,
       spacingAfter: 240,
       alignment: "center",
     },
     paragraph: {
       alignment: "left",
       spacingBefore: 120,
       spacingAfter: 120,
       lineSpacing: 1.0,
     },
     table: {
       borderColor: "CCCCCC",
       borderStyle: "thin",
       borderWidth: 1,
       headerFill: "2F5496",
       headerFontColor: "FFFFFF",
       zebraFill: "F8F9FA",
       zebraInterval: 2,
       insideBorderColor: "CCCCCC",
       insideBorderWidth: 1,
       outsideBorderWidth: 1,
     },
     code: {
       fontFamily: "Courier New",
       fontSize: 9,
       color: "000000",
       backgroundColor: "F5F5F5",
       borderColor: "E0E0E0",
     },
     // Excel styling
     columnWidths: {},
     rowHeights: {},
     headerBold: true,
     headerSize: 10,
     headerColor: "FFFFFF",
     headerBackground: "2F5496",
   },

  // CLAUDE-LIKE — Modern, blue-accented, generous whitespace, designed to
  // look like a polished Claude chat answer rendered as a document.
  // Uses Calibri (universal Word default) so files look the same on any
  // Word/LibreOffice/Pages install — no font-installation required.
  "claude-like": {
    font: { size: 11, color: "1F2937", bold: false, family: "Calibri" },
    headingFont: "Calibri",
    heading1: {
      size: 22,
      color: "0F172A",
      bold: true,
      spacingBefore: 480,
      spacingAfter: 240,
    },
    heading2: {
      size: 16,
      color: "1E293B",
      bold: true,
      spacingBefore: 360,
      spacingAfter: 200,
    },
    heading3: {
      size: 13,
      color: "334155",
      bold: true,
      spacingBefore: 280,
      spacingAfter: 160,
    },
    heading: {
      size: 16,
      color: "1E293B",
      bold: true,
      spacingBefore: 360,
      spacingAfter: 200,
    },
    title: {
      size: 28,
      color: "0F172A",
      bold: true,
      spacingBefore: 240,
      spacingAfter: 480,
      alignment: "left",
      smallCaps: false,
      characterSpacing: 0,
      borderBottom: null,
    },
    paragraph: {
      alignment: "left",
      spacingBefore: 0,
      spacingAfter: 200,
      lineSpacing: 1.5,
    },
    table: {
      borderColor: "E2E8F0",
      borderStyle: "single",
      borderWidth: 4,
      headerFill: "F1F5F9",
      headerFontColor: "0F172A",
      zebraFill: "F8FAFC",
      zebraInterval: 2,
      insideBorderColor: "E2E8F0",
      insideBorderWidth: 2,
      outsideBorderWidth: 4,
    },
    code: {
      fontFamily: "Consolas",
      fontSize: 10,
      color: "0F172A",
      backgroundColor: "F8FAFC",
      borderColor: "E2E8F0",
    },
    // New block-level styles consumed by parseMarkdownToDocx
    blockquote: {
      borderColor: "94A3B8",
      borderWidth: 12,
      italic: true,
      color: "475569",
      indent: 480,
    },
    hr: {
      color: "E2E8F0",
      thickness: 4,
    },
    link: {
      color: "2563EB",
      underline: true,
    },
    // Excel styling (in case a workbook uses this preset)
    columnWidths: {},
    rowHeights: {},
    headerBold: true,
    headerSize: 11,
    headerColor: "0F172A",
    headerBackground: "F1F5F9",
  },
 };

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
    "claude-like":
      "Modern, blue-accented Claude-like documents — generous whitespace, Calibri body, blue accents, polished tables and code blocks. Best default for general-purpose professional output.",
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
