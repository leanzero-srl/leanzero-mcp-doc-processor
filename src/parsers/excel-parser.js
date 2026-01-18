import fs from "fs";
import xlsx from "xlsx";

/**
 * Excel Parser Module
 * Handles extraction of text, data, and images from Excel workbooks (.xlsx, .xls)
 *
 * Note: The xlsx library used here focuses on data extraction and does not support
 * image extraction. For image extraction capabilities, consider using ExcelJS or
 * parsing the XLSX ZIP structure directly.
 */
export class ExcelParser {
  constructor() {
    this.name = "ExcelParser";
  }

  /**
   * Parse Excel file and extract text content and metadata
   */
  async parse(filePath) {
    try {
      const workbook = xlsx.readFile(filePath, { type: "file" });

      return {
        success: true,
        text: this.extractText(workbook),
        sheets: workbook.SheetNames || [],
        metadata: await this.extractMetadata(filePath, workbook),
        // Note: Image extraction not supported by xlsx library
        images: await this.extractImages(workbook),
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to parse Excel: ${error.message || "Unknown error"}`,
        details: this.handleError(error),
      };
    }
  }

  /**
   * Extract text content from workbook
   */
  extractText(workbook) {
    let fullText = "";

    // Iterate through all sheets
    workbook.SheetNames.forEach((sheetName) => {
      const worksheet = workbook.Sheets[sheetName];

      // Get cell values as array of arrays with proper configuration
      const range = xlsx.utils.sheet_to_json(worksheet, {
        header: 1,
        raw: false,
        defval: "",
        blankrows: false,
        skipHidden: true,
        dateNF: "yyyy-mm-dd",
        sheetStubs: false,
        strip: true,
        formula: false,
        display: false,
        range: undefined,
        cellHTML: false,
        cellText: false,
        sheetRows: undefined,
        escape: false,
      });

      // Append sheet title as heading (to distinguish sheets)
      fullText += `## Sheet: ${sheetName}\n`;

      // Append cell values as plain text with tab separation
      range.forEach((row) => {
        const textRow = row.join("\t");
        fullText += `${textRow}\n`;
      });
    });

    return fullText;
  }

  /**
   * Extract metadata from Excel file
   */
  async extractMetadata(filePath, workbook) {
    try {
      const stats = fs.statSync(filePath);

      return {
        filename: this.extractFilename(filePath),
        sizeBytes: stats.size || null,
        sheetNames: workbook.SheetNames || [],
        sheetCount: workbook.SheetNames.length || 0,
        // Note: Additional document properties would require parsing
        // the docProps/core.xml file in a real implementation
        creationDate: null,
        modificationDate: null,
        author: null,
        title: null,
      };
    } catch (error) {
      return { error: `Metadata extraction failed: ${error.message}` };
    }
  }

  /**
   * Extract filename from file path
   */
  extractFilename(filePath) {
    const parts = filePath.split("/");
    return parts[parts.length - 1] || null;
  }

  /**
   * Extract images from Excel workbook
   *
   * IMPORTANT: The xlsx library does NOT support image extraction.
   * This is a known limitation. To extract images from Excel files,
   * you would need to:
   *
   * 1. Use ExcelJS library (exceljs/exceljs) which has image support:
   *    - Supports reading images embedded in workbooks
   *    - Can access image metadata and data
   *    - Returns images as base64 or buffers
   *
   * 2. Or parse the XLSX ZIP structure directly:
   *    - Extract from xl/media/ folder
   *    - Parse drawing relationships in xl/drawings/
   *    - Handle image positioning and anchoring
   *
   * For production use with image extraction, consider switching to ExcelJS:
   *
   * ```javascript
   * import ExcelJS from 'exceljs';
   * const workbook = new ExcelJS.Workbook();
   * await workbook.xlsx.readFile(filePath);
   * const images = [];
   * workbook.eachSheet((worksheet) => {
   *   worksheet.getImages().forEach((image) => {
   *     const img = workbook.model.media.find((m) => m.index === image.imageId);
   *     images.push({
   *       name: img.name,
   *       data: img.buffer.toString('base64'),
   *       mimeType: img.extension,
   *       // ... more metadata
   *     });
   *   });
   * });
   * ```
   */
  async extractImages(workbook) {
    // Return empty array as xlsx library doesn't support image extraction
    // This matches the current limitation of the library
    return [];
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
   * Get basic structure of the Excel content
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
      isSheetHeader: line.startsWith("## Sheet:"),
    }));

    return structure;
  }

  /**
   * Determine if a line is likely a header based on patterns
   */
  isLikelyHeader(line) {
    const trimmed = line.trim();

    // Sheet headers are marked with ##
    if (trimmed.startsWith("## Sheet:")) {
      return true;
    }

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

    // Sheet headers are level 1
    if (trimmed.startsWith("## Sheet:")) {
      return 1;
    }

    const indent = line.length - trimmed.length;

    // Less indentation means higher level heading
    const level = Math.ceil(indent / 4);

    // Clamp to valid heading levels (1-6)
    return Math.max(1, Math.min(level, 6));
  }
}
