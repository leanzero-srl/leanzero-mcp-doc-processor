import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import fs from "fs";
import path from "path";

import { log } from "./utils/logger.js";
import { logInsight } from "./utils/insights.js";
import { resolveClientProfile } from "./utils/client-profile.js";

import { handleReadDoc } from "./tools/read-doc-tool.js";
import { createDoc } from "./tools/create-doc.js";
import { createExcel } from "./tools/create-excel.js";
import { createMarkdown } from "./tools/create-markdown.js";
import { createPdf } from "./tools/create-pdf.js";
import { createPptx } from "./tools/create-pptx.js";
import { editPptx } from "./tools/edit-pptx.js";
import { editDoc } from "./tools/edit-doc.js";
import { editExcel } from "./tools/edit-excel.js";
import { listDocuments, mimeTypeFromExtension } from "./tools/utils.js";
import { handleDNA } from "./tools/dna-tool.js";
import { handleBlueprint } from "./tools/blueprint-tool.js";
import { handleDriftMonitor } from "./tools/drift-tool.js";
import { handleGetLineage } from "./tools/lineage-tool.js";
import { factCheck } from "./tools/fact-check.js";
import { detectFormat } from "./services/format-router.js";

export const SERVER_INSTRUCTIONS = [
  "This server reads, creates, and edits PDF / DOCX / Markdown / Excel files.",
  "",
  "Format selection (4 formats — pick by what the user will DO with the file):",
  "  • Call `detect-format` FIRST when the user didn't name a format — it returns",
  "    a ready plan (format, tool, stylePreset, category) you can pass straight in.",
  "  • Technical/code/API/README/repo → markdown (`create-markdown`).",
  "  • Editable Word deliverable they'll keep editing → docx (`create-doc`).",
  "  • FINAL / print / send to a client / official / invoice / resume / sign →",
  "    pdf (`create-pdf`). Key nuance: DOCX = editable; PDF = final, fixed-layout.",
  "  • Any tabular/numeric data (budget, tracker, dataset, even a table in a",
  "    'report') → excel (`create-excel`).",
  "  • Slides / presentation / pitch deck → pptx (`create-pptx`): one '## '",
  "    heading per slide, the title becomes the title slide. Real editable .pptx",
  "    (PowerPoint / Keynote / Google Slides). For a fixed PDF deck use create-pdf.",
  "  • Heed `formatSuggestion` in a create response — it means another format fits.",
  "",
  "Per-format superpowers (use them):",
  "  • markdown: `toc:true` for an auto Table of Contents; `frontmatter:{...}` for YAML.",
  "  • excel: '=' cells become live formulas; money/percent columns auto-format;",
  "    header gets autofilter; `outputFormat:'csv'` for CSV.",
  "  • pdf: `toc:true` for a clickable Table of Contents; headers/footers w/ page numbers.",
  "  • docx: Document DNA defaults, 8 presets, headers/footers, blueprint validation.",
  "",
  "Quality:",
  "  • Titles MUST be specific. 'Document', 'Untitled', 'File' etc. are rejected.",
  "",
  "FORMATTING (IMPORTANT — never produce a plain-text document):",
  "  • EVERY document must use markdown structure: headings plus at least one",
  "    list or table. Do NOT send a wall of unformatted paragraphs.",
  "  • EASIEST WAY: pass the whole body as ONE markdown string in `content`",
  "    (create-doc / create-markdown / create-pdf). The title becomes the H1,",
  "    so start `content` at '## '.",
  "  • Supported markdown: '# / ## / ###' headings, '**bold**', '*italic*',",
  "    '`code`', '- ' and '1. ' lists, '> ' blockquotes, '---' rule, ```fenced```",
  "    code blocks, '| a | b |' GitHub tables (with a '|---|---|' row), and",
  "    '[text](url)' links. All of it renders in DOCX and PDF — do not flatten it.",
  "  • Worked example for `content`:",
  '      "## Overview\\nResults for **Q2**.\\n\\n### Highlights\\n- Revenue up *18%*\\n\\n| Metric | Value |\\n|---|---|\\n| MRR | $42k |"',
  "  • Excel: first row of each sheet's `data` is the header (auto-styled); just",
  "    supply the rows — headers, zebra striping, and column widths are automatic.",
  "  • Responses carry a `formattingQuality` object. If `isPlainText` is true,",
  "    re-create the document WITH markdown structure before returning to the user.",
  "",
  "Workflow:",
  "  • Always call `read-doc` with mode 'indepth' BEFORE `edit-doc` so you see",
  "    the existing structure.",
  "  • If `create-doc` returns `{ duplicate: true, existingPath }`, switch to",
  "    `edit-doc` on that path — do not retry create-doc with a different name.",
  "",
  "Output mode (`clientHint` parameter on creation tools):",
  "  • 'interactive' = polished one-line response for human-facing UIs.",
  "  • 'agent' (default) = verbose response with all metadata for AI consumption.",
  "",
  "Uploading (OPTIONAL):",
  "  • If — AND ONLY IF — you have been given an `uploadUrl` and `uploadAuthHeader`",
  "    for the current context, pass them to create-doc / create-markdown /",
  "    create-excel and the tool will write the file locally AND POST it as a",
  "    JSON envelope to that URL. Receivers can be any HTTPS endpoint that",
  "    implements the upload contract (Jira via CogniRunner is one example).",
  "  • If you have NOT been given upload credentials, simply OMIT both fields.",
  "    The tools work normally and return a local file path.",
  "  • The URL is single-use and bound server-side to a specific target. Do not",
  "    retry on 4xx, do not reuse one URL for a different target.",
].join("\n");

// Parameter guidance lives in each tool's top-level `description` (a
// "Parameters:" section), NOT in nested property descriptions. Grammar-
// constrained engines (rapid-mlx) compile every tool's name + inputSchema —
// nested `description` strings included, the tool-level description excluded —
// into one grammar with a 65,536-byte bound shared by ALL tools in the request.
// Nested descriptions made this registry 39.5 KB of that bound on its own.
// Keep schema descriptions to a few words where the name alone is ambiguous.
//
// CogniRunner (the HTTP consumer) clamps each tool description to 1,024 chars
// and passes a schema with no oneOf/anyOf/allOf through unchanged — so for
// read-doc, create-excel, fact-check and list-templates the essential
// parameter notes sit inside the first 1,024 chars.

