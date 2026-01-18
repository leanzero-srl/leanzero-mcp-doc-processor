import { PdfParser } from "../parsers/pdf-parser.js";
import { DocxParser } from "../parsers/docx-parser.js";
import { ExcelParser } from "../parsers/excel-parser.js";
import { FileTypeDetector } from "../utils/file-detector.js";
import { log, logFunctionCall, logPath } from "../utils/logger.js";

/**
 * Document Processor Service
 * Handles the high-level coordination of document parsing and content extraction.
 * Selects the appropriate parser based on file type and manages the processing flow.
 */
export class DocumentProcessor {
  constructor() {
    this.name = "DocumentProcessor";
    this.pdfParser = new PdfParser();
    this.docxParser = new DocxParser();
    this.excelParser = new ExcelParser();
    this.fileDetector = new FileTypeDetector();
  }

  /**
   * Get appropriate parser for file type
   * @param {string} fileType - Detected file type
   * @returns {Object|null} Parser instance or null if not found
   */
  getParserForType(fileType) {
    logFunctionCall("getParserForType", { fileType });

    const parser = (() => {
      switch (fileType) {
        case "pdf":
          return this.pdfParser;

        case "docx":
          return this.docxParser;

        case "excel":
          return this.excelParser;

        default:
          log("warn", "No parser available for file type:", { fileType });
          return null;
      }
    })();

    log("info", "Parser selection:", { fileType, parserFound: !!parser });
    return parser;
  }

  /**
   * Process a document based on the requested type
   * @param {string} filePath - Path to the file
   * @param {string} processingType - Type of processing ('summary', 'indepth')
   * @returns {Promise<Object>} Processing result
   */
  async processDocument(filePath, processingType) {
    logFunctionCall("processDocument", { filePath, processingType });
    logPath("ENTER_PROCESS_DOCUMENT", `type=${processingType}`);

    // Detect file type
    const detected = this.fileDetector.detect(filePath);
    log("info", "File type detection result:", {
      filePath,
      detected: detected.success ? `success (${detected.fileType})` : "failed",
    });

    if (!detected.success) {
      logPath("PATH_DETECTION_FAILED");
      return { success: false, error: "Could not detect file type" };
    }

    const parser = this.getParserForType(detected.fileType);

    if (!parser) {
      logPath("PATH_NO_PARSER", `fileType=${detected.fileType}`);
      return {
        success: false,
        error: `No parser available for type ${detected.fileType}`,
      };
    }

    log("info", "Parsing document with parser:", {
      filePath,
      processingType,
      parserName: parser.constructor.name,
    });

    let result;
    switch (processingType) {
      case "summary":
        logPath("PATH_SUMMARY_PROCESSING");
        log("info", "Processing as summary - calling parser.parse()");
        result = await parser.parse(filePath);
        break;

      case "indepth":
        logPath("PATH_INDEPTH_PROCESSING");
        log("info", "Processing as in-depth - calling parser.parse()");
        result = await parser.parse(filePath);

        // Try to get structure if the parser supports it
        const contentText = result.text || "";
        let structure = null;

        if (typeof parser.getStructure === "function") {
          logPath("PATH_PARSER_HAS_GET_STRUCTURE");
          log("info", "Parser supports getStructure, extracting structure");
          structure = await parser.getStructure(contentText);
        }

        log("info", "In-depth processing result:", {
          hasText: !!result.text,
          textLength: contentText.length,
          structureCount: structure ? structure.length : 0,
          imageCount: result.images?.length || 0,
        });

        return {
          success: result.success,
          text: result.text || "",
          structure,
          images: result.images || [],
          metadata: result.metadata || null,
        };
      default:
        logPath("PATH_UNKNOWN_PROCESSING_TYPE", `type=${processingType}`);
        log("warn", "Unknown processing type:", { processingType });
        return {
          success: false,
          error: `Unknown processing type ${processingType}`,
        };
    }

    log("info", "Summary processing result:", {
      success: result.success,
      textLength: (result.text || "").length,
      imageCount: result.images?.length || 0,
    });

    return {
      success: result.success,
      text: result.text || "",
      images: result.images || [],
      metadata: result.metadata || null,
    };
  }
}

// Export singleton instance
export const documentProcessor = new DocumentProcessor();
