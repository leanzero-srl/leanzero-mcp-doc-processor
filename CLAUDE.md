# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working on code in this repository.

---

## CRITICAL WARNING: MANDATORY REITERATION PROTOCOL

**READ THIS FIRST: Before proceeding with ANY task, you MUST follow the Context-First Protocol.**

**The Most Important Rule in This Document:**

**Every single interaction MUST begin with reiterating your understanding of the task.** There are NO exceptions.

- You cannot ask questions first
- You cannot proceed to planning first
- You cannot start implementation first
- You MUST reiterate your understanding first

**Simple Formula for Success:**
```
Task Received → Read Context → Reiterate Understanding → Wait for Confirmation → Proceed
```

**Do NOT skip the reiteration step. Ever.**

---

## PRIMARY DIRECTIVE: CONTEXT-FIRST PROTOCOL

This is your most important rule and overrides all others. Before any other action, you MUST follow this protocol.

### Phase 1: Gather Project Context (MANDATORY FIRST STEP)

Upon receiving a task, immediately gather context by:

1. **Read Project Documentation** (priority order):
   - `CLAUDE.md` - This file, understanding project structure, MCP protocol rules, and conventions
   - `src/index.js` - MCP server entry point, tool definitions and dispatch (~450 lines)
   - The specific tool handler file(s) relevant to the task in `src/tools/`
   - Any service or utility files referenced by the tool handlers
   - Any files specifically mentioned by the human agent

2. **Analyze the Request**:
   - Identify the core requirement
   - Map the request to existing project files or patterns
   - Determine what information is available vs. unclear
   - Identify which MCP tools and which internal modules are affected

### Phase 2: Reiterate Understanding and Confirm (MANDATORY - NO EXCEPTIONS)

**CRITICAL: This phase is REQUIRED for EVERY task.**

**There are NO exceptions** to this rule:
- Even if the task seems simple
- Even if you think you understand perfectly
- Even if the human provided detailed instructions

**Required Format for Reiteration:**

```
## My Understanding of This Task

**Task Summary**: [Brief restatement of what you were asked to do]

**Files I Read and What I Learned**:
- `filename`: [Key insights]

**My Understanding**:
Based on the context I've gathered, you want me to [what I understand]. The project follows [pattern], so I should [approach].

**Proposed Approach**:
1. [First step based on patterns found]
2. [Second step referencing specific files]
3. [Third step following established conventions]

**Is this understanding correct?** Should I proceed with this approach, or would you like me to modify it?
```

**HUMAN INPUT REQUIRED - DO NOT PROCEED UNTIL CONFIRMED**

### Phase 3: Formulate Clarifying Questions (ONLY IF NEEDED - AFTER REITERATION)

**IMPORTANT: You MUST complete Phase 2 BEFORE asking any questions.**

**Only ask questions when:**
- The human explicitly asks you what questions you have
- The human indicates they need more information from you to proceed

**Do NOT ask questions when:**
- The human says "correct" or "proceed"
- The human provides corrections (just incorporate them)
- The question can be answered by reading project documentation

### Phase 4: Proceed with Task

Once you have confirmed your understanding (and any necessary clarifications), proceed with the task following the MCP protocol rules and architectural patterns defined below.

---

## PROJECT OVERVIEW

This is an **MCP (Model Context Protocol) server** that processes PDF, DOCX, and Excel files. It exposes **14 active tools** advertised via `ListToolsRequestSchema` (plus backward-compatible aliases dispatched in `CallToolRequestSchema`) over **stdio transport**, enabling AI models to read, create, edit, and manage documents with intelligent styling, categorization, and lineage tracking.

**Server identity:** `mcp-doc-processor` v1.0.0
**SDK:** `@modelcontextprotocol/sdk ^1.25.2`
**Runtime:** Node.js with ES modules (`"type": "module"`)
**Transport:** `StdioServerTransport` (stdin/stdout for MCP protocol, stderr for logging)

---

## COMMANDS

```bash
# Start MCP server (stdio transport)
npm start

# Test suites
npm test                    # Markdown format router (custom-assert)
npm run test:read-doc       # read-doc URL-fetch extension — 14 tests (node:test)
npm run test:schemas        # MCP schema invariants + detect-format E2E — 6 tests (node:test)
npm run test:render         # parseMarkdownToDocx + create-doc round-trip — 15 tests (node:test)
npm run test:upload         # uploadFileToTarget + create-doc upload integration — 18 tests (node:test)
npm run test:create-tags    # create-doc tag-based style resolution (getTemplateByTag crash regression)
npm run test:create-pdf     # create-pdf render + read-doc round-trip (Puppeteer)
npm run test:format-router  # detect-format semantic routing (pdf/csv/pptx/nuance)
npm run test:all            # Run all suites in sequence
npm run lint:no-console-log # Fail if any src/ file uses console.log (corrupts MCP stdio)
```

---

## MCP PROTOCOL RULES (CRITICAL)

These rules ensure the server remains a well-behaved MCP server. Violating these breaks client compatibility.

### Rule 1: stdout Is Sacred

**NEVER write anything to stdout except MCP protocol JSON-RPC messages.** The `StdioServerTransport` uses stdout exclusively for client communication. All logging MUST go to stderr via the `log()` utility in `src/utils/logger.js`. Using `console.log()` anywhere in tool handlers will corrupt the MCP transport.

### Rule 2: Tool Responses Are Content Blocks

Every tool handler MUST return the MCP response format:
```javascript
{
  content: [{ type: "text", text: "..." }],
  isError: boolean  // true for errors, omit or false for success
}
```

**NEVER** return raw strings, objects, or non-content-block responses from tool handlers. The `text` field typically contains `JSON.stringify(result, null, 2)` for structured data.

### Rule 3: Tool Schemas Must Be Valid JSON Schema

