import { documentProcessor } from "../services/document-processor.js";
import { imageProcessor } from "../utils/image-processor.js";
import { log, logFunctionCall } from "../utils/logger.js";

/**
 * Handle in-depth analysis request
 * @param {Object} params - Tool parameters (filePath)
 * @returns {Object} Tool response
 */
export async function handleInDepth(params) {
  console.error(
    `[MCP] ==================== TOOL CALLED: handleInDepth ====================`,
  );
  console.error(`[MCP] Parameters: ${JSON.stringify(params)}`);
  logFunctionCall("handleInDepth", params);
  log("info", "Processing file for in-depth analysis:", {
    filePath: params.filePath,
  });

  const result = await documentProcessor.processDocument(
    params.filePath,
    "indepth",
  );

  log("info", "handleInDepth result:", {
    success: result.success,
    hasError: !!result.error,
  });

  if (!result.success) {
    log("warn", "handleInDepth failed:", { error: result.error });
    return {
      content: [
        { type: "text", text: result.error || "Failed to process document" },
      ],
    };
  }

  let output = "In-Depth Document Analysis\n=========================\n\n";

  // Indicate if OCR was applied
  if (result.ocrApplied) {
    output += `[OCR Applied: Text extracted via ${result.ocrSource}]\n\n`;
    log("info", "OCR was applied:", { source: result.ocrSource });
  } else if (result.isImageBased) {
    output += `[Note: Image-based PDF detected. OCR with Vision Provider was not applied.\n\n`;
    log("warn", "Image-based PDF detected, but OCR was not applied");
  }

  // Add document content
  output += `=== Document Content ===\n${result.text || ""}\n\n`;

  // Add structure if available
  if (result.structure && result.structure.length > 0) {
    log("info", "Adding document structure:", {
      itemCount: result.structure.length,
    });
    output += `=== Document Structure ===\n`;
    result.structure.forEach((item) => {
      const headerMark = item.isHeader ? "# " : "  ";
      output += `${headerMark}[L${item.level}] ${item.text}\n`;
    });
    output += "\n";
  }

  // Add metadata
  const metadata = result.metadata || {};
  if (Object.keys(metadata).length > 0) {
    log("info", "Adding metadata:", { keyCount: Object.keys(metadata).length });
    output += `=== Metadata ===\n`;
    Object.entries(metadata).forEach(([key, value]) => {
      if (value !== null && value !== undefined) {
        output += `${key}: ${value}\n`;
      }
    });
    output += "\n";
  }

  // Add images
  const images = Array.isArray(result.images) ? result.images : [];
  if (images.length > 0) {
    log("info", "Adding image information:", { imageCount: images.length });
    output += `=== Images ===\n`;
    const imageSummary = imageProcessor.createImageSummary(images);
    if (imageSummary && typeof imageSummary === "string") {
      output += imageSummary;
    }
  }

  log("info", "handleInDepth completed successfully");
  return {
    content: [
      { type: "text", text: output || "Unable to generate in-depth analysis" },
    ],
  };
}
