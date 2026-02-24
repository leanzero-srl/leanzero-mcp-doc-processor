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
      title: "Internal Meeting Notes — February 2026 All-Hands",
      paragraphs: [
        { text: "Agenda Items", headingLevel: "heading1" },
        "Review of Q4 delivery milestones and discussion of Q1 priorities.",
        { text: "Key Decisions", headingLevel: "heading2" },
        "The team agreed to adopt a two-week sprint cycle starting March 1st.",
      ],
      tables: [
        [
          ["Action Item", "Owner", "Due Date"],
          ["Migrate CI to GitHub Actions", "Platform Team", "2026-03-15"],
          ["Draft API versioning RFC", "Backend Lead", "2026-03-01"],
          ["Update onboarding docs", "DevEx Team", "2026-02-28"],
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
      title: "Annual Compensation Review — Engineering Department 2026",
      paragraphs: [
        { text: "Executive Summary", headingLevel: "heading1" },
        {
          text: "This review presents the annual compensation benchmarking analysis for the engineering department, covering base salary, equity, and bonus structures.",
          italics: true,
          color: "336699",
        },
        { text: "Methodology", headingLevel: "heading2" },
        {
          text: "Compensation data was sourced from Levels.fyi, Glassdoor, and internal HR records. All figures are adjusted for geographic cost-of-living.",
          alignment: "both",
        },
      ],
      tables: [
        [
          ["Role", "Department", "Median Salary", "Market P50"],
          ["Senior Engineer", "Backend", "$185,000", "$178,000"],
          ["Staff Engineer", "Platform", "$225,000", "$215,000"],
          ["Engineering Manager", "Frontend", "$210,000", "$205,000"],
          ["Principal Engineer", "Infrastructure", "$275,000", "$268,000"],
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
      title: "2026 Product Launch Announcement — CloudSync Platform",
      paragraphs: [
        { text: "Introducing CloudSync 3.0", headingLevel: "heading1" },
        {
          text: "We are thrilled to announce the next generation of our real-time collaboration platform, featuring end-to-end encryption and offline-first architecture.",
          bold: true,
        },
        { text: "Release Timeline", headingLevel: "heading2" },
        {
          text: "Beta access begins March 15, 2026. General availability is scheduled for Q2.",
          alignment: "center",
        },
      ],
      tables: [
        [
          ["Feature", "Status", "Priority"],
          ["End-to-End Encryption", "Complete", "P0"],
          ["Offline Mode", "In Beta", "P0"],
          ["Custom Workflows", "In Development", "P1"],
          ["Analytics Dashboard", "Planned", "P2"],
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
      title: "Brand Identity Guidelines — Custom Typography Study",
      paragraphs: [
        { text: "Typography Overview", headingLevel: "heading1" },
        {
          text: "This document demonstrates custom font pairing and spacing configurations for brand consistency across all external communications.",
          bold: true,
          italics: true,
        },
        { text: "Spacing and Alignment Standards", headingLevel: "heading2" },
        {
          text: "All body text uses generous paragraph spacing with centered alignment for maximum visual impact in presentation materials.",
          alignment: "center",
        },
      ],
      tables: [
        [
          ["Element", "Specification", "Usage"],
          ["Headings", "Times New Roman 14pt", "Section titles"],
          ["Body Text", "Times New Roman 12pt", "Paragraph content"],
        ],
      ],
      stylePreset: "minimal",
      style: {
        font: {
          size: 12,
          color: "444444",
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
      title: "Inventory Snapshot — February 2026",
      sheets: [
        {
          name: "Warehouse Inventory",
          data: [
            ["SKU", "Product Name", "Quantity in Stock"],
            ["SKU-001", "Wireless Keyboard", 342],
            ["SKU-002", "USB-C Hub Adapter", 187],
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
      title: "Engineering Headcount and Compensation Summary",
      sheets: [
        {
          name: "Headcount by Department",
          data: [
            ["Employee ID", "Name", "Department", "Annual Salary"],
            [101, "John Doe", "Backend Engineering", "$185,000"],
            [102, "Jane Smith", "Product Marketing", "$142,500"],
            [103, "Brown Lee", "IT Operations", "$128,750"],
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
      title: "Incident Tracker — Production Alerts February 2026",
      sheets: [
        {
          name: "Active Incidents",
          data: [
            ["Incident ID", "Description", "Severity"],
            ["INC-4821", "API gateway latency spike", "P1 — Critical"],
            ["INC-4819", "Database replication lag resolved", "P2 — High"],
            ["INC-4815", "CDN cache invalidation timeout", "P3 — Medium"],
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
      title: "Product Catalog — Retail Pricing Q1 2026",
      sheets: [
        {
          name: "Retail Price List",
          data: [
            ["Product", "Unit Price", "In Stock"],
            ["Ergonomic Standing Desk", "$549.00", true],
            ["Noise-Cancelling Headset", "$179.00", false],
            ["4K Webcam Pro", "$129.00", true],
          ],
        },
      ],
      stylePreset: "minimal",
      style: {
        font: {
          bold: true,
          color: "333333",
          size: 14,
        },
        columnWidths: {
          0: 28,
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
      title: "Q1 2026 Revenue and Expense Breakdown",
      sheets: [
        {
          name: "Monthly Revenue Summary",
          data: [
            ["Month", "Gross Revenue", "Net Profit"],
            ["January", "$150,000", "$30,000"],
            ["February", "$180,000", "$40,000"],
            ["March", "$200,000", "$50,000"],
          ],
        },
        {
          name: "Operating Expenses",
          data: [
            ["Expense Category", "Monthly Cost"],
            ["Digital Marketing", "$10,000"],
            ["Manufacturing", "$15,000"],
            ["Logistics and Shipping", "$5,000"],
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
          0: 22,
          1: 20,
          2: 18,
        },
        headerBold: true,
      },
      outputPath: "./output/excel-multi-sheet.xlsx",
    });

    assert.equal(result.success, true, "creation succeeded");
    console.error("  Created:", result.filePath);
  });
});
