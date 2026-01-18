# MCP Document Processor

Welcome to the MCP Document Processor. This is a Model Context Protocol server that helps you work with PDF, DOCX, and Excel files in a more intelligent way. The server extracts text, understands document structure, pulls out metadata and embedded images, and even creates new documents with professional styling. It is designed to work with AI agents like LM Studio, Cline, or Roo Code so they can read and understand complex documents through standardized tools.

The system also includes the ability to generate documents, not just read them. This means you can create DOCX reports and Excel spreadsheets with customizable styling options to match your needs.

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

Beyond just reading documents, you can also create them. The system provides two tools for document generation:

The DOCX creation tool lets you build Word documents with titles, paragraphs, and tables. You can apply different styling presets or customize the formatting to match your needs. This is useful for generating reports, creating templates, or producing consistent documentation.

The Excel creation tool allows you to build spreadsheets with multiple sheets. You can control column widths, row heights, font styling, and header formatting. This helps when you need to generate data exports, create standardized report formats, or produce structured outputs from your applications.

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
        "LM_STUDIO_BASE_URL": "http://localhost:1234/v1",
        "LM_STUDIO_TIMEOUT": "300000"
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

### Creating DOCX Documents

The create-doc tool lets you generate Word documents programmatically. You provide a title, any paragraphs you want, and optionally tables, and the system creates a properly formatted DOCX file.

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

### Creating Excel Files

The create-excel tool generates spreadsheets with multiple sheets. You define each sheet with a name and the data it should contain. This is particularly useful when you need to export data in a structured format or create reports that others can work with in Excel.

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

There are three built-in style presets that you can use as starting points. These are designed to cover common document needs without requiring you to specify every formatting detail:

The minimal preset provides clean, simple formatting with black text at 11 points, left alignment, and basic spacing. This is useful for everyday documents where clarity is more important than decoration.

The professional preset uses enhanced formatting with blueish text at 12 points and improved spacing (1.15 line height). This creates documents that look more formal and suitable for business reports or official documentation.

The colorful preset makes documents visually striking with red text at 11 points and center alignment. This can be useful for highlighting important information or creating attention-grabbing materials.

### Customizing Document Appearance

When the presets do not quite match what you need, you can override specific properties while keeping the rest of the preset. This gives you control over individual aspects without having to configure everything from scratch.

For DOCX documents, you can control font properties like size, color, bold, italic, underline, and font family. You can also adjust paragraph formatting including alignment, spacing before and after paragraphs, and line spacing. Tables can be customized with border color, border style, and border width.

For Excel documents, you can control font properties including size, color, bold, italic, and underline. You can set specific column widths and row heights to control the layout of your spreadsheet. The header bold option makes the first row stand out, which is useful for data tables.

Here is an example of combining a preset with custom overrides:

