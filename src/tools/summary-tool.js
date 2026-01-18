import { documentProcessor } from "../services/document-processor.js";
import { imageProcessor } from "../utils/image-processor.js";
import { log, logFunctionCall } from "../utils/logger.js";

/**
 * Handle document summary request
 * @param {Object} params - Tool parameters (filePath)
 * @returns {Object} Tool response
 */
export async function handleSummary(params) {
  console.error(
    `[MCP] ==================== TOOL CALLED: handleSummary ====================`,
  );
  console.error(`[MCP] Parameters: ${JSON.stringify(params)}`);
  logFunctionCall("handleSummary", params);
  log("info", "Processing file for summary:", { filePath: params.filePath });

  // Use the document processor service to handle parsing
  const result = await documentProcessor.processDocument(
    params.filePath,
    "summary",
  );

  log("info", "handleSummary result:", {
    success: result.success,
    hasError: !!result.error,
  });

  if (!result.success) {
    log("warn", "handleSummary failed:", { error: result.error });
    return {
      content: [
        { type: "text", text: result.error || "Failed to process document" },
      ],
    };
  }

  // Format the summary
  const metadata = result.metadata || {};
  const images = Array.isArray(result.images) ? result.images : [];

  let summary = "Document Summary\n===============\n\n";

  // Indicate if OCR was applied (if supported by the parser/processor)
  if (result.ocrApplied) {
    summary += `[OCR Applied: Text extracted via ${result.ocrSource}]\n\n`;
    log("info", "OCR was applied:", { source: result.ocrSource });
  } else if (result.isImageBased) {
    summary += `[Note: Image-based PDF detected. OCR with Vision Provider was not applied.\n\n`;
    log("warn", "Image-based PDF detected, but OCR was not applied");
  }

  // Add metadata
  if (metadata.title) {
    summary += `Title: ${metadata.title}\n`;
    log("info", "Adding title to summary:", { title: metadata.title });
  }

  if (metadata.author) {
    summary += `Author: ${metadata.author}\n`;
    log("info", "Adding author to summary:", { author: metadata.author });
  }

  if (metadata.pageCount) {
    summary += `Page Count: ${metadata.pageCount}\n`;
  }

  if (metadata.sheetCount) {
    summary += `Sheet Count: ${metadata.sheetCount}\n`;
  }

  // Truncate text for summary view
  const previewText = (result.text || "").substring(0, 500);
  summary += `\nContent Preview:\n${previewText}${result.text.length > 500 ? "..." : ""}`;

  // Add image information
  if (images.length > 0) {
    log(
      "info",
      `Document contains ${images.length} images, adding image summary`,
    );
    const imageSummary = imageProcessor.createImageSummary(images);
    if (imageSummary && typeof imageSummary === "string") {
      summary += `\n\n${imageSummary}`;
    }
  }

  log("info", "handleSummary completed successfully");
  return {
    content: [{ type: "text", text: summary || "Unable to generate summary" }],
  };
}
