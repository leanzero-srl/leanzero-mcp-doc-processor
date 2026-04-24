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
   - `src/index.js` - MCP server entry point, tool definitions and dispatch (507 lines)
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

This is an **MCP (Model Context Protocol) server** that processes PDF, DOCX, and Excel files. It exposes **9 active tools** (plus 12 backward-compatible aliases) via the MCP protocol over **stdio transport**, enabling AI models to read, create, edit, and manage documents with intelligent styling, categorization, and lineage tracking.

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
npm test                    # Main integration suite (16 tests)
npm run test:ocr            # OCR improvements
npm run test:styling        # Style presets + document creation demos (node:test)
npm run test:create         # create-doc and create-excel integration (node:test)
npm run test:patch          # DOCX XML patching — tests 1-4 pass, test 5 has pre-existing failure (node:test)
npm run test:category       # Categorization and registry
npm run test:dna            # DNA system
npm run test:innovations    # Innovation features — 52 tests across 6 features (node:test)
npm run test:drift          # Drift internals — 35 tests: semantic diff, Jaccard, fuzzy matching (node:test)
npm run test:auto-blueprint # Auto-blueprint learning — 12 tests (node:test)
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

On error, return `isError: true` with a human-readable error message in the content block. Never throw unhandled exceptions from tool handlers — the top-level try/catch in `src/index.js:485` is a safety net, not a strategy.

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
│   ├── index.js                    # MCP server entry point, tool definitions, dispatch (444 lines)
│   ├── tools/                      # Tool handlers (one file per tool or tool group)
│   │   ├── read-doc-tool.js        # Unified read-doc handler: summary/indepth/focused modes
│   │   ├── create-doc.js           # create-doc handler — most complex tool
│   │   ├── create-excel.js         # create-excel handler
│   │   ├── edit-doc.js             # edit-doc handler — append/replace via XML patching
│   │   ├── edit-excel.js           # edit-excel handler
│   │   ├── dna-tool.js             # dna tool handler — init/get/evolve/save-memory/delete-memory
│   │   ├── blueprint-tool.js       # blueprint tool handler — learn/list/delete
│   │   ├── drift-tool.js           # drift-monitor tool handler — watch/check
│   │   ├── lineage-tool.js         # get-lineage tool handler
│   │   ├── styling.js              # 7 style presets, getStyleConfig(), buildDocumentStyles()
│   │   ├── doc-utils.js            # Shared: createParagraph(), parseInlineMarkdown(), createTableFromData()
│   │   ├── docx-patch.js           # XML-level DOCX patching (SimpleXMLParser, appendToDocx, replaceDocxContent)
│   │   ├── excel-utils.js          # Excel styling helpers
│   │   └── utils.js                # Path enforcement, duplicate prevention, registry, categorization
│   ├── services/                   # Business logic and external integrations
│   │   ├── document-processor.js   # Central document processing (routes to parsers)
│   │   ├── vision-service.js       # Unified vision service for OCR (Z.AI API)
│   │   ├── ai-guidance-system.js   # Duplicate detection, version cleanup
│   │   ├── lineage-tracker.js      # Session-scoped read→write provenance tracking
│   │   ├── drift-detector.js       # Structural fingerprinting, semantic diff, Jaccard similarity
│   │   ├── blueprint-extractor.js  # Extract structural blueprints from DOCX/PDF
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
│       ├── dna-manager.js          # Document DNA: load, create, apply, evolve, fuzzy template matching (684 lines)
│       ├── dna-inheritance.js      # Three-level DNA inheritance (system > project > user)
│       ├── dna-schema.js           # DNA validation and migration
│       ├── blueprint-store.js      # Blueprint CRUD in .document-dna.json
│       └── xml-utils.js            # Shared XML helper utilities
├── test/                           # Test directory (node:test runner for newer suites, custom assert for legacy)
├── docs/                           # Generated documents output (organized by category)
├── logs/                           # Server logs (logs/server.log)
├── .document-dna.json              # Document DNA configuration (auto-generated)
└── package.json                    # ES module, no devDependencies
```

### Tool Inventory (9 Active Tools)

| Tool | Handler File | Purpose |
|------|-------------|---------|
| `read-doc` | `read-doc-tool.js` | Read documents with mode: summary, indepth, or focused |
| `create-doc` | `create-doc.js` | Create DOCX with styling, headers, DNA, blueprint validation |
| `create-excel` | `create-excel.js` | Create XLSX workbook with styling |
| `edit-doc` | `edit-doc.js` | Append/replace DOCX content via XML patching |
| `edit-excel` | `edit-excel.js` | Append rows/sheets, replace sheet data |
| `list-documents` | `utils.js` | Search/filter document registry |
| `dna` | `dna-tool.js` | Manage Document DNA (init/get/evolve/save-memory/delete-memory) |
| `blueprint` | `blueprint-tool.js` | Learn/list/delete structural blueprints |
| `drift-monitor` | `drift-tool.js` | Watch documents and check for structural drift |

Additional tools available only as backward-compatible aliases (not advertised in tool listing):
- `get-lineage` → `lineage-tool.js` — Trace document provenance chains

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
- For `src/index.js` (507 lines), reading the full file is feasible

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

Seven presets: `minimal`, `professional`, `technical`, `legal`, `business`, `casual`, `colorful`.

### Architecture (Two Systems — Use Only Nested)

`src/tools/styling.js` contains both flat presets (legacy, unused) and nested presets (current). The current API:
- `getStyleConfig(presetName, overrides)` → nested object with `font`, `heading1-3`, `title`, `paragraph`, `table`, `code` sections
- `buildDocumentStyles(styleConfig)` → converts to `docx` library's `styles` format for `new Document({ styles: ... })`
- `selectStyleBasedOnCategory(category)` → maps categories to presets

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
5. **Validate file paths** for read/edit tools — the existing validation block at `src/index.js:329-348` handles this automatically for tools that receive `filePath`
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
- Suites using `node:test`: `test:styling`, `test:create`, `test:patch`, `test:innovations`, `test:drift`, `test:auto-blueprint`

### Dependencies (No devDependencies)

| Package | Purpose |
|---------|---------|
| `@modelcontextprotocol/sdk` | MCP server SDK (Server, StdioServerTransport, schemas) |
| `docx` | DOCX generation (Document, Packer, Paragraph, TextRun, etc.) |
| `jszip` | ZIP manipulation for DOCX XML patching and image extraction |
| `mammoth` | DOCX text extraction |
| `marked` | Markdown tokenization for inline formatting in paragraphs |
| `pdf-parse` | PDF text and image extraction (async, single-pass) |
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
