/**
 * Test script for the new DOCX XML patching functionality
 *
 * This tests that we can:
 * 1. Append content to existing DOCX files while preserving formatting
 * 2. Replace content while preserving document structure
 * 3. Inspect DOCX files to understand their structure
 */

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

// Test utilities
let testCount = 0;
let passCount = 0;
let failCount = 0;

function log(message, type = "info") {
  const colors = {
    info: "\x1b[36m", // cyan
    success: "\x1b[32m", // green
    error: "\x1b[31m", // red
    warning: "\x1b[33m", // yellow
    reset: "\x1b[0m",
  };
  console.log(`${colors[type]}${message}${colors.reset}`);
}

async function assert(condition, message) {
  testCount++;
  if (condition) {
    passCount++;
    log(`  ✓ ${message}`, "success");
  } else {
    failCount++;
    log(`  ✗ ${message}`, "error");
  }
}

async function setup() {
  log("\n=== Setting up test environment ===", "info");

  // Create test output directory
  try {
    await fs.mkdir(testDir, { recursive: true });
    log(`Created test directory: ${testDir}`, "info");
  } catch (err) {
    if (err.code !== "EEXIST") throw err;
  }
}

async function cleanup() {
  log("\n=== Cleaning up test files ===", "info");

  try {
    const files = await fs.readdir(testDir);
    for (const file of files) {
      if (file.endsWith(".docx")) {
        await fs.unlink(path.join(testDir, file));
      }
    }
    log("Test files cleaned up", "info");
  } catch (err) {
    // Ignore cleanup errors
  }
}

// Test 1: Create a document with headers and footers
async function testCreateFormattedDocument() {
  log("\n--- Test 1: Create formatted document ---", "info");

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
  });

  await assert(result.success, "Document created successfully");
  await assert(
    result.filePath.includes("formatted-test") &&
      result.filePath.endsWith(".docx"),
    "File path is correct",
  );
  await assert(result.header !== null, "Header was added");
  await assert(result.footer !== null, "Footer was added");

  // Verify file exists
  const stats = await fs.stat(result.filePath);
  await assert(stats.size > 0, "File has content");

  return result.filePath;
}

// Test 2: Inspect the document
async function testInspectDocument(filePath) {
  log("\n--- Test 2: Inspect document ---", "info");

  const result = await inspectDocx(filePath);

  await assert(result.success, "Inspection succeeded");
  await assert(result.structure.hasHeaders, "Headers detected");
  await assert(result.structure.hasFooters, "Footers detected");
  await assert(result.structure.hasTables, "Tables detected");
  await assert(result.structure.paragraphCount > 0, "Paragraphs counted");

  log(
    `  Document structure: ${JSON.stringify(result.structure, null, 2)}`,
    "info",
  );

  return result;
}

