import fs from "fs";
import { PDFParse } from "pdf-parse";
import { visionService } from "./vision-factory.js";

/**
 * Table Extractor
 * Dedicated service for detecting and extracting tables from documents
 */
export class TableExtractor {
  constructor() {
    this.name = "TableExtractor";
  }

  /**
   * Extract tables from document text
   * @param {string} text - Document text content
   * @returns {Promise<Array>} Array of extracted tables with metadata
   */
  async extractTables(text) {
    console.error(`[TableExtractor] Extracting tables from document...`);

    if (!text || text.length === 0) {
      return [];
    }

    // Find table patterns in the text
    const tables = this.detectTablesInText(text);

    // Extract table content using AI if we found any tables
    const extractedTables = [];

    for (const table of tables) {
      try {
        // Use AI to extract and format the table
        const extractedTable = await this.extractTableContent(
          table.content,
          table.type,
        );

        if (extractedTable) {
          extractedTables.push({
            ...table,
            content: extractedTable.content,
            formattedContent: extractedTable.formattedContent,
            confidence: extractedTable.confidence,
          });
        }
      } catch (error) {
        console.error(
          `[TableExtractor] Failed to extract table: ${error.message}`,
        );
        // Continue with other tables
      }
    }

    console.error(
      `[TableExtractor] Extracted ${extractedTables.length} tables`,
    );
    return extractedTables;
  }

  /**
   * Detect table patterns in text
   */
  detectTablesInText(text) {
    const tables = [];

    // Pattern 1: Markdown-style tables
    const markdownTablePattern =
      /(\|.*\|\s*\n\s*\|-+\|)(\s*\|.+\|\s*(?:\n\s*\|.+\|\s*)*)/g;
    let match;

    while ((match = markdownTablePattern.exec(text)) !== null) {
      tables.push({
        type: "markdown",
        content: match[0],
        start: match.index,
        end: match.index + match[0].length,
        rows:
          (match[2] || "").split("\n").filter((r) => r.trim() !== "").length +
          1,
      });
    }

    // Pattern 2: Tab-separated tables
    const tabPattern = /^(?:[^\t]*\t[^\t]*){2,}$/gm;
    const tabMatches = [...text.matchAll(tabPattern)];

    for (const match of tabMatches) {
      if (
        match.index > 0 &&
        text.substring(match.index - 1, match.index) !== "\n"
      ) {
        continue; // Skip if not at start of line
      }

      const tableContent = match[0];
      // Make sure it's not just a line with tabs in the middle
      if (tableContent.split("\t").length > 2) {
        tables.push({
          type: "tab-separated",
          content: tableContent,
          start: match.index,
          end: match.index + tableContent.length,
          rows: 1,
        });
      }
    }

    // Pattern 3: Column-aligned tables (numbers aligned)
    const columnPattern = /^\s*\d+\s+(?:[^\n]+\s+){2,}\d+\s*$/gm;
    const columnMatches = [...text.matchAll(columnPattern)];

    for (const match of columnMatches) {
      const tableContent = match[0];
      if (tableContent.split(/\s+/).length > 3) {
        tables.push({
          type: "column-aligned",
          content: tableContent,
          start: match.index,
          end: match.index + tableContent.length,
          rows: 1,
        });
      }
    }

    // Pattern 4: Tables with headers and separators (e.g., "Name Age\n---- ---\nJohn 25")
    const headerSeparatorPattern = /^([^\n]+\n)(-+[\s\-]*\n)([^\n]+\n)+$/gm;
    const headerMatches = [...text.matchAll(headerSeparatorPattern)];

    for (const match of headerMatches) {
      const tableContent = match[0];
      if (tableContent.split("\n").length > 2) {
        tables.push({
          type: "header-separator",
          content: tableContent,
          start: match.index,
          end: match.index + tableContent.length,
          rows: tableContent.split("\n").length,
        });
      }
    }

    return tables;
  }

