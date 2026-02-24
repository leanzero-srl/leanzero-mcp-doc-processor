/**
 * Test script for the new DOCX XML patching functionality
 *
 * This tests that we can:
 * 1. Append content to existing DOCX files while preserving formatting
 * 2. Replace content while preserving document structure
 * 3. Inspect DOCX files to understand their structure
 */

import { describe, test, before } from "node:test";
import assert from "node:assert/strict";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { createDoc } from "../src/tools/create-doc.js";
import { editDoc } from "../src/tools/edit-doc.js";
import {
  appendToDocx,
  replaceDocxContent,
  inspectDocx,
} from "../src/tools/docx-patch.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const testDir = path.join(__dirname, "test-output");

before(async () => {
  console.error("\n=== Setting up test environment ===");
  try {
    await fs.mkdir(testDir, { recursive: true });
    console.error(`Created test directory: ${testDir}`);
  } catch (err) {
    if (err.code !== "EEXIST") throw err;
  }
});

describe("Test 1-4: Create, inspect, append, and verify formatted document", () => {
  let formattedDocPath;

  test("Test 1: Create formatted document", async () => {
    const result = await createDoc({
      title: "Test Document",
      paragraphs: [
        "This is a test document with formatting.",
        "It has **bold** and *italic* text.",
        { text: "A styled paragraph", headingLevel: "heading1" },
      ],
      tables: [
        [
          ["Header 1", "Header 2"],
          ["Cell 1", "Cell 2"],
        ],
      ],
      header: { text: "Test Header", alignment: "center" },
      footer: { text: "Page {{page}}", alignment: "center" },
      stylePreset: "professional",
      outputPath: path.join(testDir, "formatted-test.docx"),
      preventDuplicates: false,
    });

    assert.ok(result.success, "Document created successfully");
    assert.ok(
      result.filePath.includes("formatted-test") &&
        result.filePath.endsWith(".docx"),
      "File path is correct",
    );
    assert.ok(result.header !== null, "Header was added");
    assert.ok(result.footer !== null, "Footer was added");

    // Verify file exists
    const stats = await fs.stat(result.filePath);
    assert.ok(stats.size > 0, "File has content");

    formattedDocPath = result.filePath;
  });

  test("Test 2: Inspect document", async () => {
    const result = await inspectDocx(formattedDocPath);

    assert.ok(result.success, "Inspection succeeded");
    assert.ok(result.structure.hasHeaders, "Headers detected");
    assert.ok(result.structure.hasFooters, "Footers detected");
    assert.ok(result.structure.hasTables, "Tables detected");
    assert.ok(result.structure.paragraphCount > 0, "Paragraphs counted");

    console.error(
      `  Document structure: ${JSON.stringify(result.structure, null, 2)}`,
    );
  });

  test("Test 3: Append with formatting preservation", async () => {
    const result = await appendToDocx(formattedDocPath, {
      paragraphs: [
        "This paragraph was appended!",
        "It supports **markdown** formatting too.",
      ],
      tables: [
        [
          ["New Header 1", "New Header 2"],
          ["New Cell 1", "New Cell 2"],
        ],
      ],
      stylePreset: "professional",
      addSeparator: true,
    });

    assert.ok(result.success, "Append succeeded");
    assert.strictEqual(result.paragraphsAppended, 2, "Correct paragraph count");
    assert.strictEqual(result.tablesAppended, 1, "Correct table count");
    assert.ok(result.formattingPreserved, "Formatting was preserved");

    // Verify the file still exists and has grown
    const stats = await fs.stat(formattedDocPath);
    assert.ok(stats.size > 0, "File still has content");
  });

  test("Test 4: Verify formatting preservation", async () => {
    const result = await inspectDocx(formattedDocPath);

    assert.ok(result.success, "Inspection succeeded");
    assert.ok(result.structure.hasHeaders, "Headers still present");
    assert.ok(result.structure.hasFooters, "Footers still present");
    assert.ok(result.structure.hasTables, "Tables still present");

    // Check that paragraph count increased
    assert.ok(
      result.structure.paragraphCount > 3,
      "New paragraphs were added",
    );
  });
});

describe("Test 5: Edit DOC with new approach (default)", () => {
  test("Edit using new approach preserves formatting", async () => {
    // Create a test document
    const createResult = await createDoc({
      title: "Edit Test Document",
      paragraphs: ["Original content here."],
      header: { text: "Original Header" },
      footer: { text: "Page {{page}}" },
      stylePreset: "business",
      outputPath: path.join(testDir, "edit-test-new.docx"),
      preventDuplicates: false,
    });

    assert.ok(createResult.success, "Test document created");

    // Edit using the new approach (default - no useLegacy)
    const editResult = await editDoc({
      filePath: createResult.filePath,
      action: "append",
      paragraphs: ["Appended with formatting preservation!"],
      stylePreset: "business",
    });

    assert.ok(editResult.success, "Edit succeeded");
    assert.ok(
      editResult.formattingPreserved,
      "Formatting preserved flag is set",
    );
    assert.ok(!editResult.legacyMode, "Not using legacy mode");

    // Verify structure
    const inspectResult = await inspectDocx(createResult.filePath);
    assert.ok(inspectResult.structure.hasHeaders, "Headers preserved");
    assert.ok(inspectResult.structure.hasFooters, "Footers preserved");
  });
});

