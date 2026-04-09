/**
 * Document Blueprint Extractor
 *
 * Reads an existing DOCX or PDF, extracts its structural skeleton
 * (heading hierarchy, section names, table layouts, paragraph density),
 * and saves it as a reusable blueprint. Blueprints act as structural
 * contracts that constrain AI-generated document output.
 */

import JSZip from "jszip";
import fs from "fs/promises";
import { documentProcessor } from "./document-processor.js";
import { findXMLTags } from "../utils/xml-utils.js";

/**
 * Extract text content from a w:p XML node
 */
function extractTextFromParagraph(paraXml) {
  const textMatches = paraXml.match(/<w:t[^>]*>([^<]*)<\/w:t>/g);
  if (!textMatches) return "";
  return textMatches.map(t => t.replace(/<w:t[^>]*>([^<]*)<\/w:t>/, "$1")).join("");
}

/**
 * Detect heading level from a w:p XML node
 */
function detectHeadingLevel(paraXml) {
  // Check for w:pStyle with heading value
  const styleMatch = paraXml.match(/<w:pStyle\s+w:val="([^"]+)"/);
  if (styleMatch) {
    const style = styleMatch[1].toLowerCase();
    if (style === "title") return "title";
    if (style.includes("heading1") || style === "heading 1") return "heading1";
    if (style.includes("heading2") || style === "heading 2") return "heading2";
    if (style.includes("heading3") || style === "heading 3") return "heading3";
  }

  // Check for outline level
  const outlineLvlMatch = paraXml.match(/<w:outlineLvl\s+w:val="(\d+)"/);
  if (outlineLvlMatch) {
    const lvl = parseInt(outlineLvlMatch[1]);
    if (lvl === 0) return "heading1";
    if (lvl === 1) return "heading2";
    if (lvl === 2) return "heading3";
  }

  return null;
}

/**
 * Extract table dimensions from w:tbl XML node
 */
function extractTableDimensions(tblXml) {
  const rows = findXMLTags(tblXml, "w:tr");
  if (rows.length === 0) return null;

  // Count cells in first row for column count
  const firstRowCells = findXMLTags(rows[0].xml, "w:tc");

  return {
    rows: rows.length,
    columns: firstRowCells.length,
  };
}

/**
 * Extract a structural blueprint from a DOCX file.
 *
 * @param {string} filePath - Path to the DOCX file
 * @returns {Promise<Object>} Extracted blueprint structure
 */
