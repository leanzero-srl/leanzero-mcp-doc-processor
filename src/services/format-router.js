/**
 * Format Router — the semantic "which format?" brain behind `detect-format`.
 *
 * Given the user's request (and optional title/content), it picks the best
 * OUTPUT FORMAT and hands back a ready-to-use creation plan: the tool to call,
 * a style preset, a category, tone, confidence, and the runner-up. The model
 * can call detect-format once and pass the plan straight into a create-* tool.
 *
 * Design notes (why it's not a flat keyword bag):
 *  - Four formats, not three: PDF is first-class (it was missing entirely).
 *  - WEIGHTED signals: an explicit format word ("as a PDF") decides outright;
 *    strong intent phrases ("send to the client", "budget") outweigh generic
 *    context words. Generic verbs (create/write/make) carry no weight — they
 *    don't tell us anything about format.
 *  - DOCX vs PDF is a real distinction: DOCX = editable/collaborative/Word;
 *    PDF = final/print/send/sign/fixed-layout. They're separated explicitly.
 *  - Content STRUCTURE is a signal: a body that's mostly a table leans Excel; a
 *    body full of fenced code leans Markdown — even with no keywords.
 *  - Presentations (slides/deck/pptx) have no native tool yet; we say so and
 *    recommend the closest fit instead of silently mis-routing to DOCX.
 */

import { classifyDocumentContent } from "../utils/categorizer.js";

// Document format constants
const DocumentFormat = {
  MARKDOWN: "markdown",
  DOCX: "docx",
  EXCEL: "excel",
  PDF: "pdf",
  PPTX: "pptx",
};

// Document type (tone/depth) constants
const DocumentType = {
  CONCISE: "concise",
  FORMAL: "formal",
  EXPLANATORY: "explanatory",
  SCIENTIFIC: "scientific",
};

// Human label per format, used in `reason` strings (kept stable for tests).
const LABEL = {
  [DocumentFormat.MARKDOWN]: "implementation/technical",
  [DocumentFormat.DOCX]: "stakeholder/business",
  [DocumentFormat.EXCEL]: "data/spreadsheet",
  [DocumentFormat.PDF]: "final/printable deliverable",
  [DocumentFormat.PPTX]: "presentation/slides",
};

// Explicit format mentions — decisive (the user named the format).
const EXPLICIT = {
  [DocumentFormat.PDF]: ["as a pdf", "to pdf", "in pdf", " pdf", ".pdf", "pdf file", "pdf format"],
  [DocumentFormat.DOCX]: ["docx", ".docx", "word document", "word doc", "ms word", "microsoft word", "in word", "as a word"],
  [DocumentFormat.EXCEL]: ["excel", ".xlsx", "xlsx", ".xls", "as a spreadsheet", "spreadsheet", "workbook", "google sheet", "google sheets"],
  // CSV is Excel's tool with csv output — handled specially so we can set outputFormat.
  csv: ["csv", ".csv", "comma-separated", "comma separated"],
  [DocumentFormat.MARKDOWN]: ["markdown", ".md", "md file", "as markdown", " mdx"],
};

// Strong INTENT phrases (weight 10) — what the user wants to DO with the file.
const INTENT = {
  [DocumentFormat.PDF]: [
    "print", "printable", "to print", "for printing", "hard copy", "hardcopy",
    "read-only", "read only", "non-editable", "noneditable", "fixed layout",
    "final version", "final copy", "finalize", "finalized", "ready to send",
    "for distribution", "distribute", "send to the client", "send to client",
    "send to a client", "send to the customer", "email to", "deliver to",
    "hand out", "handout", "for the client", "to the customer", "sign", "signature",
    "invoice", "receipt", "quote", "quotation", "flyer", "brochure", "poster",
    "certificate", "diploma", "resume", "cv", "curriculum vitae", "cover letter",
    "official letter", "letter to", "newsletter", "one-pager", "one pager", "datasheet",
  ],
  [DocumentFormat.DOCX]: [
    "editable", "edit later", "edit it later", "keep editing", "further edit",
    "draft", "work in progress", "collaborate", "collaboration", "track changes",
    "fill in", "fill out", "template", "redline", "i can edit", "we can edit",
    "so i can change", "in word so",
  ],
  [DocumentFormat.EXCEL]: [
    "budget", "financial model", "ledger", "balance sheet", "income statement",
    "cash flow", "p&l", "tracker", "dataset", "data set", "table of", "list of",
    "inventory", "timesheet", "pivot", "rows and columns", "columns", "row per",
    "one row per", "calculation", "sum", "totals", "kpi table", "metrics table",
    "price list", "catalog", "schedule of",
  ],
  [DocumentFormat.MARKDOWN]: [
    "readme", "read me", "changelog", "change log", "runbook", "api docs",
    "api documentation", "technical spec", "design doc", "rfc", "adr",
    "for the repo", "in the repo", "for github", "on github", "for developers",
    "dev docs", "code documentation", "docstring", "wiki page", "knowledge base article",
  ],
};