Tool `inputSchema` definitions in the `ListToolsRequestSchema` handler (in `src/index.js`) must be valid JSON Schema. Rules:
- Use `type`, `properties`, `required`, `enum`, `items`, `oneOf` correctly
- Every tool must have `inputSchema` with `type: "object"` and `properties`
- Required fields go in the `required` array
- Shared schema fragments (`STYLE_PRESET_SCHEMA`, `CATEGORY_SCHEMA`, `TAGS_SCHEMA`, `PARAGRAPH_ITEMS_SCHEMA`) are defined once and reused — extend them, don't duplicate

### Rule 4: Errors Must Be Structured

On error, return `isError: true` with a human-readable error message in the content block. Never throw unhandled exceptions from tool handlers — the top-level try/catch in `src/index.js` (near the bottom of the `CallToolRequestSchema` handler) is a safety net, not a strategy.

### Rule 5: Tool Names Use kebab-case

All tool names follow `kebab-case` convention (e.g., `read-doc`, `create-doc`, `drift-monitor`). Consolidated tools use an `action` or `mode` parameter for sub-operations (e.g., `dna` with `action: "init"|"get"|"evolve"`, `read-doc` with `mode: "summary"|"indepth"|"focused"`).

### Rule 6: Backward Compatibility via Aliases

When consolidating tools, the old tool names are kept as aliases in the `CallToolRequestSchema` switch statement. **Never remove old tool name aliases** — external clients may still reference them. Current aliases:
- `get-doc-summary`, `get-doc-indepth`, `get-doc-focused` → `read-doc` (with mode injection)
- `search-registry` → `list-documents`
- `init-dna`, `get-dna`, `evolve-dna` → `dna`
- `save-memory`, `delete-memory` → `dna` (memory actions folded into dna tool)
- `learn-blueprint`, `list-blueprints` → `blueprint`
- `watch-document`, `check-drift` → `drift-monitor`

---

## ARCHITECTURE

### Project Structure

```
mcp-doc-processor/
├── src/
│   ├── index.js                    # MCP server entry point, tool definitions, dispatch (~450 lines)
│   ├── tools/                      # Tool handlers (one file per tool or tool group)
│   │   ├── read-doc-tool.js        # Unified read-doc handler: summary/indepth/focused modes
│   │   ├── create-doc.js           # create-doc handler — most complex tool
│   │   ├── create-excel.js         # create-excel handler
│   │   ├── create-pdf.js           # create-pdf handler — markdown → PDF via pdf-renderer
│   │   ├── edit-doc.js             # edit-doc handler — append/replace via XML patching
│   │   ├── edit-excel.js           # edit-excel handler
│   │   ├── dna-tool.js             # dna tool handler — init/get/evolve/save-memory/delete-memory
│   │   ├── blueprint-tool.js       # blueprint tool handler — learn/list/delete
│   │   ├── drift-tool.js           # drift-monitor tool handler — watch/check
│   │   ├── lineage-tool.js         # get-lineage tool handler
│   │   ├── styling.js              # STYLE_PRESETS const + getStyleConfig() / buildDocumentStyles() / selectStyleBasedOnCategory() / createNumberingConfig() / createExcelColumnWidths() / createExcelRowHeights() / encodeCell(). ~1350 lines (down from 2634 — the legacy "flat-preset" helper system was removed in the dead-code cleanup; nested STYLE_PRESETS is the only system now).
│   │   ├── doc-utils.js            # Shared: createParagraph(), parseInlineMarkdown(), createTableFromData()
│   │   ├── docx-patch.js           # XML-level DOCX patching (SimpleXMLParser, appendToDocx, replaceDocxContent)
│   │   ├── excel-utils.js          # Excel styling helpers
│   │   └── utils.js                # Path enforcement, duplicate prevention, registry, categorization
│   ├── services/                   # Business logic and external integrations
│   │   ├── document-processor.js   # Central document processing (routes to parsers)
│   │   ├── vision-service.js       # Unified vision service for OCR (Z.AI API)
│   │   ├── ai-guidance-system.js   # Duplicate detection, version cleanup (used by create-doc)
│   │   ├── lineage-tracker.js      # Session-scoped read→write provenance tracking
│   │   ├── drift-detector.js       # Structural fingerprinting, semantic diff, Jaccard similarity
│   │   ├── blueprint-extractor.js  # Extract structural blueprints from DOCX/PDF
│   │   ├── format-router.js        # Keyword-based format recommender (used by detect-format) — async, MUST be awaited
│   │   ├── analysis-service.js     # Clarification question generation
│   │   ├── ocr-postprocessor.js    # OCR text correction
│   │   └── table-extractor.js      # Table extraction from images
│   ├── parsers/                    # File-type specific parsers
│   │   ├── pdf-parser.js           # PDF: pdf-parse + OCR + layout analysis
│   │   ├── docx-parser.js          # DOCX: mammoth + JSZip for images
│   │   └── excel-parser.js         # Excel: xlsx library
│   └── utils/                      # Shared utilities
│       ├── logger.js               # File + stderr logging (NEVER stdout)
│       ├── file-detector.js        # Extension-based file type detection
│       ├── image-processor.js      # Image processing helpers
│       ├── categorizer.js          # Keyword-based document classification (6 categories)
│       ├── registry.js             # Document registry with file locking (docs/registry.json)
│       ├── dna-manager.js          # Document DNA: load, create, apply, evolve, fuzzy template matching (~760 lines)
│       ├── dna-inheritance.js      # Three-level DNA inheritance (system > project > user)
│       ├── dna-schema.js           # DNA validation and migration
│       ├── blueprint-store.js      # Blueprint CRUD in .document-blueprints.json
│       ├── document-tags.js        # Static templates (claude-like, marketing, technical-docs, business-report, legal) + tag→template mapping; findMatchingTemplate returns {key, ...template} or null
│       ├── markdown-formatter.js   # Markdown content helpers used by create-markdown
│       └── xml-utils.js            # Shared XML helper utilities
├── test/                           # Test directory (node:test runner for newer suites, custom assert for legacy)
├── docs/                           # Generated documents output (organized by category)
├── logs/                           # Server logs (logs/server.log)
├── .document-dna.json              # Document DNA configuration (auto-generated)
└── package.json                    # ES module, no devDependencies
```

