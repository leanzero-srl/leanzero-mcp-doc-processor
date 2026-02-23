/**
 * Category and Registry Feature Test Suite
 *
 * Tests document categorization, subfolder organization, and registry tracking.
 */

import fs from "fs/promises";
import path from "path";

// Import modules under test
const { classifyDocument, getCategoryInfo, getAvailableCategories, extractContractClauses, compareDocuments } = await import("../src/utils/categorizer.js");
const { saveRegistry, registerDocument, findDocuments, getDocument, findDuplicateCandidates, unregisterDocument, getRegistryStats } = await import("../src/utils/registry.js");
const { applyCategoryToPath, getCategoryPath, getAvailableCategories: getToolCategories } = await import("../src/tools/utils.js");
const { createDoc } = await import("../src/tools/create-doc.js");
const { createExcel } = await import("../src/tools/create-excel.js");

// Test output directories
const TEST_DIR = "./test/output/category-tests";
const REGISTRY_PATH = path.join(process.cwd(), "docs", "registry.json");

// ANSI colors
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
    console.log(`  ${colors.green}PASS${colors.reset} ${name}`);
  } else {
    results.failed++;
    console.log(`  ${colors.red}FAIL${colors.reset} ${name}${error ? ` - ${error}` : ""}`);
  }
  results.tests.push({ name, passed, error });
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

// Backup and restore registry
let registryBackup = null;

async function backupRegistry() {
  try {
    const data = await fs.readFile(REGISTRY_PATH, "utf8");
    registryBackup = data;
  } catch {
    registryBackup = null;
  }
}

async function restoreRegistry() {
  if (registryBackup !== null) {
    await fs.writeFile(REGISTRY_PATH, registryBackup, "utf8");
  } else {
    try {
      await fs.unlink(REGISTRY_PATH);
    } catch {}
  }
}

async function cleanup() {
  try {
    await fs.rm(TEST_DIR, { recursive: true, force: true });
  } catch {}
  try {
    await fs.mkdir(TEST_DIR, { recursive: true });
  } catch {}
}

// ============================================================================
// CATEGORIZER TESTS
// ============================================================================

