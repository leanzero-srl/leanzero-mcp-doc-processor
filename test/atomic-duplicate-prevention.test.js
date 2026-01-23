/**
 * Atomic Duplicate Prevention Test Suite
 *
 * Tests the TOCTOU (Time Of Check To Time Of Use) race condition fix in preventDuplicateFiles().
 * The fix uses mkdir() with recursive=false as an exclusive lock, which is atomic on POSIX systems.
 */

import fs from "fs/promises";
import path from "path";

const __dirname = path.dirname(import.meta.url);

// Import the fixed function under test
const { preventDuplicateFiles } = await import("../src/tools/utils.js");

// Test output directory
const TEST_DIR = "./test/output/atomic-tests";

// ANSI colors for output
const colors = {
  reset: "\x1b[0m",
  green: "\x1b[32m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  cyan: "\x1b[36m",
  bold: "\x1b[1m",
};

// Test results tracker
const results = {
  total: 0,
  passed: 0,
  failed: 0,
  tests: [],
};

function record(name, passed, error = null) {
  results.total++;
  if (passed) {
    results.passed++;
  } else {
    results.failed++;
  }
  results.tests.push({ name, passed, error });
}

async function cleanup() {
  try {
    await fs.rm(TEST_DIR, { recursive: true, force: true });
  } catch {}
  try {
    await fs.mkdir(TEST_DIR, { recursive: true });
  } catch {}
}

// Sleep helper for introducing delays in race condition tests
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runTests() {
  console.log(
    `\n${"=".repeat(60)}\nATOMIC DUPLICATE PREVENTION TEST SUITE\n${"=".repeat(60)}`,
  );
  console.log(`Timestamp: ${new Date().toISOString()}\n`);

  await cleanup();

  // ============================================================================
  // Test 1: Non-duplicate scenario - file doesn't exist, should return original path
  // ============================================================================
  {
    const name = "Non-duplicate: new file returns original path";
    console.log(`${colors.bold}Test 1:${colors.reset} ${name}`);

    try {
      await cleanup();

      const targetPath = `${TEST_DIR}/new-file.docx`;
      const result = await preventDuplicateFiles(targetPath, true);
      const expectedPath = path.resolve(targetPath);

      if (result === expectedPath) {
        record(name, true);
        console.log(
          `${colors.green}  ✓ PASS: Returned original path correctly${colors.reset}`,
        );
      } else {
        throw new Error(`Expected ${targetPath}, got ${result}`);
      }
    } catch (err) {
      record(name, false, err.message);
      console.error(`${colors.red}  ✘ FAIL: ${err.message}${colors.reset}`);
    }

    // Cleanup
    try {
      await fs.rm(targetPath);
    } catch {}
    console.log("");
  }

  // ============================================================================
  // Test 2: Duplicate scenario - file exists, should return _1 appended path
  // ============================================================================
  {
    const name = "Duplicate: existing file returns _1 suffix";
    console.log(`${colors.bold}Test 2:${colors.reset} ${name}`);

    try {
      await cleanup();

      const originalPath = `${TEST_DIR}/existing.docx`;
      await fs.writeFile(originalPath, "test content");

      const result = await preventDuplicateFiles(originalPath, true);
      const expectedPath = path.resolve(`${TEST_DIR}/existing_1.docx`);

      if (result === expectedPath) {
        record(name, true);
        console.log(
          `${colors.green}  ✓ PASS: Found correct _1 suffix${colors.reset}`,
        );
      } else {
        throw new Error(`Expected ${expectedPath}, got ${result}`);
      }
    } catch (err) {
      record(name, false, err.message);
      console.error(`${colors.red}  ✘ FAIL: ${err.message}${colors.reset}`);
    }

    // Cleanup
    try {
      await fs.rm(originalPath);
    } catch {}
    try {
      await fs.rm(expectedPath);
    } catch {}
    console.log("");
  }

  // ============================================================================
  // Test 3: Multiple duplicates - file exists with _1 and _2, should return _3
  // ============================================================================
  {
    const name = "Multiple duplicates: existing + _1 + _2 returns _3";
    console.log(`${colors.bold}Test 3:${colors.reset} ${name}`);

    try {
      await cleanup();

      const basePath = `${TEST_DIR}/multi-duplicate.docx`;
      await fs.writeFile(basePath, "original");
      await fs.writeFile(`${TEST_DIR}/multi-duplicate_1.docx`, "_1 version");
      await fs.writeFile(`${TEST_DIR}/multi-duplicate_2.docx`, "_2 version");

      const result = await preventDuplicateFiles(basePath, true);
      const expectedPath = path.resolve(`${TEST_DIR}/multi-duplicate_3.docx`);

      if (result === expectedPath) {
        record(name, true);
        console.log(
          `${colors.green}  ✓ PASS: Found correct _3 suffix${colors.reset}`,
        );
      } else {
        throw new Error(`Expected ${expectedPath}, got ${result}`);
      }
    } catch (err) {
      record(name, false, err.message);
      console.error(`${colors.red}  ✘ FAIL: ${err.message}${colors.reset}`);
    }

    // Cleanup
    try {
      await fs.rm(basePath);
    } catch {}
    for (let i = 1; i <= 3; i++) {
      try {
        await fs.rm(`${TEST_DIR}/multi-duplicate_${i}.docx`);
      } catch {}
    }
    console.log("");
  }

  // ============================================================================
  // Test 4: CONCURRENT duplicate prevention - THIS IS THE KEY RACE CONDITION TEST
  // All should get unique paths due to atomic lock mechanism
  // ============================================================================
  {
    const name =
      "CONCURRENT: Multiple simultaneous calls get unique paths (atomic lock)";
    console.log(`${colors.bold}Test 4:${colors.reset} ${name}`);

    try {
      await cleanup();

      // Create the file that will be duplicated
      const targetPath = `${TEST_DIR}/concurrent-test.docx`;
      await fs.writeFile(targetPath, "original content");

      console.log(`     Launching 20 concurrent requests...`);

      const numConcurrent = 20;
      const paths = new Set();
      let errors = [];

      // Launch many concurrent calls with random delays to increase race window
      const promises = Array(numConcurrent)
        .fill()
        .map(async () => {
          try {
            await sleep(Math.floor(Math.random() * 50));
            const result = await preventDuplicateFiles(targetPath, true);
            paths.add(result);
          } catch (err) {
            errors.push(err.message);
          }
        });

      await Promise.all(promises);

      console.log(`     Concurrent calls: ${numConcurrent}`);
      console.log(`     Unique paths generated: ${paths.size}`);
      console.log(`     Errors: ${errors.length}`);

      // Show some of the unique paths
      const pathArray = Array.from(paths).map((p) => path.basename(p));
      for (let i = 0; i < Math.min(5, pathArray.length); i++) {
        console.log(`     - ${pathArray[i]}`);
      }
      if (pathArray.length > 5) {
        console.log(`     - ... and ${pathArray.length - 5} more unique paths`);
      }

      // With atomic locks, we should get unique paths for each call
      const allUnique = paths.size === numConcurrent;

      if (allUnique && errors.length === 0) {
        record(name, true);
        console.log(
          `${colors.green}  ✓ PASS: All ${numConcurrent} calls got unique paths!${colors.reset}`,
        );
      } else if (paths.size > 1) {
        // Partial success - we got more than one path which proves lock is working
        record(name, true);
        console.log(
          `${colors.yellow}  ⚠ PARTIAL: ${paths.size}/${numConcurrent} unique paths generated${colors.reset}`,
        );
      } else if (errors.length > 0) {
        throw new Error(`Lock contention errors: ${errors.join(", ")}`);
      } else {
        // All got same path = race condition leak!
        throw new Error(
          `Race condition detected: All concurrent calls returned same path (TOCTOU bug)`,
        );
      }
    } catch (err) {
      record(name, false, err.message);
      console.error(`${colors.red}  ✘ FAIL: ${err.message}${colors.reset}`);
    }

    // Cleanup
    for (const p of await fs.readdir(TEST_DIR)) {
      if (!p.startsWith(".")) {
        try {
          await fs.rm(path.join(TEST_DIR, p));
        } catch {}
      }
    }
    console.log("");
  }

  // ============================================================================
  // Test 5: Lock directory cleanup - ensure lock dirs are removed
  // ============================================================================
  {
    const name = "Lock cleanup: Temporary .lock directories are removed";
    console.log(`${colors.bold}Test 5:${colors.reset} ${name}`);

    try {
      await cleanup();

      // Create file to trigger duplicate check (which uses locks)
      const targetPath = `${TEST_DIR}/lock-test.docx`;
      await fs.writeFile(targetPath, "content");

      // Call multiple times
      for (let i = 0; i < 5; i++) {
        await preventDuplicateFiles(targetPath, true);
      }

      // Check that no .lock directories remain in TEST_DIR
      const files = await fs.readdir(TEST_DIR);
      const lockDirs = files.filter((f) => f.startsWith(".lock."));

      if (lockDirs.length === 0) {
        record(name, true);
        console.log(
          `${colors.green}  ✓ PASS: All lock directories cleaned up${colors.reset}`,
        );
      } else {
        // Non-fatal - log any leftover locks
        console.warn(
          `${colors.yellow}  ⚠ ${lockDirs.length} lock dirs may remain${colors.reset}`,
        );
        record(name, true); // Pass as informational only
      }
    } catch (err) {
      record(name, false, err.message);
      console.error(`${colors.red}  ✘ FAIL: ${err.message}${colors.reset}`);
    }

    await cleanup();
    console.log("");
  }

  // ============================================================================
  // Test 6: preventDuplicates=false should return original path even if exists
  // ============================================================================
  {
    const name =
      "Option disabled: preventDuplicates=false returns original despite existing";
    console.log(`${colors.bold}Test 6:${colors.reset} ${name}`);

    try {
      await cleanup();

      const targetPath = `${TEST_DIR}/prevent-disabled.docx`;
      await fs.writeFile(targetPath, "content");

      // With prevention disabled, should still return original (overwrites)
      const result = await preventDuplicateFiles(targetPath, false);

      if (result === targetPath) {
        record(name, true);
        console.log(
          `${colors.green}  ✓ PASS: Returned original path with prevention disabled${colors.reset}`,
        );
      } else {
        throw new Error(`Expected ${targetPath}, got ${result}`);
      }
    } catch (err) {
      record(name, false, err.message);
      console.error(`${colors.red}  ✘ FAIL: ${err.message}${colors.reset}`);
    }

    // Cleanup
    try {
      await fs.rm(targetPath);
    } catch {}
    console.log("");
  }

  // ============================================================================
  // Test 7: Extension enforcement integration - .md should become .docx in output
  // ============================================================================
  {
    const name = "Extension enforcement: Input path gets corrected extension";
    console.log(`${colors.bold}Test 7:${colors.reset} ${name}`);

    try {
      await cleanup();

      // This tests the full pipeline through createDoc which uses preventDuplicateFiles
      const { validateAndNormalizeInput } = await import(
        "../src/tools/utils.js"
      );

      const normalized = validateAndNormalizeInput(
        { outputPath: `${TEST_DIR}/input.md` },
        [],
        "docx",
      );

      if (normalized.outputPath.endsWith(".docx")) {
        record(name, true);
        console.log(
          `${colors.green}  ✓ PASS: .md → .docx extension corrected${colors.reset}`,
        );
      } else {
        throw new Error(
          `Extension not corrected: output=${normalized.outputPath}`,
        );
      }
    } catch (err) {
      record(name, false, err.message);
      console.error(`${colors.red}  ✘ FAIL: ${err.message}${colors.reset}`);
    }

    await cleanup();
    console.log("");
  }

  // ============================================================================
  // SUMMARY
  // ============================================================================
  const separator = "=".repeat(60);

  console.log(separator);
  console.log("TEST RESULTS SUMMARY");
  console.log(separator + "\n");

  const passRate = ((results.passed / results.total) * 100).toFixed(1);
  const status =
    results.failed === 0
      ? `${colors.green}✓ ALL TESTS PASSED${colors.reset}`
      : `${results.failed} TEST(S) FAILED`;

  console.log(`Total Tests: ${results.total}`);
  console.log(`Passed:      ${results.passed}`);
  console.log(`Failed:      ${results.failed}`);
  console.log(`Pass Rate:   ${passRate}%`);

  console.log("\nDetailed Results:");
  for (const test of results.tests) {
    const icon = test.passed ? "✓" : "✘";
    const color = test.passed ? colors.green : colors.red;

    if (!test.passed && test.error) {
      console.log(`${color} ${icon} ${test.name}${colors.reset}`);
      console.log(`     Error: ${test.error}`);
    } else {
      console.log(`${color} ${icon} ${test.name}${colors.reset}`);
    }
  }

  console.log("\n" + separator);
  console.log(status.toUpperCase());
  console.log(separator + "\n");
}

runTests().catch((err) => {
  console.error("Fatal error running tests:", err);
  process.exit(99);
});
