/**
 * Formatting-quality assessment.
 *
 * Weak / local models frequently emit document bodies as a wall of plain text
 * with no markdown structure, producing ugly unformatted documents. This module
 * inspects the body the model passed and reports which structural features are
 * present, so callers can:
 *   - attach a non-fatal `formattingQuality` field to the response (a correction
 *     signal the model can learn from across turns), and
 *   - optionally hard-reject a wholly-unformatted body when REQUIRE_FORMATTING
 *     is enabled.
 *
 * No dependencies — pure string heuristics so it is safe on any hot path.
 */

// A short, concrete hint the model can act on next time. Kept generic across
// create-doc / create-markdown / create-pdf.
export const FORMATTING_HINT =
  "This body has no headings, lists, emphasis, or tables, so it will render as " +
  "flat plain text. Re-create it with markdown structure: use '# Title' and " +
  "'## Section' headings, '- ' bullet lists or '1. ' numbered lists, '**bold**' " +
  "for emphasis, '> ' for callouts, and '| col | col |' GitHub tables. The " +
  "easiest way is to pass the entire body as ONE markdown string in the " +
  "`content` parameter.";

/**
 * Normalize mixed paragraph input (strings and/or {text} objects) plus optional
 * extras into a single markdown-ish string for heuristic scanning.
 *
 * @param {Object} parts
 * @param {Array} [parts.paragraphs] - string and/or {text, headingLevel} items
 * @param {string} [parts.content] - a full markdown body string
 * @param {Array} [parts.tables] - 2D table arrays (presence implies a table)
 * @returns {{text: string, hasTableInput: boolean, hasHeadingObjects: boolean}}
 */
export function collectBodyText({ paragraphs = [], content = "", tables = [] } = {}) {
  const chunks = [];
  let hasHeadingObjects = false;

  if (typeof content === "string" && content.trim()) {
    chunks.push(content);
  }

  if (Array.isArray(paragraphs)) {
    for (const p of paragraphs) {
      if (typeof p === "string") {
        chunks.push(p);
      } else if (p && typeof p === "object" && typeof p.text === "string") {
        chunks.push(p.text);
        if (p.headingLevel) hasHeadingObjects = true;
      }
    }
  }

  const hasTableInput = Array.isArray(tables) && tables.length > 0;
  return { text: chunks.join("\n\n"), hasTableInput, hasHeadingObjects };
}

/**
 * Assess the structural formatting present in a document body.
 *
 * @param {Object} parts - see collectBodyText
 * @returns {{
 *   headings: boolean, lists: boolean, emphasis: boolean, tables: boolean,
 *   blockquotes: boolean, codeBlocks: boolean, links: boolean,
 *   isPlainText: boolean, length: number, hint: (string|undefined)
 * }}
 */
export function assessFormattingQuality(parts = {}) {
  const { text, hasTableInput, hasHeadingObjects } = collectBodyText(parts);

  const headings = hasHeadingObjects || /^[ \t]*#{1,6}[ \t]+\S/m.test(text);
  const lists = /^[ \t]*([-*+]|\d+[.)])[ \t]+\S/m.test(text);
  const emphasis =
    /\*\*[^*\n]+\*\*/.test(text) || // **bold**
    /__[^_\n]+__/.test(text) || // __bold__
    /(^|[^*\w])\*[^*\n]+\*([^*\w]|$)/.test(text) || // *italic*
    /`[^`\n]+`/.test(text); // `code`
  const tables = hasTableInput || /^[ \t]*\|.*\|.*$/m.test(text);
  const blockquotes = /^[ \t]*>[ \t]?\S/m.test(text);
  const codeBlocks = /```/.test(text);
  const links = /\[[^\]]+\]\([^)]+\)/.test(text);

  const isPlainText =
    !headings && !lists && !emphasis && !tables && !blockquotes && !codeBlocks;

  const result = {
    headings,
    lists,
    emphasis,
    tables,
    blockquotes,
    codeBlocks,
    links,
    isPlainText,
    length: text.length,
  };
  if (isPlainText) result.hint = FORMATTING_HINT;
  return result;
}

/**
 * Whether the "never plain text" guard should hard-reject this body.
 * Controlled by the REQUIRE_FORMATTING env toggle (default: warn-only / off).
 * Only rejects substantive bodies so a one-line note doesn't get blocked.
 *
 * @param {object} quality - result of assessFormattingQuality
 * @param {number} [minLength=200] - ignore very short bodies
 * @returns {boolean}
 */
export function shouldRejectPlainText(quality, minLength = 200) {
  const enabled = /^(1|true|yes|on)$/i.test(String(process.env.REQUIRE_FORMATTING || ""));
  return enabled && quality.isPlainText && quality.length >= minLength;
}
