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
import { visionService } from "./services/vision-factory.js";

// Import tool handlers
import { handleReadDoc } from "./tools/read-doc-tool.js";
import { createDoc } from "./tools/create-doc.js";
import { createExcel } from "./tools/create-excel.js";
import { createMarkdown } from "./tools/create-markdown.js";
import { editDoc } from "./tools/edit-doc.js";
import { editExcel } from "./tools/edit-excel.js";

// Import registry query tools
import { listDocuments } from "./tools/utils.js";

// Import extracted tool handlers
import { handleDNA } from "./tools/dna-tool.js";
import { handleBlueprint } from "./tools/blueprint-tool.js";
import { handleDriftMonitor } from "./tools/drift-tool.js";
import { handleGetLineage } from "./tools/lineage-tool.js";

// Tool description section markers (shared constants)
const TOOL_DESCRIPTION_SECTIONS = {
  ROLE: "[ROLE]",
  CONTEXT: "[CONTEXT]",
  TASK: "[TASK]",
  CONSTRAINTS: "[CONSTRAINTS]",
  FORMAT: "[FORMAT]",
};

// Initialize logging
setupLogging();

// Create MCP server
const server = new Server(
  {
    name: "mcp-doc-processor",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  },
);

/**
 * Handler for listing available tools.
 */