### Tool Inventory (14 Active Tools)

| Tool | Handler File | Purpose |
|------|-------------|---------|
| `read-doc` | `read-doc-tool.js` | Read documents with mode: summary, indepth, or focused. Source can be a local `filePath` OR a remote `url` + `authHeader` (HTTPS only, JSON envelope of shape `{data:base64, filename, mimeType, size}`). |
| `detect-format` | `services/format-router.js` (called from `src/index.js`, MUST be awaited) | Recommend document format and tone (markdown/docx/excel) based on user query, title, content preview |
| `create-doc` | `create-doc.js` | Create DOCX with styling, headers, footers, margins, DNA, blueprint validation. Schema advertises: header, footer, margins, backgroundColor, blueprint, enforceDocsFolder, preventDuplicates, tableHeaderFill, style. |
| `create-markdown` | `create-markdown.js` | Create Markdown documents (no tables; for code-heavy/technical content) |
| `create-excel` | `create-excel.js` | Create XLSX workbook with styling. DNA defaults are merged BEFORE the dryRun preview so the preview reflects what would be written. Columns auto-fit content when no explicit widths given. |
| `create-pdf` | `create-pdf.js` | Create a styled PDF from markdown via `services/pdf-renderer.js` (marked → HTML → CSS-from-preset → Puppeteer/Chromium). Same input shape as create-doc (title, content/paragraphs, tables, stylePreset, header/footer/margins, upload*). Reading PDFs stays on read-doc. |
| `edit-doc` | `edit-doc.js` | Append/replace/style/preview DOCX. `useLegacy:true` is destructive (loses formatting) and emits a runtime warning. |
| `edit-excel` | `edit-excel.js` | Append rows/sheets, replace sheets, preview. Validation errors return structured `{success:false, error}` (not throws). |
| `list-documents` | `utils.js` | Search/filter document registry (filters compose with AND-logic) |
| `list-templates` | inline in `src/index.js` | Lists BOTH static templates (from `utils/document-tags.js`) AND learned blueprints (from `.document-blueprints.json`). Honors `category` filter. |
| `dna` | `dna-tool.js` | Manage Document DNA (init/get/evolve/save-memory/delete-memory). `evolve` with `apply:true` MUTATES the dna config and may auto-create blueprints. |
| `blueprint` | `blueprint-tool.js` | Learn/list/delete structural blueprints. `learn` validates filePath + name presence at the handler level. |
| `drift-monitor` | `drift-tool.js` | Watch documents and check for structural drift |
| `get-lineage` | `lineage-tool.js` | Trace document provenance chains (sources and derivatives) |

### Key Patterns

**Return format — all tools and services:**
```javascript
{ success: true, filePath: "...", message: "...", ...metadata }
// or
{ success: false, error: "...", message: "..." }
```

**Non-fatal secondary operations:** Registry registration, lineage tracking, and DNA usage recording are all wrapped in try/catch blocks that never break the primary operation. This is intentional — document creation must succeed even if metadata tracking fails.

**Style resolution priority:**
1. User explicitly passed `stylePreset` → use it
2. Category detected → auto-select via `selectStyleBasedOnCategory()` (even over DNA default)
3. DNA default preset → general fallback
4. `"minimal"` → last resort

**Path enforcement pipeline (create-doc):**
`validateAndNormalizeInput()` → `applyCategoryToPath()` → `enforceDocsFolder()` → `preventDuplicateFiles()`
- Always use `result.filePath` from the return value, not any assumed path
- `enforceDocsFolder` redirects to `docs/` even when `enforceDocsFolder: false` if a category applies

**Hot-path discipline:** `analyzeTrends()` and `detectRecurringStructures()` are NOT called during document creation. They only run when the user explicitly invokes `dna` with `action: "evolve"`. This was intentionally removed from the create-doc hot path for performance.

---

## SAFE FILE EDITING PROTOCOLS

**CRITICAL: These protocols protect against destructive edits.**

### Rule 1: Read Before Editing

- **Before ANY edit, read the full file** — never edit based on partial knowledge
- Understand the file's full structure, imports, exports, and dependencies before changing anything
- For `src/index.js` (~450 lines), reading the full file is feasible

### Rule 2: Preserve MCP Compatibility

When modifying tool definitions or handlers:
- **Never change the tool name** of an existing tool without adding it as a backward-compatible alias
- **Never remove required parameters** from an `inputSchema` — only add optional ones
- **Never change the return format** from `{ content: [{ type: "text" }], isError }` to anything else
- Test that `npm start` runs without errors after any change to `src/index.js`

### Rule 3: Preserve Non-Fatal Patterns

Many operations in `create-doc.js` and other handlers are wrapped in try/catch with empty catches. This is **intentional** — these are non-fatal secondary operations (registry, lineage, DNA). Do not:
- Remove these try/catch blocks
- Add error propagation that would make them fatal
- Log errors at a level that would alarm users

### Rule 4: Show Changes Before Executing

For non-trivial changes:
```
## Proposed Changes to [filename]

**Line X-Y:**
OLD: [exact existing text]
NEW: [exact new text]

Do these changes look correct? Should I proceed?
```

### DANGER ZONE: Actions Requiring Explicit Permission

These require EXPLICIT user permission before executing:
- Adding, removing, or renaming MCP tools (affects all clients)
- Modifying tool `inputSchema` definitions (can break existing integrations)
- Changing the `Server` capabilities object
- Modifying `src/utils/registry.js` lock logic (concurrent access safety)
- Changing `preventDuplicateFiles` atomic lock mechanism
- Altering DNA schema validation or migration logic

---

## DOCUMENT DNA SYSTEM

The DNA system provides automatic document styling without explicit configuration.

### Files and Inheritance

