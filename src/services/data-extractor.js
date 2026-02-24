/**
 * Data Extractor Service
 *
 * Reads a document (PDF, DOCX) and extracts structured data into
 * arrays suitable for Excel workbook creation. Three modes:
 *   - tables: Extract all tables, one sheet per table
 *   - pattern: Extract lines matching a regex into rows
 *   - sections: Extract document sections as heading+content pairs
 */

import JSZip from "jszip";
import fs from "fs/promises";
import { documentProcessor } from "./document-processor.js";
import { FileTypeDetector } from "../utils/file-detector.js";
import { findXMLTags } from "../utils/xml-utils.js";

const fileDetector = new FileTypeDetector();

/**
 * Extract text from w:tc (table cell) XML
 */
function extractCellText(cellXml) {
  const textMatches = cellXml.match(/<w:t[^>]*>([^<]*)<\/w:t>/g);
  if (!textMatches) return "";
  return textMatches.map(t => t.replace(/<w:t[^>]*>([^<]*)<\/w:t>/, "$1")).join("");
}

/**
 * Extract tables from a DOCX file.
 *
 * @param {string} filePath - Path to DOCX file
 * @returns {Promise<Array<{name: string, data: string[][]}>>} Array of sheet-ready table data
 */
async function extractTablesFromDocx(filePath) {
  const fileBuffer = await fs.readFile(filePath);
  const zip = await JSZip.loadAsync(fileBuffer);
  const documentXml = await zip.file("word/document.xml")?.async("string");

  if (!documentXml) return [];

  const tables = findXMLTags(documentXml, "w:tbl");
  const sheets = [];

  for (let i = 0; i < tables.length; i++) {
    const rows = findXMLTags(tables[i].xml, "w:tr");
    const data = [];

    for (const row of rows) {
      const cells = findXMLTags(row.xml, "w:tc");
      const rowData = [];
      for (const cell of cells) {
        const text = extractCellText(cell.xml);
        rowData.push(text);

        // Handle merged cells (w:gridSpan) — fill extra columns with empty string
        const gridSpanMatch = cell.xml.match(/<w:gridSpan\s+w:val="(\d+)"/);
        if (gridSpanMatch) {
          const span = parseInt(gridSpanMatch[1], 10);
          for (let s = 1; s < span; s++) {
            rowData.push(""); // Fill spanned columns
          }
        }
      }
      data.push(rowData);
    }

    if (data.length > 0) {
      // Normalize column counts across rows (some rows may have fewer columns)
      const maxCols = Math.max(...data.map(r => r.length));
      for (const row of data) {
        while (row.length < maxCols) {
          row.push("");
        }
      }

      sheets.push({
        name: `Table ${i + 1}`,
        data,
      });
    }
  }

  return sheets;
}

/**
 * Extract tables from text content (PDF or any text-based parsing).
 * Looks for tab-separated or pipe-separated table patterns.
 *
 * @param {string} text - Document text content
 * @returns {Array<{name: string, data: string[][]}>} Array of sheet-ready table data
 */
function extractTablesFromText(text) {
  const lines = text.split("\n");
  const sheets = [];
  let currentTable = [];
  let tableIdx = 0;

  for (const line of lines) {
    const trimmed = line.trim();

    // Detect pipe-delimited tables
    if (trimmed.includes("|") && (trimmed.match(/\|/g) || []).length >= 2) {
      // Skip separator rows like |---|---|
      if (/^\|[\s\-:]+\|/.test(trimmed)) continue;

      const cells = trimmed
        .split("|")
        .map(c => c.trim())
        .filter(c => c.length > 0);

      if (cells.length >= 2) {
        currentTable.push(cells);
        continue;
      }
    }

    // Detect tab-delimited tables
    if (trimmed.includes("\t") && (trimmed.match(/\t/g) || []).length >= 1) {
      const cells = trimmed.split("\t").map(c => c.trim());
      if (cells.length >= 2) {
        currentTable.push(cells);
        continue;
      }
    }

    // End of table
    if (currentTable.length >= 2) {
      tableIdx++;
      sheets.push({
        name: `Table ${tableIdx}`,
        data: currentTable,
      });
    }
    currentTable = [];
  }

  // Don't forget last table
  if (currentTable.length >= 2) {
    tableIdx++;
    sheets.push({
      name: `Table ${tableIdx}`,
      data: currentTable,
    });
  }

  return sheets;
}

/**
 * Extract lines matching a pattern from document text.
 *
 * @param {string} text - Document text
 * @param {string} pattern - Regex pattern to match
 * @returns {{name: string, data: string[][]}[]} Sheet-ready data
 */