// Low-weight CONTEXT bags (weight 1) — topical hints. Generic verbs removed so
// "create/write/make a report" doesn't get mis-scored as technical.
const CONTEXT = {
  [DocumentFormat.MARKDOWN]: [
    "developer", "api", "integration", "spec", "specification", "tutorial",
    "how-to", "how to", "code", "deploy", "configure", "setup", "install",
    "reference", "documentation", "architecture", "schema", "endpoint",
    "function", "method", "class", "module", "library", "sdk", "cli", "shell",
    "javascript", "python", "typescript", "node", "react", "docker", "kubernetes",
    "database", "sql", "backend", "frontend", "rest", "graphql", "microservice",
    "pipeline", "testing", "refactor", "authentication", "oauth", "webhook",
  ],
  [DocumentFormat.DOCX]: [
    "executive", "stakeholder", "management", "overview", "summary", "report",
    "proposal", "business case", "strategy", "plan", "memo", "memorandum",
    "whitepaper", "case study", "roadmap", "deliverable", "status report",
    "briefing", "board", "leadership", "policy", "handbook", "sop", "onboarding",
    "agreement", "contract", "nda", "terms", "letter", "research", "findings",
    "analysis", "minutes", "agenda", "meeting notes", "review",
  ],
  [DocumentFormat.EXCEL]: [
    "financial", "numbers", "data", "costs", "pricing", "revenue", "forecast",
    "expenses", "income", "profit", "quarter", "q1", "q2", "q3", "q4", "ytd",
    "monthly", "weekly", "log", "record", "formula", "average", "total",
    "variance", "cash flow", "payroll", "invoicing", "transaction", "vendor",
    "supplier", "stock", "order", "pipeline", "lead", "deal", "churn", "retention",
  ],
};

// Presentation cues — no native PPTX tool yet; surfaced as a limitation.
const PRESENTATION_CUES = [
  "presentation", "slides", "slide deck", "slide-deck", "deck", "pitch deck",
  "powerpoint", "ppt", "pptx", "keynote", "google slides",
];

function countHits(text, phrases) {
  const hits = [];
  for (const p of phrases) {
    if (text.includes(p)) hits.push(p.trim());
  }
  return hits;
}

// Category → style preset (mirrors selectStyleBasedOnCategory in styling.js).
const CATEGORY_PRESET = {
  contracts: "legal",
  legal: "legal",
  technical: "technical",
  business: "business",
  meeting: "professional",
  research: "professional",
};

function planStyle(format, category) {
  if (format === DocumentFormat.MARKDOWN) return null; // markdown has no presets
  const byCat = CATEGORY_PRESET[category];
  if (byCat) return byCat;
  if (format === DocumentFormat.EXCEL) return "business";
  return "claude-like"; // docx / pdf default
}

function planDocType(format, confidence) {
  if (format === DocumentFormat.DOCX || format === DocumentFormat.PDF) return DocumentType.FORMAL;
  if (format === DocumentFormat.EXCEL) return DocumentType.SCIENTIFIC;
  return confidence === "high" ? DocumentType.EXPLANATORY : DocumentType.CONCISE;
}

/**
 * Detect the best document format and return a creation plan.
 *
 * @param {Object} params
 * @param {string} params.userQuery - The user's original request.
 * @param {string} [params.title] - Title if already chosen.
 * @param {string} [params.content] - Content preview if available.
 * @returns {Promise<Object>} { format, suggestedTool, outputFormat?, stylePreset,
 *   category, docType, confidence, reason, signals, alternativeFormat, note?,
 *   unsupported?, matchedKeywords }
 */
