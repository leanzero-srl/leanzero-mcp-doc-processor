/**
 * Unified document reading tool.
 *
 * Consolidates get-doc-summary, get-doc-indepth, and get-doc-focused into
 * a single handler with a `mode` parameter. Old tool names are kept as
 * backward-compatible aliases in the CallToolRequestSchema switch.
 */

import { documentProcessor } from "../services/document-processor.js";
import { analysisService } from "../services/analysis-service.js";
import { imageProcessor } from "../utils/image-processor.js";
import { log, logFunctionCall, logPath } from "../utils/logger.js";
import { recordRead } from "../services/lineage-tracker.js";

// Store context for documents to support follow-up queries (focused mode)
const documentContext = new Map();

/**
 * Handle unified document read request.
 *
 * @param {Object} params - Tool parameters
 * @param {string} params.filePath - Path to the document
 * @param {string} [params.mode="summary"] - Read mode: "summary", "indepth", or "focused"
 * @param {string} [params.userQuery] - User query (focused mode only)
 * @param {string} [params.context] - Additional context (focused mode only)
 * @returns {Object} MCP tool response
 */
export async function handleReadDoc(params) {
  const mode = params.mode || "summary";
  logFunctionCall("handleReadDoc", { filePath: params.filePath, mode });

  switch (mode) {
    case "summary":
      return handleSummary(params);
    case "indepth":
      return handleInDepth(params);
    case "focused":
      return handleFocused(params, params.userQuery, params.context);
    default:
      return {
        content: [{ type: "text", text: `Unknown read mode: "${mode}". Use "summary", "indepth", or "focused".` }],
        isError: true,
      };
  }
}

/**
 * Handle document summary request
 */
async function handleSummary(params) {
  log("info", "Processing file for summary:", { filePath: params.filePath });

  const result = await documentProcessor.processDocument(params.filePath, "summary");

  if (!result.success) {
    log("warn", "handleSummary failed:", { error: result.error });
    return {
      content: [{ type: "text", text: result.error || "Failed to process document" }],
    };
  }

  const metadata = result.metadata || {};
  const images = Array.isArray(result.images) ? result.images : [];

  let summary = "Document Summary\n===============\n\n";

  if (result.ocrApplied) {
    summary += `[OCR Applied: Text extracted via ${result.ocrSource}]\n\n`;
  } else if (result.isImageBased) {
    summary += `[Note: Image-based PDF detected. OCR with Vision Provider was not applied.\n\n`;
  }

  if (metadata.title) summary += `Title: ${metadata.title}\n`;
  if (metadata.author) summary += `Author: ${metadata.author}\n`;
  if (metadata.pageCount) summary += `Page Count: ${metadata.pageCount}\n`;
  if (metadata.sheetCount) summary += `Sheet Count: ${metadata.sheetCount}\n`;

  const previewText = (result.text || "").substring(0, 500);
  summary += `\nContent Preview:\n${previewText}${result.text.length > 500 ? "..." : ""}`;

  if (images.length > 0) {
    const imageSummary = imageProcessor.createImageSummary(images);
    if (imageSummary && typeof imageSummary === "string") {
      summary += `\n\n${imageSummary}`;
    }
  }

  recordRead(params.filePath, "get-doc-summary");
  return { content: [{ type: "text", text: summary || "Unable to generate summary" }] };
}

/**
 * Handle in-depth analysis request
 */
async function handleInDepth(params) {
  log("info", "Processing file for in-depth analysis:", { filePath: params.filePath });

  const result = await documentProcessor.processDocument(params.filePath, "indepth");

  if (!result.success) {
    log("warn", "handleInDepth failed:", { error: result.error });
    return {
      content: [{ type: "text", text: result.error || "Failed to process document" }],
    };
  }

  let output = "In-Depth Document Analysis\n=========================\n\n";

  if (result.ocrApplied) {
    output += `[OCR Applied: Text extracted via ${result.ocrSource}]\n\n`;
  } else if (result.isImageBased) {
    output += `[Note: Image-based PDF detected. OCR with Vision Provider was not applied.\n\n`;
  }

  output += `=== Document Content ===\n${result.text || ""}\n\n`;

  if (result.structure && result.structure.length > 0) {
    output += `=== Document Structure ===\n`;
    result.structure.forEach((item) => {
      const headerMark = item.isHeader ? "# " : "  ";
      output += `${headerMark}[L${item.level}] ${item.text}\n`;
    });
    output += "\n";
  }

  const metadata = result.metadata || {};
  if (Object.keys(metadata).length > 0) {
    output += `=== Metadata ===\n`;
    Object.entries(metadata).forEach(([key, value]) => {
      if (value !== null && value !== undefined) {
        output += `${key}: ${value}\n`;
      }
    });
    output += "\n";
  }

  const images = Array.isArray(result.images) ? result.images : [];
  if (images.length > 0) {
    output += `=== Images ===\n`;
    const imageSummary = imageProcessor.createImageSummary(images);
    if (imageSummary && typeof imageSummary === "string") {
      output += imageSummary;
    }
  }

  recordRead(params.filePath, "get-doc-indepth");
  return { content: [{ type: "text", text: output || "Unable to generate in-depth analysis" }] };
}

