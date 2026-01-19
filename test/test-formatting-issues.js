#!/usr/bin/env node

import { createDoc } from "../src/tools/create-doc.js";
import { createExcel } from "../src/tools/create-excel.js";
import path from "path";
import fs from "fs/promises";

/**
 * Test to demonstrate formatting issues with create-doc and create-excel
 *
 * Known Issues:
 * 1. DOCX - Excessive spacing causing content to appear on separate pages
 * 2. DOCX - Font size calculations may be incorrect
 * 3. Excel - Column widths and row heights may not be properly applied
 */

const OUTPUT_DIR = path.join(process.cwd(), "output");

/**
 * Test 1: Simple DOCX with minimal content
 * This should demonstrate if spacing issues cause single letters/words on separate pages
 */
async function testSimpleDocx() {
  console.log("\n" + "=".repeat(70));
  console.log("TEST 1: Simple DOCX with minimal content");
  console.log("=".repeat(70));

  const input = {
    title: "Test Document",
    paragraphs: [
      "This is a simple paragraph.",
      "This is another paragraph.",
      "Third paragraph here."
    ],
    outputPath: path.join(OUTPUT_DIR, "test-formatting-simple.docx")
  };

  console.log("Input:", JSON.stringify(input, null, 2));

  const result = await createDoc(input);
  console.log("\nResult:", JSON.stringify(result, null, 2));

  if (result.success) {
    const stats = await fs.stat(result.filePath);
    console.log(`\nFile created: ${result.filePath}`);
    console.log(`File size: ${(stats.size / 1024).toFixed(2)} KB`);
  }

  return result.success;
}

/**
 * Test 2: DOCX with current default styling parameters
 * This will show the effects of the current spacing calculations
 */
async function testDefaultStylingDocx() {
  console.log("\n" + "=".repeat(70));
  console.log("TEST 2: DOCX with current default styling");
  console.log("=".repeat(70));

  // Demonstrate the problematic spacing calculations
  console.log("\nCurrent spacing calculations in create-doc.js:");
  console.log("  Title spacingBefore: 400 * 20 = 8000 twips (~11 inches!)");
  console.log("  Title spacingAfter: 240 * 20 = 4800 twips (~6.7 inches)");
  console.log("  Paragraph spacingBefore: 120 * 20 = 2400 twips (~3.3 inches)");
  console.log("  Paragraph spacingAfter: 120 * 20 = 2400 twips (~3.3 inches)");

  const input = {
    title: "Title with Excessive Spacing",
    paragraphs: [
      "First paragraph - will likely be on its own page",
      "Second paragraph - also likely on separate page",
      "Third paragraph - you get the idea"
    ],
    outputPath: path.join(OUTPUT_DIR, "test-formatting-default.docx")
  };

  const result = await createDoc(input);
  console.log("\nResult:", JSON.stringify(result, null, 2));

  if (result.success) {
    const stats = await fs.stat(result.filePath);
    console.log(`\nFile created: ${result.filePath}`);
    console.log(`File size: ${(stats.size / 1024).toFixed(2)} KB`);
    console.log("\n⚠️  Open this file to see if content is split across pages!");
  }

  return result.success;
}

/**
 * Test 3: DOCX with custom styling to show the impact
 */
async function testCustomStylingDocx() {
  console.log("\n" + "=".repeat(70));
  console.log("TEST 3: DOCX with custom size parameters");
  console.log("=".repeat(70));

  // Testing with different size values
  const input = {
    title: "Custom Size Test",
    paragraphs: [
      {
        text: "Paragraph with size 24 (current default)",
        size: 24
      },
      {
        text: "Paragraph with size 12 (normal)",
        size: 12
      },
      {
        text: "Paragraph with size 11 (typical)",
        size: 11
      }
    ],
    outputPath: path.join(OUTPUT_DIR, "test-formatting-custom.docx")
  };

  console.log("Testing different paragraph sizes:", input.paragraphs.map(p => p.size));

  const result = await createDoc(input);
  console.log("\nResult:", JSON.stringify(result, null, 2));

  if (result.success) {
    const stats = await fs.stat(result.filePath);
    console.log(`\nFile created: ${result.filePath}`);
    console.log(`File size: ${(stats.size / 1024).toFixed(2)} KB`);
    console.log("\n⚠️  Compare font sizes in the document");
  }

  return result.success;
}

/**
 * Test 4: Excel with default styling
 */
