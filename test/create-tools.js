#!/usr/bin/env node

import { createDoc } from "../src/tools/create-doc.js";
import { createExcel } from "../src/tools/create-excel.js";
import fs from "fs/promises";
import path from "path";

/**
 * Test script for document creation tools
 */

const TEST_DIR = path.join(process.cwd(), "test");
const DOC_INPUT_PATH = path.join(TEST_DIR, "test-doc-input.json");
const EXCEL_INPUT_PATH = path.join(TEST_DIR, "test-excel-input.json");

/**
 * Load JSON file and parse it
 */
async function loadTestInput(filePath) {
  try {
    const content = await fs.readFile(filePath, "utf-8");
    return JSON.parse(content);
  } catch (err) {
    console.error(`Failed to load test input from ${filePath}:`, err.message);
    throw err;
  }
}

/**
 * Test the create-doc tool
 */
async function testCreateDoc() {
  console.log("\n" + "=".repeat(60));
  console.log("Testing create-doc tool");
  console.log("=".repeat(60));

  try {
    // Load test input
    const input = await loadTestInput(DOC_INPUT_PATH);
    console.log(`\nLoaded input from: ${DOC_INPUT_PATH}`);
    console.log(JSON.stringify(input, null, 2));

    // Execute the tool
    console.log("\nExecuting createDoc()...");
    const result = await createDoc(input);

    // Display results
    console.log("\nResult:");
    console.log(JSON.stringify(result, null, 2));

    if (result.success) {
      console.log(`\n� SUCCESS: DOCX document created at ${result.filePath}`);

      // Verify file exists and get size
      try {
        const stats = await fs.stat(result.filePath);
        console.log(`File size: ${(stats.size / 1024).toFixed(2)} KB`);
      } catch (err) {
        console.error(`Warning: Could not verify file existence: ${err.message}`);
      }
    } else {
      console.log(`\n� FAILED: ${result.message || "Unknown error"}`);
    }

    return result.success;
  } catch (err) {
    console.error(`\n� ERROR: ${err.message}`);
    console.error(err.stack);
    return false;
  }
}

/**
 * Test the create-excel tool
 */
async function testCreateExcel() {
  console.log("\n" + "=".repeat(60));
  console.log("Testing create-excel tool");
  console.log("=".repeat(60));

  try {
    // Load test input
    const input = await loadTestInput(EXCEL_INPUT_PATH);
    console.log(`\nLoaded input from: ${EXCEL_INPUT_PATH}`);
    console.log(JSON.stringify(input, null, 2));

    // Execute the tool
    console.log("\nExecuting createExcel()...");
    const result = await createExcel(input);

    // Display results
    console.log("\nResult:");
    console.log(JSON.stringify(result, null, 2));

    if (result.success) {
      console.log(`\n� SUCCESS: Excel file created at ${result.filePath}`);

      // Verify file exists and get size
      try {
        const stats = await fs.stat(result.filePath);
        console.log(`File size: ${(stats.size / 1024).toFixed(2)} KB`);
      } catch (err) {
        console.error(`Warning: Could not verify file existence: ${err.message}`);
      }
    } else {
      console.log(`\n� FAILED: ${result.message || "Unknown error"}`);
    }

    return result.success;
  } catch (err) {
    console.error(`\n� ERROR: ${err.message}`);
    console.error(err.stack);
    return false;
  }
}

/**
 * Test with custom inputs
 */
async function testCustomInputs() {
  console.log("\n" + "=".repeat(60));
  console.log("Testing create-doc and create-excel with custom inputs");
  console.log("=".repeat(60));

  let success = true;

  // Custom DOCX input
  const customDocInput = {
    title: "Custom Document",
    paragraphs: [
      "This is a custom paragraph.",
      "Another paragraph with multiple lines."
    ],
    tables: [],
    outputPath: "./output/custom.docx"
  };

  console.log("\nTesting create-doc with custom input...");
  try {
    const docResult = await createDoc(customDocInput);
    console.log("Result:", JSON.stringify(docResult, null, 2));

    if (!docResult.success) {
      console.error("� FAILED");
      success = false;
    } else {
      console.log(`� SUCCESS: ${docResult.filePath}`);
    }
  } catch (err) {
    console.error(`� ERROR: ${err.message}`);
    success = false;
  }

  // Custom Excel input
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

  console.log("\nTesting create-excel with custom input...");
  try {
    const excelResult = await createExcel(customExcelInput);
    console.log("Result:", JSON.stringify(excelResult, null, 2));

    if (!excelResult.success) {
      console.error("� FAILED");
      success = false;
    } else {
      console.log(`� SUCCESS: ${excelResult.filePath}`);
    }
  } catch (err) {
    console.error(`� ERROR: ${err.message}`);
    success = false;
  }

  return success;
}

/**
 * Main test runner
 */
async function main() {
  console.log("�".repeat(60));
  console.log("Document Creation Tools Test Suite");
  console.log("�".repeat(60));

  const results = [];

  // Run tests
  try {
    results.push({ name: "create-doc", success: await testCreateDoc() });
    results.push({ name: "create-excel", success: await testCreateExcel() });
    results.push({ name: "custom-inputs", success: await testCustomInputs() });
  } catch (err) {
    console.error("\nFatal error during tests:", err.message);
  }

  // Print summary
  console.log("\n" + "=".repeat(60));
  console.log("Test Summary");
  console.log("=".repeat(60));

  let passCount = 0;
  let failCount = 0;

  for (const result of results) {
    const status = result.success ? "� PASS" : "� FAIL";
    console.log(`${status} ${result.name}`);

    if (result.success) {
      passCount++;
    } else {
      failCount++;
    }
  }

  console.log("\n" + "-".repeat(60));
  console.log(`Total: ${results.length}, Passed: ${passCount}, Failed: ${failCount}`);

  process.exit(failCount > 0 ? 1 : 0);
}

// Run tests
main().catch((err) => {
  console.error("Fatal error:", err.message);
  console.error(err.stack);
  process.exit(1);
});
