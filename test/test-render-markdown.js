/**
 * Tests for the new block-level markdown renderer (parseMarkdownToDocx).
 *
 * Asserts that lists, blockquotes, hrs, links, hyperlinks, inline tables,
 * fenced code blocks, and headings are emitted as the right docx primitives —
 * which is what makes generated documents stop looking "ugly" (lists used
 * to be silently stripped to flat paragraphs).
 *
 * Also covers clientHint-driven output mode and end-to-end create-doc round-trip
 * via JSZip extraction of the generated word/document.xml.
 */

import { describe, test } from "node:test";
import assert from "node:assert";
import fs from "fs";
import path from "path";
import os from "os";
import JSZip from "jszip";
import { Paragraph, Table } from "docx";

import { parseMarkdownToDocx } from "../src/tools/doc-utils.js";
import { getStyleConfig } from "../src/tools/styling.js";
import { createDoc } from "../src/tools/create-doc.js";

const baseStyle = {
  size: 11,
  fontFamily: "Calibri",
  color: "1F2937",
  linkColor: "2563EB",
};
const styleConfig = getStyleConfig("claude-like");

// ---------------------------------------------------------------------------
// parseMarkdownToDocx — direct unit tests
// ---------------------------------------------------------------------------

describe("parseMarkdownToDocx — block-level rendering", () => {
  test("renders a plain paragraph as a single Paragraph", () => {
    const out = parseMarkdownToDocx("Hello world.", baseStyle, styleConfig);
    assert.strictEqual(out.length, 1);
    assert.ok(out[0] instanceof Paragraph);
  });

  test("renders bullet list items as 3 Paragraphs", () => {
    const md = "- First item\n- Second item\n- Third item";
    const out = parseMarkdownToDocx(md, baseStyle, styleConfig);
    assert.strictEqual(out.length, 3, "three bullet items → three paragraphs");
    for (const p of out) assert.ok(p instanceof Paragraph);
  });

  test("renders numbered list items as 3 Paragraphs", () => {
    const md = "1. Step one\n2. Step two\n3. Step three";
    const out = parseMarkdownToDocx(md, baseStyle, styleConfig);
    assert.strictEqual(out.length, 3);
    for (const p of out) assert.ok(p instanceof Paragraph);
  });

  test("renders blockquote as a Paragraph", () => {
    const md = "> This is a quote.";
    const out = parseMarkdownToDocx(md, baseStyle, styleConfig);
    assert.strictEqual(out.length, 1);
    assert.ok(out[0] instanceof Paragraph);
  });

  test("renders horizontal rule between two paragraphs as 3 Paragraphs", () => {
    const md = "Above\n\n---\n\nBelow";
    const out = parseMarkdownToDocx(md, baseStyle, styleConfig);
    // Three blocks: paragraph, hr, paragraph
    assert.strictEqual(out.length, 3, `expected 3 elements (para, hr, para), got ${out.length}`);
    for (const p of out) assert.ok(p instanceof Paragraph);
  });

  test("renders a markdown table as a docx Table", () => {
    const md = "| Name | Age |\n|------|-----|\n| Alice | 30 |\n| Bob | 25 |";
    const out = parseMarkdownToDocx(md, baseStyle, styleConfig);
    assert.strictEqual(out.length, 1);
    assert.ok(out[0] instanceof Table, "markdown table must produce a docx Table primitive");
  });

  test("renders heading levels 1-3 as 3 Paragraphs", () => {
    const md = "# H1\n\n## H2\n\n### H3";
    const out = parseMarkdownToDocx(md, baseStyle, styleConfig);
    assert.strictEqual(out.length, 3);
    for (const p of out) assert.ok(p instanceof Paragraph);
  });

  test("renders fenced code block as multiple Paragraphs", () => {
    const md = "```js\nconst x = 1;\nx + 1;\n```";
    const out = parseMarkdownToDocx(md, baseStyle, styleConfig);
    assert.ok(out.length >= 2, "code block of 2 lines should produce ≥ 2 paragraphs");
    for (const p of out) assert.ok(p instanceof Paragraph);
  });

  test("renders [text](https://...) links as a single Paragraph (URL goes to rels at pack time)", () => {
    const md = "Check [Anthropic](https://anthropic.com) for more.";
    const out = parseMarkdownToDocx(md, baseStyle, styleConfig);
    assert.strictEqual(out.length, 1);
    assert.ok(out[0] instanceof Paragraph);
  });

  test("strikethrough ~~text~~ renders as a single Paragraph", () => {
    const md = "Some ~~deleted~~ text.";
    const out = parseMarkdownToDocx(md, baseStyle, styleConfig);
    assert.strictEqual(out.length, 1);
    assert.ok(out[0] instanceof Paragraph);
  });

  test("mixed content (heading + list + paragraph) produces correct primitive types", () => {
    const md = "## Setup steps\n\nFollow these:\n\n1. Install\n2. Configure\n3. Run\n\nDone.";
    const out = parseMarkdownToDocx(md, baseStyle, styleConfig);
    // heading + paragraph + 3 list items + paragraph = 6
    assert.strictEqual(out.length, 6, `expected 6 primitives, got ${out.length}`);
    for (const p of out) assert.ok(p instanceof Paragraph);
  });

  test("falls back to a plain paragraph when input is empty", () => {
    const out = parseMarkdownToDocx("", baseStyle, styleConfig);
    assert.strictEqual(out.length, 1);
    assert.ok(out[0] instanceof Paragraph);
  });
});