| Level | File | Priority | Purpose |
|-------|------|----------|---------|
| System | Hardcoded in `dna-inheritance.js` | Lowest | Default values for all fields |
| Project | `.document-dna.json` | Medium | Project-wide styling, headers, footers |
| User | `.document-user.json` | Highest | Per-user overrides |

**Merge rule:** User > Project > System. Missing fields fall through to the next level.

### DNA Structure

```json
{
  "version": 1,
  "company": { "name": "...", "department": "..." },
  "defaults": { "stylePreset": "professional", "category": null },
  "header": { "enabled": true, "text": "...", "alignment": "right" },
  "footer": { "enabled": true, "text": "Page {current} of {total}", "alignment": "center" },
  "memories": { "key": { "text": "...", "createdAt": "..." } },
  "usage": { "totalDocs": 0, "categories": {}, "styles": {}, "overrides": {}, "correlations": {}, "structures": [] },
  "blueprints": { "name": { "sections": [], "stylePreset": "..." } }
}
```

### Key Functions

| Function | File | Purpose |
|----------|------|---------|
| `loadDNA(projectRoot)` | `dna-manager.js` | Load with mtime cache + validation + migration |
| `createDNAFile(config)` | `dna-manager.js` | Create/update with deep merge against defaults |
| `applyDNAToInput(input)` | `dna-manager.js` | Inject header/footer/style for missing fields only |
| `recordUsage(category, style, overrides, sig)` | `dna-manager.js` | Track document creation patterns + structure signature |
| `analyzeTrends(threshold)` | `dna-manager.js` | Generate evolution suggestions (70%+ for style, 60%+ for category) |
| `detectRecurringStructures(min)` | `dna-manager.js` | Fuzzy template detection via Levenshtein similarity |
| `signatureSimilarity(sigA, sigB)` | `dna-manager.js` | Compare two structure signatures (0.0–1.0 score) |
| `convertSignatureToBlueprint(suggestion)` | `dna-manager.js` | Convert a recurring-structure suggestion into a blueprint object |
| `generateAutoBlueprintName(suggestion, existing)` | `dna-manager.js` | Deterministic name like `auto-technical-3h`, reuses on same signature |
| `applyEvolution(mutation)` | `dna-manager.js` | Apply dot-path mutation to DNA config |
| `validateDNA(dna)` | `dna-schema.js` | Schema validation with error/warning arrays |

---

## STYLING SYSTEM

Eight presets: `minimal`, `professional`, `technical`, `legal`, `business`, `casual`, `colorful`, `claude-like`.

The default for create-doc when no category and no explicit preset is `claude-like` — modern blue-accented Calibri-based design with proper rendering of bullet/numbered lists, blockquotes, hyperlinks, horizontal rules, and inline tables (via `parseMarkdownToDocx`).

### Architecture

`src/tools/styling.js` provides the styling pipeline:
- `STYLE_PRESETS` — the single source of truth, 8 presets defined inline.
- `getStyleConfig(presetName, overrides)` → nested object with `font`, `heading1-3`, `title`, `paragraph`, `table`, `code` sections (plus `blockquote`, `hr`, `link` on the `claude-like` preset).
- `buildDocumentStyles(styleConfig)` → converts to `docx` library's `styles` format for `new Document({ styles: ... })`.
- `selectStyleBasedOnCategory(category)` → maps categories to presets.
- `createNumberingConfig()` → bullet/numbered list numbering definitions; required on every `new Document(...)` for list rendering.
- (A previous "flat-preset" system with helpers like `heading1`/`para`/`bold`/`bulletItem`/`infoTable` was removed during the dead-code cleanup — those were never imported anywhere outside the file. ~1300 LOC removed.)

### Category-to-Style Mapping

| Category | Style Preset |
|----------|-------------|
| contracts | legal |
| legal | legal |
| technical | technical |
| business | business |
| meeting | professional |
| research | professional |

### CRITICAL: docx Library Font Size

The `docx` library uses **half-points** for font sizes. Always multiply desired point size by 2 (e.g., 12pt = 24 half-points). All four `new Document()` call sites must include the `styles` property via `buildDocumentStyles()`.

---

## DOCUMENT CATEGORIZATION

Six categories with keyword-based classification in `src/utils/categorizer.js`:

| Category | Keywords (sample) | Subfolder |
|----------|--------------------|-----------|
| contracts | agreement, NDA, contract, terms | `docs/contracts/` |
| technical | API, architecture, spec, schema | `docs/technical/` |
| business | proposal, report, strategy, budget | `docs/business/` |
| legal | compliance, regulation, liability | `docs/legal/` |
| meeting | minutes, agenda, action items | `docs/meeting/` |
| research | analysis, whitepaper, findings | `docs/research/` |

Auto-classification runs when no category is provided. Confidence levels: high (score >= 3), medium (score = 1 or title match), low (fallback).

---

## DOCUMENT REGISTRY

**Location:** `docs/registry.json`
**Lock:** `docs/.registry.lock` (exclusive `writeFile` with `flag: "wx"`)

The registry tracks all created documents with: `id`, `title`, `filePath`, `category`, `tags`, `description`, `createdAt`, `updatedAt`, plus optional `sources` and `derivatives` for lineage.

**Duplicate detection** in `create-doc`: Before writing, `checkForExistingDocument()` queries the registry. Returns `{ success: false, duplicate: true }` if a document with the same title exists, instructing the caller to use `edit-doc` instead.

**Atomic duplicate prevention** for filenames: `preventDuplicateFiles()` uses `mkdir(recursive: false)` as a POSIX atomic lock to prevent TOCTOU race conditions. Creates placeholder files while holding the lock.

---

## VISION SERVICE (OCR)

Single provider: Z.AI GLM-4.6V (configured via `Z_AI_API_KEY`). Also checks `ZAI_API_KEY` and `ANTHROPIC_AUTH_TOKEN`.

### PDF Processing Flow (single-pass, async)

