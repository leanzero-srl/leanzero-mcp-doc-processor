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
import { editPptx } from "../src/tools/edit-pptx.js";
import { documentProcessor } from "../src/services/document-processor.js";

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

  test("a ```chart fenced block becomes a native editable chart part", async () => {
    const content = [
      "## Revenue by Region",
      "```chart",
      "type: bar",
      "title: Revenue ($k)",
      "| Region | 2025 | 2026 |",
      "|--------|------|------|",
      "| North | 120 | 180 |",
      "| South | 90 | 140 |",
      "```",
    ].join("\n");
    const result = await createPptx({
      title: "Native Chart Deck 2026",
      content,
      stylePreset: "business",
      preventDuplicates: false,
    });
    assert.strictEqual(result.success, true, `create failed: ${result.error || result.message}`);
    written.push(result.filePath);

    const zip = await JSZip.loadAsync(await fs.readFile(result.filePath));
    const charts = Object.keys(zip.files).filter((f) => /^ppt\/charts\/chart\d+\.xml$/.test(f));
    assert.strictEqual(charts.length, 1, `expected exactly one chart part, got ${charts.length}`);
    const chartXml = await zip.file(charts[0]).async("string");
    assert.match(chartXml, /barChart/, "expected a bar chart");
    assert.match(chartXml, /180/, "expected the chart data (180) to be embedded");
  });

  test("round-trip: read-doc reads the .pptx back (slide text + slide count)", async () => {
    const result = await createPptx({
      title: "Read Back Deck 2026",
      content: "## Strategy\n- Expand EMEA\n- Hire fast\n\n## Risks\n- FX exposure",
      preventDuplicates: false,
    });
    assert.strictEqual(result.success, true);
    written.push(result.filePath);

    const sum = await documentProcessor.processDocument(result.filePath, "summary");
    assert.strictEqual(sum.success, true, "read-doc should parse the .pptx");
    assert.strictEqual(sum.metadata.format, "pptx");
    assert.strictEqual(sum.metadata.slideCount, 3);
    assert.match(sum.text, /Strategy/);
    assert.match(sum.text, /Expand EMEA/);
    assert.match(sum.text, /Risks/);

    const deep = await documentProcessor.processDocument(result.filePath, "indepth");
    assert.strictEqual(deep.structure.length, 3, "expected 3 slide structure entries");
    assert.match(deep.structure[1].text, /Strategy/);
  });

  test("edit-pptx: preview + append-slides preserves existing slides and adds new ones", async () => {
    const created = await createPptx({
      title: "Editable Deck 2026",
      content: "## Intro\n- point a\n- point b",
      preventDuplicates: false,
    });
    assert.strictEqual(created.success, true);
    written.push(created.filePath);

    const prev = await editPptx({ filePath: created.filePath, action: "preview" });
    assert.strictEqual(prev.success, true);
    assert.strictEqual(prev.slideCount, 2, "title + Intro");

    const appended = await editPptx({
      filePath: created.filePath,
      action: "append-slides",
      content: "## Roadmap\n- Q1 launch\n- Q2 scale\n\n## Risks\n- hiring",
    });
    assert.strictEqual(appended.success, true, appended.error);
    assert.strictEqual(appended.slides, 4, "title + Intro + Roadmap + Risks");

    const sum = await documentProcessor.processDocument(created.filePath, "summary");
    assert.strictEqual(sum.metadata.slideCount, 4);
    assert.match(sum.text, /Intro/, "original slide preserved");
    assert.match(sum.text, /Roadmap/);
    assert.match(sum.text, /Q2 scale/);
    assert.match(sum.text, /Risks/);
  });

  test("edit-pptx: replace-slide swaps one content slide, keeps the rest", async () => {
    const created = await createPptx({
      title: "Replace Deck 2026",
      content: "## One\n- x\n\n## Two\n- y",
      preventDuplicates: false,
    });
    assert.strictEqual(created.success, true);
    written.push(created.filePath);

    const r = await editPptx({
      filePath: created.filePath,
      action: "replace-slide",
      slideIndex: 1,
      content: "## One Revised\n- brand new content",
    });
    assert.strictEqual(r.success, true, r.error);
    assert.strictEqual(r.slides, 3, "title + One Revised + Two");

    const sum = await documentProcessor.processDocument(created.filePath, "summary");
    assert.match(sum.text, /One Revised/);
    assert.match(sum.text, /brand new content/);
    assert.match(sum.text, /Two/, "the other content slide is preserved");
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
