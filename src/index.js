#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import fs from "fs";
import path from "path";

// Import utilities
import { setupLogging, log } from "./utils/logger.js";

// Import tool handlers
import { handleReadDoc } from "./tools/read-doc-tool.js";
import { createDoc } from "./tools/create-doc.js";
import { createExcel } from "./tools/create-excel.js";
import { createMarkdown } from "./tools/create-markdown.js";
import { editDoc } from "./tools/edit-doc.js";
import { editExcel } from "./tools/edit-excel.js";
import { listDocuments } from "./tools/utils.js";
import { handleDNA } from "./tools/dna-tool.js";
import { handleBlueprint } from "./tools/blueprint-tool.js";
import { handleDriftMonitor } from "./tools/drift-tool.js";
import { handleGetLineage } from "./tools/lineage-tool.js";
import { detectFormat } from "./services/format-router.js";

// Initialize logging
setupLogging();

// Top-level instructions sent to the MCP client. These reach the calling LLM
// alongside the tool list. Keep them tight and actionable — the model uses
// them to pick the right tool and shape the right inputs.
const SERVER_INSTRUCTIONS = [
  "This server reads, creates, and edits PDF / DOCX / Markdown / Excel files.",
  "",
  "Format selection:",
  "  • Call `detect-format` FIRST when the user didn't specify a format.",
  "  • Technical/code/API/integration → markdown (use `create-markdown`).",
  "  • Stakeholder/business/legal/research/report → docx (use `create-doc`).",
  "  • Numeric/budget/data/tabular → excel (use `create-excel`).",
  "",
  "Quality:",
  "  • Titles MUST be specific. 'Document', 'Untitled', 'File' etc. are rejected.",
  "  • For DOCX, the default style 'claude-like' renders modern blue-accented",
  "    documents with proper bullet/numbered lists, blockquotes, hyperlinks,",
  "    and inline tables. You don't need to flatten markdown — pass it through.",
  "  • For DOCX paragraphs use object form `{text, headingLevel}` for headings.",
  "  • Inline emphasis (**bold**, *italic*, `code`, [text](url)) renders correctly.",
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

// Create MCP server
const server = new Server(
  { name: "mcp-doc-processor", version: "1.0.0" },
  {
    capabilities: { tools: {} },
    instructions: SERVER_INSTRUCTIONS,
  },
);

// Shared schema fragments
const STYLE_PRESET = {
  type: "string",
  enum: ["minimal", "professional", "technical", "legal", "business", "casual", "colorful", "claude-like"],
  description: "Style preset. 'claude-like' (modern blue-accented professional) is the default for general-purpose docs. 'professional' is the executive serif look. Auto-selected from category if omitted.",
};
const CATEGORY = {
  type: "string",
  enum: ["contracts", "technical", "business", "legal", "meeting", "research"],
  description: "Document category for subfolder organization.",
};
const TAGS = {
  type: "array",
  items: { type: "string" },
  description: "Tags for registry search and discovery.",
};
const DOC_TYPE = {
  type: "string",
  enum: ["concise", "formal", "explanatory", "scientific"],
  description: "Tone and depth of the documentation.",
};
const PARA_ITEM = {
  oneOf: [
    { type: "string", description: "Plain paragraph text. Markdown formatting inside (e.g. **bold**, *italics*, `code`, [link](url)) is preserved when rendered. Leading '# ', '## ', '### ' is auto-detected as heading." },
    {
      type: "object",
      properties: {
        text: { type: "string", description: "Paragraph text. Inline markdown is preserved." },
        headingLevel: { type: "string", enum: ["heading1", "heading2", "heading3"], description: "Use for explicit heading hierarchy. Preferred over inline '#'." },
        bold: { type: "boolean" },
        italics: { type: "boolean" },
        underline: { type: "boolean" },
        alignment: { type: "string", enum: ["left", "right", "center", "both"] },
      },
      required: ["text"],
    },
  ],
};

const HEADER_OBJ = {
  type: "object",
  description: "Page header: { text, alignment?: 'left'|'center'|'right', color?: '#hex' }. Applies to every page.",
  properties: {
    text: { type: "string" },
    alignment: { type: "string", enum: ["left", "center", "right"] },
    color: { type: "string", description: "Hex color, e.g. '#666666'." },
  },
  required: ["text"],
};

const FOOTER_OBJ = {
  type: "object",
  description: "Page footer: { text, alignment?, color? }. Use {current}/{total} placeholders for page numbers.",
  properties: {
    text: { type: "string", description: "Footer text. {current} and {total} are replaced with page numbers." },
    alignment: { type: "string", enum: ["left", "center", "right"] },
    color: { type: "string", description: "Hex color, e.g. '#666666'." },
  },
  required: ["text"],
};

const MARGINS_OBJ = {
  type: "object",
  description: "Page margins in twips (1440 = 1 inch). Defaults: top/bottom 720 (or 1440 if header/footer set), left/right 1080.",
  properties: {
    top: { type: "number" },
    bottom: { type: "number" },
    left: { type: "number" },
    right: { type: "number" },
  },
};

const CLIENT_HINT = {
  type: "string",
  enum: ["agent", "interactive", "auto"],
  description: "How the response should be shaped. 'interactive' = polished one-line message for end-users (no chatty registry/lineage notes). 'agent' = verbose response with all metadata for AI consumption. 'auto' (default) = detect from input shape or MCP_CLIENT_TYPE env var, falling back to 'agent'.",
};

// ---------------------------------------------------------------------------
// UPLOAD shared schema fragments. PURELY OPTIONAL — when both uploadUrl and
// uploadAuthHeader are absent, the create handlers behave exactly as before
// (write locally, return path). When BOTH are set, after writing the file
// locally the handler additionally POSTs a JSON envelope
//   { data:base64, filename, mimeType, size }
// to uploadUrl with `Authorization: <uploadAuthHeader>`.
//
// This is the GENERIC upload contract — it works with any HTTPS endpoint
// that implements the receiver side (Forge web trigger, Cloudflare Worker,
// AWS Lambda, Express server, etc.). CogniRunner's attachment-upload web
// trigger is the reference implementation; see the README for details.
//
// Security: HTTPS only, no redirects, no auto-retry on 4xx/5xx, auth header
// never logged. Size cap via WRITE_DOC_MAX_BYTES env (default 25 MB).
// ---------------------------------------------------------------------------
const UPLOAD_URL_FIELD = {
  type: "string",
  description: "OPTIONAL. HTTPS URL of a receiver that will accept a JSON envelope `{data:base64, filename, mimeType, size}` POSTed with this Bearer auth. If you have NOT been given an uploadUrl in your context, OMIT this field and the tool just writes the file locally. Single-use semantics — do not retry on 4xx. Works with any compliant receiver (CogniRunner attachment-upload web trigger is the reference implementation, but the contract is generic).",
};
const UPLOAD_AUTH_HEADER_FIELD = {
  type: "string",
  description: "OPTIONAL. Authorization header value for uploadUrl (e.g. 'Bearer abc123'). REQUIRED when uploadUrl is set; ignored otherwise. Never logged.",
};
const UPLOAD_FILENAME_FIELD = {
  type: "string",
  description: "OPTIONAL. Filename to put in the upload envelope. Defaults to the local file's basename. Useful when the local file got auto-suffixed (e.g. duplicate prevention) and you want a clean name on the receiver side.",
};

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "read-doc",
      description:
        "Read and analyze PDF, DOCX, or Excel files. Modes: 'summary' (overview with preview), 'indepth' (full text, structure, metadata), 'focused' (query-based search). Source: either local filePath OR a remote https url whose response is {data:base64, filename, mimeType, size} JSON guarded by authHeader (used for one-shot capabilities like CogniRunner attachment fetches). Always read before editing; use 'indepth' before edit-doc.",
      inputSchema: {
        type: "object",
        properties: {
          filePath: { type: "string", description: "Local file path. Use this OR url+authHeader." },
          url: { type: "string", description: "HTTPS URL whose response is {data:base64, filename, mimeType, size} JSON. Use this OR filePath." },
          authHeader: { type: "string", description: "Authorization header value (e.g. 'Bearer abc123'). Required when url is set." },
          filename: { type: "string", description: "Optional filename hint used for the temp-file extension when the response omits one." },
          mode: { type: "string", enum: ["summary", "indepth", "focused"], description: "Read mode (default: summary)" },
          userQuery: { type: "string", description: "Query for focused analysis. Only used with mode 'focused'." },
          context: { type: "string", description: "Context from previous questions. Only used with mode 'focused'." },
        },
        // NOTE: Anthropic API rejects top-level anyOf/oneOf/allOf in MCP tool schemas.
        // We rely on the runtime check in handleReadDoc that enforces filePath OR url+authHeader.
        required: [],
      },
    },
    {
      name: "detect-format",
      description:
        "Recommend the right document format (markdown / docx / excel) and tone before creating. Call this FIRST when the user didn't specify a format. Returns { format, docType, confidence, reason, matchedKeywords, suggestedTool } — pass `format` to the corresponding create-* tool. Technical/code/API → markdown; stakeholder/business/legal → docx; numeric/budget/data → excel.",
      inputSchema: {
        type: "object",
        properties: {
          userQuery: { type: "string", description: "The user's original request, verbatim if possible." },
          title: { type: "string", description: "Document title if already chosen." },
          content: { type: "string", description: "Content preview if available — the more context, the better the routing." },
        },
        required: ["userQuery"],
      },
    },
    {
      name: "create-doc",
      description:
        "Create a Word DOCX. Use for stakeholder/business/legal/research documents — NOT for code-heavy technical docs (use create-markdown) or pure tabular data (use create-excel). Title MUST be specific (rejects 'Document', 'Untitled', etc.). On duplicate detection returns { duplicate: true, existingPath } — switch to edit-doc. Document DNA auto-applies project-wide header/footer/style defaults. Use dryRun: true for preview.",
      inputSchema: {
        type: "object",
        properties: {
          title: { type: "string", description: "Specific descriptive title (rejected: 'Document', 'Untitled', etc.)." },
          paragraphs: { type: "array", items: PARA_ITEM, description: "Document body. Each entry is a markdown string OR { text, headingLevel: 'heading1'|'heading2'|'heading3' }. Inline markdown (**bold**, *italic*, `code`) renders correctly." },
          tables: { type: "array", items: { type: "array", items: { type: "array", items: { type: "string" } } }, description: "Optional tables as 2D arrays. First row is the header." },
          outputPath: { type: "string", description: "Optional. Default: derived from title, placed under docs/<category>/." },
          stylePreset: STYLE_PRESET,
          category: CATEGORY,
          tags: TAGS,
          description: { type: "string", description: "Brief description stored in the registry." },
          dryRun: { type: "boolean", description: "Return a preview without writing the file (default: false)." },
          docType: DOC_TYPE,
          header: HEADER_OBJ,
          footer: FOOTER_OBJ,
          margins: MARGINS_OBJ,
          backgroundColor: { type: "string", description: "Optional page background hex color, e.g. '#FFFFFF'." },
          blueprint: { type: "string", description: "Optional blueprint name to validate the structure against (see list-templates)." },
          enforceDocsFolder: { type: "boolean", description: "If false, allow output outside docs/. Default: true (recommended)." },
          preventDuplicates: { type: "boolean", description: "If false, allow same-title duplicates. Default: true (recommended)." },
          tableHeaderFill: { type: "string", description: "Optional override for table header cell fill color (hex)." },
          style: { type: "object", description: "Advanced: fine-grained style overrides merged on top of stylePreset.", additionalProperties: true },
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
        "Create a Markdown (.md) file. Use for implementation/technical docs, READMEs, integration guides, code-heavy content. Each `paragraphs` entry is a markdown string OR { text, headingLevel } object. The title becomes the H1; explicit headingLevel becomes H2/H3. Fenced code blocks (```lang ... ```), bullet/task lists, and inline code are passed through. Title MUST be specific. Use dryRun: true for preview.",
      inputSchema: {
        type: "object",
        properties: {
          title: { type: "string", description: "Specific descriptive title (becomes H1; rejected if generic)." },
          paragraphs: { type: "array", items: PARA_ITEM, description: "Body content. Markdown strings or { text, headingLevel } objects." },
          outputPath: { type: "string", description: "Optional. Default: derived from title, placed under docs/<category>/." },
          category: CATEGORY,
          tags: TAGS,
          description: { type: "string", description: "Brief description stored in the registry." },
          dryRun: { type: "boolean", description: "Return a preview without writing (default: false)." },
          docType: DOC_TYPE,
          enforceDocsFolder: { type: "boolean", description: "If false, allow output outside docs/. Default: true." },
          preventDuplicates: { type: "boolean", description: "If false, allow same-title duplicates. Default: true." },
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
        "Create an Excel XLSX workbook. Use for tabular/numeric/financial data, trackers, KPI dashboards. Sheet names MUST be specific (rejects 'Sheet1', 'Data', etc.). First row of each sheet's `data` is treated as the header. Workbook is auto-categorized when `title` is provided. Use dryRun: true for preview.",
      inputSchema: {
        type: "object",
        properties: {
          title: { type: "string", description: "Workbook title (used for filename, registry, and auto-categorization)." },
          sheets: {
            type: "array",
            items: { type: "object", properties: { name: { type: "string", description: "Specific sheet name." }, data: { type: "array", items: { type: "array" }, description: "2D array. First row is the header." } }, required: ["name", "data"] },
            description: "Array of sheet definitions. At least one is required.",
          },
          stylePreset: STYLE_PRESET,
          style: {
            type: "object",
            description: "Optional fine-grained overrides merged on top of stylePreset.",
            properties: {
              font: { type: "object", description: "{ family, size, color, bold }" },
              columnWidths: { type: "object", description: "{ <columnIndex>: width-in-characters }" },
              rowHeights: { type: "object", description: "{ <rowIndex>: height-in-points }" },
              headerBold: { type: "boolean" },
              zebraColor: { type: "string", description: "Hex color for zebra-striped rows." },
            },
          },
          outputPath: { type: "string", description: "Optional. Default: derived from title." },
          enforceDocsFolder: { type: "boolean", description: "If false, allow output outside docs/. Default: true." },
          preventDuplicates: { type: "boolean", description: "If false, allow same-name duplicates. Default: true." },
          dryRun: { type: "boolean", description: "Return a preview without writing (default: false)." },
          category: CATEGORY,
          tags: TAGS,
          description: { type: "string", description: "Brief description stored in the registry." },
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
      name: "edit-doc",
      description:
        "Edit an existing DOCX. Actions: 'append' (XML-patches new content, PRESERVES original formatting/headers/footers/images), 'replace' (overwrites body but keeps section properties), 'style' (apply a stylePreset to existing paragraphs without changing text), 'preview' (show what would change). Always read-doc with mode 'indepth' first so you understand the existing structure.",
      inputSchema: {
        type: "object",
        properties: {
          filePath: { type: "string", description: "Absolute or project-relative path to the existing DOCX file." },
          action: { type: "string", enum: ["append", "replace", "style", "preview"], description: "Edit action." },
          title: { type: "string", description: "Optional new title (used by 'replace')." },
          paragraphs: { type: "array", items: PARA_ITEM, description: "Paragraphs to append or replace with." },
          tables: { type: "array", items: { type: "array", items: { type: "array", items: { type: "string" } } }, description: "Tables as 2D arrays." },
          stylePreset: STYLE_PRESET,
          category: { type: "string", description: "Document category for the registry update." },
          tags: TAGS,
          docType: DOC_TYPE,
          style: { type: "object", description: "Advanced fine-grained style overrides.", additionalProperties: true },
          addSeparator: { type: "boolean", description: "If true (default for 'append'), insert a blank paragraph before the new content as a visual separator." },
          useLegacy: { type: "boolean", description: "DANGER: when true, recreates the document via mammoth which DESTROYS all original formatting (fonts, colors, images, headers, footers). Only set this if XML patching fails. Default: false." },
        },
        required: ["filePath", "action"],
      },
    },
    {
      name: "edit-excel",
      description:
        "Edit an existing XLSX workbook. Actions: 'append-rows' (add rows to a sheet, preserves existing styles), 'append-sheet' (add a new sheet — fails if name exists), 'replace-sheet' (overwrite a sheet's data), 'preview' (show what would change). Use read-doc first if you don't know the sheet structure.",
      inputSchema: {
        type: "object",
        properties: {
          filePath: { type: "string", description: "Absolute or project-relative path to the existing XLSX file." },
          action: { type: "string", enum: ["append-rows", "append-sheet", "replace-sheet", "preview"], description: "Edit action." },
          sheetName: { type: "string", description: "Target sheet name (required for append-rows and replace-sheet)." },
          rows: { type: "array", items: { type: "array" }, description: "Rows to append (required for append-rows)." },
          sheetData: {
            type: "object",
            properties: {
              name: { type: "string", description: "Sheet name (required for append-sheet)." },
              data: { type: "array", items: { type: "array" }, description: "2D array of cells. First row is the header." },
            },
            required: ["name", "data"],
            description: "Sheet definition (required for append-sheet and replace-sheet).",
          },
          style: { type: "object", description: "Optional style overrides (zebraColor, etc.).", additionalProperties: true },
          stylePreset: STYLE_PRESET,
          category: { type: "string", description: "Document category for registry update." },
          tags: TAGS,
          docType: DOC_TYPE,
        },
        required: ["filePath", "action"],
      },
    },
    {
      name: "list-documents",
      description:
        "Search the document registry. Filters compose with AND-logic: category match AND tag match AND title-substring match. Returns an array of registry entries with { id, title, filePath, category, tags, description, createdAt, updatedAt }. Use this before create-doc to check if a similar document exists.",
      inputSchema: {
        type: "object",
        properties: {
          category: { type: "string", description: "Filter by exact category match." },
          tags: { type: "array", items: { type: "string" }, description: "Filter by tags (matches if ANY tag overlaps)." },
          title: { type: "string", description: "Substring match on title (case-insensitive)." },
        },
      },
    },
    {
      name: "list-templates",
      description:
        "List available document templates AND blueprints. Templates are static, named structures (e.g. 'claude-like', 'technical-docs', 'business-report') you can reference via tags on create-doc. Blueprints are auto-learned structures stored in .document-blueprints.json. Use the returned `name` as `blueprint:` in create-doc, or as a tag for create-doc tag-based style detection.",
      inputSchema: {
        type: "object",
        properties: {
          category: { type: "string", description: "Optional category filter (matches blueprints' learnedFrom category and templates' recommendedFor)." },
        },
      },
    },
    {
      name: "dna",
      description:
        "Manage the project's Document DNA — header/footer/style defaults that auto-apply to every create-doc call. Actions: 'init' (one-time setup with companyName/header/footer/stylePreset), 'get' (current config + project profile), 'evolve' (analyze usage trends; with apply:true, MUTATES dna config and may auto-create blueprints — irreversible without manual cleanup), 'save-memory'/'delete-memory' (project-wide preferences keyed by string).",
      inputSchema: {
        type: "object",
        properties: {
          action: { type: "string", enum: ["init", "get", "evolve", "save-memory", "delete-memory"], description: "DNA action." },
          companyName: { type: "string", description: "Company name (init only) — used as default header text." },
          stylePreset: STYLE_PRESET,
          headerText: { type: "string", description: "Default header text (init only)." },
          headerAlignment: { type: "string", enum: ["left", "center", "right"], description: "Default header alignment (init only)." },
          footerText: { type: "string", description: "Default footer text (init only). Use {current}/{total} for page numbers." },
          footerAlignment: { type: "string", enum: ["left", "center", "right"], description: "Default footer alignment (init only)." },
          apply: { type: "boolean", description: "evolve only: when true, AUTO-MUTATES the dna config based on top suggestion. Off by default — review suggestions first." },
          threshold: { type: "number", description: "evolve only: minimum documents before suggesting a mutation (default 5)." },
          memory: { type: "string", description: "save-memory only: a short preference statement (e.g. 'Always use 1-inch margins for contracts')." },
          key: { type: "string", description: "Memory key (save-memory: optional, auto-generated; delete-memory: required)." },
        },
        required: ["action"],
      },
    },
    {
      name: "blueprint",
      description:
        "Manage structural blueprints — section/heading templates extracted from real documents. Actions: 'learn' (extract from a DOCX or PDF you already have), 'list' (show stored blueprints), 'delete' (remove by name). Blueprints are also auto-learned during 'dna evolve' when recurring structures are detected. Use a blueprint by passing { blueprint: '<name>' } to create-doc — the tool will validate that your paragraphs match the structure.",
      inputSchema: {
        type: "object",
        properties: {
          action: { type: "string", enum: ["learn", "list", "delete"], description: "Blueprint action." },
          filePath: { type: "string", description: "Path to source DOCX/PDF (REQUIRED for 'learn'; ignored otherwise)." },
          name: { type: "string", description: "Blueprint name (required for learn and delete)." },
          description: { type: "string", description: "Optional description (learn only)." },
        },
        required: ["action"],
      },
    },
    {
      name: "drift-monitor",
      description:
        "Monitor documents for structural drift over time. Actions: 'watch' (compute and store a fingerprint = SHA-256 + heading tree + word counts; capped at 500 paragraphs), 'check' (compare current state against the stored baseline; reports word-count delta, added/removed headings, category shifts, and a similarity score). Omit filePath on 'check' to compare all watched documents.",
      inputSchema: {
        type: "object",
        properties: {
          action: { type: "string", enum: ["watch", "check"], description: "Drift action." },
          filePath: { type: "string", description: "Document path (REQUIRED for 'watch'; optional for 'check' — omit to check all watched docs)." },
          name: { type: "string", description: "Friendly display name for the watched document (watch only)." },
        },
        required: ["action"],
      },
    },
    {
      name: "get-lineage",
      description:
        "Trace the provenance chain of a document. Returns a tree { sources: [{filePath, ...}], derivatives: [{filePath, ...}] } showing which read documents informed this document (sources, traced upstream) and which created documents derived from it (derivatives, traced downstream). Lineage is recorded automatically when read-doc and create-doc are called within the same session.",
      inputSchema: {
        type: "object",
        properties: {
          filePath: { type: "string", description: "Document path to trace lineage for." },
          depth: { type: "number", description: "Traversal depth in either direction (default: 3)." },
        },
        required: ["filePath"],
      },
    },
  ],
}));

/**
 * Handler for calling tools.
 */
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: params } = request.params;

  log("info", "Tool called:", { toolName: name });

  try {
    // Validate file path exists for read/edit tools (not create tools).
    // Skip when params.url is set: read-doc URL-fetch path materializes a temp file later.
    if (params?.filePath && !params?.url && !name.startsWith("create-")) {
      const skipValidation =
        (name === "drift-monitor" && params.action === "check") ||
        (name === "blueprint" && params.action !== "learn") ||
        name === "check-drift";

      if (!skipValidation) {
        const resolved = path.resolve(params.filePath);
        if (!fs.existsSync(resolved)) {
          return { content: [{ type: "text", text: `Error: File not found: ${params.filePath}` }], isError: true };
        }
        params.filePath = resolved;
      }
    }

    switch (name) {
      case "read-doc":
        return await handleReadDoc(params);

      // Backward-compatible aliases for read tools
      case "get-doc-summary": return await handleReadDoc({ ...params, mode: "summary" });
      case "get-doc-indepth": return await handleReadDoc({ ...params, mode: "indepth" });
      case "get-doc-focused": return await handleReadDoc({ ...params, mode: "focused" });

      case "detect-format": {
        const result = await detectFormat(params);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }

      case "create-doc": {
        const r = await createDoc(params);
        return { content: [{ type: "text", text: JSON.stringify(r, null, 2) }], isError: !r.success };
      }

      case "create-markdown": {
        const r = await createMarkdown(params);
        return { content: [{ type: "text", text: JSON.stringify(r, null, 2) }], isError: !r.success };
      }

      case "create-excel": {
        const r = await createExcel(params);
        return { content: [{ type: "text", text: JSON.stringify(r, null, 2) }], isError: !r.success };
      }

      case "edit-doc": {
        const r = await editDoc(params);
        return { content: [{ type: "text", text: JSON.stringify(r, null, 2) }], isError: !r.success };
      }

      case "edit-excel": {
        const r = await editExcel(params);
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

      // DNA (consolidated + backward compat)
      case "dna":
      case "init-dna":
      case "get-dna":
      case "evolve-dna":
        return await handleDNA(params, name);

      // Blueprint (consolidated + backward compat)
      case "blueprint":
      case "learn-blueprint":
      case "list-blueprints":
        return await handleBlueprint(params, name);

      // Drift (consolidated + backward compat)
      case "drift-monitor":
      case "watch-document":
      case "check-drift":
        return await handleDriftMonitor(params, name);

      case "get-lineage":
        return await handleGetLineage(params);

      default: {
        log("error", "Unknown tool:", { toolName: name });
        return { content: [{ type: "text", text: `Unknown tool: ${name}` }], isError: true };
      }
    }
  } catch (error) {
    log("error", "Tool error:", { toolName: name, error: error.message });
    return { content: [{ type: "text", text: `Error: ${error.message}` }], isError: true };
  }
});

/**
 * Start the server using stdio transport.
 */
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  log("info", "MCP Document Processor running on stdio");
}

main().catch((error) => {
  log("fatal", "Server startup failed:", { error: error.message });
  process.exit(1);
});
