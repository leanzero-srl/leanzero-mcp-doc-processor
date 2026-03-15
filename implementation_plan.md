# Implementation Plan: Markdown Document Tool & Intelligent Format Routing

## Overview
Add a new `create-markdown` tool for producing lean, practical .md files optimized for AI model consumption during implementation, plus an intelligent format router service that analyzes user prompts to automatically select the appropriate document format (markdown vs docx vs excel).

The current MCP server has 9 active tools with `create-doc` (DOCX) and `create-excel` (XLSX) as primary creation tools. Both use shared utilities for categorization, styling, validation, and duplicate prevention. This implementation adds markdown support while implementing keyword-based format routing so models automatically choose the right tool based on user intent expressed in their prompts.

---

## Types

### New Enum: DocumentFormat
```javascript
const DocumentFormat = {
  MARKDOWN: 'markdown',
  DOCX: 'docx', 
  EXCEL: 'excel'
};
```

### New Interface: FormatDetectionResult
```javascript
{
  format: DocumentFormat,        // 'markdown' | 'docx' | 'excel'
  confidence: 'high' | 'medium' | 'low',
  reason: string,                // Human-readable explanation
  matchedKeywords: string[],     // Keywords that triggered this decision
  suggestedTool: string          // Tool name to call (e.g., 'create-markdown')
}
```

### New Interface: MarkdownParagraph
```javascript
{
  text: string,                  // Paragraph content (can include inline markdown)
  headingLevel?: 'heading1' | 'heading2' | 'heading3',
  codeBlock?: {
    language: string,            // e.g., 'javascript', 'python', 'bash'
    content: string              // Code content
  },
  listItems?: Array<{
    text: string,
    type?: 'bullet' | 'numbered' | 'task'  // task = checkbox [-]
  }>,
  quote?: string                 // Blockquote content
}
```

---

## Files

### New Files to Create

1. **`src/tools/create-markdown.js`** - Main markdown document creation tool
   - Mirrors `create-doc.js` structure but outputs `.md` files
   - Uses same categorization, duplicate prevention, registry integration
   - Applies "implementation" style (lean format for AI consumption)
   - No user confirmation required (markdown is lightweight)

2. **`src/services/format-router.js`** - Format detection service
   - Analyzes user prompts for intent keywords
   - Returns `FormatDetectionResult` with recommended format
   - Comprehensive keyword matching across 3 categories:
     - Implementation/Technical → markdown
     - High-Level/Stakeholder → docx
     - Data/Spreadsheet → excel

3. **`src/utils/markdown-formatter.js`** - Markdown formatting utilities
   - `formatHeading(level, text)` - Returns `# Heading` format
   - `formatCodeBlock(language, code)` - Returns fenced code block
   - `formatBulletList(items)` - Returns `- item` format
   - `formatTaskList(items)` - Returns `- [ ] item` format
   - `formatInlineCode(text)` - Returns `` `text` `` format
   - `formatQuote(text)` - Returns `> text` format
   - `applyImplementationStyle(paragraphs)` - Applies lean formatting rules

### Files to Modify

4. **`src/index.js`** - MCP server entry point
   - Import `createMarkdown` from new tool
   - Import `detectFormat` from format-router service
   - Add `create-markdown` to tools list (in `ListToolsRequestSchema` handler)
   - Add `detect-format` to tools list (helper tool for models)
   - Add handlers in `CallToolRequestSchema`:
     - `case "create-markdown":` → call `createMarkdown(params)`
     - `case "detect-format":` → call `detectFormat(params)`

5. **`src/tools/create-doc.js`** - Update tool description
   - Modify description to clarify: "Use for high-level documentation, stakeholder reports, email attachments, Confluence uploads, formal business documents"
   - Add note about using `create-markdown` for technical implementation docs

6. **`src/tools/create-excel.js`** - Update tool description  
   - Clarify: "Use for data-heavy documents like budgets, financial reports, spreadsheets with numbers and calculations"

---

## Functions

### New Functions

#### In `src/services/format-router.js`:

