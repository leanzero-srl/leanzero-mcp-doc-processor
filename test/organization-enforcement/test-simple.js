#!/usr/bin/env node

/**
 * Simple test for enforcement features
 */

import { createDoc } from "../../src/tools/create-doc.js";
import fs from "fs/promises";
import path from "path";

const PROJECT_ROOT = process.cwd();
const DOCS_DIR = path.join(PROJECT_ROOT, "docs");

async function main() {
  console.log("Testing enforcement features...\n");

  // Ensure docs directory exists
  await fs.mkdir(DOCS_DIR, { recursive: true });

  // Test 1: Docs folder enforcement
  console.log("Test 1: Relative path should go to docs/");
  const result1 = await createDoc({
    title: "Test Document",
    paragraphs: ["Test"],
    outputPath: "report.md",
  });
  console.log(`  Input: report.md`);
  console.log(`  Output: ${path.relative(PROJECT_ROOT, result1.filePath)}`);
  console.log(`  In docs/: ${result1.filePath.includes("docs") ? "✓ YES" : "✗ NO"}\n`);

  // Test 2: Duplicate prevention
  console.log("Test 2: Create same file twice");

  const result2a = await createDoc({
    title: "Duplicate Test",
    paragraphs: ["First"],
    outputPath: "duplicate.md",
  });
  console.log(`  First: ${path.basename(result2a.filePath)}`);

  const result2b = await createDoc({
    title: "Duplicate Test",
    paragraphs: ["Second"],
    outputPath: "duplicate.md",
  });
  console.log(`  Second: ${path.basename(result2b.filePath)}`);
  console.log(`  Unique names: ${path.basename(result2a.filePath) !== path.basename(result2b.filePath) ? "✓ YES" : "✗ NO"}\n`);

  // Test 3: Extension enforcement
  console.log("Test 3: .md extension should become .docx");
  const result3 = await createDoc({
    title: "Test",
    paragraphs: ["Test"],
    outputPath: "test.txt",
  });
  console.log(`  Input: test.txt`);
  console.log(`  Output: ${path.basename(result3.filePath)}`);
  console.log(`  Is .docx: ${result3.filePath.endsWith(".docx") ? "✓ YES" : "✗ NO"}\n`);

  // Cleanup
  console.log("Cleaning up test files...");
  const files = await fs.readdir(DOCS_DIR).catch(() => []);
  for (const file of files) {
    await fs.unlink(path.join(DOCS_DIR, file)).catch(() => {});
    console.log(`  Deleted: ${file}`);
  }

  console.log("\n✅ Tests complete!");
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
