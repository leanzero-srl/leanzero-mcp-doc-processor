/**
 * Regression tests: a markdown BODY keeps its structure in every docx/markdown
 * writer (bug found 2026-11-03).
 *
 * Before the fix, create-doc turned a `content` body that starts with a
 * heading ("# Title\n\nbody...") into ONE heading paragraph holding the whole
 * body, and dropped every table (extractHeadingLevels matched "# " on the
 * first line of a multi-line string). The same class lived in:
 *   - edit-doc (XML-patch and legacy paths): each string became one inline
 *     paragraph, so headings/tables/lists in appended markdown vanished;
 *   - docx-patch extractContentNodes: a table's cell paragraphs were pasted
 *     again after the table;
 *   - create-markdown: every newline was doubled, splitting table rows and
 *     list items apart;
 *   - structure signature + blueprint validation: blind to headings inside a
 *     markdown string.
 */

import { describe, test, before, after } from "node:test";
import assert from "node:assert";
import fs from "fs";
import path from "path";
import os from "os";
import JSZip from "jszip";
import mammoth from "mammoth";

// Env BEFORE the dynamic imports (static imports are hoisted): registry, DNA
// and lineage writes go to a temp dir, never into the repo.
const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "md-body-structure-"));
process.env.DOC_OUTPUT_DIR = tmpRoot;
// DNA usage is recorded in the repo's .document-dna.json (stdio project
// root): back it up and restore it so a test run never dirties the repo.
const dnaPath = path.join(process.cwd(), ".document-dna.json");
const dnaBackup = fs.existsSync(dnaPath) ? fs.readFileSync(dnaPath) : null;

const { createDoc } = await import("../src/tools/create-doc.js");
const { editDoc } = await import("../src/tools/edit-doc.js");
const { createMarkdown } = await import("../src/tools/create-markdown.js");
const { extractHeadingLevels, listHeadings } = await import("../src/tools/doc-utils.js");
const { validateAgainstBlueprint } = await import("../src/services/blueprint-extractor.js");

const HEADING_BODY =
  "# Quarterly Report\n\nIntro paragraph.\n\n## Numbers\n\n" +
  "| Metric | Value |\n|---|---|\n| MRR | $42k |\n| Churn | 1.2% |\n\n" +
  "### Notes\n\nDone.";
const TABLE_BODY = "Intro only.\n\n| Region | Users |\n|---|---|\n| EU | 120 |\n| US | 95 |";

let n = 0;
const out = (ext = "docx") => path.join(tmpRoot, `doc-${++n}.${ext}`);
const baseArgs = { enforceDocsFolder: false, preventDuplicates: false, stylePreset: "minimal" };

const decode = (s) => s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"');
const textOf = (xml) => decode([...xml.matchAll(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g)].map((m) => m[1]).join(""));

async function readDocx(file) {
  const zip = await JSZip.loadAsync(fs.readFileSync(file));
  const xml = await zip.file("word/document.xml").async("string");
  const rels = (await zip.file("word/_rels/document.xml.rels")?.async("string")) || "";
  const body = xml.slice(xml.indexOf("<w:body>"));
  // Top-level blocks in order: tables and the paragraphs outside tables.
  const blocks = [];
  const re = /<w:tbl>[\s\S]*?<\/w:tbl>|<w:p\b[^>]*>[\s\S]*?<\/w:p>|<w:p\b[^>]*\/>/g;
  for (const m of body.matchAll(re)) {
    const x = m[0];
    if (x.startsWith("<w:tbl>")) {
      const cells = [...x.matchAll(/<w:tc>([\s\S]*?)<\/w:tc>/g)].map((c) => textOf(c[1]));
      blocks.push({ kind: "table", cells });
    } else {
      const style = (x.match(/<w:pStyle w:val="([^"]+)"/) || [])[1] || null;
      blocks.push({ kind: "p", style, text: textOf(x) });
    }
  }
  const headings = blocks.filter((b) => b.kind === "p" && /^Heading\d$/.test(b.style || ""));
  const tables = blocks.filter((b) => b.kind === "table");
  return { zip, xml, rels, blocks, headings, tables };
}

