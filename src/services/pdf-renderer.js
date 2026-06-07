/**
 * PDF renderer — markdown → HTML → (CSS from STYLE_PRESETS) → Puppeteer → PDF.
 *
 * Renders styled PDFs that mirror the DOCX styling intent by deriving CSS from
 * the same `styleConfig` produced by getStyleConfig() (src/tools/styling.js).
 * marked (already a dependency) handles markdown → HTML, so headings, lists,
 * tables, code blocks, blockquotes, links and emphasis all render with no extra
 * layout code.
 *
 * Puppeteer ships its own Chromium (no system install). The browser is launched
 * once and reused across requests (process-wide singleton), and closed on
 * shutdown. Under the launchd LaunchAgent it runs as the user, so it finds its
 * Chromium cache via $HOME / PUPPETEER_CACHE_DIR.
 */

import { marked } from "marked";
import puppeteer from "puppeteer";

import { log } from "../utils/logger.js";

// ---------------------------------------------------------------------------
// Singleton browser
// ---------------------------------------------------------------------------

let browserPromise = null;
let shutdownHooked = false;

async function getBrowser() {
  if (!browserPromise) {
    log("info", "[pdf-renderer] launching headless Chromium (first use)");
    browserPromise = puppeteer
      .launch({
        headless: "new",
        args: ["--no-sandbox", "--disable-setuid-sandbox", "--font-render-hinting=none"],
      })
      .catch((err) => {
        // Reset so a later call can retry instead of caching a rejected promise.
        browserPromise = null;
        throw err;
      });
    registerShutdownHooks();
  }
  return browserPromise;
}

/** Close the shared browser (idempotent). Called on shutdown. */
export async function closeBrowser() {
  if (!browserPromise) return;
  const p = browserPromise;
  browserPromise = null;
  try {
    const browser = await p;
    await browser.close();
  } catch {
    // best-effort
  }
}

function registerShutdownHooks() {
  if (shutdownHooked) return;
  shutdownHooked = true;
  for (const sig of ["SIGTERM", "SIGINT"]) {
    process.once(sig, () => {
      closeBrowser().finally(() => process.exit(0));
    });
  }
}

// ---------------------------------------------------------------------------
// HTML / CSS generation
// ---------------------------------------------------------------------------