// Test 3: Append content using the new XML patching approach
async function testAppendWithPreservation(filePath) {
  log("\n--- Test 3: Append with formatting preservation ---", "info");

  const result = await appendToDocx(filePath, {
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

  await assert(result.success, "Append succeeded");
  await assert(result.paragraphsAppended === 2, "Correct paragraph count");
  await assert(result.tablesAppended === 1, "Correct table count");
  await assert(result.formattingPreserved, "Formatting was preserved");

  // Verify the file still exists and has grown
  const stats = await fs.stat(filePath);
  await assert(stats.size > 0, "File still has content");

  return result;
}

// Test 4: Verify formatting was preserved after append
async function testVerifyFormattingPreserved(filePath) {
  log("\n--- Test 4: Verify formatting preservation ---", "info");

  const result = await inspectDocx(filePath);

  await assert(result.success, "Inspection succeeded");
  await assert(result.structure.hasHeaders, "Headers still present");
  await assert(result.structure.hasFooters, "Footers still present");
  await assert(result.structure.hasTables, "Tables still present");

  // Check that paragraph count increased
  await assert(
    result.structure.paragraphCount > 3,
    "New paragraphs were added",
  );

  return result;
}

// Test 5: Test edit-doc with new approach (default)
async function testEditDocNewApproach() {
  log("\n--- Test 5: Edit DOC with new approach (default) ---", "info");

  // Create a test document
  const createResult = await createDoc({
    title: "Edit Test Document",
    paragraphs: ["Original content here."],
    header: { text: "Original Header" },
    footer: { text: "Page {{page}}" },
    stylePreset: "business",
    outputPath: path.join(testDir, "edit-test-new.docx"),
  });

  await assert(createResult.success, "Test document created");

  // Edit using the new approach (default - no useLegacy)
  const editResult = await editDoc({
    filePath: createResult.filePath,
    action: "append",
    paragraphs: ["Appended with formatting preservation!"],
    stylePreset: "business",
  });

  await assert(editResult.success, "Edit succeeded");
  await assert(
    editResult.formattingPreserved,
    "Formatting preserved flag is set",
  );
  await assert(!editResult.legacyMode, "Not using legacy mode");

  // Verify structure
  const inspectResult = await inspectDocx(createResult.filePath);
  await assert(inspectResult.structure.hasHeaders, "Headers preserved");
  await assert(inspectResult.structure.hasFooters, "Footers preserved");

  return editResult;
}

// Test 6: Test edit-doc with legacy approach
async function testEditDocLegacyApproach() {
  log("\n--- Test 6: Edit DOC with legacy approach ---", "info");

  // Create a test document
  const createResult = await createDoc({
    title: "Legacy Edit Test",
    paragraphs: ["Original content."],
    header: { text: "Will be lost" },
    footer: { text: "Page {{page}}" },
    stylePreset: "minimal",
    outputPath: path.join(testDir, "edit-test-legacy.docx"),
  });

  await assert(createResult.success, "Test document created");

  // Edit using legacy approach
  const editResult = await editDoc({
    filePath: createResult.filePath,
    action: "append",
    paragraphs: ["Appended with legacy mode."],
    stylePreset: "minimal",
    useLegacy: true,
  });

  await assert(editResult.success, "Edit succeeded");
  await assert(editResult.legacyMode, "Legacy mode flag is set");

  return editResult;
}

// Test 7: Test replace with structure preservation
async function testReplaceWithPreservation() {
  log("\n--- Test 7: Replace with structure preservation ---", "info");

  // Create a test document
  const createResult = await createDoc({
    title: "Replace Test",
    paragraphs: ["Old content that will be replaced."],
    header: { text: "Persistent Header" },
    footer: { text: "Page {{page}}" },
    stylePreset: "technical",
    outputPath: path.join(testDir, "replace-test.docx"),
  });

  await assert(createResult.success, "Test document created");

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

  await assert(replaceResult.success, "Replace succeeded");
  await assert(
    replaceResult.structurePreserved,
    "Structure preserved flag is set",
  );

  // Verify headers/footers are still there
  const inspectResult = await inspectDocx(createResult.filePath);
  await assert(
    inspectResult.structure.hasHeaders,
    "Headers preserved after replace",
  );
  await assert(
    inspectResult.structure.hasFooters,
    "Footers preserved after replace",
  );

  return replaceResult;
}

// Test 8: Test with images (create a doc with an image reference)
async function testWithComplexStructure() {
  log("\n--- Test 8: Complex document structure ---", "info");

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
  });

  await assert(createResult.success, "Complex document created");

  // Append more content
  const appendResult = await appendToDocx(createResult.filePath, {
    paragraphs: [
      { text: "Appendix", headingLevel: "heading1" },
      "Additional information appended later.",
    ],
    stylePreset: "professional",
    addSeparator: true,
  });

  await assert(appendResult.success, "Append to complex document succeeded");
  await assert(appendResult.formattingPreserved, "Formatting preserved");

  // Verify
  const inspectResult = await inspectDocx(createResult.filePath);
  await assert(
    inspectResult.structure.hasHeaders,
    "Headers preserved in complex doc",
  );
  await assert(
    inspectResult.structure.hasFooters,
    "Footers preserved in complex doc",
  );
  await assert(
    inspectResult.structure.hasTables,
    "Tables preserved in complex doc",
  );

  return appendResult;
}

// Test 9: Error handling
async function testErrorHandling() {
  log("\n--- Test 9: Error handling ---", "info");

  // Test with non-existent file
  const result1 = await appendToDocx("/non/existent/file.docx", {
    paragraphs: ["Test"],
  });
  await assert(!result1.success, "Fails gracefully for non-existent file");
  await assert(result1.error !== undefined, "Error message provided");

  // Test with invalid file (not a docx)
  const invalidPath = path.join(testDir, "invalid.txt");
  await fs.writeFile(invalidPath, "This is not a docx file");

  const result2 = await appendToDocx(invalidPath, {
    paragraphs: ["Test"],
  });
  await assert(!result2.success, "Fails gracefully for invalid file type");

  // Clean up
  await fs.unlink(invalidPath);
}

// Run all tests
async function runTests() {
  log("\n" + "=".repeat(60), "info");
  log("  DOCX XML Patching Library - Test Suite", "info");
  log("=".repeat(60), "info");

  try {
    await setup();

    const formattedDocPath = await testCreateFormattedDocument();
    await testInspectDocument(formattedDocPath);
    await testAppendWithPreservation(formattedDocPath);
    await testVerifyFormattingPreserved(formattedDocPath);
    await testEditDocNewApproach();
    await testEditDocLegacyApproach();
    await testReplaceWithPreservation();
    await testWithComplexStructure();
    await testErrorHandling();

    // Print summary
    log("\n" + "=".repeat(60), "info");
    log("  TEST SUMMARY", "info");
    log("=".repeat(60), "info");
    log(`  Total: ${testCount}`, "info");
    log(`  Passed: ${passCount}`, "success");
    log(`  Failed: ${failCount}`, failCount > 0 ? "error" : "info");
    log("=".repeat(60) + "\n", "info");

    if (failCount > 0) {
      log("Some tests failed. Please review the output above.", "error");
      process.exit(1);
    } else {
      log("All tests passed! ✓", "success");
      process.exit(0);
    }
  } catch (error) {
    log(`\nFatal error: ${error.message}`, "error");
    console.error(error.stack);
    process.exit(1);
  }
}

// Run the tests
runTests();
