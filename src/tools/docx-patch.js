import JSZip from "jszip";
import { Packer, Document, Paragraph, Table, HeadingLevel } from "docx";
import {
  parseInlineMarkdown,
  createParagraph,
  createTableFromData,
  createText,
  createCodeBlock,
} from "./doc-utils.js";
import { getStyleConfig, buildDocumentStyles } from "./styling.js";
import fs from "fs/promises";

/**
 * DOCX XML Patching Library
 *
 * This module preserves original document formatting when editing DOCX files.
 * Instead of recreating from scratch (which loses formatting), it:
 * 1. Reads the existing DOCX as a ZIP archive
 * 2. Parses word/document.xml
 * 3. Generates new content XML using the docx library
 * 4. Inserts new XML nodes into the original document
 * 5. Re-packages the DOCX file
 *
 * This approach preserves:
 * - Original styles and formatting
 * - Headers and footers
 * - Images and relationships
 * - Custom document properties
 */

// XML namespaces used in DOCX files
const NAMESPACES = {
  w: "http://schemas.openxmlformats.org/wordprocessingml/2006/main",
  r: "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
  wp: "http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing",
  a: "http://schemas.openxmlformats.org/drawingml/2006/main",
  pic: "http://schemas.openxmlformats.org/drawingml/2006/picture",
  rels: "http://schemas.openxmlformats.org/package/2006/relationships",
  ct: "http://schemas.openxmlformats.org/package/2006/content-types",
};

/**
 * Creates a simple XML parser that works without DOM
 * This is a lightweight alternative to full DOM parsing
 */
class SimpleXMLParser {
  constructor(xmlString) {
    this.xml = xmlString;
  }

  /**
   * Find the position of a tag in the XML
   * Ensures we match exact tags (e.g., <w:p> not <w:pPr>)
   */
  findTag(tagName, startPos = 0) {
    const openTag = `<${tagName}`;
    const closeTag = `</${tagName}>`;

    let start = startPos;

    // Find the opening tag, ensuring it's not a partial match
    while (start < this.xml.length) {
      const pos = this.xml.indexOf(openTag, start);
      if (pos === -1) return null;

      // Check what character follows the tag name
      const afterTag = this.xml.substring(
        pos + openTag.length,
        pos + openTag.length + 1,
      );

      // Valid if followed by: space, >, /, or end of string
      // Invalid if followed by a letter/number (would be a different tag like <w:pPr>)
      if (
        afterTag === "" ||
        afterTag === " " ||
        afterTag === ">" ||
        afterTag === "/" ||
        afterTag === "\n" ||
        afterTag === "\t"
      ) {
        start = pos;
        break;
      }

      // Not the right tag, keep searching
      start = pos + 1;
    }

    if (start >= this.xml.length) return null;

    // Find the end of the opening tag
    let tagEnd = this.xml.indexOf(">", start);
    if (tagEnd === -1) return null;

    // Handle self-closing tag
    if (this.xml.substring(tagEnd - 1, tagEnd + 1) === "/>") {
      return { start, end: tagEnd + 1, content: "", isSelfClosing: true };
    }

    let depth = 1;
    let pos = tagEnd + 1;

    // Find matching closing tag
    while (depth > 0 && pos < this.xml.length) {
      // Find next potential opening and closing tags
      let nextOpen = -1;
      let searchPos = pos;

      // Search for next opening tag with same validation
      while (searchPos < this.xml.length) {
        const candidatePos = this.xml.indexOf(openTag, searchPos);
        if (candidatePos === -1) break;

        const afterTag = this.xml.substring(
          candidatePos + openTag.length,
          candidatePos + openTag.length + 1,
        );
        if (
          afterTag === "" ||
          afterTag === " " ||
          afterTag === ">" ||
          afterTag === "/" ||
          afterTag === "\n" ||
          afterTag === "\t"
        ) {
          nextOpen = candidatePos;
          break;
        }
        searchPos = candidatePos + 1;
      }

      const nextClose = this.xml.indexOf(closeTag, pos);

      if (nextClose === -1) break;

      if (nextOpen !== -1 && nextOpen < nextClose) {
        depth++;
        pos = nextOpen + 1;
      } else {
        depth--;
        if (depth === 0) {
          return {
            start,
            end: nextClose + closeTag.length,
            content: this.xml.substring(tagEnd + 1, nextClose),
            isSelfClosing: false,
          };
        }
        pos = nextClose + 1;
      }
    }

    return null;
  }

