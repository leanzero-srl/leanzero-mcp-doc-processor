import XLSX from "xlsx-js-style";
import fs from "fs";
import path from "path";
import { getStyleConfig, getAvailablePresets } from "./styling.js";
import { registerDocumentInRegistry } from "./utils.js";
// Import shared utilities (eliminates code duplication)
import { stripMarkdownPlain } from "./doc-utils.js";
import {
  hexToRgb,
  applyExcelStyling,
  applyExcelStylingToNewRows,
  cleanSheetData,
  getZebraColor,
} from "./excel-utils.js";

/**
 * Edits an existing Excel workbook by appending rows, adding sheets, or replacing sheets.
 *
 * The xlsx-js-style library supports reading and modifying workbooks natively,
 * so we read the existing file, modify it, and write it back.
 *
 * @param {Object} input - Edit parameters
 * @param {string} input.filePath - Path to existing XLSX file (required)
 * @param {string} input.action - "append-rows", "append-sheet", or "replace-sheet" (required)
 * @param {string} [input.sheetName] - Target sheet name (required for append-rows and replace-sheet)
 * @param {Array} [input.rows] - Row arrays to append (for append-rows)
 * @param {Object} [input.sheetData] - { name, data } for new/replacement sheet
 * @param {string} [input.stylePreset] - Style preset for new content
 * @returns {Promise<Object>} Result with filePath and message
 */
