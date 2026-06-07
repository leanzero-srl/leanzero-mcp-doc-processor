import fs from "fs/promises";
import path from "path";
import PptxGenJS from "pptxgenjs";

import {
  validateAndNormalizeInput,
  ensureDirectory,
  enforceDocsFolder,
  preventDuplicateFiles,
  applyCategoryToPath,
  registerDocumentInRegistry,
  getCategoryPath,
  classifyDocumentContent,
  resolveClientHint,
  uploadFileToTarget,
  mimeTypeFromExtension,
} from "./utils.js";
import {
  getStyleConfig,
  getAvailablePresets,
  getPresetDescription,
  selectStyleBasedOnCategory,
} from "./styling.js";
import { findMatchingTemplate } from "../utils/document-tags.js";
import { applyDNAToInput, loadDNA } from "../utils/dna-manager.js";
import { assessFormattingQuality, shouldRejectPlainText, suggestBetterFormat } from "../utils/formatting-quality.js";
import { resolveClientProfile } from "../utils/client-profile.js";
import { logInsight, memoryNudge } from "../utils/insights.js";
import { buildDownloadUrl } from "../utils/download-registry.js";
import { log } from "../utils/logger.js";
import { recordWrite } from "../services/lineage-tracker.js";

const GENERIC_TITLES = new Set([
  "untitled", "untitled document", "new document", "document", "doc",
  "file", "output", "temp", "tmp", "new file", "unnamed", "no title",
]);

// 16:9 widescreen, in inches.
const SLIDE_W = 13.33;
const SLIDE_H = 7.5;

/**
 * Convert a paragraphs array (strings and/or {text, headingLevel, bold,...})
 * into a single markdown string. `content` (a full markdown string) wins.
 * Mirrors create-pdf's buildMarkdownBody so input shape is identical.
 */
function buildMarkdownBody(parsedInput) {
  if (typeof parsedInput.content === "string" && parsedInput.content.trim()) {
    return parsedInput.content;
  }
  const paragraphs = Array.isArray(parsedInput.paragraphs) ? parsedInput.paragraphs : [];
  const lines = [];
  for (let para of paragraphs) {
    if (typeof para === "string" && para.startsWith("{") && para.endsWith("}")) {
      try { para = JSON.parse(para); } catch { /* keep string */ }
    }
    if (typeof para === "string") {
      lines.push(para);
    } else if (para && typeof para === "object" && typeof para.text === "string") {
      let text = para.text;
      if (para.bold) text = `**${text}**`;
      if (para.italics) text = `*${text}*`;
      if (para.headingLevel === "heading1") text = `# ${para.text}`;
      else if (para.headingLevel === "heading2") text = `## ${para.text}`;
      else if (para.headingLevel === "heading3") text = `### ${para.text}`;
      lines.push(text);
    }
  }
  return lines.join("\n\n");
}

/** Append a markdown table per `tables` 2D-array entry (first row = header). */
function tablesToMarkdown(tables) {
  if (!Array.isArray(tables) || tables.length === 0) return "";
  const blocks = [];
  for (const table of tables) {
    if (!Array.isArray(table) || table.length === 0) continue;
    const rows = table.map((r) => (Array.isArray(r) ? r.map((c) => String(c ?? "")) : []));
    const header = rows[0];
    const sep = header.map(() => "---");
    const body = rows.slice(1);
    const lines = [
      `| ${header.join(" | ")} |`,
      `| ${sep.join(" | ")} |`,
      ...body.map((r) => `| ${r.join(" | ")} |`),
    ];
    blocks.push(lines.join("\n"));
  }
  return blocks.join("\n\n");
}

/** Style preset: explicit > tag template > category > claude-like. */
function resolveStylePreset(parsedInput, userExplicitlySetStyle, category, resolvedTags, title) {
  if (userExplicitlySetStyle) return { preset: parsedInput.stylePreset, reason: "user-specified" };
  if (resolvedTags.length > 0) {
    const matched = findMatchingTemplate(title, "", resolvedTags);
    if (matched && matched.stylePreset) {
      return { preset: matched.stylePreset, reason: `tag-based ("${matched.key}")` };
    }
  }
  if (category) return { preset: selectStyleBasedOnCategory(category), reason: `category "${category}"` };
  if (parsedInput.stylePreset) return { preset: parsedInput.stylePreset, reason: "DNA default" };
  return { preset: "claude-like", reason: "default (claude-like)" };
}

