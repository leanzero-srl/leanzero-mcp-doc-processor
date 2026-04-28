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
import { visionService } from "./services/vision-service.js";

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

// Create MCP server
const server = new Server(
  { name: "mcp-doc-processor", version: "1.0.0" },
  { capabilities: { tools: {} } },
);

// Shared schema fragments
const STYLE_PRESET = {
  type: "string",
  enum: ["minimal", "professional", "technical", "legal", "business", "casual", "colorful"],
  description: "Style preset. Auto-selected from category if omitted.",
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
        "Recommend document format and tone. Call BEFORE creating if format/tone not specified. Technical → markdown, Stakeholder → docx, Data → excel.",
      inputSchema: {
        type: "object",
        properties: {
          userQuery: { type: "string", description: "The user's original request" },
          title: { type: "string", description: "Document title if known" },
          content: { type: "string", description: "Content preview if available" },
        },
        required: ["userQuery"],
      },
    },
    {
      name: "create-doc",
      description:
        "Create a Word DOCX with paragraphs, tables, headers, footers, and styling. Title must be descriptive (not 'Document' or 'Untitled'). DNA auto-applies defaults. Use dryRun for preview.",
      inputSchema: {
        type: "object",
        properties: {
          title: { type: "string", description: "Document title. Must be specific and descriptive." },
          paragraphs: { type: "array", items: PARA_ITEM, description: "Paragraphs with headingLevel for hierarchy." },
          tables: { type: "array", items: { type: "array", items: { type: "array", items: { type: "string" } } }, description: "Tables as 2D arrays." },
          outputPath: { type: "string", description: "Output file path (default: derived from title)." },
          stylePreset: STYLE_PRESET,
          category: CATEGORY,
          tags: TAGS,
          description: { type: "string", description: "Brief description for registry." },
          dryRun: { type: "boolean", description: "Preview without writing (default: false)." },
          docType: DOC_TYPE,
        },
        required: ["title"],
      },
    },
    {
      name: "create-markdown",
      description:
        "Create implementation-focused markdown files. Copy-paste friendly with code blocks, headings, bullet lists (no tables). No confirmation needed.",
      inputSchema: {
        type: "object",
        properties: {
          title: { type: "string", description: "Document title (becomes H1). Must be specific." },
          paragraphs: { type: "array", items: PARA_ITEM, description: "Paragraphs with markdown formatting." },
          outputPath: { type: "string", description: "Output file path." },
          category: CATEGORY,
          tags: TAGS,
          description: { type: "string", description: "Brief description for registry." },
          dryRun: { type: "boolean", description: "Preview without writing (default: false)." },
          docType: DOC_TYPE,
        },
        required: ["title"],
      },
    },
    {
      name: "create-excel",
      description:
        "Create an Excel XLSX workbook with multiple sheets and styling. Title and sheet names must be descriptive. Use dryRun for preview.",
      inputSchema: {
        type: "object",
        properties: {
          title: { type: "string", description: "Workbook title. Must be descriptive." },
          sheets: {
            type: "array",
            items: { type: "object", properties: { name: { type: "string" }, data: { type: "array", items: { type: "array" } } }, required: ["name", "data"] },
            description: "Sheet definitions with descriptive names.",
          },
          stylePreset: STYLE_PRESET,
          style: {
            type: "object",
            description: "Custom styling overrides",
            properties: {
              font: { type: "object" },
              columnWidths: { type: "object" },
              rowHeights: { type: "object" },
              headerBold: { type: "boolean" },
            },
          },
          outputPath: { type: "string", description: "Output file path." },
          enforceDocsFolder: { type: "boolean", description: "Enforce docs/ folder (default: true)." },
          preventDuplicates: { type: "boolean", description: "Prevent duplicate files (default: true)." },
          dryRun: { type: "boolean", description: "Preview without writing (default: false)." },
          category: CATEGORY,
          tags: TAGS,
          description: { type: "string", description: "Brief description for registry." },
          docType: DOC_TYPE,
        },
        required: ["sheets"],
      },
    },
    {
      name: "edit-doc",
      description:
        "Edit existing DOCX. Actions: 'append' (preserve formatting via XML patching), 'replace' (overwrite content), 'style' (apply preset), 'preview'. Title must be descriptive.",
      inputSchema: {
        type: "object",
        properties: {
          filePath: { type: "string", description: "Path to the existing DOCX file" },
          action: { type: "string", enum: ["append", "replace", "style", "preview"], description: "Edit action type" },
          title: { type: "string", description: "Document title. Must be specific." },
          paragraphs: { type: "array", items: PARA_ITEM, description: "Paragraphs to append/replace." },
          tables: { type: "array", items: { type: "array", items: { type: "array", items: { type: "string" } } }, description: "Tables as 2D arrays." },
          stylePreset: STYLE_PRESET,
          category: { type: "string", description: "Document category for registry" },
          tags: TAGS,
          docType: DOC_TYPE,
        },
        required: ["filePath", "action"],
      },
    },
    {
      name: "edit-excel",
      description:
        "Edit existing XLSX. Actions: 'append-rows', 'append-sheet', 'replace-sheet'. Read with read-doc first.",
      inputSchema: {
        type: "object",
        properties: {
          filePath: { type: "string", description: "Path to the existing XLSX file" },
          action: { type: "string", enum: ["append-rows", "append-sheet", "replace-sheet"], description: "Edit action type" },
          sheetName: { type: "string", description: "Target sheet name" },
          rows: { type: "array", items: { type: "array" }, description: "Rows to append" },
          sheetData: { type: "object", properties: { name: { type: "string" }, data: { type: "array", items: { type: "array" } } }, required: ["data"], description: "Sheet definition" },
          stylePreset: STYLE_PRESET,
          category: { type: "string", description: "Document category for registry" },
          tags: TAGS,
          docType: DOC_TYPE,
        },
        required: ["filePath", "action"],
      },
    },
    {
      name: "list-documents",
      description: "Search document registry by category, tags, or title.",
      inputSchema: {
        type: "object",
        properties: {
          category: { type: "string", description: "Filter by category" },
          tags: { type: "array", items: { type: "string" }, description: "Filter by tags (matches any)" },
          title: { type: "string", description: "Search by title (partial match)" },
        },
      },
    },
    {
      name: "list-templates",
      description: "List available document templates and blueprints.",
      inputSchema: {
        type: "object",
        properties: {
          category: { type: "string", description: "Filter by category" },
        },
      },
    },
    {
      name: "dna",
      description:
        "Manage Document DNA. Actions: 'init' (create defaults), 'get' (current config), 'evolve' (analyze patterns, auto-learn blueprints), 'save-memory', 'delete-memory'.",
      inputSchema: {
        type: "object",
        properties: {
          action: { type: "string", enum: ["init", "get", "evolve", "save-memory", "delete-memory"], description: "DNA action" },
          companyName: { type: "string", description: "Company name for header (init only)" },
          stylePreset: STYLE_PRESET,
          headerText: { type: "string", description: "Default header (init only)" },
          headerAlignment: { type: "string", enum: ["left", "center", "right"], description: "Header alignment (init only)" },
          footerText: { type: "string", description: "Default footer (init only). Use {current}/{total} for page numbers." },
          footerAlignment: { type: "string", enum: ["left", "center", "right"], description: "Footer alignment (init only)" },
          apply: { type: "boolean", description: "Auto-apply evolution suggestion (evolve only)" },
          threshold: { type: "number", description: "Min documents before suggesting evolution (evolve only)" },
          memory: { type: "string", description: "Preference to remember (save-memory only)" },
          key: { type: "string", description: "Memory key" },
        },
        required: ["action"],
      },
    },
    {
      name: "blueprint",
      description:
        "Manage structural blueprints. Actions: 'learn' (extract from DOCX/PDF), 'list', 'delete'. Auto-learned during 'dna evolve'.",
      inputSchema: {
        type: "object",
        properties: {
          action: { type: "string", enum: ["learn", "list", "delete"], description: "Blueprint action" },
          filePath: { type: "string", description: "Source document (learn only)" },
          name: { type: "string", description: "Blueprint name" },
          description: { type: "string", description: "Description (learn only)" },
        },
        required: ["action"],
      },
    },
    {
      name: "drift-monitor",
      description:
        "Monitor documents for structural changes. Actions: 'watch' (register baseline), 'check' (compare). Reports heading, word count, content drift.",
      inputSchema: {
        type: "object",
        properties: {
          action: { type: "string", enum: ["watch", "check"], description: "Drift action" },
          filePath: { type: "string", description: "Document path (required for watch, omit to check all)" },
          name: { type: "string", description: "Friendly name (watch only)" },
        },
        required: ["action"],
      },
    },
    {
      name: "get-lineage",
      description: "Trace document provenance — which sources informed it and what was derived from it.",
      inputSchema: {
        type: "object",
        properties: {
          filePath: { type: "string", description: "Document path" },
          depth: { type: "number", description: "Traversal depth (default: 3)" },
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
        if (r.success) {
          r.message = r.dryRun ? r.message : `DOCX FILE WRITTEN TO DISK at: ${r.filePath}\n\nThe document is available at the path above.`;
        }
        return { content: [{ type: "text", text: JSON.stringify(r, null, 2) }], isError: !r.success };
      }

      case "create-markdown": {
        const r = await createMarkdown(params);
        if (r.success) {
          r.message = r.dryRun ? r.message : `MARKDOWN FILE WRITTEN TO DISK at: ${r.filePath}\n\nThe document is available at the path above.`;
        }
        return { content: [{ type: "text", text: JSON.stringify(r, null, 2) }], isError: !r.success };
      }

      case "create-excel": {
        const r = await createExcel(params);
        if (r.success) {
          r.message = r.dryRun ? r.message : `EXCEL FILE WRITTEN TO DISK at: ${r.filePath}\n\nThe workbook is available at the path above.`;
        }
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
        return { content: [{ type: "text", text: JSON.stringify(listBlueprints(), null, 2) }] };
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
