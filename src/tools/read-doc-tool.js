/**
 * Unified document reading tool.
 *
 * Consolidates get-doc-summary, get-doc-indepth, and get-doc-focused into
 * a single handler with a `mode` parameter. Old tool names are kept as
 * backward-compatible aliases in the CallToolRequestSchema switch.
 */

import fs from "fs";
import path from "path";
import os from "os";

import { documentProcessor } from "../services/document-processor.js";
import { analysisService } from "../services/analysis-service.js";
import { imageProcessor } from "../utils/image-processor.js";
import { log, logFunctionCall, logPath } from "../utils/logger.js";
import { recordRead } from "../services/lineage-tracker.js";
import { classifyDocumentContent } from "../utils/categorizer.js";

// Store context for documents to support follow-up queries (focused mode)
const documentContext = new Map();

/**
 * Fetch a remote document (one-shot capability) and write it to a per-call temp dir.
 * Caller MUST clean up the returned tempDir via fs.rm in a finally block.
 * Security: never logs authHeader; never caches; never follows redirects; https only.
 *
 * @param {string} url - HTTPS URL returning JSON of shape {data:base64, filename, mimeType, size}
 * @param {string} authHeader - Value for the Authorization header (e.g. "Bearer abc123")
 * @param {string} [suggestedFilename] - Fallback filename if response omits one
 * @returns {Promise<{tempPath:string, tempDir:string, mimeType?:string, originalFilename?:string}>}
 */
export async function fetchToTempFile(url, authHeader, suggestedFilename) {
  if (!/^https:\/\//i.test(url)) {
    throw new Error("read-doc URL must use https://");
  }

  // Safe-to-log breadcrumb: host + path only — never the ?t= token or auth header.
  let safeUrl;
  try {
    const u = new URL(url);
    safeUrl = `${u.host}${u.pathname}`;
  } catch {
    throw new Error("read-doc URL is not parseable");
  }
  log("info", "read-doc remote fetch", { url: safeUrl });

  const resp = await fetch(url, {
    method: "GET",
    headers: { Authorization: authHeader, Accept: "application/json" },
    redirect: "error",
    signal: AbortSignal.timeout(30_000),
  });

  if (!resp.ok) {
    // Do NOT auto-retry — 401 = wrong bearer (caller error), 404 = consumed/expired (single-use).
    const bodyPreview = await resp.text().catch(() => "");
    throw new Error(`read-doc fetch failed: HTTP ${resp.status} ${bodyPreview.slice(0, 200)}`);
  }

  const ct = resp.headers.get("Content-Type") || "";
  if (!/json/i.test(ct)) {
    throw new Error(`read-doc endpoint returned unexpected Content-Type: ${ct}`);
  }

  const payload = await resp.json();
  if (!payload || typeof payload.data !== "string") {
    throw new Error("read-doc payload missing required 'data' field (base64)");
  }

  const filename = payload.filename || suggestedFilename || `attachment-${Date.now()}.bin`;
  const buffer = Buffer.from(payload.data, "base64");

  const maxBytes = Number(process.env.READ_DOC_MAX_BYTES) || 50 * 1024 * 1024;
  if (buffer.length > maxBytes) {
    throw new Error(`read-doc attachment too large: ${buffer.length} bytes (limit ${maxBytes})`);
  }

  const tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "doc-reader-"));
  const tempPath = path.join(tempDir, filename);
  await fs.promises.writeFile(tempPath, buffer);

  return { tempPath, tempDir, mimeType: payload.mimeType, originalFilename: payload.filename };
}

/**
 * Handle unified document read request.
 *
 * Source resolution: either a local `filePath` OR a remote `url` + `authHeader` pair.
 * In the URL case the helper fetches a JSON envelope, materializes the binary to a
 * per-call temp dir, runs the existing pipeline, and cleans up regardless of outcome.
 *
 * @param {Object} params - Tool parameters
 * @param {string} [params.filePath] - Path to the document (use this OR url+authHeader)
 * @param {string} [params.url] - HTTPS URL returning {data:base64, filename, mimeType, size}
 * @param {string} [params.authHeader] - Authorization header value (required when url is set)
 * @param {string} [params.filename] - Optional filename hint for the temp file extension
 * @param {string} [params.mode="summary"] - Read mode: "summary", "indepth", or "focused"
 * @param {string} [params.userQuery] - User query (focused mode only)
 * @param {string} [params.context] - Additional context (focused mode only)
 * @returns {Object} MCP tool response
 */
