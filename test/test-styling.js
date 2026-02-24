import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { createDoc } from "../src/tools/create-doc.js";
import { createExcel } from "../src/tools/create-excel.js";
import {
  getStyleConfig,
  buildDocumentStyles,
  selectStyleBasedOnCategory,
} from "../src/tools/styling.js";

/**
 * Comprehensive styling tests for DOCX and Excel document generation.
 * Covers buildDocumentStyles unit tests and document creation integration tests.
 */

describe("buildDocumentStyles", () => {
  test("returns correct top-level structure", () => {
    const config = getStyleConfig("professional");
    const styles = buildDocumentStyles(config);

    assert.notEqual(styles.default, undefined, "has default styles");
    assert.notEqual(styles.default.document, undefined, "has default.document");
    assert.notEqual(styles.default.heading1, undefined, "has default.heading1");
    assert.notEqual(styles.default.heading2, undefined, "has default.heading2");
    assert.notEqual(styles.default.heading3, undefined, "has default.heading3");
    assert.ok(Array.isArray(styles.paragraphStyles), "has paragraphStyles array");
  });

  test("document run styles use correct font family and half-point sizing", () => {
    const config = getStyleConfig("professional");
    const styles = buildDocumentStyles(config);

    assert.equal(
      styles.default.document.run.font,
      "Garamond",
      "document font is Garamond for professional",
    );
    assert.equal(
      typeof styles.default.document.run.size,
      "number",
      "document font size is a number",
    );
    assert.equal(
      styles.default.document.run.size,
      config.font.size * 2,
      "document font size is in half-points",
    );
  });

  test("heading styles have proper values", () => {
    const config = getStyleConfig("professional");
    const styles = buildDocumentStyles(config);

    assert.equal(styles.default.heading1.run.bold, true, "heading1 is bold");
    assert.equal(
      styles.default.heading1.run.size,
      config.heading1.size * 2,
      "heading1 size matches config",
    );
    assert.equal(
      styles.default.heading1.run.color,
      config.heading1.color,
      "heading1 color matches config",
    );
    assert.equal(
      styles.default.heading1.paragraph.spacing.before,
      config.heading1.spacingBefore,
      "heading1 spacing before matches",
    );
  });

  test("Title paragraph style is defined and uses heading font", () => {
    const config = getStyleConfig("professional");
    const styles = buildDocumentStyles(config);

    const titleStyle = styles.paragraphStyles.find((s) => s.id === "Title");
    assert.notEqual(titleStyle, undefined, "Title paragraph style exists");
    assert.equal(
      titleStyle.run.font,
      "Cambria",
      "Title font uses headingFont (Cambria) for professional",
    );
    assert.equal(titleStyle.run.bold, true, "Title is bold");
  });

  test("all presets produce valid styles with correct font pairing", () => {
    for (const preset of [
      "minimal",
      "professional",
      "technical",
      "legal",
      "business",
      "casual",
      "colorful",
    ]) {
      const cfg = getStyleConfig(preset);
      const s = buildDocumentStyles(cfg);

      assert.equal(
        s.default.document.run.font,
        cfg.font.family,
        `${preset}: body font preserved correctly`,
      );

      const expectedHeadingFont = cfg.headingFont || cfg.font.family;
      assert.equal(
        s.default.heading1.run.font,
        expectedHeadingFont,
        `${preset}: heading1 uses correct font (${expectedHeadingFont})`,
      );

      const ts = s.paragraphStyles.find((p) => p.id === "Title");
      assert.equal(
        ts.run.font,
        expectedHeadingFont,
        `${preset}: Title uses correct font (${expectedHeadingFont})`,
      );
    }
  });

  test("headingFont property exists on presets that define it", () => {
    const businessConfig = getStyleConfig("business");
    assert.equal(businessConfig.headingFont, "Calibri Light", "business has headingFont Calibri Light");

    const casualConfig = getStyleConfig("casual");
    assert.equal(casualConfig.headingFont, "Trebuchet MS", "casual has headingFont Trebuchet MS");

    const colorfulConfig = getStyleConfig("colorful");
    assert.equal(colorfulConfig.headingFont, "Century Gothic", "colorful has headingFont Century Gothic");

    const minimalConfig = getStyleConfig("minimal");
    assert.equal(minimalConfig.headingFont, null, "minimal has null headingFont");
  });

  test("table properties — headerFill exists for non-legal presets", () => {
    const config = getStyleConfig("professional");
    assert.notEqual(config.table.headerFill, null, "professional has table.headerFill");

    const businessConfig = getStyleConfig("business");
    assert.notEqual(businessConfig.table.headerFill, null, "business has table.headerFill");

    const colorfulConfig = getStyleConfig("colorful");
    assert.notEqual(colorfulConfig.table.headerFill, null, "colorful has table.headerFill");

    const legalConfig = getStyleConfig("legal");
    assert.equal(legalConfig.table.headerFill, null, "legal has null table.headerFill");
    assert.equal(legalConfig.table.zebraFill, null, "legal has null table.zebraFill");
  });

  test("title smallCaps and borderBottom on presets that use them", () => {
    const config = getStyleConfig("professional");
    assert.equal(config.title.smallCaps, true, "professional title has smallCaps");
    assert.notEqual(config.title.borderBottom, null, "professional title has borderBottom");

    const colorfulConfig = getStyleConfig("colorful");
    assert.equal(colorfulConfig.title.smallCaps, true, "colorful title has smallCaps");

    const minimalConfig = getStyleConfig("minimal");
    assert.notEqual(minimalConfig.title.smallCaps, true, "minimal title has no smallCaps");
  });

  test("selectStyleBasedOnCategory mapping", () => {
    assert.equal(selectStyleBasedOnCategory("contracts"), "legal", "contracts -> legal");
    assert.equal(selectStyleBasedOnCategory("technical"), "technical", "technical -> technical");
    assert.equal(selectStyleBasedOnCategory("business"), "business", "business -> business");
    assert.equal(selectStyleBasedOnCategory("meeting"), "professional", "meeting -> professional");
    assert.equal(selectStyleBasedOnCategory("research"), "professional", "research -> professional");
    assert.equal(selectStyleBasedOnCategory("unknown"), "minimal", "unknown -> minimal");
  });
});

