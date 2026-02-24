/**
 * Tests for Automatic Blueprint Learning:
 *   1. convertSignatureToBlueprint produces valid sections
 *   2. generateAutoBlueprintName generates correct names
 *   3. generateAutoBlueprintName reuses name for same signature
 *   4. generateAutoBlueprintName appends suffix on collision
 *   5. End-to-end: similar docs → dna evolve → blueprint auto-saved
 *   6. Auto-match: create doc matching auto-blueprint → blueprintMatch in response
 *   7. No match when no auto-learned blueprints exist
 *   8. No match when signatures differ
 *   9. Manual blueprint learn still works independently
 */

import { describe, test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";
import {
  convertSignatureToBlueprint,
  generateAutoBlueprintName,
  recordUsage,
  detectRecurringStructures,
  createDNAFile,
  clearDNACache,
} from "../src/utils/dna-manager.js";
import {
  saveBlueprint,
  loadBlueprint,
  listBlueprints,
  deleteBlueprint,
  clearBlueprintCache,
} from "../src/utils/blueprint-store.js";
import { createDoc } from "../src/tools/create-doc.js";
import { handleDNA } from "../src/tools/dna-tool.js";

const TEST_DIR = path.join(process.cwd(), "test-output-auto-blueprint");
const DNA_PATH = path.join(process.cwd(), ".document-dna.json");
const BLUEPRINT_PATH = path.join(process.cwd(), ".document-blueprints.json");

let dnaBackup = null;
let blueprintBackup = null;

describe("Auto Blueprint Learning", () => {
  before(() => {
    // Backup existing files
    try { dnaBackup = fs.readFileSync(DNA_PATH, "utf-8"); } catch { /* ok */ }
    try { blueprintBackup = fs.readFileSync(BLUEPRINT_PATH, "utf-8"); } catch { /* ok */ }

    // Clean slate
    try { fs.unlinkSync(BLUEPRINT_PATH); } catch { /* ok */ }
    clearBlueprintCache();
    clearDNACache();

    // Create test output directory
    fs.mkdirSync(TEST_DIR, { recursive: true });

    // Initialize DNA for tests
    createDNAFile({ company: { name: "AutoBP Test" } });
  });

  after(() => {
    // Restore DNA
    if (dnaBackup) {
      fs.writeFileSync(DNA_PATH, dnaBackup, "utf-8");
    } else {
      try { fs.unlinkSync(DNA_PATH); } catch { /* ok */ }
    }

    // Restore blueprints
    if (blueprintBackup) {
      fs.writeFileSync(BLUEPRINT_PATH, blueprintBackup, "utf-8");
    } else {
      try { fs.unlinkSync(BLUEPRINT_PATH); } catch { /* ok */ }
    }

    clearDNACache();
    clearBlueprintCache();

    // Clean up test output
    try { fs.rmSync(TEST_DIR, { recursive: true, force: true }); } catch { /* ok */ }

    // Clean up files that createDoc may have placed in docs/
    const docsDir = path.join(process.cwd(), "docs");
    for (const sub of ["technical", "business", "research", "meeting", "legal", "contracts"]) {
      const subDir = path.join(docsDir, sub);
      if (fs.existsSync(subDir)) {
        for (const f of fs.readdirSync(subDir)) {
          if (f.includes("auto-bp-test") || f.includes("recurring-test") || f.includes("different-structure")) {
            try { fs.unlinkSync(path.join(subDir, f)); } catch { /* ok */ }
          }
        }
      }
    }
  });

  // =====================================================
  // TEST 1: convertSignatureToBlueprint
  // =====================================================
  describe("convertSignatureToBlueprint", () => {
    test("produces valid sections from suggestion", () => {
      const suggestion = {
        type: "recurring-structure",
        occurrences: 5,
        signature: "h1:introduction|h2:background|h1:methods|h2:data collection",
        headingCount: 4,
        dominantCategory: "research",
      };

      const bp = convertSignatureToBlueprint(suggestion);

      assert.ok(Array.isArray(bp.sections), "sections is an array");
      assert.equal(bp.sections.length, 4, "has 4 sections");
      assert.equal(bp.sections[0].headingLevel, "heading1", "first section is heading1");
      assert.equal(bp.sections[0].pattern, "introduction", "first section pattern is 'introduction'");
      assert.equal(bp.sections[1].headingLevel, "heading2", "second section is heading2");
      assert.equal(bp.sections[2].pattern, "methods", "third section pattern is 'methods'");
      assert.ok(bp.autoLearned === true, "autoLearned flag is true");
      assert.equal(bp.signature, suggestion.signature, "signature preserved");
      assert.equal(bp.dominantCategory, "research", "dominantCategory preserved");
      assert.equal(bp.occurrences, 5, "occurrences preserved");
    });

    test("handles empty signature gracefully", () => {
      const bp = convertSignatureToBlueprint({ signature: "", occurrences: 0 });
      assert.ok(Array.isArray(bp.sections), "sections is still an array");
      assert.equal(bp.sections.length, 0, "no sections from empty signature");
    });
  });

  // =====================================================
  // TEST 2-4: generateAutoBlueprintName
  // =====================================================
  describe("generateAutoBlueprintName", () => {
    test("generates correct base name", () => {
      const name = generateAutoBlueprintName(
        { dominantCategory: "technical", headingCount: 3 },
        [],
      );
      assert.equal(name, "auto-technical-3h", "generates auto-technical-3h");
    });

    test("uses 'general' when no category", () => {
      const name = generateAutoBlueprintName(
        { dominantCategory: null, headingCount: 2 },
        [],
      );
      assert.equal(name, "auto-general-2h", "generates auto-general-2h");
    });

    test("reuses name for same signature", () => {
      const existing = [
        { name: "auto-technical-3h", autoLearned: true, signature: "h1:intro|h2:setup|h1:usage" },
      ];
      const name = generateAutoBlueprintName(
        { dominantCategory: "technical", headingCount: 3, signature: "h1:intro|h2:setup|h1:usage" },
        existing,
      );
      assert.equal(name, "auto-technical-3h", "reuses existing name when signature matches");
    });

    test("appends suffix on collision with different signature", () => {
      const existing = [
        { name: "auto-technical-3h", autoLearned: true, signature: "h1:different|h2:structure|h1:here" },
      ];
      const name = generateAutoBlueprintName(
        { dominantCategory: "technical", headingCount: 3, signature: "h1:intro|h2:setup|h1:usage" },
        existing,
      );
      assert.equal(name, "auto-technical-3h-2", "appends -2 on collision");
    });

    test("increments suffix when multiple collisions", () => {
      const existing = [
        { name: "auto-technical-3h", autoLearned: true, signature: "h1:a|h2:b|h1:c" },
        { name: "auto-technical-3h-2", autoLearned: false, signature: "other" },
      ];
      const name = generateAutoBlueprintName(
        { dominantCategory: "technical", headingCount: 3, signature: "h1:new|h2:structure|h1:here" },
        existing,
      );
      assert.equal(name, "auto-technical-3h-3", "appends -3 when -2 is taken");
    });
  });

  // =====================================================
  // TEST 5: End-to-end — evolve auto-saves blueprints
  // =====================================================
  describe("End-to-end evolve auto-learning", () => {
    test("3+ similar docs → evolve → blueprint auto-saved", async () => {
      // Create DNA with clean usage
      clearDNACache();
      createDNAFile({ company: { name: "AutoBP E2E" } });

      // Clear blueprints
      try { fs.writeFileSync(BLUEPRINT_PATH, "{}", "utf-8"); } catch { /* ok */ }
      clearBlueprintCache();

      // Record 4 documents with the same structure signature
      const sig = "h1:executive summary|h2:market analysis|h1:recommendations";
      for (let i = 0; i < 4; i++) {
        recordUsage("business", "professional", { stylePreset: false, header: false, footer: false }, sig);
      }

      // Verify detectRecurringStructures finds it
      const analysis = detectRecurringStructures(3);
      assert.ok(analysis.found, "recurring structure detected");
      assert.ok(analysis.suggestions.length >= 1, "at least 1 suggestion");

      // Call evolve via handler (simulates MCP tool call)
      const evolveResponse = await handleDNA({ action: "evolve", threshold: 1 }, "dna");
      const result = JSON.parse(evolveResponse.content[0].text);

      assert.ok(result.autoLearnedBlueprints, "evolve response includes autoLearnedBlueprints");
      assert.ok(result.autoLearnedBlueprints.length >= 1, "at least 1 auto-learned blueprint");

      // Verify blueprint was actually saved
      const bpList = listBlueprints();
      const autoBps = bpList.filter(bp => bp.autoLearned);
      assert.ok(autoBps.length >= 1, "at least 1 auto-learned blueprint in store");
      assert.ok(autoBps[0].name.startsWith("auto-"), "auto-blueprint name starts with 'auto-'");
      assert.ok(autoBps[0].signature, "auto-blueprint has a signature");
    });
  });

  // =====================================================
  // TEST 6: Auto-match on create-doc
  // =====================================================
  describe("Auto-match on create-doc", () => {
    test("create doc matching auto-blueprint → blueprintMatch in response", async () => {
      // Ensure an auto-learned blueprint exists
      clearBlueprintCache();
      const sig = "h1:project overview|h2:technical details|h1:timeline";
      saveBlueprint("auto-technical-3h", {
        sections: [
          { headingLevel: "heading1", pattern: "project overview", required: true },
          { headingLevel: "heading2", pattern: "technical details", required: true },
          { headingLevel: "heading1", pattern: "timeline", required: true },
        ],
        signature: sig,
        autoLearned: true,
        learnedFrom: "auto-detected from 4 similar documents",
      });

      // Create a doc with matching structure
      const result = await createDoc({
        title: "Auto BP Test Project Overview",
        paragraphs: [
          { text: "Project Overview", headingLevel: "heading1" },
          "This is the project overview section.",
          { text: "Technical Details", headingLevel: "heading2" },
          "These are the technical details.",
          { text: "Timeline", headingLevel: "heading1" },
          "Here is the timeline.",
        ],
        outputPath: path.join(TEST_DIR, "auto-bp-test-match.docx"),
        enforceDocsFolder: false,
        preventDuplicates: false,
      });

      assert.ok(result.success, "document created successfully");
      assert.ok(result.blueprintMatch, "blueprintMatch is present in response");
      assert.equal(result.blueprintMatch.name, "auto-technical-3h", "matched correct blueprint");
      assert.ok(result.blueprintMatch.similarity >= 0.6, "similarity >= 0.6");
      assert.ok(result.blueprintMatch.message.includes("auto-technical-3h"), "message mentions blueprint name");
      assert.ok(result.message.includes("BLUEPRINT MATCH"), "main message includes blueprint match hint");
    });

    test("no match when no auto-learned blueprints exist", async () => {
      // Clear all blueprints
      try { fs.writeFileSync(BLUEPRINT_PATH, "{}", "utf-8"); } catch { /* ok */ }
      clearBlueprintCache();

      const result = await createDoc({
        title: "Auto BP Test No Match Available",
        paragraphs: [
          { text: "Section One", headingLevel: "heading1" },
          "Content here.",
        ],
        outputPath: path.join(TEST_DIR, "auto-bp-test-no-blueprints.docx"),
        enforceDocsFolder: false,
        preventDuplicates: false,
      });

      assert.ok(result.success, "document created successfully");
      assert.equal(result.blueprintMatch, null, "no blueprintMatch when no blueprints exist");
    });

    test("no match when signatures differ", async () => {
      // Save an auto-blueprint with a completely different structure
      clearBlueprintCache();
      saveBlueprint("auto-legal-5h", {
        sections: [
          { headingLevel: "heading1", pattern: "parties", required: true },
          { headingLevel: "heading2", pattern: "definitions", required: true },
          { headingLevel: "heading1", pattern: "obligations", required: true },
          { headingLevel: "heading2", pattern: "indemnification", required: true },
          { headingLevel: "heading1", pattern: "termination", required: true },
        ],
        signature: "h1:parties|h2:definitions|h1:obligations|h2:indemnification|h1:termination",
        autoLearned: true,
        learnedFrom: "auto-detected from 3 similar documents",
      });

      // Create a doc with a completely different structure
      const result = await createDoc({
        title: "Auto BP Test Different Structure Doc",
        paragraphs: [
          { text: "Getting Started", headingLevel: "heading1" },
          "Quick start guide.",
          { text: "API Reference", headingLevel: "heading1" },
          "API docs here.",
        ],
        outputPath: path.join(TEST_DIR, "auto-bp-test-different-structure.docx"),
        enforceDocsFolder: false,
        preventDuplicates: false,
      });

      assert.ok(result.success, "document created successfully");
      assert.equal(result.blueprintMatch, null, "no blueprintMatch when signatures differ");
    });
  });

  // =====================================================
  // TEST 9: Manual blueprint learn still works
  // =====================================================
  describe("Manual blueprint independence", () => {
    test("manual blueprint learn still works alongside auto-learned", async () => {
      clearBlueprintCache();
      // Save an auto-learned blueprint
      saveBlueprint("auto-business-2h", {
        sections: [{ headingLevel: "heading1", pattern: "summary", required: true }],
        signature: "h1:summary|h1:details",
        autoLearned: true,
        learnedFrom: "auto-detected from 3 documents",
      });

      // Save a manual blueprint
      saveBlueprint("monthly-report", {
        sections: [
          { headingLevel: "heading1", pattern: "highlights", required: true },
          { headingLevel: "heading2", pattern: "metrics", required: true },
        ],
        learnedFrom: "manual-monthly-report.docx",
      });

      const bpList = listBlueprints();
      const auto = bpList.filter(bp => bp.autoLearned);
      const manual = bpList.filter(bp => !bp.autoLearned);

      assert.ok(auto.length >= 1, "auto-learned blueprints present");
      assert.ok(manual.length >= 1, "manual blueprints present");
      assert.ok(auto[0].name.startsWith("auto-"), "auto blueprint has auto- prefix");
      assert.equal(manual[0].name, "monthly-report", "manual blueprint name unchanged");

      // Manual blueprint can be loaded independently
      const loaded = loadBlueprint("monthly-report");
      assert.ok(loaded, "manual blueprint loads");
      assert.equal(loaded.sections.length, 2, "manual blueprint has correct sections");

      // Clean up
      deleteBlueprint("auto-business-2h");
      deleteBlueprint("monthly-report");
    });
  });
});
