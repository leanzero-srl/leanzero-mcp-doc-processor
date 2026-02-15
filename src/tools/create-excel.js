import XLSX from "xlsx-js-style";
import fs from "fs";
import path from "path";
import {
  validateAndNormalizeInput,
  ensureDirectory,
  enforceDocsFolder,
  preventDuplicateFiles,
} from "./utils.js";
import {
  getStyleConfig,
  createExcelColumnWidths,
  createExcelRowHeights,
  getAvailablePresets,
  getPresetDescription,
} from "./styling.js";
// Import shared utilities (eliminates code duplication)
import { stripMarkdownPlain } from "./doc-utils.js";
import {
  hexToRgb,
  applyExcelStyling,
  cleanSheetData,
  getZebraColor,
} from "./excel-utils.js";

// hexToRgb and applyExcelStyling are now imported from excel-utils.js

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
    const normalized = validateAndNormalizeInput(input, ["sheets"], "xlsx");

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

    // Enforce docs/ folder for organization (default: true, can be disabled with enforceDocsFolder: false)
    const enforceDocs = input.enforceDocsFolder !== false;
    const { outputPath: docsPath, wasEnforced: docsEnforced } =
      enforceDocsFolder(normalized.outputPath, enforceDocs);

    // Apply docs folder enforcement
    let outputPath = normalized.outputPath;
    if (docsEnforced) {
      outputPath = docsPath;
    }

    // Strip markdown from all cell values in sheet data using shared utility
    for (const sheet of normalized.sheets) {
      sheet.data = cleanSheetData(sheet.data);
    }

    // Dry run mode: return a preview without writing to disk
    // Must be checked BEFORE preventDuplicateFiles which creates placeholder files
    if (input.dryRun) {
      const sheetSummaries = normalized.sheets.map((s) => ({
        name: s.name,
        rows: s.data.length,
        columns: s.data[0] ? s.data[0].length : 0,
      }));

      return {
        success: true,
        dryRun: true,
        preview: {
          outputPath: outputPath,
          sheets: sheetSummaries,
          totalSheets: normalized.sheets.length,
          stylePreset: input.stylePreset || "minimal",
        },
        enforcement: {
          docsFolderEnforced: docsEnforced,
        },
        message: `DRY RUN - No file written. Preview of workbook that would be created:\n\nPath: ${outputPath}\nSheets: ${sheetSummaries.map((s) => `${s.name} (${s.rows} rows x ${s.columns} cols)`).join(", ")}\nStyle: ${input.stylePreset || "minimal"}\n\nCall this tool again without dryRun (or with dryRun: false) to create the file.`,
      };
    }

    // Prevent duplicate files (default: true, can be disabled with preventDuplicates: false)
    const preventDupes = input.preventDuplicates !== false;
    const finalPath = await preventDuplicateFiles(outputPath, preventDupes);
    const wasDuplicatePrevented = finalPath !== outputPath;
    outputPath = finalPath;

    // Step 2: Ensure output directory exists
    await ensureDirectory(path.dirname(outputPath));

    // Log enforcement actions to teach AI models
    if (docsEnforced) {
      console.log(
        `[create-excel] Enforced docs/ folder structure. File placed in: ${path.relative(
          process.cwd(),
          outputPath,
        )}`,
      );
    }
    if (wasDuplicatePrevented) {
      console.log(
        `[create-excel] Prevented duplicate file. Created: ${path.basename(
          outputPath,
        )}`,
      );
    }

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

    // Add zebra striping option using shared utility
    if (input.style && input.style.zebraColor) {
      styleConfig.zebraColor = input.style.zebraColor;
    } else {
      styleConfig.zebraColor = getZebraColor(input.stylePreset);
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
    // Step 8: Return success
    const wbout = XLSX.write(wb, { bookType: "xlsx", type: "buffer" });
    await fs.promises.writeFile(outputPath, wbout);

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
      filePath: path.resolve(outputPath),
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
      enforcement: {
        docsFolderEnforced: docsEnforced,
        duplicatePrevented: wasDuplicatePrevented,
      },
      message: `XLSX FILE WRITTEN TO DISK at: ${path.resolve(outputPath)}\n\nIMPORTANT: This tool has created an actual .xlsx file on your filesystem. Do NOT create any additional markdown or text files. The document is available at the absolute path shown above.\n\n${enforcementMessage}`,
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
