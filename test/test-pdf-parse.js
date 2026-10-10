// Regression test for the PDF parser. pdf-parse v2 runs each call on a single
// per-instance worker; issuing getText() and getImage() concurrently (Promise.all)
// throws "Cannot transfer object of unsupported type." This test parses a
// text-layer PDF end-to-end and asserts success + extracted text, guarding the
// sequential-call fix in src/parsers/pdf-parser.js.
//
// The PDF is GENERATED (test/fixtures/make-pdf.js) — the personal PDFs that
// used to live in testfiles/ were removed on 2026-10-10.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { PdfParser } from "../src/parsers/pdf-parser.js";
import { makeTextPdf, SAMPLE_LINES } from "./fixtures/make-pdf.js";

test("PdfParser.parse extracts text from a text-layer PDF (no worker-transfer error)", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "dp-pdf-parse-"));
  const sample = path.join(dir, "sample.pdf");
  writeFileSync(sample, makeTextPdf());
  try {
    const result = await new PdfParser().parse(sample);
    assert.equal(result.success, true, `parse failed: ${result.error || ""}`);
    assert.ok((result.text || "").length > 100, "expected non-trivial extracted text");
    assert.ok(result.text.includes(SAMPLE_LINES[1]), "expected the fixture's sentence in the extracted text");
    assert.ok(result.pages >= 1, "expected at least one page");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