/**
 * Handle focused analysis request
 */
async function handleFocused(params, userQuery, context) {
  logFunctionCall("handleFocused", { filePath: params.filePath, hasUserQuery: !!userQuery, hasContext: !!context });

  if (userQuery && userQuery.trim().length > 0) {
    logPath("PATH_FOCUSED_WITH_QUERY");
  } else {
    logPath("PATH_FOCUSED_NO_QUERY_GENERATING_QUESTIONS");
  }

  const result = await documentProcessor.processDocument(params.filePath, "summary");

  if (!result.success) {
    logPath("PATH_FOCUSED_PROCESS_FAILED");
    return {
      content: [{ type: "text", text: result.error || "Failed to process document" }],
    };
  }

  recordRead(params.filePath, "get-doc-focused");

  const images = Array.isArray(result.images) ? result.images : [];
  const textContent = result.text || "";

  if (userQuery && userQuery.trim().length > 0) {
    logPath("PATH_FOCUSED_ANALYSIS_WITH_QUERY");

    let analysis = "Focused Analysis\n================\n\n";
    analysis += `Analysis based on your query: "${userQuery}"\n\n`;

    if (context && context.trim().length > 0) {
      analysis += `Context: ${context}\n\n`;
    }

    documentContext.set(params.filePath, {
      text: textContent,
      images,
      metadata: result.metadata,
      lastQuery: userQuery,
    });

    analysis += `Analyzing document for information related to your query...\n\n`;

    const queryKeywords = userQuery.toLowerCase().split(/\s+/).filter((k) => k.length > 3);
    const lines = textContent.split("\n");
    const relevantLines = lines.filter((line) => {
      const lowerLine = line.toLowerCase();
      return queryKeywords.some((keyword) => lowerLine.includes(keyword));
    });

    if (relevantLines.length > 0) {
      analysis += `Found ${relevantLines.length} relevant sections:\n\n`;
      relevantLines.slice(0, 20).forEach((line) => {
        analysis += `  - ${line.trim()}\n`;
      });
      if (relevantLines.length > 20) {
        analysis += `\n  ... and ${relevantLines.length - 20} more sections\n`;
      }
    } else {
      analysis += `No exact matches found for your query, but here's the document structure:\n\n`;
      const structure = getStructure(textContent);
      if (structure && structure.length > 0) {
        logPath("PATH_FOCUSED_USING_STRUCTURE");
        structure.slice(0, 15).forEach((item) => {
          if (item.isHeader) {
            analysis += `  - ${item.text}\n`;
          }
        });
      }
    }

    if (images.length > 0) {
      const imageSummary = imageProcessor.createImageSummary(images);
      if (imageSummary && typeof imageSummary === "string") {
        analysis += `\n\n${imageSummary}`;
      }
      analysis += `\nNote: Images have been extracted and can be processed separately if needed.\n`;
    }

    analysis += `\n\nYou can request more details by using the read-doc tool with mode "indepth", or ask another question to refine the analysis.`;

    return { content: [{ type: "text", text: analysis || "Unable to generate focused analysis" }] };
  }

  // No query yet — generate clarification questions
  logPath("PATH_FOCUSED_GENERATING_QUESTIONS");
  const questions = analysisService.generateClarificationQuestions(textContent, images);
  let responseText = "Document Analysis\n=================\n\n";

  responseText += `File: ${params.filePath}\n`;
  responseText += `Content Length: ${textContent.length} characters\n`;
  responseText += `Images Found: ${images.length}\n\n`;

  if (questions.length > 0) {
    responseText += `To provide the most relevant analysis, please answer the following questions:\n\n`;
    questions.forEach((q, index) => {
      responseText += `${index + 1}. ${q.question}\n`;
      if (q.options) {
        q.options.forEach((opt) => {
          responseText += `   - ${opt}\n`;
        });
      }
      responseText += `\n`;
    });
    responseText += `Please provide your answers or describe what you'd like to know about this document.\n`;
  } else {
    responseText += "Document processed. The document appears to be short and straightforward. Please specify what you'd like to know, or use mode 'indepth' for full details.";
  }

  return { content: [{ type: "text", text: responseText || "Unable to generate response" }] };
}

/**
 * Get basic structure of content for fallback analysis (focused mode).
 */
function getStructure(content) {
  const lines = content.split("\n");
  const nonEmptyLines = lines.filter((line) => line.trim().length > 0);

  return nonEmptyLines.map((line) => ({
    text: line.trim(),
    isHeader: isLikelyHeader(line),
    level: guessHeadingLevel(line),
  }));
}

function isLikelyHeader(line) {
  const trimmed = line.trim();
  if (/^[A-Z\s\d\-\.,;:]+$/.test(trimmed) && trimmed.length < 50) return true;
  if (trimmed.endsWith(":")) return true;
  if (/^\d+(\.\d+)*\s/.test(trimmed)) return true;
  if (/^[A-Z][a-z]+(?:\s[A-Z][a-z]+)+$/.test(trimmed)) return true;
  return false;
}

function guessHeadingLevel(line) {
  const trimmed = line.trim();
  const indent = line.length - trimmed.length;
  const level = Math.ceil(indent / 4);
  return Math.max(1, Math.min(level, 6));
}