1. Read file asynchronously (`fs.promises.readFile`)
2. Extract text + images in parallel via `pdf-parse`
3. Inline layout analysis from already-extracted data (no second file read)
4. If image-based (text < 50 chars + has images): OCR via `vision-service.js`
5. Post-process OCR text to fix common errors
6. Optionally extract tables (disabled by default via `SKIP_TABLE_EXTRACTION`)

Layout analysis is inlined in the PDF parser — it reads text/image data already extracted and classifies pages without a second `pdf-parse` invocation.

---

## INNOVATION FEATURES

### Lineage Tracking (`src/services/lineage-tracker.js`)
- Session-scoped `Map` correlates `recordRead()` calls to subsequent `recordWrite()` calls
- Automatically tracked: read tools record reads, `create-doc` records writes
- `get-lineage` tool traverses upstream (sources) and downstream (derivatives) to configurable depth

### Drift Detection (`src/services/drift-detector.js`)
- `watchDocument()`: computes SHA-256 fingerprint + heading tree + word counts, stores in registry watchlist
- `checkDrift()`: re-fingerprints and compares — reports word count delta, heading changes, category shifts
- Semantic diff via LCS (Longest Common Subsequence) algorithm on paragraph arrays with O(n*m) DP table
- Jaccard similarity on word sets for content comparison (uses `min(|A|,|B|)/max(|A|,|B|)` overlap coefficient proxy)
- **Paragraph cap:** Only the first 500 paragraphs are stored/compared. Documents exceeding this emit a truncation warning at watch time. The `totalParagraphCount` field records the true count.
- Exported internals for testing: `computeLineDiff()`, `compareHeadingTrees()`, `computeJaccard()`

### Fuzzy Template Detection (`src/utils/dna-manager.js`)
- `computeStructureSignature()` generates a pipe-delimited heading signature (e.g., `h1:introduction|h2:background|h2:methods`)
- Signatures are stored in `usage.structures[]` array on each document creation
- `detectRecurringStructures()` groups signatures using Levenshtein-based fuzzy matching (threshold >= 0.6)
- `signatureSimilarity()` compares heading count, heading levels, and heading text similarity
- Suggestions include `variants` when multiple near-match signatures merge into one group
- Only runs via `dna evolve`, never on the create-doc hot path

### Blueprint System (`src/services/blueprint-extractor.js`, `src/utils/blueprint-store.js`)
- `extractBlueprintFromDocx()`: XML-level section extraction with heading detection
- `validateAgainstBlueprint()`: Levenshtein similarity (>0.6 threshold) for fuzzy section matching
- Blueprints stored in `.document-blueprints.json` (separate from DNA)
- **Auto-learning:** During `dna evolve`, recurring structures detected by `detectRecurringStructures()` are auto-saved as blueprints via `convertSignatureToBlueprint()` + `generateAutoBlueprintName()`
- **Auto-matching:** After `create-doc` writes a file, it compares the document's structure signature against all auto-learned blueprints. If similarity >= 0.6, a `blueprintMatch` object is included in the response with the blueprint name and a suggestion to use it in future calls
- Auto-learned blueprints use the `auto-` name prefix (e.g., `auto-technical-3h`) and have `autoLearned: true` flag

---

## COMMUNICATION STANDARDS

### First Interaction: ALWAYS Reiterate (ABSOLUTELY MANDATORY)

- Every single response MUST begin with context reiteration
- You cannot proceed to questions, planning, or implementation without first completing Phase 2
- Wait for human confirmation before proceeding with any work

### When Providing Solutions:
- Reference the specific project files you analyzed
- Explain your reasoning based on project context
- Show code blocks with file paths and line numbers
- After describing your approach, explain how to test it

### When Describing Changes:
- State what you've done objectively
- Specify which test suites cover the changed functionality
- Immediately provide testing instructions (`npm run test:X`)
- Explain how to verify correctness

### When Receiving Feedback:
- If human corrects your understanding: acknowledge, update mental model, and reiterate corrected understanding
- Never proceed with implementation until understanding is confirmed

---

## PROJECT-SPECIFIC GUIDELINES

### Adding a New MCP Tool

1. **Define the tool** in the `ListToolsRequestSchema` handler in `src/index.js` with proper `inputSchema`
2. **Add the handler** in the `CallToolRequestSchema` switch statement
3. **Create the handler function** in a dedicated `src/tools/<name>-tool.js` file
4. **Return format:** Always `{ content: [{ type: "text", text: JSON.stringify(result, null, 2) }], isError: !result.success }`
5. **Validate file paths** for read/edit tools — the existing validation block in the `CallToolRequestSchema` handler in `src/index.js` handles this automatically for tools that receive `filePath`. Note: this guard is bypassed when `params.url` is set (the URL-fetch path materializes a temp file later).
6. **Add tests** covering success and error paths
7. **Update this CLAUDE.md** tool inventory table

### Modifying Existing Tools

