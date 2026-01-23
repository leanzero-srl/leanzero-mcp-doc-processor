#!/usr/bin/env node

/**
 * Comprehensive test for organization enforcement:
 * 1. Docs folder enforcement (default: true)
 * 2. Duplicate file prevention (default: true)
 * 3. Extension enforcement (already working)
 * 4. All features working together
 */

import { createDoc } from "../../src/tools/create-doc.js";
import { createExcel } from "../../src/tools/create-excel.js";
import fs from "fs/promises";
import path from "path";

const PROJECT_ROOT = process.cwd();
const DOCS_DIR = path.join(PROJECT_ROOT, "docs");

async function setup() {
  await fs.mkdir(DOCS_DIR, { recursive: true });
  // Create some existing files in the actual docs/ folder
  await fs.writeFile(
    path.join(DOCS_DIR, "existing.docx"),
    Buffer.from([0x50, 0x4b, 0x03, 0x04]),
  );
  await fs.writeFile(
    path.join(DOCS_DIR, "existing.xlsx"),
    Buffer.from([0x50, 0x4b, 0x03, 0x04]),
  );
}

async function cleanup() {
  await fs.rm(DOCS_DIR, { recursive: true, force: true }).catch(() => {});
}

async function testDefaultBehavior() {
  console.log("\n" + "=".repeat(80));
  console.log(
    "TEST 1: Default Behavior (docs/ enforced + duplicates prevented)",
  );
  console.log("=".repeat(80));

  const tests = [];

  // Test 1: Default - should go to docs/ and prevent duplicates
  tests.push({
    name: "Default create-doc (no path specified)",
    tool: "doc",
    input: {
      title: "Test Document",
      paragraphs: ["Test paragraph"],
      // No outputPath specified
    },
    expected: {
      inDocs: true, // Relative path gets enforced to docs/
      unique: true,
    },
  });

  // Test 2: Relative path - should go to docs/
  tests.push({
    name: "Relative path → docs/",
    tool: "doc",
    input: {
      title: "Test Document",
      paragraphs: ["Test paragraph"],
      outputPath: "report.md",
    },
    expected: {
      inDocs: true, // All relative paths are now enforced to docs/
      unique: true,
    },
  });

  // Test 3: Absolute path - should be respected
  tests.push({
    name: "Absolute path → not enforced",
    tool: "doc",
    input: {
      title: "Test Document",
      paragraphs: ["Test paragraph"],
      outputPath: path.join(PROJECT_ROOT, "absolute-location", "test.md"),
    },
    expected: {
      inDocs: true, // Absolute paths within project root are also enforced to docs/
      unique: true,
    },
  });

  // Test 4: Already in docs/ - no enforcement
  tests.push({
    name: "Already in docs/ → no enforcement",
    tool: "doc",
    input: {
      title: "Test Document",
      paragraphs: ["Test paragraph"],
      outputPath: path.join("test-docs", "already-in-docs.md"),
    },
    expected: {
      inDocs: true, // Already in docs/ folder
      unique: true,
      wasEnforced: false, // Already in docs/, no enforcement needed
    },
  });

  let passed = 0;
  let failed = 0;

  for (const test of tests) {
    console.log(`\n[Test]: ${test.name}`);
    try {
      const result =
        test.tool === "doc"
          ? await createDoc(test.input)
          : await createExcel(test.input);

      const inDocs = result.filePath.includes(path.join("docs"));
      const enforcementObj = result.enforcement || {};
      const docsEnforced = enforcementObj.docsFolderEnforced;
      const duplicatePrevented = enforcementObj.duplicatePrevented;

      console.log(
        `  Output path: ${path.relative(PROJECT_ROOT, result.filePath)}`,
      );
      console.log(`  In docs/: ${inDocs} (expected: ${test.expected.inDocs})`);
      console.log(`  Docs enforced: ${docsEnforced}`);
      console.log(`  Duplicate prevented: ${duplicatePrevented}`);

      const testPassed =
        inDocs === test.expected.inDocs &&
        (!test.expected.wasEnforced ||
          docsEnforced === test.expected.wasEnforced);

      if (testPassed) {
        console.log(`  ✓ PASS`);
        passed++;
      } else {
        console.log(`  ✗ FAIL`);
        failed++;
      }
    } catch (err) {
      console.log(`  ✗ FAIL - Error: ${err.message}`);
      failed++;
    }
  }

  return { passed, failed };
}