const STYLE_PRESET = {
  type: "string",
  enum: ["minimal", "professional", "technical", "legal", "business", "casual", "colorful", "claude-like"],
};
const CATEGORY = {
  type: "string",
  enum: ["contracts", "technical", "business", "legal", "meeting", "research"],
};
const TAGS = { type: "array", items: { type: "string" } };
const DOC_TYPE = { type: "string", enum: ["concise", "formal", "explanatory", "scientific"] };
const TABLES = { type: "array", items: { type: "array", items: { type: "array", items: { type: "string" } } } };
const STYLE_OBJ = { type: "object", additionalProperties: true };
const REGISTRY_DESCRIPTION = { type: "string", description: "Registry note, not the body." };

// The supported markdown vocabulary, repeated in tool descriptions so even
// small/local models know exactly what renders. Keep in sync with
// parseMarkdownToDocx (doc-utils.js) and the PDF renderer's HTML conversion.
const MARKDOWN_FEATURES =
  "Supported markdown: '# H1' '## H2' '### H3' headings; '**bold**'; '*italic*'; " +
  "'`code`'; '- ' or '1. ' lists; '> ' blockquotes; '---' horizontal rule; " +
  "```fenced code blocks```; '| a | b |' GitHub tables (with a '|---|---|' " +
  "separator row); '[text](https://url)' links.";

// A complete worked example (one markdown string) the model can copy.
const CONTENT_EXAMPLE =
  'EXAMPLE content: "## Overview\\nThis report covers **Q2** results.\\n\\n' +
  '### Highlights\\n- Revenue up *18%*\\n- Two new markets\\n\\n' +
  '| Metric | Value |\\n|---|---|\\n| MRR | $42k |\\n| Churn | 1.2% |\\n\\n' +
  '> Next review: July."';

// PREFERRED input for document bodies: one markdown string. Far easier for weak
// models than assembling the string-or-object `paragraphs` array, and it renders
// with full block-level formatting.
const CONTENT_FIELD = { type: "string", description: "Whole body as one markdown string (preferred)." };

const PARA_ITEM = {
  oneOf: [
    { type: "string" },
    {
      type: "object",
      properties: {
        text: { type: "string" },
        headingLevel: { type: "string", enum: ["heading1", "heading2", "heading3"] },
        bold: { type: "boolean" },
        italics: { type: "boolean" },
        underline: { type: "boolean" },
        alignment: { type: "string", enum: ["left", "right", "center", "both"] },
      },
      required: ["text"],
    },
  ],
};
const PARAGRAPHS = { type: "array", items: PARA_ITEM, description: "Alternative to content." };

const HEADER_OBJ = {
  type: "object",
  properties: {
    text: { type: "string" },
    alignment: { type: "string", enum: ["left", "center", "right"] },
    color: { type: "string" },
  },
  required: ["text"],
};

const FOOTER_OBJ = {
  type: "object",
  properties: {
    text: { type: "string" },
    alignment: { type: "string", enum: ["left", "center", "right"] },
    color: { type: "string" },
  },
  required: ["text"],
};

const MARGINS_OBJ = {
  type: "object",
  properties: {
    top: { type: "number" },
    bottom: { type: "number" },
    left: { type: "number" },
    right: { type: "number" },
  },
};

const CLIENT_HINT = { type: "string", enum: ["agent", "interactive", "auto"] };

const UPLOAD_URL_FIELD = { type: "string", description: "OPTIONAL. Omit unless given one." };
const UPLOAD_AUTH_HEADER_FIELD = { type: "string" };
const UPLOAD_FILENAME_FIELD = { type: "string" };

// ---- "Parameters:" notes, shared across tools --------------------------------

const P_CONTENT =
  "content (PREFERRED): the entire body as ONE markdown string; the title is added as the H1 automatically, so start it at '## '. Use it instead of paragraphs unless you need per-paragraph style objects.";
const PARA_ITEM_NOTE =
  "an array whose entries are a markdown string (inline **bold**, *italics*, `code`, [link](url), '- ' lists and '| tables |' are preserved; a leading '# '/'## '/'### ' is auto-detected as a heading) OR {text (inline markdown preserved), headingLevel:'heading1'|'heading2'|'heading3' (explicit hierarchy, preferred over inline '#'), bold, italics, underline, alignment}.";
const P_PARAGRAPHS = "paragraphs: ALTERNATIVE to content (prefer content) — " + PARA_ITEM_NOTE;
const P_STYLE_PRESET =
  "stylePreset: 'claude-like' (modern blue-accented professional) is the default for general-purpose docs; 'professional' is the executive serif look; auto-selected from category if omitted.";
const P_REGISTRY =
  "category: subfolder for organization. tags: for registry search and discovery. description: brief note stored in the registry. docType: tone and depth of the documentation.";
const P_OUTPUT_PATH = "outputPath: optional; default derived from the title, placed under docs/<category>/.";
const P_DRY_RUN = "dryRun: true returns a preview without writing the file (default false).";
const P_SAFETY_FLAGS =
  "enforceDocsFolder: false allows output outside docs/; preventDuplicates: false allows same-title duplicates (both default true, recommended).";
const P_STYLE = "style: advanced fine-grained overrides merged on top of stylePreset.";
const P_PAGE =
  "header: {text, alignment?:'left'|'center'|'right', color?:'#hex' e.g. '#666666'}, applied to every page. footer: same shape; {current} and {total} in its text are replaced with page numbers. margins: {top, bottom, left, right} in twips (1440 = 1 inch); defaults top/bottom 720 (1440 if a header/footer is set), left/right 1080.";
const P_CLIENT_HINT =
  "clientHint: 'interactive' = polished one-line message for end users (no chatty registry/lineage notes); 'agent' = verbose response with all metadata for AI consumption; 'auto' (default) = detect from input shape or the MCP_CLIENT_TYPE env var, falling back to 'agent'.";
const P_UPLOAD =
  "uploadUrl / uploadAuthHeader / uploadFilename: OPTIONAL — if you have NOT been given an uploadUrl in your context, OMIT all three and the tool just writes the file locally. uploadUrl: HTTPS URL of a receiver that accepts a JSON envelope {data:base64, filename, mimeType, size} POSTed with Bearer auth (any compliant receiver; CogniRunner's attachment-upload web trigger is the reference implementation); single-use — do not retry on 4xx. uploadAuthHeader: its Authorization value (e.g. 'Bearer abc123'); REQUIRED when uploadUrl is set, ignored otherwise, never logged. uploadFilename: filename for the envelope; defaults to the local file's basename (useful when the local file got auto-suffixed by duplicate prevention and you want a clean name on the receiver).";

