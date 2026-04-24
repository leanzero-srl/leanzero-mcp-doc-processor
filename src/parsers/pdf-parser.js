import fs from "fs/promises";
import { PDFParse } from "pdf-parse";
import { visionService } from "../services/vision-service.js";
import { OcrPostProcessor } from "../services/ocr-postprocessor.js";
import { TableExtractor } from "../services/table-extractor.js";
import { log } from "../utils/logger.js";

/**
 * PDF Parser Module
 * Handles extraction of text and images from PDF documents.
 * Single-pass parsing: reads file once, extracts text + images + layout together.
 * Uses Vision Service for OCR when text extraction yields minimal results.
 */
export class PdfParser {
  constructor() {
    this.name = "PdfParser";
    this.minTextThreshold = 50;
    this.ocrPostProcessor = new OcrPostProcessor();
    this.tableExtractor = new TableExtractor();
    this.skipTableExtraction = process.env.SKIP_TABLE_EXTRACTION !== "false";
  }

  isImageBasedPdf(text, images) {
    const cleanText = (text || "").replace(/\s+/g, "").replace(/--\d+of\d+--/gi, "");
    return (Array.isArray(images) && images.length > 0 && cleanText.length < this.minTextThreshold);
  }

  /**
   * Parse PDF - single pass: read once, extract everything together.
   */
  async parse(filePath) {
    log("info", "Parsing PDF:", { filePath });

    let parser;
    try {
      // Async file read - non-blocking
      const dataBuffer = await fs.readFile(filePath);
      parser = new PDFParse({ data: dataBuffer });

      // Extract text and images in parallel
      const [textResult, imagesResult] = await Promise.all([
        parser.getText(),
        parser.getImage({ imageThreshold: 0, imageDataUrl: true, imageBuffer: true }),
      ]);

      const processedImages = this.processImages(imagesResult);

      // Inline layout analysis from already-extracted data (no second file read)
      const layoutAnalysis = this._analyzeLayout(textResult, processedImages);

      const cleanText = (textResult.text || "").replace(/\s+/g, "").replace(/--\d+of\d+--/gi, "");
      const isImageBased =
        this.isImageBasedPdf(textResult.text, processedImages) ||
        layoutAnalysis.structureType === "image-heavy-document";

      log("debug", "PDF parse info:", {
        textLength: cleanText.length,
        imageCount: processedImages.length,
        isImageBased,
        pages: textResult.numPages || 0,
      });

      let finalText = textResult.text || "";
      let ocrResult = null;

      if (isImageBased) {
        ocrResult = await this._performOcr(parser, processedImages, layoutAnalysis);

        if (ocrResult?.success) {
          finalText = ocrResult.text;

          const postProcessed = await this.ocrPostProcessor.processOcrText(finalText, layoutAnalysis);
          if (postProcessed.success) {
            finalText = postProcessed.processedText;
            ocrResult.postProcessing = postProcessed;
          }
        }
      } else {
        // Basic text cleaning for text-based PDFs (no AI)
        const postProcessed = await this.ocrPostProcessor.processOcrText(finalText, layoutAnalysis, false);
        if (postProcessed.success) {
          finalText = postProcessed.processedText;
          ocrResult = { success: false, postProcessing: postProcessed, source: "text-cleaning" };
        }
      }

      // Extract tables
      let extractedTables = [];
      if (!this.skipTableExtraction) {
        try {
          extractedTables = await this.tableExtractor.extractTablesFromPdf(filePath);
        } catch (err) {
          log("warn", "Table extraction failed:", { error: err.message });
        }
      }

      await parser.destroy();

      return {
        success: true,
        text: finalText,
        pages: textResult.numPages || 0,
        metadata: this.extractMetadata(textResult),
        images: processedImages,
        isImageBased,
        ocrApplied: ocrResult?.success || false,
        ocrSource: ocrResult?.success ? ocrResult.source : null,
        layoutAnalysis: layoutAnalysis.success ? layoutAnalysis : null,
        ocrPostProcessing: ocrResult?.postProcessing || null,
        tables: extractedTables,
        tableCount: extractedTables.length,
      };
    } catch (error) {
      if (parser) {
        try { await parser.destroy(); } catch (_) {}
      }
      return {
        success: false,
        error: `Failed to parse PDF: ${error.message}`,
        details: this.handleError(error),
      };
    }
  }

