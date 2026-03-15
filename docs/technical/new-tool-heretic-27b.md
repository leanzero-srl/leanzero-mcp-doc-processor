Implementation Plan: Markdown Document Tool & Intelligent Format Routing
Overview
After thorough investigation of the codebase and research using Context7 MCP, I've designed a comprehensive solution that adds a new create-markdown tool while implementing intelligent keyword-based format routing across all document creation tools.

Key Findings from Research
Current State
9 active tools in the MCP server, with create-doc (DOCX) and create-excel (XLSX) as primary creation tools
Both use shared utilities: categorization (categorizer.js), styling (styling.js), validation (utils.js)
6 document categories: contracts, technical, business, legal, meeting, research
7 style presets: minimal, professional, technical, legal, business, casual, colorful
Markdown Capabilities (from Context7)
Markdown excels for technical documentation with:

Headers (# H1, ## H2, ### H3) - perfect for document hierarchy
Fenced code blocks (```javascript) - ideal for implementation details
GFM tables - structured data presentation
Inline formatting (italic, bold, code)
Task lists (- [ ]) - actionable items
Proposed Solution
1. New Tool: create-markdown
A dedicated tool that produces .md files with GitHub Flavored Markdown (GFM) support, following the same architectural patterns as create-doc:

Same categorization system (docs/technical/, docs/business/, etc.)
Same duplicate prevention and registry integration
Style presets adapted for markdown (font choices → code block themes, colors → emoji indicators)
No user confirmation required (markdown is lightweight)
2. Keyword-Based Format Router Service
A new service (src/services/format-router.js) that analyzes user intent keywords to recommend the appropriate format:

Intent Category	Keywords	Recommended Format
Implementation	implementation, code, technical details, dev, developer, api, integration, spec, guide, tutorial, how-to	.md (Markdown)
High-Level/Stakeholder	high level, executive, stakeholder, management, overview, summary, presentation	.docx (Word)
Email/Confluence	email, confluence, attach, attachment, share, distribute	.docx or .xlsx
Data/Spreadsheet	data, numbers, budget, financial, table, spreadsheet	.xlsx (Excel)
3. Modified Tool Descriptions
Update create-doc, create-excel, and add create-markdown descriptions to include format guidance:

create-doc: "Use for high-level documentation, stakeholder reports, email attachments, Confluence uploads"
create-markdown: "Use for technical implementation docs, API guides, developer tutorials, code-centric documentation"
Implementation Details
New Files
src/tools/create-markdown.js - Main markdown creation tool (mirrors create-doc structure)
src/services/format-router.js - Keyword analysis and format recommendation service
src/utils/markdown-styling.js - Markdown-specific styling helpers (code themes, emoji badges, etc.)
Modified Files
src/index.js - Add create-markdown tool registration and handler
src/tools/create-doc.js - Update description to clarify when to use DOCX vs MD
src/tools/create-excel.js - Update description for data-focused scenarios
Format Router Logic (Pseudo-code)

function detectDocumentFormat(userQuery, title = "", content = "") {
  const text = `${userQuery} ${title} ${content}`.toLowerCase();
  
  // Implementation/Technical keywords → markdown
  if (/implementation|developer|api|integration|specification|guide|tutorial/.test(text)) {
    return { format: "markdown", confidence: "high", reason: "technical implementation detected" };
  }
  
  // High-level/stakeholder keywords → docx
  if (/high level|executive|stakeholder|management|overview|summary/.test(text)) {
    return { format: "docx", confidence: "high", reason: "stakeholder documentation detected" };
  }
  
  // Email/Confluence keywords → docx
  if (/email|confluence|attach|share|distribute/.test(text)) {
    return { format: "docx", confidence: "medium", reason: "distribution document detected" };
  }
  
  // Data keywords → excel
  if (/budget|financial|spreadsheet|numbers|data table/.test(text)) {
    return { format: "excel", confidence: "high", reason: "data-focused document detected" };
  }
  
  // Default to markdown for technical category, docx otherwise
  const classification = classifyDocumentContent(title, content);
  return { 
    format: classification.category === "technical" ? "markdown" : "docx", 
    confidence: "low",
    reason: "default based on category"
  };
}
Next Steps for Implementation Agent
When you toggle to Act Mode, the implementation agent should:

Create src/services/format-router.js with keyword detection logic
Create src/tools/create-markdown.js following create-doc patterns
Update src/index.js to register and handle the new tool
Add markdown styling utilities in src/utils/markdown-styling.js
Update existing tool descriptions for clarity