function assertReportStructure(doc) {
  assert.deepStrictEqual(
    doc.headings.map((h) => [h.style, h.text]),
    [["Heading1", "Quarterly Report"], ["Heading2", "Numbers"], ["Heading3", "Notes"]],
    "each markdown heading is its own heading paragraph holding only its own text",
  );
  assert.strictEqual(doc.tables.length, 1, "the markdown table is a real table");
  assert.deepStrictEqual(doc.tables[0].cells, ["Metric", "Value", "MRR", "$42k", "Churn", "1.2%"]);
  const plain = doc.blocks.filter((b) => b.kind === "p" && !b.style).map((b) => b.text);
  assert.ok(plain.includes("Intro paragraph."), `body paragraph kept: ${JSON.stringify(plain)}`);
  assert.ok(plain.includes("Done."), "last paragraph kept");
  // Cell text appears only inside the table, never pasted again as paragraphs.
  assert.ok(!doc.blocks.some((b) => b.kind === "p" && /MRR|\$42k/.test(b.text)), "no cell text outside the table");
}

function assertRelsResolve(doc) {
  const ids = [...doc.xml.matchAll(/\br:id="([^"]+)"/g)].map((m) => m[1]);
  for (const id of ids) {
    assert.ok(doc.rels.includes(`Id="${id}"`), `r:id ${id} must resolve in document.xml.rels`);
  }
}

after(() => {
  fs.rmSync(tmpRoot, { recursive: true, force: true });
  if (dnaBackup) fs.writeFileSync(dnaPath, dnaBackup);
});

describe("extractHeadingLevels", () => {
  test("a single-line heading string becomes a heading object", () => {
    assert.deepStrictEqual(extractHeadingLevels(["## Scope"]), [{ text: "Scope", headingLevel: "heading2" }]);
  });
  test("a multi-line string that starts with a heading stays a string", () => {
    assert.deepStrictEqual(extractHeadingLevels([HEADING_BODY]), [HEADING_BODY]);
    const crlf = "# Title\r\n\r\nBody";
    assert.deepStrictEqual(extractHeadingLevels([crlf]), [crlf]);
  });
  test("a heading with only trailing whitespace is still a single-line heading", () => {
    assert.deepStrictEqual(extractHeadingLevels(["# Title\n"]), [{ text: "Title\n", headingLevel: "heading1" }]);
  });
});

describe("create-doc keeps a markdown body's structure", () => {
  test("content that starts with a heading and holds a table", async () => {
    const r = await createDoc({ ...baseArgs, title: "Body Structure Heading And Table", content: HEADING_BODY, outputPath: out() });
    assert.strictEqual(r.success, true, JSON.stringify(r).slice(0, 300));
    assertReportStructure(await readDocx(r.filePath));
  });

  test("content that starts with a heading (no table)", async () => {
    const r = await createDoc({ ...baseArgs, title: "Body Structure Heading First", content: "# Plan\n\nStep one.\n\n## Risks\n\nNone.", outputPath: out() });
    const doc = await readDocx(r.filePath);
    assert.deepStrictEqual(doc.headings.map((h) => [h.style, h.text]), [["Heading1", "Plan"], ["Heading2", "Risks"]]);
    assert.ok(doc.blocks.some((b) => b.kind === "p" && !b.style && b.text === "Step one."));
  });

  test("content with a table and no heading", async () => {
    const r = await createDoc({ ...baseArgs, title: "Body Structure Table Only", content: TABLE_BODY, outputPath: out() });
    const doc = await readDocx(r.filePath);
    assert.strictEqual(doc.tables.length, 1);
    assert.deepStrictEqual(doc.tables[0].cells, ["Region", "Users", "EU", "120", "US", "95"]);
  });

  test("the same body passed as ONE paragraphs entry", async () => {
    const r = await createDoc({ ...baseArgs, title: "Body Structure Paragraph Entry", paragraphs: [HEADING_BODY], outputPath: out() });
    assertReportStructure(await readDocx(r.filePath));
  });

  test("single-line heading entries still render as headings", async () => {
    const r = await createDoc({ ...baseArgs, title: "Body Structure Line Entries", paragraphs: ["## Section A", "Text A."], outputPath: out() });
    const doc = await readDocx(r.filePath);
    assert.deepStrictEqual(doc.headings.map((h) => [h.style, h.text]), [["Heading2", "Section A"]]);
  });
});