// ---------------------------------------------------------------------------
// End-to-end: create-doc round-trip via in-memory DOCX
// ---------------------------------------------------------------------------

describe("create-doc round-trip", () => {
  test("renders bullet list, heading, and link end-to-end and writes a real DOCX", async () => {
    const tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "doc-render-test-"));
    const outputPath = path.join(tempDir, "render-test.docx");

    const result = await createDoc({
      title: "Rendering Verification — Q1 2026",
      paragraphs: [
        "## Overview",
        "This document tests **block-level** markdown rendering.",
        "- First bullet",
        "- Second bullet",
        "- Third bullet",
        "",
        "Some [Anthropic](https://anthropic.com) link.",
      ],
      outputPath,
      enforceDocsFolder: false,
      preventDuplicates: false,
      stylePreset: "claude-like",
    });

    assert.strictEqual(result.success, true, `create-doc must succeed; got: ${JSON.stringify(result)}`);
    assert.ok(fs.existsSync(result.filePath), "DOCX file must exist on disk");

    // Read the DOCX and inspect word/document.xml + rels
    const buf = await fs.promises.readFile(result.filePath);
    const zip = await JSZip.loadAsync(buf);
    const docXml = await zip.file("word/document.xml").async("string");
    const numXml = await zip.file("word/numbering.xml")?.async("string");
    // ExternalHyperlink stores the URL in word/_rels/document.xml.rels, not in document.xml
    const relsXml = await zip.file("word/_rels/document.xml.rels")?.async("string");

    assert.ok(numXml, "numbering.xml must be present (numbering config wired)");
    assert.ok(docXml.includes("numId"), "document must reference a numId for the bullet list");
    assert.ok(relsXml, "word/_rels/document.xml.rels must exist");
    assert.ok(
      relsXml.includes("anthropic.com"),
      `hyperlink URL must end up in document.xml.rels; rels excerpt: ${relsXml.slice(0, 500)}`,
    );
    assert.ok(
      docXml.includes("hyperlink") || docXml.includes("Hyperlink") || docXml.includes("HYPERLINK"),
      "document.xml must reference the hyperlink",
    );

    // Cleanup
    await fs.promises.rm(tempDir, { recursive: true, force: true });
  });

  test("clientHint:'interactive' shrinks the response message and omits chatty fields", async () => {
    const tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "doc-hint-test-"));
    const outputPath = path.join(tempDir, "hint-test.docx");

    const result = await createDoc({
      title: "Interactive Mode Sanity Check",
      paragraphs: ["Plain paragraph one.", "Plain paragraph two."],
      outputPath,
      enforceDocsFolder: false,
      preventDuplicates: false,
      clientHint: "interactive",
    });

    assert.strictEqual(result.success, true);
    assert.strictEqual(result.clientMode, "interactive");
    assert.match(result.message, /^Created: /, `interactive message should start with "Created: ", got: ${result.message}`);
    assert.ok(!/IMPORTANT|NOTE:/i.test(result.message), "interactive message must not contain chatty NOTE/IMPORTANT lines");
    assert.strictEqual(result.enforcement, undefined, "enforcement block must be omitted in interactive mode");
    assert.strictEqual(result.styleConfig, undefined, "styleConfig must be omitted in interactive mode");

    await fs.promises.rm(tempDir, { recursive: true, force: true });
  });

  test("clientHint:'agent' returns the verbose response shape", async () => {
    const tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "doc-hint-test-"));
    const outputPath = path.join(tempDir, "agent-test.docx");

    const result = await createDoc({
      title: "Agent Mode Sanity Check",
      paragraphs: [{ text: "Agent paragraph one.", headingLevel: "heading2" }, "Body."],
      outputPath,
      enforceDocsFolder: false,
      preventDuplicates: false,
      clientHint: "agent",
    });

    assert.strictEqual(result.success, true);
    assert.strictEqual(result.clientMode, "agent");
    assert.ok(typeof result.styleConfig === "object", "agent mode must include styleConfig");
    assert.ok(typeof result.enforcement === "object", "agent mode must include enforcement");
    assert.match(result.message, /DOCX FILE WRITTEN TO DISK/, "agent message should be verbose");

    await fs.promises.rm(tempDir, { recursive: true, force: true });
  });
});
