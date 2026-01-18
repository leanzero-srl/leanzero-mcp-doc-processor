#!/usr/bin/env node

/**
 * Comprehensive Integration Test Suite
 *
 * Verifies the full MCP toolchain against real documents.
 *
 * Scenarios tested:
 * 1. get-doc-summary: High-level overview
 * 2. get-doc-indepth: Full extraction
 * 3. get-doc-focused (No Query): Should generate clarification questions
 * 4. get-doc-focused (With Query): Should perform targeted analysis
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

// Import Tool Handlers
import { handleSummary } from "../src/tools/summary-tool.js";
import { handleInDepth } from "../src/tools/indepth-tool.js";
import { handleFocused } from "../src/tools/focused-tool.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.join(__dirname, "..");
const testFilesDir = path.join(projectRoot, "testfiles");

// ANSI colors for output
const colors = {
  reset: "\x1b[0m",
  green: "\x1b[32m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  cyan: "\x1b[36m",
  bold: "\x1b[1m",
  gray: "\x1b[90m",
};

// Test Configuration
const TEST_QUERIES = {
  default: "What are the key dates and monetary amounts mentioned?",
  pdf: "What is the invoice number?",
  docx: "Summarize the introduction",
  xlsx: "What is the total value?",
};

async function runTests() {
  console.log(
    `${colors.cyan}${colors.bold}Starting Comprehensive MCP Tool Tests${colors.reset}\n`,
  );

  // 1. Setup
  if (!fs.existsSync(testFilesDir)) {
    console.error(
      `${colors.red}Error: testfiles directory not found at ${testFilesDir}${colors.reset}`,
    );
    process.exit(1);
  }

  const files = fs
    .readdirSync(testFilesDir)
    .filter((f) => !f.startsWith(".") && !f.startsWith("~$"));

  if (files.length === 0) {
    console.warn(
      `${colors.yellow}No files found in testfiles directory.${colors.reset}`,
    );
    return;
  }

  console.log(`Found ${files.length} documents to test.\n`);
  let totalTests = 0;
  let passedTests = 0;
  let failedTests = 0;

  // 2. Iterate through files
  for (const file of files) {
    const filePath = path.join(testFilesDir, file);
    const ext = path.extname(file).toLowerCase().replace(".", "");

    console.log(`${colors.bold}📄 Document: ${file}${colors.reset}`);
    console.log(`${colors.gray}   Path: ${filePath}${colors.reset}\n`);

    // --- Scenario A: Summary Tool ---
    await runTestScenario(
      "get-doc-summary",
      () => handleSummary({ filePath }),
      (response) => {
        const text = response.content[0].text;
        return text.includes("Document Summary") && text.length > 50;
      },
    );

    // --- Scenario B: In-Depth Tool ---
    await runTestScenario(
      "get-doc-indepth",
      () => handleInDepth({ filePath }),
      (response) => {
        const text = response.content[0].text;
        return text.includes("Document Content") && text.length > 100;
      },
    );

    // --- Scenario C: Focused Tool (Discovery Mode) ---
    await runTestScenario(
      "get-doc-focused (Discovery)",
      () => handleFocused({ filePath }, null, null),
      (response) => {
        const text = response.content[0].text;
        // Should ask questions or provide brief overview
        return (
          text.includes("answer the following questions") ||
          text.includes("Document Analysis")
        );
      },
    );

    // --- Scenario D: Focused Tool (Query Mode) ---
    const query = TEST_QUERIES[ext] || TEST_QUERIES.default;
    await runTestScenario(
      `get-doc-focused (Query: "${query}")`,
      () => handleFocused({ filePath }, query, null),
      (response) => {
        const text = response.content[0].text;
        return (
          text.includes("Focused Analysis") ||
          text.includes("Analysis based on your query")
        );
      },
    );

    console.log(
      colors.gray +
        "----------------------------------------" +
        colors.reset +
        "\n",
    );
  }

  // 3. Summary
  console.log(`${colors.bold}Test Suite Summary:${colors.reset}`);
  console.log(`Total Tests: ${totalTests}`);
  console.log(`Passed:      ${colors.green}${passedTests}${colors.reset}`);
  console.log(
    `Failed:      ${failedTests > 0 ? colors.red : colors.green}${failedTests}${colors.reset}`,
  );

  process.exit(failedTests > 0 ? 1 : 0);

  // Helper function for running tests
  async function runTestScenario(name, action, validator) {
    totalTests++;
    process.stdout.write(`   ${colors.cyan}Testing ${name}...${colors.reset} `);

    try {
      const startTime = Date.now();
      const response = await action();
      const duration = Date.now() - startTime;

      // Basic MCP Response Validation
      if (!response || !response.content || !Array.isArray(response.content)) {
        throw new Error("Invalid MCP response format");
      }

      const content = response.content[0];
      if (content.type !== "text" || typeof content.text !== "string") {
        throw new Error("Invalid content type in response");
      }

      // Check for error messages returned as content (soft errors)
      if (
        content.text.startsWith("Error:") ||
        content.text.includes("Failed to process")
      ) {
        // Special case: if we expect success, this is a failure
        // But for some corrupted files, this might be valid behavior.
        // For integration tests on known good files, we treat as failure.
        throw new Error(
          `Tool returned error: ${content.text.substring(0, 100)}...`,
        );
      }

      // Custom Validation
      if (validator && !validator(response)) {
        throw new Error("Response validation failed");
      }

      console.log(`${colors.green}✔ PASS${colors.reset} (${duration}ms)`);
      passedTests++;

      // Optional: Log length/details
      // console.log(`     -> Response length: ${content.text.length} chars`);
    } catch (error) {
      console.log(`${colors.red}✘ FAIL${colors.reset}`);
      console.error(`     Error: ${error.message}`);
      if (error.stack && process.env.DEBUG) {
        console.error(error.stack);
      }
      failedTests++;
    }
  }
}

runTests().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