export async function detectFormat(params) {
  const userQuery = (params.userQuery || "").toLowerCase();
  const title = (params.title || "").toLowerCase();
  const content = (params.content || "").toLowerCase();
  const text = `${userQuery} ${title} ${content}`;

  const formats = [
    DocumentFormat.MARKDOWN,
    DocumentFormat.DOCX,
    DocumentFormat.EXCEL,
    DocumentFormat.PDF,
  ];
  const scores = Object.fromEntries(formats.map((f) => [f, 0]));
  const signals = Object.fromEntries(formats.map((f) => [f, []]));
  let outputFormat; // set to "csv" if the user asked for CSV specifically

  // 1) Explicit format words (decisive: weight 100).
  let explicit = null;
  // CSV first — it's an Excel sub-format we want to remember.
  if (countHits(text, EXPLICIT.csv).length) {
    explicit = DocumentFormat.EXCEL;
    outputFormat = "csv";
    scores[DocumentFormat.EXCEL] += 100;
    signals[DocumentFormat.EXCEL].push("csv");
  } else {
    for (const f of formats) {
      const hits = countHits(text, EXPLICIT[f] || []);
      if (hits.length) {
        explicit = explicit || f;
        scores[f] += 100;
        signals[f].push(...hits);
      }
    }
  }

  // 2) Strong intent phrases (weight 10) + 3) context bags (weight 1).
  for (const f of formats) {
    const intentHits = countHits(text, INTENT[f] || []);
    scores[f] += intentHits.length * 10;
    signals[f].push(...intentHits);

    const ctxHits = countHits(text, CONTEXT[f] || []);
    scores[f] += ctxHits.length;
    signals[f].push(...ctxHits);
  }

  // 4) Content-structure signals (only when content is provided).
  if (content) {
    const tableRows = (content.match(/^\s*\|.*\|.*$/gm) || []).length;
    const codeBlocks = (content.match(/```/g) || []).length;
    if (tableRows >= 3) {
      scores[DocumentFormat.EXCEL] += 6;
      signals[DocumentFormat.EXCEL].push("tabular content");
    }
    if (codeBlocks >= 2) {
      scores[DocumentFormat.MARKDOWN] += 4;
      signals[DocumentFormat.MARKDOWN].push("fenced code blocks");
    }
  }

  // Rank.
  const ranked = formats
    .map((f) => ({ format: f, score: scores[f], signals: signals[f] }))
    .sort((a, b) => b.score - a.score);
  let winner = ranked[0];
  const runnerUp = ranked[1];

  // Presentation handling: editable slide decks are now a first-class format
  // (create-pptx). If the user clearly wants slides and didn't explicitly name
  // another format (score >= 100), route to create-pptx.
  const presHits = countHits(text, PRESENTATION_CUES);
  let note;
  if (presHits.length && winner.score < 100) {
    note =
      "Routing to create-pptx — an editable .pptx (one '## ' heading per slide; the title becomes the title slide). For a fixed, non-editable deck use create-pdf instead.";
    winner = { format: DocumentFormat.PPTX, score: Math.max(winner.score, 12), signals: ["presentation", ...presHits.slice(0, 3)] };
  }

  // No signal at all → general document. DOCX (claude-like) is the most useful
  // universal default; only lean Markdown when technical context appeared.
  if (winner.score === 0) {
    winner = { format: DocumentFormat.DOCX, score: 0, signals: [] };
  }

  // Confidence from absolute score and margin over the runner-up.
  const margin = winner.score - (runnerUp ? runnerUp.score : 0);
  let confidence;
  if (explicit || winner.score >= 12 || margin >= 8) confidence = "high";
  else if (winner.score >= 4 || margin >= 3) confidence = "medium";
  else confidence = "low";

  // Reason text — keeps the per-format label (tests assert these substrings).
  const label = LABEL[winner.format] || "format";
  const topSignals = winner.signals.slice(0, 5);
  let reason;
  if (explicit && (explicit === winner.format || outputFormat === "csv")) {
    reason = `User explicitly asked for ${outputFormat === "csv" ? "CSV" : winner.format} (${label})${topSignals.length ? `: ${topSignals.join(", ")}` : ""}`;
  } else if (winner.score === 0) {
    reason = `No strong format signals; defaulting to a ${label} document (claude-like). Pass an explicit format if the user implied one.`;
  } else {
    reason = `${confidence === "high" ? "Strong" : confidence === "medium" ? "Several" : "Weak"} ${label} signals${topSignals.length ? `: ${topSignals.join(", ")}` : ""}`;
  }

  // Plan: category + style + tone.
  const classification = classifyDocumentContent(params.title || params.userQuery || "", params.content || "");
  const category = classification.category && classification.category !== "misc" ? classification.category : null;
  const stylePreset = planStyle(winner.format, category);
  const docType = planDocType(winner.format, confidence);

  // Close runner-up worth mentioning (within 3 points and non-zero).
  const alternativeFormat =
    runnerUp && runnerUp.score > 0 && winner.score - runnerUp.score <= 3 && runnerUp.format !== winner.format
      ? runnerUp.format
      : null;

  const plan = {
    format: winner.format,
    suggestedTool: getToolForFormat(winner.format),
    stylePreset,
    category,
    docType,
    confidence,
    reason,
    signals: topSignals,
    matchedKeywords: topSignals, // back-compat alias
    alternativeFormat,
  };
  if (outputFormat) plan.outputFormat = outputFormat; // "csv"
  if (note) plan.note = note;
  return plan;
}

/**
 * Map a format to the create-* tool that produces it.
 * @param {string} format
 * @returns {string}
 */
function getToolForFormat(format) {
  switch (format) {
    case DocumentFormat.MARKDOWN:
      return "create-markdown";
    case DocumentFormat.EXCEL:
      return "create-excel";
    case DocumentFormat.PDF:
      return "create-pdf";
    case DocumentFormat.PPTX:
      return "create-pptx";
    case DocumentFormat.DOCX:
    default:
      return "create-doc";
  }
}

export { DocumentFormat, DocumentType };
