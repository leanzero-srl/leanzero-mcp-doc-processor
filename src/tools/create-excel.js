import XLSX from "xlsx-js-style";
import fs from "fs";
import path from "path";
import { validateAndNormalizeInput, ensureDirectory } from "./utils.js";
import {
  getStyleConfig,
  createExcelColumnWidths,
  createExcelRowHeights,
  getAvailablePresets,
  getPresetDescription,
} from "./styling.js";

/**
 * Helper function to convert hex color to RGB format for Excel
 * @param {string} hexColor - Hex color (e.g., "FF0000")
 * @returns {Object} RGB object { r, g, b }
 */
function hexToRgb(hexColor) {
  const cleanHex = hexColor.replace(/[^0-9A-Fa-f]/g, "");
  if (cleanHex.length !== 6) {
    return { rgb: "000000" };
  }
  return { rgb: cleanHex.toUpperCase() };
}

/**
 * Apply comprehensive styling to Excel worksheet using xlsx-js-style
 * @param {Object} ws - Worksheet object from xlsx-js-style
 * @param {Array<Array<any>>} data - Original data array for reference
 * @param {Object} styleConfig - Style configuration
 * @param {string} preset - Style preset name
 */
function applyExcelStyling(ws, data, styleConfig, preset) {
  if (!ws || !data) return;

  const config = styleConfig;

  // Apply styling to all cells
  for (let row = 0; row < data.length; row++) {
    for (let col = 0; col < data[row].length; col++) {
      const cellRef = encodeCell(row, col);
      if (!ws[cellRef]) continue;

      const isHeader = row === 0;

      // Initialize cell style object
      ws[cellRef].s = ws[cellRef].s || {};

      // Font styling
      ws[cellRef].s.font = ws[cellRef].s.font || {};

      if (isHeader) {
        // Header row styling
        ws[cellRef].s.font = {
          name: config.font.family || "Arial",
          sz: config.headerSize || 11,
          bold: config.headerBold !== false,
          color: hexToRgb(config.headerColor || "000000"),
        };

        // Header background color
        if (config.headerBackground && config.headerBackground !== "FFFFFF") {
          ws[cellRef].s.fill = {
            patternType: "solid",
            fgColor: hexToRgb(config.headerBackground),
          };
        }

        // Header border
        ws[cellRef].s.border = {
          top: { style: "thin", color: { auto: 1 } },
          bottom: { style: "thin", color: { auto: 1 } },
          left: { style: "thin", color: { auto: 1 } },
          right: { style: "thin", color: { auto: 1 } },
        };

        // Header alignment
        ws[cellRef].s.alignment = {
          horizontal: "center",
          vertical: "center",
          wrapText: true,
        };
      } else {
        // Body cell styling
        ws[cellRef].s.font = {
          name: config.font.family || "Arial",
          sz: config.font.size || 11,
          bold: false,
          color: hexToRgb(config.font.color || "000000"),
        };

        // Optional cell background for alternate rows (zebra striping)
        if (row % 2 === 0 && config.zebraColor) {
          ws[cellRef].s.fill = {
            patternType: "solid",
            fgColor: hexToRgb(config.zebraColor),
          };
        }

        // Body border (lighter than header)
        ws[cellRef].s.border = {
          top: { style: "thin", color: { auto: 1 } },
          bottom: { style: "thin", color: { auto: 1 } },
          left: { style: "thin", color: { auto: 1 } },
          right: { style: "thin", color: { auto: 1 } },
        };

        // Body alignment
        ws[cellRef].s.alignment = {
          horizontal: "left",
          vertical: "center",
          wrapText: true,
        };
      }
    }
  }
}

/**
 * Simple cell reference encoder for Excel (0,0 -> A1, 0,1 -> B1, etc.)
 * @param {number} row - Row index (0-based)
 * @param {number} col - Column index (0-based)
 * @returns {string} Cell reference like "A1"
 */
function encodeCell(row, col) {
  let result = "";
  while (col >= 0) {
    result = String.fromCharCode(65 + (col % 26)) + result;
    col = Math.floor(col / 26) - 1;
  }
  return result + (row + 1);
}

