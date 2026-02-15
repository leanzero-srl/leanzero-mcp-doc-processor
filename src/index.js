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
 * Handler for listing available tools
 */
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "get-doc-summary",
        description:
          "Get a high-level summary of a document including structure, sections, and content overview. Supports PDF, DOCX, Excel files. Extracts embedded images and includes them in the response. IMPORTANT: Use this tool to read existing documents BEFORE creating or editing them. Understanding current content prevents duplication and ensures new documents build on existing work rather than duplicating it.",
        inputSchema: {
          type: "object",
          properties: {
            filePath: {
              type: "string",
              description: "Local file path to the document",
            },
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
            filePath: {
              type: "string",
              description: "Local file path to the document",
            },
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
            filePath: {
              type: "string",
              description: "Local file path to the document",
            },
            userQuery: {
              type: "string",
              description:
                "User's query to clarify the focus of analysis (e.g., 'tell me about liability clauses')",
            },
            context: {
              type: "string",
              description:
                "Additional context from previous questions/responses to refine the analysis",
            },
          },
          required: ["filePath"],
        },
      },
      {
        name: "create-doc",
        description:
          "Creates a Word DOCX document on DISK with title, paragraphs, tables, headers, and footers. " +
          "USER CONFIRMATION REQUIRED: This tool writes files to disk. ALWAYS describe to the user what document you plan to create (title, sections, approximate content) and get their explicit confirmation BEFORE calling this tool. Never call create-doc without the user's approval. Use dryRun: true to generate a preview first. " +
          "CONTENT RULES: Do NOT include markdown syntax in paragraph text. No **, *, #, -, backticks, or other markdown ornaments. Write clean prose. The tool handles formatting through its style system (headingLevel, bold, stylePreset). If you need bold text, use paragraph objects with bold: true. If you need headings, use headingLevel: 'heading1'. Any remaining markdown syntax will be automatically converted to proper DOCX formatting, but you should avoid it. " +
          "CONSOLIDATION: Before creating a document, gather and consolidate ALL relevant information first. Do not create multiple small documents when one comprehensive document would serve better. Structure content logically with a clear title, organized sections, and coherent flow. " +
          "READ FIRST: If an existing document at the target path may already contain relevant content, use get-doc-summary or get-doc-indepth to read it first. Then decide whether to edit it (using edit-doc) or create a fresh version. " +
          "ORGANIZATION: The tool enforces docs/ folder by default. EXTENSION: Enforces .docx extension regardless of input. Supports 7 style presets (minimal, professional, technical, legal, business, casual, colorful).",
        inputSchema: {
          type: "object",
          properties: {
            title: {
              type: "string",
              description: "Document title (appears as Heading 1)",
            },
            paragraphs: {
              type: "array",
              items: { type: "string" },
              description:
                "Array of paragraph strings. Write clean prose without markdown syntax.",
            },
            tables: {
              type: "array",
              items: {
                type: "array",
                items: { type: "array", items: { type: "string" } },
              },
              description: "Array of tables (each table is a 2D array)",
            },
            stylePreset: {
              type: "string",
              enum: [
                "minimal",
                "professional",
                "technical",
                "legal",
                "business",
                "casual",
                "colorful",
              ],
              description:
                "Style preset name: minimal (clean/basic), professional (Garamond serif, full justification), technical (Arial, optimized readability), legal (Times New Roman, double-spaced), business (Calibri, modern blue palette), casual (Verdana, warm colors), colorful (vibrant, visual impact). Default: minimal. Choose based on document type and audience.",
            },
            header: {
              type: "object",
              description: "Header configuration options",
              properties: {
                text: {
                  type: "string",
                  description: "Text to display in header",
                },
                alignment: {
                  type: "string",
                  enum: ["left", "center", "right"],
                  description: "Header text alignment (default: center)",
                },
              },
            },
            footer: {
              type: "object",
              description:
                "Footer configuration options. Use {{page}} for page number.",
              properties: {
                text: {
                  type: "string",
                  description:
                    "Text to display in footer. Use '{{page}}' placeholder for page numbers (e.g., 'Page {{page}} of 5')",
                },
                alignment: {
                  type: "string",
                  enum: ["left", "center", "right"],
                  description: "Footer text alignment (default: center)",
                },
              },
            },
            backgroundColor: {
              type: "string",
              description:
                "Page background color as hex code (e.g., 'FFFFFF' for white, or with #: '#FFFFFF')",
            },
            style: {
              type: "object",
              description: "Custom styling options (overrides stylePreset)",
              properties: {
                font: {
                  type: "object",
                  description: "Font styling options",
                  properties: {
                    size: {
                      type: "number",
                      description: "Font size in points",
                    },
                    color: {
                      type: "string",
                      description: "Font color as hex (e.g., 'FF0000')",
                    },
                    bold: { type: "boolean" },
                    italics: { type: "boolean" },
                    underline: { type: "boolean" },
                    fontFamily: {
                      type: "string",
                      description: "Font family name",
                    },
                  },
                },
                paragraph: {
                  type: "object",
                  description: "Paragraph formatting options",
                  properties: {
                    alignment: {
                      type: "string",
                      enum: ["left", "right", "center", "both"],
                    },
                    spacingBefore: {
                      type: "number",
                      description: "Spacing before paragraph in twips",
                    },
                    spacingAfter: {
                      type: "number",
                      description: "Spacing after paragraph in twips",
                    },
                    lineSpacing: {
                      type: "number",
                      description: "Line spacing multiplier",
                    },
                  },
                },
                table: {
                  type: "object",
                  description: "Table styling options",
                  properties: {
                    borderColor: {
                      type: "string",
                      description: "Border color as hex",
                    },
                    borderStyle: {
                      type: "string",
                      enum: ["single", "double", "dotted", "dashed"],
                    },
                    borderWidth: {
                      type: "number",
                      description: "Border width in points",
                    },
                  },
                },
              },
            },
            outputPath: {
              type: "string",
              description:
                "Absolute or relative file path where the DOCX file will be written to disk. The directory will be created automatically if it doesn't exist.",
            },
            enforceDocsFolder: {
              type: "boolean",
              description:
                "Whether to enforce docs/ folder for organized file structure (default: true).",
            },
            preventDuplicates: {
              type: "boolean",
              description:
                "Whether to prevent duplicate file creation (default: true). Appends _1, _2, etc. if file exists.",
            },
            dryRun: {
              type: "boolean",
              description:
                "When true, returns a preview of the document that would be created WITHOUT writing any file to disk. Use this to show the user what will be created before committing. Default: false.",
            },
          },
          required: ["title"],
        },
      },
      {
        name: "create-excel",
        description:
          "Creates an Excel XLSX workbook on DISK with multiple sheets and data. " +
          "USER CONFIRMATION REQUIRED: This tool writes files to disk. ALWAYS describe to the user what spreadsheet you plan to create (sheets, columns, data summary) and get their explicit confirmation BEFORE calling this tool. Never call create-excel without the user's approval. Use dryRun: true to generate a preview first. " +
          "CONTENT RULES: Do NOT include markdown syntax in cell values. No **, *, #, -, backticks. Write plain data values. Any markdown will be automatically stripped. " +
          "CONSOLIDATION: Organize all data into well-structured sheets before creating. Use clear column headers. Group related data into logical sheets rather than creating multiple workbooks. " +
          "READ FIRST: If appending data to an existing spreadsheet, use get-doc-indepth to read the current contents first, then use edit-excel to add new data rather than creating a duplicate file. " +
          "ORGANIZATION: The tool enforces docs/ folder by default. EXTENSION: Enforces .xlsx extension. Supports 7 style presets with optimized header backgrounds and colors.",
        inputSchema: {
          type: "object",
          properties: {
            sheets: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  name: { type: "string" },
                  data: { type: "array", items: { type: "array" } },
                },
                required: ["name", "data"],
              },
              description:
                "Array of sheet definitions. Write plain data values without markdown syntax.",
            },
            stylePreset: {
              type: "string",
              enum: [
                "minimal",
                "professional",
                "technical",
                "legal",
                "business",
                "casual",
                "colorful",
              ],
              description:
                "Style preset name: minimal (clean/basic), professional (Garamond serif, full justification), technical (Arial, optimized readability), legal (Times New Roman, double-spaced), business (Calibri, modern blue palette), casual (Verdana, warm colors), colorful (vibrant, visual impact). Default: minimal.",
            },
            style: {
              type: "object",
              description: "Custom styling options (overrides stylePreset)",
              properties: {
                font: {
                  type: "object",
                  description: "Font styling options",
                  properties: {
                    size: {
                      type: "number",
                      description: "Font size in points",
                    },
                    color: {
                      type: "string",
                      description: "Font color as hex (e.g., 'FF0000')",
                    },
                    bold: { type: "boolean" },
                    italics: { type: "boolean" },
                    underline: { type: "boolean" },
                  },
                },
                columnWidths: {
                  type: "object",
                  description: "Map of column indices to widths in characters",
                  patternProperties: { "\\d+": { type: "number" } },
                },
                rowHeights: {
                  type: "object",
                  description: "Map of row indices to heights in points",
                  patternProperties: { "\\d+": { type: "number" } },
                },
                headerBold: { type: "boolean" },
              },
            },
            outputPath: {
              type: "string",
              description:
                "Absolute or relative file path where the XLSX file will be written to disk.",
            },
            enforceDocsFolder: {
              type: "boolean",
              description:
                "Whether to enforce docs/ folder for organized file structure (default: true).",
            },
            preventDuplicates: {
              type: "boolean",
              description:
                "Whether to prevent duplicate file creation (default: true). Appends _1, _2, etc. if file exists.",
            },
            dryRun: {
              type: "boolean",
              description:
                "When true, returns a preview of the workbook that would be created WITHOUT writing any file to disk. Use this to show the user what will be created before committing. Default: false.",
            },
          },
          required: ["sheets"],
        },
      },
      {
        name: "edit-doc",
        description:
          "Edits an existing Word DOCX document by appending new content or replacing all content. " +
          "USER CONFIRMATION REQUIRED: This tool modifies files on disk. ALWAYS describe what changes you plan to make and get the user's explicit confirmation BEFORE calling this tool. " +
          "READ FIRST: ALWAYS use get-doc-indepth to read the existing document BEFORE editing it. You must understand what content is already there to avoid duplication and ensure the edit makes sense. " +
          "CONTENT RULES: Do NOT include markdown syntax in paragraph text. Write clean prose. Any markdown will be automatically converted to proper DOCX formatting. " +
          "ACTIONS: Use action 'append' to add new paragraphs and tables after existing content. Use action 'replace' to overwrite all content (keeping the same file path). " +
          "NOTE: Append mode preserves existing text content but may not preserve complex original formatting (images, custom styles). For best results when appending, provide content that works well as a continuation.",
        inputSchema: {
          type: "object",
          properties: {
            filePath: {
              type: "string",
              description: "Path to the existing DOCX file to edit",
            },
            action: {
              type: "string",
              enum: ["append", "replace"],
              description:
                "Edit action: 'append' adds content after existing text, 'replace' overwrites all content",
            },
            paragraphs: {
              type: "array",
              items: { type: "string" },
              description:
                "Paragraphs to append or replace with. Write clean prose without markdown.",
            },
            tables: {
              type: "array",
              items: {
                type: "array",
                items: { type: "array", items: { type: "string" } },
              },
              description:
                "Tables to append or replace with (each table is a 2D array)",
            },
            title: {
              type: "string",
              description: "New document title (only used in replace mode)",
            },
            stylePreset: {
              type: "string",
              enum: [
                "minimal",
                "professional",
                "technical",
                "legal",
                "business",
                "casual",
                "colorful",
              ],
              description: "Style preset for new content. Default: minimal.",
            },
          },
          required: ["filePath", "action"],
        },
      },
      {
        name: "edit-excel",
        description:
          "Edits an existing Excel XLSX workbook by appending rows, adding new sheets, or replacing sheet data. " +
          "USER CONFIRMATION REQUIRED: This tool modifies files on disk. ALWAYS describe what changes you plan to make and get the user's explicit confirmation BEFORE calling this tool. " +
          "READ FIRST: ALWAYS use get-doc-indepth to read the existing spreadsheet BEFORE editing it. You must understand the current sheet structure and data to avoid duplication. " +
          "CONTENT RULES: Do NOT include markdown syntax in cell values. Write plain data. Any markdown will be automatically stripped. " +
          "ACTIONS: 'append-rows' adds rows to an existing sheet. 'append-sheet' adds a new sheet to the workbook. 'replace-sheet' replaces all data in an existing sheet.",
        inputSchema: {
          type: "object",
          properties: {
            filePath: {
              type: "string",
              description: "Path to the existing XLSX file to edit",
            },
            action: {
              type: "string",
              enum: ["append-rows", "append-sheet", "replace-sheet"],
              description:
                "Edit action: 'append-rows' adds rows to a sheet, 'append-sheet' adds a new sheet, 'replace-sheet' replaces a sheet's data",
            },
            sheetName: {
              type: "string",
              description:
                "Target sheet name (required for append-rows and replace-sheet)",
            },
            rows: {
              type: "array",
              items: { type: "array" },
              description:
                "Row arrays to append (for append-rows action). Each row is an array of cell values.",
            },
            sheetData: {
              type: "object",
              description:
                "Sheet definition for append-sheet or replace-sheet actions",
              properties: {
                name: {
                  type: "string",
                  description: "Sheet name (required for append-sheet)",
                },
                data: {
                  type: "array",
                  items: { type: "array" },
                  description: "2D array of cell values",
                },
              },
              required: ["data"],
            },
            stylePreset: {
              type: "string",
              enum: [
                "minimal",
                "professional",
                "technical",
                "legal",
                "business",
                "casual",
                "colorful",
              ],
              description: "Style preset for new content. Default: minimal.",
            },
          },
          required: ["filePath", "action"],
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
      const resolvedPath = path.resolve(params.filePath);

      if (!fs.existsSync(resolvedPath)) {
        log("error", "File not found:", { filePath: resolvedPath });
        return {
          content: [
            {
              type: "text",
              text: `Error: File not found at path: ${params.filePath}`,
            },
          ],
          isError: true,
        };
      }

      // Update param with resolved path
      params.filePath = resolvedPath;
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
            content: [
              {
                type: "text",
                text: JSON.stringify(
                  { ...docResult, message: responseMessage },
                  null,
                  2,
                ),
              },
            ],
          };
        } else {
          return {
            content: [
              { type: "text", text: JSON.stringify(docResult, null, 2) },
            ],
            isError: true,
          };
        }
      }

      case "create-excel": {
        const excelResult = await createExcel(params);
        if (excelResult.success) {
          const responseMessage = excelResult.dryRun
            ? excelResult.message
            : `EXCEL FILE WRITTEN TO DISK at: ${excelResult.filePath}\n\nIMPORTANT: This tool has created an actual .xlsx file on your filesystem. Do NOT create any additional markdown or text files. The workbook is available at the absolute path shown above.`;
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(
                  { ...excelResult, message: responseMessage },
                  null,
                  2,
                ),
              },
            ],
          };
        } else {
          return {
            content: [
              { type: "text", text: JSON.stringify(excelResult, null, 2) },
            ],
            isError: true,
          };
        }
      }

      case "edit-doc": {
        const editDocResult = await editDoc(params);
        if (editDocResult.success) {
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(editDocResult, null, 2),
              },
            ],
          };
        } else {
          return {
            content: [
              { type: "text", text: JSON.stringify(editDocResult, null, 2) },
            ],
            isError: true,
          };
        }
      }

      case "edit-excel": {
        const editExcelResult = await editExcel(params);
        if (editExcelResult.success) {
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(editExcelResult, null, 2),
              },
            ],
          };
        } else {
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(editExcelResult, null, 2),
              },
            ],
            isError: true,
          };
        }
      }

      default:
        log("error", "Unknown tool requested:", { toolName });
        return {
          content: [
            {
              type: "text",
              text: `Unknown tool: ${name}`,
            },
          ],
          isError: true,
        };
    }
  } catch (error) {
    log("error", "Error executing tool:", {
      toolName,
      error: error.message,
      stack: error.stack,
    });
    return {
      content: [
        {
          type: "text",
          text: `Error: ${error.message || "Unknown error occurred"}`,
        },
      ],
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
