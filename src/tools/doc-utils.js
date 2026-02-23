import {
  Paragraph,
  TextRun,
  Table,
  TableCell,
  TableRow,
  AlignmentType,
  HeadingLevel,
  Header,
  Footer,
  PageNumber,
  ShadingType,
  TableLayoutType,
} from "docx";
import { marked } from "marked";

/**
 * Extracts heading levels from markdown content
 * Converts markdown headings (#, ##, ###) to proper HeadingLevel values
 */
export function extractHeadingLevels(paragraphs) {
  if (!Array.isArray(paragraphs)) return paragraphs;

  return paragraphs.map((para) => {
    if (typeof para === "string") {
      // Check for markdown headings
      let headingLevel = null;
      let text = para;

      if (para.startsWith("# ")) {
        headingLevel = "heading1";
        text = para.substring(2);
      } else if (para.startsWith("## ")) {
        headingLevel = "heading2";
        text = para.substring(3);
      } else if (para.startsWith("### ")) {
        headingLevel = "heading3";
        text = para.substring(4);
      }

      // Return as object with headingLevel if detected
      if (headingLevel) {
        return { text, headingLevel };
      }

      // Return simple string otherwise
      return para;
    }

    // Already an object, just ensure headingLevel is valid if present
    if (para && typeof para === "object" && para.text) {
      const validHeadingLevels = ["heading1", "heading2", "heading3"];
      if (
        para.headingLevel &&
        !validHeadingLevels.includes(para.headingLevel)
      ) {
        delete para.headingLevel;
      }
      return para;
    }

    return para;
  });
}

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
    ...(options.smallCaps ? { smallCaps: true } : {}),
    ...(options.characterSpacing ? { characterSpacing: options.characterSpacing } : {}),
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
            ...processMarkedToken(childToken, baseStyle, {
              ...currentStyle,
              bold: true,
            }),
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
            ...processMarkedToken(childToken, baseStyle, {
              ...currentStyle,
              italics: true,
            }),
          );
        });
      } else if (token.text) {
        runs.push(createText(token.text, { ...style, italics: true }));
      }
      break;

    case "codespan":
      // Inline code - monospace font with light gray background
      runs.push(
        new TextRun({
          text: String(token.text || ""),
          font: "Courier New",
          size: (style.size || 11) * 2, // half-points
          color: style.codeColor || "1A1A1A",
          shading: {
            type: ShadingType.CLEAR,
            fill: style.codeBackground || "F0F0F0",
          },
        }),
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
    console.warn(
      "Markdown parsing failed, falling back to plain text:",
      error.message,
    );
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
    ...(options.border ? { border: options.border } : {}),
    ...(options.shading ? { shading: options.shading } : {}),
  });
}

/**
 * Creates a table with proper borders and column widths
 */
export function createTableFromData(data, options = {}) {
  const borderColor = options.borderColor || "D9D9D9";
  const borderStyle = options.borderStyle || "single";
  const borderWidth = options.borderWidth ?? 4;

  // New table visual properties
  const headerFill = options.headerFill || null;
  const headerFontColor = options.headerFontColor || null;
  const zebraFill = options.zebraFill || null;
  const zebraInterval = options.zebraInterval || 2;
  const insideBorderColor = options.insideBorderColor || borderColor;
  const insideBorderWidth = options.insideBorderWidth ?? borderWidth;
  const outsideBorderWidth = options.outsideBorderWidth ?? borderWidth;

  // Calculate equal column widths for consistent table layout
  // Standard DOCX page width is ~9360 twips (6.5 inches at 1440 twips/inch)
  const numCols = Math.max(...data.map((row) => (Array.isArray(row) ? row.length : 0)), 1);
  const totalWidth = 9360;
  const defaultColWidths = Array(numCols).fill(Math.floor(totalWidth / numCols));
  const colWidths = options.columnWidths || defaultColWidths;

  return new Table({
    rows: data.map((row, rowIndex) => {
      const isHeader = rowIndex === 0;
      const isZebraRow = !isHeader && zebraFill && (rowIndex % zebraInterval === 0);

      return new TableRow({
        children: row.map((cell) => {
          const cellText = typeof cell === "string" ? cell : String(cell);
          const cellBaseStyle = {
            size: options.cellSize || 11,
            fontFamily: options.fontFamily,
            color: isHeader && headerFontColor ? headerFontColor : (options.color || undefined),
            bold: isHeader && headerFill ? true : undefined,
          };
          const cellRuns = parseInlineMarkdown(cellText, cellBaseStyle);

          // Determine cell shading
          let cellShading = undefined;
          if (isHeader && headerFill) {
            cellShading = {
              fill: headerFill,
              type: ShadingType.SOLID,
              color: headerFill,
            };
          } else if (isZebraRow) {
            cellShading = {
              fill: zebraFill,
              type: ShadingType.SOLID,
              color: zebraFill,
            };
          }

          return new TableCell({
            children: [createParagraph(cellRuns, {})],
            ...(cellShading ? { shading: cellShading } : {}),
          });
        }),
        tableHeader: isHeader,
      });
    }),
    columnWidths: colWidths,
    layout: TableLayoutType.FIXED,
    width: { size: 100, type: "pct" },
    borders: {
      top: { style: borderStyle, size: outsideBorderWidth, color: borderColor },
      bottom: { style: borderStyle, size: outsideBorderWidth, color: borderColor },
      left: { style: borderStyle, size: outsideBorderWidth, color: borderColor },
      right: { style: borderStyle, size: outsideBorderWidth, color: borderColor },
      insideHorizontal: {
        style: borderStyle,
        size: insideBorderWidth,
        color: insideBorderColor,
      },
      insideVertical: {
        style: borderStyle,
        size: insideBorderWidth,
        color: insideBorderColor,
      },
    },
  });
}