async function testCategorizerClassification() {
  console.log(`\n${colors.cyan}${colors.bold}Categorizer Tests${colors.reset}`);

  // Test: contracts classification
  try {
    const result = classifyDocument("Service Level Agreement", "This agreement outlines the terms of service between the contractor and the client.");
    assert(result.category === "contracts", `Expected "contracts", got "${result.category}"`);
    record("classifyDocument: contracts from title + content", true);
  } catch (e) {
    record("classifyDocument: contracts from title + content", false, e.message);
  }

  // Test: technical classification
  try {
    const result = classifyDocument("API Documentation", "endpoint request response schema database");
    assert(result.category === "technical", `Expected "technical", got "${result.category}"`);
    record("classifyDocument: technical from title + content", true);
  } catch (e) {
    record("classifyDocument: technical from title + content", false, e.message);
  }

  // Test: business classification
  try {
    const result = classifyDocument("Q1 Financial Report", "revenue profit budget forecast marketing strategy");
    assert(result.category === "business", `Expected "business", got "${result.category}"`);
    record("classifyDocument: business from title + content", true);
  } catch (e) {
    record("classifyDocument: business from title + content", false, e.message);
  }

  // Test: meeting classification
  try {
    const result = classifyDocument("Meeting Minutes", "agenda discussion decision action item attendees");
    assert(result.category === "meeting", `Expected "meeting", got "${result.category}"`);
    record("classifyDocument: meeting from title + content", true);
  } catch (e) {
    record("classifyDocument: meeting from title + content", false, e.message);
  }

  // Test: empty input returns misc
  try {
    const result = classifyDocument("", "");
    assert(result.category === "misc", `Expected "misc", got "${result.category}"`);
    record("classifyDocument: empty input returns misc", true);
  } catch (e) {
    record("classifyDocument: empty input returns misc", false, e.message);
  }

  // Test: getAvailableCategories returns 6 categories
  try {
    const categories = getAvailableCategories();
    assert(categories.length === 6, `Expected 6 categories, got ${categories.length}`);
    const names = categories.map(c => c.name);
    assert(names.includes("contracts"), "Missing 'contracts' category");
    assert(names.includes("technical"), "Missing 'technical' category");
    assert(names.includes("business"), "Missing 'business' category");
    assert(names.includes("legal"), "Missing 'legal' category");
    assert(names.includes("meeting"), "Missing 'meeting' category");
    assert(names.includes("research"), "Missing 'research' category");
    record("getAvailableCategories: returns 6 categories with correct names", true);
  } catch (e) {
    record("getAvailableCategories: returns 6 categories with correct names", false, e.message);
  }

  // Test: getCategoryInfo
  try {
    const info = getCategoryInfo("contracts");
    assert(info !== null, "Expected non-null for 'contracts'");
    assert(info.path === "contracts", `Expected path "contracts", got "${info.path}"`);
    record("getCategoryInfo: returns info for known category", true);
  } catch (e) {
    record("getCategoryInfo: returns info for known category", false, e.message);
  }

  // Test: getCategoryInfo unknown
  try {
    const info = getCategoryInfo("nonexistent");
    assert(info === null, "Expected null for unknown category");
    record("getCategoryInfo: returns null for unknown category", true);
  } catch (e) {
    record("getCategoryInfo: returns null for unknown category", false, e.message);
  }

  // Test: extractContractClauses
  try {
    const clauses = extractContractClauses("The limitation of liability shall not exceed $100. Termination of this agreement requires 30 days notice. Payment terms are net 30.");
    assert(clauses.liability && clauses.liability.length > 0, "Expected liability clauses");
    assert(clauses.termination && clauses.termination.length > 0, "Expected termination clauses");
    assert(clauses.payment && clauses.payment.length > 0, "Expected payment clauses");
    record("extractContractClauses: extracts liability, termination, payment", true);
  } catch (e) {
    record("extractContractClauses: extracts liability, termination, payment", false, e.message);
  }

  // Test: compareDocuments
  try {
    const result = compareDocuments("NDA Agreement", "confidential information parties", "NDA Agreement", "confidential information parties agreement");
    assert(result.jaccardSimilarity > 0.5, `Expected high similarity, got ${result.jaccardSimilarity}`);
    assert(result.duplicateRisk === "high", `Expected "high" risk, got "${result.duplicateRisk}"`);
    record("compareDocuments: detects high similarity", true);
  } catch (e) {
    record("compareDocuments: detects high similarity", false, e.message);
  }
}

// ============================================================================
// APPLY CATEGORY TO PATH TESTS
// ============================================================================

