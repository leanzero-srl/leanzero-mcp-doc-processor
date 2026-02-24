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
import { editDoc } from "./tools/edit-doc.js";
import { editExcel } from "./tools/edit-excel.js";

// Import registry query tools
import { listDocuments } from "./tools/utils.js";

// Import extracted tool handlers
import { handleDNA } from "./tools/dna-tool.js";
import { handleBlueprint } from "./tools/blueprint-tool.js";
import { handleDriftMonitor } from "./tools/drift-tool.js";
import { handleGetLineage } from "./tools/lineage-tool.js";

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
 *
 * Consolidated from 21 to 9 active tools:
 *   - get-doc-summary + get-doc-indepth + get-doc-focused → read-doc
 *   - init-dna + get-dna + evolve-dna + save-memory + delete-memory → dna
 *   - watch-document + check-drift → drift-monitor
 *   - learn-blueprint + list-blueprints → blueprint
 *   - check-document removed (create-doc checks internally)
 *   - extract-to-excel and assemble-document removed from listing (kept as aliases)
 *
 * All old tool names are still accepted as backward-compatible aliases in the handler.
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
          "Read and analyze a document. Supports PDF, DOCX, Excel files with embedded images. " +
          "Modes: 'summary' (default) — high-level overview with content preview; " +
          "'indepth' — full text, structure, formatting, and metadata (use before editing); " +
          "'focused' — query-based analysis that finds relevant sections or generates clarification questions. " +
          "IMPORTANT: Use this tool to read existing documents BEFORE creating or editing them.",
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
      // === DOCUMENT CREATION/EDITING (4) ===
      {
        name: "create-doc",
        description:
          "Creates a Word DOCX document on DISK. USER CONFIRMATION REQUIRED: describe what you plan to create and get approval first. Use dryRun: true for previews. " +
          "IMPORTANT: The title MUST be specific and descriptive (e.g., 'Q1 2026 Budget Report', 'API Design Guidelines'). Generic titles like 'Document' or 'Untitled' will be rejected. " +
          "Blueprints are auto-learned from recurring patterns — check blueprintMatch in the response for structural template suggestions. " +
          "Do NOT include markdown syntax in paragraph text — use headingLevel, bold, etc. for formatting. " +
          "Use paragraph objects with headingLevel for document hierarchy. " +
          "If Document DNA (.document-dna.json) exists, headers/footers/style are applied automatically unless overridden.",
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
        name: "create-excel",
        description:
          "Creates an Excel XLSX workbook on DISK. USER CONFIRMATION REQUIRED: describe what you plan to create and get approval first. Use dryRun: true for previews. " +
          "IMPORTANT: Provide a descriptive 'title' for the workbook (e.g., 'Q1 2026 Budget Breakdown'). Sheet names must also be descriptive (e.g., 'Monthly Revenue', not 'Sheet1'). " +
          "Do NOT include markdown in cell values. Enforces .xlsx extension and docs/ folder by default.",
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
      // === CONSOLIDATED MANAGEMENT TOOLS (4) ===
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
