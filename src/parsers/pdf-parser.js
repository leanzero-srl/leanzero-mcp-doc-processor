import fs from "fs";
import { PDFParse } from "pdf-parse";
import { visionService } from "../services/vision-factory.js";
import { DocumentLayoutAnalyzer } from "../services/layout-analyzer.js";
import { OcrPostProcessor } from "../services/ocr-postprocessor.js";
import { TableExtractor } from "../services/table-extractor.js";

/**
 * PDF Parser Module
 * Handles extraction of text and images from PDF documents.
 * Automatically uses a Vision Service (LM Studio or Z.AI) for OCR when text extraction yields minimal results.
 */
export class PdfParser {
  constructor() {
    this.name = "PdfParser";
    // Threshold for considering a PDF as "image-based" (minimal text)
    this.minTextThreshold = 50; // characters;

    // Initialize layout analyzer
    this.layoutAnalyzer = new DocumentLayoutAnalyzer();

    // Initialize OCR post-processor
    this.ocrPostProcessor = new OcrPostProcessor();

    // Initialize table extractor
    this.tableExtractor = new TableExtractor();

    // Option to skip table extraction (to prevent hangs)
    this.skipTableExtraction = process.env.SKIP_TABLE_EXTRACTION !== "false";
  }

  /**
   * Check if a PDF is image-based (has images but minimal text)
   */
  isImageBasedPdf(text, images) {
    const cleanText = (text || "")
      .replace(/\s+/g, "")
      .replace(/--\d+of\d+--/gi, "");
    const hasImages = Array.isArray(images) && images.length > 0;
    const hasMinimalText = cleanText.length < this.minTextThreshold;

    // DIAGNOSTIC: Log the decision criteria
    console.error(
      `[PdfParser] isImageBasedPdf criteria: hasImages=${hasImages}, hasMinimalText=${hasMinimalText} (cleanText.length=${cleanText.length} < ${this.minTextThreshold})`,
    );

    return hasImages && hasMinimalText;
  }