  /**
   * Inline layout analysis from already-parsed data (avoids second file read).
   */
  _analyzeLayout(textResult, images) {
    const pages = [];
    const totalPages = textResult.pages?.length || 0;

    for (let i = 0; i < totalPages; i++) {
      const pageData = textResult.pages[i];
      const textBlocks = this._extractTextBlocks(pageData?.text || "");
      const pageImages = images.filter((img) => img.page === i);
      const tables = this._findTableCandidates(pageData?.text || "");

      pages.push({
        pageNumber: i + 1,
        textBlocks,
        images: pageImages,
        tables,
        totalTextLength: (pageData?.text || "").length,
        estimatedLayoutType: this._estimatePageLayout(textBlocks, pageImages),
      });
    }

    const totalTables = pages.reduce((s, p) => s + p.tables.length, 0);
    const totalImages = pages.reduce((s, p) => s + p.images.length, 0);
    const totalBlocks = pages.reduce((s, p) => s + p.textBlocks.length, 0);

    let structureType = "mixed-document";
    if (totalTables > 3) structureType = "structured-document";
    else if (totalImages > 5 && totalBlocks < 10) structureType = "image-heavy-document";
    else if (totalBlocks > 20) structureType = "text-dense-document";

    return {
      success: true,
      pages,
      totalPages,
      structureType,
      layoutSummary: `Layout: ${structureType} | ${totalPages} pages, ${totalBlocks} blocks, ${totalImages} images, ${totalTables} tables`,
    };
  }

