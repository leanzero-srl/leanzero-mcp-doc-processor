import fs from "fs";
import { PDFParse } from "pdf-parse";

/**
 * Document Layout Analyzer
 * Analyzes document structure to identify text blocks, images, tables, and other elements
 */
export class DocumentLayoutAnalyzer {
  constructor() {
    this.name = "DocumentLayoutAnalyzer";
    this.minTextBlockSize = 20; // Minimum character count to consider a block
  }

  /**
   * Analyze document layout and extract structural elements
   * @param {string} filePath - Path to PDF file
   * @returns {Promise<Object>} Layout analysis results
   */
  async analyzeDocument(filePath) {
    console.error(`[LayoutAnalyzer] Analyzing document layout: ${filePath}`);

    try {
      // Read PDF file
      const dataBuffer = fs.readFileSync(filePath);
      const parser = new PDFParse({ data: dataBuffer });

      // Extract text and images
      const textResult = await parser.getText();
      const imageResult = await parser.getImage({ imageThreshold: 0 });

      // Analyze page structure
      const pages = [];

      if (textResult.pages && textResult.pages.length > 0) {
        for (let i = 0; i < textResult.pages.length; i++) {
          const pageData = textResult.pages[i];

          // Extract text blocks and their positions
          const textBlocks = this.extractTextBlocks(pageData);

          // Identify image regions
          const imagesOnPage = imageResult.pages?.[i]?.images || [];

          // Identify potential tables
          const tableCandidates = this.findTableCandidates(pageData);

          pages.push({
            pageNumber: i + 1,
            textBlocks: textBlocks,
            images: imagesOnPage,
            tables: tableCandidates,
            totalTextLength: pageData.text.length,
            estimatedLayoutType: this.estimatePageLayout(textBlocks, imagesOnPage)
          });
        }
      }

      // Clean up parser
      await parser.destroy();

      return {
        success: true,
        pages: pages,
        totalPages: pages.length,
        layoutSummary: this.generateLayoutSummary(pages),
        structureType: this.classifyDocumentStructure(pages)
      };

    } catch (error) {
      console.error(`[LayoutAnalyzer] Error analyzing document: ${error.message}`);
      return {
        success: false,
        error: `Layout analysis failed: ${error.message}`,
        pages: []
      };
    }
  }

  /**
   * Extract text blocks with positional information
   */
  extractTextBlocks(pageData) {
    if (!pageData || !pageData.text) return [];

    const lines = pageData.text.split('\n');
    const blocks = [];
    let currentBlock = { text: '', lines: [], startLine: 0, endLine: 0 };

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();

      if (line.length === 0) {
        // Empty line - check if we should end a block
        if (currentBlock.text.length >= this.minTextBlockSize) {
          currentBlock.endLine = i;
          blocks.push({ ...currentBlock });
          currentBlock = { text: '', lines: [], startLine: 0, endLine: 0 };
        }
      } else {
        // Non-empty line - add to current block
        if (currentBlock.text.length === 0) {
          currentBlock.startLine = i;
        }
        currentBlock.lines.push(line);
        currentBlock.text += line + ' ';
      }
    }

    // Add last block if it exists
    if (currentBlock.text.length >= this.minTextBlockSize) {
      currentBlock.endLine = lines.length - 1;
      blocks.push({ ...currentBlock });
    }

    return blocks;
  }

  /**
   * Find potential table structures
   */
  findTableCandidates(pageData) {
    if (!pageData || !pageData.text) return [];

    const lines = pageData.text.split('\n');
    const tables = [];

    // Look for patterns that suggest tables
    for (let i = 0; i < lines.length - 2; i++) {
      const line = lines[i].trim();
      const nextLine = lines[i + 1]?.trim() || '';

      // Look for header patterns that might be tables
      if (line.length > 0 &&
          line.includes('|') &&
          nextLine.includes('---')) {
        // This looks like a markdown table
        tables.push({
          type: 'markdown-table',
          startLine: i,
          endLine: -1, // Will be determined later
          content: line + '\n' + nextLine
        });
      }

      // Look for tab-separated data patterns
      if (line.includes('\t') && line.split('\t').length > 2) {
        tables.push({
          type: 'tab-separated',
          startLine: i,
          endLine: -1,
          content: line
        });
      }

      // Look for columnar patterns (numbers aligned)
      const numberPattern = /^\s*\d+\s+\S+\s+\d+/;
      if (numberPattern.test(line)) {
        tables.push({
          type: 'columnar',
          startLine: i,
          endLine: -1,
          content: line
        });
      }
    }

    return tables;
  }

  /**
   * Estimate page layout type
   */
  estimatePageLayout(textBlocks, images) {
    if (images.length > 2) return 'image-heavy';
    if (textBlocks.length < 3) return 'sparse-text';

    // Count blocks by size
    const smallBlocks = textBlocks.filter(b => b.text.length < 100).length;
    const largeBlocks = textBlocks.filter(b => b.text.length > 500).length;

    if (largeBlocks > 2) return 'text-dense';
    if (smallBlocks > 5) return 'fragmented';

    return 'balanced';
  }

  /**
   * Generate layout summary
   */
  generateLayoutSummary(pages) {
    let summary = 'Document Layout Analysis:\n';

    if (pages.length === 0) return summary + 'No pages analyzed\n';

    const totalTextBlocks = pages.reduce((sum, page) => sum + page.textBlocks.length, 0);
    const totalImages = pages.reduce((sum, page) => sum + page.images.length, 0);
    const totalTables = pages.reduce((sum, page) => sum + page.tables.length, 0);

    summary += `- Total pages: ${pages.length}\n`;
    summary += `- Total text blocks: ${totalTextBlocks}\n`;
    summary += `- Total images: ${totalImages}\n`;
    summary += `- Potential tables: ${totalTables}\n`;

    // Page type distribution
    const layoutCounts = {};
    pages.forEach(page => {
      layoutCounts[page.estimatedLayoutType] = (layoutCounts[page.estimatedLayoutType] || 0) + 1;
    });

    summary += `- Page layouts: ${Object.entries(layoutCounts).map(([type, count]) => `${count} ${type}`).join(', ')}\n`;

    return summary;
  }

  /**
   * Classify document structure
   */
  classifyDocumentStructure(pages) {
    const totalTextBlocks = pages.reduce((sum, page) => sum + page.textBlocks.length, 0);
    const totalImages = pages.reduce((sum, page) => sum + page.images.length, 0);
    const totalTables = pages.reduce((sum, page) => sum + page.tables.length, 0);

    if (totalTables > 3) return 'structured-document';
    if (totalImages > 5 && totalTextBlocks < 10) return 'image-heavy-document';
    if (totalTextBlocks > 20) return 'text-dense-document';

    return 'mixed-document';
  }
}