export async function extractBlueprintFromDocx(filePath) {
  const fileBuffer = await fs.readFile(filePath);
  const zip = await JSZip.loadAsync(fileBuffer);
  const documentXml = await zip.file("word/document.xml")?.async("string");

  if (!documentXml) {
    throw new Error("Invalid DOCX: Could not find word/document.xml");
  }

  const paragraphs = findXMLTags(documentXml, "w:p");
  const tables = findXMLTags(documentXml, "w:tbl");

  // Build section map: heading -> paragraphs under it, with richer metadata
  const sections = [];
  let currentSection = null;
  let paragraphsInCurrentSection = 0;
  let charCountInCurrentSection = 0;
  let listsInCurrentSection = 0;

  for (const para of paragraphs) {
    const text = extractTextFromParagraph(para.xml);
    const headingLevel = detectHeadingLevel(para.xml);

    if (headingLevel) {
      // Save previous section
      if (currentSection) {
        currentSection.paragraphCount = paragraphsInCurrentSection;
        currentSection.charCount = charCountInCurrentSection;
        currentSection.hasList = listsInCurrentSection > 0;
        currentSection.listItemCount = listsInCurrentSection;
        sections.push(currentSection);
      }

      currentSection = {
        heading: headingLevel,
        pattern: text.trim(),
        required: true,
        hasTable: false,
        tableShape: null,
        paragraphCount: 0,
        charCount: 0,
        hasList: false,
        listItemCount: 0,
      };
      paragraphsInCurrentSection = 0;
      charCountInCurrentSection = 0;
      listsInCurrentSection = 0;
    } else if (text.trim().length > 0) {
      paragraphsInCurrentSection++;
      charCountInCurrentSection += text.trim().length;

      // Detect list items (numbered lists or bullet-like patterns in OOXML)
      const isListItem = para.xml.includes("<w:numPr") ||
        /^[\d]+[.)]\s/.test(text.trim()) ||
        /^[-•●◦▪]\s/.test(text.trim());
      if (isListItem) {
        listsInCurrentSection++;
      }
    }
  }

  // Save last section
  if (currentSection) {
    currentSection.paragraphCount = paragraphsInCurrentSection;
    currentSection.charCount = charCountInCurrentSection;
    currentSection.hasList = listsInCurrentSection > 0;
    currentSection.listItemCount = listsInCurrentSection;
    sections.push(currentSection);
  }

  // Map tables to sections (associate tables with the section they appear after)
  // Simple heuristic: tables appear between headings
  for (const table of tables) {
    const dims = extractTableDimensions(table.xml);
    if (!dims) continue;

    // Find which section this table belongs to by position
    for (let i = sections.length - 1; i >= 0; i--) {
      // Associate with the last section before this table's position
      if (!sections[i].hasTable) {
        sections[i].hasTable = true;
        sections[i].tableShape = [dims.rows, dims.columns];
        break;
      }
    }
  }

  // Detect style preset from document (heuristic: check font family)
  let detectedPreset = "minimal";
  const fontMatch = documentXml.match(/<w:rFonts[^>]+w:ascii="([^"]+)"/);
  if (fontMatch) {
    const font = fontMatch[1].toLowerCase();
    if (font.includes("garamond")) detectedPreset = "professional";
    else if (font.includes("times")) detectedPreset = "legal";
    else if (font.includes("calibri")) detectedPreset = "business";
    else if (font.includes("verdana")) detectedPreset = "casual";
    else if (font.includes("century gothic")) detectedPreset = "colorful";
  }

  // Calculate average paragraphs per section
  const filteredSections = sections.filter(s => s.pattern.length > 0);
  const sectionParagraphs = filteredSections.filter(s => s.paragraphCount > 0);
  const avgParagraphs = sectionParagraphs.length > 0
    ? Math.round(sectionParagraphs.reduce((sum, s) => sum + s.paragraphCount, 0) / sectionParagraphs.length)
    : 3;

  // Calculate content length ratios between sections (relative weights)
  const totalChars = filteredSections.reduce((sum, s) => sum + (s.charCount || 0), 0);
  if (totalChars > 0) {
    for (const section of filteredSections) {
      section.contentRatio = Math.round(((section.charCount || 0) / totalChars) * 100) / 100;
    }
  }

  return {
    sections: filteredSections,
    stylePreset: detectedPreset,
    avgParagraphsPerSection: avgParagraphs,
    totalParagraphs: paragraphs.length,
    totalTables: tables.length,
    totalCharacters: totalChars,
  };
}

/**
 * Extract a structural blueprint from a PDF file.
 * Uses text-based heading detection since we don't have XML structure.
 *
 * @param {string} filePath - Path to the PDF file
 * @returns {Promise<Object>} Extracted blueprint structure
 */
