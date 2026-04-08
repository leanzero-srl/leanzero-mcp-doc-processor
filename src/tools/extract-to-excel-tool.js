import { createExcel } from "./create-excel.js";

/**
 * Handler for extract-to-excel tool.
 * Extracts data from a source and creates an Excel workbook.
 * 
 * @param {Object} params - Tool parameters
 * @param {string} params.sourcePath - Path to the source document
 * @param {string} [params.mode] - Extraction mode
 * @param {string} [params.pattern] - Extraction pattern
 * @param {string} [params.outputTitle] - Title for the new Excel file
 * @param {string} [params.stylePreset] - Style preset for the Excel file
 * @returns {Promise<Object>} MCP response
 */
export async function handleExtractToExcel(params) {
  const { extractData } = await import("../services/data-extractor.js");
  
  const extractResult = await extractData({ 
    sourcePath: params.sourcePath, 
    mode: params.mode, 
    pattern: params.pattern 
  });

  if (extractResult.sheets.length === 0) {
    return { 
      success: true, 
      message: extractResult.message, 
      sheets: [] 
    };
  }

  const derivedTitle = params.outputTitle || `Data Extract from ${path.basename(params.sourcePath || "document", path.extname(params.sourcePath || ""))}`;
  
  // Note: createExcel is imported from ./create-excel.js which is in the same directory
  const excelResult = await createExcel({ 
    sheets: extractResult.sheets, 
    title: derivedTitle, 
    stylePreset: params.stylePreset || "minimal" 
  });

  return {
    ...excelResult,
    extractionInfo: { 
      sourcePath: params.sourcePath, 
      mode: params.mode, 
      sheetsExtracted: extractResult.sheets.length 
    }
  };
}

// Helper to handle path basename since it's used in the original inline code
import path from "path";