describe("DOCX styling demonstrations", () => {
  test("creates DOCX with minimal styling (default)", async () => {
    const result = await createDoc({
      title: "Document with Minimal Styling",
      paragraphs: [
        "This is a simple paragraph with default styling.",
        "Another paragraph to show spacing and formatting.",
      ],
      tables: [
        [
          ["Column A", "Column B", "Column C"],
          ["Data 1", "Data 2", "Data 3"],
          ["Data 4", "Data 5", "Data 6"],
          ["Data 7", "Data 8", "Data 9"],
          ["Data 10", "Data 11", "Data 12"],
        ],
      ],
      outputPath: "./output/doc-minimal.docx",
      preventDuplicates: false,
    });

    assert.equal(result.success, true, "creation succeeded");
    console.error("  Created:", result.filePath);
  });

  test("creates DOCX with professional styling preset", async () => {
    const result = await createDoc({
      title: "Document with Professional Styling",
      paragraphs: [
        {
          text: "This paragraph uses the professional preset.",
          bold: false,
          italics: true,
          color: "336699",
        },
        {
          text: "Centered paragraph with custom spacing.",
          alignment: "center",
          spacingBefore: 300,
          spacingAfter: 250,
        },
      ],
      tables: [
        [
          ["Name", "Department", "Salary"],
          ["John Doe", "Engineering", "$75,000"],
          ["Jane Smith", "Marketing", "$82,500"],
          ["Bob Wilson", "Finance", "$71,200"],
          ["Alice Chen", "Design", "$79,900"],
        ],
      ],
      stylePreset: "professional",
      outputPath: "./output/doc-professional.docx",
      preventDuplicates: false,
    });

    assert.equal(result.success, true, "creation succeeded");
    console.error("  Created:", result.filePath);
  });

  test("creates DOCX with colorful styling preset", async () => {
    const result = await createDoc({
      title: "COLORFUL DOCUMENT TITLE",
      paragraphs: [
        {
          text: "This document uses the colorful preset.",
          bold: true,
          underline: true,
        },
        {
          text: "Right-aligned paragraph with red color.",
          alignment: "right",
          color: "FF0000",
        },
      ],
      tables: [
        [
          ["Category", "Value", "Status"],
          ["High Priority", "Critical", "Pending"],
          ["Low Priority", "Normal", "Complete"],
          ["Medium Priority", "Warning", "In Progress"],
          ["Urgent", "Severe", "Escalated"],
        ],
      ],
      stylePreset: "colorful",
      outputPath: "./output/doc-colorful.docx",
      preventDuplicates: false,
    });

    assert.equal(result.success, true, "creation succeeded");
    console.error("  Created:", result.filePath);
  });

  test("creates DOCX with custom styling overrides", async () => {
    const result = await createDoc({
      title: "CUSTOM STYLE DOCUMENT",
      paragraphs: [
        {
          text: "Paragraph with bold and italic styling.",
          bold: true,
          italics: true,
          color: "AABBCC",
          size: 14,
        },
        {
          text: "Paragraph with specific alignment and spacing.",
          alignment: "left",
          spacingBefore: 400,
          spacingAfter: 300,
          lineSpacing: 1.2,
        },
      ],
      tables: [
        [
          ["ID", "Description", "Count"],
          ["001", "First item", "5"],
          ["002", "Second item", "10"],
        ],
      ],
      stylePreset: "minimal",
      style: {
        font: {
          size: 12,
          color: "D9D9D9",
          fontFamily: "Times New Roman",
        },
        paragraph: {
          alignment: "center",
          spacingBefore: 250,
          spacingAfter: 250,
        },
        table: {
          borderColor: "00AA00",
          borderStyle: "double",
          borderWidth: 20,
        },
      },
      outputPath: "./output/doc-custom.docx",
      preventDuplicates: false,
    });

    assert.equal(result.success, true, "creation succeeded");
    console.error("  Created:", result.filePath);
  });
});

