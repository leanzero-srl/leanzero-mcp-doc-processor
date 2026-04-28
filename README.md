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
- **Enhanced styling** -- advanced typography, color constants, and professional formatting helpers

## Tools

The server exposes 13 tools via the MCP protocol. Each tool uses an `action` or `mode` parameter for sub-operations where applicable.

| Tool | Actions / Modes | Description |
|------|----------------|-------------|
| `read-doc` | `summary`, `indepth`, `focused` | Read and analyze PDF, DOCX, or Excel files. Summary gives an overview; indepth extracts full text and metadata; focused answers specific queries. Source can be a local `filePath` OR a remote `url` + `authHeader` -- see [Reading from remote URLs](#reading-from-remote-urls). |
| `detect-format` | -- | Recommend document format and tone (markdown / docx / excel) based on user query, title, and optional content preview. Call before `create-*` when the format is not specified. |
| `create-doc` | -- | Create a Word DOCX with paragraphs, tables, headers, footers, and styling. Supports dry run preview. |
| `create-markdown` | -- | Create a Markdown document. |
| `create-excel` | -- | Create an Excel XLSX workbook with multiple sheets and styling. |
| `edit-doc` | `append`, `replace` | Edit existing DOCX files. Append preserves formatting via XML patching; replace overwrites content. |
| `edit-excel` | `append-rows`, `append-sheet`, `replace-sheet` | Edit existing Excel workbooks. |
| `list-documents` | -- | Search and filter the document registry by category, tags, or title. |
| `list-templates` | -- | List available blueprint templates that `create-doc` can validate against. |
| `dna` | `init`, `get`, `evolve`, `save-memory`, `delete-memory` | Manage Document DNA -- the project's automatic styling and identity system. |
| `blueprint` | `learn`, `list`, `delete` | Manage structural blueprints. Auto-learned during `dna evolve` or manually extracted from existing documents. |
| `drift-monitor` | `watch`, `check` | Register documents for monitoring and detect structural changes over time. |
| `get-lineage` | -- | Trace the provenance chain for any document -- which sources informed it and what was derived from it. |

> **Note:** All old tool names from previous versions (`get-doc-summary`, `get-doc-indepth`, `get-doc-focused`, `init-dna`, `get-dna`, `evolve-dna`, `save-memory`, `delete-memory`, `learn-blueprint`, `list-blueprints`, `watch-document`, `check-drift`, `search-registry`) are accepted as backward-compatible aliases.

## Reading from remote URLs

`read-doc` accepts a remote HTTPS URL guarded by a Bearer header in addition to local file paths. This is designed for **one-shot capabilities** -- short-lived, narrowly-scoped tokens that grant exactly one read of one specific resource -- such as the Forge web trigger that [CogniRunner](https://github.com/leanzero-srl/leanzero-cognirunner-forgeapp) (`feature/byok-postfunctions` branch) uses to expose Jira attachments to a local LM Studio instance.

### Calling shape

```json
{
  "url": "https://api.atlassian.com/.../webtrigger/<id>?t=<token>",
  "authHeader": "Bearer <bearer>",
  "mode": "summary"
}
```

The endpoint is expected to return HTTP 200 with `Content-Type: application/json` and a body of:

```json
{
  "data":     "<base64-encoded file content>",
  "filename": "invoice.pdf",
  "mimeType": "application/pdf",
  "size":     256832
}
```

`read-doc` decodes the base64 payload, writes it to a unique per-call temp directory under `os.tmpdir()`, runs the existing extraction pipeline, and cleans up the temp dir afterward (even if the pipeline throws).

### Security model

The `url` and `authHeader` parameters carry a one-shot capability. The implementation enforces:

- **HTTPS only** -- non-`https://` URLs are rejected before any fetch is issued.
- **No redirect following** -- `fetch` is called with `redirect: "error"`. A legitimate web trigger never 3xx's; if one does, treat it as hostile.
- **No auto-retry on 401 / 404** -- a `401` means the bearer was wrong (caller error); a `404` means the token already worked once or expired (single-use semantics). The caller must mint a fresh capability rather than retry.
- **Auth header is never logged** -- the helper logs only `host` + `pathname` from the URL; the `?t=` token and the `Authorization` header are redacted.
- **No caching** -- the payload, URL, and auth header live only for the duration of the single call.

If your endpoint expects a different response shape, point it through a small adapter rather than relaxing these rules.

### CogniRunner integration example

CogniRunner's `mcp.json` snippet for wiring this server to an LM Studio agent that needs to read Jira attachments:

```json
{
  "mcpServers": {
    "doc-processor": {
      "command": "node",
      "args": ["/absolute/path/to/mcp-doc-processor/src/index.js"],
      "env": {
        "READ_DOC_MAX_BYTES": "52428800"
      }
    }
  }
}
```

CogniRunner mints the `url` + `authHeader` per attachment in its post-function flow and passes them to the model in its system prompt; the model then calls `read-doc` directly. See the [CogniRunner repo](https://github.com/leanzero-srl/leanzero-cognirunner-forgeapp/tree/feature/byok-postfunctions) for token issuance details.

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

#### With Vision OCR (cloud)

```json
{
  "mcpServers": {
    "doc-processor": {
      "command": "node",
      "args": ["/absolute/path/to/mcp-doc-processor/src/index.js"],
      "env": {
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

## Enhanced Styling System

The enhanced styling system provides advanced typography and formatting capabilities through the `src/tools/styling.js` module:

### Color Constants

The system includes 20+ named color constants for consistent styling:

| Color Name | Hex Code | Usage |
|------------|----------|-------|
| `WHITE` | `FFFFFF` | Backgrounds, primary text |
| `BLACK` | `1A1A1A` | Primary text, dark elements |
| `BLUE` | `2563EB` | Primary accent, links |
| `GREEN` | `22C55E` | Success states, positive indicators |
| `RED` | `EF4444` | Error states, warnings |
| `YELLOW` | `EAB308` | Highlights, attention |
| `ORANGE` | `F97316` | Warm accents |
| `PURPLE` | `A855F7` | Creative accents |
| `TEAL` | `14B8A6` | Secondary accents |
| `INDIGO` | `6366F1` | Professional accents |
| `GRAY_50` | `F9FAFB` | Light backgrounds |
| `GRAY_100` | `F3F4F6` | Subtle backgrounds |
| `GRAY_200` | `E5E7EB` | Borders, dividers |
| `GRAY_300` | `D1D5DB` | Light borders |
| `GRAY_400` | `9CA3AF` | Secondary text |
| `GRAY_500` | `6B7280` | Tertiary text |
| `GRAY_600` | `4B5563` | Secondary content |
| `GRAY_700` | `374151` | Primary content |
| `GRAY_800` | `1F2937` | Dark content |
| `GRAY_900` | `111827` | Darkest elements |

### Page Layout Helpers

| Helper | Purpose |
|--------|---------|
| `PAGE_WIDTH` | Standard page width in inches (8.5") |
| `CONTENT_WIDTH` | Content area width (6.5") |
| `MARGIN_TOP` | Top margin (1") |
| `MARGIN_BOTTOM` | Bottom margin (1") |
| `MARGIN_LEFT` | Left margin (1") |
| `MARGIN_RIGHT` | Right margin (1") |

### Heading Helpers

| Helper | Purpose |
|--------|---------|
| `heading1(text)` | Main document title (Heading 1 style) |
| `heading2(text)` | Section headings (Heading 2 style) |
| `heading3(text)` | Subsection headings (Heading 3 style) |

### Text Formatting Helpers

| Helper | Purpose |
|--------|---------|
| `para(text)` | Standard paragraph |
| `bold(text)` | Bold text |
| `normal(text)` | Normal text with optional styling |
| `spacer(height)` | Vertical spacing |
| `divider()` | Horizontal rule |

### List Helpers

| Helper | Purpose |
|--------|---------|
| `bulletItem(text)` | Bullet list item |
| `subBulletItem(text)` | Nested bullet list item |

### Table Helpers

| Helper | Purpose |
|--------|---------|
| `infoTable(data)` | Information table with professional styling |
| `gapTable(data)` | Table with spacing between rows |
| `statusBadge(text, status)` | Status indicator badge |

### Page Setup Helpers

| Helper | Purpose |
|--------|---------|
| `createHeader(text, alignment)` | Document header |
| `createFooter(text, alignment)` | Document footer |
| `createPageProperties()` | Page layout properties |

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
| `Z_AI_API_KEY` | -- | API key for vision OCR service (also checks `ZAI_API_KEY`, `ANTHROPIC_AUTH_TOKEN`) |
| `Z_AI_BASE_URL` | Auto-detect | Override base URL for vision API |
| `Z_AI_VISION_MODEL` | `glm-4.6v` | Vision model name |
| `Z_AI_TIMEOUT` | `300000` | Request timeout in milliseconds |
| `SKIP_TABLE_EXTRACTION` | `true` | Skip table extraction from images during PDF processing |
| `READ_DOC_MAX_BYTES` | `52428800` (50 MB) | Maximum decoded payload size accepted by the `read-doc` URL-fetch path. Requests with larger bodies are rejected before the file is materialized. |

## Testing

```bash
npm test                    # Markdown format router suite
npm run test:read-doc       # read-doc URL-fetch extension (14 tests, node:test)
npm run lint:no-console-log # Fail if any src/ file uses console.log (corrupts MCP stdio)
```

> **Note:** `package.json` declares additional scripts (`test:ocr`, `test:styling`, `test:create`, `test:patch`, `test:category`, `test:dna`, `test:innovations`, `test:drift`, `test:auto-blueprint`) whose source files are not currently committed to the repository -- running them today fails with `Cannot find module`. They are kept as placeholders for future restoration. New work should add tests under matching script names.

## Generated Files

The server generates several configuration and data files:

### `.document-dna.json`

Document DNA configuration file that stores:
- Project-level styling defaults (style preset, category, header/footer)
- Usage statistics (categories, styles, document counts)
- Memory system (saved document preferences)
- Auto-learned document structures

This file is automatically managed by the `dna` tool and should not be manually edited.

### `.document-blueprints.json`

Blueprint repository that stores:
- Extracted document structures
- Section patterns and requirements
- Style preset associations
- Creation timestamps

Blueprints are created via `blueprint action:'learn'` or auto-learned during `dna evolve`.

### `docs/registry.json`

Document registry containing:
- All created documents with metadata
- Category, tags, and descriptions
- Lineage tracking information
- Timestamps for creation and updates

### `.document-user.json` (optional)

User-level DNA that inherits from project DNA. Allows personal overrides without affecting team settings.

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
  .document-blueprints.json  # Blueprint repository
  docs/registry.json         # Document registry
  .document-user.json        # Optional user-level DNA
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
