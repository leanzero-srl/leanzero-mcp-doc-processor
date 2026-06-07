import fs from "fs/promises";
import path from "path";

import { PptxParser } from "../parsers/pptx-parser.js";
import { buildPptxBuffer } from "./create-pptx.js";
import { getStyleConfig, getAvailablePresets } from "./styling.js";
import { buildDownloadUrl } from "../utils/download-registry.js";
import { mimeTypeFromExtension, uploadFileToTarget, resolveClientHint } from "./utils.js";
import { resolveClientProfile } from "../utils/client-profile.js";
import { logInsight } from "../utils/insights.js";
import { log } from "../utils/logger.js";

const parser = new PptxParser();

/**
 * Reconstruct an editable markdown body from a parsed deck's slides.
 * slides[0] is the title slide; slides[1..] are content slides. Body paragraphs
 * become bullets and notes become a `Notes:` line — so the result round-trips
 * back through the create-pptx renderer.
 */
function deckToMarkdown(slides) {
  const out = [];
  for (let i = 1; i < slides.length; i++) {
    const s = slides[i];
    out.push(`## ${s.title || `Slide ${i + 1}`}`);
    for (const para of (s.paragraphs || []).slice(1)) out.push(`- ${para}`);
    if (s.notes) out.push(`Notes: ${s.notes}`);
    out.push("");
  }
  return out.join("\n").trim();
}

/** Split a deck markdown body into per-slide sections (split on '## '). */
function splitSections(md) {
  const parts = [];
  let cur = null;
  for (const line of md.split("\n")) {
    if (/^##\s+/.test(line)) { cur = [line]; parts.push(cur); }
    else if (cur) cur.push(line);
  }
  return parts.map((p) => p.join("\n").trim());
}

/**
 * Edit an existing PowerPoint (.pptx). Actions:
 *   - 'preview'        : return the current slide outline (no write)
 *   - 'append-slides'  : append new slides (markdown, '## ' per slide)
 *   - 'replace-slide'  : replace one content slide (1-based) with new markdown
 *
 * IMPORTANT: edit-pptx REBUILDS the deck from the existing slides' extracted
 * TEXT + speaker notes, normalized to a style preset. Charts, images, and exact
 * original formatting on pre-existing slides are NOT preserved — best for the
 * text/bullet decks that create-pptx produces. (Mirrors edit-doc's useLegacy
 * trade-off, but for .pptx where there is no XML-patch path yet.)
 */
export async function editPptx(input) {
  try {
    const params = typeof input === "string" ? JSON.parse(input) : input;
    const filePath = params.filePath;
    const action = params.action || "preview";
    if (!filePath) return { success: false, error: "filePath is required" };

    const parsed = await parser.parse(filePath);
    if (!parsed.success) return { success: false, error: parsed.error || "Could not read the .pptx" };
    const slides = parsed.slides || [];
    const deckTitle = parsed.metadata?.title || (slides[0] && slides[0].title) || "Presentation";
    const contentSlideCount = Math.max(0, slides.length - 1);

    if (action === "preview") {
      return {
        success: true,
        action: "preview",
        filePath,
        title: deckTitle,
        slideCount: slides.length,
        slides: slides.map((s, i) => ({
          index: i + 1,
          kind: i === 0 ? "title" : "content",
          title: s.title || null,
          hasNotes: !!s.notes,
        })),
        message: `Deck "${deckTitle}" has ${slides.length} slide(s): 1 title + ${contentSlideCount} content. Use action 'append-slides' (add new '## ' slides) or 'replace-slide' (slideIndex 1..${contentSlideCount}).`,
      };
    }

    let markdown = deckToMarkdown(slides);

    if (action === "append-slides") {
      const add = String(params.content || "").trim();
      if (!add) return { success: false, error: "content (new slide markdown, '## ' per slide) is required for append-slides" };
      markdown = markdown ? `${markdown}\n\n${add}` : add;
    } else if (action === "replace-slide") {
      const idx = parseInt(params.slideIndex, 10); // 1-based among CONTENT slides
      const add = String(params.content || "").trim();
      if (!idx || idx < 1 || idx > contentSlideCount) {
        return { success: false, error: `slideIndex must be 1..${contentSlideCount} (the content slides; the title slide is not editable here)` };
      }
      if (!add) return { success: false, error: "content is required for replace-slide" };
      const sections = splitSections(markdown);
      sections[idx - 1] = /^##\s+/.test(add) ? add : `## ${params.title || "Slide"}\n${add}`;
      markdown = sections.join("\n\n");
    } else {
      return { success: false, error: `Unknown action "${action}". Use preview / append-slides / replace-slide.` };
    }

    let stylePreset = params.stylePreset || "claude-like";
    if (!getAvailablePresets().includes(stylePreset)) stylePreset = "claude-like";
    const styleConfig = getStyleConfig(stylePreset, params.style || {});
    const { buffer, slideCount } = await buildPptxBuffer({ title: deckTitle, markdown, styleConfig });

    const outPath = params.outputPath ? path.resolve(params.outputPath) : path.resolve(filePath);
    await fs.writeFile(outPath, buffer);

    // Optional upload bridge (same contract as create-*).
    let uploadResult = null;
    let uploadError = null;
    if (params.uploadUrl && params.uploadAuthHeader) {
      try {
        uploadResult = await uploadFileToTarget({
          filePath: outPath, uploadUrl: params.uploadUrl, uploadAuthHeader: params.uploadAuthHeader,
          filename: params.uploadFilename, mimeType: mimeTypeFromExtension(outPath),
        });
      } catch (err) { uploadError = err.message; log("warn", "[edit-pptx] upload failed", { error: err.message }); }
    } else if (params.uploadUrl || params.uploadAuthHeader) {
      uploadError = "uploadUrl and uploadAuthHeader must be provided together";
    }

    const clientMode = resolveClientHint(params);
    const profile = resolveClientProfile(params);
    logInsight({ server: "doc-processor", tool: "edit-pptx", event: "success", client: profile.clientName, action, slides: slideCount });
    const downloadUrl = buildDownloadUrl(outPath);

    return {
      success: true,
      action,
      filePath: outPath,
      downloadUrl: downloadUrl || undefined,
      clientMode,
      slides: slideCount,
      rebuilt: true,
      uploaded: uploadResult ? true : uploadError ? false : undefined,
      uploadError: uploadError || undefined,
      message:
        `PPTX ${action === "append-slides" ? "slides appended" : "slide replaced"} → ${outPath} (${slideCount} slides). ` +
        `NOTE: edit-pptx rebuilds the deck from the existing slides' extracted TEXT + notes, normalized to the "${stylePreset}" preset — ` +
        `charts, images, and exact original formatting on pre-existing slides are not preserved.` +
        (downloadUrl ? `\nDownload (hosted; ~24h): ${downloadUrl}` : ""),
    };
  } catch (err) {
    return { success: false, error: err.message, message: `Failed to edit PPTX: ${err.message}` };
  }
}
