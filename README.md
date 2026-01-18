# MCP Document Processor

A Model Context Protocol (MCP) server that processes PDF, DOCX, and Excel files with intelligent document understanding capabilities. It extracts text, structure, metadata, and embedded images, enabling AI agents to read and understand complex documents through standardized tools.

The system also includes document creation tools for generating DOCX and Excel files with professional styling options.

## Overview

This project provides a comprehensive document processing solution with the following key capabilities:

- Multi-format support for PDF, DOCX, and Excel files
- Intelligent OCR using vision models (LM Studio or Z.AI)
- Advanced document analysis with layout understanding
- Table detection and extraction with high accuracy
- Document generation with customizable styling
- Smart query-based document analysis with clarification workflows

The architecture is modular and designed for easy extension, with clear separation between parsing logic, services, and tool handlers.

## Installation

### Prerequisites

- Node.js (version 18 or higher recommended)
- For OCR functionality, either:
  - LM Studio running with a vision-capable model (local)
  - Z.AI API key (cloud)

### Setup Steps

1. Clone the repository:
```bash
git clone <repository-url>
cd mcp-doc-processor
```

2. Install dependencies:
```bash
npm install
```

3. Verify installation by running the test suite:
```bash
npm test
```

## Configuration

The server uses a vision provider strategy for OCR and image analysis. You can choose between a local LM Studio setup or cloud-based Z.AI through the `mcp.json` configuration file.

### Using LM Studio (Local - Recommended)

This option provides privacy and offline capability. Requires LM Studio running with a Vision-Language Model loaded (such as qwen2-vl or llava).

Configuration in `mcp.json`:
```json
{
  "mcpServers": {
    "doc-processor": {
      "command": "node",
      "args": ["/absolute/path/to/mcp-doc-processor/src/index.js"],
      "env": {
        "VISION_PROVIDER": "lm-studio",
        "LM_STUDIO_BASE_URL": "http://localhost:1234/v1",
        "LM_STUDIO_TIMEOUT": "300000"
      }
    }
  }
}
```

### Using Z.AI (Cloud)

This option provides high-accuracy OCR using GLM-4V models.

Configuration in `mcp.json`:
```json
{
  "mcpServers": {
    "doc-processor": {
      "command": "node",
      "args": ["/absolute/path/to/mcp-doc-processor/src/index.js"],
      "env": {
        "VISION_PROVIDER": "zai",
        "Z_AI_API_KEY": "your-api-key-here",
        "Z_AI_MODE": "ZAI"
      }
    }
  }
}
```

### Environment Variables

The following environment variables control server behavior:

| Variable | Description | Default |
|-----------|-------------|----------|
| VISION_PROVIDER | OCR connector to use ("lm-studio" or "zai") | lm-studio |
| LM_STUDIO_BASE_URL | URL for local LLM server | http://localhost:1234/v1 |
| Z_AI_API_KEY | API key for Z.AI services | - |
| Z_AI_MODE | Platform mode for Z.AI | ZAI |

## Usage

Once configured in your MCP client, the following tools become available for document processing.

### Document Reading Tools

#### get-doc-summary

Provides a high-level overview including document structure, sections, and content summary. This tool extracts embedded images and includes them in the response.

Example usage:
```javascript
{
  "filePath": "/Users/me/documents/report.pdf"
}
```

Best suited for getting a quick understanding of document contents without processing the entire text.

#### get-doc-focused

Performs targeted analysis based on your specific query. This tool may ask clarification questions if the document is large or ambiguous, helping refine the analysis to your needs.

Example usage:
```javascript
{
  "filePath": "/Users/me/documents/contract.docx",
  "userQuery": "What are the termination conditions?"
}
```

This tool is most useful when you have specific questions about the document content.

#### get-doc-indepth

Returns comprehensive information including full text, headers, structure hierarchy, and image data.

Example usage:
```javascript
{
  "filePath": "/Users/me/documents/data.xlsx"
}
```

Use this when you need complete access to all document information for detailed analysis.

### Document Creation Tools

#### create-doc