  _extractTextBlocks(text) {
    const lines = text.split("\n");
    const blocks = [];
    let current = { text: "", startLine: 0 };

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) {
        if (current.text.length >= 20) {
          blocks.push({ ...current, text: current.text.trim() });
          current = { text: "", startLine: 0 };
        }
      } else {
        if (!current.text) current.startLine = i;
        current.text += line + " ";
      }
    }
    if (current.text.length >= 20) blocks.push({ ...current, text: current.text.trim() });
    return blocks;
  }

  _findTableCandidates(text) {
    const lines = text.split("\n");
    const tables = [];

    for (let i = 0; i < lines.length - 1; i++) {
      const line = lines[i].trim();
      const next = lines[i + 1]?.trim() || "";

      if (line.includes("|") && next.includes("---")) {
        tables.push({ type: "markdown-table", startLine: i });
      } else if (line.includes("\t") && line.split("\t").length > 2) {
        tables.push({ type: "tab-separated", startLine: i });
      } else if (/^\s*\d+\s+\S+\s+\d+/.test(line)) {
        tables.push({ type: "columnar", startLine: i });
      }
    }
    return tables;
  }

  _estimatePageLayout(textBlocks, images) {
    if (images.length > 2) return "image-heavy";
    if (textBlocks.length < 3) return "sparse-text";
    if (textBlocks.filter((b) => b.text.length > 500).length > 2) return "text-dense";
    if (textBlocks.filter((b) => b.text.length < 100).length > 5) return "fragmented";
    return "balanced";
  }

  /**
   * Perform OCR on PDF pages.
   */
  async _performOcr(parser, images, layoutAnalysis) {
    try {
      let pageImages = [];

      // Try full page screenshots first (best quality)
      try {
        const screenshots = await parser.getScreenshot();
        if (screenshots?.pages?.length > 0) {
          pageImages = screenshots.pages.map((page, i) => ({
            data: page.dataUrl,
            page: i + 1,
            source: "screenshot",
          }));
        }
      } catch (err) {
        log("debug", "Screenshot extraction failed:", { error: err.message });
      }

      // Fall back to embedded images
      if (!pageImages.length && images.length > 0) {
        pageImages = images.filter((img) => img.data);
      }

      if (!pageImages.length) return { success: false, error: "No images for OCR" };

      const allText = [];
      const prompt = this._generateOcrPrompt(layoutAnalysis);

      for (const image of pageImages) {
        if (!image.data) continue;

        const result = await visionService.extractText(image.data, prompt.replace("{PAGE}", image.page || 1));

        if (result.success) {
          allText.push(`--- Page ${image.page} ---\n${result.text}`);
        } else {
          log("warn", "OCR failed for page:", { page: image.page, error: result.error });
        }
      }

      if (!allText.length) return { success: false, error: "OCR failed for all pages" };

      return {
        success: true,
        text: allText.join("\n\n"),
        source: visionService.name || "vision-service",
        pagesProcessed: allText.length,
      };
    } catch (error) {
      return { success: false, error: `OCR failed: ${error.message}` };
    }
  }

  /**
   * Generate concise OCR prompt based on layout analysis.
   */
  _generateOcrPrompt(layoutAnalysis) {
    let prompt = `Extract all text from this document image (page {PAGE}). Preserve document structure using markdown formatting.`;

    if (layoutAnalysis?.structureType === "structured-document") {
      prompt += "\nThis is a structured document with tables. Preserve table structures using markdown tables (| separators).";
    } else if (layoutAnalysis?.structureType === "image-heavy-document") {
      prompt += "\nThis document is image-heavy. Extract ALL visible text including small fonts and low-contrast text.";
    } else if (layoutAnalysis?.structureType === "text-dense-document") {
      prompt += "\nThis document is text-dense. Preserve paragraph structure, section headers, and hierarchical formatting.";
    }

    // Add document type hints
    const hint = this._getDocTypeHint(layoutAnalysis);
    if (hint === "invoice") prompt += "\nThis appears to be an invoice — preserve field labels and monetary values.";
    else if (hint === "contract") prompt += "\nThis appears to be a contract — preserve all clauses and legal terminology.";
    else if (hint === "resume") prompt += "\nThis appears to be a resume/CV — preserve experience sections and skills.";

    return prompt;
  }

  _getDocTypeHint(layoutAnalysis) {
    if (!layoutAnalysis?.pages) return "";

    const totalTables = layoutAnalysis.pages.reduce((s, p) => s + (p.tables?.length || 0), 0);
    const totalImages = layoutAnalysis.pages.reduce((s, p) => s + (p.images?.length || 0), 0);

    if (totalTables > 3) return "structured document";
    if (totalImages > layoutAnalysis.pages.length * 2) return "image-heavy document";

    // Check text content for patterns
    const allText = layoutAnalysis.pages.map((p) => p.textBlocks.map((b) => b.text).join(" ")).join(" ").toLowerCase();
    if (/invoice|bill\s+to|amount\s+due/.test(allText)) return "invoice";
    if (/agreement|contract|party/.test(allText)) return "contract";
    if (/experience|education|skill/.test(allText)) return "resume";
    if (/report|analysis|summary/.test(allText)) return "report";

    return "";
  }

  extractMetadata(textResult) {
    return {
      title: textResult.infoData?.Title || null,
      author: textResult.infoData?.Author || null,
      subject: textResult.infoData?.Subject || null,
      creator: textResult.infoData?.Creator || null,
      producer: textResult.infoData?.Producer || null,
      creationDate: textResult.infoData?.CreationDate ? new Date(textResult.infoData.CreationDate) : null,
      modificationDate: textResult.infoData?.ModDate ? new Date(textResult.infoData.ModDate) : null,
      pageCount: textResult.total || 0,
      isEncrypted: textResult.infoData?.Encrypted || false,
    };
  }

  processImages(imagesResult) {
    const images = [];
    if (!imagesResult?.pages) return images;

    for (const page of imagesResult.pages) {
      const pageNum = page.pageNumber || 0;
      if (!page.images?.length) continue;

      for (const img of page.images) {
        let imageData = img.dataUrl || null;
        if (!imageData && img.data) {
          const buffer = Buffer.isBuffer(img.data) ? img.data : Buffer.from(img.data);
          imageData = `data:${this.getMimeTypeFromKind(img.kind)};base64,${buffer.toString("base64")}`;
        }

        images.push({
          data: imageData,
          name: img.name || `image_${pageNum}_${images.length}`,
          page: pageNum,
          width: img.width || 0,
          height: img.height || 0,
          mimeType: this.getMimeTypeFromKind(img.kind),
          size: imageData ? Math.round(imageData.length * 0.75) : 0,
          kind: img.kind || "unknown",
        });
      }
    }
    return images;
  }

  getMimeTypeFromKind(kind) {
    const numericMap = { 1: "image/jpeg", 2: "image/png", 3: "image/gif", 4: "image/bmp", 5: "image/tiff" };
    const stringMap = { jpeg: "image/jpeg", jpg: "image/jpeg", png: "image/png", gif: "image/gif", bmp: "image/bmp", tiff: "image/tiff", webp: "image/webp" };

    if (typeof kind === "number") return numericMap[kind] || "image/jpeg";
    if (typeof kind === "string") return stringMap[kind.toLowerCase().replace("-", "")] || "image/jpeg";
    return "image/jpeg";
  }

  handleError(error) {
    return {
      message: error.message,
      code: error.code || null,
      stack: process.env.NODE_ENV === "development" ? error.stack : undefined,
    };
  }

  async getStructure(content) {
    return content
      .split("\n")
      .filter((l) => l.trim())
      .map((line) => ({
        text: line.trim(),
        isHeader: this.isLikelyHeader(line),
        level: this.guessHeadingLevel(line),
        position: line.length - line.trimStart().length,
      }));
  }

  isLikelyHeader(line) {
    const t = line.trim();
    if (/^[A-Z\s\d\-\.,;:]+$/.test(t) && t.length < 50) return true;
    if (t.endsWith(":")) return true;
    if (/^\d+(\.\d+)*\s/.test(t)) return true;
    if (/^[IVX]+\.\s/.test(t)) return true;
    if (/^[A-Z][a-z]+(?:\s[A-Z][a-z]+)+$/.test(t)) return true;
    if (/(^Chapter|^Section|^Part)\s+\d+/i.test(t)) return true;
    if (/(^Appendix)\s+[A-Z]/i.test(t)) return true;
    if (/(^Table|^Figure)\s+\d+/i.test(t)) return true;
    return false;
  }

  guessHeadingLevel(line) {
    const indent = line.length - line.trim().length;
    return Math.max(1, Math.min(Math.ceil(indent / 4), 6));
  }
}
