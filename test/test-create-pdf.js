/**
 * create-pdf tests: render a styled PDF from markdown, then read it back.
 *
 * Proves the marked → HTML → CSS → Puppeteer pipeline produces a real PDF and
 * that read-doc's PDF parser can extract the text again (create→read
 * round-trip). The shared Chromium is closed in after() so the test process
 * exits cleanly.
 */

import { describe, test, before, after } from "node:test";
import assert from "node:assert";
import fs from "fs/promises";

import { createPdf } from "../src/tools/create-pdf.js";
import { closeBrowser } from "../src/services/pdf-renderer.js";
import { PdfParser } from "../src/parsers/pdf-parser.js";

const written = [];

after(async () => {
  for (const f of written) {
    try { await fs.unlink(f); } catch { /* ignore */ }
  }
  await closeBrowser();
});

describe("create-pdf", () => {
  test("renders a formatted PDF and read-doc can extract its text (round-trip)", async () => {
    const result = await createPdf({
      title: "Quarterly Wildlife Census 2026",
      content:
        "## Census Methodology\n" +
        "Surveys used **transect sampling** across three reserves.\n\n" +
        "### Key Counts\n- Baboons: 412\n- Impala: 1,032\n\n" +
        "| Species | Count |\n|---|---|\n| Baboons | 412 |\n| Impala | 1032 |\n",
      preventDuplicates: false,
    });

    assert.strictEqual(result.success, true, `create failed: ${result.error || result.message}`);
    assert.ok(result.filePath, "expected a filePath");
    written.push(result.filePath);

    // formatting was detected
    assert.strictEqual(result.formattingQuality.isPlainText, false);
    assert.ok(result.formattingQuality.headings && result.formattingQuality.tables);

    // a real, non-trivial PDF file exists
    const stat = await fs.stat(result.filePath);
    assert.ok(stat.size > 1000, `PDF too small: ${stat.size} bytes`);
    const head = await fs.readFile(result.filePath);
    assert.strictEqual(head.subarray(0, 5).toString("latin1"), "%PDF-", "missing PDF magic header");

    // round-trip: the PDF parser extracts the rendered text back
    const parsed = await new PdfParser().parse(result.filePath);
    assert.strictEqual(parsed.success, true, "pdf parse failed");
    assert.ok((parsed.pages || 0) >= 1, "expected >= 1 page");
    assert.match(parsed.text, /Census Methodology/, "expected heading text in extracted PDF text");
  });

  test("dryRun returns a preview without writing", async () => {
    const result = await createPdf({
      title: "Dry Run PDF Preview Sample 2026",
      content: "## Section\n- a\n- b",
      dryRun: true,
    });
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.dryRun, true);
    assert.ok(result.preview && result.preview.stylePreset);
  });
});