const params = (...notes) => "\nParameters: " + notes.join(" ");

export const TOOL_DEFINITIONS = [
  {
    name: "read-doc",
    description:
      "Read and analyze PDF, DOCX, Excel, or PowerPoint (.pptx) files. Modes: 'summary' (overview with preview), 'indepth' (full text, structure, metadata), 'focused' (query-based search). For a .pptx it returns a per-slide transcript (titles, bullets, speaker notes) and the slide count. Source: either local filePath OR a remote https url whose response is {data:base64, filename, mimeType, size} JSON guarded by authHeader (used for one-shot capabilities like CogniRunner attachment fetches). Always read before editing; use 'indepth' before edit-doc." +
      params(
        "filePath: local file path — use this OR url+authHeader.",
        "url: HTTPS URL returning that JSON envelope. authHeader: Authorization value (e.g. 'Bearer abc123'), required when url is set.",
        "filename: optional name hint for the temp-file extension when the response omits one.",
        "mode: default 'summary'. userQuery (the query) and context (context from previous questions) are used only with mode 'focused'.",
      ),
    inputSchema: {
      type: "object",
      properties: {
        filePath: { type: "string" },
        url: { type: "string" },
        authHeader: { type: "string" },
        filename: { type: "string" },
        mode: { type: "string", enum: ["summary", "indepth", "focused"] },
        userQuery: { type: "string" },
        context: { type: "string" },
      },
      required: [],
    },
  },
  {
    name: "detect-format",
    description:
      "PLAN the best output format BEFORE creating. Call this FIRST whenever the user didn't explicitly name a format. It weighs explicit format words, what the user wants to DO with the file, topic, and content shape — then returns a ready-to-use creation plan. " +
      "Nuance it captures: 'README / API / spec / for the repo' → markdown; 'budget / tracker / dataset / table' → excel (CSV if they say csv); 'editable / draft / template / in Word' → docx; 'print / send to the client / official / invoice / resume / final / sign' → PDF. DOCX = editable Word; PDF = final, fixed-layout, print/sign/send. " +
      "Returns { format (markdown|docx|excel|pdf), suggestedTool, stylePreset, category, docType, confidence, reason, alternativeFormat, outputFormat? ('csv'), unsupported? ('pptx'), note? }. Pass these straight into the create-* tool. There is no native slides/PowerPoint tool yet — it recommends the closest fit (usually PDF) and flags `unsupported:'pptx'`." +
      params(
        "userQuery: the user's original request, verbatim if possible.",
        "title: the document title if already chosen.",
        "content: a content preview if available — the more context, the better the routing.",
      ),
    inputSchema: {
      type: "object",
      properties: {
        userQuery: { type: "string" },
        title: { type: "string" },
        content: { type: "string" },
      },
      required: ["userQuery"],
    },
  },
  {
    name: "create-doc",
    description:
      "Create a styled, EDITABLE Word DOCX. USE for stakeholder/business/legal/research deliverables the user will keep editing in Word, or when they say 'Word / .docx / editable / draft / template'. " +
      "NOT for: a final/print/send-as-PDF deliverable (→ create-pdf), code/API/README docs (→ create-markdown), or tabular/numeric data (→ create-excel). The most full-featured tool: Document DNA defaults, 8 style presets, headers/footers with page numbers, margins, blueprint validation, and real tables. " +
      "ALWAYS format the body with markdown — never a wall of plain text. Simplest: put the whole body in the `content` string. " +
      MARKDOWN_FEATURES + " " + CONTENT_EXAMPLE + " " +
      "Title MUST be specific. Duplicate → { duplicate: true, existingPath } (switch to edit-doc). Response includes `formattingQuality` and `formatSuggestion` — if formatSuggestion is set, the content fits another format better, so heed it. Use dryRun: true for preview." +
      params(
        "title: specific descriptive title (rejected: 'Document', 'Untitled', etc.); becomes the document H1.",
        P_CONTENT,
        P_PARAGRAPHS,
        "tables: optional tables as 2D arrays; the first row is the header.",
        P_STYLE_PRESET,
        P_REGISTRY,
        P_OUTPUT_PATH,
        P_DRY_RUN,
        P_PAGE,
        "backgroundColor: optional page background hex, e.g. '#FFFFFF'. blueprint: optional blueprint name to validate the structure against (see list-templates). tableHeaderFill: optional hex override for table header cell fill.",
        P_SAFETY_FLAGS,
        P_STYLE,
        P_CLIENT_HINT,
        P_UPLOAD,
      ),
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string" },
        content: CONTENT_FIELD,
        paragraphs: PARAGRAPHS,
        tables: TABLES,
        outputPath: { type: "string" },
        stylePreset: STYLE_PRESET,
        category: CATEGORY,
        tags: TAGS,
        description: REGISTRY_DESCRIPTION,
        dryRun: { type: "boolean" },
        docType: DOC_TYPE,
        header: HEADER_OBJ,
        footer: FOOTER_OBJ,
        margins: MARGINS_OBJ,
        backgroundColor: { type: "string" },
        blueprint: { type: "string" },
        enforceDocsFolder: { type: "boolean" },
        preventDuplicates: { type: "boolean" },
        tableHeaderFill: { type: "string" },
        style: STYLE_OBJ,
        clientHint: CLIENT_HINT,
        uploadUrl: UPLOAD_URL_FIELD,
        uploadAuthHeader: UPLOAD_AUTH_HEADER_FIELD,
        uploadFilename: UPLOAD_FILENAME_FIELD,
      },
      required: ["title"],
    },
  },
  {
    name: "create-markdown",
    description:
      "Create a Markdown (.md) file for technical/code content that lives in a repo. USE for READMEs, API docs, specs, runbooks, changelogs, integration guides, code-heavy content — anything for GitHub/developers. " +
      "NOT for stakeholder-facing or printable deliverables (→ create-doc / create-pdf) or tabular data (→ create-excel). " +
      "MARKDOWN SUPERPOWERS: set `toc: true` to auto-generate an anchor-linked Table of Contents from the H2/H3 headings; pass `frontmatter: {...}` to emit YAML frontmatter (title, date, tags[]) for static-site generators (Hugo/Jekyll/Astro). " +
      "Simplest usage: put the whole body in the `content` string. " +
      MARKDOWN_FEATURES + " " + CONTENT_EXAMPLE + " The title becomes the H1, so start `content` at '## '. Title MUST be specific. Response includes `formattingQuality`. Use dryRun: true for preview." +
      params(
        "title: specific descriptive title (becomes the H1; rejected if generic).",
        P_CONTENT,
        P_PARAGRAPHS,
        "toc: true auto-generates an anchor-linked Table of Contents from the H2/H3 headings, inserted under the title — great for long READMEs/guides.",
        "frontmatter: optional YAML frontmatter emitted at the very top, e.g. { title, date, tags: [...] } — for static-site generators (Hugo/Jekyll/Astro).",
        P_OUTPUT_PATH,
        P_REGISTRY,
        P_DRY_RUN,
        "enforceDocsFolder: false allows output outside docs/; preventDuplicates: false allows same-title duplicates (both default true).",
        P_CLIENT_HINT,
        P_UPLOAD,
      ),
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string" },
        content: CONTENT_FIELD,
        paragraphs: PARAGRAPHS,
        toc: { type: "boolean" },
        frontmatter: { type: "object", additionalProperties: true },
        outputPath: { type: "string" },
        category: CATEGORY,
        tags: TAGS,
        description: REGISTRY_DESCRIPTION,
        dryRun: { type: "boolean" },
        docType: DOC_TYPE,
        enforceDocsFolder: { type: "boolean" },
        preventDuplicates: { type: "boolean" },
        clientHint: CLIENT_HINT,
        uploadUrl: UPLOAD_URL_FIELD,
        uploadAuthHeader: UPLOAD_AUTH_HEADER_FIELD,
        uploadFilename: UPLOAD_FILENAME_FIELD,
      },
      required: ["title"],
    },
  },
  {
    name: "create-excel",
    description:
      "Create a styled Excel XLSX (or CSV). USE for ANY tabular/numeric data — budgets, trackers, datasets, KPIs, price lists, schedules; even a table inside a 'report' belongs here, not in a doc. " +
      "EXCEL SUPERPOWERS: a cell whose string starts with '=' becomes a LIVE formula (e.g. \"=SUM(B2:B9)\", \"=B2*C2\") that Excel computes on open; money ($/price/cost/revenue) and percent (%) header columns auto-format; the header row gets autofilter; columns auto-fit. The first row of each sheet is the header (auto-styled), body rows get zebra striping — you only supply values. " +
      "Set `outputFormat: \"csv\"` for a plain CSV (first sheet only; no styling/formulas). " +
      'EXAMPLE: sheets: [{ name: "Q2 Revenue", data: [["Month","Units","Price","Revenue"],["Apr",120,9.99,"=B2*C2"],["Total","=SUM(B2:B2)","","=SUM(D2:D2)"]] }]. ' +
      "Sheet names MUST be specific (rejects 'Sheet1', 'Data', etc.). Use dryRun: true for preview." +
      params(
        "sheets: at least one {name, data: 2D array, first row = header}.",
        "outputFormat: 'xlsx' (default — full styling, formulas, autofilter) or 'csv' (plain text, first sheet only).",
        "style: optional overrides on top of stylePreset — font {family, size, color, bold}, columnWidths {<columnIndex>: width in characters}, rowHeights {<rowIndex>: height in points}, headerBold, zebraColor (hex for striped rows).",
        "title: workbook title (used for filename, registry, and auto-categorization).",
        P_STYLE_PRESET,
        "outputPath: optional; default derived from the title.",
        "enforceDocsFolder: false allows output outside docs/; preventDuplicates: false allows same-name duplicates (both default true).",
        P_DRY_RUN,
        P_REGISTRY,
        P_CLIENT_HINT,
        P_UPLOAD,
      ),
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string" },
        sheets: {
          type: "array",
          items: { type: "object", properties: { name: { type: "string" }, data: { type: "array", items: { type: "array" } } }, required: ["name", "data"] },
        },
        outputFormat: { type: "string", enum: ["xlsx", "csv"] },
        stylePreset: STYLE_PRESET,
        style: {
          type: "object",
          properties: {
            font: { type: "object", description: "{family,size,color,bold}" },
            columnWidths: { type: "object", description: "{colIndex: chars}" },
            rowHeights: { type: "object", description: "{rowIndex: points}" },
            headerBold: { type: "boolean" },
            zebraColor: { type: "string", description: "Hex" },
          },
        },
        outputPath: { type: "string" },
        enforceDocsFolder: { type: "boolean" },
        preventDuplicates: { type: "boolean" },
        dryRun: { type: "boolean" },
        category: CATEGORY,
        tags: TAGS,
        description: REGISTRY_DESCRIPTION,
        docType: DOC_TYPE,
        clientHint: CLIENT_HINT,
        uploadUrl: UPLOAD_URL_FIELD,
        uploadAuthHeader: UPLOAD_AUTH_HEADER_FIELD,
        uploadFilename: UPLOAD_FILENAME_FIELD,
      },
      required: ["sheets"],
    },
  },
  {
    name: "create-pdf",
    description:
      "Create a FINAL, fixed-layout PDF to read / print / send / sign. USE when the user says PDF / print / 'send to the client' / official / invoice / flyer / resume / cover letter / 'read-only' / 'final version'. " +
      "NOT for content they'll keep editing (→ create-doc) or code/repo docs (→ create-markdown). Rendered from markdown with the same 8 presets as create-doc, via headless Chromium. " +
      "PDF SUPERPOWER: set `toc: true` for a clickable Table of Contents (with heading anchors) at the top. Supports headers/footers with {current}/{total} page numbers and margins. " +
      "ALWAYS format the body with markdown. Easiest: put the whole body in the `content` string. " +
      MARKDOWN_FEATURES + " " + CONTENT_EXAMPLE + " " +
      "Title MUST be specific. Response includes `formattingQuality` and `formatSuggestion`. Use dryRun: true for preview. (To READ a PDF, use read-doc.)" +
      params(
        "title: specific descriptive title (rejected: 'Document', 'Untitled', etc.); rendered as the top H1.",
        P_CONTENT,
        P_PARAGRAPHS,
        "toc: true adds a clickable Table of Contents (with heading anchors) at the top of the PDF.",
        "tables: optional tables as 2D arrays; the first row is the header; rendered as styled tables after the body.",
        P_STYLE_PRESET,
        P_REGISTRY,
        P_OUTPUT_PATH,
        P_DRY_RUN,
        P_PAGE,
        P_STYLE,
        P_SAFETY_FLAGS,
        P_CLIENT_HINT,
        P_UPLOAD,
      ),
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string" },
        content: CONTENT_FIELD,
        paragraphs: PARAGRAPHS,
        toc: { type: "boolean" },
        tables: TABLES,
        outputPath: { type: "string" },
        stylePreset: STYLE_PRESET,
        category: CATEGORY,
        tags: TAGS,
        description: REGISTRY_DESCRIPTION,
        dryRun: { type: "boolean" },
        docType: DOC_TYPE,
        header: HEADER_OBJ,
        footer: FOOTER_OBJ,
        margins: MARGINS_OBJ,
        style: STYLE_OBJ,
        enforceDocsFolder: { type: "boolean" },
        preventDuplicates: { type: "boolean" },
        clientHint: CLIENT_HINT,
        uploadUrl: UPLOAD_URL_FIELD,
        uploadAuthHeader: UPLOAD_AUTH_HEADER_FIELD,
        uploadFilename: UPLOAD_FILENAME_FIELD,
      },
      required: ["title"],
    },
  },
  {
    name: "create-pptx",
    description:
      "Create an EDITABLE PowerPoint presentation (.pptx) you can open in PowerPoint / Keynote / Google Slides. USE when the user asks for slides / a deck / a presentation / a pitch deck / 'powerpoint' / 'keynote'. " +
      "NOT for a flowing document (→ create-doc / create-pdf), code/repo docs (→ create-markdown), or pure tabular data (→ create-excel). " +
      "SLIDE STRUCTURE: the title becomes a centered title slide; EACH '## ' heading starts a NEW slide whose body is the markdown beneath it. Inside a slide, '### ' is a sub-heading, '- '/'1. ' are bullets, '| a | b |' GitHub tables render as native slide tables, a ```chart``` fenced block (first line 'type: bar|column|line|pie|doughnut|area', optional 'title:', then a markdown table whose first column is the category and each other column is a data series) becomes a NATIVE editable chart, and ```fenced``` code blocks render as monospace. Keep each slide focused — a few bullets, not a wall of text. " +
      "Styled from the same 8 presets as create-doc (colors/fonts map onto the slides). " +
      MARKDOWN_FEATURES + " " +
      'EXAMPLE content: "## Problem\\n- Manual steps are slow\\n- Errors slip through\\n\\n## Our Solution\\n- One-click automation\\n- Built-in checks\\n\\n## Results\\n| Metric | Before | After |\\n|---|---|---|\\n| Time | 2h | 5m |". ' +
      "Title MUST be specific. Use dryRun: true to preview the slide breakdown. (To make a fixed, non-editable deck use create-pdf instead.)" +
      params(
        "title: specific descriptive title (rejected: 'Document', 'Untitled', etc.); becomes the title slide.",
        P_CONTENT,
        P_PARAGRAPHS + " Each '## ' heading starts a new slide.",
        "tables: optional tables as 2D arrays; the first row is the header; rendered as native slide tables, appended after the body.",
        P_STYLE_PRESET,
        P_REGISTRY + " (description is also the title-slide subtitle when the body has no preamble.)",
        P_OUTPUT_PATH,
        "dryRun: true returns a preview (title, slide count, section headings) without writing the file (default false).",
        P_STYLE,
        P_SAFETY_FLAGS,
        P_CLIENT_HINT,
        P_UPLOAD,
      ),
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string" },
        content: CONTENT_FIELD,
        paragraphs: PARAGRAPHS,
        tables: TABLES,
        outputPath: { type: "string" },
        stylePreset: STYLE_PRESET,
        category: CATEGORY,
        tags: TAGS,
        description: REGISTRY_DESCRIPTION,
        dryRun: { type: "boolean" },
        docType: DOC_TYPE,
        style: STYLE_OBJ,
        enforceDocsFolder: { type: "boolean" },
        preventDuplicates: { type: "boolean" },
        clientHint: CLIENT_HINT,
        uploadUrl: UPLOAD_URL_FIELD,
        uploadAuthHeader: UPLOAD_AUTH_HEADER_FIELD,
        uploadFilename: UPLOAD_FILENAME_FIELD,
      },
      required: ["title"],
    },
  },
  {
    name: "edit-pptx",
    description:
      "Edit an existing PowerPoint (.pptx). Actions: 'preview' (show the current slide outline), 'append-slides' (add new slides from markdown — one '## ' heading per slide), 'replace-slide' (replace one content slide by 1-based index with new markdown). " +
      "IMPORTANT: edit-pptx REBUILDS the deck from the existing slides' extracted TEXT + speaker notes, normalized to a style preset — charts, images, and exact original formatting on pre-existing slides are NOT preserved (best for the text/bullet decks create-pptx makes). To author a brand-new deck use create-pptx; to read a deck use read-doc." +
      params(
        "filePath: path to the existing .pptx file.",
        "content: new slide markdown ('## ' per slide); required for append-slides and replace-slide.",
        "slideIndex: 1-based index among CONTENT slides (the title slide is excluded); required for replace-slide.",
        "title: optional heading to use when replace-slide content has no leading '## '.",
        P_STYLE_PRESET,
        P_STYLE,
        "outputPath: optional; write the result here instead of overwriting the input file.",
        P_CLIENT_HINT,
        P_UPLOAD,
      ),
    inputSchema: {
      type: "object",
      properties: {
        filePath: { type: "string" },
        action: { type: "string", enum: ["preview", "append-slides", "replace-slide"] },
        content: { type: "string" },
        slideIndex: { type: "number" },
        title: { type: "string" },
        stylePreset: STYLE_PRESET,
        style: STYLE_OBJ,
        outputPath: { type: "string" },
        clientHint: CLIENT_HINT,
        uploadUrl: UPLOAD_URL_FIELD,
        uploadAuthHeader: UPLOAD_AUTH_HEADER_FIELD,
        uploadFilename: UPLOAD_FILENAME_FIELD,
      },
      required: ["filePath", "action"],
    },
  },
  {
    name: "edit-doc",
    description:
      "Edit an existing DOCX. Actions: 'append' (XML-patches new content, PRESERVES original formatting/headers/footers/images), 'replace' (overwrites body but keeps section properties), 'style' (apply a stylePreset to existing paragraphs without changing text), 'preview' (show what would change). Always read-doc with mode 'indepth' first so you understand the existing structure." +
      params(
        "filePath: absolute or project-relative path to the existing DOCX file.",
        "title: optional new title (used by 'replace').",
        "paragraphs: what to append or replace with — " + PARA_ITEM_NOTE,
        "tables: tables as 2D arrays.",
        P_STYLE_PRESET,
        "category: document category for the registry update. tags: for registry search. docType: tone and depth.",
        "style: advanced fine-grained style overrides.",
        "addSeparator: if true (the default for 'append'), insert a blank paragraph before the new content as a visual separator.",
        "useLegacy: DANGER — true recreates the document via mammoth, which DESTROYS all original formatting (fonts, colors, images, headers, footers). Only set it if XML patching fails. Default false.",
      ),
    inputSchema: {
      type: "object",
      properties: {
        filePath: { type: "string" },
        action: { type: "string", enum: ["append", "replace", "style", "preview"] },
        title: { type: "string" },
        paragraphs: { type: "array", items: PARA_ITEM },
        tables: TABLES,
        stylePreset: STYLE_PRESET,
        category: { type: "string" },
        tags: TAGS,
        docType: DOC_TYPE,
        style: STYLE_OBJ,
        addSeparator: { type: "boolean" },
        useLegacy: { type: "boolean", description: "DANGER: destroys formatting." },
      },
      required: ["filePath", "action"],
    },
  },
  {
    name: "edit-excel",
    description:
      "Edit an existing XLSX workbook. Actions: 'append-rows' (add rows to a sheet, preserves existing styles), 'append-sheet' (add a new sheet — fails if name exists), 'replace-sheet' (overwrite a sheet's data), 'preview' (show what would change). Use read-doc first if you don't know the sheet structure." +
      params(
        "filePath: absolute or project-relative path to the existing XLSX file.",
        "sheetName: target sheet (required for append-rows and replace-sheet).",
        "rows: rows to append (required for append-rows).",
        "sheetData: {name, data: 2D array of cells, first row = header} (required for append-sheet and replace-sheet).",
        "style: optional overrides (zebraColor, etc.).",
        P_STYLE_PRESET,
        "category: document category for the registry update. tags: for registry search. docType: tone and depth.",
      ),
    inputSchema: {
      type: "object",
      properties: {
        filePath: { type: "string" },
        action: { type: "string", enum: ["append-rows", "append-sheet", "replace-sheet", "preview"] },
        sheetName: { type: "string" },
        rows: { type: "array", items: { type: "array" } },
        sheetData: {
          type: "object",
          properties: {
            name: { type: "string" },
            data: { type: "array", items: { type: "array" } },
          },
          required: ["name", "data"],
        },
        style: STYLE_OBJ,
        stylePreset: STYLE_PRESET,
        category: { type: "string" },
        tags: TAGS,
        docType: DOC_TYPE,
      },
      required: ["filePath", "action"],
    },
  },
  {
    name: "list-documents",
    description:
      "Search the document registry. Filters compose with AND-logic: category match AND tag match AND title-substring match. Returns an array of registry entries with { id, title, filePath, category, tags, description, createdAt, updatedAt }. Use this before create-doc to check if a similar document exists." +
      params(
        "category: exact category match.",
        "tags: matches if ANY tag overlaps.",
        "title: case-insensitive substring match.",
      ),
    inputSchema: {
      type: "object",
      properties: {
        category: { type: "string" },
        tags: { type: "array", items: { type: "string" } },
        title: { type: "string" },
      },
    },
  },
  {
    name: "list-templates",
    description:
      "List available document templates AND blueprints. Templates are static, named structures (e.g. 'claude-like', 'technical-docs', 'business-report') you can reference via tags on create-doc. Blueprints are auto-learned structures stored in .document-blueprints.json. Use the returned `name` as `blueprint:` in create-doc, or as a tag for create-doc tag-based style detection." +
      params("category: optional filter (matches blueprints' learnedFrom category and templates' recommendedFor)."),
    inputSchema: {
      type: "object",
      properties: {
        category: { type: "string" },
      },
    },
  },
  {
    name: "dna",
    description:
      "Manage the project's Document DNA — header/footer/style defaults that auto-apply to every create-doc call. Actions: 'init' (one-time setup with companyName/header/footer/stylePreset), 'get' (current config + project profile), 'evolve' (analyze usage trends; with apply:true, MUTATES dna config and may auto-create blueprints — irreversible without manual cleanup), 'save-memory'/'delete-memory' (project-wide preferences keyed by string)." +
      params(
        "init only: companyName (used as the default header text), headerText, headerAlignment, footerText ({current}/{total} = page numbers), footerAlignment — the defaults.",
        P_STYLE_PRESET,
        "evolve only: apply — true AUTO-MUTATES the dna config from the top suggestion; off by default, review suggestions first. threshold — minimum documents before suggesting a mutation (default 5).",
        "save-memory only: memory — a short preference statement (e.g. 'Always use 1-inch margins for contracts').",
        "key: memory key (optional and auto-generated for save-memory; required for delete-memory).",
      ),
    inputSchema: {
      type: "object",
      properties: {
        action: { type: "string", enum: ["init", "get", "evolve", "save-memory", "delete-memory"] },
        companyName: { type: "string" },
        stylePreset: STYLE_PRESET,
        headerText: { type: "string" },
        headerAlignment: { type: "string", enum: ["left", "center", "right"] },
        footerText: { type: "string" },
        footerAlignment: { type: "string", enum: ["left", "center", "right"] },
        apply: { type: "boolean", description: "evolve only; mutates config." },
        threshold: { type: "number" },
        memory: { type: "string" },
        key: { type: "string" },
      },
      required: ["action"],
    },
  },
  {
    name: "blueprint",
    description:
      "Manage structural blueprints — section/heading templates extracted from real documents. Actions: 'learn' (extract from a DOCX or PDF you already have), 'list' (show stored blueprints), 'delete' (remove by name). Blueprints are also auto-learned during 'dna evolve' when recurring structures are detected. Use a blueprint by passing { blueprint: '<name>' } to create-doc — the tool will validate that your paragraphs match the structure." +
      params(
        "filePath: source DOCX/PDF (REQUIRED for 'learn'; ignored otherwise).",
        "name: blueprint name (required for learn and delete).",
        "description: optional (learn only).",
      ),
    inputSchema: {
      type: "object",
      properties: {
        action: { type: "string", enum: ["learn", "list", "delete"] },
        filePath: { type: "string" },
        name: { type: "string" },
        description: { type: "string" },
      },
      required: ["action"],
    },
  },
  {
    name: "drift-monitor",
    description:
      "Monitor documents for structural drift over time. Actions: 'watch' (compute and store a fingerprint = SHA-256 + heading tree + word counts; capped at 500 paragraphs), 'check' (compare current state against the stored baseline; reports word-count delta, added/removed headings, category shifts, and a similarity score). Omit filePath on 'check' to compare all watched documents." +
      params(
        "filePath: document path (REQUIRED for 'watch'; optional for 'check' — omit to check all watched docs).",
        "name: friendly display name for the watched document (watch only).",
      ),
    inputSchema: {
      type: "object",
      properties: {
        action: { type: "string", enum: ["watch", "check"] },
        filePath: { type: "string" },
        name: { type: "string" },
      },
      required: ["action"],
    },
  },
  {
    name: "get-lineage",
    description:
      "Trace the provenance chain of a document. Returns a tree { sources: [{filePath, ...}], derivatives: [{filePath, ...}] } showing which read documents informed this document (sources, traced upstream) and which created documents derived from it (derivatives, traced downstream). Lineage is recorded automatically when read-doc and create-doc are called within the same session." +
      params(
        "filePath: document path to trace lineage for.",
        "depth: traversal depth in either direction (default 3).",
      ),
    inputSchema: {
      type: "object",
      properties: {
        filePath: { type: "string" },
        depth: { type: "number" },
      },
      required: ["filePath"],
    },
  },
  {
    name: "fact-check",
    description:
      "Fact-check a document (or explicit claims) against the LIVE WEB. CROSS-MCP: extracts the claims, then CALLS the web-search MCP (get-web-search-summaries) for sources per claim; optionally writes a cited PDF report. " +
      "Returns, per claim, evidence + source URLs + a ROUGH keyword-overlap support score — NOT a verdict; read the evidence and decide support/refute yourself." +
      params(
        "claims (statements to verify) OR filePath (PDF/DOCX/Excel/PPTX) OR content (raw text) — claims are auto-extracted from the latter two.",
        "webSearchBearer: REQUIRED, your web-search MCP tenant bearer (demo key). serperKey: REQUIRED, your Serper key (the web-search MCP is keyless).",
        "webSearchUrl: optional /mcp URL; defaults to the hosted endpoint (or WEB_SEARCH_MCP_URL).",
        "maxClaims: default 8, max 20. generateReport: true also writes a cited PDF report (download link). reportTitle: optional.",
        P_CLIENT_HINT,
        P_UPLOAD,
      ),
    inputSchema: {
      type: "object",
      properties: {
        claims: { type: "array", items: { type: "string" } },
        filePath: { type: "string" },
        content: { type: "string" },
        maxClaims: { type: "number" },
        webSearchBearer: { type: "string" },
        serperKey: { type: "string" },
        webSearchUrl: { type: "string" },
        generateReport: { type: "boolean" },
        reportTitle: { type: "string" },
        clientHint: CLIENT_HINT,
        uploadUrl: UPLOAD_URL_FIELD,
        uploadAuthHeader: UPLOAD_AUTH_HEADER_FIELD,
        uploadFilename: UPLOAD_FILENAME_FIELD,
      },
      required: [],
    },
  },
];