/** Strip inline markdown markers — pptxgenjs renders plain text runs. */
function stripInline(s) {
  return String(s ?? "")
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")  // images → alt
    .replace(/\[([^\]]*)\]\(([^)]*)\)/g, "$1")  // links → text
    .replace(/`([^`]+)`/g, "$1")                 // inline code
    .replace(/\*\*([^*]+)\*\*/g, "$1")           // bold
    .replace(/__([^_]+)__/g, "$1")               // bold (underscores)
    .replace(/\*([^*]+)\*/g, "$1")               // italic
    .replace(/~~([^~]+)~~/g, "$1")               // strikethrough
    .trim();
}

/**
 * Split a markdown body into a title slide + one content slide per `## ` (H2)
 * section. Content before the first H2 seeds the title slide's subtitle. When
 * there are no H2s, the whole body becomes a single "Overview" slide so the
 * deck is never just a bare title.
 */
function splitSections(title, markdown, fallbackSubtitle) {
  const lines = String(markdown || "").replace(/\r\n/g, "\n").split("\n");
  const preamble = [];
  const sections = [];
  let cur = null;
  for (const raw of lines) {
    const h2 = /^##\s+(.+)/.exec(raw);
    if (h2) {
      cur = { heading: stripInline(h2[1].trim()), lines: [] };
      sections.push(cur);
    } else if (cur) {
      cur.lines.push(raw);
    } else {
      preamble.push(raw);
    }
  }
  // Subtitle = first meaningful preamble line (after dropping a leading H1), else
  // the caller-supplied fallback (description).
  let subtitle = null;
  for (const raw of preamble) {
    const t = stripInline(raw.replace(/^#{1,6}\s+/, "").trim());
    if (t) { subtitle = t; break; }
  }
  if (!subtitle && fallbackSubtitle) subtitle = stripInline(fallbackSubtitle);

  if (sections.length === 0) {
    const body = preamble.join("\n").trim();
    if (body) sections.push({ heading: "Overview", lines: preamble });
  }
  return { subtitle, sections };
}

/** Parse a section's raw lines into block objects. */
function parseBlocks(lines) {
  const blocks = [];
  let i = 0;
  let para = [];
  const flushPara = () => {
    if (para.length) { blocks.push({ type: "paragraph", text: stripInline(para.join(" ")) }); para = []; }
  };
  while (i < lines.length) {
    const line = String(lines[i]).replace(/\s+$/, "");
    if (!line.trim()) { flushPara(); i++; continue; }

    // table: a pipe row followed by a |---|---| separator row
    if (/^\s*\|.*\|\s*$/.test(line) && i + 1 < lines.length && /^\s*\|[\s:|-]+\|\s*$/.test(lines[i + 1])) {
      flushPara();
      const rows = [];
      while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) {
        if (/^\s*\|[\s:|-]+\|\s*$/.test(lines[i])) { i++; continue; }  // separator
        const cells = lines[i].trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => stripInline(c.trim()));
        rows.push(cells);
        i++;
      }
      if (rows.length) blocks.push({ type: "table", rows });
      continue;
    }
    // fenced block — a ```chart fence becomes a native chart; anything else is code.
    const fence = /^\s*```\s*([A-Za-z][\w-]*)?/.exec(line);
    if (fence) {
      flushPara();
      const lang = (fence[1] || "").toLowerCase();
      i++;
      const body = [];
      while (i < lines.length && !/^\s*```/.test(lines[i])) { body.push(lines[i]); i++; }
      i++;  // closing fence
      if (lang === "chart") {
        const chart = parseChartSpec(body);
        if (chart) { blocks.push(chart); continue; }
        // unparseable chart spec → fall through and show the raw text as code
      } else if (lang === "notes") {
        const txt = body.join("\n").trim();
        if (txt) { blocks.push({ type: "notes", text: txt }); continue; }
      }
      blocks.push({ type: "code", text: body.join("\n") });
      continue;
    }
    // speaker notes — "Notes: ..." (or "> Notes: ...") on a line → slide notes
    const notesLine = /^>?\s*notes:\s*(.+)$/i.exec(line);
    if (notesLine) { flushPara(); blocks.push({ type: "notes", text: stripInline(notesLine[1].trim()) }); i++; continue; }

    // sub-heading (### or deeper, or a stray # inside a section)
    const sh = /^(#{1,6})\s+(.+)/.exec(line);
    if (sh) { flushPara(); blocks.push({ type: "subheading", text: stripInline(sh[2].trim()) }); i++; continue; }
    // bullet
    const b = /^(\s*)[-*+]\s+(.+)/.exec(line);
    if (b) { flushPara(); blocks.push({ type: "bullet", text: stripInline(b[2].trim()), indent: Math.min(4, Math.floor(b[1].length / 2)) }); i++; continue; }
    // numbered list
    const nb = /^(\s*)\d+\.\s+(.+)/.exec(line);
    if (nb) { flushPara(); blocks.push({ type: "bullet", text: stripInline(nb[2].trim()), indent: Math.min(4, Math.floor(nb[1].length / 2)), numbered: true }); i++; continue; }
    // blockquote
    const bq = /^\s*>\s?(.*)/.exec(line);
    if (bq) { flushPara(); blocks.push({ type: "paragraph", text: stripInline(bq[1].trim()), quote: true }); i++; continue; }
    // horizontal rule → ignore
    if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) { flushPara(); i++; continue; }
    // plain text → accumulate into a paragraph
    para.push(line.trim());
    i++;
  }
  flushPara();
  return blocks;
}

