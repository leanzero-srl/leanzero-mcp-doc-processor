import fs from "fs/promises";
import JSZip from "jszip";

import { log } from "../utils/logger.js";

/**
 * PPTX parser — extracts slide text (and speaker notes) from a PowerPoint file.
 *
 * A .pptx is a ZIP of OpenXML parts. Slide text lives in ppt/slides/slideN.xml
 * as <a:t> runs inside <a:p> paragraphs; speaker notes live in the matching
 * ppt/notesSlides/notesSlideN.xml. We read them in slide order and emit a
 * per-slide text block, so read-doc can summarize / search a deck the same way
 * it reads PDF / DOCX / Excel. This closes the loop with create-pptx.
 */

const NAMED_ENTITIES = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&apos;": "'" };

function unescapeXml(s) {
  return String(s).replace(
    /&amp;|&lt;|&gt;|&quot;|&apos;|&#(\d+);|&#x([0-9a-fA-F]+);/g,
    (m, dec, hex) => {
      if (dec) return String.fromCodePoint(parseInt(dec, 10));
      if (hex) return String.fromCodePoint(parseInt(hex, 16));
      return NAMED_ENTITIES[m] || m;
    },
  );
}

/** Extract reading-order text from a slide/notes XML, one entry per <a:p>. */
function paragraphsFromXml(xml) {
  const paras = [];
  const pRe = /<a:p\b[^>]*>([\s\S]*?)<\/a:p>/g;
  let p;
  while ((p = pRe.exec(xml)) !== null) {
    const runs = [];
    const tRe = /<a:t>([\s\S]*?)<\/a:t>/g;
    let t;
    while ((t = tRe.exec(p[1])) !== null) runs.push(unescapeXml(t[1]));
    const text = runs.join("").trim();
    if (text) paras.push(text);
  }
  return paras;
}

function slideNum(name) {
  const m = /(\d+)\.xml$/.exec(name);
  return m ? parseInt(m[1], 10) : 0;
}

export class PptxParser {
  constructor() {
    this.name = "PptxParser";
  }

  /**
   * Parse a .pptx into { success, text, metadata: { title, slideCount, format }, slides }.
   * `text` is a per-slide transcript ("=== Slide N: <title> ===\n…[Speaker notes] …").
   */
  async parse(filePath) {
    try {
      const buf = await fs.readFile(filePath);
      const zip = await JSZip.loadAsync(buf);

      const slideNames = Object.keys(zip.files)
        .filter((f) => /^ppt\/slides\/slide\d+\.xml$/.test(f))
        .sort((a, b) => slideNum(a) - slideNum(b));

      // Speaker notes, keyed by number. notesSlideN ↔ slideN is the common 1:1
      // case; a best-effort mapping is enough for read-back / search.
      const notesByNum = {};
      for (const f of Object.keys(zip.files)) {
        if (/^ppt\/notesSlides\/notesSlide\d+\.xml$/.test(f)) {
          const xml = await zip.file(f).async("string");
          const txt = paragraphsFromXml(xml).join("\n").trim();
          if (txt) notesByNum[slideNum(f)] = txt;
        }
      }

      const slides = [];
      const parts = [];
      for (let idx = 0; idx < slideNames.length; idx++) {
        const xml = await zip.file(slideNames[idx]).async("string");
        const paras = paragraphsFromXml(xml);
        const titleLine = paras[0] || "";
        const note = notesByNum[slideNum(slideNames[idx])];
        slides.push({ index: idx + 1, title: titleLine, paragraphs: paras, notes: note || null });

        let block = `=== Slide ${idx + 1}${titleLine ? `: ${titleLine}` : ""} ===\n`;
        block += paras.join("\n");
        if (note) block += `\n[Speaker notes] ${note}`;
        parts.push(block);
      }

      // Title from docProps/core.xml, else the first slide's title.
      let docTitle = "";
      const coreFile = zip.file("docProps/core.xml");
      if (coreFile) {
        const core = await coreFile.async("string");
        const tm = /<dc:title>([\s\S]*?)<\/dc:title>/.exec(core);
        if (tm) docTitle = unescapeXml(tm[1]).trim();
      }
      if (!docTitle && slides.length) docTitle = slides[0].title;

      return {
        success: true,
        text: parts.join("\n\n"),
        images: [],
        metadata: {
          title: docTitle || null,
          slideCount: slides.length,
          format: "pptx",
        },
        slides,
      };
    } catch (err) {
      log("error", "[PptxParser] parse failed", { error: err.message });
      return { success: false, error: `Failed to parse PPTX: ${err.message}` };
    }
  }

  /**
   * Structure = one entry per slide (its title), used by read-doc 'indepth'.
   * Shape matches the other parsers ({ level, text, isHeader }) so the read-doc
   * structure renderer prints it correctly.
   */
  async getStructure(text) {
    const structure = [];
    const re = /^=== Slide (\d+)(?:: (.*))? ===$/gm;
    let m;
    while ((m = re.exec(text)) !== null) {
      structure.push({
        level: 1,
        text: m[2] ? `Slide ${m[1]}: ${m[2]}` : `Slide ${m[1]}`,
        isHeader: true,
      });
    }
    return structure;
  }
}