function escapeHtml(str = "") {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// GitHub-style anchor slug, used for clickable in-PDF TOC links.
function slugify(text) {
  return String(text)
    .toLowerCase()
    .replace(/<[^>]+>/g, "")
    .replace(/[`*_~]/g, "")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

/**
 * Add id="slug" anchors to h1/h2/h3 in the rendered HTML and, when requested,
 * build a clickable Table of Contents (rendered as internal links — clickable
 * in the PDF). Returns { html, tocHtml }.
 */
function injectAnchorsAndToc(bodyHtml, withToc) {
  const headings = [];
  const seen = Object.create(null);
  const html = bodyHtml.replace(/<h([123])([^>]*)>([\s\S]*?)<\/h\1>/g, (m, lvl, attrs, inner) => {
    const text = inner.replace(/<[^>]+>/g, "").trim();
    let slug = slugify(text);
    if (slug in seen) { seen[slug] += 1; slug = `${slug}-${seen[slug]}`; }
    else { seen[slug] = 0; }
    if (Number(lvl) <= 3) headings.push({ lvl: Number(lvl), text, slug });
    return `<h${lvl}${attrs} id="${slug}">${inner}</h${lvl}>`;
  });
  if (!withToc || headings.length === 0) return { html, tocHtml: "" };
  const items = headings
    .map((h) => `<li class="toc-l${h.lvl}"><a href="#${h.slug}">${escapeHtml(h.text)}</a></li>`)
    .join("");
  const tocHtml = `<nav class="doc-toc"><div class="toc-title">Contents</div><ul>${items}</ul></nav>`;
  return { html, tocHtml };
}

// styleConfig stores colors as bare hex ("1F2937"); CSS needs a leading '#'.
function color(hex, fallback) {
  const v = hex || fallback;
  return v ? `#${String(v).replace(/^#/, "")}` : "inherit";
}

/**
 * Map a docx-style font family to a web-safe CSS font stack. The bundled
 * Chromium won't have Calibri/Garamond installed, so substitute close matches
 * while keeping the serif/sans/mono character of each preset.
 */
function fontStack(family = "") {
  const f = family.toLowerCase();
  if (/(garamond|times|georgia|serif|cambria|book antiqua)/.test(f)) {
    return `Georgia, 'Times New Roman', serif`;
  }
  if (/(consolas|courier|mono|menlo)/.test(f)) {
    return `'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace`;
  }
  // Calibri, Arial, Segoe, Verdana, Trebuchet, Century Gothic, etc.
  return `'Helvetica Neue', Helvetica, Arial, ${family ? `'${family}', ` : ""}sans-serif`;
}

function buildCss(styleConfig) {
  const s = styleConfig || {};
  const font = s.font || {};
  const h1 = s.heading1 || {};
  const h2 = s.heading2 || {};
  const h3 = s.heading3 || {};
  const title = s.title || {};
  const para = s.paragraph || {};
  const table = s.table || {};
  const code = s.code || {};
  const bq = s.blockquote || {};
  const hr = s.hr || {};
  const link = s.link || {};

  const bodyFamily = fontStack(font.family);
  const headingFamily = fontStack(s.headingFont || font.family);
  const codeFamily = fontStack(code.fontFamily || "Consolas");

  return `
    * { box-sizing: border-box; }
    body {
      font-family: ${bodyFamily};
      font-size: ${font.size || 11}pt;
      color: ${color(font.color, "1F2937")};
      line-height: ${para.lineSpacing || 1.4};
      margin: 0;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    h1.doc-title {
      font-family: ${headingFamily};
      font-size: ${title.size || 26}pt;
      color: ${color(title.color, "0F172A")};
      font-weight: ${title.bold === false ? "normal" : "bold"};
      text-align: ${title.alignment || "left"};
      margin: 0 0 18pt 0;
    }
    h1 { font-family: ${headingFamily}; font-size: ${h1.size || 20}pt; color: ${color(h1.color, "0F172A")}; font-weight: ${h1.bold === false ? "normal" : "bold"}; margin: 18pt 0 8pt; }
    h2 { font-family: ${headingFamily}; font-size: ${h2.size || 16}pt; color: ${color(h2.color, "1E293B")}; font-weight: ${h2.bold === false ? "normal" : "bold"}; margin: 16pt 0 7pt; }
    h3 { font-family: ${headingFamily}; font-size: ${h3.size || 13}pt; color: ${color(h3.color, "334155")}; font-weight: ${h3.bold === false ? "normal" : "bold"}; margin: 13pt 0 6pt; }
    h4, h5, h6 { font-family: ${headingFamily}; color: ${color(h3.color, "334155")}; margin: 12pt 0 6pt; }
    p { margin: 0 0 ${Math.max(4, Math.round((para.spacingAfter || 200) / 20))}pt; }
    ul, ol { margin: 0 0 8pt; padding-left: 24pt; }
    li { margin: 2pt 0; }
    a { color: ${color(link.color, "2563EB")}; text-decoration: ${link.underline === false ? "none" : "underline"}; }
    strong, b { font-weight: bold; }
    em, i { font-style: italic; }
    code {
      font-family: ${codeFamily};
      font-size: ${code.fontSize || 10}pt;
      color: ${color(code.color, "0F172A")};
      background: ${color(code.backgroundColor, "F3F4F6")};
      padding: 1pt 3pt;
      border-radius: 3px;
    }
    pre {
      font-family: ${codeFamily};
      font-size: ${code.fontSize || 10}pt;
      color: ${color(code.color, "0F172A")};
      background: ${color(code.backgroundColor, "F8FAFC")};
      border: 1px solid ${color(code.borderColor, "E2E8F0")};
      border-radius: 4px;
      padding: 8pt 10pt;
      overflow-x: auto;
      white-space: pre-wrap;
      word-wrap: break-word;
    }
    pre code { background: none; padding: 0; border-radius: 0; }
    blockquote {
      margin: 8pt 0;
      padding: 2pt 12pt;
      border-left: ${Math.max(2, Math.round((bq.borderWidth || 12) / 4))}px solid ${color(bq.borderColor, "94A3B8")};
      color: ${color(bq.color, "475569")};
      font-style: ${bq.italic === false ? "normal" : "italic"};
    }
    hr {
      border: none;
      border-top: ${Math.max(1, Math.round((hr.thickness || 4) / 4))}px solid ${color(hr.color, "E2E8F0")};
      margin: 14pt 0;
    }
    table {
      border-collapse: collapse;
      width: 100%;
      margin: 10pt 0;
      font-size: ${Math.max(9, (font.size || 11) - 1)}pt;
    }
    th, td {
      border: 1px solid ${color(table.insideBorderColor || table.borderColor, "E2E8F0")};
      padding: 5pt 8pt;
      text-align: left;
      vertical-align: top;
    }
    th {
      background: ${color(table.headerFill, "F1F5F9")};
      color: ${color(table.headerFontColor, "0F172A")};
      font-weight: bold;
    }
    tbody tr:nth-child(${(table.zebraInterval || 2)}n) { background: ${color(table.zebraFill, "F8FAFC")}; }
    img { max-width: 100%; }
    nav.doc-toc {
      margin: 6pt 0 16pt;
      padding: 10pt 14pt;
      background: ${color(table.headerFill, "F8FAFC")};
      border: 1px solid ${color(table.borderColor, "E2E8F0")};
      border-radius: 8px;
      page-break-after: avoid;
    }
    nav.doc-toc .toc-title { font-family: ${headingFamily}; font-weight: bold; font-size: ${Math.max(11, (h3.size || 13))}pt; color: ${color(h2.color, "1E293B")}; margin-bottom: 4pt; }
    nav.doc-toc ul { list-style: none; margin: 0; padding: 0; }
    nav.doc-toc li { margin: 1.5pt 0; }
    nav.doc-toc li.toc-l2 { padding-left: 0; }
    nav.doc-toc li.toc-l3 { padding-left: 16pt; font-size: ${Math.max(9, (font.size || 11) - 1)}pt; }
    nav.doc-toc a { color: ${color(link.color, "2563EB")}; text-decoration: none; }
  `;
}

/**
 * Build a Puppeteer header/footer template from a {text, alignment, color}
 * config. Puppeteer requires an explicit font-size and inline styling; page
 * numbers use the special .pageNumber / .totalPages spans.
 */
function buildHeaderFooterTemplate(cfg) {
  if (!cfg || !cfg.text) return "<span></span>";
  const align = cfg.alignment || "center";
  const justify = align === "left" ? "flex-start" : align === "right" ? "flex-end" : "center";
  const col = color(cfg.color, "666666");
  const text = escapeHtml(cfg.text)
    .replace(/\{current\}/g, '<span class="pageNumber"></span>')
    .replace(/\{total\}/g, '<span class="totalPages"></span>');
  return `<div style="width:100%; font-size:9px; color:${col}; padding:0 12mm; display:flex; justify-content:${justify};">${text}</div>`;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Convert twips (1440 = 1in) to an inches CSS string. */
function twipsToIn(twips, fallbackIn) {
  if (typeof twips === "number" && twips > 0) return `${twips / 1440}in`;
  return `${fallbackIn}in`;
}

/**
 * Render a markdown document to a PDF buffer.
 *
 * @param {Object} opts
 * @param {string} opts.title - Document title (rendered as the top H1).
 * @param {string} opts.markdown - Body as a markdown string.
 * @param {Object} opts.styleConfig - From getStyleConfig(preset, overrides).
 * @param {Object} [opts.header] - {text, alignment?, color?}
 * @param {Object} [opts.footer] - {text, alignment?, color?} ({current}/{total})
 * @param {Object} [opts.margins] - {top,bottom,left,right} in twips
 * @returns {Promise<Buffer>}
 */
export async function renderMarkdownToPdf({ title, markdown, styleConfig, header, footer, margins, toc } = {}) {
  const rawBody = marked.parse(markdown || "", { async: false });
  const { html: bodyHtml, tocHtml } = injectAnchorsAndToc(rawBody, toc === true);
  const css = buildCss(styleConfig);
  const titleHtml = title ? `<h1 class="doc-title">${escapeHtml(title)}</h1>` : "";

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>${css}</style></head>` +
    `<body>${titleHtml}${tocHtml}${bodyHtml}</body></html>`;

  const hasHeader = !!(header && header.text);
  const hasFooter = !!(footer && footer.text);
  const m = margins || {};

  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    await page.setContent(html, { waitUntil: "load" });
    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      displayHeaderFooter: hasHeader || hasFooter,
      headerTemplate: buildHeaderFooterTemplate(header),
      footerTemplate: buildHeaderFooterTemplate(footer),
      margin: {
        // Leave room for header/footer when present.
        top: twipsToIn(m.top, hasHeader ? 1 : 0.6),
        bottom: twipsToIn(m.bottom, hasFooter ? 1 : 0.6),
        left: twipsToIn(m.left, 0.75),
        right: twipsToIn(m.right, 0.75),
      },
    });
    return Buffer.from(pdf);
  } finally {
    await page.close().catch(() => {});
  }
}
