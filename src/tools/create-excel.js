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
  resolveClientHint,
  uploadFileToTarget,
  mimeTypeFromExtension,
} from "./utils.js";
import {
  getStyleConfig,
  createExcelColumnWidths,
  createExcelRowHeights,
  getAvailablePresets,
  getPresetDescription,
} from "./styling.js";
import { applyDNAToInput } from "../utils/dna-manager.js";
import {
  applyExcelStyling,
  cleanSheetData,
  getZebraColor,
} from "./excel-utils.js";
import { log } from "../utils/logger.js";

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
    // Shallow clone so we can safely mutate (e.g. apply DNA defaults) without
    // touching the caller's object.
    input = { ...input };

    // Apply Document DNA defaults (stylePreset etc.) BEFORE the dry-run preview
    // so the preview reflects what would actually be written.
    applyDNAToInput(input);

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

    // Auto-classify using title + description (not the top-left cell, which is
    // typically just a header label like "Date" and produces fragile guesses).
    const classifierTitle = input.title || "";
    const classifierContent = input.description || "";
    if (!category && (classifierTitle || classifierContent)) {
      const classification = classifyDocumentContent(classifierTitle, classifierContent);
      if (classification.category !== "misc") {
        category = classification.category;
        log("info",
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

    if (docsEnforced) {
      log("info",
        `[create-excel] Enforced docs/ folder structure. File placed in: ${path.relative(
          process.cwd(),
          outputPath,
        )}`,
      );
    }
    if (wasDuplicatePrevented) {
      log("info",
        `[create-excel] Prevented duplicate file. Created: ${path.basename(
          outputPath,
        )}`,
      );
    }

    // Step 3: Validate and apply style preset (DNA defaults already merged in earlier).
    const stylePreset = input.stylePreset || "minimal";
    if (!getAvailablePresets().includes(stylePreset)) {
      log("warn",
        `[create-excel] Style preset "${stylePreset}" not found. Falling back to "minimal".`,
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

    // Optional: upload the freshly-written file to a remote endpoint via JSON envelope.
    let uploadResult = null;
    let uploadError = null;
    if (input.uploadUrl && input.uploadAuthHeader) {
      try {
        uploadResult = await uploadFileToTarget({
          filePath: path.resolve(outputPath),
          uploadUrl: input.uploadUrl,
          uploadAuthHeader: input.uploadAuthHeader,
          filename: input.uploadFilename,
          mimeType: mimeTypeFromExtension(outputPath),
        });
      } catch (err) {
        uploadError = err.message;
        log("warn", "[create-excel] upload failed (file still written locally)", { error: err.message });
      }
    } else if (input.uploadUrl || input.uploadAuthHeader) {
      uploadError = "uploadUrl and uploadAuthHeader must be provided together";
      log("warn", "[create-excel] partial upload params — both uploadUrl and uploadAuthHeader required");
    }

    const clientMode = resolveClientHint(input);
    const isInteractive = clientMode === "interactive";

    // Build message with enforcement information (agent mode only)
    let enforcementMessage = "";
    if (!isInteractive) {
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
    }

    const uploadInteractiveMsg = uploadResult
      ? `Created and uploaded: ${path.resolve(outputPath)} → ${uploadResult.attachment?.content || uploadResult.attachment?.id || "remote endpoint"}`
      : uploadError
        ? `Created locally at ${path.resolve(outputPath)}; upload failed: ${uploadError}`
        : `Created: ${path.resolve(outputPath)}`;

    const uploadAgentNote = uploadResult
      ? `\nUPLOADED: file POSTed to remote endpoint (status ${uploadResult.status}). Receiver returned: ${JSON.stringify(uploadResult.attachment).slice(0, 300)}\n`
      : uploadError
        ? `\nUPLOAD FAILED: ${uploadError}\nThe local file is still available at ${path.resolve(outputPath)}.\n`
        : "";

    const interactiveMessage = uploadInteractiveMsg;
    const agentMessage = `XLSX FILE WRITTEN TO DISK at: ${path.resolve(outputPath)}\n\nIMPORTANT: This tool has created an actual .xlsx file on your filesystem. Do NOT create any additional markdown or text files. The document is available at the absolute path shown above.\n\n${enforcementMessage}` + uploadAgentNote;

    return {
      success: true,
      filePath: path.resolve(outputPath),
      clientMode,
      uploaded: !!uploadResult,
      uploadAttachment: uploadResult?.attachment || null,
      uploadStatus: uploadResult?.status || null,
      uploadError: uploadError || null,
      category: category || null,
      tags: tags.length > 0 ? tags : null,
      wasCategorized: wasCategorized,
      registryEntry: registryEntry
        ? { id: registryEntry.id, category: registryEntry.category }
        : null,
      stylePreset: input.stylePreset,
      styleConfig: isInteractive ? undefined : {
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
      enforcement: isInteractive ? undefined : {
        docsFolderEnforced: docsEnforced,
        duplicatePrevented: wasDuplicatePrevented,
        categorized: wasCategorized,
        categoryApplied: category || null,
      },
      message: isInteractive ? interactiveMessage : agentMessage,
    };
  } catch (err) {
    log("error", "[create-excel] Creation error:", { message: err.message, name: err.name, code: err.code });

    return {
      success: false,
      error: err.message,
      details: { message: err.message, name: err.name, code: err.code },
      message: `Failed to create Excel file: ${err.message}`,
    };
  }
}
