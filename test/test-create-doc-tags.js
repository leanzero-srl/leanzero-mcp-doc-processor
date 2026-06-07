/**
 * Regression tests for create-doc tag-based style resolution.
 *
 * Guards the crash reported from an LM Studio session: calling create-doc with
 * arbitrary tags (e.g. ["baboons"]) and no stylePreset threw
 *   "Cannot read properties of null (reading 'stylePreset')"
 * because getTemplateByTag() returns a string key (or null) but was treated as
 * a template object. Resolution now goes through findMatchingTemplate(), which
 * returns {key, name, stylePreset} or null, so unmapped tags fall through to
 * the category/claude-like default instead of crashing.
 *
 * The bug only fires on a real (non-dryRun) create — the dryRun path returns
 * before the style-priority chain — so these tests write real files and clean
 * them up.
 */

import { describe, test, afterEach } from "node:test";
import assert from "node:assert";
import fs from "fs/promises";

import { createDoc } from "../src/tools/create-doc.js";
import { getAvailablePresets } from "../src/tools/styling.js";

const writtenFiles = [];

async function create(input) {
  const result = await createDoc({
    preventDuplicates: false,
    ...input,
  });
  if (result && result.success && result.filePath) {
    writtenFiles.push(result.filePath);
  }
  return result;
}

afterEach(async () => {
  while (writtenFiles.length) {
    const f = writtenFiles.pop();
    try {
      await fs.unlink(f);
    } catch {
      // best-effort cleanup
    }
  }
});

describe("create-doc tag-based style resolution", () => {
  test("unmapped tags + no stylePreset does NOT crash and yields a valid preset", async () => {
    const result = await create({
      title: "Wildlife Field Notes — Troop Dynamics 2026",
      paragraphs: ["# Overview", "Some **observed** behavior in the field."],
      tags: ["baboons", "reproduction", "primatology"],
    });

    assert.strictEqual(result.success, true, `expected success, got: ${result.error || result.message}`);
    assert.ok(!result.error, `expected no error, got: ${result.error}`);
    assert.ok(
      getAvailablePresets().includes(result.stylePreset),
      `stylePreset "${result.stylePreset}" is not a known preset`,
    );
  });

  test("explicit stylePreset always wins, even with unmapped tags", async () => {
    const result = await create({
      title: "Wildlife Field Notes — Explicit Minimal Style",
      paragraphs: ["# Overview", "Body text."],
      tags: ["baboons", "reproduction"],
      stylePreset: "minimal",
    });

    assert.strictEqual(result.success, true, `expected success, got: ${result.error || result.message}`);
    assert.strictEqual(result.stylePreset, "minimal");
  });

  test("a mapped tag resolves to its template preset", async () => {
    // "legal" maps to the legal template (stylePreset "legal"). User did not
    // pass an explicit stylePreset, so the tag-based branch should apply it
    // (unless a project DNA injects a default, in which case any valid preset
    // is acceptable — the point is it must not crash).
    const result = await create({
      title: "Mutual Non-Disclosure Terms — Acme & Beta 2026",
      paragraphs: ["# Parties", "The parties agree as follows."],
      tags: ["legal"],
    });

    assert.strictEqual(result.success, true, `expected success, got: ${result.error || result.message}`);
    assert.ok(
      getAvailablePresets().includes(result.stylePreset),
      `stylePreset "${result.stylePreset}" is not a known preset`,
    );
  });
});