describe("edit-doc keeps appended markdown structure", () => {
  const APPEND = "## Added Section\n\nSee [the docs](https://example.com/docs).\n\n- first\n- second\n\n| Key | Val |\n|---|---|\n| K1 | V1 |";

  async function base() {
    const r = await createDoc({ ...baseArgs, title: `Edit Base ${n}`, content: "Base text.", outputPath: out() });
    assert.strictEqual(r.success, true);
    return r.filePath;
  }
  function assertAppended(doc) {
    assert.ok(doc.headings.some((h) => h.style === "Heading2" && h.text === "Added Section"), JSON.stringify(doc.headings));
    const t = doc.tables.find((x) => x.cells.includes("K1"));
    assert.ok(t, "appended markdown table is a real table");
    assert.deepStrictEqual(t.cells, ["Key", "Val", "K1", "V1"]);
    assert.ok(!doc.blocks.some((b) => b.kind === "p" && /K1|V1/.test(b.text)), "no cell text outside the table");
    assert.ok(doc.blocks.some((b) => b.kind === "p" && b.text === "first"), "list item kept as its own paragraph");
    assert.ok(doc.xml.includes("<w:numId"), "list items are real list paragraphs");
    assert.ok(doc.zip.file("word/numbering.xml"), "numbering part present for the list");
    assertRelsResolve(doc);
    assert.ok(doc.rels.includes("https://example.com/docs"), "link target carried into the document rels");
  }

  test("append (XML patch path)", async () => {
    const f = await base();
    const r = await editDoc({ filePath: f, action: "append", paragraphs: [APPEND] });
    assert.strictEqual(r.success, true, JSON.stringify(r).slice(0, 300));
    const doc = await readDocx(f);
    assertAppended(doc);
    assert.ok(doc.blocks.some((b) => b.text === "Base text."), "original content kept");
  });

  test("replace (XML patch path)", async () => {
    const f = await base();
    const r = await editDoc({ filePath: f, action: "replace", paragraphs: [APPEND] });
    assert.strictEqual(r.success, true, JSON.stringify(r).slice(0, 300));
    assertAppended(await readDocx(f));
  });

  test("append (legacy path)", async () => {
    const f = await base();
    const r = await editDoc({ filePath: f, action: "append", paragraphs: [APPEND], useLegacy: true });
    assert.strictEqual(r.success, true, JSON.stringify(r).slice(0, 300));
    assertAppended(await readDocx(f));
  });

  test("appending a `tables` entry does not paste its cells again", async () => {
    const f = await base();
    await editDoc({ filePath: f, action: "append", tables: [[["H1", "H2"], ["Cell-A", "Cell-B"]]] });
    const doc = await readDocx(f);
    assert.strictEqual(doc.tables.length, 1);
    assert.ok(!doc.blocks.some((b) => b.kind === "p" && /Cell-A|Cell-B/.test(b.text)), JSON.stringify(doc.blocks));
  });

  test("a heading OBJECT entry renders as a heading on append", async () => {
    const f = await base();
    await editDoc({ filePath: f, action: "append", paragraphs: [{ text: "Object Heading", headingLevel: "heading2" }] });
    const doc = await readDocx(f);
    assert.ok(doc.headings.some((h) => h.style === "Heading2" && h.text === "Object Heading"));
  });

  test("append to a document WITHOUT numbering/link parts carries them over", async () => {
    const f = await base();
    // Make it "foreign": drop numbering.xml, its relationship and content type.
    const zip = await JSZip.loadAsync(fs.readFileSync(f));
    zip.remove("word/numbering.xml");
    const rels = await zip.file("word/_rels/document.xml.rels").async("string");
    zip.file("word/_rels/document.xml.rels", rels.replace(/<Relationship\b[^>]*numbering[^>]*\/>/g, ""));
    const ct = await zip.file("[Content_Types].xml").async("string");
    zip.file("[Content_Types].xml", ct.replace(/<Override\b[^>]*numbering[^>]*\/>/g, ""));
    fs.writeFileSync(f, await zip.generateAsync({ type: "nodebuffer" }));

    const r = await editDoc({ filePath: f, action: "append", paragraphs: [APPEND] });
    assert.strictEqual(r.success, true);
    const doc = await readDocx(f);
    assertAppended(doc);
    assert.ok(/Type="[^"]*\/numbering"/.test(doc.rels), "numbering relationship added");
    const ct2 = await doc.zip.file("[Content_Types].xml").async("string");
    assert.ok(ct2.includes('PartName="/word/numbering.xml"'), "numbering content type added");
  });
});