Creates DOCX documents with titles, paragraphs, and tables. The generated files are suitable for reports or templates.

Input parameters:
- `title` (required): Document title, appears as Heading 1
- `paragraphs` (optional): Array of paragraph strings or paragraph objects with styling
- `tables` (optional): Array of tables, each as a 2D array
- `stylePreset` (optional): "minimal", "professional", or "colorful"
- `style` (optional): Custom styling object to override preset defaults
- `outputPath` (optional): Output file path, defaults to ./output/document.docx

Example with basic content:
```javascript
{
  "title": "Project Report",
  "paragraphs": [
    "This document was generated programmatically.",
    "It contains structured content."
  ]
}
```

Example with professional styling:
```javascript
{
  "title": "Quarterly Report",
  "paragraphs": [
    {
      "text": "Executive Summary",
      "bold": true,
      "color": "336699"
    }
  ],
  "stylePreset": "professional"
}
```

#### create-excel

Creates Excel workbooks with multiple sheets and data. Supports column widths, row heights, and comprehensive styling.

Input parameters:
- `sheets` (required): Array of sheet definitions, each with name and data
- `stylePreset` (optional): "minimal", "professional", or "colorful"
- `style` (optional): Custom styling with font, column widths, row heights
- `outputPath` (optional): Output file path, defaults to ./output/data.xlsx

Example with multiple sheets:
```javascript
{
  "sheets": [
    {
      "name": "Departments",
      "data": [["ID", "Name"], [1, "Engineering"], [2, "Marketing"]]
    },
    {
      "name": "Employees",
      "data": [["Emp ID", "Dept ID"], [1001, 1], [1002, 2]]
    }
  ],
  "stylePreset": "professional"
}
```

## Styling System

The document creation tools include a comprehensive styling system that provides consistent formatting across documents.

### Style Presets

Three pre-configured presets are available for common use cases:

**Minimal** (default)
- Clean, simple formatting
- 11pt black font
- Left alignment
- Minimal spacing

**Professional**
- Enhanced readability
- 12pt blueish font
- Improved spacing (1.15 line height)
- Better visual hierarchy

**Colorful**
- Visually striking formatting
- 11pt red font
- Center alignment
- Double borders on tables

### Custom Styling Options

You can override preset values with custom styling for fine-grained control.

**DOCX Styling Properties**
- Font: size, color, bold, italics, underline, fontFamily
- Paragraph: alignment, spacingBefore, spacingAfter, lineSpacing
- Table: borderColor, borderStyle, borderWidth

**Excel Styling Properties**
- Font: size, color, bold, italics, underline
- Dimensions: columnWidths (map of index to width), rowHeights (map of index to height)
- Header: headerBold (boolean for first row)

### Styling Example

Combining preset with custom overrides:
```javascript
{
  "title": "Custom Report",
  "stylePreset": "professional",
  "style": {
    "font": {
      "size": 14,
      "color": "FF00AA"
    },
    "table": {
      "borderColor": "00AA00",
      "borderStyle": "double"
    }
  }
}
```

## OCR and Document Analysis

The PDF parser includes three advanced services that work together to enhance document processing accuracy.

### Layout Analysis

Analyzes document structure before processing to understand page layout, text blocks, images, and potential tables.

**What it identifies:**
- Text block patterns (paragraphs, sections)
- Image regions and density
- Potential table structures
- Document type classification (structured, image-heavy, text-dense, mixed)

**Benefits:**
- Informs OCR decisions with document context
- Generates layout-aware OCR prompts
- Provides metadata for downstream analysis

### OCR Post-Processing

Uses AI to refine OCR output and fix common errors while preserving document structure.

**What it does:**
- Detects common OCR artifacts (broken words, spacing issues)
- Applies conservative character substitutions only when clearly wrong
- Reconstructs text broken across line breaks
- Maintains document structure (headers, paragraphs, lists)

**Benefits:**
- Improves OCR accuracy with confidence scoring
- Preserves original formatting and meaning
- Handles edge cases gracefully with fallback to basic cleaning

### Table Detection and Extraction