async function testApplyCategoryToPath() {
  console.log(`\n${colors.cyan}${colors.bold}applyCategoryToPath Tests${colors.reset}`);

  // Test: adds subfolder
  try {
    const result = applyCategoryToPath(path.resolve("docs/myfile.docx"), "contracts");
    assert(result.wasCategorized === true, "Expected wasCategorized to be true");
    assert(result.outputPath.includes(path.join("docs", "contracts")), `Expected path to contain docs/contracts, got ${result.outputPath}`);
    record("applyCategoryToPath: adds category subfolder", true);
  } catch (e) {
    record("applyCategoryToPath: adds category subfolder", false, e.message);
  }

  // Test: no category returns unchanged
  try {
    const originalPath = path.resolve("docs/myfile.docx");
    const result = applyCategoryToPath(originalPath, null);
    assert(result.wasCategorized === false, "Expected wasCategorized to be false");
    assert(result.outputPath === originalPath, "Expected path unchanged");
    record("applyCategoryToPath: no category returns unchanged", true);
  } catch (e) {
    record("applyCategoryToPath: no category returns unchanged", false, e.message);
  }

  // Test: already in correct subfolder
  try {
    const alreadyCorrect = path.resolve("docs/contracts/myfile.docx");
    const result = applyCategoryToPath(alreadyCorrect, "contracts");
    assert(result.wasCategorized === false, "Expected wasCategorized to be false when already in correct folder");
    record("applyCategoryToPath: already in correct subfolder is no-op", true);
  } catch (e) {
    record("applyCategoryToPath: already in correct subfolder is no-op", false, e.message);
  }

  // Test: getCategoryPath
  try {
    const catPath = getCategoryPath("technical");
    assert(catPath.subfolder === "technical", `Expected subfolder "technical", got "${catPath.subfolder}"`);
    assert(catPath.fullPath === path.join("docs", "technical"), `Expected fullPath "docs/technical", got "${catPath.fullPath}"`);
    record("getCategoryPath: returns correct subfolder and fullPath", true);
  } catch (e) {
    record("getCategoryPath: returns correct subfolder and fullPath", false, e.message);
  }

  // Test: getToolCategories delegates to categorizer
  try {
    const cats = getToolCategories();
    assert(cats.length === 6, `Expected 6 categories, got ${cats.length}`);
    const meetingCat = cats.find(c => c.name === "meeting");
    assert(meetingCat, "Expected 'meeting' category (not 'meetings')");
    assert(meetingCat.path === "docs/meetings/", `Expected path "docs/meetings/", got "${meetingCat.path}"`);
    record("getToolCategories: delegates to categorizer with correct naming", true);
  } catch (e) {
    record("getToolCategories: delegates to categorizer with correct naming", false, e.message);
  }
}

// ============================================================================
// REGISTRY TESTS
// ============================================================================

async function testRegistry() {
  console.log(`\n${colors.cyan}${colors.bold}Registry Tests${colors.reset}`);

  // Clean registry for tests
  await saveRegistry({ documents: [], version: 1, lastUpdated: null });

  // Test: registerDocument creates entry
  try {
    const entry = await registerDocument({
      title: "Test Document",
      filePath: "/tmp/test-doc.docx",
      category: "technical",
      tags: ["test", "unit-test"],
      description: "A test document",
    });
    assert(entry.id, "Expected entry to have an id");
    assert(entry.title === "Test Document", `Expected title "Test Document", got "${entry.title}"`);
    assert(entry.category === "technical", `Expected category "technical", got "${entry.category}"`);
    assert(entry.tags.length === 2, `Expected 2 tags, got ${entry.tags.length}`);
    record("registerDocument: creates entry with id, title, category, tags", true);
  } catch (e) {
    record("registerDocument: creates entry with id, title, category, tags", false, e.message);
  }

  // Test: findDocuments by category
  try {
    const docs = await findDocuments({ category: "technical" });
    assert(docs.length >= 1, `Expected at least 1 document, got ${docs.length}`);
    assert(docs[0].title === "Test Document", `Expected "Test Document", got "${docs[0].title}"`);
    record("findDocuments: finds by category", true);
  } catch (e) {
    record("findDocuments: finds by category", false, e.message);
  }

  // Test: findDocuments by title
  try {
    const docs = await findDocuments({ title: "Test" });
    assert(docs.length >= 1, `Expected at least 1 document, got ${docs.length}`);
    record("findDocuments: finds by partial title", true);
  } catch (e) {
    record("findDocuments: finds by partial title", false, e.message);
  }

  // Test: registerDocument updates on re-register (same filePath)
  try {
    const updated = await registerDocument({
      title: "Test Document Updated",
      filePath: "/tmp/test-doc.docx",
      category: "technical",
      tags: ["test", "updated"],
    });
    assert(updated.title === "Test Document Updated", `Expected updated title, got "${updated.title}"`);
    const allDocs = await findDocuments({});
    assert(allDocs.length === 1, `Expected 1 document (updated, not duplicated), got ${allDocs.length}`);
    record("registerDocument: updates existing entry on re-register", true);
  } catch (e) {
    record("registerDocument: updates existing entry on re-register", false, e.message);
  }

  // Test: getDocument by path
  try {
    const doc = await getDocument("/tmp/test-doc.docx");
    assert(doc !== null, "Expected to find document by path");
    assert(doc.title === "Test Document Updated", `Expected updated title, got "${doc.title}"`);
    record("getDocument: finds by filePath", true);
  } catch (e) {
    record("getDocument: finds by filePath", false, e.message);
  }

  // Test: getRegistryStats
  try {
    const stats = await getRegistryStats();
    assert(stats.totalDocuments === 1, `Expected 1 total, got ${stats.totalDocuments}`);
    assert(stats.byCategory.technical === 1, `Expected 1 in technical, got ${stats.byCategory.technical}`);
    record("getRegistryStats: returns correct counts", true);
  } catch (e) {
    record("getRegistryStats: returns correct counts", false, e.message);
  }

  // Test: findDuplicateCandidates
  try {
    const candidates = await findDuplicateCandidates("Test Document", "technical");
    assert(candidates.length >= 1, `Expected at least 1 candidate, got ${candidates.length}`);
    record("findDuplicateCandidates: finds similar documents", true);
  } catch (e) {
    record("findDuplicateCandidates: finds similar documents", false, e.message);
  }

  // Test: unregisterDocument
  try {
    const removed = await unregisterDocument("/tmp/test-doc.docx");
    assert(removed === true, "Expected removal to succeed");
    const remaining = await findDocuments({});
    assert(remaining.length === 0, `Expected 0 documents after removal, got ${remaining.length}`);
    record("unregisterDocument: removes entry", true);
  } catch (e) {
    record("unregisterDocument: removes entry", false, e.message);
  }
}