/**
 * Parse a ```chart fenced block into a chart spec. Format: optional
 * `type: bar|column|line|pie|doughnut|area` and `title: ...` lines, then a
 * markdown table whose first column is the category and each remaining column
 * is a data series. Returns null if there's no usable table.
 *
 *   type: bar
 *   title: Revenue by Region
 *   | Region | 2025 | 2026 |
 *   |--------|------|------|
 *   | North  | 120  | 180  |
 *   | South  | 90   | 110  |
 */
function parseChartSpec(lines) {
  let chartType = "bar";
  let title = "";
  const tableLines = [];
  for (const raw of lines) {
    const line = String(raw).trim();
    if (!line) continue;
    const t = /^type\s*:\s*([A-Za-z]+)/i.exec(line);
    if (t) { chartType = t[1].toLowerCase(); continue; }
    const ti = /^title\s*:\s*(.+)/i.exec(line);
    if (ti) { title = stripInline(ti[1].trim()); continue; }
    if (/^\|.*\|$/.test(line)) {
      if (/^\|[\s:|-]+\|$/.test(line)) continue;  // separator row
      tableLines.push(line);
    }
  }
  if (tableLines.length < 2) return null;  // need a header + at least one data row
  const rows = tableLines.map((l) =>
    l.replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => stripInline(c.trim())),
  );
  const header = rows[0];
  const dataRows = rows.slice(1);
  const categories = dataRows.map((r) => r[0]);
  const seriesNames = header.slice(1);
  if (!seriesNames.length) return null;
  const toNum = (v) => {
    const n = parseFloat(String(v ?? "").replace(/[$,%\s]/g, ""));
    return isNaN(n) ? 0 : n;
  };
  const series = seriesNames.map((name, ci) => ({
    name: name || `Series ${ci + 1}`,
    labels: categories,
    values: dataRows.map((r) => toNum(r[ci + 1])),
  }));
  return { type: "chart", chartType, title, series };
}

/** Build text-run objects (one auto-flowing text box) from non-table blocks. */
function textRunsFromBlocks(blocks, colors) {
  const runs = [];
  for (const blk of blocks) {
    if (blk.type === "subheading") {
      runs.push({ text: blk.text, options: { bold: true, fontSize: 18, color: colors.accent, breakLine: true, paraSpaceBefore: 8, paraSpaceAfter: 2 } });
    } else if (blk.type === "bullet") {
      runs.push({ text: blk.text, options: { fontSize: 15, color: colors.body, breakLine: true, bullet: blk.numbered ? { type: "number" } : true, indentLevel: blk.indent || 0 } });
    } else if (blk.type === "paragraph") {
      runs.push({ text: blk.text, options: { fontSize: 15, color: colors.body, italic: !!blk.quote, breakLine: true, paraSpaceAfter: 6 } });
    } else if (blk.type === "code") {
      for (const cl of String(blk.text).split("\n")) {
        runs.push({ text: cl || " ", options: { fontFace: "Courier New", fontSize: 12, color: colors.body, breakLine: true } });
      }
    }
  }
  return runs;
}

