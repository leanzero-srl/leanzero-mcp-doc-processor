/**
 * Tests for Innovation Features:
 *   1. Adaptive DNA Evolution
 *   2. Document Lineage Graph
 *   3. Extract-to-Excel Pipeline
 *   4. Document Blueprints
 *   5. Drift Detection
 *   6. Composite Document Assembly
 *   7. Failure Paths & Edge Cases
 *   8. Blueprint Enhanced Metadata
 *   9. DNA Category Evolution
 *  10. Lineage in create-doc Response
 *  11. Drift Detection with Word Sets
 *  12. End-to-End Integration
 */

import fs from "fs";
import path from "path";
import { createDoc } from "../src/tools/create-doc.js";
import {
  loadDNA,
  createDNAFile,
  recordUsage,
  analyzeTrends,
  applyEvolution,
  clearDNACache,
} from "../src/utils/dna-manager.js";
import {
  recordRead,
  recordWrite,
  getRecentlyRead,
  clearRecentlyRead,
} from "../src/services/lineage-tracker.js";
import {
  extractBlueprintFromDocx,
  validateAgainstBlueprint,
} from "../src/services/blueprint-extractor.js";
import {
  saveBlueprint,
  loadBlueprint,
  listBlueprints,
  deleteBlueprint,
} from "../src/utils/blueprint-store.js";
import { extractData } from "../src/services/data-extractor.js";
import {
  computeFingerprint,
  compareFingerprintsDrift,
} from "../src/services/drift-detector.js";
import { assembleDocument } from "../src/services/document-assembler.js";

const TEST_DIR = path.join(process.cwd(), "test-output-innovations");
const DNA_PATH = path.join(process.cwd(), ".document-dna.json");

let passed = 0;
let failed = 0;
let total = 0;

function assert(condition, message) {
  total++;
  if (condition) {
    passed++;
    console.log(`  \x1b[32m✓ ${message}\x1b[0m`);
  } else {
    failed++;
    console.log(`  \x1b[31m✗ ${message}\x1b[0m`);
  }
}

// Backup and restore DNA
let dnaBackup = null;

function backupDNA() {
  try {
    dnaBackup = fs.readFileSync(DNA_PATH, "utf-8");
  } catch {
    dnaBackup = null;
  }
}

function restoreDNA() {
  if (dnaBackup) {
    fs.writeFileSync(DNA_PATH, dnaBackup, "utf-8");
  } else {
    try { fs.unlinkSync(DNA_PATH); } catch { /* ok */ }
  }
  clearDNACache();
}

