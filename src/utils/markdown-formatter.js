/**
 * Markdown Formatting Utilities
 * 
 * Helper functions for creating and formatting markdown content
 * optimized for AI model consumption during implementation.
 */

/**
 * Format a heading at the specified level
 * @param {number} level - Heading level (1, 2, or 3)
 * @param {string} text - Heading text
 * @returns {string} Formatted heading (e.g., "# Heading Text")
 */
export function formatHeading(level, text) {
  if (!text || typeof text !== 'string') return '';
  
  const normalizedLevel = Math.min(Math.max(parseInt(level) || 1, 1), 3);
  const hash = '#'.repeat(normalizedLevel);
  
  return `${hash} ${text.trim()}`;
}

/**
 * Format a code block with language hint
 * @param {string} language - Programming language identifier (e.g., 'javascript', 'python')
 * @param {string} code - Code content to format
 * @returns {string} Fenced code block with language hint
 */
export function formatCodeBlock(language, code) {
  if (!code || typeof code !== 'string') return '';
  
  const lang = (language || '').trim() || 'text';
  const cleanCode = code.trim();
  
  return `\`\`\`${lang}\n${cleanCode}\n\`\`\``;
}

/**
 * Format a bullet list from an array of items
 * @param {Array<string>} items - List items to format
 * @returns {string} Markdown bullet list (each item prefixed with "- ")
 */
export function formatBulletList(items) {
  if (!Array.isArray(items) || items.length === 0) return '';
  
  const formattedItems = items
    .filter(item => item && typeof item === 'string')
    .map(item => `- ${item.trim()}`)
    .join('\n');
  
  return formattedItems;
}

/**
 * Format a task list (checkbox list)
 * @param {Array<{text: string, checked?: boolean}>} items - Task items with optional checked status
 * @returns {string} Markdown task list with checkboxes
 */
export function formatTaskList(items) {
  if (!Array.isArray(items) || items.length === 0) return '';
  
  const formattedItems = items
    .filter(item => item && typeof item === 'object' && item.text)
    .map(item => `- [${item.checked ? 'x' : ' '}] ${item.text.trim()}`)
    .join('\n');
  
  return formattedItems;
}

/**
 * Format inline code for technical terms, paths, commands
 * @param {string} text - Text to format as inline code
 * @returns {string} Inline code (wrapped in backticks)
 */
export function formatInlineCode(text) {
  if (!text || typeof text !== 'string') return '';
  
  const cleanText = text.trim();
  
  // Check if already wrapped in backticks
  if (cleanText.startsWith('`') && cleanText.endsWith('`')) {
    return cleanText;
  }
  
  return `\`${cleanText}\``;
}

/**
 * Format a blockquote
 * @param {string} text - Text to format as a quote
 * @returns {string} Blockquote (prefixed with "> ")
 */
export function formatQuote(text) {
  if (!text || typeof text !== 'string') return '';
  
  const cleanText = text.trim();
  return `> ${cleanText}`;
}

/**
 * Format a table from 2D array data
 * @param {Array<Array<string>>} data - Table data as 2D array (first row is header)
 * @returns {string} Markdown table with alignment separators
 */
export function formatTable(data) {
  if (!Array.isArray(data) || data.length === 0) return '';
  
  // Ensure all rows have same number of columns
  const maxCols = Math.max(...data.map(row => Array.isArray(row) ? row.length : 0));
  if (maxCols === 0) return '';
  
  // Format header row
  const headerRow = data[0];
  const headerCells = headerRow.slice(0, maxCols)
    .map(cell => cell !== undefined && cell !== null ? String(cell).trim() : '')
    .join(' | ');
  
  // Format separator row
  const separatorCells = Array(maxCols).fill('---').join(' | ');
  
  // Format data rows
  const dataRows = data.slice(1)
    .map(row => {
      const cells = Array(maxCols).fill('');
      if (Array.isArray(row)) {
        for (let i = 0; i < row.length && i < maxCols; i++) {
          cells[i] = row[i] !== undefined && row[i] !== null ? String(row[i]).trim() : '';
        }
      }
      return cells.join(' | ');
    })
    .join('\n');
  
  // Combine all rows
  const rows = [headerCells, separatorCells];
  if (dataRows) {
    rows.push(dataRows);
  }
  
  return rows.join('\n');
}