  /**
   * Parse PDF file and extract text content and images
   */
  async parse(filePath) {
    console.error(`[PdfParser] ======== PARSE STARTED ========`);
    console.error(`[PdfParser] File: ${filePath}`);

    let parser;
    try {
      // Read the PDF file as buffer
      const dataBuffer = fs.readFileSync(filePath);

      // Initialize PDF parser
      parser = new PDFParse({ data: dataBuffer });

      // Extract text content
      const textResult = await parser.getText();

      // Extract images from PDF
      const imagesResult = await parser.getImage({
        imageThreshold: 0, // Extract all images regardless of size
        imageDataUrl: true, // Include base64 data URLs
        imageBuffer: true, // Include binary buffers
      });

      // Process and format images
      const processedImages = this.processImages(imagesResult);

      // ANALYZE DOCUMENT LAYOUT BEFORE OCR
      console.error(`[PdfParser] ===== ENTERING LAYOUT ANALYSIS BLOCK =====`);
      const layoutAnalysis =
        await this.layoutAnalyzer.analyzeDocument(filePath);

      if (layoutAnalysis.success) {
        console.error(`[PdfParser] Layout analysis completed successfully`);
        console.error(`[PdfParser] ${layoutAnalysis.layoutSummary}`);
        console.error(
          `[PdfParser] Document structure type: ${layoutAnalysis.structureType}`,
        );
      } else {
        console.error(
          `[PdfParser] Layout analysis failed, proceeding without layout context`,
        );
      }

      // DIAGNOSTIC: Log text and image information
      const cleanText = (textResult.text || "")
        .replace(/\s+/g, "")
        .replace(/--\d+of\d+--/gi, "");
      console.error(
        `[PdfParser] Text extraction: ${cleanText.length} chars (min threshold: ${this.minTextThreshold})`,
      );
      console.error(
        `[PdfParser] Image extraction: ${processedImages.length} embedded images found`,
      );

      // Check if this is an image-based PDF that needs OCR
      const isImageBased =
        this.isImageBasedPdf(textResult.text, processedImages) ||
        (layoutAnalysis.success &&
          layoutAnalysis.structureType === "image-heavy-document");

      console.error(`[PdfParser] ===== IS IMAGE BASED CHECK =====`);
      console.error(`[PdfParser] isImageBasedPdf returned: ${isImageBased}`);
      console.error(
        `[PdfParser] Text length: ${(textResult.text || "").length}`,
      );
      console.error(`[PdfParser] Images found: ${processedImages.length}`);

      // DIAGNOSTIC: Log OCR decision
      console.error(
        `[PdfParser] OCR Decision: isImageBased=${isImageBased}, will${isImageBased ? "" : " NOT"} attempt OCR`,
      );

      let finalText = textResult.text || "";
      let ocrResult = null;
      let extractedTables = [];

      if (isImageBased) {
        console.error(`[PdfParser] ===== ENTERING OCR BLOCK =====`);
        console.error(
          "[PdfParser] Image-based PDF detected, checking for VLM models...",
        );

        // Try to initialize Vision service and find a model
        try {
          console.error(
            `[PdfParser] Calling visionService.initialize() [${visionService.name}]...`,
          );
          await visionService.initialize();
          console.error("[PdfParser] Vision model available, running OCR...");

          // Generate OCR prompt based on layout analysis
          const ocrPrompt = this.generateOcrPrompt(layoutAnalysis);

          // Pass parser to performOcr so it can get page screenshots
          ocrResult = await this.performOcr(parser, processedImages, ocrPrompt);

          if (ocrResult.success) {
            finalText = ocrResult.text;
            console.error("[PdfParser] OCR completed successfully");

            // Post-process the OCR text
            console.error(
              `[PdfParser] ===== ENTERING OCR POST-PROCESSING BLOCK =====`,
            );
            const postProcessingResult =
              await this.ocrPostProcessor.processOcrText(
                finalText,
                layoutAnalysis,
              );
            if (postProcessingResult.success) {
              finalText = postProcessingResult.processedText;
              console.error(
                `[PdfParser] OCR post-processing completed successfully with ${postProcessingResult.improvements.length} improvements`,
              );

              // Store post-processing metadata
              ocrResult.postProcessing = postProcessingResult;
            }
          } else {
            console.error("[PdfParser] OCR failed:", ocrResult.error);
          }
        } catch (error) {
          console.error(`[PdfParser] ===== OCR BLOCK ERROR =====`);
          console.error(
            "[PdfParser] Vision service initialization failed:",
            error.message,
          );
          console.error(`[PdfParser] Error stack: ${error.stack}`);
        }
      } else {
        console.error(`[PdfParser] ===== SKIPPING OCR BLOCK =====`);
        console.error(`[PdfParser] Reason: isImageBased=${isImageBased}`);

        // For text-based PDFs, only apply basic text cleaning (no AI/Vision needed)
        console.error(`[PdfParser] ===== ENTERING TEXT CLEANING BLOCK =====`);
        const postProcessingResult = await this.ocrPostProcessor.processOcrText(
          finalText,
          layoutAnalysis,
          false, // Skip AI processing for text-based PDFs
        );
        if (postProcessingResult.success) {
          finalText = postProcessingResult.processedText;
          console.error(
            `[PdfParser] Text cleaning completed successfully with ${postProcessingResult.improvements.length} improvements`,
          );

          // Store post-processing metadata
          ocrResult = {
            success: false,
            postProcessing: postProcessingResult,
            source: "text-cleaning",
          };
        }
      }

      // Extract tables from the document (runs for both OCR and non-OCR paths)
      console.error(`[PdfParser] ===== ENTERING TABLE EXTRACTION BLOCK =====`);

      if (this.skipTableExtraction) {
        console.warn(
          `[PdfParser] Table extraction SKIPPED (SKIP_TABLE_EXTRACTION=true)`,
        );
        extractedTables = [];
      } else {
        try {
          extractedTables =
            await this.tableExtractor.extractTablesFromPdf(filePath);
          console.error(
            `[PdfParser] Table extraction completed: ${extractedTables.length} tables found`,
          );
        } catch (error) {
          console.error(
            `[PdfParser] Table extraction FAILED (continuing without tables): ${error.message}`,
          );
          extractedTables = [];
        }
      }

      // Clean up parser after processing is done
      console.error(`[PdfParser] ===== CLEANING UP PARSER =====`);
      await parser.destroy();

      console.error(`[PdfParser] ======== PARSE COMPLETE ========`);
      console.error(`[PdfParser] Final text length: ${finalText?.length || 0}`);
      console.error(`[PdfParser] OCR applied: ${!!ocrResult}`);

      return {
        success: true,
        text: finalText,
        pages: textResult.numPages || 0,
        metadata: this.extractMetadata(textResult),
        images: processedImages,
        isImageBased,
        ocrApplied: ocrResult?.success || false,
        ocrSource: ocrResult?.success ? ocrResult.source : null,
        layoutAnalysis: layoutAnalysis.success ? layoutAnalysis : null, // Include layout analysis in result
        ocrPostProcessing: ocrResult?.postProcessing || null, // Include post-processing metadata
        tables: extractedTables || [], // Include extracted tables
        tableCount: (extractedTables || []).length, // Table count for quick reference
      };
    } catch (error) {
      // Clean up parser if it exists
      if (parser) {
        try {
          await parser.destroy();
        } catch (cleanupError) {
          // Ignore cleanup errors
        }
      }
      return {
        success: false,
        error: `Failed to parse PDF: ${error.message || "Unknown error"}`,
        details: this.handleError(error),
      };
    }
  }

