#!/usr/bin/env node

/**
 * OCR Improvements Validation Script
 *
 * This script tests the three new OCR improvement services:
 * 1. DocumentLayoutAnalyzer - Analyzes document structure
 * 2. OcrPostProcessor - Refines OCR output with AI
 * 3. TableExtractor - Detects and extracts tables
 *
 * Usage: node test-ocr-improvements.js [pdf-file-path]
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

// Import our services (adjust paths based on actual project structure)
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const srcPath = path.join(__dirname, "src");

try {
  // Dynamic imports to handle ES modules
  const layoutAnalyzerModule = await import(`${srcPath}/services/layout-analyzer.js`);
  const ocrPostProcessorModule = await import(`${srcPath}/services/ocr-postprocessor.js`);
  const tableExtractorModule = await import(`${srcPath}/services/table-extractor.js`);
  const pdfParserModule = await import(`${srcPath}/parsers/pdf-parser.js`);

  const DocumentLayoutAnalyzer = layoutAnalyzerModule.DocumentLayoutAnalyzer;
  const OcrPostProcessor = ocrPostProcessorModule.OcrPostProcessor;
  const TableExtractor = tableExtractorModule.TableExtractor;
  const PdfParser = pdfParserModule.PdfParser;

  // ANSI color codes for better output
  const colors = {
    reset: "\x1b[0m",
    red: "\x1b[31m",
    green: "\x1b[32m",
    yellow: "\x1b[33m",
    blue: "\x1b[34m"
  };

  function log(message, color = "reset") {
    console.log(`${colors[color]}${message}${colors.reset}`);
  }

  /**
   * Test DocumentLayoutAnalyzer
   */
  async function testLayoutAnalyzer(filePath) {
    log("\n" + "=".repeat(60), "blue");
    log("TESTING DOCUMENT LAYOUT ANALYZER", "blue");
    log("=".repeat(60), "blue");

    const analyzer = new DocumentLayoutAnalyzer();

    try {
      const result = await analyzer.analyzeDocument(filePath);

      if (result.success) {
        log("\n� Layout Analysis SUCCESS!", "green");
        log(`- Total pages: ${result.totalPages}`, "green");
        log(`- Structure type: ${result.structureType}`, "green");
        log(`\n${result.layoutSummary}`, "green");

        // Show detailed page info for first 3 pages
        const maxPagesToShow = Math.min(3, result.pages.length);
        for (let i = 0; i < maxPagesToShow; i++) {
          const page = result.pages[i];
          log(`\nPage ${page.pageNumber}:`, "yellow");
          log(`- Text blocks: ${page.textBlocks.length}`, "yellow");
          log(`- Images: ${page.images.length}`, "yellow");
          log(`- Potential tables: ${page.tables.length}`, "yellow");
          log(`- Layout type: ${page.estimatedLayoutType}`, "yellow");
        }

        return result;
      } else {
        log("\n� Layout Analysis FAILED!", "red");
        log(`Error: ${result.error}`, "red");
        return null;
      }
    } catch (error) {
      log("\n� Layout Analysis EXCEPTION!", "red");
      log(`Exception: ${error.message}`, "red");
      if (error.stack) {
        log(error.stack, "red");
      }
      return null;
    }
  }

  /**
   * Test OcrPostProcessor
   */
  async function testOcrPostProcessor(sampleText, layoutAnalysis = null) {
    log("\n" + "=".repeat(60), "blue");
    log("TESTING OCR POST-PROCESSOR", "blue");
    log("=".repeat(60), "blue");

    const processor = new OcrPostProcessor();

    try {
      log(`\nInput text length: ${sampleText.length} characters`, "yellow");

      const result = await processor.processOcrText(sampleText, layoutAnalysis);

      if (result.success) {
        log("\n� OCR Post-Processing SUCCESS!", "green");
        log(`- Output text length: ${result.processedText.length} characters`, "green");
        log(`- Confidence score: ${Math.round(result.confidence * 100)}%`, "green");
        log(`- Processing steps: ${result.processingSteps.join(" → ")}`, "green");

        if (result.improvements && result.improvements.length > 0) {
          log(`\nImprovements made (${result.improvements.length}):`, "yellow");
          result.improvements.forEach((improvement, index) => {
            log(`${index + 1}. ${improvement.type}: ${improvement.description}`, "yellow");
          });
        } else {
          log("\nNo improvements detected (text appears clean)", "yellow");
        }

        // Show a snippet of the processed text
        const snippet = result.processedText.substring(0, 200);
        log(`\nProcessed text preview:`, "yellow");
        log(snippet + "...", "yellow");

        return result;
      } else {
        log("\n� OCR Post-Processing FAILED!", "red");
        return null;
      }
    } catch (error) {
      log("\n� OCR Post-Processing EXCEPTION!", "red");
      log(`Exception: ${error.message}`, "red");
      if (error.stack) {
        log(error.stack, "red");
      }
      return null;
    }
  }

  /**
   * Test TableExtractor
   */
  async function testTableExtractor(text) {
    log("\n" + "=".repeat(60), "blue");
    log("TESTING TABLE EXTRACTOR", "blue");
    log("=".repeat(60), "blue");

    const extractor = new TableExtractor();

    try {
      const result = await extractor.extractTables(text);

      if (result && result.length > 0) {
        log(`\n� Table Extraction SUCCESS!`, "green");
        log(`- Total tables found: ${result.length}`, "green");

        // Show details for each table
        result.forEach((table, index) => {
          log(`\nTable ${index + 1}:`, "yellow");
          log(`- Type: ${table.type}`, "yellow");
          log(`- Source: ${table.source || 'text'}`, "yellow");
          log(`- Confidence: ${Math.round(table.confidence * 100)}%`, "yellow");
          log(`- Rows: ${table.rows || 'unknown'}`, "yellow");

          if (table.formattedContent) {
            const preview = table.formattedContent.split('\n').slice(0, 3).join('\n');
            log(`\nFormatted content preview:`, "yellow");
            log(preview + "...", "yellow");
          }
        });

        return result;
      } else {
        log("\n� No tables found in text", "yellow");
        return [];
      }
    } catch (error) {
      log("\n� Table Extraction EXCEPTION!", "red");
      log(`Exception: ${error.message}`, "red");
      if (error.stack) {
        log(error.stack, "red");
      }
      return null;
    }
  }

  /**
   * Test TableExtractor on PDF
   */
  async function testTableExtractorOnPdf(filePath) {
    log("\n" + "=".repeat(60), "blue");
    log("TESTING TABLE EXTRACTOR ON PDF", "blue");
    log("=".repeat(60), "blue");

    const extractor = new TableExtractor();

    try {
      const result = await extractor.extractTablesFromPdf(filePath);

      if (result && result.length > 0) {
        log(`\n� PDF Table Extraction SUCCESS!`, "green");
        log(`- Total tables found: ${result.length}`, "green");

        // Show details for each table
        result.forEach((table, index) => {
          log(`\nTable ${index + 1}:`, "yellow");
          log(`- Type: ${table.type}`, "yellow");
          log(`- Source: ${table.source || 'text'}`, "yellow");
          if (table.page) log(`- Page: ${table.page}`, "yellow");
          log(`- Confidence: ${Math.round(table.confidence * 100)}%`, "yellow`);
        });

        return result;
      } else {
        log("\n� No tables found in PDF", "yellow");
        return [];
      }
    } catch (error) {
      log("\n� PDF Table Extraction EXCEPTION!", "red");
      log(`Exception: ${error.message}`, "red");
      if (error.stack) {
        log(error.stack, "red");
      }
      return null;
    }
  }

  /**
   * Test integrated PdfParser with all improvements
   */
  async function testIntegratedPdfParser(filePath) {
    log("\n" + "=".repeat(60), "blue");
    log("TESTING INTEGRATED PDF PARSER (ALL IMPROVEMENTS)", "blue");
    log("=".repeat(60), "blue");

    const parser = new PdfParser();

    try {
      const result = await parser.parse(filePath);

      if (result.success) {
        log("\n� Integrated parsing SUCCESS!", "green");
        log(`- Text length: ${result.text.length} characters`, "green");
        log(`- Pages: ${result.pages}`, "green");
        log(`- Images extracted: ${result.images ? result.images.length : 0}`, "green");

        if (result.layoutAnalysis) {
          log("\nLayout Analysis:", "yellow");
          log(`- Structure type: ${result.layoutAnalysis.structureType}`, "yellow");
        }

        if (result.ocrPostProcessing) {
          log("\nOCR Post-processing metadata:", "yellow");
          log(`- Improvements made: ${result.ocrPostProcessing.improvements.length}`, "yellow");
          log(`- Confidence: ${Math.round(result.ocrPostProcessing.confidence * 100)}%`, "yellow");
        }

        if (result.tables) {
          log("\nTable extraction:", "yellow");
          log(`- Tables found: ${result.tableCount}`, "yellow");
        }

        return result;
      } else {
        log("\n� Integrated parsing FAILED!", "red");
        log(`Error: ${result.error}`, "red");
        return null;
      }
    } catch (error) {
      log("\n� Integrated parsing EXCEPTION!", "red");
      log(`Exception: ${error.message}`, "red");
      if (error.stack) {
        log(error.stack, "red");
      }
      return null;
    }
  }

  /**
   * Main test runner
   */
  async function main() {
    const args = process.argv.slice(1);

    // Check if a file path was provided
    let filePath = null;
    if (args.length > 1) {
      filePath = args[1];
    } else {
      // Try to find a PDF in the testfiles directory
      const testFilesDir = path.join(__dirname, "testfiles");
      try {
        const files = fs.readdirSync(testFilesDir);
        const pdfFile = files.find(f => f.toLowerCase().endsWith('.pdf'));
        if (pdfFile) {
          filePath = path.join(testFilesDir, pdfFile);
          log(`Using test file: ${filePath}`, "yellow");
        }
      } catch (e) {
        // Ignore directory read errors
      }
    }

    if (!filePath || !fs.existsSync(filePath)) {
      log("\n" + "=".repeat(60), "red");
      log("ERROR: No PDF file found", "red");
      log("=" .repeat(60), "red");
      log("\nUsage: node test-ocr-improvements.js <path-to-pdf>", "yellow");
      log("\nOr place a PDF file in the 'testfiles' directory", "yellow");
      process.exit(1);
    }

    log(`\nTesting OCR improvements on: ${filePath}`, "green");

    // Test 1: Document Layout Analyzer
    const layoutResult = await testLayoutAnalyzer(filePath);

    // Read text for post-processing tests
    let sampleText = "";
    try {
      const pdfParser = new PdfParser();
      const parseResult = await pdfParser.parse(filePath);
      if (parseResult.success) {
        sampleText = parseResult.text || "";
      }
    } catch (e) {
      log("Could not read text for post-processing tests", "yellow");
    }

    // Test 2: OCR Post-Processor
    if (sampleText.length > 0) {
      await testOcrPostProcessor(sampleText, layoutResult);
    } else {
      log("\nSkipping OCR Post-Processing test (no text available)", "yellow");
    }

    // Test 3a: Table Extractor on text
    if (sampleText.length > 0) {
      await testTableExtractor(sampleText);
    } else {
      log("\nSkipping Table extraction on text (no text available)", "yellow");
    }

    // Test 3b: Table Extractor on PDF
    await testTableExtractorOnPdf(filePath);

    // Test 4: Integrated parser with all improvements
    await testIntegratedPdfParser(filePath);

    log("\n" + "=".repeat(60), "green");
    log("ALL TESTS COMPLETED!", "green");
    log("=" .repeat(60), "green");
  }

  // Run the tests
  main().catch(error => {
    console.error("Fatal error:", error);
    process.exit(1);
  });

} catch (importError) {
  console.error("Failed to import modules. Make sure you're in the project directory.");
  console.error(importError.message);
  if (importError.stack) console.error(importError.stack);
  process.exit(1);
}