server.setRequestHandler(ListToolsRequestSchema, async () => {
  // Shared schema fragments
  const STYLE_PRESET_SCHEMA = {
    type: "string",
    enum: ["minimal", "professional", "technical", "legal", "business", "casual", "colorful"],
    description: "Style preset. If omitted with a category, auto-selected: contracts→legal, technical→technical, business→business, meeting→professional, research→professional.",
  };
  const CATEGORY_SCHEMA = {
    type: "string",
    enum: ["contracts", "technical", "business", "legal", "meeting", "research"],
    description: "Document category for subfolder organization (docs/{category}/).",
  };
  const TAGS_SCHEMA = {
    type: "array",
    items: { type: "string" },
    description: "Tags for registry search and discovery.",
  };
  const PARAGRAPH_ITEMS_SCHEMA = {
    oneOf: [
      { type: "string", description: "Simple paragraph text" },
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

  return {
    tools: [
      // === DOCUMENT READING (1 unified tool) ===
      {
        name: "read-doc",
        description:
          `${TOOL_DESCRIPTION_SECTIONS.ROLE} You are a document analysis expert specializing in extracting and analyzing content from various file formats.\n\n` +
          `${TOOL_DESCRIPTION_SECTIONS.CONTEXT} User needs to understand the content, structure, and metadata of existing documents before editing or referencing them.\n\n` +
          `${TOOL_DESCRIPTION_SECTIONS.TASK} Read and analyze a document using the appropriate mode:\n` +
          "  - 'summary': High-level overview with content preview (default)\n" +
          "  - 'indepth': Full text, structure, formatting, and metadata extraction\n" +
          "  - 'focused': Query-based analysis finding relevant sections\n\n" +
          `${TOOL_DESCRIPTION_SECTIONS.CONSTRAINTS}\n` +
          "  - ALWAYS read existing documents BEFORE creating or editing them\n" +
          "  - Use 'indepth' mode before editing to understand current formatting\n" +
          "  - Provide context from previous responses when using 'focused' mode\n\n" +
          `${TOOL_DESCRIPTION_SECTIONS.FORMAT} Returns structured analysis with content, metadata, and formatting information. Includes category classification with confidence level (high/medium/low) when auto-classifying documents. When auto-classifying, the response includes: category, path, confidence ('high'/'medium'/'low'), and scores for all categories.`,
        inputSchema: {
          type: "object",
          properties: {
            filePath: { type: "string", description: "Local file path to the document" },
            mode: { type: "string", enum: ["summary", "indepth", "focused"], description: "Read mode (default: 'summary'). Use 'indepth' before editing a document." },
            userQuery: { type: "string", description: "User's query for focused analysis (e.g., 'tell me about liability clauses'). Only used with mode 'focused'." },
            context: { type: "string", description: "Additional context from previous questions/responses. Only used with mode 'focused'." },
          },
          required: ["filePath"],
        },
      },
      // === DOCUMENT CREATION/EDITING (6) ===
      {
        name: "detect-format",
        description:
          `${TOOL_DESCRIPTION_SECTIONS.ROLE} You are a document format recommendation engine.\n\n` +
          `${TOOL_DESCRIPTION_SECTIONS.CONTEXT} User is asking about creating documentation but hasn't specified the format. You need to analyze their intent and recommend the appropriate tool (create-markdown, create-doc, or create-excel).\n\n` +
          `${TOOL_DESCRIPTION_SECTIONS.TASK} Analyze the user's query for keywords indicating document type:\n` +
          "  - Implementation/Technical keywords → recommend 'markdown' format (use create-markdown)\n" +
          "  - High-level/Stakeholder keywords → recommend 'docx' format (use create-doc)\n" +
          "  - Data/Spreadsheet keywords → recommend 'excel' format (use create-excel)\n\n" +
          `${TOOL_DESCRIPTION_SECTIONS.CONSTRAINTS}\n` +
          "  - ALWAYS call this tool BEFORE creating a document if the user hasn't explicitly specified a format\n" +
          "  - Use the recommended format in your subsequent create-* tool call\n" +
          "  - If user explicitly says 'docx', 'markdown', or 'excel', you can skip this step\n\n" +
          `${TOOL_DESCRIPTION_SECTIONS.FORMAT} Returns {format, confidence, reason, matchedKeywords, suggestedTool}.`,
        inputSchema: {
          type: "object",
          properties: {
            userQuery: { type: "string", description: "The user's original request or prompt" },
            title: { type: "string", description: "Document title if known (optional)" },
            content: { type: "string", description: "Content preview if available (optional)" },
          },
          required: ["userQuery"],
        },
      },
      {
        name: "edit-doc",
        description:
          `${TOOL_DESCRIPTION_SECTIONS.ROLE} You are a professional document creation expert, specializing in creating well-structured DOCX files with professional formatting.\n\n` +
          `${TOOL_DESCRIPTION_SECTIONS.CONTEXT} User wants to create a Word document for high-level documentation, stakeholder reports, email attachments, Confluence uploads, or formal business documents. For technical implementation docs, use create-markdown instead.\n\n` +
          `${TOOL_DESCRIPTION_SECTIONS.TASK} Create a Word DOCX document with the following requirements:\n` +
          "  1. Provide a specific, descriptive title (e.g., 'Q1 2026 Budget Report', not 'Document')\n" +
          "  2. Use paragraph objects with headingLevel for document hierarchy\n" +
          "  3. Apply style preset or let auto-selection based on category\n" +
          "  4. Configure header/footer if needed (or use Document DNA defaults)\n\n" +
          `${TOOL_DESCRIPTION_SECTIONS.CONSTRAINTS}\n` +
          "  - Title MUST be specific and descriptive — generic titles are rejected\n" +
          "  - Do NOT include markdown syntax in paragraph text — use headingLevel, bold, etc.\n" +
          "  - USER CONFIRMATION REQUIRED: describe what you plan to create and get approval first\n" +
          "  - Use dryRun: true for previews before actual creation\n" +
          "  - Check blueprintMatch in response for structural template suggestions\n" +
          "  - Document DNA automatically applies headers/footers/style if .document-dna.json exists\n\n" +
          `${TOOL_DESCRIPTION_SECTIONS.FORMAT} Returns JSON with filePath, success status, and confirmation message.`,
        inputSchema: {
          type: "object",
          properties: {
            title: { type: "string", description: "Document title (appears as Heading 1). MUST be specific and descriptive — generic titles like 'Document' or 'Untitled' are rejected." },
            paragraphs: { type: "array", items: PARAGRAPH_ITEMS_SCHEMA, description: "Array of paragraphs (strings or objects with headingLevel/formatting)." },
            tables: { type: "array", items: { type: "array", items: { type: "array", items: { type: "string" } } }, description: "Array of tables (each is a 2D array)" },
            stylePreset: STYLE_PRESET_SCHEMA,
            header: { type: "object", properties: { text: { type: "string" }, alignment: { type: "string", enum: ["left", "center", "right"] } } },
            footer: { type: "object", description: "Use {current} for page number, {total} for total pages.", properties: { text: { type: "string" }, alignment: { type: "string", enum: ["left", "center", "right"] } } },
            backgroundColor: { type: "string", description: "Page background color as hex (e.g., 'FFFFFF')" },
            style: {
              type: "object", description: "Custom styling (overrides stylePreset)",
              properties: {
                font: { type: "object", properties: { size: { type: "number" }, color: { type: "string" }, bold: { type: "boolean" }, italics: { type: "boolean" }, underline: { type: "boolean" }, fontFamily: { type: "string" } } },
                paragraph: { type: "object", properties: { alignment: { type: "string", enum: ["left", "right", "center", "both"] }, spacingBefore: { type: "number" }, spacingAfter: { type: "number" }, lineSpacing: { type: "number" } } },
                table: { type: "object", properties: { borderColor: { type: "string" }, borderStyle: { type: "string", enum: ["single", "double", "dotted", "dashed"] }, borderWidth: { type: "number" } } },
              },
            },
            outputPath: { type: "string", description: "File path for the DOCX output." },
            enforceDocsFolder: { type: "boolean", description: "Enforce docs/ folder (default: true)." },
            preventDuplicates: { type: "boolean", description: "Append _1, _2 if file exists (default: true)." },
            dryRun: { type: "boolean", description: "Preview without writing to disk (default: false)." },
            category: CATEGORY_SCHEMA,
            tags: TAGS_SCHEMA,
            description: { type: "string", description: "Brief description for registry search." },
            blueprint: { type: "string", description: "Blueprint name to enforce structural consistency." },
          },
          required: ["title"],
        },
      },
      {
        name: "create-markdown",
        description:
          `${TOOL_DESCRIPTION_SECTIONS.ROLE} You are a technical documentation expert specializing in creating lean, practical markdown files optimized for AI model consumption during implementation.\n\n` +
          `${TOOL_DESCRIPTION_SECTIONS.CONTEXT} User wants to create implementation-focused documentation that will be used by developers or AI models to build something. The document should be copy-paste friendly with code blocks, clear headings, and bullet lists (avoid tables).\n\n` +
          `${TOOL_DESCRIPTION_SECTIONS.TASK} Create a markdown (.md) file with the following requirements:\n` +
          "  1. Provide a specific, descriptive title (becomes H1 heading)\n" +
          "  2. Use paragraph objects with headingLevel for document hierarchy\n" +
          "  3. Include code blocks with language hints for any commands, config, or code snippets\n" +
          "  4. Use bullet lists instead of tables for structured data (easier to copy)\n" +
          "  5. Apply task list format (- [ ]) for actionable items\n" +
          "  6. Configure category if known (technical, research, etc.)\n\n" +
          `${TOOL_DESCRIPTION_SECTIONS.CONSTRAINTS}\n` +
          "  - Title MUST be specific and descriptive — generic titles are rejected\n" +
          "  - DO NOT use tables — prefer bullet lists for copy-paste friendliness\n" +
          "  - ALWAYS include language hints in code blocks (```javascript not just ```)\n" +
          "  - Use inline code (`text`) for file paths, commands, and technical terms\n" +
          "  - Keep formatting lean — this is for implementation, not presentation\n" +
          "  - No user confirmation required (unlike create-doc/create-excel)\n\n" +
          `${TOOL_DESCRIPTION_SECTIONS.FORMAT} Returns JSON with filePath, success status, and message. File is written directly to disk without confirmation prompt.`,
        inputSchema: {
          type: "object",
          properties: {
            title: { type: "string", description: "Document title (becomes H1). MUST be specific and descriptive." },
            paragraphs: { 
              type: "array", 
              items: PARAGRAPH_ITEMS_SCHEMA,
              description: "Array of paragraphs with markdown-specific formatting options."
            },
            outputPath: { type: "string", description: "File path for the MD output (default: derived from title)." },
            category: CATEGORY_SCHEMA,
            tags: TAGS_SCHEMA,
            description: { type: "string", description: "Brief description for registry search." },
            dryRun: { type: "boolean", description: "Preview without writing to disk (default: false)." },
          },
          required: ["title"],
        },
      },
      {
        name: "create-excel",
        description:
          `${TOOL_DESCRIPTION_SECTIONS.ROLE} You are a professional Excel workbook creation expert, specializing in creating well-structured XLSX files with professional formatting.\n\n` +
          `${TOOL_DESCRIPTION_SECTIONS.CONTEXT} User wants to create an Excel workbook for data-heavy documents like budgets, financial reports, spreadsheets with numbers and calculations.\n\n` +
          `${TOOL_DESCRIPTION_SECTIONS.TASK} Create an Excel XLSX workbook with the following requirements:\n` +
          "  1. Provide a descriptive 'title' for the workbook (e.g., 'Q1 2026 Budget Breakdown')\n" +
          "  2. Use descriptive sheet names (e.g., 'Monthly Revenue', not 'Sheet1')\n" +
          "  3. Apply style preset or let auto-selection based on category\n" +
          "  4. Configure custom styling for fonts, columns, and rows\n\n" +
          `${TOOL_DESCRIPTION_SECTIONS.CONSTRAINTS}\n` +
          "  - Title MUST be descriptive — generic titles like 'Workbook' or 'Data' are rejected\n" +
          "  - Sheet names MUST be descriptive — generic names like 'Sheet1', 'Sheet2' are rejected\n" +
          "  - Do NOT include markdown syntax in cell values — use plain text or numbers\n" +
          "  - USER CONFIRMATION REQUIRED: describe what you plan to create and get approval first\n" +
          "  - Use dryRun: true for previews before actual creation\n\n" +
          `${TOOL_DESCRIPTION_SECTIONS.FORMAT} Returns JSON with filePath, success status, and confirmation message.`,
        inputSchema: {
          type: "object",
          properties: {
            title: { type: "string", description: "Workbook title for filename and registry. Must be descriptive (e.g., 'Q1 2026 Budget Breakdown')." },
            sheets: {
              type: "array",
              items: { type: "object", properties: { name: { type: "string", description: "Descriptive sheet name (e.g., 'Monthly Revenue', not 'Sheet1')" }, data: { type: "array", items: { type: "array" } } }, required: ["name", "data"] },
              description: "Array of sheet definitions with plain data values.",
            },
            stylePreset: STYLE_PRESET_SCHEMA,
            style: {
              type: "object", description: "Custom styling (overrides stylePreset)",
              properties: {
                font: { type: "object", properties: { size: { type: "number" }, color: { type: "string" }, bold: { type: "boolean" }, italics: { type: "boolean" }, underline: { type: "boolean" } } },
                columnWidths: { type: "object", patternProperties: { "\\d+": { type: "number" } } },
                rowHeights: { type: "object", patternProperties: { "\\d+": { type: "number" } } },
                headerBold: { type: "boolean" },
              },
            },
            outputPath: { type: "string", description: "File path for the XLSX output." },
            enforceDocsFolder: { type: "boolean", description: "Enforce docs/ folder (default: true)." },
            preventDuplicates: { type: "boolean", description: "Append _1, _2 if file exists (default: true)." },
            dryRun: { type: "boolean", description: "Preview without writing to disk (default: false)." },
            category: CATEGORY_SCHEMA,
            tags: TAGS_SCHEMA,
            description: { type: "string", description: "Brief description for registry search." },
          },
          required: ["sheets"],
        },
      },
      {
        name: "edit-doc",
        description:
          "Edits an existing Word DOCX document by appending or replacing content. USER CONFIRMATION REQUIRED. " +
          "ALWAYS read the document first with read-doc mode 'indepth' before editing. " +
          "Do NOT include markdown syntax — use headingLevel/bold for formatting. Append mode preserves existing formatting via XML patching.",
        inputSchema: {
          type: "object",
          properties: {
            filePath: { type: "string", description: "Path to the existing DOCX file" },
            action: { type: "string", enum: ["append", "replace"], description: "'append' adds after existing content, 'replace' overwrites all content" },
            paragraphs: { type: "array", items: PARAGRAPH_ITEMS_SCHEMA, description: "Paragraphs to append or replace with." },
            tables: { type: "array", items: { type: "array", items: { type: "array", items: { type: "string" } } }, description: "Tables to append or replace with (2D arrays)" },
            title: { type: "string", description: "New title (replace mode only)" },
            stylePreset: STYLE_PRESET_SCHEMA,
            category: { type: "string", description: "Document category for registry" },
            tags: TAGS_SCHEMA,
          },
          required: ["filePath", "action"],
        },
      },
      {
        name: "edit-excel",
        description:
          "Edits an existing Excel XLSX workbook. USER CONFIRMATION REQUIRED. ALWAYS read the spreadsheet first with read-doc mode 'indepth'. " +
          "Actions: 'append-rows' adds rows, 'append-sheet' adds a sheet, 'replace-sheet' replaces a sheet's data.",
        inputSchema: {
          type: "object",
          properties: {
            filePath: { type: "string", description: "Path to the existing XLSX file" },
            action: { type: "string", enum: ["append-rows", "append-sheet", "replace-sheet"], description: "Edit action type" },
            sheetName: { type: "string", description: "Target sheet name (for append-rows and replace-sheet)" },
            rows: { type: "array", items: { type: "array" }, description: "Rows to append (for append-rows)" },
            sheetData: { type: "object", properties: { name: { type: "string" }, data: { type: "array", items: { type: "array" } } }, required: ["data"], description: "Sheet definition (for append-sheet or replace-sheet)" },
            stylePreset: STYLE_PRESET_SCHEMA,
            category: { type: "string", description: "Document category for registry" },
            tags: TAGS_SCHEMA,
          },
          required: ["filePath", "action"],
        },
      },
      // === CONSOLIDATED MANAGEMENT TOOLS (5) ===
      {
        name: "list-templates",
        description:
          `${TOOL_DESCRIPTION_SECTIONS.ROLE} You are a template library manager.\n\n` +
          `${TOOL_DESCRIPTION_SECTIONS.CONTEXT} User needs to browse available document templates and blueprints for consistent document creation.\n\n` +
          `${TOOL_DESCRIPTION_SECTIONS.TASK} List all available document templates and blueprints. Returns template names, descriptions, and usage statistics.\n\n` +
          `${TOOL_DESCRIPTION_SECTIONS.CONSTRAINTS}\n` +
          "  - Use this tool to discover available templates before creating new documents\n" +
          "  - Templates help ensure consistency and reduce formatting effort\n\n" +
          `${TOOL_DESCRIPTION_SECTIONS.FORMAT} Returns JSON array of templates with name, description, and usage count.`,
        inputSchema: {
          type: "object",
          properties: {
            category: { type: "string", description: "Filter by category (contracts, technical, business, legal, meeting, research)" },
          },
        },
      },
      {
        name: "list-documents",
        description:
          "List and search documents in the registry. Filter by category, tags, or title. Returns document metadata including id, title, filePath, category, tags, and timestamps.",
        inputSchema: {
          type: "object",
          properties: {
            category: { type: "string", description: "Filter by category (contracts, technical, business, legal, meeting, research)" },
            tags: { type: "array", items: { type: "string" }, description: "Filter by tags (matches any)" },
            title: { type: "string", description: "Search by title (partial match, case-insensitive)" },
          },
        },
      },
      {
        name: "dna",
        description:
          "Manage Document DNA (.document-dna.json) — the project's document identity system. " +
          "Actions: 'init' creates DNA with defaults, 'get' returns current config/memories/usage, " +
          "'evolve' analyzes usage patterns, suggests improvements (use apply: true to auto-apply), and auto-learns blueprints from recurring document structures, " +
          "'save-memory' stores a document preference, 'delete-memory' removes one by key.",
        inputSchema: {
          type: "object",
          properties: {
            action: { type: "string", enum: ["init", "get", "evolve", "save-memory", "delete-memory"], description: "DNA action to perform" },
            companyName: { type: "string", description: "Company or project name for default header (init only)." },
            stylePreset: STYLE_PRESET_SCHEMA,
            headerText: { type: "string", description: "Default header text (init only)." },
            headerAlignment: { type: "string", enum: ["left", "center", "right"], description: "Header alignment (init only, default: 'right')" },
            footerText: { type: "string", description: "Default footer text (init only). Use {current}/{total} for page numbers." },
            footerAlignment: { type: "string", enum: ["left", "center", "right"], description: "Footer alignment (init only, default: 'center')" },
            apply: { type: "boolean", description: "Auto-apply top evolution suggestion (evolve only, default: false)" },
            threshold: { type: "number", description: "Minimum documents before suggesting evolution (evolve only, default: 5)" },
            memory: { type: "string", description: "The preference to remember (save-memory only)" },
            key: { type: "string", description: "Memory key — required for delete-memory, optional for save-memory (auto-generated if omitted)." },
          },
          required: ["action"],
        },
      },
      {
        name: "blueprint",
        description:
          "Manage document blueprints — structural templates extracted from existing documents. " +
          "Blueprints are auto-learned from recurring document patterns during 'dna evolve' — 'learn' is only needed for external documents you haven't created through this server. " +
          "Actions: 'learn' extracts a blueprint from DOCX/PDF, 'list' shows all saved blueprints (including auto-learned ones), 'delete' removes one. Use blueprint name in create-doc to enforce structure.",
        inputSchema: {
          type: "object",
          properties: {
            action: { type: "string", enum: ["learn", "list", "delete"], description: "Blueprint action to perform" },
            filePath: { type: "string", description: "Path to source document (learn only, DOCX or PDF)" },
            name: { type: "string", description: "Blueprint name (learn and delete)" },
            description: { type: "string", description: "Optional description (learn only)" },
          },
          required: ["action"],
        },
      },
      // === INNOVATION TOOLS (2) ===
      {
        name: "drift-monitor",
        description:
          "Monitor documents for structural changes over time. " +
          "Actions: 'watch' registers a document with a baseline fingerprint, 'check' compares current state against baseline. Reports heading changes, word count drift, content similarity, and category shifts.",
        inputSchema: {
          type: "object",
          properties: {
            action: { type: "string", enum: ["watch", "check"], description: "Drift action to perform" },
            filePath: { type: "string", description: "Document path (required for watch, optional for check — omit to check all)" },
            name: { type: "string", description: "Optional friendly name (watch only)" },
          },
          required: ["action"],
        },
      },
      {
        name: "get-lineage",
        description:
          "Get the provenance chain for a document — which sources informed it and what was derived from it. Lineage is tracked automatically when you read then create documents.",
        inputSchema: {
          type: "object",
          properties: {
            filePath: { type: "string", description: "Document path to trace lineage for" },
            depth: { type: "number", description: "Traversal depth (default: 3)" },
          },
          required: ["filePath"],
        },
      },
    ],
  };
});

/**
 * Handler for calling tools
 */
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: params } = request.params;
  const toolName = name;

  log("info", "Tool called:", { toolName, params });

  try {
    // Validate file path exists for read and edit tools (not create tools)
    if (params && params.filePath && !name.startsWith("create-")) {
      // Skip validation for tools where filePath might not exist yet or is optional
      const skipValidation = (name === "drift-monitor" && params.action === "check") ||
        (name === "blueprint" && params.action !== "learn") ||
        name === "check-drift"; // backward compat — check-drift filePath is optional

      if (!skipValidation) {
        const resolvedPath = path.resolve(params.filePath);

        if (!fs.existsSync(resolvedPath)) {
          log("error", "File not found:", { filePath: resolvedPath });
          return {
            content: [{ type: "text", text: `Error: File not found at path: ${params.filePath}` }],
            isError: true,
          };
        }

        params.filePath = resolvedPath;
      }
    }

    switch (name) {
      case "read-doc":
        return await handleReadDoc(params);

      // Backward-compatible aliases for the old 3-tool read API
      case "get-doc-summary":
        return await handleReadDoc({ ...params, mode: "summary" });

      case "get-doc-indepth":
        return await handleReadDoc({ ...params, mode: "indepth" });

      case "get-doc-focused":
        return await handleReadDoc({ ...params, mode: "focused" });

      case "detect-format": {
        const { detectFormat } = await import("./services/format-router.js");
        const result = await detectFormat(params);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }

      case "create-doc": {
        const docResult = await createDoc(params);
        if (docResult.success) {
          const responseMessage = docResult.dryRun
            ? docResult.message
            : `DOCX FILE WRITTEN TO DISK at: ${docResult.filePath}\n\nIMPORTANT: This tool has created an actual .docx file on your filesystem. Do NOT create any additional markdown or text files. The document is available at the absolute path shown above.`;
          return {
            content: [{ type: "text", text: JSON.stringify({ ...docResult, message: responseMessage }, null, 2) }],
          };
        }
        return {
          content: [{ type: "text", text: JSON.stringify(docResult, null, 2) }],
          isError: true,
        };
      }

      case "create-markdown": {
        const markdownResult = await createMarkdown(params);
        if (markdownResult.success) {
          const responseMessage = markdownResult.dryRun
            ? markdownResult.message
            : `MARKDOWN FILE WRITTEN TO DISK at: ${markdownResult.filePath}\n\nIMPORTANT: This tool has created an actual .md file on your filesystem. The document is available at the absolute path shown above.`;
          return {
            content: [{ type: "text", text: JSON.stringify({ ...markdownResult, message: responseMessage }, null, 2) }],
          };
        }
        return {
          content: [{ type: "text", text: JSON.stringify(markdownResult, null, 2) }],
          isError: true,
        };
      }

      case "create-excel": {
        const excelResult = await createExcel(params);
        if (excelResult.success) {
          const responseMessage = excelResult.dryRun
            ? excelResult.message
            : `EXCEL FILE WRITTEN TO DISK at: ${excelResult.filePath}\n\nIMPORTANT: This tool has created an actual .xlsx file on your filesystem. Do NOT create any additional markdown or text files. The workbook is available at the absolute path shown above.`;
          return {
            content: [{ type: "text", text: JSON.stringify({ ...excelResult, message: responseMessage }, null, 2) }],
          };
        }
        return {
          content: [{ type: "text", text: JSON.stringify(excelResult, null, 2) }],
          isError: true,
        };
      }

      case "edit-doc": {
        const editDocResult = await editDoc(params);
        return {
          content: [{ type: "text", text: JSON.stringify(editDocResult, null, 2) }],
          isError: !editDocResult.success,
        };
      }

      case "edit-excel": {
        const editExcelResult = await editExcel(params);
        return {
          content: [{ type: "text", text: JSON.stringify(editExcelResult, null, 2) }],
          isError: !editExcelResult.success,
        };
      }

      case "list-documents":
      case "search-registry": {
        const docs = await listDocuments(params || {});
        if (docs) {
          return { content: [{ type: "text", text: JSON.stringify(docs, null, 2) }] };
        }
        return {
          content: [{ type: "text", text: JSON.stringify({ error: "Failed to list documents" }, null, 2) }],
          isError: true,
        };
      }

      case "list-templates":
      case "blueprint list": {
        const { listBlueprints } = await import("./utils/blueprint-store.js");
        const templates = listBlueprints();
        return { content: [{ type: "text", text: JSON.stringify(templates, null, 2) }] };
      }

      // === CONSOLIDATED: dna (was init-dna + get-dna + evolve-dna) ===
      case "dna":
      case "init-dna":
      case "get-dna":
      case "evolve-dna":
        return await handleDNA(params, name);

      // === CONSOLIDATED: memory folded into dna ===
      case "memory":
      case "save-memory":
      case "delete-memory":
        return await handleDNA(params, name);

      // === CONSOLIDATED: blueprint (was learn-blueprint + list-blueprints) ===
      case "blueprint":
      case "learn-blueprint":
      case "list-blueprints":
        return await handleBlueprint(params, name);

      // === CONSOLIDATED: drift-monitor (was watch-document + check-drift) ===
      case "drift-monitor":
      case "watch-document":
      case "check-drift":
        return await handleDriftMonitor(params, name);

      case "get-lineage":
        return await handleGetLineage(params);

      // Backward-compatible aliases (removed from tool listing, kept for legacy clients)
      case "extract-to-excel": {
        const { extractData } = await import("./services/data-extractor.js");
        const extractResult = await extractData({ sourcePath: params.sourcePath, mode: params.mode, pattern: params.pattern });
        if (extractResult.sheets.length === 0) {
          return { content: [{ type: "text", text: JSON.stringify({ success: true, message: extractResult.message, sheets: [] }, null, 2) }] };
        }
        const derivedTitle = params.outputTitle || `Data Extract from ${path.basename(params.sourcePath || "document", path.extname(params.sourcePath || ""))}`;
        const excelResult = await createExcel({ sheets: extractResult.sheets, title: derivedTitle, stylePreset: params.stylePreset || "minimal" });
        return {
          content: [{ type: "text", text: JSON.stringify({ ...excelResult, extractionInfo: { sourcePath: params.sourcePath, mode: params.mode, sheetsExtracted: extractResult.sheets.length } }, null, 2) }],
          isError: !excelResult.success,
        };
      }

      case "assemble-document": {
        const { assembleDocument } = await import("./services/document-assembler.js");
        const assembleResult = await assembleDocument({ sources: params.sources, outputTitle: params.outputTitle, mode: params.mode || "concatenate", blueprint: params.blueprint, stylePreset: params.stylePreset, outputPath: params.outputPath, category: params.category, tags: params.tags });
        return { content: [{ type: "text", text: JSON.stringify(assembleResult, null, 2) }], isError: !assembleResult.success };
      }

      case "check-document": {
        const { checkForExistingDocument } = await import("./services/ai-guidance-system.js");
        const check = await checkForExistingDocument(params.title, params.category);
        return { content: [{ type: "text", text: JSON.stringify({ action: check.action, existingPath: check.existing?.filePath || null }, null, 2) }] };
      }

      default:
        log("error", "Unknown tool requested:", { toolName });
        return {
          content: [{ type: "text", text: `Unknown tool: ${name}` }],
          isError: true,
        };
    }
  } catch (error) {
    log("error", "Error executing tool:", { toolName, error: error.message, stack: error.stack });
    return {
      content: [{ type: "text", text: `Error: ${error.message || "Unknown error occurred"}` }],
      isError: true,
    };
  }
});

/**
 * Start the server using stdio transport
 */
async function run() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  log("info", "MCP Document Processor server running on stdio");
  log("info", `Vision Provider: ${visionService.name}`);
}

run().catch((error) => {
  console.error("Fatal error running server:", error);
  process.exit(1);
});