export async function editExcel(input) {
  try {
    const { filePath, action } = input;

    // Get category and tags from input
    const category = input.category || null;
    const tags = Array.isArray(input.tags) ? input.tags : [];

    if (!filePath) {
      throw new Error("filePath is required");
    }
    if (
      !action ||
      !["append-rows", "append-sheet", "replace-sheet"].includes(action)
    ) {
      throw new Error(
        "action must be 'append-rows', 'append-sheet', or 'replace-sheet'",
      );
    }

    const resolvedPath = path.isAbsolute(filePath)
      ? filePath
      : path.resolve(process.cwd(), filePath);

    // Verify file exists
    if (!fs.existsSync(resolvedPath)) {
      throw new Error(`File not found: ${resolvedPath}`);
    }

    // Read existing workbook
    const wb = XLSX.readFile(resolvedPath);

    // Get style config for any new styling
    const stylePreset = input.stylePreset || "minimal";
    const styleConfig = getStyleConfig(
      getAvailablePresets().includes(stylePreset) ? stylePreset : "minimal",
      input.style || {},
    );

    // Set zebra color using shared utility
    styleConfig.zebraColor =
      input.style?.zebraColor || getZebraColor(stylePreset);

    if (action === "append-rows") {
      const sheetName = input.sheetName;
      if (!sheetName) {
        throw new Error("sheetName is required for append-rows action");
      }
      if (!wb.SheetNames.includes(sheetName)) {
        throw new Error(
          `Sheet '${sheetName}' not found. Available sheets: ${wb.SheetNames.join(", ")}`,
        );
      }
      if (!Array.isArray(input.rows) || input.rows.length === 0) {
        throw new Error("rows must be a non-empty array of row arrays");
      }

      const ws = wb.Sheets[sheetName];

      // Find the current range to determine where to append
      const range = XLSX.utils.decode_range(ws["!ref"] || "A1");
      const startRow = range.e.r + 1; // Next row after existing data

      // Strip markdown from new rows using shared utility
      const cleanedRows = cleanSheetData(input.rows);

      // Append rows using sheet_add_aoa
      XLSX.utils.sheet_add_aoa(ws, cleanedRows, { origin: startRow });

      // Apply styling ONLY to new rows, preserving existing cell styles
      // This fixes the issue where original styling was being overwritten
      applyExcelStylingToNewRows(ws, cleanedRows, styleConfig, startRow);

      // Write back
      const wbout = XLSX.write(wb, { bookType: "xlsx", type: "buffer" });
      await fs.promises.writeFile(resolvedPath, wbout);

      // Update registry timestamp with category and tags if provided
      await registerDocumentInRegistry({
        title: path.basename(resolvedPath, ".xlsx"),
        filePath: resolvedPath,
        category: category || "misc",
        tags: tags,
      }).catch(() => {});

      return {
        success: true,
        filePath: resolvedPath,
        action: "append-rows",
        sheetName: sheetName,
        rowsAdded: cleanedRows.length,
        message: `Excel file UPDATED at: ${resolvedPath}\n\nAppended ${cleanedRows.length} row(s) to sheet '${sheetName}'. Existing cell styling preserved.`,
      };
    }

    if (action === "append-sheet") {
      if (
        !input.sheetData ||
        !input.sheetData.name ||
        !Array.isArray(input.sheetData.data)
      ) {
        throw new Error(
          "sheetData with 'name' and 'data' is required for append-sheet action",
        );
      }

      const newSheetName = input.sheetData.name;

      if (wb.SheetNames.includes(newSheetName)) {
        throw new Error(
          `Sheet '${newSheetName}' already exists. Use 'replace-sheet' to overwrite, or choose a different name.`,
        );
      }

      // Strip markdown from data using shared utility
      const cleanedData = cleanSheetData(input.sheetData.data);

      // Create new worksheet
      const ws = XLSX.utils.aoa_to_sheet(cleanedData);
      applyExcelStyling(ws, cleanedData, styleConfig, stylePreset);

      // Append to workbook
      XLSX.utils.book_append_sheet(wb, ws, newSheetName);

      // Write back
      const wbout = XLSX.write(wb, { bookType: "xlsx", type: "buffer" });
      await fs.promises.writeFile(resolvedPath, wbout);

      // Update registry timestamp with category and tags
      await registerDocumentInRegistry({
        title: path.basename(resolvedPath, ".xlsx"),
        filePath: resolvedPath,
        category: category || "misc",
        tags: tags,
      }).catch(() => {});

      return {
        success: true,
        filePath: resolvedPath,
        action: "append-sheet",
        sheetName: newSheetName,
        rows: cleanedData.length,
        totalSheets: wb.SheetNames.length,
        message: `Excel file UPDATED at: ${resolvedPath}\n\nAdded new sheet '${newSheetName}' with ${cleanedData.length} row(s). Workbook now has ${wb.SheetNames.length} sheet(s).`,
      };
    }

    if (action === "replace-sheet") {
      const sheetName = input.sheetName;
      if (!sheetName) {
        throw new Error("sheetName is required for replace-sheet action");
      }
      if (!wb.SheetNames.includes(sheetName)) {
        throw new Error(
          `Sheet '${sheetName}' not found. Available sheets: ${wb.SheetNames.join(", ")}`,
        );
      }
      if (!input.sheetData || !Array.isArray(input.sheetData.data)) {
        throw new Error(
          "sheetData with 'data' array is required for replace-sheet action",
        );
      }

      // Strip markdown from data using shared utility
      const cleanedData = cleanSheetData(input.sheetData.data);

      // Create replacement worksheet
      const ws = XLSX.utils.aoa_to_sheet(cleanedData);
      applyExcelStyling(ws, cleanedData, styleConfig, stylePreset);

      // Replace the sheet in the workbook
      wb.Sheets[sheetName] = ws;

      // Write back
      const wbout = XLSX.write(wb, { bookType: "xlsx", type: "buffer" });
      await fs.promises.writeFile(resolvedPath, wbout);

      // Update registry timestamp with category and tags
      await registerDocumentInRegistry({
        title: path.basename(resolvedPath, ".xlsx"),
        filePath: resolvedPath,
        category: category || "misc",
        tags: tags,
      }).catch(() => {});

      return {
        success: true,
        filePath: resolvedPath,
        action: "replace-sheet",
        sheetName: sheetName,
        rows: cleanedData.length,
        message: `Excel file UPDATED at: ${resolvedPath}\n\nReplaced sheet '${sheetName}' with ${cleanedData.length} row(s) of new data.`,
      };
    }
  } catch (err) {
    return {
      success: false,
      error: err.message,
      message: `Failed to edit Excel file: ${err.message}`,
    };
  }
}
