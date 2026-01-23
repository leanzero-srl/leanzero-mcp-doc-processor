# MCP Document Processor

Welcome to the MCP Document Processor. This is a Model Context Protocol server that helps you work with PDF, DOCX, and Excel files in a more intelligent way. The server extracts text, understands document structure, pulls out metadata and embedded images, and even creates new documents with professional styling. It is designed to work with AI agents like LM Studio, Cline, or Roo Code so they can read and understand complex documents through standardized tools.

The system also includes the ability to generate documents, not just read them. This means you can create DOCX reports and Excel spreadsheets with customizable styling options to match your needs.

## About LeanZero

This project is part of the LeanZero ecosystem, focused on building tools that help developers work more efficiently with AI and document processing. For more information about our work, additional resources, tutorials, and community discussions, visit [leanzero.atlascrafted.com](https://leanzero.atlascrafted.com). You can also join our Discord community directly from the website for conversations with other developers working on similar projects.

## NEW: Atomic Duplicate Prevention Fix

The duplicate file prevention feature has been completely rewritten to properly handle concurrent file creation requests. Previously, there was a race condition where multiple simultaneous calls could all return the same filename because the locking mechanism was not truly atomic.

### What Was Fixed

The original implementation created unique lock directories for each call (using timestamps and random IDs), which meant concurrent calls never actually competed for the same lock. All 20 concurrent requests would acquire their own locks simultaneously and return the same path, defeating the purpose of duplicate prevention.

The fix implements proper mutual exclusion with three key changes:

First, all concurrent calls now compete for a shared lock directory per base filename. Instead of creating `.lock.filename.uniqueId`, the system now uses `.lock.filename` so all calls for the same file must wait for the same lock.

Second, the system now creates placeholder files while holding the lock. When a unique path is determined, an empty file is immediately created at that location before releasing the lock. This reserves the path so subsequent callers see it as taken and select the next available suffix.

Third, a spin-wait retry mechanism handles lock contention. When another caller holds the lock, the system retries up to 50 times with 20 millisecond delays before falling back to a timestamp-based unique name.

### Additional Fixes Applied

Several related issues were also resolved during this update:

The fs module import was corrected from callback-based to promise-based API. The code was using `await fs.access()` but importing from the callback-based `fs` module instead of `fs/promises`.

A syntax error in utils.js was fixed where a stray catch block had no matching try statement, preventing the module from loading.

The ensureDirectory function was updated to use the correct fs.mkdir call after the import change.

The order of operations in create-doc.js was corrected so that docs folder enforcement runs before duplicate prevention. This ensures placeholder files are created in the final target directory rather than the original path.

### Test Results

The fix has been validated with comprehensive tests:

- Atomic duplicate prevention tests: 7 out of 7 passing
- Organization enforcement tests: 9 out of 9 passing  
- Concurrent test: 20 simultaneous calls correctly return 20 unique paths

The duplicate prevention feature is now production-ready and handles concurrent requests correctly.

## What This Project Can Do For You

Think of this as having a smart assistant for your documents. Here is what it handles across different file types:

### Working With PDF Files

The PDF processor is quite sophisticated. When you give it a PDF file, the system first tries to read any text that is embedded directly in the document. This works well for modern PDFs that were created digitally. However, many PDFs are scanned images or photographs of documents where the text cannot be extracted directly. For these cases, the system uses optical character recognition (OCR) with the help of vision models.

The PDF processing has three main enhancements that work together:

First, there is a layout analyzer that looks at the structure of each page before attempting to read it. This helps the system understand whether a document is organized into columns, has many images, or is text-heavy. This contextual information improves how well the OCR works.

Second, after extracting text (either natively or through OCR), there is a post-processor that refines the results. It looks for common OCR problems like words that are broken across lines, unusual spacing, or character substitutions that are clearly wrong. The system uses artificial intelligence to fix these issues while being careful to preserve the actual meaning of the document.

Third, there is a dedicated table extractor that finds tables in the document and pulls them out properly formatted. This works on both text-based PDFs and image-based PDFs that have been processed through OCR. Tables are detected in various formats like markdown tables, tab-separated data, or column-aligned information, and are extracted with confidence scores so you know how reliable the extraction is.

### Working With DOCX Files

For Word documents in DOCX format, the system extracts rich text content while preserving basic formatting. It can also pull out any images or media that are embedded in the document. This is particularly useful when you have reports or documents that contain diagrams, charts, or photos alongside the text.

### Working With Excel Files

Excel files are handled by reading data across multiple sheets. The system extracts all the cell values and can work with workbooks that have numerous tabs of information. This is helpful when you need to analyze financial data, lists, or structured information that is organized in spreadsheet format.

### Creating New Documents

Beyond just reading documents, you can also create them. The system provides two tools for document generation with comprehensive styling capabilities:

The DOCX creation tool lets you build Word documents with titles, paragraphs, tables, headers, and footers. You can apply seven different styling presets or customize the formatting to match your needs. The system supports three heading levels (heading1, heading2, heading3) with distinct styling for better visual hierarchy. This is useful for generating executive summaries, strategic documents, legal agreements, technical documentation, or producing consistent documentation with professional typography.

The Excel creation tool allows you to build spreadsheets with multiple sheets. You can control column widths, row heights, font styling, and header formatting with background colors. All seven styling presets include optimized Excel header backgrounds and colors. This helps when you need to generate data exports, create standardized report formats, or produce structured outputs from your applications with professional spreadsheet styling.

The enhanced styling system provides sophisticated typography options. The professional preset uses Garamond serif font with full justification for formal, established documents. The business preset uses modern Calibri with refined blue color palette for contemporary communications. The legal preset follows traditional legal standards with Times New Roman, double spacing, and underlined headings. Each preset includes optimized spacing, color schemes, and heading hierarchies designed for specific document types.

## Getting Started With The System

Getting the MCP Document Processor running on your machine is straightforward. You will need Node.js installed, and then you can set up the server to work with your preferred tools.

### Installing The Dependencies

First, you need to install the required packages. Open your terminal or command prompt and navigate to the project directory. Then run the following command to download and install everything that is needed:

```bash
npm install
```

This will install all the libraries that handle PDF parsing, Excel file manipulation, DOCX creation, and the various utilities that the system uses.

### Verifying That Everything Works

Once the installation is complete, you can run the test suite to make sure everything is functioning correctly on your system. This is a good practice because it confirms that all the parsers are working, the vision service can connect, and the basic tools are operating as expected.

```bash
npm test
```

The test suite will check several document formats and processing scenarios. It looks for test files in the testfiles directory and processes them through all the available tools to verify they work correctly.

### Running The Server

When you are ready to use the system, you need to start the MCP server. The server is what listens for requests from your AI assistant or tool and responds by processing documents. You can start it with:

```bash
npm start
```

This command starts the server and it will begin listening for incoming requests. The server logs its activity, so if you need to troubleshoot any issues, you can check the log files to see what is happening.

## Configuring The Vision Service

The system uses a vision service provider strategy to handle OCR and image analysis. This means you can choose between running everything locally on your machine for privacy, or using a cloud service for potentially higher accuracy.

### Using LM Studio Locally

The local option is recommended if you want to keep everything on your own machine and do not want your documents being sent to external services. You will need to have LM Studio installed and running with a vision-capable model loaded. Good model choices include qwen2-vl or llava, which are designed to understand both text and images.

To configure this option, you would set up your mcp.json configuration file like this:

```json
{
  "mcpServers": {
    "doc-processor": {
      "command": "node",
      "args": ["/absolute/path/to/mcp-doc-processor/src/index.js"],
      "env": {
        "VISION_PROVIDER": "lm-studio",
        "LM_STUDIO_BASE_URL": "http://localhost:1234/api/v0",
        "LM_STUDIO_TIMEOUT": "30000"
      }
    }
  }
}
```

The important part here is the VISION_PROVIDER being set to lm-studio, which tells the system to use your local LM Studio instance. You also need to make sure the path in the args field points to the correct location where you have the project installed.

### Using Z.AI Cloud Service

If you prefer to use a cloud service that might offer higher accuracy or have more powerful models, you can configure the system to use Z.AI. This service uses the GLM-4V models and requires an internet connection to send documents for processing.

The configuration for Z.AI looks like this:

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

When using Z.AI, you need to provide your API key in the configuration. The system will then send documents to the Z.AI service for processing when OCR is needed.

### Understanding Environment Variables

The system supports several environment variables to customize behavior:

- **VISION_PROVIDER**: Choose between "lm-studio" (local) or "zai" (cloud)
- **LM_STUDIO_BASE_URL**: URL for your local LM Studio server (default: http://localhost:1234/api/v0)
- **LM_STUDIO_TIMEOUT**: Timeout in milliseconds for LM Studio operations (default: 30000)
- **SKIP_TABLE_EXTRACTION**: Skip table extraction to prevent timeouts (default: true)
- **TABLE_EXTRACTOR_TIMEOUT**: Timeout per table extraction in milliseconds (default: 15000)
- **Z_AI_API_KEY**: Your Z.AI API key for cloud vision service
- **Z_AI_MODE**: Mode for Z.AI service (default: ZAI)

### Enabling Table Extraction

Table extraction is disabled by default to prevent performance issues and timeouts. If you need table extraction functionality, set the environment variable:

```bash
export SKIP_TABLE_EXTRACTION=false
```

When enabled, table extraction will:
- Detect tables in various formats (markdown, tab-separated, column-aligned, header-separator)
- Use AI to extract and format complex tables
- Process up to 5 images from the document
- Apply a 15-second timeout per table extraction operation

Note that enabling table extraction will significantly increase processing time, especially for documents with many images or complex tables. Each table may require a separate AI call which can add 15+ seconds per table. For most use cases, the document structure and text extraction provided by `get-doc-summary` and `get-doc-indepth` are sufficient without explicit table extraction.


There are several environment variables that control how the system behaves. You might not need to set all of these, but it is helpful to understand what they do:

- VISION_PROVIDER: This determines which vision service to use. The value should be either lm-studio or zai. If you do not set this, it defaults to lm-studio.
- LM_STUDIO_BASE_URL: This is the URL where your local LM Studio server is running. The default is http://localhost:1234/v1, but you can change this if you have configured LM Studio to run on a different port.
- Z_AI_API_KEY: This is your personal API key for the Z.AI service. You only need this if you choose to use Z.AI as your vision provider.
- Z_AI_MODE: This specifies which platform mode to use with Z.AI. The value should be ZAI.

## Using The Document Tools

Once you have the server configured and running in your MCP client (like LM Studio, Cline, or other tools), you can access several tools for working with documents.

### Getting A Document Summary

The summary tool gives you a high-level overview of a document. This is perfect when you want to quickly understand what a document is about without reading through all the details. It extracts the main sections, provides metadata about the document (like creation date, author, page count), and identifies any images that are embedded in the file.

To use this tool, you simply provide the file path:

```javascript
{
  "filePath": "/Users/me/documents/report.pdf"
}
```

The system will process the document and return a structured summary that includes the most important information at a glance.

### Asking Focused Questions About A Document

Sometimes you have a specific question about a document, or you want the system to help you understand what it should focus on. The focused tool lets you ask a question and the system will analyze the document with that question in mind. If the document is large or complex, the system might even ask you some clarification questions to make sure it understands exactly what you are looking for.

For example, you might ask:

```javascript
{
  "filePath": "/Users/me/documents/contract.docx",
  "userQuery": "What are the termination conditions mentioned in this agreement?"
}
```

The system will then search through the document specifically for information related to your question and provide a targeted response.

### Getting Complete Document Details

When you need everything in a document, the in-depth tool provides comprehensive access to all the information. This includes the full text content, complete structural hierarchy, all formatting details, and every image that was extracted. Use this when you need to perform detailed analysis or work with all the content programmatically.

```javascript
{
  "filePath": "/Users/me/documents/data.xlsx"
}
```

This returns the complete document representation, which is useful when you are building applications that need to access or process all of the document information.

### Creating DOCX Files on Disk

The create-doc tool writes an actual Word DOCX document to your filesystem. You provide a title, any paragraphs you want, and optionally tables, headers, footers, and background colors, and the system creates a properly formatted DOCX file at the specified path (or ./output/document.docx if not provided).

**IMPORTANT:** This tool WRITES TO DISK - it doesn't just prepare content. The response contains the absolute filePath where the .docx file was created. AI models should use this returned filePath to reference the document and should NOT create any additional markdown or text files.

The basic usage looks like this:

```javascript
{
  "title": "Project Report",
  "paragraphs": [
    "This document was generated programmatically.",
    "It contains structured content and tables."
  ]
}
```

You can also add tables to your document by providing them as two-dimensional arrays:

```javascript
{
  "title": "Employee Status Report",
  "paragraphs": ["Current employee assignments:"],
  "tables": [[
    ["Employee ID", "Name", "Department", "Status"],
    [1, "Alice", "Engineering", "Active"],
    [2, "Bob", "QA", "Inactive"]
  ]]
}
```

The system will create tables with proper formatting and borders automatically.

### Adding Headers and Footers to DOCX

You can add headers and footers to your documents for professional presentation. Headers appear at the top of each page, and footers appear at the bottom. Use `{{page}}` in footer text to insert automatic page numbers:

```javascript
{
  "title": "Quarterly Report",
  "paragraphs": ["This report covers Q4 performance metrics."],
  "header": {
    "text": "Q4 2024 Financial Report - Confidential",
    "alignment": "center"
  },
  "footer": {
    "text": "Page {{page}} of 10", // Will show as: Page 1 of 10, Page 2 of 10, etc.
    "alignment": "center"
  }
}
```

Headers and footers support left, center, and right alignment options.

### Setting Document Background Color

You can set a page background color for your documents using the `backgroundColor` parameter:

```javascript
{
  "title": "Special Announcement",
  "paragraphs": ["Important company news to share."],
  "backgroundColor": "#F5F5F5" // Light gray background
}
```

Use six-digit hex color codes (without the # symbol) for best results.

### Creating Excel Files on Disk

The create-excel tool writes an actual Excel XLSX workbook to your filesystem with multiple sheets. You define each sheet with a name and the data it should contain, and the system creates a properly formatted .xlsx file at the specified path (or ./output/data.xlsx if not provided).

**IMPORTANT:** This tool WRITES TO DISK - it doesn't just prepare content. The response contains the absolute filePath where the .xlsx file was created. AI models should use this returned filePath to reference the workbook and should NOT create any additional markdown or text files. This is particularly useful when you need to export data in a structured format or create reports that others can work with in Excel.

Here is how to create a simple Excel file:

```javascript
{
  "sheets": [
    {
      "name": "Sales Data",
      "data": [
        ["Month", "Revenue", "Profit"],
        ["January", "$150,000", "$30,000"],
        ["February", "$180,000", "$40,000"]
      ]
    }
  ]
}
```

You can create multiple sheets in a single workbook:

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
  ]
}
```

## Styling Your Documents

The document generation tools include a comprehensive styling system that makes it easy to create professional-looking documents without needing to understand all the formatting details yourself. The system provides pre-configured presets that cover common use cases, and you can also customize any aspect of the styling to get exactly the appearance you want.

### Understanding Style Presets

There are seven built-in style presets that you can use as starting points. These are designed to cover common document needs without requiring you to specify every formatting detail:

The minimal preset provides clean, simple formatting with black text at 11 points, left alignment, and basic spacing. This is useful for everyday documents where clarity is more important than decoration.

The professional preset uses sophisticated traditional formatting with Garamond serif font at 11 points, full justification for polished appearance, and enhanced spacing (1.25 line height). This creates documents that look formal and established, suitable for executive summaries, strategic documents, and formal reports.

The technical preset uses clean formatting with Arial font at 11 points, left alignment, and optimized spacing (1.15 line height). This creates documents ideal for technical documentation, API documentation, and user manuals where clarity and readability are paramount.

The legal preset uses traditional legal formatting with Times New Roman serif font at 12 points, full justification, double spacing, and underlined headings. This meets legal document standards for contracts, agreements, and legal briefs.

The business preset uses modern polished formatting with Calibri font at 11 points, refined blue color palette, and enhanced spacing (1.2 line height). This creates contemporary documents suitable for product launches, business proposals, and go-to-market plans.

The casual preset uses friendly formatting with Verdana font at 12 points, warm orange colors, and comfortable spacing (1.15 line height). This creates approachable documents for internal communications, team updates, and friendly materials.

The colorful preset makes documents visually striking with Arial font at 12 points, vibrant purple colors, and center alignment. This can be useful for presentations, marketing materials, and documents requiring visual impact.

### Customizing Document Appearance

When presets do not quite match what you need, you can override specific properties while keeping the rest of the preset. This gives you control over individual aspects without having to configure everything from scratch.

For DOCX documents, you can control font properties like size, color, bold, italic, underline, and font family. You can also adjust paragraph formatting including alignment (left, center, right, or full justification), spacing before and after paragraphs, and line spacing. Tables can be customized with border color, border style, and border width. You can also use three heading levels (heading1, heading2, heading3) with distinct styling for visual hierarchy.

For Excel documents, you can control font properties including size, color, bold, italic, and underline. You can set specific column widths and row heights to control the layout of your spreadsheet. The header bold option makes the first row stand out, which is useful for data tables. You can also customize header background colors for different preset styles.

Here is an example of combining a preset with custom overrides:

```javascript
{
  "title": "Quarterly Report",
  "paragraphs": [
    {
      "text": "Executive Summary",
      "headingLevel": "heading1"
    },
    "This comprehensive analysis examines..."
  ],
  "tables": [
    ["Metric", "Current", "Target"],
    ["Revenue", "$2.4M", "$3.5M"],
    ["Growth", "15%", "25%"]
  ],
  "stylePreset": "professional",
  "header": {
    "text": "Q4 Financial Results - Confidential",
    "alignment": "left",
    "color": "666666"
  },
  "footer": {
    "text": "Page {{page}} | Document Ref: QR-2025-001",
    "alignment": "center",
    "color": "666666"
  },
  "backgroundColor": "FFFFFFEF",
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

This example starts with the professional preset but then increases the font size, adds heading levels with proper styling, includes headers and footers with alignment and colors, and changes the table styling. Only the properties you specify will override the preset values.

### Working With Colors

The system uses hexadecimal color codes without the hash symbol. When you specify colors, use six-digit codes like "FF0000" for red or "336699" for blue. Do not include the hash symbol at the beginning.

### Using Heading Levels

All style presets support three heading levels (heading1, heading2, heading3) with distinct styling for better visual hierarchy. H1 headings use the largest font size and substantial spacing, making them stand out as main document sections. H2 headings are smaller than H1 with medium spacing, suitable for subsections within main sections. H3 headings are the smallest with refined spacing, appropriate for detailed breakdowns within subsections.

Each preset applies unique styling to heading levels. The professional preset uses underlined H1 headings and italic H2 headings with Garamond serif font. The legal preset underlines both H1 and H2 headings following traditional legal conventions. The business preset uses refined blue color gradient across heading levels with modern Calibri font. The casual preset uses warm orange colors that progress from dark to light across heading levels. The colorful preset uses vibrant purple colors with the largest heading sizes.

Here is an example of using heading levels in your document:

```javascript
{
  "title": "Project Plan",
  "paragraphs": [
    {
      "text": "Executive Overview",
      "headingLevel": "heading1"
    },
    "This document outlines the strategic approach...",
    {
      "text": "Market Analysis",
      "headingLevel": "heading1"
    },
    {
      "text": "Target Market",
      "headingLevel": "heading2"
    },
    "Our research indicates...",
    {
      "text": "Competitive Landscape",
      "headingLevel": "heading2"
    },
    "Key competitors include...",
    {
      "text": "Market Size",
      "headingLevel": "heading3"
    },
    "The total addressable market..."
  ],
  "stylePreset": "business"
}
```

### Style Preset Comparison

Here is a comprehensive comparison of all seven style presets to help you choose the right one for your needs:

| Feature | Minimal | Professional | Technical | Legal | Business | Casual | Colorful |
|---------|---------|--------------|-----------|-------|----------|--------|----------|
| Font | Arial | Garamond | Arial | Times New Roman | Calibri | Verdana | Arial |
| Body Size | 11pt | 11pt | 11pt | 12pt | 11pt | 12pt | 12pt |
| H1 Size | 16pt | 16pt | 16pt | 16pt | 18pt | 18pt | 20pt |
| H2 Size | 14pt | 14pt | 14pt | 14pt | 15pt | 16pt | 17pt |
| H3 Size | 12pt | 12pt | 12pt | 13pt | 13pt | 14pt | 15pt |
| Justification | Left | Full | Left | Full | Left | Left | Center |
| Line Spacing | 1.0 | 1.25 | 1.15 | 2.0 | 1.2 | 1.15 | 1.0 |
| Paragraph Spacing | 120 | 180 | 120 | 240 | 140 | 120 | 120 |
| Excel Header BG | #4472C4 | #3A3A3A | #000000 | #FFFFFF | #1F4E79 | #FF9800 | #7B1FA2 |

Choose the minimal preset for clean, uncluttered everyday documents. Choose the professional preset for formal, established documents with traditional serif typography. Choose the technical preset for documentation requiring maximum readability and clarity. Choose the legal preset for contracts and agreements that must meet traditional legal standards. Choose the business preset for modern corporate communications and go-to-market materials. Choose the casual preset for friendly, approachable internal communications. Choose the colorful preset for presentations and materials requiring visual impact.

### Choosing The Right Preset

Different documents require different approaches to styling and presentation. Here are detailed guidelines for selecting the appropriate style preset based on your specific use case and audience.

For executive summaries and strategic documents targeting senior leadership, use the professional preset. The Garamond serif font with full justification creates an established, refined aesthetic that conveys authority and careful attention to detail. This preset is particularly effective for board presentations, quarterly reports, and strategic planning documents where traditional professionalism is valued.

For product launches and business proposals, use the business preset. The modern Calibri font with refined blue color palette creates a contemporary feel that suggests innovation and forward-thinking. This preset works well for go-to-market plans, investor presentations, and marketing materials where you want to appear modern and dynamic while maintaining professional credibility.

For contracts and legal agreements, use the legal preset. The Times New Roman font at 12 points with double spacing meets traditional legal document standards. This preset is essential for service agreements, non-disclosure agreements, and any document that may be subject to legal review or must comply with established legal formatting conventions.

For technical documentation and user manuals, use the technical preset. The Arial font with left alignment and optimized spacing ensures maximum readability. This preset is ideal for API documentation, software guides, and technical specifications where clarity and easy scanning of information are the primary requirements.

For internal communications and team updates, use the casual preset. The Verdana font with warm orange colors creates an approachable, friendly tone. This preset works well for project updates, team newsletters, and internal announcements where you want to maintain a welcoming atmosphere while still providing clear information.

For presentations and marketing materials, use the colorful preset. The vibrant purple colors with larger heading sizes create visual impact that captures attention. This preset is appropriate for conference presentations, marketing brochures, and materials where visual appeal and standing out are more important than traditional formality.

For simple internal documents and basic reports, use the minimal preset. The clean Arial font with neutral styling provides clarity without distraction. This preset is suitable for meeting notes, basic memos, and documents where the content itself is the focus and decorative styling might be unnecessary.

## How The System Works Internally

Understanding the technical architecture can help you troubleshoot issues or extend the system for your specific needs. The project is organized into several layers with clear responsibilities.

### The Core Libraries In Use

The system relies on several established libraries to handle different file formats. PDF parsing uses pdf-parse, which we have extended to access the raw PDF stream for image extraction. DOCX files are processed using mammoth to convert them to raw text while preserving basic formatting, and jszip is used to unzip the DOCX structure to access embedded media.

For Excel files, the xlsx library handles parsing the spreadsheet structure and extracting cell data across multiple sheets. When creating documents, docx is used for generating DOCX files with rich formatting support including headers, footers, page numbers, and background colors.

### How The Code Is Organized

The source code is structured in directories that separate concerns. The tools directory contains the handlers that respond to MCP requests and manage the protocol layer, including validating input and formatting responses. The services directory contains specialized modules for different capabilities.

Document processing is handled by file-type specific parsers in the parsers directory. Each parser knows how to work with its particular format and implements the common interface for consistency. The styling system is centralized in a dedicated module that both document creation tools use.

### How OCR Processing Happens

When the system encounters a PDF that appears to be image-based (either because there is very little extractable text or because the layout analysis indicates it), it initiates the OCR process. This is done through the vision service factory, which decides whether to use your local LM Studio or the cloud Z.AI service based on your configuration.

The vision service takes the PDF pages (either as images extracted from the file or as screenshots if possible) and sends them to the vision model. The model analyzes the visual content and returns the text it recognizes. This text is then merged with any native text that was extractable, creating a complete representation.

After OCR is complete, the post-processor refines the text by looking for and fixing common problems. Finally, the table extractor scans the complete text (both original and OCR-generated) to find any tables and extract them with proper formatting.

## Testing The System

The project includes several test files that verify different aspects of the system. Running these tests helps ensure that everything is working correctly on your machine and that changes do not break existing functionality.

### Integration Tests

The main integration test suite is in test/integration.js. This script finds documents in your testfiles directory and runs each one through all the available document reading tools. It checks that file type detection works correctly, that parsers can handle real files, and that the MCP protocol layer returns properly formatted responses.

For each test file, it verifies four scenarios: summary generation, in-depth extraction, focused analysis without a query, and focused analysis with a specific query. This comprehensive testing approach helps catch issues early.

### Document Creation Tests

The test/create-tools.js script specifically tests the document creation tools. It loads sample input data from JSON files and creates both DOCX and Excel documents. This validates that the tools can accept their input parameters, generate files correctly, and return proper success or error responses.

### OCR Improvement Tests

The test/test-ocr-improvements.js script validates the three OCR enhancement services individually. It tests the layout analyzer to ensure it can identify document structures correctly. It tests the OCR post-processor to confirm it refines text and provides confidence scores. It also tests the table extractor to verify it can find and format tables properly.

### Styling Demonstration

The test/test-styling.js script is not exactly a test but rather a demonstration. It creates example documents using all the different style presets and customization options, including headers, footers with page numbers, and background colors. This helps you see what the various styling combinations look like in practice and can serve as examples when you are designing your own document formats.

## Running Specific Tests

While npm test runs the main integration suite, you can also run individual test scripts when you want to focus on a particular aspect of the system:

```bash
npm test:ocr
```

This runs only the OCR improvement tests and shows you detailed output about what each service detected and how well it performed.

```bash
npm test:styling
```

This creates sample documents with different styling options including headers, footers, and background colors so you can see the visual results and understand how the styling system works.

```bash
npm test:create
```

This tests just the document creation tools to ensure they are generating files correctly with all formatting features working properly.

## Recent Improvements and Bug Fixes

The system has received significant performance improvements and bug fixes to ensure reliable operation:

- **Performance boost**: Text-based PDFs now process up to 100x faster (typically under 200ms for both summary and in-depth analysis)
- **Timeout fixes**: Reduced LM Studio timeout from 5 minutes to 30 seconds to prevent excessive waits
- **Table extraction optimization**: Disabled by default to prevent hangs (can be enabled with `SKIP_TABLE_EXTRACTION=false`)
- **OCR post-processing fix**: AI processing now skipped for text-based PDFs to prevent "Invalid base64 data URL format" errors
- **FailoverVisionService**: Added proper `initialize()` method for robust vision service startup
- **Timeout protection**: Added 15-second timeout per table extraction and limit to processing max 5 images

## Troubleshooting Common Issues

Here are some problems you might encounter and how to resolve them.

### The Server Will Not Start

If the server fails to start, first check that Node.js is installed on your system and that you are in the correct directory. Verify that all dependencies were installed successfully by running npm install again. Check the logs directory for error messages that might indicate what went wrong.

### File Not Found Errors

When you provide a file path to a tool, it must be an absolute path on your file system. Relative paths like "./documents/report.pdf" will not work because the server does not know what directory to start from. Always use the full path from the root of your file system.

### OCR Is Not Working

If OCR seems to not be functioning, first verify that the VISION_PROVIDER environment variable is set correctly. If you are using LM Studio, make sure it is running and that a vision-capable model is loaded in the Local Server tab. The logs will show connection errors if the server cannot reach the vision service.

### Images Are Missing From Documents

Some document formats do not support image extraction as well. Legacy .doc files (not DOCX) or complex Excel sheets might not contain extractable images. Ensure your files are in .docx, .xlsx, or .pdf format for the best experience.

### Styling Is Not Applied

If you specify styling options but do not see them applied in the generated document, check that stylePreset value is one of the valid options: minimal, professional, technical, legal, business, casual, or colorful. Verify that color codes are six-digit hex numbers without hash symbol. Make sure that your custom style object structure matches what is documented.

### Tables Are Not Extracted

Table extraction is now disabled by default to prevent performance issues and timeouts. If you need table extraction, set the SKIP_TABLE_EXTRACTION environment variable to false. Note that enabling table extraction will significantly increase processing time, especially for documents with many images or complex tables (can add 15+ seconds per table with AI processing). For most use cases, the document structure and text extraction provided by get-doc-summary and get-doc-indepth are sufficient.

### Processing Seems Slow

The enhanced processing features are now optimized for speed. Text-based PDFs typically complete in 115-140ms for both summary and in-depth analysis - over 100x faster than before. Image-based PDFs requiring OCR may take 10-15 seconds per page due to vision model processing. Table extraction is disabled by default to prevent timeouts but can be enabled with SKIP_TABLE_EXTRACTION environment variable if needed. If processing seems unusually slow, check logs to see which step is taking the most time.

## Project Architecture For Developers

If you are interested in extending or modifying the system, understanding the architecture will help you navigate the codebase effectively.

### Directory Structure

The project is organized with clear separation of concerns. The src directory contains all the application code. Tools in src/tools handle the MCP protocol layer. Services in src/services provide specialized functionality like vision processing, layout analysis, and table extraction. Parsers in src/parsers handle file-type specific operations. Utilities in src/utils provide helper functions for logging and file operations.

### Adding New Features

To add a new feature, you would typically start by defining the tool schema in src/index.js. Then implement the handler function that processes the input and returns results. If your feature needs new services (like a different file format), you would add those to the services directory and potentially create a new parser in the parsers directory.

### Following Code Conventions

The codebase uses ES modules and follows modern JavaScript patterns. Error handling is comprehensive, with detailed error information returned including stack traces when appropriate. Logging is structured and written to both console and log files for debugging in production environments.

### The Styling System Design

The styling module uses a configuration object pattern with merge capabilities. Presets are defined as complete configuration objects that include distinct styling for H1, H2, and H3 heading levels. Custom options override preset values using object spreading for simple properties and nullish coalescing for nested structures. This design allows presets to be complete defaults while still permitting fine-grained customization including headers, footers, background colors, and specific heading level styling.

Each preset includes font family, size, color, paragraph alignment, line spacing, and spacing values that are optimized for that document type. The professional preset uses Garamond serif font with full justification for traditional documents, while business preset uses modern Calibri with refined blue color palette for contemporary materials. Legal preset follows traditional legal formatting with Times New Roman, double spacing, and underlined headings.

## Best Practices For Using The System

Here are some recommendations based on how the system works and what tends to be effective.

### Always Provide Complete Information

When using the document reading tools, provide absolute file paths and include all required parameters. For document creation, make sure to include the required fields (title for DOCX, sheets with name and data for Excel). Missing required fields will cause errors and stop the tool from working.

### Choose The Right Tool For Your Need

Use get-doc-summary when you want a quick overview without processing everything. Use get-doc-indepth when you need complete access to all document information for detailed analysis or programmatic processing. Use get-doc-focused when you have specific questions and want targeted answers rather than everything.

### Test Your Changes

When modifying code or adding features, run the relevant test suites to ensure you have not broken anything. The integration tests cover the main workflows, and the specific test scripts focus on individual components including document creation with headers and footers.

### Handle Errors Gracefully

All tools return structured responses with a success flag. Always check this flag in your code and handle failure cases appropriately. The error messages are designed to be descriptive so you can understand what went wrong.

### Review Logs For Issues

When you encounter unexpected behavior, check the logs directory. The server writes detailed logs about its operations, including which tools are called, what files are being processed, and any errors that occur. This information is invaluable for troubleshooting complex issues.

### Use Styling Consistently

When creating multiple documents for the same purpose, use the same style preset or similar styling parameters. This creates visual consistency across your documents with matching headers, footers, and background colors which looks more professional and makes them easier for readers to navigate.

### Consider Performance

Be aware that document processing takes time, especially for PDFs with OCR and complex documents. When processing many files or building workflows, consider the performance implications and possibly batch operations during off-peak times.

## Current Capabilities And Limitations

### What The System Does Well

The PDF processing with OCR enhancements can handle most common document types effectively. Table extraction works well for clearly formatted tables in various standard formats. Document generation produces professional-looking outputs with comprehensive styling options including headers, footers with page numbers, and background colors.

### Known Limitations

DOCX cell-level borders are somewhat limited and table-level borders are preferred for best results. Excel style preservation is more limited compared to DOCX styling and does not support font family specification. The OCR accuracy depends on the quality of vision model and clarity of the original document. Template systems are not implemented, so each document must be created from scratch or use the programmatic tools. Table extraction is disabled by default to prevent timeouts; enabling it requires careful consideration of document complexity and available time.

### Potential Future Enhancements

There are opportunities to extend the system further. Image embedding in generated documents would allow including graphics in reports. Charts and graphs could be added to Excel generation for visual data presentation using libraries like ExcelJS which has native chart support. Style caching could improve performance when generating many documents with the same styling.

## Conclusion

The MCP Document Processor provides a comprehensive solution for working with documents in an intelligent way. It combines robust reading capabilities with flexible document creation, enhanced by OCR improvements and a sophisticated styling system that includes headers, footers, page numbers, and background colors. The modular architecture makes it maintainable and extensible, while the thorough test coverage ensures reliability. Whether you need to analyze existing documents or generate new ones with professional formatting, this system gives you the tools to do it effectively.