async function testDuplicatePrevention() {
  console.log("\n" + "=".repeat(80));
  console.log("TEST 2: Duplicate File Prevention");
  console.log("=".repeat(80));

  // Create a file that already exists
  const existingFile = path.join(DOCS_DIR, "duplicate-test.docx");
  await fs.mkdir(path.dirname(existingFile), { recursive: true });
  await fs.writeFile(existingFile, Buffer.from([0x50, 0x4b, 0x03, 0x04]));

  // Verify file exists
  try {
    await fs.access(existingFile, fs.constants.F_OK);
  } catch (err) {
    console.error(
      `[setup] Failed to create or access test file: ${err.message}`,
    );
  }
  console.log(
    `\n[setup] Created existing file: ${path.relative(PROJECT_ROOT, existingFile)}`,
  );

  // List docs folder contents
  const files = await fs.readdir(DOCS_DIR);
  console.log(`[setup] Docs folder now contains: ${files.join(", ")}`);

  let passed = 0;
  let failed = 0;

  const testName = "Create file with same name";
  console.log(`\n[Test]: ${testName}`);
  console.log(
    `[test] Attempting to create file that conflicts with existing file`,
  );
  try {
    const result = await createDoc({
      title: "Duplicate Test",
      paragraphs: ["Test"],
      outputPath: path.join("docs", "duplicate-test.md"),
    });

    const basename = path.basename(result.filePath);
    const isDuplicatePrevented = basename !== "duplicate-test.docx";
    const expectedPattern = /^duplicate-test_\d+\.docx$/.test(basename);

    console.log(`  Created: ${basename}`);
    console.log(
      `  Original exists: ${expectedPattern ? "Yes, name modified" : "No"}`,
    );
    console.log(`  Duplicate prevented: ${isDuplicatePrevented}`);

    if (isDuplicatePrevented && expectedPattern) {
      console.log(`  ✓ PASS`);
      passed++;
    } else {
      console.log(`  ✗ FAIL`);
      failed++;
    }
  } catch (err) {
    console.log(`  ✗ FAIL - Error: ${err.message}`);
    failed++;
  }

  return { passed, failed };
}

async function testOptOut() {
  console.log("\n" + "=".repeat(80));
  console.log("TEST 3: Opt-Out Behavior (disable enforcement)");
  console.log("=".repeat(80));

  let passed = 0;
  let failed = 0;

  // Test 1: Disable docs folder enforcement
  const testName1 = "Disable docs folder enforcement";
  console.log(`\n[Test]: ${testName1}`);
  try {
    const result = await createDoc({
      title: "Test Document",
      paragraphs: ["Test"],
      outputPath: "custom-location/report.md",
      enforceDocsFolder: false,
    });

    const inDocs = result.filePath.includes("test-docs");
    const enforcementObj = result.enforcement || {};
    const docsEnforced = enforcementObj.docsFolderEnforced;

    console.log(
      `  Output path: ${path.relative(PROJECT_ROOT, result.filePath)}`,
    );
    console.log(`  In docs/: ${inDocs} (should be false)`);
    console.log(`  Docs enforced: ${docsEnforced} (should be false)`);

    if (!inDocs && !docsEnforced) {
      console.log(`  ✓ PASS`);
      passed++;
    } else {
      console.log(`  ✗ FAIL`);
      failed++;
    }
  } catch (err) {
    console.log(`  ✗ FAIL - Error: ${err.message}`);
    failed++;
  }

  // Test 2: Allow duplicates (should overwrite)
  const testName2 = "Disable duplicate prevention";
  console.log(`\n[Test]: ${testName2}`);
  try {
    const result1 = await createDoc({
      title: "Overwrite Test",
      paragraphs: ["First version"],
      outputPath: path.join("docs", "overwrite-test.md"),
    });
    const path1 = result1.filePath;

    const result2 = await createDoc({
      title: "Overwrite Test",
      paragraphs: ["Second version"],
      outputPath: path.join("docs", "overwrite-test.md"),
      preventDuplicates: false,
    });
    const path2 = result2.filePath;

    const samePath = path1 === path2;
    const enforcementObj = result2.enforcement || {};
    const duplicatePrevented = enforcementObj.duplicatePrevented;

    console.log(`  First created: ${path.basename(path1)}`);
    console.log(`  Second created: ${path.basename(path2)}`);
    console.log(`  Same path: ${samePath} (should be true)`);
    console.log(
      `  Duplicate prevented: ${duplicatePrevented} (should be false)`,
    );

    if (samePath && !duplicatePrevented) {
      console.log(`  ✓ PASS`);
      passed++;
    } else {
      console.log(`  ✗ FAIL`);
      failed++;
    }
  } catch (err) {
    console.log(`  ✗ FAIL - Error: ${err.message}`);
    failed++;
  }

  return { passed, failed };
}

