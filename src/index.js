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
          "Create a DOCX document with title, paragraphs, and tables. Generated file can be used for reports or templates.",
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
              enum: ["minimal", "professional", "colorful"],
              description: "Name of style preset to use (default: minimal)",
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
              description: "Output file path (default: ./output/document.docx)",
            },
          },
          required: ["title"],
        },
      },
      {
        name: "create-excel",
        description:
          "Create an Excel workbook with multiple sheets and data. Supports column widths, row heights, and comprehensive styling options.",
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
              enum: ["minimal", "professional", "colorful"],
              description: "Name of style preset to use (default: minimal)",
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
              description: "Output file path (default: ./output/data.xlsx)",
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
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(docResult, null, 2),
            },
          ],
          isError: !docResult.success,
        };

      case "create-excel":
        const excelResult = await createExcel(params);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(excelResult, null, 2),
            },
          ],
          isError: !excelResult.success,
        };

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