  /**
   * Extract table content using AI
   */
  async extractTableContent(tableContent, tableType) {
    console.error(`[TableExtractor] Extracting ${tableType} table content...`);

    const prompt = `Extract this table from the document and format it as a markdown table.
Table content:
${tableContent}

Instructions:
1. Extract ALL data from the table
2. Preserve all rows and columns exactly as they appear
3. Use markdown table format with | for column separators
4. Use --- to separate header from content
5. If cells are merged, indicate this with [merged] or appropriate markdown
6. Preserve any numbers, dates, or special formatting exactly as they appear
7. If the table has headers, make sure to include them in the first row
8. Do NOT add any commentary or explanations beyond the table itself

Return only the markdown table with no additional text.`;

    try {
      const result = await visionService.extractText(tableContent, prompt);

      // Validate the output is a proper table
      if (!result || result.trim().length === 0) {
        return null;
      }

      // Check if it's a proper markdown table
      const lines = result.split("\n");
      if (lines.length < 2) return null;

      // Check for header separator
      const hasHeaderSeparator =
        lines[1].startsWith("|---") ||
        lines[1].startsWith("---") ||
        lines[1].includes("|---");

      if (!hasHeaderSeparator && lines.length > 2) {
        // Try to fix it
        const fixedResult = `|${lines[0]
          .trim()
          .replace(/\s+/g, "|")}\n|---\n${lines.slice(2).join("\n")}`;
        return {
          content: tableContent,
          formattedContent: fixedResult,
          confidence: 0.9,
        };
      }

      return {
        content: tableContent,
        formattedContent: result.trim(),
        confidence: 0.9,
      };
    } catch (error) {
      console.error(
        `[TableExtractor] Failed to extract table content: ${error.message}`,
      );
      return null;
    }
  }

  /**
   * Extract tables from PDF document
   */
  async extractTablesFromPdf(filePath) {
    console.error(`[TableExtractor] Extracting tables from PDF: ${filePath}`);

    try {
      // Read PDF file
      const dataBuffer = fs.readFileSync(filePath);
      const parser = new PDFParse({ data: dataBuffer });

      // Extract text and images
      const textResult = await parser.getText();
      const imageResult = await parser.getImage({ imageThreshold: 0 });

      // Extract tables from text
      const textTables = this.detectTablesInText(textResult.text || "");

      // Extract tables from images (if any)
      const imageTables = [];
      if (imageResult.pages && imageResult.pages.length > 0) {
        for (let i = 0; i < imageResult.pages.length; i++) {
          const page = imageResult.pages[i];
          if (page.images && page.images.length > 0) {
            for (const image of page.images) {
              if (image.data && image.data.length > 1000) {
                // Only process non-trivial images
                const tablePrompt = `Extract any tables from this image. Use markdown format with | for columns and --- for header separator.
Do NOT extract non-table content. Only return the table in markdown format.`;

                const tableResult = await visionService.extractText(
                  image.data,
                  tablePrompt,
                );
                if (tableResult && tableResult.length > 10) {
                  imageTables.push({
                    type: "image-table",
                    content: tableResult,
                    page: i + 1,
                    confidence: 0.85,
                  });
                }
              }
            }
          }
        }
      }

      // Combine all tables
      const allTables = [];

      // Add text-based tables
      for (const table of textTables) {
        const extracted = await this.extractTableContent(
          table.content,
          table.type,
        );
        if (extracted) {
          allTables.push({
            ...table,
            source: "text",
            extractedContent: extracted.formattedContent,
            confidence: extracted.confidence,
          });
        }
      }

      // Add image-based tables
      for (const table of imageTables) {
        allTables.push({
          type: "image-table",
          content: table.content,
          page: table.page,
          source: "image",
          extractedContent: table.content,
          confidence: table.confidence,
        });
      }

      // Clean up parser
      await parser.destroy();

      console.error(
        `[TableExtractor] Extracted ${allTables.length} tables from PDF`,
      );
      return allTables;
    } catch (error) {
      console.error(
        `[TableExtractor] Error extracting tables from PDF: ${error.message}`,
      );
      return [];
    }
  }

  /**
   * Format extracted tables for display in results
   */
  formatTablesForDisplay(extractedTables) {
    if (!extractedTables || extractedTables.length === 0) {
      return "";
    }

    let output = `\n\n=== EXTRACTED TABLES (${extractedTables.length}) ===\n\n`;

    extractedTables.forEach((table, index) => {
      output += `Table ${index + 1} (Source: ${table.source || "text"}, Type: ${table.type}, Confidence: ${Math.round(
        table.confidence * 100,
      )}%)\n`;
      output += table.extractedContent || table.content;
      output += "\n\n";
    });

    return output;
  }
}
