import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { createDoc } from "../src/tools/create-doc.js";
import { createExcel } from "../src/tools/create-excel.js";
import fs from "fs/promises";
import path from "path";

/**
 * Test script for document creation tools
 *
 * NOTE: Tests use preventDuplicates: false to ensure clean runs.
 * The duplicate detection system is tested separately.
 *
 * Run with: node --test test/create-tools.js
 */

const TEST_DIR = path.join(process.cwd(), "test");
const DOC_INPUT_PATH = path.join(TEST_DIR, "test-doc-input.json");
const EXCEL_INPUT_PATH = path.join(TEST_DIR, "test-excel-input.json");

/**
 * Load JSON file and parse it
 */
async function loadTestInput(filePath) {
  const content = await fs.readFile(filePath, "utf-8");
  return JSON.parse(content);
}

describe("create-doc tool", () => {
  test("should create a DOCX document from JSON input", async () => {
    const input = await loadTestInput(DOC_INPUT_PATH);
    console.error(`Loaded input from: ${DOC_INPUT_PATH}`);
    console.error(JSON.stringify(input, null, 2));

    console.error("Executing createDoc()...");
    const result = await createDoc(input);

    console.error("Result:", JSON.stringify(result, null, 2));

    assert.ok(result.success, `createDoc should succeed: ${result.message || "Unknown error"}`);
    assert.ok(result.filePath, "result should include filePath");

    // Verify file exists and get size
    const stats = await fs.stat(result.filePath);
    console.error(`File size: ${(stats.size / 1024).toFixed(2)} KB`);
    assert.ok(stats.size > 0, "Created file should have non-zero size");
  });
});

describe("create-excel tool", () => {
  test("should create an Excel file from JSON input", async () => {
    const input = await loadTestInput(EXCEL_INPUT_PATH);
    console.error(`Loaded input from: ${EXCEL_INPUT_PATH}`);
    console.error(JSON.stringify(input, null, 2));

    console.error("Executing createExcel()...");
    const result = await createExcel(input);

    console.error("Result:", JSON.stringify(result, null, 2));

    assert.ok(result.success, `createExcel should succeed: ${result.message || "Unknown error"}`);
    assert.ok(result.filePath, "result should include filePath");

    // Verify file exists and get size
    const stats = await fs.stat(result.filePath);
    console.error(`File size: ${(stats.size / 1024).toFixed(2)} KB`);
    assert.ok(stats.size > 0, "Created file should have non-zero size");
  });
});

describe("custom inputs", () => {
  test("should create a DOCX document with custom inline input", async () => {
    const customDocInput = {
      title: "Custom Document",
      paragraphs: [
        "This is a custom paragraph.",
        "Another paragraph with multiple lines."
      ],
      tables: [],
      outputPath: "./output/custom.docx",
      preventDuplicates: false
    };

    console.error("Testing create-doc with custom input...");
    const result = await createDoc(customDocInput);
    console.error("Result:", JSON.stringify(result, null, 2));

    assert.ok(result.success, `createDoc with custom input should succeed: ${result.message || "Unknown error"}`);
    assert.ok(result.filePath, "result should include filePath");
    console.error(`Created: ${result.filePath}`);
  });

  test("should create an Excel file with custom inline input", async () => {
    const customExcelInput = {
      sheets: [
        {
          name: "Custom Sheet",
          data: [
            ["ID", "Name"],
            [1, "Alice"],
            [2, "Bob"]
          ]
        }
      ],
      style: {
        columnWidths: { "0": 10, "1": 20 },
        headerBold: true
      },
      outputPath: "./output/custom.xlsx"
    };

    console.error("Testing create-excel with custom input...");
    const result = await createExcel(customExcelInput);
    console.error("Result:", JSON.stringify(result, null, 2));

    assert.ok(result.success, `createExcel with custom input should succeed: ${result.message || "Unknown error"}`);
    assert.ok(result.filePath, "result should include filePath");
    console.error(`Created: ${result.filePath}`);
  });
});
