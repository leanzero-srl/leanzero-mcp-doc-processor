# Installation Guide for AI Agents

This file provides step-by-step installation instructions for AI agents like Cline.

## Quick Setup

### Step 1: Install Dependencies

Run the following command to install all required npm packages:

```bash
npm install
```

This installs the core dependencies including:
- `@modelcontextprotocol/sdk` - MCP server SDK
- `docx` - DOCX document generation
- `xlsx-js-style` - Excel writing with styling
- And other supporting libraries

### Step 2: Configure Your MCP Client

Add the following configuration to your MCP client settings file (e.g., `cline_mcp_settings.json`, `mcp.json`, or equivalent):

```json
{
  "mcpServers": {
    "doc-processor": {
      "command": "node",
      "args": ["<absolute-path-to-repo>/src/index.js"],
      "env": {}
    }
  }
}
```

**Important:** Replace `<absolute-path-to-repo>` with the actual absolute path to this repository on your system.

### Step 3: (Optional) Configure OCR Provider

If you want to enable advanced PDF processing with OCR, add environment variables:

#### For LM Studio (local OCR - recommended for local development):

```json
{
  "mcpServers": {
    "doc-processor": {
      "command": "node",
      "args": ["<absolute-path-to-repo>/src/index.js"],
      "env": {
        "VISION_PROVIDER": "lm-studio",
        "LM_STUDIO_BASE_URL": "http://localhost:1234/api/v0"
      }
    }
  }
}
```

#### For Z.AI (cloud OCR):

```json
{
  "mcpServers": {
    "doc-processor": {
      "command": "node",
      "args": ["<absolute-path-to-repo>/src/index.js"],
      "env": {
        "VISION_PROVIDER": "zai",
        "Z_AI_API_KEY": "<your-zai-api-key>"
      }
    }
  }
}
```

### Step 4: Verify Installation

Test that the server is working by asking it to list available tools or read a document. For example, try using the `list-documents` tool to see if any documents are registered in the system.

## Available Tools

Once installed, you have access to 11 tools:

| Tool | Purpose |
|------|---------|
| `read-doc` | Read PDF, DOCX, or Excel files (modes: summary, indepth, focused) |
| `create-doc` | Create Word DOCX documents with professional styling |
| `create-excel` | Create Excel XLSX workbooks |
| `edit-doc` | Edit existing DOCX files (append or replace content) |
| `edit-excel` | Edit existing Excel workbooks |
| `list-documents` | Search the document registry |
| `dna` | Manage Document DNA (project-level styling defaults) |
| `blueprint` | Manage structural templates |
| `drift-monitor` | Monitor documents for changes over time |
| `get-lineage` | Trace document provenance chains |

## Common Use Cases

### Create a Professional Document

```
Use create-doc with:
- title: "Q1 2026 Budget Report"
- category: "business"
- paragraphs: [array of text or heading objects]
```

### Initialize Document DNA for Consistent Styling

```
Use dna tool with action "init":
- companyName: "Your Company Name"
- stylePreset: "professional" (or minimal, technical, legal, business, casual, colorful)
- headerText: "Optional header text"
- footerText: "Page {current} of {total}"
```

### Read and Analyze a PDF

```
Use read-doc with:
- filePath: "/path/to/document.pdf"
- mode: "summary" (for overview), "indepth" (for full analysis), or "focused" (with userQuery)
```

## Notes

- Documents are automatically organized into category subfolders under `docs/`
- The server generates `.document-dna.json`, `.document-blueprints.json`, and `docs/registry.json` for state management
- All tools support backward-compatible aliases from previous versions