/**
 * Render the deck to a .pptx Buffer. Colors come from the same getStyleConfig()
 * presets as DOCX/PDF (hex without '#', which is exactly what pptxgenjs wants).
 * @returns {Promise<{ buffer: Buffer, slideCount: number }>}
 */
export async function buildPptxBuffer({ title, markdown, styleConfig, fallbackSubtitle }) {
  const colors = {
    body: styleConfig.font?.color || "1F2937",
    title: styleConfig.title?.color || "0F172A",
    heading: styleConfig.heading1?.color || styleConfig.title?.color || "0F172A",
    accent: styleConfig.heading2?.color || styleConfig.heading1?.color || "1E293B",
    headerFill: styleConfig.heading1?.color || styleConfig.title?.color || "0F172A",
    bg: "FFFFFF",
    font: styleConfig.font?.family || "Calibri",
  };

  const pptx = new PptxGenJS();
  pptx.defineLayout({ name: "LZ_WIDE", width: SLIDE_W, height: SLIDE_H });
  pptx.layout = "LZ_WIDE";
  pptx.author = "mcp-doc-processor";
  pptx.title = title;

  const CHART_TYPES = {
    bar: pptx.ChartType.bar, column: pptx.ChartType.bar, line: pptx.ChartType.line,
    pie: pptx.ChartType.pie, doughnut: pptx.ChartType.doughnut, donut: pptx.ChartType.doughnut,
    area: pptx.ChartType.area, scatter: pptx.ChartType.scatter, radar: pptx.ChartType.radar,
  };

  const { subtitle, sections } = splitSections(title, markdown, fallbackSubtitle);

  // --- Title slide ---
  const title0 = pptx.addSlide();
  title0.background = { color: colors.bg };
  title0.addShape(pptx.ShapeType.rect, { x: 0, y: 3.05, w: SLIDE_W, h: 0.07, fill: { color: colors.accent } });
  title0.addText(title, { x: 0.8, y: 2.0, w: SLIDE_W - 1.6, h: 1.0, fontFace: colors.font, fontSize: 40, bold: true, color: colors.title, align: "center", valign: "bottom" });
  if (subtitle) {
    title0.addText(subtitle, { x: 0.8, y: 3.25, w: SLIDE_W - 1.6, h: 0.9, fontFace: colors.font, fontSize: 18, color: colors.body, align: "center", valign: "top" });
  }

  // --- Content slides (one per H2 section) ---
  for (const section of sections) {
    const slide = pptx.addSlide();
    slide.background = { color: colors.bg };
    slide.addText(section.heading, { x: 0.6, y: 0.4, w: SLIDE_W - 1.2, h: 0.8, fontFace: colors.font, fontSize: 28, bold: true, color: colors.heading, align: "left", valign: "middle" });
    slide.addShape(pptx.ShapeType.line, { x: 0.6, y: 1.28, w: SLIDE_W - 1.2, h: 0, line: { color: colors.accent, width: 1.5 } });

    const blocks = parseBlocks(section.lines);
    const noteBlocks = blocks.filter((b) => b.type === "notes");
    const chartBlocks = blocks.filter((b) => b.type === "chart");
    const tableBlocks = blocks.filter((b) => b.type === "table");
    const textBlocks = blocks.filter((b) => !["table", "chart", "notes"].includes(b.type));
    const hasVisual = chartBlocks.length > 0 || tableBlocks.length > 0;
    if (noteBlocks.length) slide.addNotes(noteBlocks.map((b) => b.text).join("\n"));

    const runs = textRunsFromBlocks(textBlocks, colors);
    if (runs.length) {
      slide.addText(runs, { x: 0.6, y: 1.5, w: SLIDE_W - 1.2, h: hasVisual ? 2.4 : 5.4, fontFace: colors.font, valign: "top" });
    }
    if (chartBlocks.length) {
      // A chart takes the slide's visual slot — a native, editable PowerPoint chart.
      const c = chartBlocks[0];
      const ct = CHART_TYPES[c.chartType] || pptx.ChartType.bar;
      const pieish = c.chartType === "pie" || c.chartType === "doughnut" || c.chartType === "donut";
      const data = pieish ? c.series.slice(0, 1) : c.series;
      const opts = {
        x: 0.6, y: runs.length ? 4.0 : 1.5, w: SLIDE_W - 1.2, h: runs.length ? 3.0 : 5.5,
        chartColors: ["1E40AF", "059669", "D97706", "DC2626", "7C3AED", "0891B2", "DB2777", "65A30D"],
        showLegend: data.length > 1 || pieish, legendPos: "b", legendColor: colors.body,
        showTitle: !!c.title, title: c.title, titleColor: colors.heading, titleFontFace: colors.font, titleFontSize: 16,
        catAxisLabelColor: colors.body, valAxisLabelColor: colors.body,
        showValue: pieish, showPercent: pieish, dataLabelColor: pieish ? "FFFFFF" : colors.body,
      };
      if (c.chartType === "bar" || c.chartType === "column") opts.barDir = "col";
      slide.addChart(ct, data, opts);
    } else if (tableBlocks.length) {
      // Render the first table natively; extra tables (rare) are skipped to keep
      // the layout clean — the section heading still groups the content.
      const t = tableBlocks[0];
      const rows = t.rows.map((r, ri) =>
        r.map((cell) => ({
          text: cell,
          options: ri === 0
            ? { bold: true, color: "FFFFFF", fill: { color: colors.headerFill } }
            : { color: colors.body },
        })),
      );
      slide.addTable(rows, {
        x: 0.6, y: runs.length ? 4.4 : 1.6, w: SLIDE_W - 1.2,
        fontFace: colors.font, fontSize: 13,
        border: { type: "solid", color: "E5E7EB", pt: 1 },
        align: "left", valign: "middle", autoPage: false,
      });
    }
  }

  const buffer = await pptx.write({ outputType: "nodebuffer" });
  return { buffer, slideCount: 1 + sections.length };
}

