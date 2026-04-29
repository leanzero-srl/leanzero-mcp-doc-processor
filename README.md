# MCP Document Processor

An MCP (Model Context Protocol) server for reading, creating, and managing PDF, DOCX, and Excel documents. Built for AI agents that need to process documents with professional styling, automatic categorization, and intelligent document management.

Part of the [LeanZero](https://leanzero.atlascrafted.com) ecosystem.

## Features

- **Read any document** -- PDF, DOCX, and Excel with OCR support for image-based PDFs
- **Create polished documents** -- DOCX, Markdown, and Excel with 8 style presets (including a "claude-like" modern professional look), proper rendering of bullet/numbered lists, blockquotes, hyperlinks, code blocks, and tables embedded in markdown content
- **Generic read & upload bridges** -- both `read-doc` and the create tools accept an HTTPS URL + Bearer auth so any Forge app, Cloudflare Worker, AWS Lambda, Express server, or other backend can plug in. doc-processor speaks one wire contract; you build the receiver however you like. CogniRunner's Jira-attachment bridge is the reference implementation, but the pattern is generic. **Existing local-file callers are unaffected.**
- **Polished or verbose output** -- `clientHint` parameter lets host applications request a concise human-facing message or the full agent metadata response.
- **Document DNA** -- project-level identity system that automatically applies styling, headers, and footers
- **Auto-categorization** -- classifies documents into 6 categories (contracts, technical, business, legal, meeting, research) and organizes them into subfolders
- **Blueprint system** -- structural templates extracted from existing documents or auto-learned from recurring patterns
- **Drift detection** -- monitor documents for structural changes over time with fingerprint-based comparison
- **Lineage tracking** -- automatic provenance chains that record which source documents informed each created document
- **Duplicate prevention** -- atomic file locking and registry-based title matching to prevent overwrites
- **Document registry** -- searchable index of all created documents with category, tag, and title filtering

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

### Polished output for human-facing UIs (`clientHint`)

`create-doc`, `create-markdown`, and `create-excel` accept an optional `clientHint` parameter:

- `"interactive"` → response message is a single line (`Created: <path>`); chatty fields like `enforcement`, `styleConfig`, `lineage`, `memoriesApplied` are omitted. Use this when an end-user reads the response directly (e.g. CogniRunner showing the result in a Jira comment).
- `"agent"` → verbose response with all metadata for AI consumption. This is the default behaviour.
- `"auto"` → run a heuristic on the input shape, fall back to `MCP_CLIENT_TYPE` env var, then to `"agent"`.

Set `MCP_CLIENT_TYPE=interactive` in the MCP server's environment to make `"auto"` resolve to interactive across all calls.

## Generic remote-read bridge — read files from any authenticated endpoint

`read-doc` works on local files OR on a remote HTTPS URL guarded by a Bearer header. The remote shape is the **mirror image** of the upload bridge below — same wire contract, same security guarantees, same generic philosophy. doc-processor doesn't care what's on the other side; any HTTPS endpoint that returns the JSON envelope works.

> **Reference implementation:** [CogniRunner](https://github.com/leanzero-srl/leanzero-cognirunner-forgeapp) — Forge web trigger that exposes Jira attachments to local LM Studio inference, behind a one-shot capability. Use it as a template for your own bridge.

### Decision: when does it activate?

The remote-read path fires **if and only if BOTH** `url` and `authHeader` are passed (and `filePath` is not). Otherwise `read-doc` works on the local path as before. **Existing local-file callers are 100% unaffected.**

### Calling shape

```json
{
  "url": "https://your-receiver.example/attachments/123?t=<token>",
  "authHeader": "Bearer <bearer>",
  "mode": "summary"
}
```

### Wire contract

The endpoint is expected to return HTTP 200 with `Content-Type: application/json` and a body of:

```json
{
  "data":     "<base64-encoded file content>",
  "filename": "invoice.pdf",
  "mimeType": "application/pdf",
  "size":     256832
}
```

`read-doc` decodes the base64 payload, writes it to a unique per-call temp directory under `os.tmpdir()`, runs the existing PDF/DOCX/XLSX extraction pipeline, and cleans up the temp dir afterward (even if the pipeline throws).

### Security guarantees

Same as the upload bridge — see the next section for the full list. In short:

- HTTPS only, no redirects, no auto-retry on 4xx, auth header never logged, URL token redacted in logs, 30-second timeout, payload size capped by `READ_DOC_MAX_BYTES` (default 50 MB).

### Build your own remote-read source

It's the inverse of the upload receiver, so the same Forge / Express skeletons in the next section apply. For Forge, instead of POSTing to `/rest/api/3/issue/{key}/attachments`, GET from `/rest/api/3/attachment/content/{id}` and base64-encode the response into the JSON envelope shape above. The CogniRunner repo has the full pattern.

### `mcp.json` example

```json
{
  "mcpServers": {
    "doc-processor": {
      "command": "node",
      "args": ["/absolute/path/to/mcp-doc-processor/src/index.js"],
      "env": {
        "READ_DOC_MAX_BYTES": "52428800",
        "WRITE_DOC_MAX_BYTES": "26214400",
        "MCP_CLIENT_TYPE": "agent"
      }
    }
  }
}
```

The application that hosts the model (CogniRunner, your own Forge app, Claude Desktop with extra context, an internal post-function, etc.) injects the per-call `url`/`authHeader` for read OR `uploadUrl`/`uploadAuthHeader` for write into the model's prompt. doc-processor never sees the application — it just speaks the wire contract.

## Generic upload bridge — attach files to any authenticated endpoint

`create-doc`, `create-markdown`, and `create-excel` can OPTIONALLY upload the file they just wrote to **any HTTPS endpoint** that implements a small, well-defined contract. Use this to:

- Attach a generated document to a Jira issue (Atlassian Forge)
- Drop a generated workbook into a Slack channel via a Slack-bot lambda
- Push a generated markdown file to a GitHub issue via a tiny proxy
- Send a generated PDF to a Cloudflare R2 / S3 signed-URL receiver
- Hook into your internal document-management system

doc-processor doesn't know or care what's on the other side. It just speaks one well-defined wire contract; you build the receiver however you like.

> **Reference implementation:** [CogniRunner](https://github.com/leanzero-srl/leanzero-cognirunner-forgeapp) — a Forge app that exposes a per-issue, single-use upload capability so an LM Studio model can attach generated docs back to Jira tickets. The CogniRunner web trigger is ~150 lines and worth reading if you're building your own receiver.

### Decision: when does it activate?

The upload bridge fires **if and only if BOTH** `uploadUrl` and `uploadAuthHeader` are present in the call. Otherwise the tool behaves exactly as before — writes the file locally, returns the path, no upload-related fields in the response. **Existing callers and "normal" agent flows are 100% unaffected.**

| Caller passes | Behavior |
|---|---|
| Neither `uploadUrl` nor `uploadAuthHeader` | Local write only. Response has no upload-related fields. (default) |
| Both | Local write **then** upload. Response gains `uploaded`, `uploadAttachment`, `uploadStatus`, `uploadError`. |
| Only one | Local write succeeds. Response has `uploaded: false, uploadError: "uploadUrl and uploadAuthHeader must be provided together"`. `fetch` is never called. |

The model decides per-call. If your application injects upload credentials into the model's context (system prompt or per-tool extra args), the model uses them. If you don't, the model ignores those fields — there's nothing for it to fill in.

### Wire contract

#### Request (doc-processor → your receiver)

```
POST <uploadUrl>
Authorization: <uploadAuthHeader>
Content-Type: application/json
Accept: application/json

{
  "data":     "<base64-encoded file bytes>",
  "filename": "q1-2026-strategy.docx",
  "mimeType": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "size":     27834
}
```

#### Success response (your receiver → doc-processor)

HTTP 200, `Content-Type: application/json`:

```json
{
  "success": true,
  "attachment": {
    "id":       "<your-target-id>",
    "filename": "q1-2026-strategy.docx",
    "size":     27834,
    "mimeType": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "content":  "<URL or pointer the user can use to access the uploaded file>"
  }
}
```

The `attachment.content` field is what gets shown in the model's interactive-mode response message — it should be a usable URL (e.g. the Jira attachment content URL) so end-users get a working link.

doc-processor tolerates any 2xx JSON shape — if `attachment` is missing it uses the whole body, but the strict shape above is recommended.

#### Failure responses

doc-processor surfaces these verbatim as `uploadError` and **does not auto-retry**:

| Status | Meaning |
|---|---|
| 400 | malformed envelope |
| 401 | bearer mismatch |
| 404 | token expired / consumed (single-use) |
| 413 | payload too large for receiver |
| 415 | disallowed mimeType / extension |
| 502 | receiver's upstream (e.g. Jira) failed |
| 500 | unexpected receiver error |

Receivers MUST NOT respond with 3xx — `fetch` is configured with `redirect: "error"` and aborts on any redirect.

### Security guarantees the SENDER (doc-processor) provides

- **HTTPS only.** Non-`https://` URLs are rejected before `fetch` is called.
- **No redirects.** `redirect: "error"` — receiver must respond directly.
- **No auto-retry on any 4xx/5xx.** Single-use semantics are honored end-to-end.
- **`uploadAuthHeader` is never logged** at any level.
- **URL `?t=` token is redacted** in log output — only host+path are emitted.
- **No caching.** Bytes, URL, auth header live only for the duration of one call.
- **Bounded payload size.** Capped by `WRITE_DOC_MAX_BYTES` env var (default 25 MB).
- **60-second timeout** on the upload fetch.
- **Local file is kept on upload failure** — your caller can retry or fall back to the local path.

### What your RECEIVER should provide

- HTTPS endpoint with a valid certificate.
- One-shot capability semantics if you're using URL+bearer pairs (mint per request, store with TTL, delete-on-consume, constant-time bearer compare).
- Don't 3xx — return 4xx/5xx with a JSON body.
- Validate filename extension on the receiver side; don't trust the envelope's `mimeType` field as authoritative.
- Audit-log the upload event (caller, target, filename, bytes).

### Build your own receiver

#### Atlassian Forge web trigger (the CogniRunner pattern)

Receives the JSON envelope, validates a one-shot capability, forwards to Jira's attachment endpoint via `api.asApp().requestJira()`. Skeleton (~50 lines):

```javascript
import api, { route } from "@forge/api";
import storage from "@forge/kvs";
import FormData from "form-data";
import { timingSafeEqual } from "node:crypto";

export async function serveAttachmentUpload(request) {
  const token = request.queryParameters?.t?.[0];
  if (!token) return { statusCode: 404, body: "" };

  const auth = request.headers?.authorization?.[0] || "";
  if (!auth.startsWith("Bearer ")) return { statusCode: 401, body: "" };
  const bearer = auth.slice(7);

  const cap = await storage.get(`uploadcap:${token}`);
  await storage.delete(`uploadcap:${token}`);   // single-use: consume BEFORE any work
  if (!cap || cap.expiresAt < Date.now()) return { statusCode: 404, body: "" };

  const a = Buffer.from(cap.bearer, "utf8");
  const b = Buffer.from(bearer, "utf8");
  if (a.length !== b.length || !timingSafeEqual(a, b)) return { statusCode: 401, body: "" };

  const envelope = JSON.parse(request.body);
  if (typeof envelope.data !== "string") return { statusCode: 400, body: '{"error":"missing data"}' };

  const buf = Buffer.from(envelope.data, "base64");
  if (buf.length > 25 * 1024 * 1024) return { statusCode: 413, body: "" };

  const allowed = new Set([".pdf", ".docx", ".xlsx", ".md", ".txt", ".csv"]);
  const ext = (envelope.filename.match(/\.[^.]+$/) || [""])[0].toLowerCase();
  if (!allowed.has(ext)) return { statusCode: 415, body: "" };

  const form = new FormData();
  form.append("file", buf, { filename: envelope.filename, contentType: envelope.mimeType, knownLength: buf.length });

  const jiraResp = await api.asApp().requestJira(
    route`/rest/api/3/issue/${cap.issueKey}/attachments`,
    { method: "POST", body: form, headers: { Accept: "application/json", "X-Atlassian-Token": "no-check" } },
  );
  if (!jiraResp.ok) return { statusCode: 502, body: '{"error":"jira upstream failed"}' };

  const created = (await jiraResp.json())[0];
  return {
    statusCode: 200,
    headers: { "Content-Type": ["application/json"] },
    body: JSON.stringify({
      success: true,
      attachment: {
        id: created.id,
        filename: created.filename,
        size: created.size,
        mimeType: created.mimeType,
        content: created.content,
      },
    }),
  };
}
```

#### Express server (for local testing or non-Forge use cases)

```javascript
import express from "express";
import { randomUUID } from "node:crypto";

const app = express();
app.use(express.json({ limit: "30mb" }));

const TOKEN = "test-token-123";
const BEARER = "Bearer test-bearer-456";

app.post("/upload", (req, res) => {
  if (req.query.t !== TOKEN) return res.status(404).end();
  if (req.headers.authorization !== BEARER) return res.status(401).end();

  const { data, filename, mimeType, size } = req.body;
  if (!data) return res.status(400).json({ error: "missing data" });

  const buf = Buffer.from(data, "base64");
  if (buf.length > 25 * 1024 * 1024) return res.status(413).end();

  // Persist the file or forward it somewhere — your call.
  console.log(`Received ${filename} (${mimeType}, ${size} bytes)`);

  res.json({
    success: true,
    attachment: {
      id: randomUUID(),
      filename,
      size: buf.length,
      mimeType,
      content: `https://your-storage.example/files/${filename}`,
    },
  });
});

