# MCP Document Processor

An MCP (Model Context Protocol) server for reading, creating, and managing PDF, DOCX, and Excel documents. Built for AI agents that need to process documents with professional styling, automatic categorization, and intelligent document management.

Part of the [LeanZero](https://leanzero.atlascrafted.com) ecosystem.

## Features

- **Read any document** -- PDF, DOCX, and Excel with OCR support for image-based PDFs
- **Create professional documents** -- DOCX and Excel with 7 style presets, headers, footers, and custom formatting
- **Document DNA** -- project-level identity system that automatically applies styling, headers, and footers
- **Auto-categorization** -- classifies documents into 6 categories (contracts, technical, business, legal, meeting, research) and organizes them into subfolders
- **Blueprint system** -- structural templates extracted from existing documents or auto-learned from recurring patterns
- **Drift detection** -- monitor documents for structural changes over time with fingerprint-based comparison
- **Lineage tracking** -- automatic provenance chains that record which source documents informed each created document
- **Duplicate prevention** -- atomic file locking and registry-based title matching to prevent overwrites
- **Document registry** -- searchable index of all created documents with category, tag, and title filtering

## Tools

The server exposes 10 tools via the MCP protocol. Each tool uses an `action` parameter for sub-operations where applicable.

| Tool | Actions / Modes | Description |
|------|----------------|-------------|
| `read-doc` | `summary`, `indepth`, `focused` | Read and analyze PDF, DOCX, or Excel files. Summary gives an overview; indepth extracts full text and metadata; focused answers specific queries. |
| `create-doc` | -- | Create a Word DOCX with paragraphs, tables, headers, footers, and styling. Supports dry run preview. |
| `create-excel` | -- | Create an Excel XLSX workbook with multiple sheets and styling. |
| `edit-doc` | `append`, `replace` | Edit existing DOCX files. Append preserves formatting via XML patching; replace overwrites content. |
| `edit-excel` | `append-rows`, `append-sheet`, `replace-sheet` | Edit existing Excel workbooks. |
| `list-documents` | -- | Search and filter the document registry by category, tags, or title. |
| `dna` | `init`, `get`, `evolve`, `save-memory`, `delete-memory` | Manage Document DNA -- the project's automatic styling and identity system. |
| `blueprint` | `learn`, `list`, `delete` | Manage structural blueprints. Auto-learned during `dna evolve` or manually extracted from existing documents. |
| `drift-monitor` | `watch`, `check` | Register documents for monitoring and detect structural changes over time. |
| `get-lineage` | -- | Trace the provenance chain for any document -- which sources informed it and what was derived from it. |

All old tool names from previous versions (`get-doc-summary`, `get-doc-indepth`, `get-doc-focused`, `init-dna`, `get-dna`, `evolve-dna`, `save-memory`, `delete-memory`, `learn-blueprint`, `list-blueprints`, `watch-document`, `check-drift`, `search-registry`, `check-document`, `extract-to-excel`, `assemble-document`) are accepted as backward-compatible aliases.

## Quick Start

### Installation

```bash
npm install
```

### MCP Configuration

Add to your MCP client configuration (e.g., `mcp.json`, `cline_mcp_settings.json`, or equivalent):

```json
{
  "mcpServers": {
    "doc-processor": {
      "command": "node",
      "args": ["/absolute/path/to/mcp-doc-processor/src/index.js"],
      "env": {}
    }
  }
}
```

#### With LM Studio (local OCR)

```json
{
  "mcpServers": {
    "doc-processor": {
      "command": "node",
      "args": ["/absolute/path/to/mcp-doc-processor/src/index.js"],
      "env": {
        "VISION_PROVIDER": "lm-studio",
        "LM_STUDIO_BASE_URL": "http://localhost:1234/api/v0"
      }
    }
  }
}
```

#### With Z.AI (cloud OCR)

```json
{
  "mcpServers": {
    "doc-processor": {
      "command": "node",
      "args": ["/absolute/path/to/mcp-doc-processor/src/index.js"],
      "env": {
        "VISION_PROVIDER": "zai",
        "Z_AI_API_KEY": "your-api-key"
      }
    }
  }
}
```

### Running

```bash
npm start
```

The server communicates over stdio using the MCP JSON-RPC protocol. It is designed to be launched by an MCP client, not run interactively.

## Style Presets

Seven built-in presets control document typography, spacing, and table formatting.

| Preset | Font | Body Size | Key Traits |
|--------|------|-----------|------------|
| `minimal` | Arial | 11pt | Clean, Swiss-style, subtle borders, light zebra striping |
| `professional` | Garamond | 11pt | Serif, justified, small caps title, double-spaced headings |
| `technical` | Arial / Segoe UI | 11pt | Left-aligned, strong hierarchy, high-contrast tables |
| `legal` | Times New Roman | 12pt | Double-spaced, underlined headings, no decorative elements |
| `business` | Calibri / Calibri Light | 11pt | Blue accent palette, centered title with bottom border |
| `casual` | Verdana / Trebuchet MS | 12pt | Warm orange accents, friendly newsletter style |
| `colorful` | Segoe UI | 11pt | Purple-teal gradient accents, vibrant table headers |

Categories auto-select an appropriate preset when none is specified:

| Category | Auto-Selected Preset |
|----------|---------------------|
| contracts | legal |
| legal | legal |
| technical | technical |
| business | business |
| meeting | professional |
| research | professional |

## Document DNA

Document DNA (`.document-dna.json`) is a project-level configuration file that automatically applies consistent styling across all documents created by this server.

### How It Works

1. **Initialize** -- Run `dna` with action `init` to create the DNA file with your company name, preferred style, header, and footer defaults.
2. **Automatic application** -- Every `create-doc` call checks for DNA and applies its defaults for any fields not explicitly provided (header, footer, style preset).
3. **Usage tracking** -- Each document creation records the category, style, and any overrides to build a usage profile.
4. **Evolve** -- Run `dna` with action `evolve` to analyze usage patterns. The system suggests mutations when it detects strong trends (e.g., "80% of your documents use the business preset"). Use `apply: true` to auto-apply the top suggestion.
5. **Auto-learned blueprints** -- During evolution, recurring document structures are detected and saved as blueprints automatically. Future documents with matching patterns get a `blueprintMatch` suggestion in the response.

### Memory System

Use `dna` with action `save-memory` to store document preferences (e.g., "Always use 1-inch margins for contracts"). Memories persist in the DNA file and are available to AI agents for context.

### Inheritance

DNA supports three-level inheritance: System defaults (hardcoded) < Project DNA (`.document-dna.json`) < User DNA (`.document-user.json`). Missing fields fall through to the next level.

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `VISION_PROVIDER` | `lm-studio` | OCR provider: `lm-studio` or `zai` |
| `LM_STUDIO_BASE_URL` | `http://localhost:1234/api/v0` | LM Studio API endpoint for local OCR |
| `Z_AI_API_KEY` | -- | API key for Z.AI cloud vision service |
| `SKIP_TABLE_EXTRACTION` | `true` | Skip table extraction from images during PDF processing |

## Testing

```bash
npm test                    # Main integration suite
npm run test:ocr            # OCR improvements
npm run test:styling        # Style presets and document creation
npm run test:create         # create-doc and create-excel integration
npm run test:patch          # DOCX XML patching
npm run test:category       # Categorization and registry
npm run test:dna            # DNA system
npm run test:innovations    # Innovation features (52 tests)
npm run test:drift          # Drift detection internals
npm run test:auto-blueprint # Auto-blueprint learning
```

## Architecture

```
mcp-doc-processor/
  src/
    index.js                 # MCP server entry, tool definitions, dispatch
    tools/                   # Tool handlers (one file per tool)
    services/                # Business logic (lineage, drift, blueprints, OCR)
    parsers/                 # File-type parsers (PDF, DOCX, Excel)
    utils/                   # Shared utilities (logger, registry, DNA, categorizer)
  docs/                      # Generated documents (organized by category)
  test/                      # Test suites
  logs/                      # Server logs
  .document-dna.json         # Document DNA configuration
```

### Dependencies

| Package | Purpose |
|---------|---------|
| `@modelcontextprotocol/sdk` | MCP server SDK |
| `docx` | DOCX generation |
| `jszip` | ZIP/DOCX XML manipulation |
| `mammoth` | DOCX text extraction |
| `marked` | Markdown tokenization for inline formatting |
| `pdf-parse` | PDF text extraction |
| `xlsx` | Excel reading |
| `xlsx-js-style` | Excel writing with styling |

## License

See [LICENSE](LICENSE) for details.