// Wrap a create-* result as MCP content. When the server minted a hosted
// download URL, also emit an idiomatic `resource_link` content block so MCP
// clients render a saveable/clickable artifact (others still see the URL in the
// JSON text). This is how a remote server delivers the generated file.
function wrapCreateResult(r, toolName) {
  const content = [{ type: "text", text: JSON.stringify(r, null, 2) }];
  // Make failures VISIBLE to the learning loop. Successes are logged inside the
  // create-* handlers themselves (with full detail + memory nudge); here we only
  // capture the breakage — PLAIN_TEXT rejections, duplicate detection, blueprint
  // / validation failures — so `npm run insights` reflects what actually fails
  // for real callers. Best-effort; logInsight never throws.
  if (r && !r.success) {
    logInsight({
      server: "doc-processor",
      tool: toolName || "create-*",
      event: r.error === "PLAIN_TEXT" ? "PLAIN_TEXT" : (r.duplicate ? "duplicate" : "failure"),
      client: resolveClientProfile().clientName,
      reason: r.error || (r.message ? String(r.message).slice(0, 160) : undefined),
    });
  }
  // Emit the resource_link only in agent mode. Interactive/human-facing callers
  // (e.g. CogniRunner via the Anthropic connector, which also gets the file via
  // the upload bridge) get a concise text result with the downloadUrl inline —
  // no extra content block to risk connector incompatibility.
  if (r && r.downloadUrl && r.filePath && r.clientMode !== "interactive") {
    content.push({
      type: "resource_link",
      uri: r.downloadUrl,
      name: r.filePath.split(/[/\\]/).pop(),
      mimeType: mimeTypeFromExtension(r.filePath),
      description: "Download the generated file (hosted link, valid ~24h).",
    });
  }
  return { content, isError: !r.success };
}

