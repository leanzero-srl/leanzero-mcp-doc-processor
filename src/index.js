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
          "Get a high-level summary of a document including structure, sections, and content overview. Supports PDF, DOCX, Excel files. Extracts embedded images and includes them in the response.",
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
          "Get a detailed analysis of the document including full text, structure, formatting, metadata, and embedded images. Best used after focused analysis for more detail. Supports PDF, DOCX, Excel files.",
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
          "Perform a focused analysis based on user-specific query. This tool automatically generates clarification questions to understand what aspects interest you, then processes the document accordingly. Supports PDF, DOCX, Excel files with extracted images.",
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
          "Creates a Word DOCX document on DISK with title, paragraphs, tables, headers, and footers. IMPORTANT: This tool WRITES TO FILESYSTEM - it creates an actual .docx file at the specified path (or ./output/document.docx if not provided). The response contains the absolute filePath where the file was created. AI models should NOT create additional markdown or text files - use this returned filePath to reference the created DOCX document. ORGANIZATION: The tool enforces docs/ folder by default (files are automatically placed in project-root/docs/ unless you explicitly specify a different location or set enforceDocsFolder: false). The tool also prevents duplicate files by default (if file exists, it creates file_1.docx, file_2.docx, etc.; set preventDuplicates: false to allow overwrites). EXTENSION: The tool enforces .docx extension regardless of what extension is specified in outputPath (e.g., if you specify file.md, it will create file.docx). Supports 7 style presets (minimal, professional, technical, legal, business, casual, colorful) with comprehensive typography options including font selection, heading levels, text justification, and refined color schemes. Default: minimal.",
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
              description: "Array of paragraph strings",
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
                "Absolute or relative file path where the DOCX file will be written to disk. The directory will be created automatically if it doesn't exist. IMPORTANT: This is NOT a return value - this specifies WHERE to create the file. The actual created filePath is returned in the response.",
            },
            enforceDocsFolder: {
              type: "boolean",
              description:
                "Whether to enforce docs/ folder for organized file structure (default: true). When true, files are automatically placed in project-root/docs/ directory for better organization. Set to false if you need to place files in a specific location outside docs/. The tool will log when this enforcement is applied.",
            },
            preventDuplicates: {
              type: "boolean",
              description:
                "Whether to prevent duplicate file creation (default: true). When true and a file with the same name already exists, the tool automatically appends _1, _2, etc. to the filename (e.g., report.docx becomes report_1.docx). Set to false to allow overwriting existing files. The tool will log when duplicate prevention is triggered.",
            },
          },
          required: ["title"],
        },
      },
      {
        name: "create-excel",
        description:
          "Creates an Excel XLSX workbook on DISK with multiple sheets and data. IMPORTANT: This tool WRITES TO FILESYSTEM - it creates an actual .xlsx file at the specified path (or ./output/data.xlsx if not provided). The response contains the absolute filePath where the file was created. AI models should NOT create additional markdown or text files - use this returned filePath to reference the created Excel document. ORGANIZATION: The tool enforces docs/ folder by default (files are automatically placed in project-root/docs/ unless you explicitly specify a different location or set enforceDocsFolder: false). The tool also prevents duplicate files by default (if file exists, it creates file_1.xlsx, file_2.xlsx, etc.; set preventDuplicates: false to allow overwrites). EXTENSION: The tool enforces .xlsx extension regardless of what extension is specified in outputPath (e.g., if you specify file.txt, it will create file.xlsx). Supports column widths, row heights, and 7 style presets (minimal, professional, technical, legal, business, casual, colorful) with optimized header backgrounds and colors for each preset type.",
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
              description: "Array of sheet definitions",
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
                "Absolute or relative file path where the XLSX file will be written to disk. The directory will be created automatically if it doesn't exist. IMPORTANT: This is NOT a return value - this specifies WHERE to create the file. The actual created filePath is returned in the response.",
            },
            enforceDocsFolder: {
              type: "boolean",
              description:
                "Whether to enforce docs/ folder for organized file structure (default: true). When true, files are automatically placed in project-root/docs/ directory for better organization. Set to false if you need to place files in a specific location outside docs/. The tool will log when this enforcement is applied.",
            },
            preventDuplicates: {
              type: "boolean",
              description:
                "Whether to prevent duplicate file creation (default: true). When true and a file with the same name already exists, the tool automatically appends _1, _2, etc. to the filename (e.g., report.xlsx becomes report_1.xlsx). Set to false to allow overwriting existing files. The tool will log when duplicate prevention is triggered.",
            },
          },
          required: ["sheets"],
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
    // Validate file path exists for all tools
    if (params && params.filePath) {
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

      case "create-doc":
        const docResult = await createDoc(params);
        if (docResult.success) {
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(
                  {
                    ...docResult,
                    message: `DOCX FILE WRITTEN TO DISK at: ${docResult.filePath}\n\nIMPORTANT: This tool has created an actual .docx file on your filesystem. Do NOT create any additional markdown or text files. The document is available at the absolute path shown above.`,
                  },
                  null,
                  2,
                ),
              },
            ],
          };
        } else {
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(docResult, null, 2),
              },
            ],
            isError: true,
          };
        }

      case "create-excel":
        const excelResult = await createExcel(params);
        if (excelResult.success) {
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(
                  {
                    ...excelResult,
                    message: `EXCEL FILE WRITTEN TO DISK at: ${excelResult.filePath}\n\nIMPORTANT: This tool has created an actual .xlsx file on your filesystem. Do NOT create any additional markdown or text files. The workbook is available at the absolute path shown above.`,
                  },
                  null,
                  2,
                ),
              },
            ],
          };
        } else {
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(excelResult, null, 2),
              },
            ],
            isError: true,
          };
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