export async function extractBlueprintFromPdf(filePath) {
  const result = await documentProcessor.processDocument(filePath, "indepth");
  if (!result.success) {
    throw new Error(`Failed to process PDF: ${result.error || "unknown error"}`);
  }

  const structure = result.structure || [];
  const text = result.text || "";
  const lines = text.split("\n");

  // Use the structure info (headings detected by parser)
  const sections = structure
    .filter(s => s.level !== undefined && s.text)
    .map(s => ({
      heading: s.level === 1 ? "heading1" : s.level === 2 ? "heading2" : "heading3",
      pattern: s.text.trim(),
      required: true,
      hasTable: false,
      tableShape: null,
      paragraphCount: 0,
    }));

  // Estimate paragraph counts between headings
  if (sections.length > 0) {
    for (let i = 0; i < sections.length; i++) {
      const startLine = lines.findIndex(l => l.includes(sections[i].pattern));
      const endLine = i + 1 < sections.length
        ? lines.findIndex(l => l.includes(sections[i + 1].pattern))
        : lines.length;

      if (startLine >= 0 && endLine > startLine) {
        sections[i].paragraphCount = lines.slice(startLine + 1, endLine)
          .filter(l => l.trim().length > 0).length;
      }
    }
  }

  const sectionParagraphs = sections.filter(s => s.paragraphCount > 0);
  const avgParagraphs = sectionParagraphs.length > 0
    ? Math.round(sectionParagraphs.reduce((sum, s) => sum + s.paragraphCount, 0) / sectionParagraphs.length)
    : 3;

  return {
    sections,
    stylePreset: "minimal",
    avgParagraphsPerSection: avgParagraphs,
    totalParagraphs: lines.filter(l => l.trim().length > 0).length,
    totalTables: 0,
  };
}

/**
 * Validate that a set of paragraphs matches a blueprint's expected structure.
 *
 * @param {Array} paragraphs - Paragraphs to validate (from create-doc input)
 * @param {Object} blueprint - Blueprint to validate against
 * @returns {Object} Validation result with missing/extra sections
 */
export function validateAgainstBlueprint(paragraphs, blueprint) {
  if (!blueprint || !blueprint.sections || blueprint.sections.length === 0) {
    return { valid: true, errors: [], warnings: [] };
  }

  const errors = [];
  const warnings = [];

  // Extract headings from paragraphs
  const providedHeadings = paragraphs
    .filter(p => p && typeof p === "object" && p.headingLevel)
    .map(p => ({
      level: p.headingLevel,
      text: (p.text || "").trim().toLowerCase(),
    }));

  // Check required sections
  for (const section of blueprint.sections) {
    if (!section.required) continue;

    const pattern = section.pattern.toLowerCase();
    const found = providedHeadings.some(h =>
      h.level === section.heading && (
        h.text.includes(pattern) ||
        pattern.includes(h.text) ||
        levenshteinSimilarity(h.text, pattern) > 0.6
      )
    );

    if (!found) {
      errors.push({
        type: "missing-section",
        heading: section.heading,
        expectedPattern: section.pattern,
        message: `Required section "${section.pattern}" (${section.heading}) is missing.`,
      });
    }
  }

  // Check for table requirements
  for (const section of blueprint.sections) {
    if (!section.hasTable) continue;

    const sectionIdx = providedHeadings.findIndex(h => {
      const pattern = section.pattern.toLowerCase();
      return h.text.includes(pattern) || pattern.includes(h.text);
    });

    if (sectionIdx >= 0) {
      warnings.push({
        type: "table-expected",
        section: section.pattern,
        expectedShape: section.tableShape,
        message: `Section "${section.pattern}" typically includes a table (${section.tableShape?.[0]}x${section.tableShape?.[1]}).`,
      });
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    matchedSections: providedHeadings.length,
    expectedSections: blueprint.sections.filter(s => s.required).length,
  };
}

/**
 * Simple Levenshtein-based similarity (0-1 range)
 */
function levenshteinSimilarity(a, b) {
  if (a === b) return 1;
  if (a.length === 0 || b.length === 0) return 0;

  const matrix = [];
  for (let i = 0; i <= b.length; i++) matrix[i] = [i];
  for (let j = 0; j <= a.length; j++) matrix[0][j] = j;

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      const cost = b[i - 1] === a[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost,
      );
    }
  }

  const maxLen = Math.max(a.length, b.length);
  return 1 - matrix[b.length][a.length] / maxLen;
}