async function dispatchToolCall(request) {
  const { name, arguments: params } = request.params;

  log("info", "Tool called:", { toolName: name });

  try {
    if (params?.filePath && !params?.url && !name.startsWith("create-")) {
      const skipValidation =
        (name === "drift-monitor" && params.action === "check") ||
        (name === "blueprint" && params.action !== "learn") ||
        name === "check-drift";

      if (!skipValidation) {
        const resolved = path.resolve(params.filePath);
        if (!fs.existsSync(resolved)) {
          logInsight({ server: "doc-processor", tool: name, event: "failure", reason: "file-not-found", client: resolveClientProfile(params).clientName });
          return { content: [{ type: "text", text: `Error: File not found: ${params.filePath}` }], isError: true };
        }
        params.filePath = resolved;
      }
    }

    switch (name) {
      case "read-doc": {
        const r = await handleReadDoc(params);
        if (r?.isError) logInsight({ server: "doc-processor", tool: "read-doc", event: "failure", client: resolveClientProfile(params).clientName, reason: (r.content?.[0]?.text || "").slice(0, 160) });
        return r;
      }

      case "get-doc-summary": return await handleReadDoc({ ...params, mode: "summary" });
      case "get-doc-indepth": return await handleReadDoc({ ...params, mode: "indepth" });
      case "get-doc-focused": return await handleReadDoc({ ...params, mode: "focused" });

      case "detect-format": {
        const result = await detectFormat(params);
        // Log the routing outcome — the `format` mix and especially `unsupported`
        // (e.g. 'pptx') are direct feature-gap signal for the creator.
        logInsight({ server: "doc-processor", tool: "detect-format", event: "success", client: resolveClientProfile(params).clientName, format: result?.format, unsupported: result?.unsupported || null });
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }

      case "create-doc": {
        return wrapCreateResult(await createDoc(params), "create-doc");
      }

      case "create-markdown": {
        return wrapCreateResult(await createMarkdown(params), "create-markdown");
      }

      case "create-excel": {
        return wrapCreateResult(await createExcel(params), "create-excel");
      }

      case "create-pdf": {
        return wrapCreateResult(await createPdf(params), "create-pdf");
      }

      case "create-pptx": {
        return wrapCreateResult(await createPptx(params), "create-pptx");
      }

      case "edit-pptx": {
        return wrapCreateResult(await editPptx(params), "edit-pptx");
      }

      case "edit-doc": {
        const r = await editDoc(params);
        if (!r.success) logInsight({ server: "doc-processor", tool: "edit-doc", event: "failure", client: resolveClientProfile(params).clientName, reason: r.error || (r.message ? String(r.message).slice(0, 160) : undefined) });
        return { content: [{ type: "text", text: JSON.stringify(r, null, 2) }], isError: !r.success };
      }

      case "edit-excel": {
        const r = await editExcel(params);
        if (!r.success) logInsight({ server: "doc-processor", tool: "edit-excel", event: "failure", client: resolveClientProfile(params).clientName, reason: r.error || (r.message ? String(r.message).slice(0, 160) : undefined) });
        return { content: [{ type: "text", text: JSON.stringify(r, null, 2) }], isError: !r.success };
      }

      case "list-documents":
      case "search-registry": {
        const docs = await listDocuments(params || {});
        return docs
          ? { content: [{ type: "text", text: JSON.stringify(docs, null, 2) }] }
          : { content: [{ type: "text", text: JSON.stringify({ error: "Failed to list documents" }, null, 2) }], isError: true };
      }

      case "list-templates": {
        const { listBlueprints } = await import("./utils/blueprint-store.js");
        const { getTemplateDescriptions } = await import("./utils/document-tags.js");

        const allBlueprints = listBlueprints();
        const allTemplates = getTemplateDescriptions();

        const categoryFilter = (params?.category || "").toLowerCase().trim();
        const matchesCategory = (item, fieldsToCheck) => {
          if (!categoryFilter) return true;
          for (const f of fieldsToCheck) {
            const v = item[f];
            if (typeof v === "string" && v.toLowerCase().includes(categoryFilter)) return true;
            if (Array.isArray(v) && v.some(x => typeof x === "string" && x.toLowerCase().includes(categoryFilter))) return true;
          }
          return false;
        };

        const blueprints = allBlueprints.filter(bp => matchesCategory(bp, ["category", "stylePreset", "name"]));
        const templates = allTemplates.filter(t => matchesCategory(t, ["recommendedFor", "name", "stylePreset", "tag"]));

        const result = {
          templates: templates.map(t => ({
            ...t,
            kind: "static-template",
            usage: `Pass tags: ["${t.tag}"] to create-doc to apply this template's styling.`,
          })),
          blueprints: blueprints.map(bp => ({
            ...bp,
            kind: "blueprint",
            usage: `Pass blueprint: "${bp.name}" to create-doc to validate the structure.`,
          })),
          totalTemplates: templates.length,
          totalBlueprints: blueprints.length,
          filter: categoryFilter || null,
          message: blueprints.length === 0 && templates.length === 0
            ? `No templates or blueprints match filter "${categoryFilter}".`
            : `${templates.length} static template(s) and ${blueprints.length} learned blueprint(s).`,
        };

        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }

      case "dna":
      case "init-dna":
      case "get-dna":
      case "evolve-dna":
        return await handleDNA(params, name);

      case "blueprint":
      case "learn-blueprint":
      case "list-blueprints":
        return await handleBlueprint(params, name);

      case "drift-monitor":
      case "watch-document":
      case "check-drift":
        return await handleDriftMonitor(params, name);

      case "get-lineage":
        return await handleGetLineage(params);

      case "fact-check": {
        const r = await factCheck(params);
        const content = [{ type: "text", text: JSON.stringify(r, null, 2) }];
        if (r.report?.downloadUrl && r.report?.filePath) {
          content.push({
            type: "resource_link",
            uri: r.report.downloadUrl,
            name: r.report.filePath.split(/[/\\]/).pop(),
            mimeType: mimeTypeFromExtension(r.report.filePath),
            description: "Download the fact-check report (hosted link, valid ~24h).",
          });
        }
        return { content, isError: !r.success };
      }

      default: {
        log("error", "Unknown tool:", { toolName: name });
        return { content: [{ type: "text", text: `Unknown tool: ${name}` }], isError: true };
      }
    }
  } catch (error) {
    log("error", "Tool error:", { toolName: name, error: error.message });
    // This is where weak-model malformed args surface (e.g. "params.paragraphs
    // is not of a type array"). Capture them so the backlog reflects reality.
    logInsight({ server: "doc-processor", tool: name, event: "error", client: resolveClientProfile(params || {}).clientName, reason: (error.message || "").slice(0, 200) });
    return { content: [{ type: "text", text: `Error: ${error.message}` }], isError: true };
  }
}

export function registerAllTools(server) {
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: TOOL_DEFINITIONS,
  }));
  server.setRequestHandler(CallToolRequestSchema, dispatchToolCall);
}
