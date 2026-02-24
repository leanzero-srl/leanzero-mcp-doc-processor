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
import { handleSummary } from "./tools/summary-tool.js";
import { handleInDepth } from "./tools/indepth-tool.js";
import { handleFocused } from "./tools/focused-tool.js";
import { createDoc } from "./tools/create-doc.js";
import { createExcel } from "./tools/create-excel.js";
import { editDoc } from "./tools/edit-doc.js";
import { editExcel } from "./tools/edit-excel.js";

// Import registry query tools
import { listDocuments } from "./tools/utils.js";

// Import DNA manager
import { loadDNA, createDNAFile, getDefaultDNA, analyzeProjectProfile, analyzeTrends, applyEvolution } from "./utils/dna-manager.js";

// Import AI guidance tools
import {
  handleSaveMemory,
  handleDeleteMemory
} from "./tools/guidance-tools.js";

// Import innovation features
import { getLineage } from "./services/lineage-tracker.js";
import { extractBlueprintFromDocx, extractBlueprintFromPdf } from "./services/blueprint-extractor.js";
import { saveBlueprint, listBlueprints, deleteBlueprint } from "./utils/blueprint-store.js";
import { extractData } from "./services/data-extractor.js";
import { watchDocument, checkDrift } from "./services/drift-detector.js";
import { assembleDocument } from "./services/document-assembler.js";

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
 * Consolidated from 21 to 14 tools:
 *   - init-dna + get-dna + evolve-dna → dna (action: init/get/evolve)
 *   - save-memory + delete-memory → memory (action: save/delete)
 *   - watch-document + check-drift → drift-monitor (action: watch/check)
 *   - learn-blueprint + list-blueprints → blueprint (action: learn/list/delete)
 *   - check-document removed (create-doc checks internally)
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
      // === DOCUMENT READING (3) ===
      {
        name: "get-doc-summary",
        description:
          "Get a high-level summary of a document including structure, sections, and content overview. Supports PDF, DOCX, Excel files. Extracts embedded images and includes them in the response. IMPORTANT: Use this tool to read existing documents BEFORE creating or editing them. Understanding current content prevents duplication and ensures new documents build on existing work rather than duplicating it.",
        inputSchema: {
          type: "object",
          properties: {
            filePath: { type: "string", description: "Local file path to the document" },
          },
          required: ["filePath"],
        },
      },
      {
        name: "get-doc-indepth",
        description:
          "Get a detailed analysis of the document including full text, structure, formatting, metadata, and embedded images. Best used after focused analysis for more detail. Supports PDF, DOCX, Excel files. IMPORTANT: Use this tool to read existing documents BEFORE creating or editing them. Understanding current content prevents duplication and ensures new documents build on existing work. When you need to edit a document, ALWAYS read it first with this tool to understand what is already there.",
        inputSchema: {
          type: "object",
          properties: {
            filePath: { type: "string", description: "Local file path to the document" },
          },
          required: ["filePath"],
        },
      },
      {
        name: "get-doc-focused",
        description:
          "Perform a focused analysis based on user-specific query. This tool automatically generates clarification questions to understand what aspects interest you, then processes the document accordingly. Supports PDF, DOCX, Excel files with extracted images. IMPORTANT: Use this tool to read existing documents BEFORE creating or editing them. Understanding current content prevents duplication and ensures new documents build on existing work.",
        inputSchema: {
          type: "object",
          properties: {
            filePath: { type: "string", description: "Local file path to the document" },
            userQuery: { type: "string", description: "User's query to clarify the focus of analysis (e.g., 'tell me about liability clauses')" },
            context: { type: "string", description: "Additional context from previous questions/responses to refine the analysis" },
          },
          required: ["filePath"],
        },
      },
      // === DOCUMENT CREATION/EDITING (4) ===
      {
        name: "create-doc",
        description:
          "Creates a Word DOCX document on DISK. USER CONFIRMATION REQUIRED: describe what you plan to create and get approval first. Use dryRun: true for previews. " +
          "Do NOT include markdown syntax in paragraph text — use headingLevel, bold, etc. for formatting. " +
          "Use paragraph objects with headingLevel for document hierarchy. " +
          "If Document DNA (.document-dna.json) exists, headers/footers/style are applied automatically unless overridden.",
        inputSchema: {
          type: "object",
          properties: {
            title: { type: "string", description: "Document title (appears as Heading 1)" },
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
          "Do NOT include markdown in cell values. Enforces .xlsx extension and docs/ folder by default.",
        inputSchema: {
          type: "object",
          properties: {
            sheets: {
              type: "array",
              items: { type: "object", properties: { name: { type: "string" }, data: { type: "array", items: { type: "array" } } }, required: ["name", "data"] },
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
          "ALWAYS read the document first with get-doc-indepth before editing. " +
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
          "Edits an existing Excel XLSX workbook. USER CONFIRMATION REQUIRED. ALWAYS read the spreadsheet first with get-doc-indepth. " +
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
          "Actions: 'init' creates DNA with defaults, 'get' returns current config/memories/usage, 'evolve' analyzes usage patterns and suggests improvements (use apply: true to auto-apply).",
        inputSchema: {
          type: "object",
          properties: {
            action: { type: "string", enum: ["init", "get", "evolve"], description: "DNA action to perform" },
            companyName: { type: "string", description: "Company or project name for default header (init only)." },
            stylePreset: STYLE_PRESET_SCHEMA,
            headerText: { type: "string", description: "Default header text (init only)." },
            headerAlignment: { type: "string", enum: ["left", "center", "right"], description: "Header alignment (init only, default: 'right')" },
            footerText: { type: "string", description: "Default footer text (init only). Use {current}/{total} for page numbers." },
            footerAlignment: { type: "string", enum: ["left", "center", "right"], description: "Footer alignment (init only, default: 'center')" },
            apply: { type: "boolean", description: "Auto-apply top evolution suggestion (evolve only, default: false)" },
            threshold: { type: "number", description: "Minimum documents before suggesting evolution (evolve only, default: 5)" },
          },
          required: ["action"],
        },
      },
      {
        name: "memory",
        description:
          "Manage document preferences that persist across sessions (stored in .document-dna.json). " +
          "Actions: 'save' stores a preference, 'delete' removes one by key. Use dna action:'get' to view current memories.",
        inputSchema: {
          type: "object",
          properties: {
            action: { type: "string", enum: ["save", "delete"], description: "Memory action to perform" },
            memory: { type: "string", description: "The preference to remember (save only)" },
            key: { type: "string", description: "Memory key — required for delete, optional for save (auto-generated if omitted)." },
          },
          required: ["action"],
        },
      },
      {
        name: "blueprint",
        description:
          "Manage document blueprints — structural templates extracted from existing documents. " +
          "Actions: 'learn' extracts a blueprint from DOCX/PDF, 'list' shows all saved blueprints, 'delete' removes one. Use blueprint name in create-doc to enforce structure.",
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
      // === INNOVATION TOOLS (3) ===
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
      {
        name: "extract-to-excel",
        description:
          "Extract structured data from a document (PDF, DOCX) into an Excel workbook. " +
          "Modes: 'tables' (extract all tables), 'pattern' (regex match on lines), 'sections' (heading+content pairs). Runs server-side.",
        inputSchema: {
          type: "object",
          properties: {
            sourcePath: { type: "string", description: "Path to the source document" },
            mode: { type: "string", enum: ["tables", "pattern", "sections"], description: "Extraction mode" },
            pattern: { type: "string", description: "Regex pattern (for 'pattern' mode)" },
            outputTitle: { type: "string", description: "Title for the output Excel file" },
            stylePreset: STYLE_PRESET_SCHEMA,
          },
          required: ["sourcePath", "mode"],
        },
      },
      {
        name: "assemble-document",
        description:
          "Assemble a new document from multiple sources. 'concatenate' joins all sequentially, 'cherry-pick' selects specific sections. Optionally validates against a blueprint. Respects DNA defaults.",
        inputSchema: {
          type: "object",
          properties: {
            sources: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  filePath: { type: "string", description: "Path to source document" },
                  sections: { description: "'all' or array of section heading names", oneOf: [{ type: "string", enum: ["all"] }, { type: "array", items: { type: "string" } }] },
                },
                required: ["filePath"],
              },
              description: "Source documents and section selections.",
            },
            outputTitle: { type: "string", description: "Title for the assembled document" },
            mode: { type: "string", enum: ["concatenate", "cherry-pick"], description: "Assembly mode (default: concatenate)" },
            blueprint: { type: "string", description: "Blueprint name to validate against" },
            stylePreset: STYLE_PRESET_SCHEMA,
            outputPath: { type: "string", description: "Output file path" },
            category: CATEGORY_SCHEMA,
            tags: TAGS_SCHEMA,
          },
          required: ["sources", "outputTitle"],
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
      case "get-doc-summary":
        return await handleSummary(params);

      case "get-doc-indepth":
        return await handleInDepth(params);

      case "get-doc-focused":
        return await handleFocused(params, params.userQuery, params.context);

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
      case "evolve-dna": {
        const dnaAction = params.action || (name === "init-dna" ? "init" : name === "get-dna" ? "get" : name === "evolve-dna" ? "evolve" : null);

        if (dnaAction === "init") {
          try {
            const result = createDNAFile({
              company: { name: params.companyName },
              defaults: { stylePreset: params.stylePreset },
              header: { text: params.headerText || params.companyName, alignment: params.headerAlignment },
              footer: { text: params.footerText, alignment: params.footerAlignment },
            });
            return {
              content: [{
                type: "text",
                text: JSON.stringify({
                  success: true,
                  path: result.path,
                  config: result.config,
                  message:
                    `Document DNA initialized at: ${result.path}\n\n` +
                    `All future documents will automatically include:\n` +
                    `- Header: "${result.config.header.text}" (${result.config.header.alignment}-aligned)\n` +
                    `- Footer: "${result.config.footer.text}" (${result.config.footer.alignment}-aligned)\n` +
                    `- Style: ${result.config.defaults.stylePreset}\n\n` +
                    `Override any of these by explicitly passing header, footer, or stylePreset to create-doc.`,
                }, null, 2),
              }],
            };
          } catch (err) {
            return {
              content: [{ type: "text", text: JSON.stringify({ success: false, error: err.message }, null, 2) }],
              isError: true,
            };
          }
        }

        if (dnaAction === "get") {
          const dna = loadDNA();
          const memoriesList = dna && dna.memories
            ? Object.entries(dna.memories).map(([key, val]) => `  - ${key}: "${val.text}"`)
            : [];
          const profile = analyzeProjectProfile();

          let profileMsg = "";
          if (profile) {
            profileMsg = `\n\nProject profile (${profile.totalDocs} documents created):`;
            if (profile.dominantCategory) profileMsg += `\n  Most used category: ${profile.dominantCategory} (${profile.dominantCategoryPct}%)`;
            if (profile.dominantStyle) profileMsg += `\n  Most used style: ${profile.dominantStyle} (${profile.dominantStylePct}%)`;
            if (profile.suggestion) profileMsg += `\n  Suggestion: ${profile.suggestion}`;
          }

          return {
            content: [{
              type: "text",
              text: JSON.stringify({
                initialized: dna !== null,
                config: dna || null,
                memoriesCount: memoriesList.length,
                projectProfile: profile,
                message: dna
                  ? "Document DNA is configured." +
                    (memoriesList.length > 0
                      ? `\n\nActive memories (${memoriesList.length}):\n${memoriesList.join("\n")}`
                      : "\n\nNo document memories stored yet.") +
                    profileMsg
                  : "Document DNA is not initialized. Use dna action:'init' to set up.",
              }, null, 2),
            }],
          };
        }

        if (dnaAction === "evolve") {
          try {
            const trends = analyzeTrends(params.threshold || 5);
            if (!trends.ready) {
              return { content: [{ type: "text", text: JSON.stringify(trends, null, 2) }] };
            }

            if (params.apply && trends.suggestions && trends.suggestions.length > 0) {
              const topSuggestion = trends.suggestions.find(s => s.mutation);
              if (topSuggestion) {
                const evolutionResult = applyEvolution(topSuggestion.mutation);
                return {
                  content: [{
                    type: "text",
                    text: JSON.stringify({ ...trends, applied: evolutionResult, message: `Evolution applied: ${evolutionResult.message}` }, null, 2),
                  }],
                };
              }
            }

            return { content: [{ type: "text", text: JSON.stringify(trends, null, 2) }] };
          } catch (err) {
            return {
              content: [{ type: "text", text: JSON.stringify({ success: false, error: err.message }, null, 2) }],
              isError: true,
            };
          }
        }

        return {
          content: [{ type: "text", text: JSON.stringify({ success: false, error: `Unknown dna action: ${dnaAction}. Use 'init', 'get', or 'evolve'.` }, null, 2) }],
          isError: true,
        };
      }

      // === CONSOLIDATED: memory (was save-memory + delete-memory) ===
      case "memory":
      case "save-memory":
      case "delete-memory": {
        const memAction = params.action || (name === "save-memory" ? "save" : name === "delete-memory" ? "delete" : null);

        if (memAction === "save") return await handleSaveMemory({ memory: params.memory, key: params.key });
        if (memAction === "delete") return await handleDeleteMemory({ key: params.key });

        return {
          content: [{ type: "text", text: JSON.stringify({ success: false, error: `Unknown memory action: ${memAction}. Use 'save' or 'delete'.` }, null, 2) }],
          isError: true,
        };
      }

      // === CONSOLIDATED: blueprint (was learn-blueprint + list-blueprints) ===
      case "blueprint":
      case "learn-blueprint":
      case "list-blueprints": {
        const bpAction = params.action || (name === "learn-blueprint" ? "learn" : name === "list-blueprints" ? "list" : null);

        if (bpAction === "learn") {
          try {
            const detected = params.filePath.toLowerCase();
            let blueprintData;

            if (detected.endsWith(".docx")) {
              blueprintData = await extractBlueprintFromDocx(params.filePath);
            } else if (detected.endsWith(".pdf")) {
              blueprintData = await extractBlueprintFromPdf(params.filePath);
            } else {
              return {
                content: [{ type: "text", text: JSON.stringify({ success: false, error: "Only DOCX and PDF files are supported for blueprint extraction." }, null, 2) }],
                isError: true,
              };
            }

            blueprintData.learnedFrom = params.filePath;
            const result = saveBlueprint(params.name, blueprintData, params.description);
            return {
              content: [{
                type: "text",
                text: JSON.stringify({
                  ...result,
                  message: `Blueprint "${params.name}" learned from ${params.filePath}.\nSections: ${blueprintData.sections.length}\nStyle: ${blueprintData.stylePreset}\nUse blueprint: "${params.name}" in create-doc.`,
                }, null, 2),
              }],
            };
          } catch (err) {
            return {
              content: [{ type: "text", text: JSON.stringify({ success: false, error: err.message }, null, 2) }],
              isError: true,
            };
          }
        }

        if (bpAction === "list") {
          const bpList = listBlueprints();
          return {
            content: [{
              type: "text",
              text: JSON.stringify({
                success: true,
                count: bpList.length,
                blueprints: bpList,
                message: bpList.length > 0
                  ? `${bpList.length} blueprint(s) available.`
                  : "No blueprints yet. Use blueprint action:'learn' to extract from an existing document.",
              }, null, 2),
            }],
          };
        }

        if (bpAction === "delete") {
          if (!params.name) {
            return {
              content: [{ type: "text", text: JSON.stringify({ success: false, error: "Blueprint name is required for delete." }, null, 2) }],
              isError: true,
            };
          }
          const deleted = deleteBlueprint(params.name);
          return {
            content: [{
              type: "text",
              text: JSON.stringify({
                success: deleted,
                message: deleted ? `Blueprint "${params.name}" deleted.` : `Blueprint "${params.name}" not found.`,
              }, null, 2),
            }],
          };
        }

        return {
          content: [{ type: "text", text: JSON.stringify({ success: false, error: `Unknown blueprint action: ${bpAction}. Use 'learn', 'list', or 'delete'.` }, null, 2) }],
          isError: true,
        };
      }

      // === CONSOLIDATED: drift-monitor (was watch-document + check-drift) ===
      case "drift-monitor":
      case "watch-document":
      case "check-drift": {
        const driftAction = params.action || (name === "watch-document" ? "watch" : name === "check-drift" ? "check" : null);

        if (driftAction === "watch") {
          try {
            const watchResult = await watchDocument(params.filePath, params.name);
            return {
              content: [{ type: "text", text: JSON.stringify(watchResult, null, 2) }],
              isError: !watchResult.success,
            };
          } catch (err) {
            return {
              content: [{ type: "text", text: JSON.stringify({ success: false, error: err.message }, null, 2) }],
              isError: true,
            };
          }
        }

        if (driftAction === "check") {
          try {
            const driftResult = await checkDrift(params.filePath);
            return {
              content: [{ type: "text", text: JSON.stringify(driftResult, null, 2) }],
              isError: !driftResult.success,
            };
          } catch (err) {
            return {
              content: [{ type: "text", text: JSON.stringify({ success: false, error: err.message }, null, 2) }],
              isError: true,
            };
          }
        }

        return {
          content: [{ type: "text", text: JSON.stringify({ success: false, error: `Unknown drift-monitor action: ${driftAction}. Use 'watch' or 'check'.` }, null, 2) }],
          isError: true,
        };
      }

      case "get-lineage": {
        try {
          const lineageResult = await getLineage(params.filePath, params.depth || 3);
          return {
            content: [{ type: "text", text: JSON.stringify(lineageResult, null, 2) }],
            isError: !lineageResult.success,
          };
        } catch (err) {
          return {
            content: [{ type: "text", text: JSON.stringify({ success: false, error: err.message }, null, 2) }],
            isError: true,
          };
        }
      }

      case "extract-to-excel": {
        try {
          const extractResult = await extractData({
            sourcePath: params.sourcePath,
            mode: params.mode,
            pattern: params.pattern,
          });

          if (extractResult.sheets.length === 0) {
            return {
              content: [{ type: "text", text: JSON.stringify({ success: true, message: extractResult.message, sheets: [] }, null, 2) }],
            };
          }

          const excelResult = await createExcel({
            sheets: extractResult.sheets,
            title: params.outputTitle || "Data Extract",
            stylePreset: params.stylePreset || "minimal",
          });

          return {
            content: [{
              type: "text",
              text: JSON.stringify({
                ...excelResult,
                extractionInfo: { sourcePath: params.sourcePath, mode: params.mode, pattern: params.pattern || null, sheetsExtracted: extractResult.sheets.length },
                message: excelResult.success
                  ? `${extractResult.message}\nExcel file written to: ${excelResult.filePath}`
                  : excelResult.message,
              }, null, 2),
            }],
            isError: !excelResult.success,
          };
        } catch (err) {
          return {
            content: [{ type: "text", text: JSON.stringify({ success: false, error: err.message }, null, 2) }],
            isError: true,
          };
        }
      }

      case "assemble-document": {
        try {
          const assembleResult = await assembleDocument({
            sources: params.sources,
            outputTitle: params.outputTitle,
            mode: params.mode || "concatenate",
            blueprint: params.blueprint,
            stylePreset: params.stylePreset,
            outputPath: params.outputPath,
            category: params.category,
            tags: params.tags,
          });

          return {
            content: [{ type: "text", text: JSON.stringify(assembleResult, null, 2) }],
            isError: !assembleResult.success,
          };
        } catch (err) {
          return {
            content: [{ type: "text", text: JSON.stringify({ success: false, error: err.message }, null, 2) }],
            isError: true,
          };
        }
      }

      // Legacy alias kept for backward compatibility
      case "check-document": {
        const { handleCheckDocument } = await import("./tools/guidance-tools.js");
        return await handleCheckDocument(params);
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