function extractByPattern(text, pattern) {
  let regex;
  try {
    regex = new RegExp(pattern, "gim");
  } catch (err) {
    throw new Error(`Invalid regex pattern "${pattern}": ${err.message}`);
  }
  const lines = text.split("\n");
  const matches = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (regex.test(line)) {
      matches.push([String(i + 1), line]);
      regex.lastIndex = 0; // Reset for global regex
    }
  }

  if (matches.length === 0) return [];

  return [{
    name: "Pattern Matches",
    data: [
      ["Line #", "Matched Content"],
      ...matches,
    ],
  }];
}

/**
 * Extract document sections as heading + content pairs.
 *
 * @param {string} text - Document text
 * @param {Array} structure - Heading structure from document processor
 * @returns {{name: string, data: string[][]}[]} Sheet-ready data
 */
function extractSections(text, structure) {
  const lines = text.split("\n");

  if (!structure || structure.length === 0) {
    // Fallback: treat all-caps or short lines as headings
    const sections = [];
    let currentHeading = "(Document Start)";
    let currentContent = [];

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.length === 0) continue;

      // Heuristic: short lines that are title-case or ALL CAPS might be headings
      const isHeading = trimmed.length < 80 && (
        trimmed === trimmed.toUpperCase() ||
        /^[A-Z][a-z]/.test(trimmed) && !trimmed.includes(".")
      );

      if (isHeading && currentContent.length > 0) {
        sections.push([currentHeading, currentContent.join(" ")]);
        currentContent = [];
        currentHeading = trimmed;
      } else if (trimmed.length > 0) {
        currentContent.push(trimmed);
      }
    }

    if (currentContent.length > 0) {
      sections.push([currentHeading, currentContent.join(" ")]);
    }

    return [{
      name: "Sections",
      data: [
        ["Section Heading", "Content"],
        ...sections,
      ],
    }];
  }

  // Use provided structure
  const sections = [];

  for (let i = 0; i < structure.length; i++) {
    const heading = structure[i];
    const headingText = heading.text || heading.heading || "";

    // Find content between this heading and the next
    const startIdx = lines.findIndex(l => l.includes(headingText));
    const nextHeading = structure[i + 1];
    const endIdx = nextHeading
      ? lines.findIndex(l => l.includes(nextHeading.text || nextHeading.heading || ""))
      : lines.length;

    if (startIdx >= 0 && endIdx > startIdx) {
      const content = lines.slice(startIdx + 1, endIdx)
        .filter(l => l.trim().length > 0)
        .join(" ")
        .trim();
      sections.push([headingText, content]);
    }
  }

  return [{
    name: "Sections",
    data: [
      ["Section Heading", "Content"],
      ...sections,
    ],
  }];
}

/**
 * Main extraction pipeline: read a document and extract structured data.
 *
 * @param {Object} options
 * @param {string} options.sourcePath - Path to source document
 * @param {string} options.mode - "tables" | "pattern" | "sections"
 * @param {string} [options.pattern] - Regex pattern (for pattern mode)
 * @returns {Promise<{sheets: Array, message: string}>}
 */
export async function extractData(options) {
  const { sourcePath, mode, pattern } = options;

  // Detect file type
  const detected = fileDetector.detect(sourcePath);
  if (!detected.success) {
    throw new Error(`Could not detect file type for: ${sourcePath}`);
  }

  const isDocx = detected.fileType === "docx";

  // For tables mode with DOCX, use XML extraction for higher fidelity
  if (mode === "tables" && isDocx) {
    const sheets = await extractTablesFromDocx(sourcePath);
    if (sheets.length === 0) {
      return { sheets: [], message: "No tables found in the document." };
    }
    return {
      sheets,
      message: `Extracted ${sheets.length} table(s) from DOCX.`,
    };
  }

  // For all other cases, use the document processor for text extraction
  const result = await documentProcessor.processDocument(sourcePath, "indepth");
  if (!result.success) {
    throw new Error(`Failed to process document: ${result.error || "unknown error"}`);
  }

  const text = result.text || "";
  const structure = result.structure || [];

  switch (mode) {
    case "tables": {
      const sheets = extractTablesFromText(text);
      return {
        sheets,
        message: sheets.length > 0
          ? `Extracted ${sheets.length} table(s) from document text.`
          : "No tables detected in document text.",
      };
    }

    case "pattern": {
      if (!pattern) throw new Error("Pattern mode requires a 'pattern' parameter.");
      const sheets = extractByPattern(text, pattern);
      return {
        sheets,
        message: sheets.length > 0 && sheets[0].data.length > 1
          ? `Found ${sheets[0].data.length - 1} match(es) for pattern "${pattern}".`
          : `No matches found for pattern "${pattern}".`,
      };
    }

    case "sections": {
      const sheets = extractSections(text, structure);
      return {
        sheets,
        message: sheets.length > 0 && sheets[0].data.length > 1
          ? `Extracted ${sheets[0].data.length - 1} section(s).`
          : "No sections detected.",
      };
    }

    default:
      throw new Error(`Unknown extraction mode: ${mode}. Use "tables", "pattern", or "sections".`);
  }
}