Dedicated service for detecting and extracting tables from documents.

**What it does:**
- Detects multiple table patterns (markdown, tab-separated, column-aligned)
- Extracts tables using AI with markdown formatting
- Processes both text-based and image-based tables

**Benefits:**
- Accurate table extraction with confidence scores
- Preserves table structure in markdown format
- Handles merged cells and special formatting

### Processing Flow

The PDF parser follows this enhanced workflow:

1. Load PDF file
2. Extract text and images
3. Run Layout Analysis
4. Determine if OCR needed (improved with layout context)
5. If OCR needed: Perform OCR with layout-aware prompts
6. Post-process OCR output
7. Extract tables from document (applies to both OCR and non-OCR paths)
8. Return enhanced results with:
   - Original text and images
   - Layout analysis metadata
   - OCR post-processing metadata
   - Extracted tables

### Enhanced Result Structure

The PDF parser returns an expanded result object with metadata:

```javascript
{
  success: true,
  text: "final processed text",
  pages: number_of_pages,
  metadata: { /* PDF metadata */ },
  images: [/* extracted images */],
  isImageBased: boolean,
  ocrApplied: boolean,
  ocrSource: "vision-service-name" | null,
  layoutAnalysis: {
    success: true,
    pages: [/* per-page analysis */],
    totalPages: number,
    layoutSummary: string,
    structureType: "structured-document" | "image-heavy-document" | "text-dense-document" | "mixed-document"
  },
  ocrPostProcessing: {
    processedText: "improved text",
    improvements: [/* array of improvement objects */],
    confidence: number (0.75-0.95),
    processingSteps: ["Initial OCR extraction", ...]
  },
  tables: [
    {
      type: "markdown" | "tab-separated" | "column-aligned" | "header-separator",
      content: "raw table content",
      formattedContent: "markdown formatted table",
      confidence: number,
      source: "text" | "image"
    }
  ],
  tableCount: number
}
```

## Architecture

This project uses a modular service-oriented architecture located in the `src/` directory.

### Core Libraries

- pdf-parse: Used for PDF text extraction with a modified approach for image extraction
- mammoth: Converts DOCX to raw text while preserving basic formatting
- jszip: Unzips DOCX/XLSX files to access internal media directories
- xlsx: Parses Excel spreadsheets to extract cell data across multiple sheets
- docx: Creates DOCX documents with rich formatting support

### Directory Structure

- src/tools/: Contains MCP tool handlers (summary-tool.js, etc.) that handle protocol layer validation and response formatting
- src/services/:
  - document-processor.js: Main facade detecting file types and routing to correct parser
  - vision-factory.js: Determines which OCR connector to use based on configuration
  - zai-vision.js / lm-studio-service.js: Connector implementations for vision providers
  - layout-analyzer.js: Document structure analysis service
  - ocr-postprocessor.js: AI-based text refinement service
  - table-extractor.js: Table detection and extraction service
- src/parsers/: File-type specific parsing logic (pdf-parser.js, docx-parser.js, etc.)
- src/tools/styling.js: Centralized styling configuration module

### How OCR Works

1. Detection: The PDF parser analyzes text density versus image count
2. Routing: If the document is image-heavy (scanned), it delegates to VisionFactory
3. Processing: The factory invokes the configured provider (LM Studio or Z.AI) to analyze the page and extract text
4. Merging: OCR results are merged with any native text found to create a unified document representation

### Styling Implementation

The styling system follows a centralized configuration pattern with three main components:

1. Styling Configuration Module (src/tools/styling.js)
   - Core style definitions and presets
   - Style application helper functions
   - Cross-document type utilities

2. Document Creation Tools
   - create-doc.js: DOCX styling implementation
   - create-excel.js: Excel styling implementation

3. Style Presets
   - Pre-configured style combinations (minimal, professional, colorful)
   - Mergeable with custom options for fine-grained control

## Testing

The project includes a comprehensive test suite to verify all functionality.

### Running Tests

To verify the system against real documents:
```bash
npm test
```

### Test Coverage

The test suite covers:

**Integration Tests** (test/integration.js)
- Tests all document reading tools (get-doc-summary, get-doc-indepth, get-doc-focused)
- Verifies file type detection
- Confirms parsers (PDF, DOCX, XLSX) are functioning
- Validates OCR connectors (LM Studio/Z.AI) are reachable
- Ensures all MCP tools return valid responses

**Document Creation Tests** (test/create-tools.js)
- Verifies DOCX creation with tables from JSON input
- Validates Excel workbook generation with multiple sheets
- Tests edge cases and programmatic usage

**OCR Improvements Tests** (test-ocr-improvements.js)
- Tests Document Layout Analyzer functionality
- Validates OCR Post-Processor behavior
- Confirms Table Extraction accuracy
- Verifies integrated PDF parser with all improvements

**Styling Demonstration** (test-styling.js)
- Demonstrates all available styling options and presets
- Creates sample documents with different styling configurations
- Validates style merging and overrides

### Test Files

Place sample documents for testing in the `testfiles/` directory. The test runner will automatically process these files through all available tools.

## Troubleshooting

### Server Management

Starting the server: The server starts automatically when your MCP client uses the command definition in `mcp.json`.

Stopping/Restarting: To apply configuration changes (like switching vision providers), restart the server:
- Mac/Linux: `pkill -f mcp-doc-processor` or restart your MCP client application
- LM Studio: Go to Settings, then MCP Servers, and toggle Off/On

### Common Issues

File not found errors: Ensure the filePath provided to tools is an absolute path on your local machine, not a relative path.

OCR not working:
- Check that VISION_PROVIDER is set correctly
- For LM Studio, ensure a vision-capable model (VLM) is loaded in the Local Server tab
- Check logs in logs/server.log for connection errors

Images missing: Some formats (like legacy .doc or complex Excel sheets) might not support image extraction. Ensure files are .docx, .xlsx, or .pdf format.

Styling not applied:
- Verify the stylePreset is one of: "minimal", "professional", or "colorful"
- Check that color values are 6-digit hex codes without the hash prefix (e.g., "FF0000" not "#FF0000")
- Ensure custom style properties match the documented structure

Tables not extracted from OCR'd PDFs: This issue has been fixed. If you experience it, ensure you have the latest version of the code.

Processing seems slow: Enhanced processing adds overhead:
- Layout Analysis: Approximately 5-10 seconds
- OCR Post-processing: Approximately 3-5 seconds per document
- Table Extraction: Approximately 5-15 seconds (depends on number of tables)

## Performance Characteristics

Document Reading Tools:
- PDF with OCR: 30-60 seconds depending on document complexity
- PDF without OCR: 5-10 seconds
- DOCX files: 2-5 seconds
- Excel files: 1-3 seconds

Document Creation Tools:
- create-doc: Typically less than 100ms for typical documents, styling adds approximately 10-20ms
- create-excel: Approximately 200ms with styling for typical workbooks

Performance scales linearly with data size. No memory leaks have been observed in testing, making the system suitable for real-time generation.

## Current Capabilities and Limitations

### Document Reading Capabilities

PDF Processing:
- Text extraction from native PDF text
- OCR for image-based PDFs with two provider options
- Embedded image extraction
- Layout analysis and structure understanding
- Table detection and extraction
- OCR post-processing for accuracy improvement

DOCX Processing:
- Rich text extraction
- Media (image) extraction from embedded content
- Basic formatting preservation

Excel Processing:
- Multi-sheet text and data extraction
- Cell-level data access
- Basic structure preservation

### Document Generation Capabilities

DOCX Generation:
- Font properties: size, color, bold, italics, underline, fontFamily
- Paragraph formatting: alignment, spacingBefore, spacingAfter, lineSpacing
- Table styling: borderColor, borderStyle, borderWidth
- Three pre-configured presets: minimal, professional, colorful
- Custom style merging with preset overrides

Excel Generation:
- Font properties: size, color, bold, italics, underline
- Column and row dimensions: columnWidths, rowHeights
- Header bold formatting
- Three pre-configured presets: minimal, professional, colorful
- Per-sheet and global styling options

