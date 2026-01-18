import { documentProcessor } from "../services/document-processor.js";
import { analysisService } from "../services/analysis-service.js";
import { imageProcessor } from "../utils/image-processor.js";
import { log, logFunctionCall, logPath } from "../utils/logger.js";

// Store context for documents to support follow-up queries
const documentContext = new Map();

/**
 * Handle focused analysis request
 * @param {Object} params - Tool parameters (filePath)
 * @param {string} userQuery - Optional user query
 * @param {string} context - Optional context
 * @returns {Object} Tool response
 */
export async function handleFocused(params, userQuery, context) {
  logFunctionCall("handleFocused", {
    params,
    hasUserQuery: !!userQuery,
    hasContext: !!context,
  });

  if (userQuery && userQuery.trim().length > 0) {
    logPath("PATH_FOCUSED_WITH_QUERY");
  } else {
    logPath("PATH_FOCUSED_NO_QUERY_GENERATING_QUESTIONS");
  }

  // First generate summary to understand the document
  log("info", "Getting document summary for focused analysis:", {
    filePath: params.filePath,
  });
  const result = await documentProcessor.processDocument(
    params.filePath,
    "summary",
  );

  if (!result.success) {
    logPath("PATH_FOCUSED_PROCESS_FAILED");
    log("warn", "handleFocused failed to process document:", {
      error: result.error,
    });
    return {
      content: [
        { type: "text", text: result.error || "Failed to process document" },
      ],
    };
  }

  const images = Array.isArray(result.images) ? result.images : [];
  const textContent = result.text || "";

  log("info", "Document processed:", {
    textLength: textContent.length,
    imageCount: images.length,
  });

  // Check if we have a user query (meaning user has responded to questions)
  if (userQuery && userQuery.trim().length > 0) {
    logPath("PATH_FOCUSED_ANALYSIS_WITH_QUERY");
    // Perform focused analysis based on user's query
    log("info", "Performing focused analysis with user query:", {
      userQuery: userQuery.substring(0, 50),
    });

    let analysis = "Focused Analysis\n================\n\n";

    analysis += `Analysis based on your query: "${userQuery}"\n\n`;

    // Add context if provided
    if (context && context.trim().length > 0) {
      analysis += `Context: ${context}\n\n`;
    }

    // Store document context for potential follow-up
    const docId = params.filePath;
    documentContext.set(docId, {
      text: textContent,
      images: images,
      metadata: result.metadata,
      lastQuery: userQuery,
    });
    log("info", "Stored document context for follow-up:", { docId });

    // Generate relevant content based on query
    analysis += `Analyzing document for information related to your query...\n\n`;

    // Look for relevant content (simple keyword matching)
    const queryKeywords = userQuery
      .toLowerCase()
      .split(/\s+/)
      .filter((k) => k.length > 3);
    log("info", "Keywords for search:", { keywords: queryKeywords });

    const lines = textContent.split("\n");
    const relevantLines = lines.filter((line) => {
      const lowerLine = line.toLowerCase();
      return queryKeywords.some((keyword) => lowerLine.includes(keyword));
    });

    log("info", "Keyword search results:", {
      matchingLines: relevantLines.length,
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
      const structure = await getStructure(textContent);
      if (structure && structure.length > 0) {
        logPath("PATH_FOCUSED_USING_STRUCTURE");
        structure.slice(0, 15).forEach((item) => {
          if (item.isHeader) {
            analysis += `  - ${item.text}\n`;
          }
        });
      }
    }

    // Mention images if relevant
    if (images.length > 0) {
      const imageSummary = imageProcessor.createImageSummary(images);
      if (imageSummary && typeof imageSummary === "string") {
        analysis += `\n\n${imageSummary}`;
      }
      analysis += `\nNote: Images have been extracted and can be processed separately if needed.\n`;
    }

    analysis += `\n\nYou can request more details by using the "get-doc-indepth" tool, or ask another question to refine the analysis.`;

    log("info", "handleFocused completed with user query");
    return {
      content: [
        {
          type: "text",
          text: analysis || "Unable to generate focused analysis",
        },
      ],
    };
  }

  // No query yet - generate clarification questions
  logPath("PATH_FOCUSED_GENERATING_QUESTIONS");
  log("info", "No user query, generating clarification questions");
  const questions = analysisService.generateClarificationQuestions(
    textContent,
    images,
  );
  let responseText = "Document Analysis\n=================\n\n";

  // Provide document overview
  responseText += `File: ${params.filePath}\n`;
  responseText += `Content Length: ${textContent.length} characters\n`;
  responseText += `Images Found: ${images.length}\n\n`;

  if (questions.length > 0) {
    log("info", "Generated questions:", { count: questions.length });
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

    responseText += `Please provide your answers or describe what you'd like to know about this document. For example:\n`;
    responseText += `  - "Focus on section 3.2"\n`;
    responseText += `  - "Tell me about liability clauses"\n`;
    responseText += `  - "Analyze the tables and images"\n`;
  } else {
    log("info", "No questions generated, short document");
    responseText +=
      "Document processed. The document appears to be short and straightforward. Please specify what you'd like to know, or use 'get-doc-indepth' for full details.";
  }

  log("info", "handleFocused completed with clarification questions");
  return {
    content: [
      { type: "text", text: responseText || "Unable to generate response" },
    ],
  };
}

/**
 * Get basic structure of the content for fallback analysis
 * @param {string} content - Text content
 * @returns {Promise<Array>} Structure items
 */
async function getStructure(content) {
  const lines = content.split("\n");

  // Remove empty lines and whitespace-only lines
  const nonEmptyLines = lines.filter((line) => line.trim().length > 0);

  // Identify potential headers based on patterns
  const structure = nonEmptyLines.map((line) => ({
    text: line.trim(),
    isHeader: isLikelyHeader(line),
    level: guessHeadingLevel(line),
  }));

  return structure;
}

/**
 * Determine if a line is likely a header based on patterns
 */
function isLikelyHeader(line) {
  const trimmed = line.trim();

  // All caps and not too long
  if (/^[A-Z\s\d\-\.,;:]+$/.test(trimmed) && trimmed.length < 50) {
    return true;
  }

  // Ends with colon
  if (trimmed.endsWith(":")) {
    return true;
  }

  // Numbered heading pattern (1.1, 1.2, etc.)
  if (/^\d+(\.\d+)*\s/.test(trimmed)) {
    return true;
  }

  // Looks like a section title
  if (/^[A-Z][a-z]+(?:\s[A-Z][a-z]+)+$/.test(trimmed)) {
    return true;
  }

  return false;
}

/**
 * Guess heading level based on text formatting
 */
function guessHeadingLevel(line) {
  const trimmed = line.trim();
  const indent = line.length - trimmed.length;

  // Less indentation means higher level heading
  const level = Math.ceil(indent / 4);

  // Clamp to valid heading levels (1-6)
  return Math.max(1, Math.min(level, 6));
}
