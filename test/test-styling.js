import { createDoc } from "../src/tools/create-doc.js";
import { createExcel } from "../src/tools/create-excel.js";
import {
  getStyleConfig,
  buildDocumentStyles,
  selectStyleBasedOnCategory,
} from "../src/tools/styling.js";

/**
 * Comprehensive styling demonstration for DOCX and Excel document generation
 * This script showcases all available styling options and presets
 */

function testBuildDocumentStyles() {
  console.log("=== buildDocumentStyles Unit Tests ===\n");
  let passed = 0;
  let failed = 0;

  function assert(condition, msg) {
    if (condition) {
      passed++;
      console.log(`  OK: ${msg}`);
    } else {
      failed++;
      console.error(`  FAIL: ${msg}`);
    }
  }

  // Test 1: Returns correct top-level structure
  const config = getStyleConfig("professional");
  const styles = buildDocumentStyles(config);
  assert(styles.default !== undefined, "has default styles");
  assert(styles.default.document !== undefined, "has default.document");
  assert(styles.default.heading1 !== undefined, "has default.heading1");
  assert(styles.default.heading2 !== undefined, "has default.heading2");
  assert(styles.default.heading3 !== undefined, "has default.heading3");
  assert(Array.isArray(styles.paragraphStyles), "has paragraphStyles array");

  // Test 2: Document run styles use correct font family (not uppercased)
  assert(
    styles.default.document.run.font === "Garamond",
    "document font is Garamond for professional",
  );
  assert(
    typeof styles.default.document.run.size === "number",
    "document font size is a number",
  );
  assert(
    styles.default.document.run.size === config.font.size * 2,
    "document font size is in half-points",
  );

  // Test 3: Heading styles have proper values
  assert(styles.default.heading1.run.bold === true, "heading1 is bold");
  assert(
    styles.default.heading1.run.size === config.heading1.size * 2,
    "heading1 size matches config",
  );
  assert(
    styles.default.heading1.run.color === config.heading1.color,
    "heading1 color matches config",
  );
  assert(
    styles.default.heading1.paragraph.spacing.before ===
      config.heading1.spacingBefore,
    "heading1 spacing before matches",
  );

  // Test 4: Title paragraph style is defined
  const titleStyle = styles.paragraphStyles.find((s) => s.id === "Title");
  assert(titleStyle !== undefined, "Title paragraph style exists");
  assert(
    titleStyle.run.font === "Garamond",
    "Title font matches document font",
  );
  assert(titleStyle.run.bold === true, "Title is bold");

  // Test 5: All presets produce valid styles
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
    assert(
      s.default.document.run.font === cfg.font.family,
      `${preset}: font family preserved correctly`,
    );
  }

  // Test 6: selectStyleBasedOnCategory mapping
  assert(
    selectStyleBasedOnCategory("contracts") === "legal",
    "contracts -> legal",
  );
  assert(
    selectStyleBasedOnCategory("technical") === "technical",
    "technical -> technical",
  );
  assert(
    selectStyleBasedOnCategory("business") === "business",
    "business -> business",
  );
  assert(
    selectStyleBasedOnCategory("meeting") === "professional",
    "meeting -> professional",
  );
  assert(
    selectStyleBasedOnCategory("research") === "professional",
    "research -> professional",
  );
  assert(
    selectStyleBasedOnCategory("unknown") === "minimal",
    "unknown -> minimal",
  );

  console.log(`\nbuildDocumentStyles: ${passed} passed, ${failed} failed\n`);
  if (failed > 0) {
    process.exitCode = 1;
  }
}

