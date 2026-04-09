/**
 * Shared XML Tag Finder Utility
 *
 * Provides a single, consolidated implementation of XML tag finding logic
 * used across the codebase. Returns a superset of properties needed by
 * all callers: { start, end, content, xml }.
 *
 * NOTE: The SimpleXMLParser class in src/tools/docx-patch.js has its own
 * findTag/findAllTags methods with additional capabilities (insertion,
 * replacement, stateful XML manipulation). The basic tag-finding logic
 * there mirrors this implementation, but the class is intentionally kept
 * separate because it manages mutable state for XML editing operations.
 *
 * @module xml-utils
 */

/**
 * Find all occurrences of an XML tag in a string.
 *
 * Handles:
 * - Nested tags of the same name (depth tracking)
 * - Self-closing tags (<tag />)
 * - Tag-name-prefix ambiguity (e.g., <w:p> vs <w:pPr>)
 * - Missing close tags (skips past open tag to avoid infinite loops)
 *
 * @param {string} xml - The XML string to search
 * @param {string} tagName - The tag name to find (e.g., "w:p", "w:tbl")
 * @returns {Array<{start: number, end: number, content: string, xml: string}>}
 *   Each result contains:
 *   - start: character index of the opening `<tagName` in the source string
 *   - end: character index one past the closing `</tagName>` (or self-closing `/>`)
 *   - content: the inner text between open and close tags (empty string for self-closing)
 *   - xml: the full outer XML substring from start to end
 */
export function findXMLTags(xml, tagName) {
  const results = [];
  const openTag = `<${tagName}`;
  const closeTag = `</${tagName}>`;
  let pos = 0;

  while (pos < xml.length) {
    const start = xml.indexOf(openTag, pos);
    if (start === -1) break;

    // Guard against tag-name-prefix matches (e.g., <w:p> vs <w:pPr>)
    const afterTag = xml[start + openTag.length];
    if (
      afterTag !== " " &&
      afterTag !== ">" &&
      afterTag !== "/" &&
      afterTag !== "\n" &&
      afterTag !== "\t" &&
      afterTag !== undefined
    ) {
      pos = start + 1;
      continue;
    }

    // Find the end of the opening tag
    const tagEnd = xml.indexOf(">", start);
    if (tagEnd === -1) break;

    // Handle self-closing tag
    if (xml[tagEnd - 1] === "/") {
      results.push({
        start,
        end: tagEnd + 1,
        content: "",
        xml: xml.substring(start, tagEnd + 1),
      });
      pos = tagEnd + 1;
      continue;
    }

    // Find matching close tag with nesting support
    let depth = 1;
    let searchPos = tagEnd + 1;
    let foundEnd = false;

    while (depth > 0 && searchPos < xml.length) {
      const nextOpen = xml.indexOf(openTag, searchPos);
      const nextClose = xml.indexOf(closeTag, searchPos);
      if (nextClose === -1) break;

      if (nextOpen !== -1 && nextOpen < nextClose) {
        // Check that this is a real occurrence of the same tag, not a prefix
        const nc = xml[nextOpen + openTag.length];
        if (
          nc === " " ||
          nc === ">" ||
          nc === "/" ||
          nc === "\n" ||
          nc === "\t"
        ) {
          depth++;
        }
        searchPos = nextOpen + 1;
      } else {
        depth--;
        if (depth === 0) {
          const end = nextClose + closeTag.length;
          results.push({
            start,
            end,
            content: xml.substring(tagEnd + 1, nextClose),
            xml: xml.substring(start, end),
          });
          pos = end;
          foundEnd = true;
        }
        searchPos = nextClose + 1;
      }
    }

    // If no matching close tag was found, skip past this open tag to avoid infinite loops
    if (!foundEnd) {
      pos = tagEnd + 1;
    }
  }

  return results;
}