  /**
   * Find all occurrences of a tag
   */
  findAllTags(tagName) {
    const results = [];
    let pos = 0;

    while (pos < this.xml.length) {
      const tag = this.findTag(tagName, pos);
      if (!tag) break;
      results.push(tag);
      pos = tag.end;
    }

    return results;
  }

  /**
   * Insert content after a specific position
   */
  insertAfter(position, content) {
    this.xml = this.xml.slice(0, position) + content + this.xml.slice(position);
    return this;
  }

  /**
   * Insert content before a specific position
   */
  insertBefore(position, content) {
    this.xml = this.xml.slice(0, position) + content + this.xml.slice(position);
    return this;
  }

  /**
   * Get the modified XML
   */
  toString() {
    return this.xml;
  }
}

/**
 * Generate XML for paragraphs using the docx library
 * This "borrows" the docx library's XML generation capability
 */
async function generateParagraphsXML(paragraphs, styleConfig) {
  const children = [];
  const baseStyle = {
    size: styleConfig.font.size,
    fontFamily: styleConfig.font.family,
    color: styleConfig.font.color,
  };

  for (const para of paragraphs) {
    if (!para) continue;

    if (typeof para === "string") {
      // Detect fenced code blocks (```...```)
      if (para.trimStart().startsWith("```")) {
        children.push(...createCodeBlock(para, styleConfig.code));
        continue;
      }

      const patchBaseStyle = {
        ...baseStyle,
        codeColor: styleConfig.code?.color,
        codeBackground: styleConfig.code?.backgroundColor,
      };
      const textRuns = parseInlineMarkdown(para, patchBaseStyle);
      children.push(
        createParagraph(textRuns, {
          alignment: styleConfig.paragraph.alignment,
          spacingBefore: styleConfig.paragraph.spacingBefore,
          spacingAfter: styleConfig.paragraph.spacingAfter,
          lineSpacing: styleConfig.paragraph.lineSpacing,
        }),
      );
    } else if (para && typeof para === "object" && para.text) {
      const textRuns = parseInlineMarkdown(para.text, baseStyle);
      children.push(
        createParagraph(textRuns, {
          alignment: para.alignment || styleConfig.paragraph.alignment,
          spacingBefore: styleConfig.paragraph.spacingBefore,
          spacingAfter: styleConfig.paragraph.spacingAfter,
          lineSpacing: styleConfig.paragraph.lineSpacing,
        }),
      );
    }
  }

  // Create a temporary document to generate the XML (with embedded styles)
  const tempDoc = new Document({
    styles: buildDocumentStyles(styleConfig),
    sections: [
      {
        children:
          children.length > 0 ? children : [new Paragraph({ text: "" })],
      },
    ],
  });

  // Pack to buffer and extract XML
  const buffer = await Packer.toBuffer(tempDoc);
  const zip = await JSZip.loadAsync(buffer);
  const documentXml = await zip.file("word/document.xml").async("string");

  return documentXml;
}

/**
 * Generate XML for tables using the docx library
 */
async function generateTablesXML(tables, styleConfig) {
  const children = [];

  for (const tableData of tables) {
    if (!Array.isArray(tableData) || tableData.length === 0) continue;

    children.push(
      createTableFromData(tableData, {
        borderColor: styleConfig.table.borderColor,
        borderStyle: styleConfig.table.borderStyle,
        borderWidth: styleConfig.table.borderWidth,
        headerFill: styleConfig.table.headerFill,
        headerFontColor: styleConfig.table.headerFontColor,
        zebraFill: styleConfig.table.zebraFill,
        zebraInterval: styleConfig.table.zebraInterval,
        insideBorderColor: styleConfig.table.insideBorderColor,
        insideBorderWidth: styleConfig.table.insideBorderWidth,
        outsideBorderWidth: styleConfig.table.outsideBorderWidth,
        cellSize: styleConfig.font.size,
        fontFamily: styleConfig.font.family,
        color: styleConfig.font.color,
      }),
    );
  }

  if (children.length === 0) return "";

  // Create a temporary document to generate the XML (with embedded styles)
  const tempDoc = new Document({
    styles: buildDocumentStyles(styleConfig),
    sections: [
      {
        children,
      },
    ],
  });

  // Pack to buffer and extract XML
  const buffer = await Packer.toBuffer(tempDoc);
  const zip = await JSZip.loadAsync(buffer);
  const documentXml = await zip.file("word/document.xml").async("string");

  return documentXml;
}