/**
 * Creates an Excel workbook from structured data using xlsx-js-style with full styling support
 * @param {Object} input - Tool input
 * @param {Array<Object>} input.sheets - Array of sheet definitions (required)
 *   - Each: { name: string, data: Array<Array<any>> }
 * @param {string} [input.outputPath] - Output file path (default: ./output/data.xlsx)
 * @param {string} [input.stylePreset] - Name of style preset to use ("minimal", "professional", "technical", "legal", "business", "casual", "colorful")
 * @param {Object} [input.style] - Global style options (optional)
 *   - font: { bold, italics, underline, color, size, family } — Font styling options
 *   - columnWidths: { [columnIndex]: number } — width in characters
 *   - rowHeights: { [rowIndex]: number } — height in points
 *   - zebraColor: string — Hex color for alternating row background
 * @returns {Promise<Object>} Result object with filePath and message
 */
export async function createExcel(input) {
  try {
    // Step 1: Validate and normalize input
    const normalized = validateAndNormalizeInput(input, ["sheets"]);

    // Ensure sheets is array of objects with name and data
    if (!Array.isArray(normalized.sheets)) {
      throw new Error("'sheets' must be an array");
    }

    for (const sheet of normalized.sheets) {
      if (!sheet.name || typeof sheet.name !== "string") {
        throw new Error("Each sheet must have a valid string 'name'");
      }
      if (!Array.isArray(sheet.data)) {
        throw new Error(`Sheet '${sheet.name}' data must be an array`);
      }
    }

    // Step 2: Ensure output directory exists
    await ensureDirectory(path.dirname(normalized.outputPath));

    // Step 3: Validate and apply style preset
    const stylePreset = input.stylePreset || "minimal";
    if (!getAvailablePresets().includes(stylePreset)) {
      console.warn(
        `Warning: Style preset "${stylePreset}" not found. Using "minimal" preset.`,
      );
      input.stylePreset = "minimal";
    }

    // Step 4: Get style configuration (merge preset with custom options)
    const styleConfig = getStyleConfig(input.stylePreset, input.style || {});

    // Add zebra striping option
    if (input.style && input.style.zebraColor) {
      styleConfig.zebraColor = input.style.zebraColor;
    } else {
      // Default zebra colors for different presets
      const zebraColors = {
        minimal: "F9F9F9",
        professional: "F2F2F2",
        technical: "E8E8E8",
        legal: "F5F5F5",
        business: "F0F0F0",
        casual: "FFF3E0",
        colorful: "F3E5F5",
      };
      styleConfig.zebraColor = zebraColors[input.stylePreset] || "F9F9F9";
    }

    // Step 5: Create new workbook
    const wb = XLSX.utils.book_new();

    // Step 6: Add each sheet
    for (const sheetDef of normalized.sheets) {
      const { name, data } = sheetDef;

      // Convert 2D array to worksheet
      const ws = XLSX.utils.aoa_to_sheet(data);

      // Apply column widths
      if (
        styleConfig.columnWidths &&
        Object.keys(styleConfig.columnWidths).length > 0
      ) {
        ws["!cols"] = createExcelColumnWidths(styleConfig.columnWidths);
      }

      // Apply row heights
      if (
        styleConfig.rowHeights &&
        Object.keys(styleConfig.rowHeights).length > 0
      ) {
        ws["!rows"] = createExcelRowHeights(styleConfig.rowHeights);
      }

      // Apply comprehensive styling with proper header formatting
      applyExcelStyling(ws, data, styleConfig, input.stylePreset);

      // Add sheet to workbook
      XLSX.utils.book_append_sheet(wb, ws, name);
    }

    // Step 7: Write workbook to file
    const wbout = XLSX.write(wb, { bookType: "xlsx", type: "buffer" });
    await fs.promises.writeFile(normalized.outputPath, wbout);

    // Step 8: Return success
    return {
      success: true,
      filePath: path.resolve(normalized.outputPath),
      stylePreset: input.stylePreset,
      styleConfig: {
        preset: input.stylePreset,
        description: getPresetDescription(input.stylePreset),
        font: {
          family: styleConfig.font.family,
          size: styleConfig.font.size,
          color: styleConfig.font.color,
        },
        header: {
          bold: styleConfig.headerBold,
          size: styleConfig.headerSize,
          color: styleConfig.headerColor,
          background: styleConfig.headerBackground,
        },
        zebraColor: styleConfig.zebraColor,
      },
      message: `Excel workbook created successfully with "${input.stylePreset}" style preset - ${normalized.sheets.length} sheets.`,
    };
  } catch (err) {
    console.error("Excel creation error:", err);

    const errorDetails = {
      message: err.message,
      name: err.name,
      code: err.code,
    };

    return {
      success: false,
      error: err.message,
      details: errorDetails,
      message: `Failed to create Excel file: ${err.message}`,
    };
  }
}