/**
 * Create an editable PowerPoint (.pptx) presentation from markdown.
 *
 * Same input shape as create-doc / create-pdf (title, content/paragraphs,
 * tables, stylePreset, category, tags, dryRun, upload*). Each '## ' heading
 * becomes a slide; the title becomes a centered title slide. Output is a real,
 * editable .pptx (PowerPoint / Keynote / Google Slides) via pptxgenjs.
 */
export async function createPptx(input) {
  try {
    const parsedInput = typeof input === "string" ? JSON.parse(input) : input;

    const userExplicitlySetStyle = !!parsedInput.stylePreset;
    const dnaConfig = loadDNA();
    const hasDNA = dnaConfig !== null;
    applyDNAToInput(parsedInput);

    // Title validation
    const rawTitle = (parsedInput.title || "").trim();
    if (!rawTitle || GENERIC_TITLES.has(rawTitle.toLowerCase())) {
      return {
        success: false,
        error: "GENERIC_TITLE",
        message: `Title ${rawTitle ? `"${rawTitle}" is too generic` : "is empty"}. Provide a specific, descriptive title.\n\n` +
          `Good examples: "Q1 2026 Roadmap Review", "Acme Product Launch Deck".`,
      };
    }
    const title = rawTitle;

    // Body markdown (content preferred; paragraphs + tables folded in)
    let markdown = buildMarkdownBody(parsedInput);
    const tablesMd = tablesToMarkdown(parsedInput.tables);
    if (tablesMd) markdown = markdown ? `${markdown}\n\n${tablesMd}` : tablesMd;

    // Formatting assessment + optional hard guard (mirrors create-pdf)
    const formattingQuality = assessFormattingQuality({
      paragraphs: parsedInput.paragraphs,
      content: markdown,
      tables: parsedInput.tables,
    });
    if (!parsedInput.dryRun && shouldRejectPlainText(formattingQuality)) {
      return {
        success: false,
        error: "PLAIN_TEXT",
        message: `Refusing to create an unformatted plain-text deck (REQUIRE_FORMATTING is on). ${formattingQuality.hint}`,
        hint: formattingQuality.hint,
        formattingQuality,
      };
    }

    // Category (auto-classify if absent)
    let category = parsedInput.category || null;
    const tags = Array.isArray(parsedInput.tags) ? parsedInput.tags : [];
    if (!category) {
      const classification = classifyDocumentContent(title, "");
      if (classification.category !== "misc") category = classification.category;
    }

    // Style resolution
    const { preset: rawPreset, reason: styleReason } = resolveStylePreset(
      parsedInput, userExplicitlySetStyle, category, tags, title,
    );
    let stylePreset = rawPreset;
    if (!getAvailablePresets().includes(stylePreset)) {
      log("warn", `[create-pptx] Style preset "${stylePreset}" not found. Falling back to "minimal".`);
      stylePreset = "minimal";
    }
    const styleConfig = getStyleConfig(stylePreset, parsedInput.style || {});

    // Path resolution (mirror create-pdf): normalize → category → enforce docs/
    const normalized = validateAndNormalizeInput(parsedInput, [], "pptx");
    let outputPath = normalized.outputPath;
    if (!path.isAbsolute(outputPath)) outputPath = path.resolve(process.cwd(), outputPath);

    const { outputPath: categorizedPath, wasCategorized } = applyCategoryToPath(outputPath, category);
    outputPath = categorizedPath;

    const enforceDocs = parsedInput.enforceDocsFolder !== false;
    const { outputPath: docsPath, wasEnforced: docsEnforced } = enforceDocsFolder(outputPath, enforceDocs);
    if (docsEnforced) outputPath = docsPath;

    // Count sections for the preview/response (cheap parse).
    const { sections } = splitSections(title, markdown, parsedInput.description);
    const approxSlides = 1 + sections.length;

    // Dry run
    if (parsedInput.dryRun) {
      return {
        success: true,
        dryRun: true,
        preview: {
          title,
          outputPath,
          stylePreset,
          styleReason,
          slides: approxSlides,
          sectionHeadings: sections.map((s) => s.heading),
          category: category || null,
          tags: tags.length > 0 ? tags : null,
          wasCategorized,
          formattingQuality,
        },
        message: `DRY RUN - No file written. Deck that would be created:\n\nTitle: "${title}"\nPath: ${outputPath}\nSlides: ${approxSlides} (1 title + ${sections.length} section${sections.length === 1 ? "" : "s"})\nStyle: ${stylePreset}\n\nCall again without dryRun to create the file.`,
      };
    }

    // Duplicate prevention + ensure dir
    const preventDupes = parsedInput.preventDuplicates !== false;
    const uniquePath = await preventDuplicateFiles(outputPath, preventDupes);
    const wasDuplicatePrevented = uniquePath !== outputPath;
    outputPath = uniquePath;
    await ensureDirectory(path.dirname(outputPath));

    // Render + write
    const { buffer, slideCount } = await buildPptxBuffer({
      title,
      markdown,
      styleConfig,
      fallbackSubtitle: parsedInput.description,
    });
    await fs.writeFile(outputPath, buffer);

    // Registry (non-fatal)
    let registryEntry = null;
    try {
      registryEntry = await registerDocumentInRegistry({
        title,
        filePath: outputPath,
        category: category || "misc",
        tags,
        description: parsedInput.description || title,
      });
    } catch (err) {
      log("warn", "[create-pptx] Failed to register document:", { error: err.message });
    }

    // Lineage (non-fatal)
    try { await recordWrite(outputPath); } catch { /* non-fatal */ }

    // Optional upload bridge
    let uploadResult = null;
    let uploadError = null;
    if (parsedInput.uploadUrl && parsedInput.uploadAuthHeader) {
      try {
        uploadResult = await uploadFileToTarget({
          filePath: outputPath,
          uploadUrl: parsedInput.uploadUrl,
          uploadAuthHeader: parsedInput.uploadAuthHeader,
          filename: parsedInput.uploadFilename,
          mimeType: mimeTypeFromExtension(outputPath),
        });
      } catch (err) {
        uploadError = err.message;
        log("warn", "[create-pptx] upload failed (file still written locally)", { error: err.message });
      }
    } else if (parsedInput.uploadUrl || parsedInput.uploadAuthHeader) {
      uploadError = "uploadUrl and uploadAuthHeader must be provided together";
    }

    const clientMode = resolveClientHint(parsedInput);
    const isInteractive = clientMode === "interactive";

    // Learning loop
    const profile = resolveClientProfile(parsedInput);
    logInsight({
      server: "doc-processor", tool: "create-pptx", event: "success",
      client: profile.clientName, memoryCapable: profile.canPersistMemory,
      title, format: "pptx", stylePreset, category: category || null, slides: slideCount,
    });
    const learning = `For ${category || "general"} presentations, create-pptx with the "${stylePreset}" preset and one '## ' heading per slide worked well — reuse it for slide-deck requests.`;

    // Hosted download link (null on stdio/self-host).
    const downloadUrl = buildDownloadUrl(outputPath);

    let enforcementMessage = "";
    if (!isInteractive) {
      if (docsEnforced) enforcementMessage += `NOTE: File placed in docs/ folder. Set enforceDocsFolder: false to disable.\n`;
      if (wasDuplicatePrevented) enforcementMessage += `NOTE: Duplicate prevented. Used unique filename: ${path.basename(outputPath)}.\n`;
      if (wasCategorized) enforcementMessage += `NOTE: Categorized as "${category}" → docs/${getCategoryPath(category).subfolder}/.\n`;
      if (registryEntry) enforcementMessage += `NOTE: Registered (ID: ${registryEntry.id}).\n`;
    }

    const uploadAttempted = !!uploadResult || !!uploadError;
    const uploadFields = uploadAttempted
      ? {
          uploaded: !!uploadResult,
          uploadAttachment: uploadResult?.attachment || null,
          uploadStatus: uploadResult?.status || null,
          uploadError: uploadError || null,
        }
      : {};

    const downloadLine = downloadUrl ? ` Download it: ${downloadUrl} (link valid ~24h).` : "";
    const interactiveMessage = (uploadResult
      ? `Created and uploaded: ${outputPath}`
      : uploadError
        ? `Created locally at ${outputPath}; upload failed: ${uploadError}`
        : `Created: ${outputPath}`) + downloadLine;
    const agentMessage = `PPTX FILE WRITTEN TO DISK at: ${outputPath}\n\nIMPORTANT: This tool created an actual editable .pptx (${slideCount} slides). Do NOT create any additional files. The deck is at the absolute path above.\n\n${enforcementMessage}` +
      (downloadUrl ? `\nDOWNLOAD (hosted; valid ~24h): ${downloadUrl}\nTo save it on the user's machine, fetch that URL (or share it with the user to click).\n` : "") +
      (uploadResult ? `\nUPLOADED (status ${uploadResult.status}).\n` : uploadError ? `\nUPLOAD FAILED: ${uploadError}\n` : "");

    return {
      success: true,
      filePath: outputPath,
      downloadUrl: downloadUrl || undefined,
      clientMode,
      slides: slideCount,
      ...uploadFields,
      category: category || null,
      tags: tags.length > 0 ? tags : null,
      wasCategorized,
      registryEntry: registryEntry ? { id: registryEntry.id, category: registryEntry.category } : null,
      stylePreset,
      styleReason,
      formattingQuality: isInteractive ? undefined : formattingQuality,
      formatSuggestion: isInteractive ? undefined : suggestBetterFormat({ paragraphs: parsedInput.paragraphs, content: markdown, tables: parsedInput.tables }, "pptx"),
      memoryNudge: (isInteractive || !profile.canPersistMemory) ? undefined : memoryNudge(learning, `create-pptx:${category || "general"}:${stylePreset}`),
      styleConfig: isInteractive ? undefined : {
        preset: stylePreset,
        description: getPresetDescription(stylePreset),
        font: styleConfig.font,
      },
      dnaApplied: hasDNA,
      message: isInteractive ? interactiveMessage : agentMessage,
    };
  } catch (err) {
    return {
      success: false,
      error: err.message,
      message: `Failed to create PPTX: ${err.message}`,
    };
  }
}
