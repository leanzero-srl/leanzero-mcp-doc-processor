import XLSX from "xlsx";
import fs from "fs";
import path from "path";
import { validateAndNormalizeInput, ensureDirectory } from "./utils.js";
import {
  getStyleConfig,
  createExcelStyle,
  createExcelColumnWidths,
  createExcelRowHeights,
  applyExcelStyles,
} from "./styling.js";

/**
 * Creates an Excel workbook from structured data using xlsx with styling support
 * @param {Object} input - Tool input
 * @param {Array<Object>} input.sheets - Array of sheet definitions (required)
 *   - Each: { name: string, data: Array<Array<any>>, style?: Object }
 * @param {string} [input.outputPath] - Output file path (default: ./output/data.xlsx)
 * @param {Object} [input.style] - Global style options (optional)
 *   - font: { bold, italics, underline, color, size } — Font styling options
 *   - columnWidths: { [columnIndex]: number } — width in characters
 *   - rowHeights: { [rowIndex]: number } — height in points
 * @param {string} [input.stylePreset] - Name of style preset to use ("minimal", "professional", "colorful")
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

    // Step 3: Get style configuration (merge preset with custom options)
    const styleConfig = getStyleConfig(input.stylePreset, input.style || {});

    // Step 4: Create new workbook
    const wb = XLSX.utils.book_new();

    // Step 5: Add each sheet
    for (const sheetDef of normalized.sheets) {
      const { name, data } = sheetDef;

      // Convert 2D array to worksheet
      const ws = XLSX.utils.aoa_to_sheet(data);

      // Apply styling from style configuration
      if (styleConfig) {
        // Apply column widths
        if (styleConfig.columnWidths) {
          ws["!cols"] = createExcelColumnWidths(styleConfig.columnWidths);
        }

        // Apply row heights
        if (styleConfig.rowHeights) {
          ws["!rows"] = createExcelRowHeights(styleConfig.rowHeights);
        }

        // Apply font styling to cells
        applyExcelStyles(ws, data, styleConfig);
      }

      // Add sheet to workbook
      XLSX.utils.book_append_sheet(wb, ws, name);
    }

    // Step 6: Write workbook to file
    const wbout = XLSX.write(wb, { bookType: "xlsx", type: "buffer" });
    await fs.promises.writeFile(normalized.outputPath, wbout);

    // Step 7: Return success
    return {
      success: true,
      filePath: path.resolve(normalized.outputPath),
      styleConfig,
      message: `Excel workbook created successfully with styling (preset: ${input.stylePreset || "minimal"}) - ${normalized.sheets.length} sheets.`,
    };
  } catch (err) {
    console.error("Excel creation error:", err);

    // Get full stack trace for detailed debugging
    const errorDetails = {
      message: err.message,
      name: err.name,
      code: err.code,
      stack: err.stack?.split("\n").slice(0, 5).join("\n"), // First 5 lines of stack
    };

    return {
      success: false,
      error: err.message,
      details: errorDetails,
      message: `Failed to create Excel file: ${err.message}`,
    };
  }
}