app.listen(8443);
```

(For production, terminate TLS in front via a real cert — doc-processor refuses non-HTTPS.)

### Calling shape (what you put in the model's tool args)

```json
{
  "title": "Q1 2026 Engineering Strategy",
  "paragraphs": ["..."],
  "uploadUrl": "https://your-receiver.example/upload?t=<one-shot-token>",
  "uploadAuthHeader": "Bearer <one-shot-bearer>",
  "uploadFilename": "q1-2026-strategy.docx",
  "clientHint": "interactive"
}
```

The `uploadFilename` is optional and overrides the default (the local file's basename). Useful when duplicate prevention auto-suffixes the local filename and you still want a clean name on the receiver side.

### Response shape (when upload was attempted)

The handler appends four fields to its normal response **only when an upload was attempted** (when both upload params were supplied). For "normal" agent calls without upload params, none of these fields appear.

| Field | Type | Description |
|---|---|---|
| `uploaded` | boolean | `true` if 2xx, `false` if any error path |
| `uploadAttachment` | object \| null | Whatever the receiver returned in `attachment` |
| `uploadStatus` | number \| null | HTTP status code from the receiver |
| `uploadError` | string \| null | Error message if the upload failed |

In `clientHint: "interactive"` mode the response message collapses to one line:

- Success: `Created and uploaded: <path> → <attachment-content-url>`
- Failure: `Created locally at <path>; upload failed: <error>`

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

Eight built-in presets control document typography, spacing, and table formatting. The default for general-purpose `create-doc` calls is **`claude-like`**.

| Preset | Font | Body Size | Key Traits |
|--------|------|-----------|------------|
| `claude-like` | Calibri | 11pt | **Default.** Modern blue accents, generous whitespace, proper bullet/numbered lists, blockquotes, hyperlinks, inline tables — looks like a polished Claude chat answer rendered as a document |
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
| `WRITE_DOC_MAX_BYTES` | `26214400` (25 MB) | Maximum file size the `create-*` tools will POST to a remote `uploadUrl`. Half of the read cap because Forge web trigger payload limits are tighter. |

## Testing

```bash
npm test                    # Markdown format router (custom-assert)
npm run test:read-doc       # read-doc URL-fetch — 14 tests (node:test)
npm run test:schemas        # MCP schema invariants + detect-format E2E — 6 tests (node:test)
npm run test:render         # parseMarkdownToDocx + create-doc round-trip — 15 tests (node:test)
npm run test:upload         # uploadFileToTarget + create-doc upload integration — 18 tests (node:test)
npm run test:all            # Run all five suites in sequence
npm run lint:no-console-log # Fail if any src/ file uses console.log (corrupts MCP stdio)
```

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