```javascript
/**
 * Detect the appropriate document format based on user intent keywords
 * @param {Object} params - Detection parameters
 * @param {string} params.userQuery - Original user prompt/query
 * @param {string} [params.title] - Document title if known
 * @param {string} [params.content] - Content preview if available
 * @returns {FormatDetectionResult} Format recommendation
 */
export async function detectFormat(params)

/**
 * Check if text contains implementation/technical keywords
 * @param {string} text - Text to analyze  
 * @returns {{ match: boolean, keywords: string[] }}
 */
function hasImplementationKeywords(text)

/**
 * Check if text contains high-level/stakeholder keywords
 * @param {string} text - Text to analyze
 * @returns {{ match: boolean, keywords: string[] }}
 */
function hasStakeholderKeywords(text)

/**
 * Check if text contains data/spreadsheet keywords  
 * @param {string} text - Text to analyze
 * @returns {{ match: boolean, keywords: string[] }}
 */
function hasDataKeywords(text)
```

#### In `src/tools/create-markdown.js`:

```javascript
/**
 * Creates a markdown document from structured content with implementation-style formatting
 * @param {Object} input - Document creation parameters
 * @param {string} input.title - Document title (becomes H1)
 * @param {Array} input.paragraphs - Array of paragraph objects or strings
 * @param {string} [input.outputPath] - Output file path (default: derived from title)
 * @param {string} [input.category] - Document category for folder organization
 * @param {Array<string>} [input.tags] - Tags for registry search
 * @param {string} [input.description] - Brief description for registry
 * @param {boolean} [input.dryRun=false] - Preview without writing to disk
 * @returns {Promise<Object>} Result with filePath, success status, message
 */
export async function createMarkdown(input)

/**
 * Convert paragraph objects to markdown text
 * @param {Array<MarkdownParagraph>} paragraphs 
 * @returns {string} Formatted markdown
 */
function paragraphsToMarkdown(paragraphs)

/**
 * Apply implementation-style formatting rules (lean, no tables, code-focused)
 * @param {string} markdown - Raw markdown content
 * @returns {string} Styled markdown
 */
function applyImplementationStyle(markdown)
```

#### In `src/utils/markdown-formatter.js`:

```javascript
export function formatHeading(level, text)
export function formatCodeBlock(language, code)
export function formatBulletList(items)
export function formatTaskList(items)
export function formatInlineCode(text)
export function formatQuote(text)
export function formatTable(data)  // Optional - user prefers to avoid tables
export function applyImplementationStyle(paragraphs)
```

### Modified Functions

#### In `src/index.js`:

Add to `ListToolsRequestSchema` handler (after `create-excel` tool definition):