// ============================================================================
// END-TO-END: CREATE-DOC WITH CATEGORY
// ============================================================================

async function testCreateDocWithCategory() {
  console.log(`\n${colors.cyan}${colors.bold}End-to-End: create-doc with category${colors.reset}`);

  // Clean registry
  await saveRegistry({ documents: [], version: 1, lastUpdated: null });

  // Test: create doc with category
  try {
    const result = await createDoc({
      title: "NDA Agreement Test",
      paragraphs: ["This is a test NDA agreement."],
      category: "contracts",
      tags: ["test", "nda"],
      description: "Test NDA document",
      enforceDocsFolder: true,
      preventDuplicates: true,
    });

    assert(result.success === true, `Expected success, got error: ${result.error}`);
    assert(result.filePath.includes(path.join("docs", "contracts")), `Expected path to contain docs/contracts, got ${result.filePath}`);
    assert(result.wasCategorized === true, "Expected wasCategorized to be true");
    assert(result.category === "contracts", `Expected category "contracts", got "${result.category}"`);
    assert(result.registryEntry !== null, "Expected registryEntry to be present");
    assert(result.registryEntry.id, "Expected registry entry to have id");

    // Verify file exists
    await fs.access(result.filePath);

    // Cleanup created file
    await fs.unlink(result.filePath).catch(() => {});

    record("createDoc with category: creates file in docs/contracts/ and registers", true);
  } catch (e) {
    record("createDoc with category: creates file in docs/contracts/ and registers", false, e.message);
  }

  // Test: dry-run includes category info
  try {
    const result = await createDoc({
      title: "Tech Spec Draft",
      paragraphs: ["Draft content."],
      category: "technical",
      tags: ["draft"],
      dryRun: true,
    });

    assert(result.success === true, `Expected success, got error: ${result.error}`);
    assert(result.dryRun === true, "Expected dryRun to be true");
    assert(result.preview.category === "technical", `Expected preview category "technical", got "${result.preview.category}"`);
    assert(result.preview.wasCategorized === true, "Expected preview.wasCategorized to be true");
    assert(result.enforcement.categorized === true, "Expected enforcement.categorized to be true");
    record("createDoc dry-run: includes category info in preview", true);
  } catch (e) {
    record("createDoc dry-run: includes category info in preview", false, e.message);
  }
}