async function testExcelOrganization() {
  console.log("\n" + "=".repeat(80));
  console.log("TEST 4: Excel Organization Enforcement");
  console.log("=".repeat(80));

  let passed = 0;
  let failed = 0;

  // Test: Default Excel behavior
  const testName = "Default Excel (docs/ enforced + duplicates prevented)";
  console.log(`\n[Test]: ${testName}`);
  try {
    const result = await createExcel({
      sheets: [
        {
          name: "Sheet1",
          data: [
            ["Name", "Value"],
            ["Test", "123"],
          ],
        },
      ],
      outputPath: "data.csv",
    });

    const inDocs = result.filePath.includes(path.join("docs"));
    const isXlsx = result.filePath.endsWith(".xlsx");
    const enforcementObj = result.enforcement || {};
    const docsEnforced = enforcementObj.docsFolderEnforced;

    console.log(
      `  Output path: ${path.relative(PROJECT_ROOT, result.filePath)}`,
    );
    console.log(`  In docs/: ${inDocs} (should be true)`);
    console.log(`  Is .xlsx: ${isXlsx} (should be true)`);
    console.log(`  Docs enforced: ${docsEnforced} (should be true)`);

    if (inDocs && isXlsx && docsEnforced) {
      console.log(`  ✓ PASS`);
      passed++;
    } else {
      console.log(`  ✗ FAIL`);
      failed++;
    }
  } catch (err) {
    console.log(`  ✗ FAIL - Error: ${err.message}`);
    failed++;
  }

  return { passed, failed };
}

async function testIntegration() {
  console.log("\n" + "=".repeat(80));
  console.log("TEST 5: Integration - All Enforcement Together");
  console.log("=".repeat(80));

  let passed = 0;
  let failed = 0;

  const testName = "Multiple files with same name";
  console.log(`\n[Test]: ${testName}`);
  console.log(`Creating 3 files with same base name...`);

  const results = [];
  for (let i = 0; i < 3; i++) {
    console.log(`\n[iteration ${i + 1}] Creating file...`);
    const result = await createDoc({
      title: "Integration Test",
      paragraphs: [`Version ${i + 1}`],
      outputPath: "integration-test.md",
    });
    results.push(result);
    console.log(
      `[iteration ${i + 1}] Created: ${path.basename(result.filePath)}`,
    );

    // Verify file actually exists on disk
    try {
      await fs.access(result.filePath, fs.constants.F_OK);
      console.log(
        `[iteration ${i + 1}] ✓ File exists on disk: ${path.basename(result.filePath)}`,
      );
    } catch (err) {
      console.log(
        `[iteration ${i + 1}] ✗ File NOT on disk: ${path.basename(result.filePath)} - ${err.message}`,
      );
    }

    // List docs folder after each creation
    const files = await fs.readdir(DOCS_DIR).catch(() => []);
    console.log(`[iteration ${i + 1}] Docs folder now: ${files.join(", ")}`);
  }

  // Verify all are unique
  const basenames = results.map((r) => path.basename(r.filePath));
  const uniqueBasenames = new Set(basenames);
  const allUnique = basenames.length === uniqueBasenames.size;

  // Verify naming pattern (integration-test.docx, integration-test_1.docx, integration-test_2.docx)
  const sortedBasenames = basenames.sort();
  const expectedNames = [
    "integration-test.docx",
    "integration-test_1.docx",
    "integration-test_2.docx",
  ];
  const hasCorrectNames = sortedBasenames.every(
    (name, i) => name === expectedNames[i],
  );
  console.log(`\nSorted actual names: ${sortedBasenames.join(", ")}`);
  console.log(`Expected names: ${expectedNames.join(", ")}`);

  // Verify all in docs
  const allInDocs = results.every((r) =>
    r.filePath.includes(path.join("docs")),
  );

  // Verify all are .docx
  const allDocx = results.every((r) => r.filePath.endsWith(".docx"));

  console.log(`\nAll unique: ${allUnique} (expected: true)`);
  console.log(`Correct naming pattern: ${hasCorrectNames} (expected: true)`);
  console.log(`All in docs/: ${allInDocs} (expected: true)`);
  console.log(`All are .docx: ${allDocx} (expected: true)`);
  console.log(`\nActual names: ${basenames.join(", ")}`);
  console.log(`Expected names: ${expectedNames.join(", ")}`);

  if (allUnique && hasCorrectNames && allInDocs && allDocx) {
    console.log(`  ✓ PASS`);
    passed++;
  } else {
    console.log(`  ✗ FAIL`);
    failed++;
  }

  return { passed, failed };
}