```javascript
{
  name: "detect-format",
  description:
    "[ROLE] You are a document format recommendation engine.\n\n" +
    "[CONTEXT] User is asking about creating documentation but hasn't specified the format. You need to analyze their intent and recommend the appropriate tool (create-markdown, create-doc, or create-excel).\n\n" +
    "[TASK] Analyze the user's query for keywords indicating document type:\n" +
    "  - Implementation/Technical keywords → recommend 'markdown' format (use create-markdown)\n" +
    "  - High-level/Stakeholder keywords → recommend 'docx' format (use create-doc)\n" +
    "  - Data/Spreadsheet keywords → recommend 'excel' format (use create-excel)\n\n" +
    "[CONSTRAINTS]\n" +
    "  - ALWAYS call this tool BEFORE creating a document if the user hasn't explicitly specified a format\n" +
    "  - Use the recommended format in your subsequent create-* tool call\n" +
    "  - If user explicitly says 'docx', 'markdown', or 'excel', you can skip this step\n\n" +
    "[FORMAT] Returns {format, confidence, reason, matchedKeywords, suggestedTool}.",
  inputSchema: {
    type: "object",
    properties: {
      userQuery: { type: "string", description: "The user's original request or prompt" },
      title: { type: "string", description: "Document title if known (optional)" },
      content: { type: "string", description: "Content preview if available (optional)" },
    },
    required: ["userQuery"],
  },
},
{
  name: "create-markdown",
  description:
    "[ROLE] You are a technical documentation expert specializing in creating lean, practical markdown files optimized for AI model consumption during implementation.\n\n" +
    "[CONTEXT] User wants to create implementation-focused documentation that will be used by developers or AI models to build something. The document should be copy-paste friendly with code blocks, clear headings, and bullet lists (avoid tables).\n\n" +
    "[TASK] Create a markdown (.md) file with the following requirements:\n" +
    "  1. Provide a specific, descriptive title (becomes H1 heading)\n" +
    "  2. Use paragraph objects with headingLevel for document hierarchy\n" +
    "  3. Include code blocks with language hints for any commands, config, or code snippets\n" +
    "  4. Use bullet lists instead of tables for structured data (easier to copy)\n" +
    "  5. Apply task list format (- [ ]) for actionable items\n" +
    "  6. Configure category if known (technical, research, etc.)\n\n" +
    "[CONSTRAINTS]\n" +
    "  - Title MUST be specific and descriptive — generic titles are rejected\n" +
    "  - DO NOT use tables — prefer bullet lists for copy-paste friendliness\n" +
    "  - ALWAYS include language hints in code blocks (```javascript not just ```)\n" +
    "  - Use inline code (`text`) for file paths, commands, and technical terms\n" +
    "  - Keep formatting lean — this is for implementation, not presentation\n" +
    "  - No user confirmation required (unlike create-doc/create-excel)\n\n" +
    "[FORMAT] Returns JSON with filePath, success status, and message. File is written directly to disk without confirmation prompt.",
  inputSchema: {
    type: "object",
    properties: {
      title: { type: "string", description: "Document title (becomes H1). MUST be specific and descriptive." },
      paragraphs: { 
        type: "array", 
        items: {
          oneOf: [
            { type: "string", description: "Simple paragraph text" },
            {
              type: "object",
              properties: {
                text: { type: "string" },
                headingLevel: { type: "string", enum: ["heading1", "heading2", "heading3"] },
                codeBlock: { 
                  type: "object",
                  properties: {
                    language: { type: "string" },
                    content: { type: "string" }
                  },
                  required: ["language", "content"]
                },
                listItems: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      text: { type: "string" },
                      type: { type: "string", enum: ["bullet", "numbered", "task"] }
                    },
                    required: ["text"]
                  }
                },
                quote: { type: "string" }
              },
              required: ["text"]
            }
          ]
        },
        description: "Array of paragraphs with markdown-specific formatting options."
      },
      outputPath: { type: "string", description: "File path for the MD output (default: derived from title)." },
      category: { 
        type: "string", 
        enum: ["contracts", "technical", "business", "legal", "meeting", "research"],
        description: "Document category for subfolder organization (docs/{category}/)." 
      },
      tags: { type: "array", items: { type: "string" }, description: "Tags for registry search and discovery." },
      description: { type: "string", description: "Brief description for registry search." },
      dryRun: { type: "boolean", description: "Preview without writing to disk (default: false)." },
    },
    required: ["title"],
  },
},
```

Add handlers in `CallToolRequestSchema` switch statement:

```javascript
case "detect-format": {
  const { detectFormat } = await import("./services/format-router.js");
  const result = await detectFormat(params);
  return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
}

case "create-markdown": {
  const { createMarkdown } = await import("./tools/create-markdown.js");
  const result = await createMarkdown(params);
  if (result.success) {
    const responseMessage = result.dryRun
      ? result.message
      : `MARKDOWN FILE WRITTEN TO DISK at: ${result.filePath}\n\nIMPORTANT: This tool has created an actual .md file on your filesystem. The document is available at the absolute path shown above.`;
    return {
      content: [{ type: "text", text: JSON.stringify({ ...result, message: responseMessage }, null, 2) }],
    };
  }
  return {
    content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    isError: true,
  };
}
```

---

## Classes

No new classes required. All functionality implemented as module-scoped functions following existing patterns in the codebase.

---

## Dependencies

No new npm dependencies required. The implementation uses:
- Existing `marked` package (already installed) for markdown parsing if needed
- Built-in `fs`, `path` modules for file operations
- Existing utilities from `./utils.js`, `./categorizer.js`

---

## Testing

### Test File Requirements

Create `test/test-markdown-format-router.js` with test cases:

1. **Format Router Tests**:
   - Implementation keywords → markdown (e.g., "I need documentation for my next implementation")
   - Stakeholder keywords → docx (e.g., "high level overview for stakeholders")
   - Data keywords → excel (e.g., "budget spreadsheet with costs")
   - Explicit format mention → that format (e.g., "create a docx file")
   - Ambiguous query → default based on category