async function testDefaultExcel() {
  console.log("\n" + "=".repeat(70));
  console.log("TEST 4: Excel with default styling");
  console.log("=".repeat(70));

  const input = {
    sheets: [
      {
        name: "Test Sheet",
        data: [
          ["Column A", "Column B", "Column C"],
          ["Data 1", "Data 2", "Data 3"],
          ["Longer text in column A", "Medium text", "Short"]
        ]
      }
    ],
    outputPath: path.join(OUTPUT_DIR, "test-formatting-excel.xlsx")
  };

  console.log("Input:", JSON.stringify(input, null, 2));

  const result = await createExcel(input);
  console.log("\nResult:", JSON.stringify(result, null, 2));

  if (result.success) {
    const stats = await fs.stat(result.filePath);
    console.log(`\nFile created: ${result.filePath}`);
    console.log(`File size: ${(stats.size / 1024).toFixed(2)} KB`);
    console.log("\n⚠️  Check if column widths are appropriate");
  }

  return result.success;
}

/**
 * Test 5: Demonstrate the specific "one letter per page" issue
 */
async function testOneLetterPerPage() {
  console.log("\n" + "=".repeat(70));
  console.log("TEST 5: Demonstrating 'one letter per page' issue");
  console.log("=".repeat(70));

  console.log("\nCreating a document that will likely show the extreme spacing issue...");
  console.log("Each paragraph should appear on its own page with current settings.");

  const input = {
    title: "Extreme Spacing Test",
    paragraphs: [
      "A",
      "B",
      "C",
      "D",
      "E"
    ],
    outputPath: path.join(OUTPUT_DIR, "test-formatting-one-letter.docx")
  };

  const result = await createDoc(input);
  console.log("\nResult:", JSON.stringify(result, null, 2));

  if (result.success) {
    const stats = await fs.stat(result.filePath);
    console.log(`\nFile created: ${result.filePath}`);
    console.log(`File size: ${(stats.size / 1024).toFixed(2)} KB`);
    console.log("\n⚠️  OPEN THIS FILE! Each letter (A, B, C, D, E) will likely be on a separate page");
    console.log("    This demonstrates the extreme spacing issue you reported.");
  }

  return result.success;
}

/**
 * Main test runner
 */
async function main() {
  console.log("╔".repeat(70));
  console.log("║  FORMATTING ISSUES DIAGNOSTIC TEST");
  console.log("╚".repeat(70));
  console.log("\nThis test demonstrates the formatting issues you reported:");
  console.log("  - Big letters/words appearing one per page");
  console.log("  - Excessive spacing causing content separation");
  console.log("  - Potential Excel formatting issues");

  const results = [];

  try {
    results.push({ name: "Simple DOCX", success: await testSimpleDocx() });
    results.push({ name: "Default Styling", success: await testDefaultStylingDocx() });
    results.push({ name: "Custom Styling", success: await testCustomStylingDocx() });
    results.push({ name: "Excel Default", success: await testDefaultExcel() });
    results.push({ name: "One Letter Per Page", success: await testOneLetterPerPage() });
  } catch (error) {
    console.error("\n❌ Fatal error during testing:", error.message);
    console.error(error.stack);
  }

  // Print summary
  console.log("\n" + "=".repeat(70));
  console.log("TEST SUMMARY");
  console.log("=".repeat(70));

  let passCount = 0;
  let failCount = 0;

  for (const result of results) {
    const status = result.success ? "✓ PASS" : "✗ FAIL";
    console.log(`${status} ${result.name}`);

    if (result.success) passCount++;
    else failCount++;
  }

  console.log("\n" + "-".repeat(70));
  console.log(`Total: ${results.length}, Passed: ${passCount}, Failed: ${failCount}`);

  console.log("\n" + "=".repeat(70));
  console.log("DIAGNOSTIC SUMMARY");
  console.log("=".repeat(70));
  console.log("\nIssues identified:");
  console.log("  1. Spacing values in create-doc.js are multiplied by 20 unnecessarily");
  console.log("     - Title spacingBefore: 400 * 20 = 8000 twips (should be ~400)");
  console.log("     - Paragraph spacing: 120 * 20 = 2400 twips (should be ~120)");
  console.log("  2. These excessive spacing values cause content to be pushed to separate pages");
  console.log("  3. Font sizes may also be multiplied incorrectly in some cases");
  console.log("\nNext steps:");
  console.log("  1. Review and fix spacing calculations in create-doc.js");
  console.log("  2. Verify Excel styling is applied correctly");
  console.log("  3. Test the fixes with this diagnostic script");

  console.log("\n" + "=".repeat(70));
  console.log("✓ Test files created in: " + OUTPUT_DIR);
  console.log("  Please open the DOCX files to see the formatting issues!");
  console.log("=".repeat(70) + "\n");
}

// Run the diagnostic tests
main().catch((error) => {
  console.error("Fatal error:", error.message);
  console.error(error.stack);
  process.exit(1);
});