  /**
   * Perform OCR on PDF pages using page screenshots (preferred) or embedded images
   * @param {Object} parser - PDFParse instance (for getting screenshots)
   * @param {Array} images - Array of embedded images (fallback)
   * @param {string} customPrompt - Optional custom prompt for OCR (e.g., based on layout analysis)
   * @returns {Promise<Object>} OCR result with extracted text
   */
  async performOcr(parser, images, customPrompt = null) {
    try {
      let pageImages = [];

      // First try to get full page screenshots (best for scanned/image-based PDFs)
      try {
        const screenshots = await parser.getScreenshot();
        if (screenshots && screenshots.pages && screenshots.pages.length > 0) {
          pageImages = screenshots.pages.map((page, i) => ({
            data: page.dataUrl,
            page: i + 1,
            width: page.width,
            height: page.height,
            source: "screenshot",
          }));
          console.error(
            `[PdfParser] Using ${pageImages.length} page screenshot(s) for OCR`,
          );
        }
      } catch (screenshotError) {
        console.error(
          "[PdfParser] Screenshot extraction failed:",
          screenshotError.message,
        );
      }

      // Fall back to embedded images if screenshots failed or are empty
      if (pageImages.length === 0 && images && images.length > 0) {
        pageImages = images.filter((img) => img.data);
        console.error(
          `[PdfParser] Falling back to ${pageImages.length} embedded image(s) for OCR`,
        );
      }

      if (pageImages.length === 0) {
        return { success: false, error: "No images available for OCR" };
      }

      const allText = [];

      for (let i = 0; i < pageImages.length; i++) {
        const image = pageImages[i];

        if (!image.data) {
          console.error(`[PdfParser] Image ${i} has no data, skipping`);
          continue;
        }

        const prompt =
          customPrompt ||
          `Extract all text from this document image (page ${image.page || i + 1}).
This is a scanned document or PDF page. Please:
1. Extract ALL visible text accurately
2. Preserve the document structure (headers, paragraphs, lists, tables)
3. Use markdown formatting for structure
4. If it's an invoice/form, preserve the field labels and values`;

        const result = await visionService.extractText(image.data, prompt);

        if (result.success) {
          allText.push(`--- Page ${image.page || i + 1} ---\n${result.text}`);
        } else {
          console.error(
            `[PdfParser] OCR failed for page ${image.page || i + 1}:`,
            result.error,
          );
        }
      }

      if (allText.length === 0) {
        return { success: false, error: "OCR failed for all pages" };
      }

      return {
        success: true,
        text: allText.join("\n\n"),
        source: visionService.name || "vision-service",
        pagesProcessed: allText.length,
      };
    } catch (error) {
      return {
        success: false,
        error: `OCR processing failed: ${error.message}`,
      };
    }
  }