describe("Test 6: Edit DOC with legacy approach", () => {
  test("Edit using legacy mode sets legacy flag", async () => {
    // Create a test document
    const createResult = await createDoc({
      title: "Legacy Edit Test",
      paragraphs: ["Original content."],
      header: { text: "Will be lost" },
      footer: { text: "Page {{page}}" },
      stylePreset: "minimal",
      outputPath: path.join(testDir, "edit-test-legacy.docx"),
      preventDuplicates: false,
    });

    assert.ok(createResult.success, "Test document created");

    // Edit using legacy approach
    const editResult = await editDoc({
      filePath: createResult.filePath,
      action: "append",
      paragraphs: ["Appended with legacy mode."],
      stylePreset: "minimal",
      useLegacy: true,
    });

    assert.ok(editResult.success, "Edit succeeded");
    assert.ok(editResult.legacyMode, "Legacy mode flag is set");
  });
});

describe("Test 7: Replace with structure preservation", () => {
  test("Replace content preserves headers and footers", async () => {
    // Create a test document
    const createResult = await createDoc({
      title: "Replace Test",
      paragraphs: ["Old content that will be replaced."],
      header: { text: "Persistent Header" },
      footer: { text: "Page {{page}}" },
      stylePreset: "technical",
      outputPath: path.join(testDir, "replace-test.docx"),
      preventDuplicates: false,
    });

    assert.ok(createResult.success, "Test document created");

    // Replace content
    const replaceResult = await replaceDocxContent(createResult.filePath, {
      title: "New Title",
      paragraphs: ["This is the new content.", "Completely replaced!"],
      tables: [
        [
          ["A", "B"],
          ["1", "2"],
        ],
      ],
      stylePreset: "technical",
    });

    assert.ok(replaceResult.success, "Replace succeeded");
    assert.ok(
      replaceResult.structurePreserved,
      "Structure preserved flag is set",
    );

    // Verify headers/footers are still there
    const inspectResult = await inspectDocx(createResult.filePath);
    assert.ok(
      inspectResult.structure.hasHeaders,
      "Headers preserved after replace",
    );
    assert.ok(
      inspectResult.structure.hasFooters,
      "Footers preserved after replace",
    );
  });
});

describe("Test 8: Complex document structure", () => {
  test("Append to complex document preserves all structure", async () => {
    // Create a more complex document
    const createResult = await createDoc({
      title: "Complex Document",
      paragraphs: [
        { text: "Introduction", headingLevel: "heading1" },
        "This document has multiple sections.",
        { text: "Main Content", headingLevel: "heading2" },
        "With various formatting options.",
        { text: "Conclusion", headingLevel: "heading1" },
        "The end.",
      ],
      tables: [
        [
          ["Metric", "Value", "Status"],
          ["Revenue", "$10,000", "Good"],
          ["Expenses", "$5,000", "OK"],
        ],
      ],
      header: { text: "Complex Document - Confidential", alignment: "right" },
      footer: {
        text: "Page {{page}} of {{total}}",
        alignment: "center",
        includeTotal: true,
      },
      stylePreset: "professional",
      margins: { top: 1.5, bottom: 1.5, left: 1, right: 1 },
      outputPath: path.join(testDir, "complex-test.docx"),
      preventDuplicates: false,
    });

    assert.ok(createResult.success, "Complex document created");

    // Append more content
    const appendResult = await appendToDocx(createResult.filePath, {
      paragraphs: [
        { text: "Appendix", headingLevel: "heading1" },
        "Additional information appended later.",
      ],
      stylePreset: "professional",
      addSeparator: true,
    });

    assert.ok(appendResult.success, "Append to complex document succeeded");
    assert.ok(appendResult.formattingPreserved, "Formatting preserved");

    // Verify
    const inspectResult = await inspectDocx(createResult.filePath);
    assert.ok(
      inspectResult.structure.hasHeaders,
      "Headers preserved in complex doc",
    );
    assert.ok(
      inspectResult.structure.hasFooters,
      "Footers preserved in complex doc",
    );
    assert.ok(
      inspectResult.structure.hasTables,
      "Tables preserved in complex doc",
    );
  });
});

describe("Test 9: Error handling", () => {
  test("Fails gracefully for non-existent file", async () => {
    const result = await appendToDocx("/non/existent/file.docx", {
      paragraphs: ["Test"],
    });
    assert.ok(!result.success, "Fails gracefully for non-existent file");
    assert.notStrictEqual(result.error, undefined, "Error message provided");
  });

  test("Fails gracefully for invalid file type", async () => {
    const invalidPath = path.join(testDir, "invalid.txt");
    await fs.writeFile(invalidPath, "This is not a docx file");

    const result = await appendToDocx(invalidPath, {
      paragraphs: ["Test"],
    });
    assert.ok(!result.success, "Fails gracefully for invalid file type");

    // Clean up
    await fs.unlink(invalidPath);
  });
});