- Read the full handler before modifying
- Check if the tool has backward-compatible aliases that need updating
- Ensure shared schema fragments are reused (don't inline duplicate schemas)
- Test with `npm start` to verify the server starts cleanly

### DOCX XML Patching (`src/tools/docx-patch.js`)

The `edit-doc` tool uses XML-level patching (not full document recreation) to preserve existing formatting:
- `appendToDocx()`: inserts new `w:p`/`w:tbl` nodes before `<w:sectPr` in `word/document.xml`
- `replaceDocxContent()`: replaces body content while preserving `<w:sectPr>` and namespace attributes
- `SimpleXMLParser`: custom lightweight XML parser (no DOM dependency) with tag finding and insertion
- **Critical:** Always preserve the `<w:sectPr>` section — it contains page layout, headers, and footers

### Code Quality Standards

**Language & Style:**
- ES modules with `.js` extensions — all files use `import`/`export`
- `async`/`await` throughout — no callbacks
- No TypeScript in this project
- camelCase for functions/variables, kebab-case for MCP tool names
- JSDoc comments on exported functions

**Error Handling:**
- Tool handlers: return `{ success: false, error }` — never throw
- Services: may throw — callers catch and convert to structured errors
- Non-fatal operations: wrap in try/catch with empty or warn-level catches
- File validation: check `fs.existsSync()` before operations on user-provided paths

**Logging:**
- `log(level, message, data)` from `src/utils/logger.js` — writes to stderr AND `logs/server.log`
- **NEVER** use `console.log()` — it writes to stdout and corrupts MCP transport
- Use `log("error"|"warn"|"info"|"debug", ...)` from the logger utility for all diagnostic output

### Testing

- Newer test suites use **`node:test`** runner (`describe`/`test` from `"node:test"`, `assert` from `"node:assert"`)
- Legacy test suites use a custom `assert(condition, message)` pattern with manual passed/failed/total counts
- Tests that modify `.document-dna.json` must backup and restore it
- `test:patch` test 5 has a known pre-existing failure — do not try to fix unless explicitly asked
- Run the relevant test suite after any change; run all suites before committing
- Suites using `node:test`: `test:read-doc` (currently the only `node:test` suite whose source file is committed). Other `node:test` script names declared in `package.json` (`test:styling`, `test:create`, `test:patch`, `test:innovations`, `test:drift`, `test:auto-blueprint`) reference test files that are not currently in the repo

### Dependencies (No devDependencies)

| Package | Purpose |
|---------|---------|
| `@modelcontextprotocol/sdk` | MCP server SDK (Server, StdioServerTransport, schemas) |
| `docx` | DOCX generation (Document, Packer, Paragraph, TextRun, etc.) |
| `jszip` | ZIP manipulation for DOCX XML patching and image extraction |
| `mammoth` | DOCX text extraction |
| `marked` | Markdown tokenization for inline formatting in paragraphs; also markdown→HTML for create-pdf |
| `pdf-parse` | PDF text and image extraction (async, single-pass) |
| `puppeteer` | Headless Chromium for create-pdf (markdown→HTML→PDF). Ships its own Chromium — run `npx puppeteer browsers install chrome` once at deploy. |
| `xlsx` | Excel reading |
| `xlsx-js-style` | Excel writing with cell styling |

---

## IMPORTANT GOTCHAS

1. **`createDoc` auto-categorizes and redirects paths** — `applyCategoryToPath` sends files to `docs/{category}/` even with `enforceDocsFolder: false`. Always use `result.filePath` from the return value, not an assumed path.

2. **Duplicate detection is baked into `create-doc`** — `create-doc` returns `{ success: false, duplicate: true }` when a doc with the same title exists, instructing to use `edit-doc` instead.

3. **The `docx` library uses half-points** — multiply pt by 2 for font sizes.

4. **All four `new Document()` call sites need `styles`** — `generateParagraphsXML`, `generateTablesXML`, `replaceDocxContent` title creation, and `applyStylingToDocx` all pass `buildDocumentStyles(styleConfig)`.

5. **`recordUsage()` takes four arguments** — `recordUsage(category, stylePreset, overrides, structureSignature)` where `overrides` is `{ stylePreset: bool, header: bool, footer: bool }` and `structureSignature` is the pipe-delimited heading string (or null).

6. **Inline TextRun formatting overrides style-level definitions** in OOXML. If a TextRun specifies font/size/color, it wins over the document-level style definition.

7. **Registry lock uses exclusive file creation** — `writeFile(lockPath, pid, { flag: "wx" })`. If a lock file is stale (process crashed), it must be manually deleted.

8. **`console.log()` is forbidden** — it writes to stdout and corrupts the MCP stdio transport. Use `console.error()` or the `log()` utility.

9. **Drift detection has a 500-paragraph cap** — The LCS semantic diff uses O(n*m) memory. Paragraphs beyond 500 are silently dropped from fingerprints. `watchDocument()` warns when truncation occurs and stores `totalParagraphCount` for awareness.

10. **`analyzeTrends()` and `detectRecurringStructures()` are NOT on the hot path** — They were intentionally removed from `create-doc` for performance. They only run when the user explicitly calls `dna` with `action: "evolve"`.

11. **`read-doc` accepts remote URLs (HTTPS only, single-use capability)** — When called with `url` + `authHeader` instead of `filePath`, the tool fetches a JSON envelope (`{data:base64, filename, mimeType, size}`) via `fetchToTempFile()` in `src/tools/read-doc-tool.js`, materializes the binary to `os.tmpdir()/doc-reader-<random>/`, runs the existing pipeline, and cleans up via `try/finally`. Security rules enforced in code: HTTPS only, no redirect following (`redirect: "error"`), no auto-retry on 401/404, `authHeader` is never logged, the URL token is redacted from log output (only host+path are logged). Payload size capped by `READ_DOC_MAX_BYTES` env var (default 50 MB). Designed for one-shot capabilities like CogniRunner's Forge web trigger that serves Jira attachments.

12. **`read-doc` schema must NOT use top-level `anyOf`/`oneOf`/`allOf`** — the Anthropic API rejects this with `tools.N.custom.input_schema: input_schema does not support oneOf, allOf, or anyOf at the top level`, breaking every Claude-based MCP client. The schema uses `required: []` and `handleReadDoc` runtime-validates that filePath OR url+authHeader is present. Test `test:schemas` enforces this invariant. Note: `oneOf`/`anyOf` nested inside `properties.X.items` (e.g. PARA_ITEM) is fine — only top-level is rejected.

13. **`detect-format` MUST be awaited** — `detectFormat()` in `src/services/format-router.js` is `async`. The dispatcher in `src/index.js` previously called it without `await`, returning `JSON.stringify(promise) === "{}"` to every caller. Always `await detectFormat(params)`. Tests in `test:schemas` enforce non-empty response.

14. **`create-doc` reads parameters from `parsedInput`, NOT `input`** — the handler accepts JSON-string input as well as object input. After `parsedInput = typeof input === "string" ? JSON.parse(input) : input`, every subsequent caller-config read MUST use `parsedInput.X`. Reading `input.X` after parsedInput is set silently misses caller config when input came as a JSON string AND drops DNA defaults that `applyDNAToInput(parsedInput)` injected.

15. **`create-excel` applies DNA defaults BEFORE the dryRun check** — so the preview reflects what would actually be written. The classifier uses `input.title` + `input.description` (not the top-left cell, which is fragile).

16. **`edit-excel` returns structured errors** — validation failures return `{success: false, error, message}` instead of throwing. Caller can rely on the response shape. The top-level `try/catch` is reserved for unexpected errors.

17. **`edit-doc useLegacy:true` is destructive** — recreates the document via mammoth which loses ALL original formatting (fonts, colors, images, headers, footers). The handler emits a `log("warn", ...)` when this path is taken. Schema description marks it as DANGER.

18. **`list-templates` returns BOTH static templates AND learned blueprints** — static templates come from `src/utils/document-tags.js` (claude-like, marketing, technical-docs, business-report, legal). Learned blueprints come from `.document-blueprints.json`. Optional `category` filter substring-matches against name/stylePreset/recommendedFor.

19. **`findMatchingTemplate` returns `null` when nothing matches** — used to fall back to "claude-like" for unknown documents, which masked the no-match case. Now returns `{key, ...template}` on match (with the key included so callers don't have to reverse-lookup) or `null`.

20. **`parseMarkdownToDocx` is the block-level markdown renderer** — defined in `src/tools/doc-utils.js`. Used by `create-doc.js` for any STRING paragraph entry. Handles bullet/numbered lists, blockquotes, horizontal rules, fenced code blocks, hyperlinks (rendered as `ExternalHyperlink`), inline tables, headings, and strikethrough. Object-form paragraphs (`{text, headingLevel}`) still go through the legacy inline path so explicit heading intent is preserved exactly. The OLD `parseInlineMarkdown` is kept as the inline-only helper for object-form paragraphs.

21. **All `new Document()` call sites pass `numbering: createNumberingConfig()`** — REQUIRED for bullet/numbered list paragraphs to render. Without it, list paragraphs reference a numId that isn't defined and render as unindented plain lines. The five call sites are: `create-doc.js`, `edit-doc.js` (×2 — replace and append legacy), `docx-patch.js` (×4 — generateParagraphsXML, generateTablesXML, replaceDocxContent title, applyStylingToDocx).

22. **`claude-like` is the default style preset for create-doc** — replaces the old "professional" default. Uses Calibri (universal Word default — no font installation required), modern blue-on-slate palette, `lineSpacing: 1.5`, and includes block-level config for lists, blockquotes, hr, and link colors. The `professional` preset still exists for executive/serif looks.

23. **`clientHint` parameter on creation tools** — `"agent"` | `"interactive"` | `"auto"`. Default `"auto"` runs `resolveClientHint(params)` in `src/tools/utils.js` which checks `MCP_CLIENT_TYPE` env var, then heuristics on input shape, then falls back to `"agent"`. Interactive mode produces a one-line response message and omits chatty fields (enforcement, styleConfig, lineage, memoriesApplied) — for use in human-facing UIs like CogniRunner. Agent mode is the verbose default.

24. **Server-level `instructions`** — set in `src/index.js` via `new Server({...}, { capabilities, instructions: SERVER_INSTRUCTIONS })`. The instructions reach the calling LLM alongside the tool list and coach format selection, title quality, edit workflow, and clientHint usage. Edit `SERVER_INSTRUCTIONS` near the top of `src/index.js` to update.

25. **The `create-doc` dispatcher in `src/index.js` no longer overwrites the handler's `message` field** — previously every successful create-* call had its message replaced with a hardcoded "DOCX FILE WRITTEN TO DISK..." string. The handlers now produce their own message (interactive vs agent shape) and the dispatcher just relays the result.

26. **Upload bridge — GENERIC HTTPS receiver contract** — `create-doc`, `create-markdown`, `create-excel` accept optional `uploadUrl` + `uploadAuthHeader` (+ optional `uploadFilename`). When BOTH are present, after writing the file locally the handler POSTs a JSON envelope `{data:base64, filename, mimeType, size}` to `uploadUrl` with `Authorization: <uploadAuthHeader>`.
    - **The receiver contract is generic** — any HTTPS endpoint can implement it (Forge web triggers, Cloudflare Workers, AWS Lambda, Express servers, etc.). CogniRunner's `attachment-upload` web trigger is the reference implementation; see README "Build your own receiver" section.
    - **Decision logic — NORMAL agents are unaffected**: when uploadUrl is absent, the tool behaves identically to before. The response shape does NOT include `uploaded` / `uploadAttachment` / `uploadStatus` / `uploadError` — those are only present when an upload was attempted. Pre-upload-bridge consumers see no change.
    - **Partial-params guard**: passing only `uploadUrl` without `uploadAuthHeader` (or vice versa) returns `uploadError: "uploadUrl and uploadAuthHeader must be provided together"` and `fetch` is NEVER called — defensive against a model that injects only one variable.
    - Security rules mirror read-doc: HTTPS only, no redirects (`redirect: "error"`), no auto-retry on any 4xx/5xx, never log `uploadAuthHeader`, redact URL token (`?t=`) in logs (only host+path emitted), 60-second timeout.
    - Payload size capped by `WRITE_DOC_MAX_BYTES` env var (default 25 MB — half of the read cap because Forge web trigger payload limits are tighter).
    - Local file is kept on upload failure — caller can retry the upload manually or attach the path another way.
    - Interactive `clientHint` mode collapses the message: `Created and uploaded: <path> → <attachment-content-url>` on success, `Created locally at <path>; upload failed: <error>` on failure.
    - Helper `uploadFileToTarget()` in `src/tools/utils.js`. MIME helper `mimeTypeFromExtension()` maps `.docx` / `.xlsx` / `.md` / `.pdf` / `.txt` / `.csv` to their MIME (default `application/octet-stream`).
    - Tests: `test/test-upload.js` (18 tests covering the helper, create-doc end-to-end, clientHint × upload, backward-compat-when-no-upload, partial-params guard, all error codes 401 / 404 / 413 / 415, redirect rejection, oversized rejection, missing-arg validations).

27. **`content` param on create-doc / create-markdown / create-pdf** — accepts the ENTIRE body as one markdown string. When present and `paragraphs` is empty/absent, it's fed straight through the block renderer (string paragraph → `parseMarkdownToDocx`, or marked→HTML for PDF). Far easier for weak/local models than the `oneOf` `paragraphs` array, which they frequently emit malformed (the "params.paragraphs is not of a type(s) array" failure). `paragraphs` still works and wins when both are given.

28. **`formattingQuality` response field + `REQUIRE_FORMATTING` toggle** — `src/utils/formatting-quality.js` (`assessFormattingQuality`, `shouldRejectPlainText`). All three create-* tools attach a non-fatal `formattingQuality` ({headings, lists, emphasis, tables, blockquotes, isPlainText, hint}) so the model gets a correction signal when it produced flat text (omitted in `interactive` clientHint mode like other chatty fields). When env `REQUIRE_FORMATTING` is truthy (1/true/yes/on) AND the body is wholly unformatted above ~200 chars, the tool hard-rejects with `{success:false, error:"PLAIN_TEXT", hint}` BEFORE writing. Default is warn-only (off) to avoid retry loops with weak models. `SERVER_INSTRUCTIONS` (in `src/tool-registry.js`) carries a FORMATTING section + worked `content` example reaching the model alongside the tool list.

29. **create-pdf crash fix — getTemplateByTag is a STRING, not a template** — `getTemplateByTag()` (`src/utils/document-tags.js`) returns a template KEY string (or null), NOT a `{name, stylePreset}` object. create-doc's style-priority chain must resolve via `findMatchingTemplate(title, "", tags)` (returns `{key, name, stylePreset}` or null) and null-guard; dereferencing `getTemplateByTag()` as an object crashed on unmapped tags (e.g. `tags:["baboons"]` → "Cannot read properties of null (reading 'stylePreset')"). Guarded by `test/test-create-doc-tags.js`.

32. **`detect-format` is a SEMANTIC PLANNER (4 formats), not a keyword bag** — `src/services/format-router.js`. It now knows PDF (was markdown/docx/excel only), uses WEIGHTED signals (explicit format word 100 > intent phrase 10 > topic bag 1) + content-structure signals, distinguishes DOCX (editable/Word) from PDF (final/print/sign/send), detects CSV (`outputFormat:'csv'`), and flags the presentation/PPTX gap (`unsupported:'pptx'`, recommends closest fit). Returns a full plan: `{format, suggestedTool, stylePreset, category, docType, confidence, reason, alternativeFormat, outputFormat?, unsupported?, note?}`. Reason strings keep the per-format labels ("data/spreadsheet", "stakeholder/business") that `test:schemas` + `test:format-router` assert. No-signal default is DOCX (claude-like), not markdown.

33. **Per-tool format superpowers (no new tools added)** — markdown: `toc:true` auto-builds an anchor-linked Table of Contents (`generateToc`/`slugify` in `create-markdown.js`), `frontmatter:{...}` emits YAML. excel: a `data` cell string starting with `=` becomes a LIVE formula (`applyFormulas`); money/percent columns auto-format from the header (`applyAutoNumberFormats`, conservative regexes so years/counts aren't mangled); header gets `!autofilter`; `outputFormat:'csv'` writes CSV (first sheet, via `sheet_to_csv`). `cleanSheetData` now SKIPS `=`-cells so markdown-stripping can't corrupt formulas. pdf: `toc:true` injects heading anchors + a clickable TOC (`injectAnchorsAndToc` in `pdf-renderer.js`). PPTX/slides remain the one real gap (would need a new tool).

34. **`formatSuggestion` self-correction** — `suggestBetterFormat()` in `formatting-quality.js`; create-doc/create-pdf responses include it (agent mode) when the body is clearly the wrong shape (almost-entirely a table → create-excel; dominated by code blocks → create-markdown). Conservative thresholds so it isn't noisy; null when the format fits.

31. **Output location follows the CALLER, via `getOutputRoot()` (`src/tools/utils.js`)** — all generated files are rooted at `DOC_OUTPUT_DIR` (env override, absolute or cwd-relative) ELSE `process.cwd()`. For a **stdio** MCP launched by an agent (Claude Code), cwd is the workspace, so files land in the project the agent was opened from. For LM Studio, set `DOC_OUTPUT_DIR` in the mcp.json `env`. `enforceDocsFolder`, `validateAndNormalizeInput`, and `applyCategoryToPath` all use it. **Hard truth: a REMOTE/hosted server writes to the HOST's disk** — it cannot write to the calling client's machine (client/server boundary). To get files on the caller's machine, run the MCP **locally over stdio** there. The hosted instance is for remote consumers (website demo, claude.ai, CogniRunner) whose files legitimately live server-side or get pushed via the upload bridge.

30. **create-pdf uses a SINGLETON headless Chromium** — `src/services/pdf-renderer.js` launches one Puppeteer browser lazily and reuses it across requests (pages are created/closed per call); it registers SIGTERM/SIGINT handlers to `closeBrowser()` on shutdown. Tests MUST call `closeBrowser()` in teardown or the process won't exit. CSS is derived from the same `getStyleConfig(preset)` as DOCX; preset fonts map to web-safe stacks (Calibri→Helvetica, Garamond→Georgia, Consolas→monospace) since bundled Chromium lacks those fonts. Margins are twips (1440=1in) converted to inches. Deploy step: `npx puppeteer browsers install chrome` once; under the launchd LaunchAgent it finds Chromium via `$HOME` / `PUPPETEER_CACHE_DIR`.