  /**
   * Extract metadata from PDF parsing result
   */
  extractMetadata(textResult) {
    return {
      title: textResult.infoData?.Title || null,
      author: textResult.infoData?.Author || null,
      subject: textResult.infoData?.Subject || null,
      creator: textResult.infoData?.Creator || null,
      producer: textResult.infoData?.Producer || null,
      creationDate: textResult.infoData?.CreationDate
        ? new Date(textResult.infoData.CreationDate)
        : null,
      modificationDate: textResult.infoData?.ModDate
        ? new Date(textResult.infoData.ModDate)
        : null,
      pageCount: textResult.total || 0,
      fileSize: textResult.infoData?.FileSize || null,
      isEncrypted: textResult.infoData?.Encrypted || false,
    };
  }

  /**
   * Process images extracted from PDF and format them for MCP
   */
  processImages(imagesResult) {
    const images = [];

    if (!imagesResult || !imagesResult.pages) {
      return images;
    }

    // Iterate through all pages and extract images
    for (const page of imagesResult.pages) {
      const pageNumber = page.pageNumber || 0;

      // In pdf-parse v2, images are in the 'images' property
      if (page.images && page.images.length > 0) {
        for (const img of page.images) {
          // Use dataUrl if available (base64 data URL), otherwise convert buffer
          let imageData = img.dataUrl || null;

          // If no dataUrl but we have raw data, convert it
          if (!imageData && img.data) {
            const buffer = Buffer.isBuffer(img.data)
              ? img.data
              : Buffer.from(img.data);
            const mimeType = this.getMimeTypeFromKind(img.kind);
            imageData = `data:${mimeType};base64,${buffer.toString("base64")}`;
          }

          const imageSize = imageData
            ? typeof imageData === "string"
              ? Math.round(imageData.length * 0.75) // Approximate base64 to bytes
              : 0
            : 0;

          images.push({
            data: imageData,
            name: img.name || `image_${pageNumber}_${images.length}`,
            page: pageNumber,
            width: img.width || 0,
            height: img.height || 0,
            mimeType: this.getMimeTypeFromKind(img.kind),
            size: imageSize,
            kind: img.kind || "unknown",
          });
        }
      }
    }

    return images;
  }

  /**
   * Get MIME type from image kind
   * In pdf-parse v2, kind can be a number or string
   */
  getMimeTypeFromKind(kind) {
    // Numeric kind values used by pdf-parse v2
    const numericKindMap = {
      1: "image/jpeg",
      2: "image/png",
      3: "image/gif",
      4: "image/bmp",
      5: "image/tiff",
    };

    // String kind values
    const stringKindMap = {
      jpeg: "image/jpeg",
      jpg: "image/jpeg",
      png: "image/png",
      gif: "image/gif",
      bmp: "image/bmp",
      tiff: "image/tiff",
      webp: "image/webp",
      jpx: "image/jp2",
      jbig2: "image/jbig2",
    };

    if (typeof kind === "number") {
      return numericKindMap[kind] || "image/jpeg";
    }

    if (typeof kind === "string") {
      const normalizedKind = kind.toLowerCase().replace("-", "");
      return stringKindMap[normalizedKind] || "image/jpeg";
    }

    return "image/jpeg";
  }