```javascript
{
  "title": "Quarterly Report",
  "paragraphs": ["Executive Summary"],
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

This example starts with the professional preset but then increases the font size and changes the table styling. Only the properties you specify will override the preset values.

### Working With Colors

The system uses hexadecimal color codes without the hash prefix. When you specify colors, use six-digit codes like "FF0000" for red or "336699" for blue. Do not include the hash symbol at the beginning.

## How The System Works Internally

Understanding the technical architecture can help you troubleshoot issues or extend the system for your specific needs. The project is organized into several layers with clear responsibilities.

### The Core Libraries In Use

The system relies on several established libraries to handle different file formats. PDF parsing uses pdf-parse, which we have extended to access the raw PDF stream for image extraction. DOCX files are processed using mammoth to convert them to raw text while preserving basic formatting, and jszip is used to unzip the DOCX structure to access embedded media.

For Excel files, the xlsx library handles parsing the spreadsheet structure and extracting cell data across multiple sheets. When creating documents, docx is used for generating DOCX files with rich formatting support.

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

The test/test-styling.js script is not exactly a test but rather a demonstration. It creates example documents using all the different style presets and customization options. This helps you see what the various styling combinations look like in practice and can serve as examples when you are designing your own document formats.

## Running Specific Tests

While npm test runs the main integration suite, you can also run individual test scripts when you want to focus on a particular aspect of the system:

```bash
npm test:ocr
```

This runs only the OCR improvement tests and shows you detailed output about what each service detected and how well it performed.

```bash
npm test:styling
```

This creates sample documents with different styling options so you can see the visual results and understand how the styling system works.

```bash
npm test:create
```

This tests just the document creation tools to ensure they are generating files correctly.

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

If you specify styling options but do not see them applied in the generated document, check that the stylePreset value is one of the valid options: minimal, professional, or colorful. Verify that color codes are six-digit hex numbers without the hash symbol. Make sure that your custom style object structure matches what is documented.

### Tables Are Not Extracted

There was a bug in an earlier version where tables were only extracted from PDFs that did not require OCR. This has been fixed, and tables should now be extracted regardless of whether OCR was used. If you experience this issue, make sure you have the latest version of the code.

### Processing Seems Slow

The enhanced processing features do add some overhead to document processing. Layout analysis takes approximately five to ten seconds because it needs to parse the entire PDF structure. OCR post-processing adds about three to five seconds for the AI call. Table extraction takes five to fifteen seconds depending on how many tables are found. These times are typical for the additional intelligence being provided, but if processing seems unusually slow, check the logs to see which step is taking the most time.

## Project Architecture For Developers

If you are interested in extending or modifying the system, understanding the architecture will help you navigate the codebase effectively.

### Directory Structure

The project is organized with clear separation of concerns. The src directory contains all the application code. Tools in src/tools handle the MCP protocol layer. Services in src/services provide specialized functionality like vision processing, layout analysis, and table extraction. Parsers in src/parsers handle file-type specific operations. Utilities in src/utils provide helper functions for logging and file operations.

### Adding New Features

To add a new feature, you would typically start by defining the tool schema in src/index.js. Then implement the handler function that processes the input and returns results. If your feature needs new services (like a different file format), you would add those to the services directory and potentially create a new parser in the parsers directory.

### Following Code Conventions

The codebase uses ES modules and follows modern JavaScript patterns. Error handling is comprehensive, with detailed error information returned including stack traces when appropriate. Logging is structured and written to both console and log files for debugging in production environments.

### The Styling System Design

The styling module uses a configuration object pattern with merge capabilities. Presets are defined as complete configuration objects. Custom options override preset values using object spreading for simple properties and nullish coalescing for nested structures. This design allows presets to be complete defaults while still permitting fine-grained customization.

## Best Practices For Using The System

Here are some recommendations based on how the system works and what tends to be effective.

### Always Provide Complete Information

When using the document reading tools, provide absolute file paths and include all required parameters. For document creation, make sure to include the required fields (title for DOCX, sheets with name and data for Excel). Missing required fields will cause errors and stop the tool from working.

### Choose The Right Tool For Your Need

Use get-doc-summary when you want a quick overview without processing everything. Use get-doc-indepth when you need complete access to all document information for detailed analysis or programmatic processing. Use get-doc-focused when you have specific questions and want targeted answers rather than everything.

### Test Your Changes

When modifying code or adding features, run the relevant test suites to ensure you have not broken anything. The integration tests cover the main workflows, and the specific test scripts focus on individual components.

### Handle Errors Gracefully

All tools return structured responses with a success flag. Always check this flag in your code and handle failure cases appropriately. The error messages are designed to be descriptive so you can understand what went wrong.

### Review Logs For Issues

When you encounter unexpected behavior, check the logs directory. The server writes detailed logs about its operations, including which tools are called, what files are being processed, and any errors that occur. This information is invaluable for troubleshooting complex issues.

### Use Styling Consistently

When creating multiple documents for the same purpose, use the same style preset or similar styling parameters. This creates visual consistency across your documents, which looks more professional and makes them easier for readers to navigate.

### Consider Performance

Be aware that document processing takes time, especially for PDFs with OCR and complex documents. When processing many files or building workflows, consider the performance implications and possibly batch operations during off-peak times.

## Current Capabilities And Limitations

### What The System Does Well

The PDF processing with OCR enhancements can handle most common document types effectively. Table extraction works well for clearly formatted tables in various standard formats. Document generation produces professional-looking outputs with comprehensive styling options.

### Known Limitations

DOCX cell-level borders are somewhat limited and table-level borders are preferred for the best results. Excel style preservation is more limited compared to DOCX styling and does not support font family specification. The OCR accuracy depends on the quality of the vision model and the clarity of the original document. Template systems are not implemented, so each document must be created from scratch or use the programmatic tools.

### Potential Future Enhancements

There are opportunities to extend the system further. Advanced DOCX formatting could include page headers, footers, watermarks, or backgrounds. Image embedding in generated documents would allow including graphics in reports. Charts and graphs could be added to Excel generation for visual data presentation. Style caching could improve performance when generating many documents with the same styling.

## Conclusion

The MCP Document Processor provides a comprehensive solution for working with documents in an intelligent way. It combines robust reading capabilities with flexible document creation, enhanced by OCR improvements and a sophisticated styling system. The modular architecture makes it maintainable and extensible, while the thorough test coverage ensures reliability. Whether you need to analyze existing documents or generate new ones, this system gives you the tools to do it effectively and with professional results.