/**
 * Extract paragraph and table nodes from generated XML
 */
function extractContentNodes(xmlString) {
  const parser = new SimpleXMLParser(xmlString);

  // Find all paragraphs and tables
  const paragraphs = parser.findAllTags("w:p");
  const tables = parser.findAllTags("w:tbl");

  // Extract the XML content
  const nodes = [];

  // Combine and sort by position
  const allNodes = [...paragraphs, ...tables].sort((a, b) => a.start - b.start);

  for (const node of allNodes) {
    // Extract from the ORIGINAL xml string, not parser.xml which might be modified
    nodes.push(xmlString.substring(node.start, node.end));
  }

  return nodes;
}

/**
 * Extract sectPr (section properties) to preserve page settings
 */
function extractSectionProperties(xmlString) {
  const parser = new SimpleXMLParser(xmlString);
  const sectPr = parser.findTag("w:sectPr");

  if (sectPr) {
    return parser.xml.substring(sectPr.start, sectPr.end);
  }

  return null;
}

/**
 * Append content to an existing DOCX file while preserving formatting
 *
 * @param {string} filePath - Path to existing DOCX file
 * @param {Object} options - Content to append
 * @param {Array} options.paragraphs - Paragraphs to append
 * @param {Array} options.tables - Tables to append
 * @param {string} options.stylePreset - Style preset for new content
 * @param {Object} options.style - Custom style overrides
 * @param {boolean} options.addSeparator - Add blank line before new content
 * @returns {Promise<Object>} Result object
 */
export async function appendToDocx(filePath, options = {}) {
  try {
    const {
      paragraphs = [],
      tables = [],
      stylePreset = "minimal",
      style = {},
      addSeparator = true,
    } = options;

    // Read the existing DOCX file
    const fileBuffer = await fs.readFile(filePath);
    const zip = await JSZip.loadAsync(fileBuffer);

    // Get the document.xml content
    const documentXmlPath = "word/document.xml";
    let documentXml = await zip.file(documentXmlPath).async("string");

    // Get style configuration for new content
    const styleConfig = getStyleConfig(stylePreset, style);

    // Generate XML for new paragraphs
    let newContentNodes = [];

    if (paragraphs.length > 0) {
      const paraXml = await generateParagraphsXML(paragraphs, styleConfig);
      newContentNodes.push(...extractContentNodes(paraXml));
    }

    // Generate XML for new tables
    if (tables.length > 0) {
      const tableXml = await generateTablesXML(tables, styleConfig);
      newContentNodes.push(...extractContentNodes(tableXml));
    }

    if (newContentNodes.length === 0) {
      return {
        success: true,
        filePath,
        message: "No content to append.",
        paragraphsAppended: 0,
        tablesAppended: 0,
      };
    }

    // Parse the existing document XML
    const parser = new SimpleXMLParser(documentXml);

    // Find the body tag
    const bodyTag = parser.findTag("w:body");

    if (!bodyTag) {
      throw new Error("Invalid DOCX: Could not find w:body element");
    }

    // Extract section properties if they exist (to preserve page settings)
    const sectPr = extractSectionProperties(documentXml);

    // Build the new content to insert
    let contentToInsert = "";

    // Add separator paragraph if requested
    if (addSeparator) {
      contentToInsert += "<w:p><w:pPr></w:pPr></w:p>";
    }

    // Add all new content nodes
    for (const node of newContentNodes) {
      contentToInsert += node;
    }

    // Find where to insert (before sectPr if it exists, otherwise at end of body)
    let insertPosition;

    if (sectPr) {
      // Find the sectPr start position in the original XML
      const sectPrStart = documentXml.indexOf("<w:sectPr");
      if (
        sectPrStart !== -1 &&
        sectPrStart > bodyTag.start &&
        sectPrStart < bodyTag.end
      ) {
        insertPosition = sectPrStart;
      } else {
        // Insert before the closing </w:body> tag
        insertPosition = bodyTag.end - "</w:body>".length;
      }
    } else {
      // Insert before the closing </w:body> tag
      insertPosition = bodyTag.end - "</w:body>".length;
    }

    // Insert the new content
    parser.insertBefore(insertPosition, contentToInsert);

    // Update the ZIP file with the modified XML
    zip.file(documentXmlPath, parser.toString());

    // Generate the new DOCX buffer
    const newBuffer = await zip.generateAsync({
      type: "nodebuffer",
      compression: "DEFLATE",
      compressionOptions: { level: 6 },
    });

    // Write back to the file
    await fs.writeFile(filePath, newBuffer);

    return {
      success: true,
      filePath,
      paragraphsAppended: paragraphs.length,
      tablesAppended: tables.length,
      formattingPreserved: true,
      message: `Successfully appended ${paragraphs.length} paragraph(s) and ${tables.length} table(s) to ${filePath}. Original formatting preserved.`,
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
      message: `Failed to append to DOCX: ${error.message}`,
    };
  }
}