// ============================================================================
// END-TO-END: CREATE-EXCEL WITH CATEGORY
// ============================================================================

async function testCreateExcelWithCategory() {
  console.log(`\n${colors.cyan}${colors.bold}End-to-End: create-excel with category${colors.reset}`);

  // Clean registry
  await saveRegistry({ documents: [], version: 1, lastUpdated: null });

  // Test: create excel with category
  try {
    const result = await createExcel({
      sheets: [{ name: "Sales Data", data: [["Quarter", "Revenue"], ["Q1", "100000"], ["Q2", "120000"]] }],
      category: "business",
      tags: ["sales", "quarterly"],
      description: "Quarterly sales report",
      enforceDocsFolder: true,
      preventDuplicates: true,
    });

    assert(result.success === true, `Expected success, got error: ${result.error}`);
    assert(result.filePath.includes(path.join("docs", "business")), `Expected path to contain docs/business, got ${result.filePath}`);
    assert(result.wasCategorized === true, "Expected wasCategorized to be true");
    assert(result.category === "business", `Expected category "business", got "${result.category}"`);
    assert(result.registryEntry !== null, "Expected registryEntry to be present");

    // Verify file exists
    await fs.access(result.filePath);

    // Cleanup
    await fs.unlink(result.filePath).catch(() => {});

    record("createExcel with category: creates file in docs/business/ and registers", true);
  } catch (e) {
    record("createExcel with category: creates file in docs/business/ and registers", false, e.message);
  }

  // Test: dry-run includes category info
  try {
    const result = await createExcel({
      sheets: [{ name: "Data", data: [["A", "B"]] }],
      category: "research",
      dryRun: true,
    });

    assert(result.success === true, `Expected success, got error: ${result.error}`);
    assert(result.dryRun === true, "Expected dryRun to be true");
    assert(result.preview.category === "research", `Expected preview category "research", got "${result.preview.category}"`);
    assert(result.preview.wasCategorized === true, "Expected preview.wasCategorized to be true");
    record("createExcel dry-run: includes category info in preview", true);
  } catch (e) {
    record("createExcel dry-run: includes category info in preview", false, e.message);
  }
}

// ============================================================================
// RUN ALL TESTS
// ============================================================================

async function runAllTests() {
  console.log(`\n${colors.bold}======================================`);
  console.log(`  Category & Registry Test Suite`);
  console.log(`======================================${colors.reset}\n`);

  await backupRegistry();

  try {
    await cleanup();
    await testCategorizerClassification();
    await testApplyCategoryToPath();
    await testRegistry();
    await testCreateDocWithCategory();
    await testCreateExcelWithCategory();
  } finally {
    await restoreRegistry();
    await fs.rm(TEST_DIR, { recursive: true, force: true }).catch(() => {});
  }

  // Print summary
  console.log(`\n${colors.bold}======================================`);
  console.log(`  Results: ${results.passed}/${results.total} passed`);
  if (results.failed > 0) {
    console.log(`  ${colors.red}${results.failed} FAILED${colors.reset}`);
    for (const t of results.tests.filter(t => !t.passed)) {
      console.log(`    ${colors.red}✗ ${t.name}: ${t.error}${colors.reset}`);
    }
  } else {
    console.log(`  ${colors.green}All tests passed!${colors.reset}`);
  }
  console.log(`${colors.bold}======================================${colors.reset}\n`);

  process.exit(results.failed > 0 ? 1 : 0);
}

runAllTests().catch((err) => {
  console.error(`${colors.red}Fatal error:${colors.reset}`, err);
  process.exit(1);
});