/**
 * Convert paragraph objects to markdown with implementation style formatting
 * @param {Array<MarkdownParagraph>} paragraphs - Array of paragraph objects or strings
 * @param {string} [docType] - The intended tone and depth (concise, formal, explanatory, scientific)
 * @returns {string} Formatted markdown content
 */
export function applyImplementationStyle(paragraphs, docType) {
  if (!Array.isArray(paragraphs) || paragraphs.length === 0) return '';
  
  const formattedParts = [];
  
  for (const para of paragraphs) {
    // Handle string paragraphs (simple text)
    if (typeof para === 'string') {
      const text = para.trim();
      
      // Detect fenced code blocks
      if (text.startsWith('```')) {
        formattedParts.push(text);
        continue;
      }
      
      // Check for heading markers
      if (text.startsWith('# ') || text.startsWith('## ') || text.startsWith('### ')) {
        formattedParts.push(text);
        continue;
      }
      
      // Default: simple paragraph with line breaks preserved
      formattedParts.push(text.replace(/\n/g, '\n\n'));
      continue;
    }
    
    // Handle object paragraphs
    if (!para || typeof para !== 'object') continue;
    
    const { text, headingLevel } = para;
    
    if (text) {
      let content = text.trim();
      
      // Apply heading level if specified
      if (headingLevel === 'heading1') {
        content = formatHeading(1, content);
      } else if (headingLevel === 'heading2') {
        content = formatHeading(2, content);
      } else if (headingLevel === 'heading3') {
        content = formatHeading(3, content);
      }
      
      // Check for code block in text
      const codeBlockMatch = content.match(/```(\w*)\n([\s\S]*?)```/);
      if (codeBlockMatch) {
        formattedParts.push(content);
        continue;
      }
      
      // Handle list items in text
      if (content.includes('- [ ]') || content.includes('- [x]')) {
        formattedParts.push(content);
        continue;
      }
      
      // Handle bullet lists
      if (content.startsWith('- ') || content.includes('\n- ')) {
        formattedParts.push(content);
        continue;
      }
      
      // Default paragraph
      formattedParts.push(content);
    }
    
    // Process code block if present
    if (para.codeBlock && para.codeBlock.language && para.codeBlock.content) {
      const { language, content } = para.codeBlock;
      formattedParts.push(formatCodeBlock(language, content));
    }
    
    // Process bullet list if present
    if (Array.isArray(para.listItems) && para.listItems.length > 0) {
      const items = para.listItems.map(item => ({
        text: item.text || '',
        checked: item.type === 'task' ? false : undefined
      }));
      
      if (para.listItems.some(item => item.type === 'task')) {
        formattedParts.push(formatTaskList(items));
      } else {
        formattedParts.push(formatBulletList(para.listItems.map(i => i.text)));
      }
    }
    
    // Process quote if present
    if (para.quote) {
      formattedParts.push(formatQuote(para.quote));
    }
  }
  
  return formattedParts.join('\n\n');
}

/**
 * Convert paragraph objects to markdown with lean formatting rules
 * - No tables (use bullet lists instead)
 * - Heavy code blocks with language hints
 * - Bullet/checkbox lists for structured data
 * - Inline code for technical terms, paths, commands
 * @param {Array<MarkdownParagraph>} paragraphs - Array of paragraph objects or strings
 * @param {string} [docType] - The intended tone and depth (concise, formal, explanatory, scientific)
 * @returns {string} Lean formatted markdown content
 */
export function convertToLeanMarkdown(paragraphs, docType) {
  return applyImplementationStyle(paragraphs, docType);
}
