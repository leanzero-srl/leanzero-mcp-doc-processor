import { encodeCell } from "./styling.js";
import { stripMarkdownPlain } from "./doc-utils.js";

/**
 * Helper function to convert hex color to RGB format for Excel
 * @param {string} hexColor - Hex color (e.g., "FF0000")
 * @returns {Object} RGB object { rgb: "RRGGBB" }
 */
export function hexToRgb(hexColor) {
  const cleanHex = hexColor.replace(/[^0-9A-Fa-f]/g, "");
  if (cleanHex.length !== 6) {
    return { rgb: "000000" };
  }
  return { rgb: cleanHex.toUpperCase() };
}

/**
 * Apply comprehensive styling to Excel worksheet using xlsx-js-style
 * @param {Object} ws - Worksheet object from xlsx-js-style
 * @param {Array<Array<any>>} data - Original data array for reference
 * @param {Object} styleConfig - Style configuration
 * @param {string} preset - Style preset name
 * @param {number} [startRow=0] - Row to start applying styling from (default: 0, all rows)
 */
export function applyExcelStyling(ws, data, styleConfig, preset, startRow = 0) {
  if (!ws || !data) return;

  const config = styleConfig;

  // Apply styling to cells starting from startRow
  for (let row = startRow; row < data.length; row++) {
    // Handle case where row might not exist in data array
    if (!data[row] || !Array.isArray(data[row])) continue;

    for (let col = 0; col < data[row].length; col++) {
      const cellRef = encodeCell(row, col);
      if (!ws[cellRef]) continue;

      const isHeader = row === 0;

      // Initialize cell style object
      ws[cellRef].s = ws[cellRef].s || {};

      // Font styling
      ws[cellRef].s.font = ws[cellRef].s.font || {};

       if (isHeader) {
         // Header row styling - Dashboard Look
         ws[cellRef].s.font = {
           name: config.font?.family || "Arial",
           sz: config.headerSize || 11,
           bold: config.headerBold !== false,
           color: hexToRgb(config.headerColor || "FFFFFF"), // Default to white for dark headers
         };
         
         // Header background color
         if (config.headerBackground && config.headerBackground !== "FFFFFF") {
           ws[cellRef].s.fill = {
             patternType: "solid",
             fgColor: hexToRgb(config.headerBackground),
           };
         }
         
         // Header border - Sophisticated bottom accent
         ws[cellRef].s.border = {
           top: { style: "thin", color: { auto: 1 } },
           bottom: { style: "medium", color: hexToRgb(config.headerBackground || "000000") }, // Darker accent
           left: { style: "thin", color: { auto: 1 } },
           right: { style: "thin", color: { auto: 1 } },
         };
         
         // Header alignment
         ws[cellRef].s.alignment = {
           horizontal: "center",
           vertical: "center",
           wrapText: true,
         };
       } else {
         // Body cell styling
         ws[cellRef].s.font = {
           name: config.font?.family || "Arial",
           sz: config.font?.size || 11,
           bold: false,
           color: hexToRgb(config.font?.color || "000000"),
         };
         
       // Optional cell background for alternate rows (zebra striping)
       if (row % 2 === 0 && config.zebraColor) {
         ws[cellRef].s.fill = {
           patternType: "solid",
           fgColor: hexToRgb(config.zebraColor),
         };
       }

       // Value-based mapping (e.g., for Phase or Actor colors)
       if (config.valueMappings && config.valueMappings[data[row][col]]) {
         const mappedColor = config.valueMappings[data[row][col]];
         ws[cellRef].s.fill = {
           patternType: "solid",
           fgColor: hexToRgb(mappedColor),
         };
       }
         
         // Body border (subtle thin lines for a cleaner look)
         ws[cellRef].s.border = {
           top: { style: "thin", color: { auto: 1 } },
           bottom: { style: "thin", color: { auto: 1 } },
           left: { style: "thin", color: { auto: 1 } },
           right: { style: "thin", color: { auto: 1 } },
         };
         
         // Body alignment
         ws[cellRef].s.alignment = {
           horizontal: "left",
           vertical: "center",
           wrapText: true,
         };
       }
    }
  }
}

/**
 * Apply styling only to newly appended rows, preserving existing cell styles
 * @param {Object} ws - Worksheet object from xlsx-js-style
 * @param {Array<Array<any>>} newData - New data rows being added
 * @param {Object} styleConfig - Style configuration
 * @param {number} startRow - The row index where new data starts
 */
export function applyExcelStylingToNewRows(ws, newData, styleConfig, startRow) {
  if (!ws || !newData || !styleConfig) return;

  const config = styleConfig;

  // Only apply styling to the new rows
  for (let row = 0; row < newData.length; row++) {
    const actualRow = startRow + row;

    if (!newData[row] || !Array.isArray(newData[row])) continue;

    for (let col = 0; col < newData[row].length; col++) {
      const cellRef = encodeCell(actualRow, col);
      if (!ws[cellRef]) continue;

      // Initialize cell style object (don't overwrite existing if present)
      ws[cellRef].s = ws[cellRef].s || {};

      // Apply body cell styling (new rows are never headers)
      ws[cellRef].s.font = {
        name: config.font?.family || "Arial",
        sz: config.font?.size || 11,
        bold: false,
        color: hexToRgb(config.font?.color || "000000"),
      };

      // Optional cell background for alternate rows (zebra striping)
      // Use actualRow for zebra striping to maintain pattern
      if (actualRow % 2 === 0 && config.zebraColor) {
        ws[cellRef].s.fill = {
          patternType: "solid",
          fgColor: hexToRgb(config.zebraColor),
        };
      }

      // Body border
      ws[cellRef].s.border = {
        top: { style: "thin", color: { auto: 1 } },
        bottom: { style: "thin", color: { auto: 1 } },
        left: { style: "thin", color: { auto: 1 } },
        right: { style: "thin", color: { auto: 1 } },
      };

      // Body alignment
      ws[cellRef].s.alignment = {
        horizontal: "left",
        vertical: "center",
        wrapText: true,
      };
    }
  }
}

/**
 * Strip markdown from all cells in a 2D data array
 * @param {Array<Array<any>>} data - 2D array of cell values
 * @returns {Array<Array<any>>} Data with markdown stripped from string cells
 */
export function cleanSheetData(data) {
  return data.map((row) =>
    Array.isArray(row)
      ? row.map((cell) =>
          typeof cell === "string" ? stripMarkdownPlain(cell) : cell,
        )
      : row,
  );
}

/**
 * Get default zebra colors for different style presets
 * @param {string} preset - Style preset name
 * @returns {string} Hex color for zebra striping
 */
export function getZebraColor(preset) {
  const zebraColors = {
    minimal: "FAFAFA",
    professional: "F5F5F3",
    technical: "F0F0F0",
    legal: "F5F5F5",
    business: "EBF1F7",
    casual: "FFF3E0",
    colorful: "F3E5F5",
    risk_assessment: "F8F9FA",
    migration_runbook: "F8F9FA",
  };
  return zebraColors[preset] || "FAFAFA";
}