2. **Create-Markdown Tests**:
   - Basic document creation with title and paragraphs
   - Code block formatting with language hints
   - Heading hierarchy (#, ##, ###)
   - Bullet lists and task lists
   - Category-based folder organization
   - Duplicate prevention
   - Registry integration

3. **Integration Tests**:
   - Call `detect-format` then appropriate create tool
   - Verify file written to correct location
   - Verify registry entry created

### Existing Test Modifications

Update `test/evaluation/scenarios/doc-creation.json` to include markdown scenarios.

---

## Implementation Order

1. **Create `src/utils/markdown-formatter.js`**
   - Implement formatting helper functions
   - No dependencies on other new files

2. **Create `src/services/format-router.js`**
   - Implement keyword detection logic
   - Define comprehensive keyword lists for each format category
   - Export `detectFormat` function

3. **Create `src/tools/create-markdown.js`**
   - Mirror structure of `create-doc.js` but simplified
   - Use shared utilities from `./utils.js`
   - Apply implementation-style formatting via `markdown-formatter.js`
   - Integrate categorization, duplicate prevention, registry

4. **Update `src/index.js`**
   - Add imports for new modules
   - Register `detect-format` and `create-markdown` tools
   - Add tool handlers in switch statement

5. **Update existing tool descriptions**
   - Modify `create-doc.js` description to clarify use cases
   - Modify `create-excel.js` description to clarify use cases

6. **Create tests**
   - Write unit tests for format router
   - Write integration tests for create-markdown
   - Test end-to-end flow: detect-format → create-markdown

7. **Update documentation**
   - Add markdown creation examples to README.md
   - Document keyword detection logic

---

## Keyword Detection Reference

### Implementation/Technical Keywords (→ Markdown)
```
implementation, developer, dev, api, integration, spec, specification, guide, tutorial, 
how-to, code, build, create, write, develop, deploy, configure, setup, install, use, 
practical, hands-on, reference, documentation, technical details, architecture, design, 
schema, endpoint, function, method, class, module, library, sdk, instructions, steps,
process, workflow, procedure, explain, describe, show me how
```

### High-Level/Stakeholder Keywords (→ DOCX)
```
high level, executive, stakeholder, management, overview, summary, presentation, report, 
proposal, business case, strategy, planning, email, attach, attachment, confluence, share, 
distribute, formal, official, document, board, c-level, leadership, senior, summary deck,
briefing, memo, memorandum
```

### Data/Spreadsheet Keywords (→ Excel)
```
budget, financial, numbers, data, spreadsheet, table, costs, pricing, revenue, forecast, 
expenses, income, profit, loss, quarter, q1, q2, q3, q4, ytd, monthly, weekly, tracker,
log, record, database, csv, import, export
```

### Explicit Format Keywords (→ That Format)
```
markdown, md, .md → markdown
docx, word, document, .docx → docx  
excel, xlsx, spreadsheet, .xlsx → excel
pdf, .pdf → (future: add pdf support)
```

---

## Plan Document Navigation Commands

The implementation agent should use these commands to read specific sections of this plan:

```bash
# Read Overview section
sed -n '/^## Overview/,/^## Types/p' implementation_plan.md | head -n -1

# Read Types section  
sed -n '/^## Types/,/^## Files/p' implementation_plan.md | head -n -1

# Read Files section
sed -n '/^## Files/,/^## Functions/p' implementation_plan.md | head -n -1

# Read Functions section
sed -n '/^## Functions/,/^## Classes/p' implementation_plan.md | head -n -1

# Read Dependencies section
sed -n '/^## Dependencies/,/^## Testing/p' implementation_plan.md | head -n -1

# Read Testing section
sed -n '/^## Testing/,/^## Implementation Order/p' implementation_plan.md | head -n -1

# Read Implementation Order section
sed -n '/^## Implementation Order/,$p' implementation_plan.md
```

---

## Notes for Implementation Agent

1. **Follow existing patterns**: The codebase uses ES modules, consistent error handling, and shared utilities. Mirror the structure of `create-doc.js` when implementing `create-markdown.js`.

2. **No user confirmation for markdown**: Unlike `create-doc` and `create-excel`, the markdown tool should write directly without a confirmation prompt since it's lightweight and implementation-focused.

3. **Lean formatting is key**: The user specifically wants no tables, heavy use of code blocks with language hints, and bullet lists. This is for AI model consumption during implementation, not human presentation.

4. **Keyword detection must be comprehensive**: The format router is the intelligence that makes this work. Invest time in building robust keyword matching with good fallback logic.

5. **Registry integration**: All created documents (markdown, docx, excel) should be registered in the same registry for unified search and discovery.