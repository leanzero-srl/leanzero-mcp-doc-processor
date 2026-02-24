/**
 * Tests for drift detection internals and template detection:
 *   1. computeLineDiff — LCS correctness and edge cases
 *   2. compareHeadingTrees — level changes and reorder threshold
 *   3. computeJaccard — similarity edge cases
 *   4. computeStructureSignature — signature format
 *   5. detectRecurringStructures — threshold behavior
 */

import { describe, test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";

import {
  computeLineDiff,
  compareHeadingTrees,
  computeJaccard,
} from "../src/services/drift-detector.js";

import {
  loadDNA,
  createDNAFile,
  recordUsage,
  clearDNACache,
  detectRecurringStructures,
  signatureSimilarity,
} from "../src/utils/dna-manager.js";

const DNA_PATH = path.join(process.cwd(), ".document-dna.json");

describe("Drift Detection Internals", () => {
  // --- 1. computeLineDiff ---
  describe("Test 1: computeLineDiff — LCS correctness", () => {
    test("detects single substitution correctly", () => {
      const diff = computeLineDiff(["a", "b", "c"], ["a", "x", "c"]);
      const added = diff.filter(d => d.type === "added");
      const removed = diff.filter(d => d.type === "removed");
      const unchanged = diff.filter(d => d.type === "unchanged");

      assert.equal(added.length, 1, "should have 1 added");
      assert.equal(removed.length, 1, "should have 1 removed");
      assert.equal(unchanged.length, 2, "should have 2 unchanged");
      assert.equal(added[0].text, "x");
      assert.equal(removed[0].text, "b");
    });

    test("handles identical arrays", () => {
      const diff = computeLineDiff(["a", "b", "c"], ["a", "b", "c"]);
      const changed = diff.filter(d => d.type !== "unchanged");
      assert.equal(changed.length, 0, "identical arrays should produce no changes");
      assert.equal(diff.length, 3, "should have 3 unchanged entries");
    });

    test("handles completely different arrays", () => {
      const diff = computeLineDiff(["a", "b"], ["x", "y", "z"]);
      const added = diff.filter(d => d.type === "added");
      const removed = diff.filter(d => d.type === "removed");
      assert.equal(removed.length, 2, "should remove all old");
      assert.equal(added.length, 3, "should add all new");
    });

    test("handles empty old array (all additions)", () => {
      const diff = computeLineDiff([], ["a", "b"]);
      assert.equal(diff.length, 2);
      assert.ok(diff.every(d => d.type === "added"), "all should be additions");
    });

    test("handles empty new array (all removals)", () => {
      const diff = computeLineDiff(["a", "b"], []);
      assert.equal(diff.length, 2);
      assert.ok(diff.every(d => d.type === "removed"), "all should be removals");
    });

    test("handles both arrays empty", () => {
      const diff = computeLineDiff([], []);
      assert.equal(diff.length, 0, "empty inputs should produce empty diff");
    });

    test("detects insertion in the middle", () => {
      const diff = computeLineDiff(
        ["intro", "conclusion"],
        ["intro", "new section", "conclusion"],
      );
      const added = diff.filter(d => d.type === "added");
      assert.equal(added.length, 1);
      assert.equal(added[0].text, "new section");
    });

    test("detects deletion from the middle", () => {
      const diff = computeLineDiff(
        ["intro", "middle", "conclusion"],
        ["intro", "conclusion"],
      );
      const removed = diff.filter(d => d.type === "removed");
      assert.equal(removed.length, 1);
      assert.equal(removed[0].text, "middle");
    });

    test("enforces 500-line cap", () => {
      const big = Array.from({ length: 600 }, (_, i) => `line-${i}`);
      const diff = computeLineDiff(big, big);
      // Since both are capped at 500 and identical, all should be unchanged
      assert.equal(diff.length, 500, "should cap at 500 entries");
    });
  });

  // --- 2. compareHeadingTrees ---
  describe("Test 2: compareHeadingTrees — heading changes", () => {
    test("detects heading level change", () => {
      const baseline = [{ text: "Introduction", level: 1 }];
      const current = [{ text: "Introduction", level: 2 }];
      const changes = compareHeadingTrees(baseline, current);

      assert.equal(changes.length, 1);
      assert.equal(changes[0].type, "level-change");
      assert.equal(changes[0].from, 1);
      assert.equal(changes[0].to, 2);
    });

    test("detects heading reorder beyond 0.3 threshold", () => {
      // 5 headings: moving first to last = relative position delta of 1.0
      const baseline = [
        { text: "A", level: 1 },
        { text: "B", level: 1 },
        { text: "C", level: 1 },
        { text: "D", level: 1 },
        { text: "E", level: 1 },
      ];
      const current = [
        { text: "B", level: 1 },
        { text: "C", level: 1 },
        { text: "D", level: 1 },
        { text: "E", level: 1 },
        { text: "A", level: 1 },
      ];
      const changes = compareHeadingTrees(baseline, current);
      const reorders = changes.filter(c => c.type === "reordered");
      assert.ok(reorders.length > 0, "should detect reordering of heading A");
      assert.ok(reorders.some(r => r.heading === "a"), "heading A should be flagged");
    });

    test("does not flag minor position changes below 0.3", () => {
      // 10 headings: swapping adjacent ones = delta of ~0.11
      const headings = Array.from({ length: 10 }, (_, i) => ({
        text: `H${i}`,
        level: 1,
      }));
      const reordered = [...headings];
      // Swap position 4 and 5 (delta = 1/9 ≈ 0.11)
      [reordered[4], reordered[5]] = [reordered[5], reordered[4]];

      const changes = compareHeadingTrees(headings, reordered);
      const reorders = changes.filter(c => c.type === "reordered");
      assert.equal(reorders.length, 0, "minor swap should not trigger reorder");
    });

    test("returns empty for identical heading trees", () => {
      const headings = [
        { text: "Intro", level: 1 },
        { text: "Body", level: 2 },
      ];
      const changes = compareHeadingTrees(headings, headings);
      assert.equal(changes.length, 0);
    });

    test("handles empty heading trees", () => {
      const changes = compareHeadingTrees([], []);
      assert.equal(changes.length, 0);
    });

    test("detects combined level change and reorder", () => {
      const baseline = [
        { text: "A", level: 1 },
        { text: "B", level: 1 },
        { text: "C", level: 2 },
      ];
      const current = [
        { text: "C", level: 1 },  // level changed AND moved from pos 2 to 0
        { text: "B", level: 1 },
        { text: "A", level: 1 },  // moved from pos 0 to 2
      ];
      const changes = compareHeadingTrees(baseline, current);
      const levelChanges = changes.filter(c => c.type === "level-change");
      const reorders = changes.filter(c => c.type === "reordered");
      assert.ok(levelChanges.length >= 1, "should detect level change for C");
      assert.ok(reorders.length >= 1, "should detect reordering");
    });
  });

  // --- 3. computeJaccard ---
  describe("Test 3: computeJaccard — similarity edge cases", () => {
    test("identical sets return 1.0", () => {
      const a = new Set(["apple", "banana", "cherry"]);
      const b = new Set(["apple", "banana", "cherry"]);
      assert.equal(computeJaccard(a, b), 1.0);
    });

    test("disjoint sets return 0.0", () => {
      const a = new Set(["apple", "banana"]);
      const b = new Set(["cherry", "date"]);
      assert.equal(computeJaccard(a, b), 0.0);
    });

    test("partial overlap returns correct ratio", () => {
      const a = new Set(["apple", "banana", "cherry"]);
      const b = new Set(["banana", "cherry", "date"]);
      // intersection = 2 (banana, cherry), union = 4
      const result = computeJaccard(a, b);
      assert.equal(result, 0.5);
    });

    test("empty sets return 1.0", () => {
      assert.equal(computeJaccard(new Set(), new Set()), 1.0);
    });

    test("one empty set returns 0.0", () => {
      assert.equal(computeJaccard(new Set(["a"]), new Set()), 0.0);
    });

    test("single element overlap", () => {
      const a = new Set(["a", "b", "c"]);
      const b = new Set(["c", "d", "e"]);
      // intersection = 1 (c), union = 5
      assert.equal(computeJaccard(a, b), 0.2);
    });
  });

  // --- 4. computeStructureSignature ---
  describe("Test 4: computeStructureSignature — signature format", () => {
    // computeStructureSignature is not exported, so we test it indirectly
    // via recordUsage + detectRecurringStructures
    // We also need to verify the format by checking what gets stored

    let dnaBackup = null;

    before(() => {
      if (fs.existsSync(DNA_PATH)) {
        dnaBackup = fs.readFileSync(DNA_PATH, "utf-8");
      }
      clearDNACache();
      createDNAFile({ company: { name: "TestCo" } });
    });

    after(() => {
      if (dnaBackup) {
        fs.writeFileSync(DNA_PATH, dnaBackup);
      } else if (fs.existsSync(DNA_PATH)) {
        fs.unlinkSync(DNA_PATH);
      }
      clearDNACache();
    });

    test("recordUsage stores structure signature in DNA", () => {
      clearDNACache();
      recordUsage("technical", "professional", {}, "h1:introduction|h2:background");
      const dna = loadDNA();
      assert.ok(dna.usage.structures, "structures array should exist");
      assert.ok(dna.usage.structures.length >= 1, "should have at least 1 entry");
      const last = dna.usage.structures[dna.usage.structures.length - 1];
      assert.equal(last.signature, "h1:introduction|h2:background");
      assert.equal(last.category, "technical");
      assert.equal(last.style, "professional");
    });

    test("null signature is not stored", () => {
      clearDNACache();
      const dnaBefore = loadDNA();
      const countBefore = (dnaBefore?.usage?.structures || []).length;
      recordUsage("technical", "minimal", {}, null);
      clearDNACache();
      const dnaAfter = loadDNA();
      const countAfter = (dnaAfter?.usage?.structures || []).length;
      assert.equal(countAfter, countBefore, "null signature should not be stored");
    });
  });

  // --- 4b. signatureSimilarity ---
  describe("Test 4b: signatureSimilarity — fuzzy matching", () => {
    test("identical signatures return 1.0", () => {
      assert.equal(signatureSimilarity("h1:introduction|h2:background", "h1:introduction|h2:background"), 1.0);
    });

    test("intro vs introduction returns high similarity", () => {
      const sim = signatureSimilarity("h1:introduction|h2:background", "h1:intro|h2:background");
      assert.ok(sim >= 0.6, `similarity ${sim} should be >= 0.6`);
    });

    test("completely different text returns low similarity", () => {
      const sim = signatureSimilarity("h1:introduction|h2:background", "h1:conclusion|h2:references");
      assert.ok(sim < 0.6, `similarity ${sim} should be < 0.6`);
    });

    test("different heading counts return 0.0", () => {
      assert.equal(signatureSimilarity("h1:intro|h2:body", "h1:intro"), 0.0);
    });

    test("different heading levels return 0.0", () => {
      assert.equal(signatureSimilarity("h1:intro|h2:body", "h2:intro|h1:body"), 0.0);
    });

    test("empty signatures return 1.0", () => {
      assert.equal(signatureSimilarity("", ""), 1.0);
    });
  });

  // --- 5. detectRecurringStructures ---
  describe("Test 5: detectRecurringStructures — threshold behavior", () => {
    let dnaBackup = null;

    before(() => {
      if (fs.existsSync(DNA_PATH)) {
        dnaBackup = fs.readFileSync(DNA_PATH, "utf-8");
      }
      clearDNACache();
      createDNAFile({ company: { name: "TestCo" } });
    });

    after(() => {
      if (dnaBackup) {
        fs.writeFileSync(DNA_PATH, dnaBackup);
      } else if (fs.existsSync(DNA_PATH)) {
        fs.unlinkSync(DNA_PATH);
      }
      clearDNACache();
    });

    test("does not fire below threshold (2 occurrences)", () => {
      clearDNACache();
      const sig = "h1:testing-threshold|h2:data";
      recordUsage("technical", "minimal", {}, sig);
      recordUsage("technical", "minimal", {}, sig);
      clearDNACache();
      const result = detectRecurringStructures(3);
      const match = result.suggestions.find(s => s.signature === sig);
      assert.ok(!match, "should not detect pattern with only 2 occurrences");
    });

    test("fires at exactly threshold (3 occurrences)", () => {
      clearDNACache();
      const sig = "h1:fires-at-three|h2:body";
      recordUsage("business", "professional", {}, sig);
      recordUsage("business", "professional", {}, sig);
      recordUsage("business", "professional", {}, sig);
      clearDNACache();
      const result = detectRecurringStructures(3);
      const match = result.suggestions.find(s => s.signature === sig);
      assert.ok(match, "should detect pattern with exactly 3 occurrences");
      assert.equal(match.occurrences, 3);
    });

    test("reports dominant category correctly", () => {
      clearDNACache();
      // Reset DNA to get clean structures
      createDNAFile({ company: { name: "TestCo" } });
      clearDNACache();
      const sig = "h1:category-test|h2:analysis";
      recordUsage("technical", "minimal", {}, sig);
      recordUsage("technical", "minimal", {}, sig);
      recordUsage("business", "minimal", {}, sig);
      recordUsage("technical", "minimal", {}, sig);
      clearDNACache();
      const result = detectRecurringStructures(3);
      const match = result.suggestions.find(s => s.signature === sig);
      assert.ok(match, "should find the pattern");
      assert.equal(match.dominantCategory, "technical", "technical should dominate (3 vs 1)");
    });

    test("fuzzy matching groups 'introduction' and 'intro' as same pattern", () => {
      clearDNACache();
      createDNAFile({ company: { name: "TestCo" } });
      clearDNACache();
      // "introduction" and "intro" should now be grouped together via fuzzy matching
      recordUsage("technical", "minimal", {}, "h1:introduction|h2:background");
      recordUsage("technical", "minimal", {}, "h1:introduction|h2:background");
      recordUsage("technical", "minimal", {}, "h1:intro|h2:background");
      clearDNACache();
      const result = detectRecurringStructures(3);
      // Should find a group with 3 occurrences (2 "introduction" + 1 "intro")
      const match = result.suggestions.find(s => s.occurrences >= 3);
      assert.ok(match, "fuzzy match should group introduction + intro (3 total)");
      assert.ok(match.variants && match.variants.length === 2, "should report 2 variants");
    });

    test("completely different heading text is NOT grouped", () => {
      clearDNACache();
      createDNAFile({ company: { name: "TestCo" } });
      clearDNACache();
      // "introduction" and "conclusion" are too different to group
      recordUsage("technical", "minimal", {}, "h1:introduction|h2:background");
      recordUsage("technical", "minimal", {}, "h1:introduction|h2:background");
      recordUsage("technical", "minimal", {}, "h1:conclusion|h2:references");
      clearDNACache();
      const result = detectRecurringStructures(3);
      const match = result.suggestions.find(s => s.occurrences >= 3);
      assert.ok(!match, "introduction and conclusion should NOT be grouped");
    });

    test("returns found=false when no DNA exists", () => {
      clearDNACache();
      // Temporarily remove DNA file
      const tempBackup = fs.readFileSync(DNA_PATH, "utf-8");
      fs.unlinkSync(DNA_PATH);
      clearDNACache();
      const result = detectRecurringStructures(3);
      assert.equal(result.found, false);
      // Restore
      fs.writeFileSync(DNA_PATH, tempBackup);
      clearDNACache();
    });
  });
});