### Known Limitations

DOCX Styling:
- Cell-level borders are limited; table-level borders are preferred
- Font size conversion is required internally (points to twips)
- Style IDs must be predefined in docx.js

Excel Styling:
- Style preservation is limited compared to docx.js
- No font family support in Excel styling
- Style application modifies worksheet objects directly
- Limited border customization

OCR and Analysis:
- Processing time increases with enhanced features
- Requires external vision service (LM Studio or Z.AI)
- Layout analysis accuracy depends on document complexity

## Project Files

This section provides an overview of key project files and their purposes.

### Core Application Files

- src/index.js: Main MCP server entry point with tool registration
- src/tools/: MCP tool handlers for document operations
- src/parsers/: File-type specific parsing implementations
- src/services/: Supporting services for vision, styling, and analysis

### Documentation Files

- README.md: This comprehensive documentation
- BUG_FIXES_SUMMARY.md: Historical record of bugs fixed

### Configuration Files

- package.json: Project dependencies and scripts
- mcp.json: MCP server configuration (example)

### Test Files

- test/integration.js: Comprehensive integration test suite
- test/create-tools.js: Document creation tool tests
- test/test-doc-input.json: Sample DOCX structure for testing
- test/test-excel-input.json: Sample Excel structure for testing
- test-ocr-improvements.js: OCR enhancement validation script
- test-styling.js: Styling demonstration script

## Best Practices

### For Document Reading

Always provide absolute file paths to tools. Relative paths may cause file not found errors.

Choose the appropriate tool for your use case:
- get-doc-summary for quick overviews
- get-doc-indepth for complete access
- get-doc-focused for targeted queries

Check the success flag in responses and handle errors gracefully. All tools return structured success/failure indicators.

### For Document Creation

Specify all required fields in your input. For create-doc, the title is required. For create-excel, sheets with name and data are required.

Use absolute paths for output when possible to avoid confusion about file locations.

Validate data structures before calling tools, particularly for arrays and nested objects.

Start with a style preset that matches your requirements, then customize only specific properties you need:
```javascript
{
  "stylePreset": "professional",
  "style": {
    "font": { size: 14 }  // Only override what you need
  }
}
```

Check the success flag in responses to verify file creation succeeded.

### For Styling

Use 6-digit hex color codes without the hash prefix: "FF0000" not "#FF0000".

Test styling changes with sample data before using them in production.

Use the same style preset across related documents for consistency.

For DOCX, remember that font sizes are automatically converted from points to twips (multiplied by 20 internally).

### For OCR and Analysis

Consider using LM Studio for privacy-critical documents, as processing stays local.

Use Z.AI for highest OCR accuracy when internet access is available.

Allow sufficient time for processing, especially with layout analysis and table extraction enabled.

Review confidence scores in ocrPostProcessing metadata to assess text quality.

## Recent Improvements

The following bugs have been identified and fixed in recent versions:

### Table Extraction Inconsistency (Fixed)
Issue: Table extraction only occurred in the non-OCR path, causing image-based PDFs to return empty table arrays.

Resolution: Moved table extraction and parser cleanup outside the OCR conditional block, ensuring tables are extracted for all PDF types.

Impact: Tables are now properly extracted from both OCR'd and native text PDFs, providing consistent behavior across document types.

### Missing Styling Parameters in MCP Schemas (Fixed)
Issue: The styling system was fully implemented but not exposed in the MCP tool schemas, making it inaccessible to users.

Resolution: Added comprehensive styling parameters (stylePreset and full style object) to both create-doc and create-excel tool schemas.

Impact: Users can now specify presets and custom options for document creation, enabling the full range of styling capabilities through the MCP interface.

### Documentation Inconsistency (Fixed)
Issue: Documentation significantly understated the styling capabilities of the document generation tools.

Resolution: Rewrote the capabilities section to accurately reflect the full feature set available in the code.

Impact: Users can now see the complete range of styling options available, improving understanding and adoption of these features.

## License

MIT