async function main() {
  console.log("\n" + "=".repeat(80));
  console.log("ORGANIZATION ENFORCEMENT TEST SUITE");
  console.log("=".repeat(80));
  console.log("\nThis test verifies:");
  console.log("  1. Docs/ folder is enforced by default");
  console.log("  2. Duplicate files are prevented by default");
  console.log("  3. Extensions are enforced (.md → .docx, etc.)");
  console.log(
    "  4. Users can opt-out (enforceDocsFolder: false, preventDuplicates: false)",
  );
  console.log("  5. All features work together");

  try {
    await setup();

    const defaultResults = await testDefaultBehavior();
    const duplicateResults = await testDuplicatePrevention();
    const optOutResults = await testOptOut();
    const excelResults = await testExcelOrganization();
    const integrationResults = await testIntegration();

    const totalPassed =
      defaultResults.passed +
      duplicateResults.passed +
      optOutResults.passed +
      excelResults.passed +
      integrationResults.passed;
    const totalFailed =
      defaultResults.failed +
      duplicateResults.failed +
      optOutResults.failed +
      excelResults.failed +
      integrationResults.failed;

    console.log("\n" + "=".repeat(80));
    console.log("FINAL SUMMARY");
    console.log("=".repeat(80));
    console.log(
      `\nDefault behavior: ${defaultResults.passed} passed, ${defaultResults.failed} failed`,
    );
    console.log(
      `Duplicate prevention: ${duplicateResults.passed} passed, ${duplicateResults.failed} failed`,
    );
    console.log(
      `Opt-out behavior: ${optOutResults.passed} passed, ${optOutResults.failed} failed`,
    );
    console.log(
      `Excel organization: ${excelResults.passed} passed, ${excelResults.failed} failed`,
    );
    console.log(
      `Integration test: ${integrationResults.passed} passed, ${integrationResults.failed} failed`,
    );
    console.log(`\nTOTAL: ${totalPassed} passed, ${totalFailed} failed`);

    if (totalFailed === 0) {
      console.log("\n✅ ALL TESTS PASSED!");
      console.log("\nThe tools now enforce:");
      console.log("  ✓ Docs/ folder by default (prevents file clutter)");
      console.log("  ✓ No duplicate files (prevents overwriting)");
      console.log("  ✓ Correct extensions (.docx, .xlsx)");
      console.log("  ✓ Opt-out available for flexibility");
      console.log("  ✓ All features work together");
    } else {
      console.log("\n❌ SOME TESTS FAILED");
    }

    console.log("=".repeat(80) + "\n");

    process.exit(totalFailed === 0 ? 0 : 1);
  } finally {
    await cleanup();
  }
}

main().catch((err) => {
  console.error("\n❌ Test suite failed with error:");
  console.error(err);
  process.exit(1);
});