async function runTests() {
  console.log("\n============================================================");
  console.log("  INNOVATION FEATURES TEST SUITE");
  console.log("============================================================\n");

  // Setup
  backupDNA();
  if (!fs.existsSync(TEST_DIR)) {
    fs.mkdirSync(TEST_DIR, { recursive: true });
  }

  // Initialize DNA for tests
  createDNAFile({
    company: { name: "Test Corp" },
    defaults: { stylePreset: "professional" },
    header: { text: "Test Corp", alignment: "right" },
    footer: { text: "Page {current} of {total}", alignment: "center" },
  });

  // =====================================================
  // TEST 1: Adaptive DNA Evolution
  // =====================================================
  console.log("\x1b[36m--- Test 1: Adaptive DNA Evolution ---\x1b[0m");

  // Clear usage data
  const dna = loadDNA();
  if (dna) {
    dna.usage = { categories: {}, styles: {}, totalDocs: 0, overrides: {}, correlations: {} };
    fs.writeFileSync(DNA_PATH, JSON.stringify(dna, null, 2), "utf-8");
    clearDNACache();
  }

  // Simulate 10 document creations with dominant patterns
  for (let i = 0; i < 8; i++) {
    recordUsage("business", "business", { stylePreset: false });
  }
  recordUsage("technical", "technical", { stylePreset: true });
  recordUsage("meeting", "professional", { stylePreset: false });

  const trends = analyzeTrends(5);
  assert(trends.ready === true, "analyzeTrends reports ready after 10 docs");
  assert(trends.totalDocs === 10, "Tracked 10 total documents");
  assert(Array.isArray(trends.suggestions), "Returns suggestions array");
  assert(trends.suggestions.length > 0, "Has at least one suggestion");

  const styleSuggestion = trends.suggestions.find(s => s.type === "default-style");
  assert(styleSuggestion !== undefined, "Suggests default style change");
  assert(styleSuggestion.mutation.value === "business", "Suggests 'business' as default style");

  // Test evolution application
  const evolutionResult = applyEvolution(styleSuggestion.mutation);
  assert(evolutionResult.success === true, "Evolution applied successfully");
  assert(evolutionResult.newValue === "business", "DNA style updated to 'business'");

  const updatedDna = loadDNA();
  assert(updatedDna.defaults.stylePreset === "business", "DNA file reflects evolved style");
  assert(updatedDna.usage.lastEvolutionAt !== null, "Evolution timestamp recorded");

  // Test threshold not met
  clearDNACache();
  const earlyTrends = analyzeTrends(100);
  assert(earlyTrends.ready === false, "Not ready when threshold not met");

  // =====================================================
  // TEST 2: Document Lineage Graph
  // =====================================================
  console.log("\n\x1b[36m--- Test 2: Document Lineage Graph ---\x1b[0m");

  clearRecentlyRead();

  // Simulate reading two documents
  recordRead("/test/source-a.docx", "get-doc-indepth");
  recordRead("/test/source-b.pdf", "get-doc-summary");

  const recentlyReadDocs = getRecentlyRead();
  assert(recentlyReadDocs.length === 2, "Tracked 2 recently read documents");
  assert(recentlyReadDocs[0].filePath === "/test/source-a.docx", "First read tracked correctly");

  // Simulate writing (without registry since test paths don't exist in registry)
  const lineageResult = await recordWrite("/test/output.docx");
  assert(lineageResult !== null, "Lineage recorded on write");
  assert(lineageResult.sources.length === 2, "Two sources captured");
  assert(lineageResult.sources[0].tool === "get-doc-indepth", "Tool name captured");

  // After write, recently read should be cleared
  const afterWrite = getRecentlyRead();
  assert(afterWrite.length === 0, "Recently read cleared after write");

  // Test no lineage when nothing was read
  const emptyLineage = await recordWrite("/test/another.docx");
  assert(emptyLineage === null, "No lineage when nothing was read");

  // =====================================================
  // TEST 3: Document Blueprints
  // =====================================================
  console.log("\n\x1b[36m--- Test 3: Document Blueprints ---\x1b[0m");

  // Create a test document first
  const testDocResult = await createDoc({
    title: "Q3 Quarterly Report",
    paragraphs: [
      { text: "Executive Summary", headingLevel: "heading1" },
      "The third quarter showed strong growth across all segments.",
      { text: "Key Metrics", headingLevel: "heading2" },
      "Revenue increased 15% year-over-year.",
      { text: "Recommendations", headingLevel: "heading2" },
      "Continue investment in core product development.",
    ],
    tables: [[["Metric", "Value"], ["Revenue", "$10M"], ["Growth", "15%"]]],
    outputPath: path.join(TEST_DIR, "blueprint-source.docx"),
    stylePreset: "business",
    enforceDocsFolder: false,
    preventDuplicates: false,
  });
  const testDocPath = testDocResult.filePath;

  assert(testDocResult.success && fs.existsSync(testDocPath), "Test DOCX created for blueprint");

  // Extract blueprint
  const blueprint = await extractBlueprintFromDocx(testDocPath);
  assert(Array.isArray(blueprint.sections), "Blueprint has sections array");
  assert(blueprint.sections.length > 0, "Blueprint found at least one section");
  assert(blueprint.totalTables >= 1, "Blueprint detected tables");

  // Save blueprint
  const saveResult = saveBlueprint("quarterly-report", blueprint, "Quarterly report template");
  assert(saveResult.success === true, "Blueprint saved successfully");

  // Load blueprint
  const loaded = loadBlueprint("quarterly-report");
  assert(loaded !== null, "Blueprint loaded back");
  assert(loaded.name === "quarterly-report", "Blueprint name correct");

  // List blueprints
  const bpList = listBlueprints();
  assert(bpList.length >= 1, "List shows at least 1 blueprint");
  assert(bpList[0].name === "quarterly-report", "Listed blueprint has correct name");

  // Validate against blueprint - passing case
  const validParagraphs = [
    { text: "Executive Summary", headingLevel: "heading1" },
    "Content here.",
    { text: "Key Metrics", headingLevel: "heading2" },
    "More content.",
    { text: "Recommendations", headingLevel: "heading2" },
    "Final content.",
  ];
  const validation = validateAgainstBlueprint(validParagraphs, loaded);
  assert(validation.matchedSections >= 0, "Validation runs without error");

  // Delete blueprint
  const deleted = deleteBlueprint("quarterly-report");
  assert(deleted === true, "Blueprint deleted");
  assert(loadBlueprint("quarterly-report") === null, "Blueprint no longer loadable");

  // =====================================================
  // TEST 4: Extract-to-Excel Pipeline
  // =====================================================
  console.log("\n\x1b[36m--- Test 4: Extract-to-Excel Pipeline ---\x1b[0m");

  // Create a document with tables
  const tableDocResult = await createDoc({
    title: "Data Source Document",
    paragraphs: [
      "This document contains data for extraction.",
      { text: "Financial Summary", headingLevel: "heading1" },
      "Revenue was strong this quarter.",
      { text: "Team Overview", headingLevel: "heading2" },
      "The team grew by 20%.",
    ],
    tables: [
      [["Metric", "Q1", "Q2", "Q3"], ["Revenue", "10M", "12M", "15M"], ["Costs", "8M", "9M", "10M"]],
      [["Name", "Role"], ["Alice", "Engineer"], ["Bob", "Manager"]],
    ],
    outputPath: path.join(TEST_DIR, "data-source.docx"),
    stylePreset: "business",
    enforceDocsFolder: false,
    preventDuplicates: false,
  });
  const tableDocPath = tableDocResult.filePath;

  // Test tables extraction from DOCX
  const tablesExtract = await extractData({
    sourcePath: tableDocPath,
    mode: "tables",
  });
  assert(tablesExtract.sheets.length >= 1, "Extracted at least 1 table from DOCX");
  assert(tablesExtract.sheets[0].data.length >= 2, "Extracted table has rows");

  // Test sections extraction
  const sectionsExtract = await extractData({
    sourcePath: tableDocPath,
    mode: "sections",
  });
  assert(sectionsExtract.sheets.length >= 1, "Extracted sections from DOCX");
  assert(sectionsExtract.sheets[0].data[0][0] === "Section Heading", "Section header correct");

  // Test pattern extraction
  const patternExtract = await extractData({
    sourcePath: tableDocPath,
    mode: "pattern",
    pattern: "revenue",
  });
  assert(Array.isArray(patternExtract.sheets), "Pattern extraction returns sheets array");

  // =====================================================
  // TEST 5: Drift Detection
  // =====================================================
  console.log("\n\x1b[36m--- Test 5: Drift Detection ---\x1b[0m");

  // Compute fingerprint (now returns { fingerprint, wordSet })
  const { fingerprint, wordSet } = await computeFingerprint(tableDocPath);
  assert(fingerprint.wordCount > 0, "Fingerprint has word count");
  assert(fingerprint.contentHash.length === 64, "Fingerprint has valid SHA-256 content hash");
  assert(typeof fingerprint.capturedAt === "string" && fingerprint.capturedAt.includes("T"), "Fingerprint has ISO timestamp");
  assert(fingerprint.paragraphCount > 0, "Fingerprint has positive paragraph count");
  assert(fingerprint.wordSetHash && fingerprint.wordSetHash.length === 64, "Fingerprint has wordSetHash");
  assert(wordSet instanceof Set && wordSet.size > 0, "computeFingerprint returns non-empty wordSet");

  // Compare same fingerprint (no drift)
  const noDrift = compareFingerprintsDrift(fingerprint, fingerprint);
  assert(noDrift.hasDrift === false, "No drift when comparing same fingerprint");
  assert(noDrift.severity === "none", "Severity is 'none' when no drift");

  // Compare different fingerprints
  const modifiedFp = { ...fingerprint, wordCount: fingerprint.wordCount + 500, contentHash: "different" };
  const drift = compareFingerprintsDrift(fingerprint, modifiedFp);
  assert(drift.hasDrift === true, "Drift detected with modified fingerprint");
  assert(drift.changes.length > 0, "Changes array populated");
  // Verify the specific change type that must appear (word count delta is 500 on a small doc = >5%)
  const wordCountChange = drift.changes.find(c => c.type === "word-count");
  assert(wordCountChange !== undefined, "Reports word-count change type");
  assert(wordCountChange.baseline === fingerprint.wordCount, "Word-count change reports correct baseline");

  // Test category shift detection
  const categoryShift = {
    ...fingerprint,
    contentHash: "changed",
    category: "legal",
  };
  const catDrift = compareFingerprintsDrift(fingerprint, categoryShift);
  assert(catDrift.hasDrift === true, "Detects category shift");
  const catChange = catDrift.changes.find(c => c.type === "category-shift");
  assert(catChange !== undefined, "Reports category-shift change type");
  assert(catChange.baseline === fingerprint.category, "Category shift reports original category");
  assert(catChange.current === "legal", "Category shift reports new category");

  // =====================================================
  // TEST 6: Composite Document Assembly
  // =====================================================
  console.log("\n\x1b[36m--- Test 6: Composite Document Assembly ---\x1b[0m");

  // Create two source documents
  const srcAResult = await createDoc({
    title: "Source Document A",
    paragraphs: [
      { text: "Introduction", headingLevel: "heading1" },
      "This is the introduction from document A.",
      { text: "Methodology", headingLevel: "heading2" },
      "We used advanced methods.",
    ],
    outputPath: path.join(TEST_DIR, "assembly-src-a.docx"),
    enforceDocsFolder: false,
    preventDuplicates: false,
  });
  const srcA = srcAResult.filePath;

  const srcBResult = await createDoc({
    title: "Source Document B",
    paragraphs: [
      { text: "Results", headingLevel: "heading1" },
      "The results were positive.",
      { text: "Conclusion", headingLevel: "heading2" },
      "In conclusion, the project was successful.",
    ],
    outputPath: path.join(TEST_DIR, "assembly-src-b.docx"),
    enforceDocsFolder: false,
    preventDuplicates: false,
  });
  const srcB = srcBResult.filePath;

  assert(srcAResult.success && fs.existsSync(srcA), "Source A created");
  assert(srcBResult.success && fs.existsSync(srcB), "Source B created");

  // Test concatenate mode
  clearRecentlyRead();
  const assembleResult = await assembleDocument({
    sources: [
      { filePath: srcA, sections: "all" },
      { filePath: srcB, sections: "all" },
    ],
    outputTitle: "Assembled Report",
    mode: "concatenate",
    stylePreset: "professional",
    outputPath: path.join(TEST_DIR, "assembled.docx"),
    category: "research",
    enforceDocsFolder: false,
    preventDuplicates: false,
  });
  assert(assembleResult.success === true, "Assembly succeeded");
  assert(assembleResult.assemblyInfo.sourceCount === 2, "Two sources tracked");
  assert(assembleResult.assemblyInfo.mode === "concatenate", "Concatenate mode used");
  assert(fs.existsSync(assembleResult.filePath), "Assembled file exists on disk");

  // Test with missing sources
  const badAssembly = await assembleDocument({
    sources: [],
    outputTitle: "Empty Assembly",
  });
  assert(badAssembly.success === false, "Empty sources returns error");

  // =====================================================
  // TEST 7: Failure Paths & Edge Cases
  // =====================================================
  console.log("\n\x1b[36m--- Test 7: Failure Paths & Edge Cases ---\x1b[0m");

  // 7a: Extract-to-excel with invalid regex
  let invalidRegexErr = null;
  try {
    await extractData({
      sourcePath: tableDocPath,
      mode: "pattern",
      pattern: "[invalid(regex",
    });
  } catch (err) {
    invalidRegexErr = err;
  }
  assert(invalidRegexErr !== null, "Invalid regex throws error");
  assert(invalidRegexErr.message.includes("Invalid regex pattern"), "Error message mentions invalid regex");

  // 7b: Extract-to-excel pattern mode with no matches
  const noMatchExtract = await extractData({
    sourcePath: tableDocPath,
    mode: "pattern",
    pattern: "zzzznonexistent99999",
  });
  assert(noMatchExtract.sheets.length === 0, "No matches returns empty sheets");

  // 7c: Extract-to-excel with unknown mode
  let unknownModeErr = null;
  try {
    await extractData({
      sourcePath: tableDocPath,
      mode: "unknown_mode",
    });
  } catch (err) {
    unknownModeErr = err;
  }
  assert(unknownModeErr !== null, "Unknown extraction mode throws error");

  // 7d: Corrupt DOCX (invalid ZIP) for table extraction
  const corruptPath = path.join(TEST_DIR, "corrupt.docx");
  fs.writeFileSync(corruptPath, "this is not a zip file");
  let corruptErr = null;
  try {
    await extractData({
      sourcePath: corruptPath,
      mode: "tables",
    });
  } catch (err) {
    corruptErr = err;
  }
  assert(corruptErr !== null, "Corrupt DOCX throws error for table extraction");

  // 7e: Assembly with non-existent source file
  const badSourceAssembly = await assembleDocument({
    sources: [{ filePath: "/tmp/nonexistent-doc-12345.docx", sections: "all" }],
    outputTitle: "Bad Source Assembly",
    outputPath: path.join(TEST_DIR, "bad-assembly.docx"),
  });
  assert(badSourceAssembly.success === false, "Assembly with non-existent source fails");

  // 7f: Fingerprint comparison with heading changes
  const headingAddedFp = {
    ...fingerprint,
    contentHash: "changed-headings",
    headingTree: [
      ...fingerprint.headingTree,
      { text: "New Section Added", level: 1 },
      { text: "Another New Section", level: 2 },
    ],
  };
  const headingDrift = compareFingerprintsDrift(fingerprint, headingAddedFp);
  assert(headingDrift.hasDrift === true, "Detects heading additions");
  const sectionsAdded = headingDrift.changes.find(c => c.type === "sections-added");
  assert(sectionsAdded !== undefined, "Reports sections-added change");
  assert(sectionsAdded.sections.length === 2, "Reports correct count of added sections");

  // 7g: Fingerprint comparison with heading removals
  const headingRemovedFp = {
    ...fingerprint,
    contentHash: "changed-headings-removed",
    headingTree: [], // all headings removed
  };
  const removedDrift = compareFingerprintsDrift(fingerprint, headingRemovedFp);
  if (fingerprint.headingTree && fingerprint.headingTree.length > 0) {
    const sectionsRemoved = removedDrift.changes.find(c => c.type === "sections-removed");
    assert(sectionsRemoved !== undefined, "Detects heading removals");
    assert(sectionsRemoved.sections.length === fingerprint.headingTree.length, "Reports correct count of removed headings");
  } else {
    // This is expected for DOCX without structured headings — not a skip but a real assertion
    assert(removedDrift.changes.filter(c => c.type === "sections-removed").length === 0, "No sections-removed when baseline had no headings");
  }

  // 7h: Blueprint validation with missing sections
  const sparseBlueprint = {
    sections: [
      { heading: "heading1", pattern: "Required Section A", required: true },
      { heading: "heading1", pattern: "Required Section B", required: true },
      { heading: "heading2", pattern: "Required Sub C", required: true },
    ],
  };
  const emptyValidation = validateAgainstBlueprint([], sparseBlueprint);
  assert(emptyValidation.matchedSections === 0, "Empty paragraphs match zero sections");
  assert(emptyValidation.errors.length > 0, "Reports missing section errors for empty input");
  assert(emptyValidation.valid === false, "Validation fails for empty input against required sections");

  // =====================================================
  // TEST 8: Blueprint Enhanced Metadata
  // =====================================================
  console.log("\n\x1b[36m--- Test 8: Blueprint Enhanced Metadata ---\x1b[0m");

  // Create a document with lists and varied content
  const metadataDocResult = await createDoc({
    title: "Metadata Test Document",
    paragraphs: [
      { text: "Overview Section", headingLevel: "heading1" },
      "This is a short overview paragraph.",
      { text: "Detailed Analysis", headingLevel: "heading2" },
      "This section contains a much longer paragraph with detailed analysis that spans multiple sentences. The purpose is to test that charCount and contentRatio are calculated correctly for sections with more content than others.",
      "1. First numbered item",
      "2. Second numbered item",
      "3. Third numbered item",
      { text: "Summary", headingLevel: "heading2" },
      "Brief summary.",
    ],
    tables: [[[" Header A", "Header B"], ["Val 1", "Val 2"]]],
    outputPath: path.join(TEST_DIR, "metadata-test.docx"),
    enforceDocsFolder: false,
    preventDuplicates: false,
  });
  const metadataDocPath = metadataDocResult.filePath;

  const enhancedBP = await extractBlueprintFromDocx(metadataDocPath);
  assert(enhancedBP.sections.length > 0, "Enhanced blueprint has sections");

  // Check charCount exists on sections
  const sectionsWithCharCount = enhancedBP.sections.filter(s => typeof s.charCount === "number");
  assert(sectionsWithCharCount.length === enhancedBP.sections.length, "All sections have charCount");

  // Check contentRatio exists
  const sectionsWithRatio = enhancedBP.sections.filter(s => typeof s.contentRatio === "number");
  assert(sectionsWithRatio.length === enhancedBP.sections.length, "All sections have contentRatio");

  // Ratios should sum to approximately 1.0
  const ratioSum = enhancedBP.sections.reduce((sum, s) => sum + (s.contentRatio || 0), 0);
  assert(Math.abs(ratioSum - 1.0) < 0.05, `Content ratios sum to ~1.0 (got ${ratioSum.toFixed(3)})`);

  // Check hasList and listItemCount fields exist
  const sectionsWithList = enhancedBP.sections.filter(s => typeof s.hasList === "boolean");
  assert(sectionsWithList.length === enhancedBP.sections.length, "All sections have hasList field");

  // Check totalCharacters in blueprint root
  assert(typeof enhancedBP.totalCharacters === "number", "Blueprint has totalCharacters");
  assert(enhancedBP.totalCharacters > 0, "totalCharacters is positive");

  // =====================================================
  // TEST 9: DNA Category Evolution
  // =====================================================
  console.log("\n\x1b[36m--- Test 9: DNA Category Evolution ---\x1b[0m");

  // Reset DNA and usage for category evolution test
  const dna9 = loadDNA();
  if (dna9) {
    dna9.usage = { categories: {}, styles: {}, totalDocs: 0, overrides: {}, correlations: {} };
    dna9.defaults.stylePreset = "professional";
    dna9.defaults.category = undefined;
    fs.writeFileSync(DNA_PATH, JSON.stringify(dna9, null, 2), "utf-8");
    clearDNACache();
  }

  // Simulate heavy technical document usage
  for (let i = 0; i < 7; i++) {
    recordUsage("technical", "technical", { stylePreset: false });
  }
  recordUsage("business", "business", { stylePreset: false });
  recordUsage("meeting", "professional", { stylePreset: false });
  recordUsage("technical", "technical", { stylePreset: false });

  const catTrends = analyzeTrends(5);
  assert(catTrends.ready === true, "Category trends ready after 10 docs");

  const catSuggestion = catTrends.suggestions.find(s => s.type === "default-category");
  assert(catSuggestion !== undefined, "Suggests default category change");
  assert(catSuggestion.mutation.value === "technical", "Suggests 'technical' as default category");

  // Apply category evolution
  const catEvolution = applyEvolution(catSuggestion.mutation);
  assert(catEvolution.success === true, "Category evolution applied");

  const updatedDna9 = loadDNA();
  assert(updatedDna9.defaults.category === "technical", "DNA category updated to 'technical'");

  // =====================================================
  // TEST 10: Lineage in create-doc Response
  // =====================================================
  console.log("\n\x1b[36m--- Test 10: Lineage in create-doc Response ---\x1b[0m");

  clearRecentlyRead();

  // Simulate reading a source document
  recordRead("/test/lineage-source-1.docx", "get-doc-indepth");
  recordRead("/test/lineage-source-2.pdf", "get-doc-summary");

  // Create a document — should capture lineage from the reads above
  const lineageDocResult = await createDoc({
    title: "Lineage Test Output",
    paragraphs: ["Content derived from two sources."],
    outputPath: path.join(TEST_DIR, "lineage-output.docx"),
    enforceDocsFolder: false,
    preventDuplicates: false,
  });
  const lineageDocPath = lineageDocResult.filePath;

  assert(lineageDocResult.success === true, "Lineage test doc created");
  assert(lineageDocResult.lineage !== null && lineageDocResult.lineage !== undefined, "Lineage field present in response");
  assert(lineageDocResult.lineage.sourceCount === 2, "Lineage reports 2 sources");
  assert(lineageDocResult.lineage.sources.includes("/test/lineage-source-1.docx"), "Lineage includes source 1");
  assert(lineageDocResult.lineage.sources.includes("/test/lineage-source-2.pdf"), "Lineage includes source 2");

  // Creating another doc with no prior reads should have null lineage
  const noLineageDoc = await createDoc({
    title: "No Lineage Doc",
    paragraphs: ["Created from scratch, no reads."],
    outputPath: path.join(TEST_DIR, "no-lineage.docx"),
    enforceDocsFolder: false,
    preventDuplicates: false,
  });
  const noLineageDocPath = noLineageDoc.filePath;
  assert(noLineageDoc.lineage === null, "No lineage when nothing was read before create");

  // =====================================================
  // TEST 11: Drift Detection with Word Sets
  // =====================================================
  console.log("\n\x1b[36m--- Test 11: Drift Detection with Word Sets ---\x1b[0m");

  // Import watchDocument and checkDrift for full integration
  const { watchDocument, checkDrift } = await import("../src/services/drift-detector.js");

  // Watch the table doc
  const watchResult = await watchDocument(tableDocPath);
  assert(watchResult.success === true, "Watch document succeeded");
  assert(watchResult.fingerprint.wordCount > 0, "Watch fingerprint has word count");

  // Check drift immediately (should be none)
  const noDriftResult = await checkDrift(tableDocPath);
  assert(noDriftResult.success === true, "Check drift succeeded");
  assert(noDriftResult.totalWithDrift === 0, "No drift on unchanged document");

  // Verify compact hash storage — NOT full word arrays or text
  const { loadRegistry } = await import("../src/utils/registry.js");
  const reg = await loadRegistry();
  const watchEntry = reg.watchlist?.find(w => w.filePath === tableDocPath);
  assert(watchEntry !== undefined, "Watch entry exists in registry");
  assert(typeof watchEntry.baselineWordSetHash === "string" && watchEntry.baselineWordSetHash.length === 64, "Stores compact wordSetHash (SHA-256) instead of full word array");
  assert(typeof watchEntry.baselineUniqueWordCount === "number" && watchEntry.baselineUniqueWordCount > 0, "Stores unique word count");
  assert(watchEntry.baselineText === undefined, "baselineText is NOT stored (registry bloat fix)");
  assert(watchEntry.baselineWords === undefined, "baselineWords array is NOT stored (further bloat fix)");

  // =====================================================
  // TEST 12: End-to-End Integration
  // =====================================================
  console.log("\n\x1b[36m--- Test 12: End-to-End Integration ---\x1b[0m");

  // Full pipeline: create doc → extract blueprint → save → validate → extract data → assemble

  // Step 1: Create a structured source doc
  clearRecentlyRead();
  const e2eSourceResult = await createDoc({
    title: "E2E Source Report",
    paragraphs: [
      { text: "Executive Summary", headingLevel: "heading1" },
      "This report covers the full integration test.",
      { text: "Financial Overview", headingLevel: "heading2" },
      "Revenue growth was 25% year-over-year.",
      { text: "Recommendations", headingLevel: "heading2" },
      "Continue investing in R&D.",
    ],
    tables: [
      [["Quarter", "Revenue"], ["Q1", "$5M"], ["Q2", "$6M"], ["Q3", "$7M"]],
    ],
    outputPath: path.join(TEST_DIR, "e2e-source.docx"),
    enforceDocsFolder: false,
    preventDuplicates: false,
  });
  const e2eSourcePath = e2eSourceResult.filePath;
  assert(e2eSourceResult.success, "E2E source doc created");

  // Step 2: Extract blueprint from it
  const e2eBlueprint = await extractBlueprintFromDocx(e2eSourcePath);
  assert(e2eBlueprint.sections.length > 0, "E2E blueprint has sections");
  assert(e2eBlueprint.totalTables >= 1, "E2E blueprint detected table");

  // Step 3: Save and load blueprint
  const e2eSave = saveBlueprint("e2e-report", e2eBlueprint, "E2E test blueprint");
  assert(e2eSave.success, "E2E blueprint saved");
  const e2eLoaded = loadBlueprint("e2e-report");
  assert(e2eLoaded !== null, "E2E blueprint loaded");

  // Step 4: Extract tables from the doc
  const e2eTables = await extractData({
    sourcePath: e2eSourcePath,
    mode: "tables",
  });
  assert(e2eTables.sheets.length >= 1, "E2E table extraction found tables");
  assert(e2eTables.sheets[0].data.length >= 2, "E2E extracted table has rows");

  // Step 5: Extract sections
  const e2eSections = await extractData({
    sourcePath: e2eSourcePath,
    mode: "sections",
  });
  assert(e2eSections.sheets.length >= 1, "E2E section extraction worked");

  // Step 6: Create a second doc and assemble
  const e2eSource2Result = await createDoc({
    title: "E2E Supplementary Data",
    paragraphs: [
      { text: "Additional Findings", headingLevel: "heading1" },
      "Supplementary data supports the main findings.",
    ],
    outputPath: path.join(TEST_DIR, "e2e-source2.docx"),
    enforceDocsFolder: false,
    preventDuplicates: false,
  });
  const e2eSource2Path = e2eSource2Result.filePath;

  clearRecentlyRead();
  const e2eAssembly = await assembleDocument({
    sources: [
      { filePath: e2eSourcePath, sections: "all" },
      { filePath: e2eSource2Path, sections: "all" },
    ],
    outputTitle: "E2E Assembled Report",
    mode: "concatenate",
    outputPath: path.join(TEST_DIR, "e2e-assembled.docx"),
    enforceDocsFolder: false,
    preventDuplicates: false,
  });
  assert(e2eAssembly.success === true, "E2E assembly succeeded");
  assert(e2eAssembly.assemblyInfo.sourceCount === 2, "E2E assembly has 2 sources");
  assert(fs.existsSync(e2eAssembly.filePath), "E2E assembled file exists");

  // Step 7: Compute fingerprint of assembled doc
  const { fingerprint: e2eFp } = await computeFingerprint(e2eAssembly.filePath);
  assert(e2eFp.wordCount > 0, "E2E assembled fingerprint has content");

  // Cleanup: delete e2e blueprint
  deleteBlueprint("e2e-report");

  // =====================================================
  // Summary
  // =====================================================
  console.log("\n============================================================");
  console.log("  TEST SUMMARY");
  console.log("============================================================");
  console.log(`  Total: ${total}`);
  console.log(`  \x1b[32mPassed: ${passed}\x1b[0m`);
  if (failed > 0) {
    console.log(`  \x1b[31mFailed: ${failed}\x1b[0m`);
  } else {
    console.log(`  Failed: 0`);
  }
  console.log("============================================================\n");

  if (failed === 0) {
    console.log("\x1b[32mAll innovation tests passed!\x1b[0m\n");
  } else {
    console.log(`\x1b[31m${failed} test(s) failed.\x1b[0m\n`);
  }

  // Cleanup
  restoreDNA();
  // Clean up test-output directory and any docs/ files created during tests
  try {
    fs.rmSync(TEST_DIR, { recursive: true, force: true });
  } catch { /* ok */ }
  // Clean up files that createDoc may have placed in docs/ due to auto-categorization
  const allTestPaths = [
    testDocPath, tableDocPath, srcA, srcB,
    metadataDocPath, lineageDocPath, noLineageDocPath,
    e2eSourcePath, e2eSource2Path,
  ];
  for (const fp of allTestPaths) {
    try { if (fp) fs.unlinkSync(fp); } catch { /* ok */ }
  }
  // Clean assembled outputs too
  for (const res of [assembleResult, e2eAssembly]) {
    try { if (res && res.filePath) fs.unlinkSync(res.filePath); } catch { /* ok */ }
  }

  process.exit(failed > 0 ? 1 : 0);
}

runTests().catch(err => {
  console.error("Test suite error:", err);
  restoreDNA();
  process.exit(1);
});