export async function handleReadDoc(params) {
  const mode = params.mode || "summary";

  let workingParams = params;
  let tempDirToCleanup = null;

  if (!params.filePath && params.url && params.authHeader) {
    try {
      const fetched = await fetchToTempFile(params.url, params.authHeader, params.filename);
      workingParams = { ...params, filePath: fetched.tempPath };
      tempDirToCleanup = fetched.tempDir;
    } catch (err) {
      log("warn", "read-doc remote fetch rejected:", { error: err.message });
      return {
        content: [{ type: "text", text: err.message }],
        isError: true,
      };
    }
  } else if (!params.filePath) {
    return {
      content: [{ type: "text", text: "read-doc requires either filePath OR url+authHeader" }],
      isError: true,
    };
  }

  // logFunctionCall must NOT include authHeader — log only filePath/mode/remote flag.
  logFunctionCall("handleReadDoc", { filePath: workingParams.filePath, mode, remote: !!params.url });

  try {
    switch (mode) {
      case "summary":
        return await handleSummary(workingParams);
      case "indepth":
        return await handleInDepth(workingParams);
      case "focused":
        return await handleFocused(workingParams, workingParams.userQuery, workingParams.context);
      default:
        return {
          content: [{ type: "text", text: `Unknown read mode: "${mode}". Use "summary", "indepth", or "focused".` }],
          isError: true,
        };
    }
  } finally {
    if (tempDirToCleanup) {
      try {
        await fs.promises.rm(tempDirToCleanup, { recursive: true, force: true });
      } catch {
        // best-effort cleanup
      }
    }
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
      isError: true,
    };
  }

  const metadata = result.metadata || {};
  const images = Array.isArray(result.images) ? result.images : [];

  let summary = "Document Summary\n===============\n\n";

  if (result.ocrApplied) {
    summary += `[OCR Applied: Text extracted via ${result.ocrSource}]\n\n`;
  } else if (result.isImageBased) {
    summary += `[Note: Image-based PDF detected. OCR with Vision Provider was not applied.]\n\n`;
  }

  if (metadata.title) summary += `Title: ${metadata.title}\n`;
  if (metadata.author) summary += `Author: ${metadata.author}\n`;
  if (metadata.pageCount) summary += `Page Count: ${metadata.pageCount}\n`;
  if (metadata.sheetCount) summary += `Sheet Count: ${metadata.sheetCount}\n`;

  const fullText = result.text || "";
  const previewText = fullText.substring(0, 500);
  summary += `\nContent Preview:\n${previewText}${fullText.length > 500 ? "..." : ""}`;

  if (images.length > 0) {
    const imageSummary = imageProcessor.createImageSummary(images);
    if (imageSummary && typeof imageSummary === "string") {
      summary += `\n\n${imageSummary}`;
    }
  }

  // Auto-classify the document with confidence
  const classification = classifyDocumentContent(metadata.title || "", result.text || "");

  // Build category info section
  let categorySection = "";
  if (classification.category !== "misc" || classification.scores) {
    categorySection = "\n\n=== Category Classification ===\n";
    categorySection += `Category: ${classification.category}\n`;
    categorySection += `Confidence: ${classification.confidence} (${classification.confidenceExplanation})\n`;
    categorySection += "\nCategory Scores:\n";
    const sortedScores = Object.entries(classification.scores)
      .sort((a, b) => b[1] - a[1]);
    for (const [cat, score] of sortedScores) {
      categorySection += `  ${cat}: ${score}\n`;
    }
    if (classification.topCategories) {
      categorySection += "\nTop 3 Categories:\n";
      for (const catInfo of classification.topCategories) {
        categorySection += `  - ${catInfo.category} (score: ${catInfo.score}${catInfo.isBest ? ", BEST MATCH" : ""})\n`;
      }
    }
  }

  recordRead(params.filePath, "get-doc-summary");
  return { content: [{ type: "text", text: summary + categorySection || "Unable to generate summary" }] };
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
      isError: true,
    };
  }

  let output = "In-Depth Document Analysis\n=========================\n\n";

  if (result.ocrApplied) {
    output += `[OCR Applied: Text extracted via ${result.ocrSource}]\n\n`;
  } else if (result.isImageBased) {
    output += `[Note: Image-based PDF detected. OCR with Vision Provider was not applied.]\n\n`;
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

  // Auto-classify the document with confidence
  const classification = classifyDocumentContent(metadata.title || "", result.text || "");

  // Build category info section
  let categorySection = "";
  if (classification.category !== "misc" || classification.scores) {
    categorySection = "\n\n=== Category Classification ===\n";
    categorySection += `Category: ${classification.category}\n`;
    categorySection += `Confidence: ${classification.confidence} (${classification.confidenceExplanation})\n`;
    categorySection += "\nCategory Scores:\n";
    const sortedScores = Object.entries(classification.scores)
      .sort((a, b) => b[1] - a[1]);
    for (const [cat, score] of sortedScores) {
      categorySection += `  ${cat}: ${score}\n`;
    }
    if (classification.topCategories) {
      categorySection += "\nTop 3 Categories:\n";
      for (const catInfo of classification.topCategories) {
        categorySection += `  - ${catInfo.category} (score: ${catInfo.score}${catInfo.isBest ? ", BEST MATCH" : ""})\n`;
      }
    }
  }

  recordRead(params.filePath, "get-doc-indepth");
  return { content: [{ type: "text", text: output + categorySection || "Unable to generate in-depth analysis" }] };
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
      isError: true,
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
