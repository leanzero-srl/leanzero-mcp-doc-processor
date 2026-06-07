/**
 * Tests for the semantic format planner (detect-format brain).
 *
 * Guards the nuance the rewrite added: PDF-awareness, DOCX-vs-PDF distinction,
 * CSV detection, and the presentation/PPTX gap — plus the legacy expectations
 * (excel for data, docx for stakeholder) the schema E2E test also relies on.
 */

import { describe, test } from "node:test";
import assert from "node:assert";

import { detectFormat } from "../src/services/format-router.js";

async function fmt(userQuery, extra = {}) {
  return detectFormat({ userQuery, ...extra });
}

describe("format-router semantic planner", () => {
  test("final/print/send intent → PDF", async () => {
    const r = await fmt("write an invoice I can send to the client and print");
    assert.strictEqual(r.format, "pdf");
    assert.strictEqual(r.suggestedTool, "create-pdf");
  });

  test("editable-in-Word intent → DOCX, not PDF", async () => {
    const r = await fmt("draft a contract we can edit later in Word");
    assert.strictEqual(r.format, "docx");
  });

  test("CSV is detected and flagged via outputFormat", async () => {
    const r = await fmt("export the customer list as a CSV");
    assert.strictEqual(r.format, "excel");
    assert.strictEqual(r.outputFormat, "csv");
  });

  test("README/API/code → markdown", async () => {
    const r = await fmt("a README for our API with code examples");
    assert.strictEqual(r.format, "markdown");
    assert.strictEqual(r.suggestedTool, "create-markdown");
  });

  test("presentation → pptx, routed to create-pptx (editable deck)", async () => {
    const r = await fmt("make a pitch deck for investors");
    assert.strictEqual(r.format, "pptx");
    assert.strictEqual(r.suggestedTool, "create-pptx");
    assert.strictEqual(r.unsupported, undefined, "pptx is supported now — no unsupported flag");
    assert.ok(r.note && /pptx|slide|deck|create-pdf/i.test(r.note));
  });

  test("explicit PDF beats a slides mention (a PDF of the deck → pdf)", async () => {
    const r = await fmt("export the slide deck as a PDF to print");
    assert.strictEqual(r.format, "pdf");
    assert.strictEqual(r.suggestedTool, "create-pdf");
  });

  test("data terms → excel with data/spreadsheet reason (schema-test contract)", async () => {
    const r = await fmt("track revenue and expenses with a quarterly forecast for Q1 budget");
    assert.strictEqual(r.format, "excel");
    assert.match(r.reason, /data\/spreadsheet/);
  });

  test("stakeholder terms → docx with stakeholder/business reason (schema-test contract)", async () => {
    const r = await fmt("executive board briefing memo for stakeholder review");
    assert.strictEqual(r.format, "docx");
    assert.match(r.reason, /stakeholder\/business/);
  });

  test("returns an actionable plan (tool + tone + confidence)", async () => {
    const r = await fmt("Q1 marketing budget breakdown");
    assert.ok(r.suggestedTool, "expected suggestedTool");
    assert.ok(r.docType, "expected docType");
    assert.ok(r.confidence, "expected confidence");
  });
});