describe("edit-doc appended lists use their own numbering in the target", () => {
  // Each appended numId must exist in the TARGET's numbering.xml with the
  // right format; before the remap, temp-document ids were pasted as is:
  // bullets joined the target's numbered list or pointed at nothing.
  async function numFormats(file) {
    const zip = await JSZip.loadAsync(fs.readFileSync(file));
    const num = await zip.file("word/numbering.xml").async("string");
    const absFmt = new Map([...num.matchAll(/<w:abstractNum\b[^>]*w:abstractNumId="(\d+)"[^>]*>([\s\S]*?)<\/w:abstractNum>/g)]
      .map((m) => [m[1], (m[2].match(/<w:numFmt w:val="([^"]+)"/) || [])[1]]));
    const numAbs = new Map([...num.matchAll(/<w:num\b[^>]*w:numId="(\d+)"[^>]*>[\s\S]*?<w:abstractNumId w:val="(\d+)"/g)].map((m) => [m[1], m[2]]));
    return (id) => absFmt.get(numAbs.get(id));
  }
  async function paraNumIds(file) {
    const zip = await JSZip.loadAsync(fs.readFileSync(file));
    const xml = await zip.file("word/document.xml").async("string");
    return [...xml.matchAll(/<w:p\b[^>]*>[\s\S]*?<\/w:p>/g)].map((m) => ({
      text: textOf(m[0]), numId: (m[0].match(/<w:numId w:val="(\d+)"/) || [])[1],
    }));
  }

  for (const [label, baseBody] of [["a list-free document", "Base text."], ["a document with a numbered list", "Steps:\n\n1. first\n2. second"]]) {
    test(`bullets and a numbered list appended to ${label}`, async () => {
      const r = await createDoc({ ...baseArgs, title: `Numbering Base ${label} ${n}`, content: baseBody, outputPath: out() });
      await editDoc({ filePath: r.filePath, action: "append", paragraphs: ["- bullet A\n- bullet B\n\nBetween.\n\n1. num one\n2. num two"] });
      const fmt = await numFormats(r.filePath);
      const paras = await paraNumIds(r.filePath);
      const get = (t) => paras.find((p) => p.text === t);
      for (const t of ["bullet A", "bullet B"]) assert.strictEqual(fmt(get(t).numId), "bullet", `${t}: ${JSON.stringify(get(t))}`);
      for (const t of ["num one", "num two"]) assert.strictEqual(fmt(get(t).numId), "decimal", `${t}: ${JSON.stringify(get(t))}`);
      if (get("first")) {
        assert.notStrictEqual(get("num one").numId, get("first").numId, "appended numbered list restarts, not continues the old one");
        assert.strictEqual(fmt(get("first").numId), "decimal", "original list untouched");
      }
      const html = (await mammoth.convertToHtml({ path: r.filePath })).value;
      assert.ok(html.includes("<ul><li>bullet A</li><li>bullet B</li></ul>"), html);
      assert.ok(html.includes("<li>num one</li><li>num two</li></ol>"), html);
    });
  }
});

describe("numbering merge keeps numbering.xml well-formed", () => {
  test("target numbering.xml that declares only xmlns:w", async () => {
    const r = await createDoc({ ...baseArgs, title: `Numbering W Only ${n}`, content: "Steps:\n\n1. first", outputPath: out() });
    const zip = await JSZip.loadAsync(fs.readFileSync(r.filePath));
    const W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
    zip.file("word/numbering.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<w:numbering xmlns:w="${W}">` +
      '<w:abstractNum w:abstractNumId="0"><w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="decimal"/><w:lvlText w:val="%1."/></w:lvl></w:abstractNum>' +
      '<w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num></w:numbering>');
    fs.writeFileSync(r.filePath, await zip.generateAsync({ type: "nodebuffer" }));
    for (const action of ["append", "append", "replace"]) {
      const e = await editDoc({ filePath: r.filePath, action, paragraphs: ["- b1\n- b2\n\n1. n1"] });
      assert.strictEqual(e.success, true);
      const num = await (await JSZip.loadAsync(fs.readFileSync(r.filePath))).file("word/numbering.xml").async("string");
      const root = num.match(/<w:numbering\b[^>]*>/)[0];
      const used = new Set([...num.matchAll(/[<\s]([A-Za-z][\w.-]*):[\w.-]+/g)].map((m) => m[1]));
      for (const p of used) {
        if (p === "xmlns" || p === "xml") continue;
        assert.ok(new RegExp(`\\sxmlns:${p}=`).test(root), `${action}: prefix ${p} used but not declared on the root`);
      }
    }
  });
});

describe("create-markdown keeps tables and lists in a content body", () => {
  test("table rows and list items stay contiguous", async () => {
    const body = "Intro line one\nline two.\n\n| A | B |\n|---|---|\n| 1 | 2 |\n\n- x\n- y";
    const r = await createMarkdown({ ...baseArgs, title: "Markdown Body Table", content: body, outputPath: out("md") });
    assert.strictEqual(r.success, true, JSON.stringify(r).slice(0, 300));
    const md = fs.readFileSync(r.filePath, "utf8");
    assert.ok(md.includes("| A | B |\n|---|---|\n| 1 | 2 |"), `table intact: ${JSON.stringify(md.slice(-120))}`);
    assert.ok(md.includes("- x\n- y"), "list intact");
    assert.ok(md.includes("Intro line one\n\nline two."), "plain paragraph lines still split apart");
  });

  test("a plain line right after a list or quote stays its own paragraph", async () => {
    const body = "- a\n- b\ntext after list\n\n> q1\n> q2\nafter quote";
    const r = await createMarkdown({ ...baseArgs, title: "Markdown Lazy Lines", content: body, outputPath: out("md") });
    const md = fs.readFileSync(r.filePath, "utf8");
    assert.ok(md.includes("- a\n- b\n\ntext after list"), JSON.stringify(md));
    assert.ok(md.includes("> q1\n> q2\n\nafter quote"), JSON.stringify(md));
  });

  test("a table row without a leading pipe stays in the table", async () => {
    const r = await createMarkdown({ ...baseArgs, title: "Markdown Pipe Less Row", content: "Data:\n| a | b |\n|---|---|\n| 1 | 2 |\n3 | 4", outputPath: out("md") });
    assert.ok(fs.readFileSync(r.filePath, "utf8").includes("| 1 | 2 |\n3 | 4"));
  });

  test("fenced code is left byte-for-byte alone", async () => {
    const code = "```yaml\n- name: a\nvalue: 1\n| pipe\nplain\n```";
    const r = await createMarkdown({ ...baseArgs, title: "Markdown Fenced Code", content: `Intro.\n\n${code}`, outputPath: out("md") });
    assert.ok(fs.readFileSync(r.filePath, "utf8").includes(code));
  });
});

describe("headings inside a markdown body are visible to structure checks", () => {
  test("listHeadings reads object and string headings", () => {
    assert.deepStrictEqual(listHeadings([HEADING_BODY, { text: "Extra", headingLevel: "heading2" }]), [
      { headingLevel: "heading1", text: "Quarterly Report" },
      { headingLevel: "heading2", text: "Numbers" },
      { headingLevel: "heading3", text: "Notes" },
      { headingLevel: "heading2", text: "Extra" },
    ]);
  });
  test("headings deeper than h3 count as h3, as the renderer draws them", () => {
    assert.deepStrictEqual(listHeadings(["#### Deep\n\ntext"]), [{ headingLevel: "heading3", text: "Deep" }]);
  });
  test("blueprint validation finds a required section inside content", () => {
    const blueprint = { sections: [{ heading: "heading2", pattern: "Numbers", required: true }] };
    assert.strictEqual(validateAgainstBlueprint([HEADING_BODY], blueprint).errors.length, 0);
  });
});
