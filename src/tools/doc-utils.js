import {
  Paragraph,
  TextRun,
  Table,
  TableCell,
  TableRow,
  AlignmentType,
} from "docx";
import { marked } from "marked";

/**
 * Strips markdown line-level prefixes from a string.
 * Removes heading markers, bullet prefixes, blockquote markers, horizontal rules,
 * and image references. Returns cleaned text.
 */
export function stripMarkdownLinePrefixes(text) {
  if (!text || typeof text !== "string") return text || "";

  let cleaned = text;

  // Strip heading prefixes: "# ", "## ", "### ", etc.
  cleaned = cleaned.replace(/^#{1,6}\s+/gm, "");

  // Strip bullet/list prefixes: "- ", "* ", "+ ", "1. ", "2. ", etc.
  cleaned = cleaned.replace(/^[\s]*[-*+]\s+/gm, "");
  cleaned = cleaned.replace(/^[\s]*\d+\.\s+/gm, "");

  // Strip blockquote markers: "> "
  cleaned = cleaned.replace(/^>\s*/gm, "");

  // Strip horizontal rules (entire line is ---, ***, ___)
  cleaned = cleaned.replace(/^[-*_]{3,}\s*$/gm, "");

  // Strip image references: ![alt](url)
  cleaned = cleaned.replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1");

  return cleaned.trim();
}

/**
 * Creates a styled text run for paragraphs
 */
export function createText(text, options = {}) {
  return new TextRun({
    text: String(text || ""),
    bold: options.bold ?? false,
    italics: options.italics ?? false,
    underline: options.underline ? { style: "single" } : undefined,
    size: (options.size || 12) * 2, // Convert points to half-points
    color: options.color || "000000",
    font: options.fontFamily || "Arial",
  });
}

/**
 * Recursively processes marked.js tokens to create TextRun objects.
 * Handles nested formatting correctly (e.g., **bold with *italic* inside**).
 */
function processMarkedToken(token, baseStyle, currentStyle = {}) {
  const style = { ...baseStyle, ...currentStyle };
  const runs = [];

  switch (token.type) {
    case "text":
      runs.push(createText(token.text, style));
      break;

    case "strong":
      // Bold text - process nested tokens with bold: true
      if (token.tokens && token.tokens.length > 0) {
        token.tokens.forEach((childToken) => {
          runs.push(
            ...processMarkedToken(childToken, baseStyle, { ...currentStyle, bold: true }),
          );
        });
      } else if (token.text) {
        runs.push(createText(token.text, { ...style, bold: true }));
      }
      break;

    case "em":
      // Italic text - process nested tokens with italics: true
      if (token.tokens && token.tokens.length > 0) {
        token.tokens.forEach((childToken) => {
          runs.push(
            ...processMarkedToken(childToken, baseStyle, { ...currentStyle, italics: true }),
          );
        });
      } else if (token.text) {
        runs.push(createText(token.text, { ...style, italics: true }));
      }
      break;

    case "codespan":
      // Inline code - use monospace font
      runs.push(
        createText(token.text, { ...style, fontFamily: "Courier New" }),
      );
      break;

    case "link":
      // Links - just render the text (ignore URL for DOCX)
      if (token.tokens && token.tokens.length > 0) {
        token.tokens.forEach((childToken) => {
          runs.push(...processMarkedToken(childToken, baseStyle, currentStyle));
        });
      } else if (token.text) {
        runs.push(createText(token.text, style));
      }
      break;

    case "escape":
      // Escaped characters
      runs.push(createText(token.text, style));
      break;

    case "br":
      // Line break
      runs.push(createText("\n", style));
      break;

    case "del":
      // Strikethrough (not well supported in basic DOCX, render as plain)
      if (token.tokens && token.tokens.length > 0) {
        token.tokens.forEach((childToken) => {
          runs.push(...processMarkedToken(childToken, baseStyle, currentStyle));
        });
      } else if (token.text) {
        runs.push(createText(token.text, style));
      }
      break;

    case "html":
      // HTML inline - strip tags and render text
      const strippedHtml = token.text.replace(/<[^>]*>/g, "");
      if (strippedHtml) {
        runs.push(createText(strippedHtml, style));
      }
      break;

    default:
      // For any other token type, try to extract text
      if (token.text) {
        runs.push(createText(token.text, style));
      }
      if (token.tokens && token.tokens.length > 0) {
        token.tokens.forEach((childToken) => {
          runs.push(...processMarkedToken(childToken, baseStyle, currentStyle));
        });
      }
  }

  return runs;
}

/**
 * Parses inline markdown formatting into an array of TextRun objects.
 * Uses marked.js for robust parsing that handles nested formatting,
 * escaped characters, and edge cases correctly.
 *
 * @param {string} text - Text potentially containing inline markdown
 * @param {Object} baseStyle - Base style options (size, color, fontFamily, bold, italics)
 * @returns {TextRun[]} Array of styled TextRun instances
 */
export function parseInlineMarkdown(text, baseStyle = {}) {
  if (!text || typeof text !== "string") {
    return [createText("", baseStyle)];
  }

  // First strip line-level prefixes
  const cleaned = stripMarkdownLinePrefixes(text);

  if (!cleaned) {
    return [createText("", baseStyle)];
  }

  try {
    // Use marked.js lexer to parse the text into tokens
    // This handles nested formatting, escaped characters, and edge cases
    const tokens = marked.lexer(cleaned);

    if (!tokens || tokens.length === 0) {
      return [createText(cleaned, baseStyle)];
    }

    const runs = [];

    // Process each token
    tokens.forEach((token) => {
      if (token.type === "paragraph" || token.type === "text") {
        // Paragraphs and text tokens may have nested inline tokens
        if (token.tokens && token.tokens.length > 0) {
          token.tokens.forEach((childToken) => {
            runs.push(...processMarkedToken(childToken, baseStyle, {}));
          });
        } else if (token.text) {
          runs.push(createText(token.text, baseStyle));
        }
      } else {
        // For other block-level tokens, process them directly
        runs.push(...processMarkedToken(token, baseStyle, {}));
      }
    });

    return runs.length > 0 ? runs : [createText(cleaned, baseStyle)];
  } catch (error) {
    // Fallback to plain text if parsing fails
    console.warn("Markdown parsing failed, falling back to plain text:", error.message);
    return [createText(cleaned, baseStyle)];
  }
}

/**
 * Strips all markdown formatting from text, returning plain text.
 * Used for contexts where rich formatting isn't supported (e.g., Excel cells).
 */
export function stripMarkdownPlain(text) {
  if (!text || typeof text !== "string") return text || "";

  let cleaned = stripMarkdownLinePrefixes(text);

  // Strip bold/italic markers: ***text***, **text**, *text*, ___text___, __text__, _text_
  cleaned = cleaned.replace(/\*{3}(.+?)\*{3}/g, "$1");
  cleaned = cleaned.replace(/_{3}(.+?)_{3}/g, "$1");
  cleaned = cleaned.replace(/\*{2}(.+?)\*{2}/g, "$1");
  cleaned = cleaned.replace(/_{2}(.+?)_{2}/g, "$1");
  cleaned = cleaned.replace(/\*(.+?)\*/g, "$1");
  cleaned = cleaned.replace(/(?<!\w)_([^_\s](?:[^_]*[^_\s])?)_(?!\w)/g, "$1");

  // Strip inline code backticks
  cleaned = cleaned.replace(/`([^`]+)`/g, "$1");

  // Strip links: [text](url) → text
  cleaned = cleaned.replace(/\[([^\]]+)\]\([^)]*\)/g, "$1");

  return cleaned.trim();
}

/**
 * Creates a styled paragraph with proper formatting
 */
export function createParagraph(textOrRuns, options = {}) {
  const alignmentMap = {
    left: AlignmentType.LEFT,
    right: AlignmentType.RIGHT,
    center: AlignmentType.CENTER,
    both: AlignmentType.BOTH,
  };

  return new Paragraph({
    children: Array.isArray(textOrRuns)
      ? textOrRuns
      : [createText(textOrRuns, options)],
    heading: options.heading || undefined,
    alignment: alignmentMap[options.alignment || "left"] || AlignmentType.LEFT,
    spacing: {
      before: options.spacingBefore ?? 0, // Already in twips
      after: options.spacingAfter ?? 120, // Default 120 twips (6pt)
      line: options.lineSpacing
        ? Math.round(options.lineSpacing * 240)
        : undefined,
    },
  });
}

/**
 * Creates a table with proper borders and column widths
 */
export function createTableFromData(data, options = {}) {
  const borderColor = options.borderColor || "D9D9D9";
  const borderStyle = options.borderStyle || "single";
  const borderWidth = options.borderWidth ?? 4;

  return new Table({
    rows: data.map((row, rowIndex) => {
      return new TableRow({
        children: row.map((cell) => {
          // Parse markdown in table cell content
          const cellText = typeof cell === "string" ? cell : String(cell);
          const cellBaseStyle = {
            size: options.cellSize || 11,
            fontFamily: options.fontFamily,
            color: options.color,
          };
          const cellRuns = parseInlineMarkdown(cellText, cellBaseStyle);
          return new TableCell({
            children: [createParagraph(cellRuns, {})],
            shading: {
              fill:
                rowIndex === 0 && options.headerFill
                  ? options.headerFill
                  : undefined,
            },
          });
        }),
        tableHeader: rowIndex === 0,
      });
    }),
    width: { size: 100, type: "pct" },
    borders: {
      top: { style: borderStyle, size: borderWidth, color: borderColor },
      bottom: { style: borderStyle, size: borderWidth, color: borderColor },
      left: { style: borderStyle, size: borderWidth, color: borderColor },
      right: { style: borderStyle, size: borderWidth, color: borderColor },
      insideHorizontal: {
        style: borderStyle,
        size: borderWidth,
        color: borderColor,
      },
      insideVertical: {
        style: borderStyle,
        size: borderWidth,
        color: borderColor,
      },
    },
  });
}