  /**
   * Generate OCR prompts based on layout analysis
   */
  generateOcrPrompt(layoutAnalysis) {
    let basePrompt = `Extract all text from this document image with high accuracy. Preserve the original formatting and structure as much as possible.

Key instructions:
1. Extract ALL visible text from the image with high accuracy
2. Preserve the original formatting, layout, and structure
3. For documents with tables, maintain table structure using markdown
4. For code snippets, identify the programming language and format appropriately
5. Handle multiple languages if present
6. Note any text that is unclear or partially visible

`;

    // Add layout-specific instructions
    if (layoutAnalysis && layoutAnalysis.success) {
      const structureType = layoutAnalysis.structureType;

      if (structureType === "structured-document") {
        basePrompt += `This document appears to be a structured document with tables and formal structure. Pay special attention to:
- Table structures (preserve columns and rows)
- Headers and footers
- Section boundaries
- Numbered lists and bullet points
- Any structured data like forms or invoices\n`;
      }

      if (structureType === "image-heavy-document") {
        basePrompt += `This document is image-heavy with minimal text. Extract all visible text from images with extreme care:
- Pay attention to small fonts and low-contrast text
- Preserve all spacing and alignment
- Extract any text from charts, graphs, or diagrams
- Note any text that is unclear or partially visible\n`;
      }

      if (structureType === "text-dense-document") {
        basePrompt += `This document is text-dense with many paragraphs. Focus on:
- Preserving paragraph structure
- Maintaining proper line breaks between sections
- Identifying section headers and subheaders
- Keeping the document's hierarchical structure intact\n`;
      }

      // Add table-specific instructions if tables were detected
      const totalTables = layoutAnalysis.pages.reduce(
        (sum, page) => sum + (page.tables?.length || 0),
        0,
      );
      if (totalTables > 0) {
        basePrompt += `IMPORTANT: There are ${totalTables} potential table(s) in this document. Extract them using markdown table format:
- Use | to separate columns
- Use --- to separate header from content
- Preserve all rows even if they appear incomplete
- If cells are merged, indicate this with [merged] or appropriate markdown\n`;
      }
    }

    return basePrompt;
  }

  /**
   * Handle and format parsing errors
   */
  handleError(error) {
    return {
      message: error.message,
      code: error.code || null,
      stack: process.env.NODE_ENV === "development" ? error.stack : undefined,
    };
  }

  /**
   * Get basic structure of the PDF content
   */
  async getStructure(content) {
    const lines = content.split("\n");

    // Remove empty lines and whitespace-only lines
    const nonEmptyLines = lines.filter((line) => line.trim().length > 0);

    // Identify potential headers based on patterns
    const structure = nonEmptyLines.map((line) => ({
      text: line.trim(),
      isHeader: this.isLikelyHeader(line),
      level: this.guessHeadingLevel(line),
      position: line.length - line.trimStart().length,
    }));

    return structure;
  }

  /**
   * Determine if a line is likely a header based on patterns
   */
  isLikelyHeader(line) {
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

    // Roman numerals
    if (/^[IVX]+\.\s/.test(trimmed)) {
      return true;
    }

    // Looks like a section title (words followed by space and then more words)
    if (/^[A-Z][a-z]+(?:\s[A-Z][a-z]+)+$/.test(trimmed)) {
      return true;
    }

    // Common header patterns
    const headerPatterns = [
      /^(Chapter|Section|Part)\s+\d+/i,
      /^(Appendix)\s+[A-Z]/i,
      /^(Table|Figure)\s+\d+/i,
    ];

    for (const pattern of headerPatterns) {
      if (pattern.test(trimmed)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Guess heading level based on text formatting
   */
  guessHeadingLevel(line) {
    const trimmed = line.trim();
    const indent = line.length - trimmed.length;

    // Less indentation means higher level heading
    const level = Math.ceil(indent / 4);

    // Clamp to valid heading levels (1-6)
    return Math.max(1, Math.min(level, 6));
  }
}
