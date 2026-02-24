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

import { describe, test, before, after } from "node:test";
import assert from "node:assert/strict";
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

// Module-scoped variables shared across tests
let dnaBackup = null;

// File paths created during tests (needed for cleanup in after hook)
let testDocPath = null;
let tableDocPath = null;
let metadataDocPath = null;
let lineageDocPath = null;
let noLineageDocPath = null;
let srcA = null;
let srcB = null;
let e2eSourcePath = null;
let e2eSource2Path = null;
let assembleResultPath = null;
let e2eAssemblyPath = null;

// Shared state between Test 5 and Test 7 (fingerprint)
let fingerprint = null;
let wordSet = null;

describe("Innovation Features", async () => {
  before(async () => {
    // Backup DNA
    try {
      dnaBackup = fs.readFileSync(DNA_PATH, "utf-8");
    } catch {
      dnaBackup = null;
    }

    // Create test output directory
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
  });

  after(() => {
    // Restore DNA
    if (dnaBackup) {
      fs.writeFileSync(DNA_PATH, dnaBackup, "utf-8");
    } else {
      try { fs.unlinkSync(DNA_PATH); } catch { /* ok */ }
    }
    clearDNACache();

    // Clean up test-output directory
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
    for (const fp of [assembleResultPath, e2eAssemblyPath]) {
      try { if (fp) fs.unlinkSync(fp); } catch { /* ok */ }
    }
  });

  // =====================================================
  // TEST 1: Adaptive DNA Evolution
  // =====================================================
  describe("Test 1: Adaptive DNA Evolution", () => {
    before(() => {
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
    });

    test("analyzeTrends reports ready after 10 docs", () => {
      const trends = analyzeTrends(5);
      assert.ok(trends.ready === true, "analyzeTrends reports ready after 10 docs");
    });

    test("tracked 10 total documents", () => {
      const trends = analyzeTrends(5);
      assert.equal(trends.totalDocs, 10, "Tracked 10 total documents");
    });

    test("returns suggestions array", () => {
      const trends = analyzeTrends(5);
      assert.ok(Array.isArray(trends.suggestions), "Returns suggestions array");
    });

    test("has at least one suggestion", () => {
      const trends = analyzeTrends(5);
      assert.ok(trends.suggestions.length > 0, "Has at least one suggestion");
    });

    test("suggests default style change to business", () => {
      const trends = analyzeTrends(5);
      const styleSuggestion = trends.suggestions.find(s => s.type === "default-style");
      assert.ok(styleSuggestion !== undefined, "Suggests default style change");
      assert.equal(styleSuggestion.mutation.value, "business", "Suggests 'business' as default style");
    });

    test("evolution applied successfully", () => {
      const trends = analyzeTrends(5);
      const styleSuggestion = trends.suggestions.find(s => s.type === "default-style");
      const evolutionResult = applyEvolution(styleSuggestion.mutation);
      assert.ok(evolutionResult.success === true, "Evolution applied successfully");
      assert.equal(evolutionResult.newValue, "business", "DNA style updated to 'business'");
    });

    test("DNA file reflects evolved style", () => {
      const updatedDna = loadDNA();
      assert.equal(updatedDna.defaults.stylePreset, "business", "DNA file reflects evolved style");
    });

    test("evolution timestamp recorded", () => {
      const updatedDna = loadDNA();
      assert.ok(updatedDna.usage.lastEvolutionAt !== null, "Evolution timestamp recorded");
    });

    test("not ready when threshold not met", () => {
      clearDNACache();
      const earlyTrends = analyzeTrends(100);
      assert.ok(earlyTrends.ready === false, "Not ready when threshold not met");
    });
  });

  // =====================================================
  // TEST 2: Document Lineage Graph
  // =====================================================
  describe("Test 2: Document Lineage Graph", () => {
    before(() => {
      clearRecentlyRead();
    });

    test("tracks recently read documents", () => {
      recordRead("/test/source-a.docx", "get-doc-indepth");
      recordRead("/test/source-b.pdf", "get-doc-summary");

      const recentlyReadDocs = getRecentlyRead();
      assert.equal(recentlyReadDocs.length, 2, "Tracked 2 recently read documents");
      assert.equal(recentlyReadDocs[0].filePath, "/test/source-a.docx", "First read tracked correctly");
    });

    test("lineage recorded on write", async () => {
      const lineageResult = await recordWrite("/test/output.docx");
      assert.ok(lineageResult !== null, "Lineage recorded on write");
      assert.equal(lineageResult.sources.length, 2, "Two sources captured");
      assert.equal(lineageResult.sources[0].tool, "get-doc-indepth", "Tool name captured");
    });

    test("recently read cleared after write", () => {
      const afterWrite = getRecentlyRead();
      assert.equal(afterWrite.length, 0, "Recently read cleared after write");
    });

    test("no lineage when nothing was read", async () => {
      const emptyLineage = await recordWrite("/test/another.docx");
      assert.equal(emptyLineage, null, "No lineage when nothing was read");
    });
  });

  // =====================================================
  // TEST 3: Document Blueprints
  // =====================================================
  describe("Test 3: Document Blueprints", () => {
    before(async () => {
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
      testDocPath = testDocResult.filePath;
    });

    test("test DOCX created for blueprint", () => {
      assert.ok(testDocPath && fs.existsSync(testDocPath), "Test DOCX created for blueprint");
    });

    test("blueprint has sections array", async () => {
      const blueprint = await extractBlueprintFromDocx(testDocPath);
      assert.ok(Array.isArray(blueprint.sections), "Blueprint has sections array");
      assert.ok(blueprint.sections.length > 0, "Blueprint found at least one section");
    });

    test("blueprint detected tables", async () => {
      const blueprint = await extractBlueprintFromDocx(testDocPath);
      assert.ok(blueprint.totalTables >= 1, "Blueprint detected tables");
    });

    test("blueprint save and load cycle", async () => {
      const blueprint = await extractBlueprintFromDocx(testDocPath);

      const saveResult = saveBlueprint("quarterly-report", blueprint, "Quarterly report template");
      assert.ok(saveResult.success === true, "Blueprint saved successfully");

      const loaded = loadBlueprint("quarterly-report");
      assert.ok(loaded !== null, "Blueprint loaded back");
      assert.equal(loaded.name, "quarterly-report", "Blueprint name correct");
    });

    test("list blueprints shows saved blueprint", () => {
      const bpList = listBlueprints();
      assert.ok(bpList.length >= 1, "List shows at least 1 blueprint");
      assert.equal(bpList[0].name, "quarterly-report", "Listed blueprint has correct name");
    });

    test("validate against blueprint runs without error", () => {
      const loaded = loadBlueprint("quarterly-report");
      const validParagraphs = [
        { text: "Executive Summary", headingLevel: "heading1" },
        "Content here.",
        { text: "Key Metrics", headingLevel: "heading2" },
        "More content.",
        { text: "Recommendations", headingLevel: "heading2" },
        "Final content.",
      ];
      const validation = validateAgainstBlueprint(validParagraphs, loaded);
      assert.ok(validation.matchedSections >= 0, "Validation runs without error");
    });

    test("blueprint delete and verify", () => {
      const deleted = deleteBlueprint("quarterly-report");
      assert.ok(deleted === true, "Blueprint deleted");
      assert.equal(loadBlueprint("quarterly-report"), null, "Blueprint no longer loadable");
    });
  });

  // =====================================================
  // TEST 4: Extract-to-Excel Pipeline
  // =====================================================
  describe("Test 4: Extract-to-Excel Pipeline", () => {
    before(async () => {
      const tableDocResult = await createDoc({
        title: "Financial Performance and Team Composition — Data Source",
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
      tableDocPath = tableDocResult.filePath;
    });

    test("extracts tables from DOCX", async () => {
      const tablesExtract = await extractData({
        sourcePath: tableDocPath,
        mode: "tables",
      });
      assert.ok(tablesExtract.sheets.length >= 1, "Extracted at least 1 table from DOCX");
      assert.ok(tablesExtract.sheets[0].data.length >= 2, "Extracted table has rows");
    });

    test("extracts sections from DOCX", async () => {
      const sectionsExtract = await extractData({
        sourcePath: tableDocPath,
        mode: "sections",
      });
      assert.ok(sectionsExtract.sheets.length >= 1, "Extracted sections from DOCX");
      assert.equal(sectionsExtract.sheets[0].data[0][0], "Section Heading", "Section header correct");
    });

    test("pattern extraction returns sheets array", async () => {
      const patternExtract = await extractData({
        sourcePath: tableDocPath,
        mode: "pattern",
        pattern: "revenue",
      });
      assert.ok(Array.isArray(patternExtract.sheets), "Pattern extraction returns sheets array");
    });
  });

  // =====================================================
  // TEST 5: Drift Detection
  // =====================================================
  describe("Test 5: Drift Detection", () => {
    test("computes fingerprint with valid fields", async () => {
      const result = await computeFingerprint(tableDocPath);
      fingerprint = result.fingerprint;
      wordSet = result.wordSet;

      assert.ok(fingerprint.wordCount > 0, "Fingerprint has word count");
      assert.equal(fingerprint.contentHash.length, 64, "Fingerprint has valid SHA-256 content hash");
      assert.ok(typeof fingerprint.capturedAt === "string" && fingerprint.capturedAt.includes("T"), "Fingerprint has ISO timestamp");
      assert.ok(fingerprint.paragraphCount > 0, "Fingerprint has positive paragraph count");
      assert.ok(fingerprint.wordSetHash && fingerprint.wordSetHash.length === 64, "Fingerprint has wordSetHash");
      assert.ok(wordSet instanceof Set && wordSet.size > 0, "computeFingerprint returns non-empty wordSet");
    });

    test("no drift when comparing same fingerprint", () => {
      const noDrift = compareFingerprintsDrift(fingerprint, fingerprint);
      assert.ok(noDrift.hasDrift === false, "No drift when comparing same fingerprint");
      assert.equal(noDrift.severity, "none", "Severity is 'none' when no drift");
    });

    test("drift detected with modified fingerprint", () => {
      const modifiedFp = { ...fingerprint, wordCount: fingerprint.wordCount + 500, contentHash: "different" };
      const drift = compareFingerprintsDrift(fingerprint, modifiedFp);
      assert.ok(drift.hasDrift === true, "Drift detected with modified fingerprint");
      assert.ok(drift.changes.length > 0, "Changes array populated");

      const wordCountChange = drift.changes.find(c => c.type === "word-count");
      assert.ok(wordCountChange !== undefined, "Reports word-count change type");
      assert.equal(wordCountChange.baseline, fingerprint.wordCount, "Word-count change reports correct baseline");
    });

    test("detects category shift", () => {
      const categoryShift = {
        ...fingerprint,
        contentHash: "changed",
        category: "legal",
      };
      const catDrift = compareFingerprintsDrift(fingerprint, categoryShift);
      assert.ok(catDrift.hasDrift === true, "Detects category shift");

      const catChange = catDrift.changes.find(c => c.type === "category-shift");
      assert.ok(catChange !== undefined, "Reports category-shift change type");
      assert.equal(catChange.baseline, fingerprint.category, "Category shift reports original category");
      assert.equal(catChange.current, "legal", "Category shift reports new category");
    });
  });

  // =====================================================
  // TEST 6: Composite Document Assembly
  // =====================================================
  describe("Test 6: Composite Document Assembly", () => {
    before(async () => {
      const srcAResult = await createDoc({
        title: "Research Methodology and Introduction — Part A",
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
      srcA = srcAResult.filePath;

      const srcBResult = await createDoc({
        title: "Research Findings and Conclusion — Part B",
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
      srcB = srcBResult.filePath;
    });

    test("source documents created", () => {
      assert.ok(srcA && fs.existsSync(srcA), "Source A created");
      assert.ok(srcB && fs.existsSync(srcB), "Source B created");
    });

    test("concatenate assembly succeeds", async () => {
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
      assembleResultPath = assembleResult.filePath;

      assert.ok(assembleResult.success === true, "Assembly succeeded");
      assert.equal(assembleResult.assemblyInfo.sourceCount, 2, "Two sources tracked");
      assert.equal(assembleResult.assemblyInfo.mode, "concatenate", "Concatenate mode used");
      assert.ok(fs.existsSync(assembleResult.filePath), "Assembled file exists on disk");
    });

    test("empty sources returns error", async () => {
      const badAssembly = await assembleDocument({
        sources: [],
        outputTitle: "Empty Assembly",
      });
      assert.ok(badAssembly.success === false, "Empty sources returns error");
    });
  });

  // =====================================================
  // TEST 7: Failure Paths & Edge Cases
  // =====================================================
  describe("Test 7: Failure Paths & Edge Cases", () => {
    test("7a: invalid regex throws error", async () => {
      await assert.rejects(
        async () => {
          await extractData({
            sourcePath: tableDocPath,
            mode: "pattern",
            pattern: "[invalid(regex",
          });
        },
        (err) => {
          assert.ok(err.message.includes("Invalid regex pattern"), "Error message mentions invalid regex");
          return true;
        },
        "Invalid regex throws error"
      );
    });

    test("7b: pattern mode with no matches returns empty sheets", async () => {
      const noMatchExtract = await extractData({
        sourcePath: tableDocPath,
        mode: "pattern",
        pattern: "zzzznonexistent99999",
      });
      assert.equal(noMatchExtract.sheets.length, 0, "No matches returns empty sheets");
    });

    test("7c: unknown extraction mode throws error", async () => {
      await assert.rejects(
        async () => {
          await extractData({
            sourcePath: tableDocPath,
            mode: "unknown_mode",
          });
        },
        "Unknown extraction mode throws error"
      );
    });

    test("7d: corrupt DOCX throws error for table extraction", async () => {
      const corruptPath = path.join(TEST_DIR, "corrupt.docx");
      fs.writeFileSync(corruptPath, "this is not a zip file");
      await assert.rejects(
        async () => {
          await extractData({
            sourcePath: corruptPath,
            mode: "tables",
          });
        },
        "Corrupt DOCX throws error for table extraction"
      );
    });

    test("7e: assembly with non-existent source file fails", async () => {
      const badSourceAssembly = await assembleDocument({
        sources: [{ filePath: "/tmp/nonexistent-doc-12345.docx", sections: "all" }],
        outputTitle: "Bad Source Assembly",
        outputPath: path.join(TEST_DIR, "bad-assembly.docx"),
      });
      assert.ok(badSourceAssembly.success === false, "Assembly with non-existent source fails");
    });

    test("7f: detects heading additions", () => {
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
      assert.ok(headingDrift.hasDrift === true, "Detects heading additions");

      const sectionsAdded = headingDrift.changes.find(c => c.type === "sections-added");
      assert.ok(sectionsAdded !== undefined, "Reports sections-added change");
      assert.equal(sectionsAdded.sections.length, 2, "Reports correct count of added sections");
    });

    test("7g: detects heading removals", () => {
      const headingRemovedFp = {
        ...fingerprint,
        contentHash: "changed-headings-removed",
        headingTree: [],
      };
      const removedDrift = compareFingerprintsDrift(fingerprint, headingRemovedFp);

      if (fingerprint.headingTree && fingerprint.headingTree.length > 0) {
        const sectionsRemoved = removedDrift.changes.find(c => c.type === "sections-removed");
        assert.ok(sectionsRemoved !== undefined, "Detects heading removals");
        assert.equal(sectionsRemoved.sections.length, fingerprint.headingTree.length, "Reports correct count of removed headings");
      } else {
        const removed = removedDrift.changes.filter(c => c.type === "sections-removed");
        assert.equal(removed.length, 0, "No sections-removed when baseline had no headings");
      }
    });

    test("7h: blueprint validation with missing sections", () => {
      const sparseBlueprint = {
        sections: [
          { heading: "heading1", pattern: "Required Section A", required: true },
          { heading: "heading1", pattern: "Required Section B", required: true },
          { heading: "heading2", pattern: "Required Sub C", required: true },
        ],
      };
      const emptyValidation = validateAgainstBlueprint([], sparseBlueprint);
      assert.equal(emptyValidation.matchedSections, 0, "Empty paragraphs match zero sections");
      assert.ok(emptyValidation.errors.length > 0, "Reports missing section errors for empty input");
      assert.ok(emptyValidation.valid === false, "Validation fails for empty input against required sections");
    });
  });

  // =====================================================
  // TEST 8: Blueprint Enhanced Metadata
  // =====================================================
  describe("Test 8: Blueprint Enhanced Metadata", () => {
    let enhancedBP = null;

    before(async () => {
      const metadataDocResult = await createDoc({
        title: "Blueprint Metadata Validation — Section Depth Analysis",
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
      metadataDocPath = metadataDocResult.filePath;

      enhancedBP = await extractBlueprintFromDocx(metadataDocPath);
    });

    test("enhanced blueprint has sections", () => {
      assert.ok(enhancedBP.sections.length > 0, "Enhanced blueprint has sections");
    });

    test("all sections have charCount", () => {
      const sectionsWithCharCount = enhancedBP.sections.filter(s => typeof s.charCount === "number");
      assert.equal(sectionsWithCharCount.length, enhancedBP.sections.length, "All sections have charCount");
    });

    test("all sections have contentRatio", () => {
      const sectionsWithRatio = enhancedBP.sections.filter(s => typeof s.contentRatio === "number");
      assert.equal(sectionsWithRatio.length, enhancedBP.sections.length, "All sections have contentRatio");
    });

    test("content ratios sum to approximately 1.0", () => {
      const ratioSum = enhancedBP.sections.reduce((sum, s) => sum + (s.contentRatio || 0), 0);
      assert.ok(Math.abs(ratioSum - 1.0) < 0.05, `Content ratios sum to ~1.0 (got ${ratioSum.toFixed(3)})`);
    });

    test("all sections have hasList field", () => {
      const sectionsWithList = enhancedBP.sections.filter(s => typeof s.hasList === "boolean");
      assert.equal(sectionsWithList.length, enhancedBP.sections.length, "All sections have hasList field");
    });

    test("blueprint has positive totalCharacters", () => {
      assert.ok(typeof enhancedBP.totalCharacters === "number", "Blueprint has totalCharacters");
      assert.ok(enhancedBP.totalCharacters > 0, "totalCharacters is positive");
    });
  });

  // =====================================================
  // TEST 9: DNA Category Evolution
  // =====================================================
  describe("Test 9: DNA Category Evolution", () => {
    before(() => {
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
    });

    test("category trends ready after 10 docs", () => {
      const catTrends = analyzeTrends(5);
      assert.ok(catTrends.ready === true, "Category trends ready after 10 docs");
    });

    test("suggests technical as default category", () => {
      const catTrends = analyzeTrends(5);
      const catSuggestion = catTrends.suggestions.find(s => s.type === "default-category");
      assert.ok(catSuggestion !== undefined, "Suggests default category change");
      assert.equal(catSuggestion.mutation.value, "technical", "Suggests 'technical' as default category");
    });

    test("category evolution applied and reflected in DNA", () => {
      const catTrends = analyzeTrends(5);
      const catSuggestion = catTrends.suggestions.find(s => s.type === "default-category");
      const catEvolution = applyEvolution(catSuggestion.mutation);
      assert.ok(catEvolution.success === true, "Category evolution applied");

      const updatedDna9 = loadDNA();
      assert.equal(updatedDna9.defaults.category, "technical", "DNA category updated to 'technical'");
    });
  });

  // =====================================================
  // TEST 10: Lineage in create-doc Response
  // =====================================================
  describe("Test 10: Lineage in create-doc Response", () => {
    test("create-doc captures lineage from prior reads", async () => {
      clearRecentlyRead();

      recordRead("/test/lineage-source-1.docx", "get-doc-indepth");
      recordRead("/test/lineage-source-2.pdf", "get-doc-summary");

      const lineageDocResult = await createDoc({
        title: "Consolidated Analysis — Derived from Multiple Sources",
        paragraphs: ["Content derived from two sources."],
        outputPath: path.join(TEST_DIR, "lineage-output.docx"),
        enforceDocsFolder: false,
        preventDuplicates: false,
      });
      lineageDocPath = lineageDocResult.filePath;

      assert.ok(lineageDocResult.success === true, "Lineage test doc created");
      assert.ok(lineageDocResult.lineage !== null && lineageDocResult.lineage !== undefined, "Lineage field present in response");
      assert.equal(lineageDocResult.lineage.sourceCount, 2, "Lineage reports 2 sources");
      assert.ok(lineageDocResult.lineage.sources.includes("/test/lineage-source-1.docx"), "Lineage includes source 1");
      assert.ok(lineageDocResult.lineage.sources.includes("/test/lineage-source-2.pdf"), "Lineage includes source 2");
    });

    test("no lineage when nothing was read before create", async () => {
      const noLineageDoc = await createDoc({
        title: "Standalone Technical Specification — No Prior Sources",
        paragraphs: ["Created from scratch, no reads."],
        outputPath: path.join(TEST_DIR, "no-lineage.docx"),
        enforceDocsFolder: false,
        preventDuplicates: false,
      });
      noLineageDocPath = noLineageDoc.filePath;
      assert.equal(noLineageDoc.lineage, null, "No lineage when nothing was read before create");
    });
  });

  // =====================================================
  // TEST 11: Drift Detection with Word Sets
  // =====================================================
  describe("Test 11: Drift Detection with Word Sets", () => {
    test("watch document and check drift", async () => {
      const { watchDocument, checkDrift } = await import("../src/services/drift-detector.js");

      const watchResult = await watchDocument(tableDocPath);
      assert.ok(watchResult.success === true, "Watch document succeeded");
      assert.ok(watchResult.fingerprint.wordCount > 0, "Watch fingerprint has word count");

      const noDriftResult = await checkDrift(tableDocPath);
      assert.ok(noDriftResult.success === true, "Check drift succeeded");
      assert.equal(noDriftResult.totalWithDrift, 0, "No drift on unchanged document");
    });

    test("compact hash storage in registry", async () => {
      const { loadRegistry } = await import("../src/utils/registry.js");
      const reg = await loadRegistry();
      const watchEntry = reg.watchlist?.find(w => w.filePath === tableDocPath);

      assert.ok(watchEntry !== undefined, "Watch entry exists in registry");
      assert.ok(typeof watchEntry.baselineWordSetHash === "string" && watchEntry.baselineWordSetHash.length === 64, "Stores compact wordSetHash (SHA-256) instead of full word array");
      assert.ok(typeof watchEntry.baselineUniqueWordCount === "number" && watchEntry.baselineUniqueWordCount > 0, "Stores unique word count");
      assert.equal(watchEntry.baselineText, undefined, "baselineText is NOT stored (registry bloat fix)");
      assert.equal(watchEntry.baselineWords, undefined, "baselineWords array is NOT stored (further bloat fix)");
    });
  });

  // =====================================================
  // TEST 12: End-to-End Integration
  // =====================================================
  describe("Test 12: End-to-End Integration", () => {
    test("full pipeline: create, blueprint, extract, assemble, fingerprint", async () => {
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
      e2eSourcePath = e2eSourceResult.filePath;
      assert.ok(e2eSourceResult.success, "E2E source doc created");

      // Step 2: Extract blueprint from it
      const e2eBlueprint = await extractBlueprintFromDocx(e2eSourcePath);
      assert.ok(e2eBlueprint.sections.length > 0, "E2E blueprint has sections");
      assert.ok(e2eBlueprint.totalTables >= 1, "E2E blueprint detected table");

      // Step 3: Save and load blueprint
      const e2eSave = saveBlueprint("e2e-report", e2eBlueprint, "E2E test blueprint");
      assert.ok(e2eSave.success, "E2E blueprint saved");
      const e2eLoaded = loadBlueprint("e2e-report");
      assert.ok(e2eLoaded !== null, "E2E blueprint loaded");

      // Step 4: Extract tables from the doc
      const e2eTables = await extractData({
        sourcePath: e2eSourcePath,
        mode: "tables",
      });
      assert.ok(e2eTables.sheets.length >= 1, "E2E table extraction found tables");
      assert.ok(e2eTables.sheets[0].data.length >= 2, "E2E extracted table has rows");

      // Step 5: Extract sections
      const e2eSections = await extractData({
        sourcePath: e2eSourcePath,
        mode: "sections",
      });
      assert.ok(e2eSections.sheets.length >= 1, "E2E section extraction worked");

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
      e2eSource2Path = e2eSource2Result.filePath;

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
      e2eAssemblyPath = e2eAssembly.filePath;

      assert.ok(e2eAssembly.success === true, "E2E assembly succeeded");
      assert.equal(e2eAssembly.assemblyInfo.sourceCount, 2, "E2E assembly has 2 sources");
      assert.ok(fs.existsSync(e2eAssembly.filePath), "E2E assembled file exists");

      // Step 7: Compute fingerprint of assembled doc
      const { fingerprint: e2eFp } = await computeFingerprint(e2eAssembly.filePath);
      assert.ok(e2eFp.wordCount > 0, "E2E assembled fingerprint has content");

      // Cleanup: delete e2e blueprint
      deleteBlueprint("e2e-report");
    });
  });
});
