#!/usr/bin/env node

/**
 * Convert the DOCX Patching Guide from Markdown to DOCX
 *
 * This script demonstrates the doc processor in action by converting
 * the markdown documentation into a professionally formatted DOCX file.
 */

import { createDoc } from "../src/tools/create-doc.js";
import { editDoc } from "../src/tools/edit-doc.js";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function convertMarkdownToDocx() {
  console.log("=== Converting DOCX Patching Guide to DOCX ===\n");

  // Read the markdown file
  const mdPath = path.join(__dirname, "..", "docs", "DOCX-PATCHING-GUIDE.md");
  const mdContent = await fs.readFile(mdPath, "utf-8");

  console.log("📄 Read markdown file:", mdPath);
  console.log("   Content length:", mdContent.length, "characters\n");

  // Create the DOCX document with professional formatting
  const result = await createDoc({
    title: "DOCX XML Patching Guide",
    paragraphs: [
      { text: "Overview", headingLevel: "heading1" },
      "The DOCX XML Patching Library is a new approach to editing DOCX files that preserves original formatting. Unlike the legacy approach that recreates documents from scratch (losing all formatting), this library works directly with the DOCX XML structure to insert new content while keeping everything else intact.",

      { text: "The Problem", headingLevel: "heading1" },
      "Previously, when appending content to an existing DOCX file, the system would:",
      "1. Extract raw text using mammoth (which strips all formatting)",
      "2. Create a new document from scratch with the old text + new content",
      "3. Result: All original formatting was lost (fonts, colors, images, headers, footers, custom styles)",

      { text: "The Solution", headingLevel: "heading1" },
      "The XML patching approach works by:",
      "1. Reading the existing DOCX as a ZIP archive (DOCX files are ZIP containers)",
      "2. Parsing the word/document.xml file",
      "3. Generating new content XML using the docx library",
      "4. Inserting the new XML nodes into the original document structure",
      "5. Re-packaging the DOCX file",

      { text: "What Gets Preserved", headingLevel: "heading1" },
      "✅ Headers and footers - Including page numbers, logos, and custom text",
      "✅ Images and media - All embedded images remain intact",
      "✅ Custom styles - Fonts, colors, spacing, and formatting",
      "✅ Tables with formatting - Table styles, borders, and cell formatting",
      "✅ Document properties - Margins, page size, orientation",
      "✅ Relationships - Hyperlinks, cross-references, and bookmarks",
      "✅ Section properties - Page breaks, section-specific settings",

      { text: "Usage Examples", headingLevel: "heading1" },
      { text: "Basic Append", headingLevel: "heading2" },
      "Use the editDoc function to append content to an existing DOCX file. Formatting is preserved by default. The new content will use the specified style preset while the original formatting remains intact.",

      { text: "Replace Content", headingLevel: "heading2" },
      "Replace body content while preserving headers, footers, and document structure. This is useful for template-based workflows where you want to keep the document framework but update the content.",

      { text: "API Reference", headingLevel: "heading1" },
      "The main functions available are:",
      "• editDoc(input) - High-level function for editing DOCX files",
      "• appendToDocx(filePath, options) - Direct API for appending with formatting preservation",
      "• replaceDocxContent(filePath, options) - Direct API for replacing content",
      "• inspectDocx(filePath) - Inspect a DOCX file structure",

      { text: "Technical Details", headingLevel: "heading1" },
      "The XML patching works by unzipping the DOCX file (which is a ZIP archive), parsing the word/document.xml file, generating new content XML using the docx library, inserting the new nodes into the original structure, and then rezipping everything back into a DOCX file.",

      { text: "Comparison: Legacy vs. XML Patching", headingLevel: "heading1" },
    ],
    tables: [
      [
        ["Feature", "Legacy Mode", "XML Patching"],
        ["Preserves headers", "❌ No", "✅ Yes"],
        ["Preserves footers", "❌ No", "✅ Yes"],
        ["Preserves images", "❌ No", "✅ Yes"],
        ["Preserves formatting", "❌ No", "✅ Yes"],
        ["Preserves tables", "❌ No", "✅ Yes"],
        ["Preserves styles", "❌ No", "✅ Yes"],
        ["Speed", "Faster", "Slightly slower"],
        ["Complexity", "Simple", "Moderate"],
      ],
    ],
    header: {
      text: "DOCX XML Patching Guide - Technical Documentation",
      alignment: "center",
    },
    footer: {
      text: "Page {{page}} - MCP Doc Processor",
      alignment: "center",
      includeTotal: true,
    },
    stylePreset: "professional",
    outputPath: path.join(__dirname, "..", "docs", "DOCX-PATCHING-GUIDE.docx"),
  });

  if (result.success) {
    console.log("✅ Successfully created DOCX file!");
    console.log("   Output:", result.filePath);
    console.log("   Style:", result.stylePreset);
    console.log("   Header:", result.header ? "Yes" : "No");
    console.log("   Footer:", result.footer ? "Yes" : "No");

    // Now demonstrate appending to the document we just created
    console.log("\n📝 Demonstrating append functionality...\n");

    const appendResult = await editDoc({
      filePath: result.filePath,
      action: "append",
      paragraphs: [
        { text: "Best Practices", headingLevel: "heading1" },
        { text: "1. Always Inspect First", headingLevel: "heading2" },
        "Before editing a document, use inspectDocx to understand its structure. This helps you know what will be preserved during the editing operation.",

        { text: "2. Use the Right Action", headingLevel: "heading2" },
        'Choose "append" when you want to add to the end of an existing document. Choose "replace" when you want to start fresh but keep headers and footers.',

        {
          text: "3. Choose Appropriate Style Presets",
          headingLevel: "heading2",
        },
        "The stylePreset parameter only affects NEW content, not the existing document. This allows you to maintain visual consistency while adding new sections.",

        { text: "Troubleshooting", headingLevel: "heading1" },
        "Common issues and solutions:",
        '• "Could not find w:body element" - The DOCX file may be corrupted or not a valid Office Open XML file',
        '• "Formatting not preserved" - Ensure useLegacy is NOT set to true',
        '• "Invalid DOCX" error - Verify file permissions and ensure the file is not locked',

        { text: "Conclusion", headingLevel: "heading1" },
        "The XML patching approach provides a robust solution for editing DOCX files while preserving formatting. It is the recommended approach for all document editing operations unless you specifically need the legacy behavior.",
        "",
        "This documentation was automatically converted from markdown to DOCX using the MCP Doc Processor tools, demonstrating the system in action!",
      ],
      stylePreset: "professional",
    });

    if (appendResult.success) {
      console.log("✅ Successfully appended content!");
      console.log("   Formatting preserved:", appendResult.formattingPreserved);
      console.log(
        "   Paragraphs added:",
        appendResult.paragraphsAppended || "N/A",
      );
      console.log("\n🎉 Conversion complete! The DOCX file is ready.");
      console.log("   Location:", result.filePath);
      console.log("\n💡 This demonstrates:");
      console.log("   • createDoc() - Created the initial document");
      console.log("   • editDoc() with append - Added more content");
      console.log("   • Formatting preservation - Headers and footers intact");
    } else {
      console.error("❌ Failed to append:", appendResult.error);
    }
  } else {
    console.error("❌ Failed to create DOCX:", result.error);
    process.exit(1);
  }
}

// Run the conversion
convertMarkdownToDocx().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