describe("Excel styling demonstrations", () => {
  test("creates Excel with minimal styling (default)", async () => {
    const result = await createExcel({
      sheets: [
        {
          name: "Minimal Sheet",
          data: [
            ["ID", "Name", "Value"],
            [1, "Item A", 100],
            [2, "Item B", 200],
          ],
        },
      ],
      outputPath: "./output/excel-minimal.xlsx",
    });

    assert.equal(result.success, true, "creation succeeded");
    console.error("  Created:", result.filePath);
  });

  test("creates Excel with professional styling preset", async () => {
    const result = await createExcel({
      sheets: [
        {
          name: "Professional Data",
          data: [
            ["Employee ID", "Name", "Department", "Salary"],
            [101, "John Doe", "Engineering", "$75,000"],
            [102, "Jane Smith", "Marketing", "$82,500"],
            [103, "Brown Lee", "IT Administration", "$68,750"],
          ],
        },
      ],
      stylePreset: "professional",
      outputPath: "./output/excel-professional.xlsx",
    });

    assert.equal(result.success, true, "creation succeeded");
    console.error("  Created:", result.filePath);
  });

  test("creates Excel with colorful styling preset", async () => {
    const result = await createExcel({
      sheets: [
        {
          name: "Colorful Data",
          data: [
            ["Status", "Message", "Priority"],
            ["Pending", "Task in progress", "High"],
            ["Complete", "Task finished", "Low"],
            ["Failed", "Error occurred", "Critical"],
          ],
        },
      ],
      stylePreset: "colorful",
      outputPath: "./output/excel-colorful.xlsx",
    });

    assert.equal(result.success, true, "creation succeeded");
    console.error("  Created:", result.filePath);
  });

  test("creates Excel with custom styling overrides", async () => {
    const result = await createExcel({
      sheets: [
        {
          name: "Custom Styling",
          data: [
            ["Product", "Price", "Stock"],
            ["Widget A", "$50.00", true],
            ["Widget B", "$75.00", false],
            ["Widget C", "$100.00", true],
          ],
        },
      ],
      stylePreset: "minimal",
      style: {
        font: {
          bold: true,
          color: "FF00AA",
          size: 14,
        },
        columnWidths: {
          0: 25,
          1: 15,
          2: 10,
        },
        rowHeights: {
          0: 20,
        },
        headerBold: true,
      },
      outputPath: "./output/excel-custom.xlsx",
    });

    assert.equal(result.success, true, "creation succeeded");
    console.error("  Created:", result.filePath);
  });

  test("creates Excel with multiple sheets and different styling", async () => {
    const result = await createExcel({
      sheets: [
        {
          name: "Sales Data",
          data: [
            ["Month", "Revenue", "Profit"],
            ["January", "$150,000", "$30,000"],
            ["February", "$180,000", "$40,000"],
            ["March", "$200,000", "$50,000"],
          ],
        },
        {
          name: "Expenses",
          data: [
            ["Category", "Cost"],
            ["Marketing", "$10,000"],
            ["Production", "$15,000"],
            ["Shipping", "$5,000"],
          ],
        },
      ],
      stylePreset: "professional",
      style: {
        font: {
          bold: false,
          color: "336699",
        },
        columnWidths: {
          0: 20,
          1: 25,
          2: 20,
        },
        headerBold: true,
      },
      outputPath: "./output/excel-multi-sheet.xlsx",
    });

    assert.equal(result.success, true, "creation succeeded");
    console.error("  Created:", result.filePath);
  });
});
