/**
 * create-pptx tests: render an editable .pptx deck from markdown.
 *
 * Proves the markdown → slides pipeline produces a real OpenXML .pptx (PK zip)
 * with one title slide plus one slide per '## ' heading, that dryRun previews
 * the slide breakdown, and that generic titles are rejected. Files are unlinked
 * in after() (they may land in docs/ via category redirect, like create-pdf).
 */

import { describe, test, after } from "node:test";
import assert from "node:assert";
import fs from "fs/promises";
import JSZip from "jszip";

import { createPptx } from "../src/tools/create-pptx.js";

const written = [];

after(async () => {
  for (const f of written) {
    try { await fs.unlink(f); } catch { /* ignore */ }
  }
});

async function countSlides(filePath) {
  const zip = await JSZip.loadAsync(await fs.readFile(filePath));
  return Object.keys(zip.files).filter((f) => /^ppt\/slides\/slide\d+\.xml$/.test(f)).length;
}

describe("create-pptx", () => {
  test("creates a valid .pptx: one title slide + one slide per ## heading", async () => {
    const content =
      "## Problem\n- Manual steps are slow\n- Errors slip through\n\n" +
      "## Our Solution\n- One-click automation\n- Built-in checks\n\n" +
      "## Results\n| Metric | Before | After |\n|---|---|---|\n| Time | 2h | 5m |\n| Errors | 12 | 0 |";
    const result = await createPptx({
      title: "Q3 2026 Product Strategy Deck",
      content,
      stylePreset: "professional",
      preventDuplicates: false,
    });

    assert.strictEqual(result.success, true, `create failed: ${result.error || result.message}`);
    assert.ok(result.filePath, "expected a filePath");
    written.push(result.filePath);

    const buf = await fs.readFile(result.filePath);
    assert.ok(buf[0] === 0x50 && buf[1] === 0x4b, "must start with the PK (zip/OOXML) magic header");
    assert.ok(buf.length > 5000, `expected a non-trivial deck, got ${buf.length} bytes`);

    const slides = await countSlides(result.filePath);
    assert.strictEqual(slides, 4, `expected 1 title + 3 section slides, got ${slides}`);
    assert.strictEqual(result.slides, 4, "response.slides should report 4");

    // formatting was detected (headings + table)
    assert.strictEqual(result.formattingQuality.isPlainText, false);
    assert.ok(result.formattingQuality.headings && result.formattingQuality.tables);
  });

  test("dryRun returns the slide breakdown without writing", async () => {
    const result = await createPptx({
      title: "Roadmap Review Q4 2026",
      content: "## Now\n- a\n\n## Next\n- b\n\n## Later\n- c",
      dryRun: true,
    });
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.dryRun, true);
    assert.strictEqual(result.preview.slides, 4);
    assert.deepStrictEqual(result.preview.sectionHeadings, ["Now", "Next", "Later"]);
  });

  test("rejects a generic title", async () => {
    const result = await createPptx({ title: "Document", content: "## A\n- x" });
    assert.strictEqual(result.success, false);
    assert.strictEqual(result.error, "GENERIC_TITLE");
  });

  test("body with no ## still yields a title slide + one Overview slide", async () => {
    const result = await createPptx({
      title: "Single Topic Briefing 2026",
      content: "- point one\n- point two\n- point three",
      preventDuplicates: false,
    });
    assert.strictEqual(result.success, true);
    written.push(result.filePath);
    const slides = await countSlides(result.filePath);
    assert.strictEqual(slides, 2, `expected title + Overview, got ${slides}`);
  });
});