async function demonstrateStyling() {
  // Run unit tests first
  testBuildDocumentStyles();

  console.log("=== Styling Demonstration ===\n");

  // ============================================================================
  // DOCX Styling Examples
  // ============================================================================

  console.log("1. Creating DOCX with minimal styling (default)...");
  const docMinimalResult = await createDoc({
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
      ],
    ],
    outputPath: "./output/doc-minimal.docx",
  });
  console.log("� Result:", docMinimalResult.success ? "SUCCESS" : "FAILED");
  if (docMinimalResult.styleConfig) {
    console.log(
      "  Style config used:",
      JSON.stringify(docMinimalResult.styleConfig, null, 2),
    );
  }
  console.log();

  console.log("2. Creating DOCX with professional styling preset...");
  const docProfessionalResult = await createDoc({
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
      ],
    ],
    stylePreset: "professional",
    outputPath: "./output/doc-professional.docx",
  });
  console.log(
    "� Result:",
    docProfessionalResult.success ? "SUCCESS" : "FAILED",
  );
  if (docProfessionalResult.styleConfig) {
    console.log(
      "  Style config used:",
      JSON.stringify(docProfessionalResult.styleConfig, null, 2),
    );
  }
  console.log();

  console.log("3. Creating DOCX with colorful styling preset...");
  const docColorfulResult = await createDoc({
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
      ],
    ],
    stylePreset: "colorful",
    outputPath: "./output/doc-colorful.docx",
  });
  console.log("� Result:", docColorfulResult.success ? "SUCCESS" : "FAILED");
  if (docColorfulResult.styleConfig) {
    console.log(
      "  Style config used:",
      JSON.stringify(docColorfulResult.styleConfig, null, 2),
    );
  }
  console.log();

  console.log("4. Creating DOCX with custom styling overrides...");
  const docCustomResult = await createDoc({
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
  });
  console.log("� Result:", docCustomResult.success ? "SUCCESS" : "FAILED");
  if (docCustomResult.styleConfig) {
    console.log(
      "  Style config used:",
      JSON.stringify(docCustomResult.styleConfig, null, 2),
    );
  }
  console.log();

  // ============================================================================
  // Excel Styling Examples
  // ============================================================================

  console.log("5. Creating Excel with minimal styling (default)...");
  const excelMinimalResult = await createExcel({
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
  console.log("� Result:", excelMinimalResult.success ? "SUCCESS" : "FAILED");
  if (excelMinimalResult.styleConfig) {
    console.log(
      "  Style config used:",
      JSON.stringify(excelMinimalResult.styleConfig, null, 2),
    );
  }
  console.log();

  console.log("6. Creating Excel with professional styling preset...");
  const excelProfessionalResult = await createExcel({
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
  console.log(
    "� Result:",
    excelProfessionalResult.success ? "SUCCESS" : "FAILED",
  );
  if (excelProfessionalResult.styleConfig) {
    console.log(
      "  Style config used:",
      JSON.stringify(excelProfessionalResult.styleConfig, null, 2),
    );
  }
  console.log();

  console.log("7. Creating Excel with colorful styling preset...");
  const excelColorfulResult = await createExcel({
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
  console.log("� Result:", excelColorfulResult.success ? "SUCCESS" : "FAILED");
  if (excelColorfulResult.styleConfig) {
    console.log(
      "  Style config used:",
      JSON.stringify(excelColorfulResult.styleConfig, null, 2),
    );
  }
  console.log();

  console.log("8. Creating Excel with custom styling overrides...");
  const excelCustomResult = await createExcel({
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
        0: 25, // First column width
        1: 15, // Second column width
        2: 10, // Third column width
      },
      rowHeights: {
        0: 20, // Header row height
      },
      headerBold: true,
    },
    outputPath: "./output/excel-custom.xlsx",
  });
  console.log("� Result:", excelCustomResult.success ? "SUCCESS" : "FAILED");
  if (excelCustomResult.styleConfig) {
    console.log(
      "  Style config used:",
      JSON.stringify(excelCustomResult.styleConfig, null, 2),
    );
  }
  console.log();

  console.log(
    "9. Creating Excel with multiple sheets and different styling...",
  );
  const excelMultiSheetResult = await createExcel({
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
  console.log(
    "� Result:",
    excelMultiSheetResult.success ? "SUCCESS" : "FAILED",
  );
  if (excelMultiSheetResult.styleConfig) {
    console.log(
      "  Style config used:",
      JSON.stringify(excelMultiSheetResult.styleConfig, null, 2),
    );
  }
  console.log();

  // ============================================================================
  // Summary
  // ============================================================================

  const docResults = [
    docMinimalResult,
    docProfessionalResult,
    docColorfulResult,
    docCustomResult,
  ];

  const excelResults = [
    excelMinimalResult,
    excelProfessionalResult,
    excelColorfulResult,
    excelCustomResult,
    excelMultiSheetResult,
  ];

  console.log("=== Summary ===");
  console.log(
    `DOCX files created: ${docResults.filter((r) => r.success).length}/${docResults.length}`,
  );
  console.log("Output paths:", ...docResults.map((r) => `  - ${r.filePath}`));
  console.log();
  console.log(
    `Excel files created: ${excelResults.filter((r) => r.success).length}/${excelResults.length}`,
  );
  console.log("Output paths:", ...excelResults.map((r) => `  - ${r.filePath}`));

  if (
    docResults.every((r) => r.success) &&
    excelResults.every((r) => r.success)
  ) {
    console.log("\n� All styling demonstrations completed successfully!");
  } else {
    console.log(
      "\n� Some styling demonstrations failed. Check error messages above.",
    );
  }
}

// Run the demonstration
demonstrateStyling()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Error running styling demonstration:", error);
    process.exit(1);
  });