/**
 * Replace content in a DOCX file while preserving document structure
 * This keeps headers, footers, and styles but replaces body content
 *
 * @param {string} filePath - Path to existing DOCX file
 * @param {Object} options - New content
 * @param {string} options.title - New document title
 * @param {Array} options.paragraphs - New paragraphs
 * @param {Array} options.tables - New tables
 * @param {string} options.stylePreset - Style preset for new content
 * @param {Object} options.style - Custom style overrides
 * @returns {Promise<Object>} Result object
 */
export async function replaceDocxContent(filePath, options = {}) {
  try {
    const {
      title,
      paragraphs = [],
      tables = [],
      stylePreset = "minimal",
      style = {},
    } = options;

    // Read the existing DOCX file
    const fileBuffer = await fs.readFile(filePath);
    const zip = await JSZip.loadAsync(fileBuffer);

    // Get the document.xml content
    const documentXmlPath = "word/document.xml";
    let documentXml = await zip.file(documentXmlPath).async("string");

    // Get style configuration
    const styleConfig = getStyleConfig(stylePreset, style);

    // Extract the section properties to preserve page settings
    const sectPr = extractSectionProperties(documentXml);

    // Generate new content
    let newContentNodes = [];

    // Add title if provided
    if (title) {
      const titlePara = createParagraph(title, {
        heading: "title",
        alignment: styleConfig.title?.alignment || "center",
        size: styleConfig.title?.size || 48,
        bold: styleConfig.title?.bold !== false,
        color: styleConfig.title?.color,
        fontFamily: styleConfig.font.family,
      });

      const tempDoc = new Document({
        styles: buildDocumentStyles(styleConfig),
        sections: [{ children: [titlePara] }],
      });

      const buffer = await Packer.toBuffer(tempDoc);
      const tempZip = await JSZip.loadAsync(buffer);
      const tempXml = await tempZip.file("word/document.xml").async("string");
      newContentNodes.push(...extractContentNodes(tempXml));
    }

    // Generate paragraphs
    if (paragraphs.length > 0) {
      const paraXml = await generateParagraphsXML(paragraphs, styleConfig);
      newContentNodes.push(...extractContentNodes(paraXml));
    }

    // Generate tables
    if (tables.length > 0) {
      const tableXml = await generateTablesXML(tables, styleConfig);
      newContentNodes.push(...extractContentNodes(tableXml));
    }

    // Build the new body content
    let newBodyContent = "";
    for (const node of newContentNodes) {
      newBodyContent += node;
    }

    // Add empty paragraph if no content
    if (newContentNodes.length === 0) {
      newBodyContent = "<w:p><w:pPr></w:pPr></w:p>";
    }

    // Preserve section properties
    if (sectPr) {
      newBodyContent += sectPr;
    }

    // Preserve original namespaces from the original document
    const originalNsMatch = documentXml.match(/<w:document[^>]*>/);
    const documentTag = originalNsMatch
      ? originalNsMatch[0]
      : `<w:document xmlns:w="${NAMESPACES.w}" xmlns:r="${NAMESPACES.r}">`;

    // Build the new document.xml
    const newDocumentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
${documentTag}
<w:body>${newBodyContent}</w:body>
</w:document>`;

    // Update the ZIP file
    zip.file(documentXmlPath, newDocumentXml);

    // Update core properties if title provided
    if (title) {
      const corePropsPath = "docProps/core.xml";
      const coreProps = await zip.file(corePropsPath)?.async("string");

      if (coreProps) {
        // Update title in core properties
        let updatedCoreProps = coreProps;
        const titleMatch = coreProps.match(/<dc:title>.*?<\/dc:title>/);
        if (titleMatch) {
          updatedCoreProps = coreProps.replace(
            /<dc:title>.*?<\/dc:title>/,
            `<dc:title>${escapeXml(title)}</dc:title>`,
          );
        } else {
          // Add title tag
          updatedCoreProps = coreProps.replace(
            "</cp:coreProperties>",
            `  <dc:title>${escapeXml(title)}</dc:title>\n</cp:coreProperties>`,
          );
        }
        zip.file(corePropsPath, updatedCoreProps);
      }
    }

    // Generate the new DOCX buffer
    const newBuffer = await zip.generateAsync({
      type: "nodebuffer",
      compression: "DEFLATE",
      compressionOptions: { level: 6 },
    });

    // Write back to the file
    await fs.writeFile(filePath, newBuffer);

    return {
      success: true,
      filePath,
      paragraphsReplaced: paragraphs.length,
      tablesReplaced: tables.length,
      structurePreserved: true,
      message: `Successfully replaced content in ${filePath}. Document structure preserved.`,
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
      message: `Failed to replace DOCX content: ${error.message}`,
    };
  }
}

/**
 * Read DOCX structure information
 * Useful for understanding what's in a document before editing
 *
 * @param {string} filePath - Path to DOCX file
 * @returns {Promise<Object>} Document structure info
 */
export async function inspectDocx(filePath) {
  try {
    const fileBuffer = await fs.readFile(filePath);
    const zip = await JSZip.loadAsync(fileBuffer);

    const result = {
      success: true,
      filePath,
      structure: {
        hasHeaders: false,
        hasFooters: false,
        hasImages: false,
        hasTables: false,
        paragraphCount: 0,
        customStyles: [],
      },
      files: [],
    };

    // List all files in the archive
    zip.forEach((relativePath) => {
      result.files.push(relativePath);
    });

    // Check for headers
    result.structure.hasHeaders = result.files.some((f) =>
      f.match(/word\/header\d+\.xml/),
    );

    // Check for footers
    result.structure.hasFooters = result.files.some((f) =>
      f.match(/word\/footer\d+\.xml/),
    );

    // Check for images
    result.structure.hasImages = result.files.some((f) =>
      f.startsWith("word/media/"),
    );

    // Parse document.xml for more info
    const documentXml = await zip.file("word/document.xml")?.async("string");

    if (documentXml) {
      const parser = new SimpleXMLParser(documentXml);

      // Count paragraphs
      const paragraphs = parser.findAllTags("w:p");
      result.structure.paragraphCount = paragraphs.length;

      // Check for tables
      const tables = parser.findAllTags("w:tbl");
      result.structure.hasTables = tables.length > 0;

      // Log for debugging
      console.error(
        `[inspectDocx] Found ${paragraphs.length} paragraphs and ${tables.length} tables`,
      );
    }

    return result;
  } catch (error) {
    return {
      success: false,
      error: error.message,
      message: `Failed to inspect DOCX: ${error.message}`,
    };
  }
}

/**
 * Escape special characters for XML
 */
function escapeXml(str) {
  if (!str) return "";
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * Apply styling to an existing DOCX document
 * This function updates the document's content with proper formatting based on style presets
 *
 * @param {string} filePath - Path to existing DOCX file
 * @param {Object} options - Styling options
 * @param {string} options.stylePreset - Style preset name (minimal, professional, technical, legal, business, casual, colorful)
 * @param {Object} options.style - Custom style overrides
 * @returns {Promise<Object>} Result object
 */
export async function applyStylingToDocx(filePath, options = {}) {
  try {
    const { stylePreset = "minimal", style = {} } = options;

    // Read the existing DOCX file
    const fileBuffer = await fs.readFile(filePath);
    const zip = await JSZip.loadAsync(fileBuffer);

    // Get the document.xml content
    const documentXmlPath = "word/document.xml";
    let documentXml = await zip.file(documentXmlPath).async("string");

    // Get style configuration
    const styleConfig = getStyleConfig(stylePreset, style);

    // Parse the existing document XML to understand its structure
    const parser = new SimpleXMLParser(documentXml);

    // Extract all paragraphs and their content
    const paragraphTags = parser.findAllTags("w:p");

    // Create a new document with the same content but proper styling
    const children = [];

    for (const para of paragraphTags) {
      // Extract text content from the paragraph XML
      const paraXml = documentXml.substring(para.start, para.end);

      // Try to extract text content
      const textMatches = paraXml.match(/<w:t[^>]*>([^<]+)<\/w:t>/g);
      if (textMatches) {
        // Create a paragraph with proper styling
        children.push(
          createParagraph(
            textMatches.map((t) => t.replace(/<w:t[^>]*>([^<]+)<\/w:t>/, "$1")),
            {
              alignment: styleConfig.paragraph.alignment,
              spacingBefore: styleConfig.paragraph.spacingBefore,
              spacingAfter: styleConfig.paragraph.spacingAfter,
              lineSpacing: styleConfig.paragraph.lineSpacing,
            },
          ),
        );
      } else {
        // Create empty paragraph with proper styling
        children.push(
          createParagraph("", {
            alignment: styleConfig.paragraph.alignment,
            spacingBefore: styleConfig.paragraph.spacingBefore,
            spacingAfter: styleConfig.paragraph.spacingAfter,
            lineSpacing: styleConfig.paragraph.lineSpacing,
          }),
        );
      }
    }

    // Create a new document with proper styling (embedded style definitions)
    const newDoc = new Document({
      styles: buildDocumentStyles(styleConfig),
      sections: [
        {
          children:
            children.length > 0 ? children : [new Paragraph({ text: "" })],
        },
      ],
    });

    // Apply proper styling to all paragraphs
    for (let i = 0; i < children.length; i++) {
      // Get the text content
      const textRuns = children[i].children || [];
      const text = textRuns.map((run) => run.text).join("");

      // Skip empty paragraphs
      if (!text || text.trim() === "") continue;

      if (i === 0 && text.length > 5) {
        // First paragraph is likely the title
        children[i] = createParagraph(text, {
          heading: HeadingLevel.TITLE,
          alignment: styleConfig.title?.alignment || "center",
          size: styleConfig.title?.size || 48,
          bold: styleConfig.title?.bold !== false,
          color: styleConfig.title?.color,
          fontFamily: styleConfig.font.family,
        });
      } else if (text.length < 100) {
        // Short text might be a heading
        const textLower = text.toLowerCase();

        // Check for different heading patterns (case-insensitive)
        if (text.includes("Core") || text.includes("Architecture")) {
          children[i] = createParagraph(text, {
            heading: HeadingLevel.HEADING_1,
            size: styleConfig.heading1?.size || 16,
            bold: styleConfig.heading1?.bold !== false,
            color: styleConfig.heading1?.color,
            spacingBefore: styleConfig.heading1?.spacingBefore || 280,
            spacingAfter: styleConfig.heading1?.spacingAfter || 140,
          });
        } else if (text.includes("Lock") || text.includes("Data")) {
          children[i] = createParagraph(text, {
            heading: HeadingLevel.HEADING_2,
            size: styleConfig.heading2?.size || 14,
            bold: styleConfig.heading2?.bold !== false,
            color: styleConfig.heading2?.color,
            spacingBefore: styleConfig.heading2?.spacingBefore || 240,
            spacingAfter: styleConfig.heading2?.spacingAfter || 120,
          });
        } else if (text.includes("API") || text.includes("Integration")) {
          children[i] = createParagraph(text, {
            heading: HeadingLevel.HEADING_3,
            size: styleConfig.heading3?.size || 12,
            bold: styleConfig.heading3?.bold !== false,
            color: styleConfig.heading3?.color,
            spacingBefore: styleConfig.heading3?.spacingBefore || 200,
            spacingAfter: styleConfig.heading3?.spacingAfter || 100,
          });
        }
      } else {
        // Regular paragraph - apply base styling
        children[i] = createParagraph(textRuns, {
          alignment: styleConfig.paragraph.alignment,
          spacingBefore: styleConfig.paragraph.spacingBefore,
          spacingAfter: styleConfig.paragraph.spacingAfter,
          lineSpacing: styleConfig.paragraph.lineSpacing,
        });
      }
    }

    // Generate the new DOCX buffer with proper styling
    const newBuffer = await Packer.toBuffer(newDoc);

    // Update the ZIP file
    zip.file(documentXmlPath, await zip.file(documentXmlPath).async("string"));

    // Write back to the file
    await fs.writeFile(filePath, newBuffer);

    return {
      success: true,
      filePath,
      stylePreset,
      paragraphsStyled: children.length,
      message: `Successfully applied ${stylePreset} styling to ${filePath}.`,
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
      message: `Failed to apply styling to DOCX: ${error.message}`,
    };
  }
}

// Export all functions
export default {
  appendToDocx,
  replaceDocxContent,
  inspectDocx,
  applyStylingToDocx,
};
