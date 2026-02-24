import XLSX from "xlsx-js-style";
import fs from "fs";
import path from "path";
import {
  validateAndNormalizeInput,
  ensureDirectory,
  enforceDocsFolder,
  preventDuplicateFiles,
  applyCategoryToPath,
  registerDocumentInRegistry,
  getCategoryPath,
  classifyDocumentContent,
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
import { applyDNAToInput } from "../utils/dna-manager.js";
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
    // Inject title into normalized input so filename can be derived from it
    if (input.title && !input.outputPath) {
      input = { ...input };  // shallow clone to avoid mutating caller's object
    }

    // Step 1: Validate and normalize input
    const normalized = validateAndNormalizeInput(input, ["sheets"], "xlsx");

    // Ensure sheets is array of objects with name and data
    if (!Array.isArray(normalized.sheets)) {
      throw new Error("'sheets' must be an array");
    }

    // Validate sheet names are meaningful
    const GENERIC_SHEET_NAMES = new Set([
      "sheet1", "sheet2", "sheet3", "sheet", "data", "new sheet", "untitled",
    ]);
    for (const sheet of normalized.sheets) {
      if (!sheet.name || typeof sheet.name !== "string") {
        throw new Error("Each sheet must have a valid string 'name'");
      }
      if (GENERIC_SHEET_NAMES.has(sheet.name.toLowerCase().trim())) {
        return {
          success: false,
          error: "GENERIC_SHEET_NAME",
          message: `Sheet name "${sheet.name}" is too generic. Please provide a descriptive name that reflects the sheet's content.\n\n` +
            `Good examples: "Budget Overview", "Monthly Breakdown", "Employee Directory"\n` +
            `Bad examples: "Sheet1", "Data", "New Sheet"`,
        };
      }
      if (!Array.isArray(sheet.data)) {
        throw new Error(`Sheet '${sheet.name}' data must be an array`);
      }
    }

    // Get category and tags from input
    let category = input.category || null;
    const tags = Array.isArray(input.tags) ? input.tags : [];

    // Auto-classify if no category provided and title available
    const firstCell = input.sheets?.[0]?.data?.[0]?.[0];
    const title = firstCell ? String(firstCell) : "";
    if (!category && title) {
      const classification = classifyDocumentContent(
        input.outputPath || "",
        title,
      );
      if (classification.category !== "misc") {
        category = classification.category;
        console.error(
          `[create-excel] Auto-classified document as "${category}" (confidence: ${classification.confidence})`,
        );
      }
    }

    let outputPath = normalized.outputPath;
    if (!path.isAbsolute(outputPath)) {
      outputPath = path.resolve(process.cwd(), outputPath);
    }

    // Apply category-based subfolder organization
    const { outputPath: categorizedPath, wasCategorized } = applyCategoryToPath(
      outputPath,
      category,
    );
    outputPath = categorizedPath;

    // Enforce docs/ folder FIRST so duplicate prevention checks the final location
    const enforceDocs = input.enforceDocsFolder !== false;
    const { outputPath: docsPath, wasEnforced: docsEnforced } =
      enforceDocsFolder(outputPath, enforceDocs);

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
          category: category || null,
          tags: tags.length > 0 ? tags : null,
          wasCategorized: wasCategorized,
        },
        enforcement: {
          docsFolderEnforced: docsEnforced,
          categorized: wasCategorized,
          categoryApplied: category || null,
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
      console.error(
        `[create-excel] Enforced docs/ folder structure. File placed in: ${path.relative(
          process.cwd(),
          outputPath,
        )}`,
      );
    }
    if (wasDuplicatePrevented) {
      console.error(
        `[create-excel] Prevented duplicate file. Created: ${path.basename(
          outputPath,
        )}`,
      );
    }

    // Apply Document DNA defaults (stylePreset) if not explicitly provided
    applyDNAToInput(input);

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

    // Register document in registry (non-blocking, failure is non-fatal)
    const registryTitle = input.title || normalized.sheets.map(s => s.name).join(" + ");
    const registryEntry = await registerDocumentInRegistry({
      title: registryTitle,
      filePath: path.resolve(outputPath),
      category: category || "misc",
      tags: tags,
      description: input.description || `Excel workbook with sheets: ${normalized.sheets.map(s => s.name).join(", ")}`,
    });

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
    if (wasCategorized) {
      enforcementMessage += `NOTE: Document categorized as "${category}" and placed in docs/${getCategoryPath(category).subfolder}/.\n`;
    }
    if (registryEntry) {
      enforcementMessage += `NOTE: Document registered in registry (ID: ${registryEntry.id}).\n`;
    }

    return {
      success: true,
      filePath: path.resolve(outputPath),
      category: category || null,
      tags: tags.length > 0 ? tags : null,
      wasCategorized: wasCategorized,
      registryEntry: registryEntry
        ? { id: registryEntry.id, category: registryEntry.category }
        : null,
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
        categorized: wasCategorized,
        categoryApplied: category || null,
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
