// Regression test for the PDF parser. pdf-parse v2 runs each call on a single
// per-instance worker; issuing getText() and getImage() concurrently (Promise.all)
// throws "Cannot transfer object of unsupported type." This test parses a real
// text-layer PDF end-to-end and asserts success + extracted text, guarding the
// sequential-call fix in src/parsers/pdf-parser.js.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { PdfParser } from "../src/parsers/pdf-parser.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const SAMPLE = path.join(here, "..", "testfiles", "Mihai Perdum-FV_Resume.pdf");

test("PdfParser.parse extracts text from a text-layer PDF (no worker-transfer error)", async () => {
  assert.ok(existsSync(SAMPLE), `sample PDF missing: ${SAMPLE}`);
  const result = await new PdfParser().parse(SAMPLE);
  assert.equal(result.success, true, `parse failed: ${result.error || ""}`);
  assert.ok((result.text || "").length > 100, "expected non-trivial extracted text");
  assert.ok(result.pages >= 1, "expected at least one page");
});