/**
 * Creates a document header with styled text
 * @param {string} text - Header text
 * @param {Object} [options] - Header options
 * @param {string} [options.alignment] - Text alignment (left, center, right)
 * @param {string} [options.color] - Text color hex
 * @returns {Header} docx Header object
 */
export function createDocHeader(text, options = {}) {
  return new Header({
    children: [
      createParagraph(text, {
        alignment: options.alignment || "left",
        size: 10,
        color: options.color || "666666",
      }),
    ],
  });
}

/**
 * Creates a document footer with page number support.
 * Supports {current} and {total} placeholders that map to PageNumber.CURRENT
 * and PageNumber.TOTAL_PAGES respectively. Also supports legacy {{page}} syntax.
 *
 * @param {Object} [options] - Footer options
 * @param {string} [options.text] - Footer text with optional placeholders
 * @param {string} [options.alignment] - Text alignment (left, center, right)
 * @param {number} [options.fontSize] - Font size in points (default: 10)
 * @param {string} [options.color] - Text color hex (default: "666666")
 * @returns {Footer} docx Footer object
 */
export function createDocFooter(options = {}) {
  const parts = [];
  const fontSize = options.fontSize || 10;
  const color = options.color || "666666";

  if (options.text) {
    // Normalize legacy {{page}} to {current}
    let text = options.text.replace(/\{\{page\}\}/g, "{current}");

    // Split by {current} and {total} placeholders
    const regex = /\{(current|total)\}/g;
    let lastIndex = 0;
    let match;

    while ((match = regex.exec(text)) !== null) {
      // Add text before the placeholder
      if (match.index > lastIndex) {
        parts.push(
          createText(text.substring(lastIndex, match.index), {
            size: fontSize,
            color: color,
          }),
        );
      }

      // Add the page number field
      const pageType =
        match[1] === "total" ? PageNumber.TOTAL_PAGES : PageNumber.CURRENT;
      parts.push(
        new TextRun({
          children: [pageType],
          size: fontSize * 2, // half-points
          color: color,
        }),
      );

      lastIndex = regex.lastIndex;
    }

    // Add any remaining text after the last placeholder
    if (lastIndex < text.length) {
      parts.push(
        createText(text.substring(lastIndex), {
          size: fontSize,
          color: color,
        }),
      );
    }
  }

  return new Footer({
    children: [
      new Paragraph({
        children: parts.length > 0 ? parts : [new TextRun({ text: "" })],
        alignment:
          options.alignment === "center"
            ? AlignmentType.CENTER
            : options.alignment === "right"
              ? AlignmentType.RIGHT
              : AlignmentType.LEFT,
      }),
    ],
  });
}

/**
 * Creates styled code block paragraphs from a code string.
 * Renders as monospace text with a shaded background and thin border.
 * Multi-line code is split into multiple paragraphs with tight spacing.
 *
 * @param {string} code - The code text (may be multi-line)
 * @param {Object} codeStyle - Code style config from preset (fontFamily, fontSize, color, backgroundColor, borderColor)
 * @returns {Paragraph[]} Array of Paragraph objects
 */
export function createCodeBlock(code, codeStyle = {}) {
  const fontFamily = codeStyle.fontFamily || "Courier New";
  const fontSize = codeStyle.fontSize || 9;
  const color = codeStyle.color || "1A1A1A";
  const backgroundColor = codeStyle.backgroundColor || "F5F5F5";
  const borderColor = codeStyle.borderColor || "E0E0E0";

  // Strip leading/trailing fences if present (```language ... ```)
  let cleaned = code;
  if (cleaned.startsWith("```")) {
    // Remove opening fence line
    const firstNewline = cleaned.indexOf("\n");
    cleaned = firstNewline >= 0 ? cleaned.substring(firstNewline + 1) : "";
    // Remove closing fence
    if (cleaned.endsWith("```")) {
      cleaned = cleaned.substring(0, cleaned.length - 3);
    }
    cleaned = cleaned.replace(/\n```\s*$/, "");
  }
  cleaned = cleaned.replace(/^\n+|\n+$/g, "");

  const lines = cleaned.split("\n");
  const shading = {
    type: ShadingType.CLEAR,
    fill: backgroundColor,
    color: "auto",
  };
  const border = {
    top: { style: "single", size: 2, color: borderColor },
    bottom: { style: "single", size: 2, color: borderColor },
    left: { style: "single", size: 2, color: borderColor },
    right: { style: "single", size: 2, color: borderColor },
  };

  return lines.map((line, index) => {
    return new Paragraph({
      children: [
        new TextRun({
          text: line || " ", // empty lines need a space for the shading to render
          font: fontFamily,
          size: fontSize * 2, // half-points
          color: color,
        }),
      ],
      shading,
      // Only top border on first line, only bottom on last, sides on all
      border: {
        top: index === 0 ? border.top : undefined,
        bottom: index === lines.length - 1 ? border.bottom : undefined,
        left: border.left,
        right: border.right,
      },
      spacing: {
        before: index === 0 ? 120 : 0,
        after: index === lines.length - 1 ? 120 : 0,
        line: 260, // tight line spacing (~1.08) for code
      },
    });
  });
}
