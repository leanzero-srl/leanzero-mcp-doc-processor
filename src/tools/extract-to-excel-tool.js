/**
 * Extract-to-Excel Tool Handler
 *
 * Extracts structured data from a document (PDF, DOCX) into an Excel workbook.
 * Modes: 'tables' (extract all tables), 'pattern' (regex match on lines),
 * 'sections' (heading+content pairs).
 */

import { extractData } from "../services/data-extractor.js";
import { createExcel } from "./create-excel.js";

/**
 * Handle extract-to-excel tool.
 *
 * @param {Object} params - Tool parameters
 * @param {string} params.sourcePath - Path to the source document
 * @param {string} params.mode - Extraction mode: 'tables', 'pattern', or 'sections'
 * @param {string} [params.pattern] - Regex pattern (for 'pattern' mode)
 * @param {string} [params.outputTitle] - Title for the output Excel file
 * @param {string} [params.stylePreset] - Style preset for the Excel output
 * @returns {Object} MCP response { content: [{ type: "text", text }], isError? }
 */
export async function handleExtractToExcel(params) {
  try {
    const extractResult = await extractData({
      sourcePath: params.sourcePath,
      mode: params.mode,
      pattern: params.pattern,
    });

    if (extractResult.sheets.length === 0) {
      return {
        content: [{ type: "text", text: JSON.stringify({ success: true, message: extractResult.message, sheets: [] }, null, 2) }],
      };
    }

    const excelResult = await createExcel({
      sheets: extractResult.sheets,
      title: params.outputTitle || "Data Extract",
      stylePreset: params.stylePreset || "minimal",
    });

    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          ...excelResult,
          extractionInfo: { sourcePath: params.sourcePath, mode: params.mode, pattern: params.pattern || null, sheetsExtracted: extractResult.sheets.length },
          message: excelResult.success
            ? `${extractResult.message}\nExcel file written to: ${excelResult.filePath}`
            : excelResult.message,
        }, null, 2),
      }],
      isError: !excelResult.success,
    };
  } catch (err) {
    return {
      content: [{ type: "text", text: JSON.stringify({ success: false, error: err.message }, null, 2) }],
      isError: true,
    };
  }
}
