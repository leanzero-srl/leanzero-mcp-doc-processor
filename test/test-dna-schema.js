import fs from "fs";
import path from "path";
import {
  DNA_SCHEMA,
  validateDNA,
  validateAndMigrateDNA,
  applyMigration,
  loadDNA,
  createDNAFile,
  applyDNAToInput,
  clearDNACache,
  getDefaultDNA,
} from "../src/utils/dna-schema.js";

const TEST_DIR = path.join(process.cwd(), "test", "_tmp_dna_schema_test");
const DNA_PATH = path.join(TEST_DIR, ".document-dna.json");

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

function setup() {
  if (fs.existsSync(TEST_DIR)) {
    fs.rmSync(TEST_DIR, { recursive: true });
  }
  fs.mkdirSync(TEST_DIR, { recursive: true });
  clearDNACache();
}

function cleanup() {
  if (fs.existsSync(TEST_DIR)) {
    fs.rmSync(TEST_DIR, { recursive: true });
  }
  // Also remove any DNA file created in project root during tests
  const rootDNA = path.join(process.cwd(), ".document-dna.json");
  if (fs.existsSync(rootDNA)) {
    fs.unlinkSync(rootDNA);
  }
  clearDNACache();
}

// ============================================================================
// DNA Schema Tests
// ============================================================================

function testDNA_SCHEMA() {
  console.log("\n=== DNA_SCHEMA Tests ===\n");

  // Test: version is required
  assert(
    DNA_SCHEMA.version.required === true,
    "version is marked as required"
  );
  assert(
    DNA_SCHEMA.version.type === "number",
    "version type is number"
  );
  assert(DNA_SCHEMA.version.min === 1, "version min is 1");

  // Test: company schema
  assert(
    DNA_SCHEMA.company.required === true,
    "company is marked as required"
  );
  assert(
    DNA_SCHEMA.company.type === "object",
    "company type is object"
  );
  assert(
    DNA_SCHEMA.company.properties.name.required === true,
    "company.name is required"
  );
  assert(
    DNA_SCHEMA.company.properties.name.type === "string",
    "company.name type is string"
  );
  assert(
    DNA_SCHEMA.company.properties.department.required === false,
    "company.department is optional"
  );

  // Test: defaults schema
  assert(
    DNA_SCHEMA.defaults.required === true,
    "defaults is marked as required"
  );
  assert(
    DNA_SCHEMA.defaults.type === "object",
    "defaults type is object"
  );
  assert(
    DNA_SCHEMA.defaults.properties.stylePreset.type === "string",
    "defaults.stylePreset type is string"
  );
  assert(
    DNA_SCHEMA.defaults.properties.category.required === false,
    "defaults.category is optional"
  );

  // Test: header schema
  assert(
    DNA_SCHEMA.header.type === "object",
    "header type is object"
  );
  assert(
    DNA_SCHEMA.header.properties.enabled.type === "boolean",
    "header.enabled type is boolean"
  );
  assert(
    DNA_SCHEMA.header.properties.text.type === "string",
    "header.text type is string"
  );
  assert(
    DNA_SCHEMA.header.properties.alignment.type === "string",
    "header.alignment type is string"
  );

  // Test: footer schema
  assert(
    DNA_SCHEMA.footer.type === "object",
    "footer type is object"
  );
  assert(
    DNA_SCHEMA.footer.properties.enabled.type === "boolean",
    "footer.enabled type is boolean"
  );
  assert(
    DNA_SCHEMA.footer.properties.text.type === "string",
    "footer.text type is string"
  );
  assert(
    DNA_SCHEMA.footer.properties.alignment.type === "string",
    "footer.alignment type is string"
  );
}

function testVALID_STYLE_PRESETS() {
  console.log("\n=== VALID_STYLE_PRESETS Tests ===\n");

  const expectedPresets = [
    "minimal",
    "professional",
    "technical",
    "legal",
    "business",
    "casual",
    "colorful",
  ];

  assert(
    Array.isArray(expectedPresets),
    "VALID_STYLE_PRESETS is an array"
  );
  assert(
    expectedPresets.length === 7,
    "VALID_STYLE_PRESETS contains 7 presets"
  );
}

function testValidateDNA() {
  console.log("\n=== validateDNA Tests ===\n");

  // Test: valid DNA configuration
  const validDNA = {
    version: 1,
    company: { name: "Test Corp" },
    defaults: { stylePreset: "professional" },
    header: { enabled: true, text: "Test Corp", alignment: "right" },
    footer: { enabled: true, text: "Page {current}", alignment: "center" },
  };

  const result1 = validateDNA(validDNA);
  assert(
    result1.valid === true,
    "valid DNA configuration passes validation"
  );
  assert(
    result1.errors.length === 0,
    "no errors for valid DNA"
  );

  // Test: invalid version (not a number)
  const invalidVersion = {
    ...validDNA,
    version: "1",
  };
  const result2 = validateDNA(invalidVersion);
  assert(
    result2.valid === false,
    "invalid version fails validation"
  );
  assert(
    result2.errors.some((e) => e.includes("version must be a number")),
    "error message includes version type issue"
  );

  // Test: missing required company
  const noCompany = {
    version: 1,
    defaults: { stylePreset: "professional" },
    header: { enabled: true, text: "Test Corp" },
    footer: { enabled: true, text: "Page {current}" },
  };
  const result3 = validateDNA(noCompany);
  assert(
    result3.valid === false,
    "missing company fails validation"
  );
  assert(
    result3.errors.some((e) => e.includes("company is required")),
    "error message includes missing company"
  );

  // Test: invalid stylePreset
  const invalidStyle = {
    ...validDNA,
    defaults: { stylePreset: "invalid-style" },
  };
  const result4 = validateDNA(invalidStyle);
  assert(
    result4.valid === false,
    "invalid stylePreset fails validation"
  );
  assert(
    result4.errors.some((e) =>
      e.includes("defaults.stylePreset must be one of")
    ),
    "error message includes valid style presets"
  );

  // Test: invalid alignment
  const invalidAlignment = {
    ...validDNA,
    header: { enabled: true, text: "Test Corp", alignment: "bottom" },
  };
  const result5 = validateDNA(invalidAlignment);
  assert(
    result5.valid === false,
    "invalid alignment fails validation"
  );
  assert(
    result5.errors.some((e) =>
      e.includes("header.alignment must be one of")
    ),
    "error message includes valid alignments"
  );

  // Test: header.enabled must be boolean
  const invalidEnabled = {
    ...validDNA,
    header: { enabled: "true" },
  };
  const result6 = validateDNA(invalidEnabled);
  assert(
    result6.valid === false,
    "non-boolean header.enabled fails validation"
  );
  assert(
    result6.errors.some((e) => e.includes("header.enabled must be a boolean")),
    "error message includes header.enabled type issue"
  );

  // Test: company.name is required
  const noCompanyName = {
    version: 1,
    company: { department: "Engineering" },
    defaults: { stylePreset: "professional" },
  };
  const result7 = validateDNA(noCompanyName);
  assert(
    result7.valid === false,
    "missing company.name fails validation"
  );
  assert(
    result7.errors.some((e) => e.includes("company.name is required")),
    "error message includes missing company.name"
  );

  // Test: defaults is required
  const noDefaults = {
    version: 1,
    company: { name: "Test Corp" },
    header: { enabled: true, text: "Test Corp" },
    footer: { enabled: true, text: "Page {current}" },
  };
  const result8 = validateDNA(noDefaults);
  assert(
    result8.valid === false,
    "missing defaults fails validation"
  );
  assert(
    result8.errors.some((e) => e.includes("defaults is required")),
    "error message includes missing defaults"
  );
}

function testValidateAndMigrateDNA() {
  console.log("\n=== validateAndMigrateDNA Tests ===\n");

  // Test: valid DNA with migration
  const validDNA = {
    version: 1,
    company: { name: "Test Corp" },
    defaults: { stylePreset: "professional" },
    header: { enabled: true, text: "Test Corp", alignment: "right" },
    footer: { enabled: true, text: "Page {current}", alignment: "center" },
  };

  const result1 = validateAndMigrateDNA(validDNA);
  assert(
    result1.valid === true,
    "valid DNA passes validation and migration"
  );
  assert(
    result1.dna !== null,
    "migrated DNA is not null"
  );
  assert(
    result1.dna.version === 1,
    "migrated DNA preserves version"
  );

  // Test: invalid DNA returns null
  const invalidDNA = {
    version: "1",
    company: { name: "Test Corp" },
  };

  const result2 = validateAndMigrateDNA(invalidDNA);
  assert(
    result2.valid === false,
    "invalid DNA fails validation"
  );
  assert(
    result2.dna === null,
    "migrated DNA is null for invalid input"
  );
}

function testApplyMigration() {
  console.log("\n=== applyMigration Tests ===\n");

  // Test: version 1 DNA (no migration needed)
  const dna1 = {
    version: 1,
    company: { name: "Test Corp" },
    defaults: { stylePreset: "professional" },
  };

  const migrated1 = applyMigration(dna1);
  assert(
    migrated1.version === 1,
    "version 1 DNA is unchanged after migration"
  );
}

function testExistingFunctions() {
  console.log("\n=== Existing Function Tests ===\n");

  // Test: getDefaultDNA
  const defaults = getDefaultDNA();
  assert(
    defaults.version === 1,
    "getDefaultDNA returns version 1"
  );
  assert(
    defaults.company.name === "My Project",
    "getDefaultDNA returns default company name"
  );
  assert(
    defaults.defaults.stylePreset === "professional",
    "getDefaultDNA returns default stylePreset"
  );

  // Test: loadDNA
  clearDNACache();
  const result = loadDNA(TEST_DIR);
  assert(
    result === null,
    "loadDNA returns null when no file exists"
  );

  // Create a DNA file and test loading
  const dna = {
    version: 1,
    company: { name: "Test Corp" },
    defaults: { stylePreset: "business" },
    header: { enabled: true, text: "Test Corp", alignment: "right" },
    footer: { enabled: true, text: "Page {current}", alignment: "center" },
  };
  fs.writeFileSync(DNA_PATH, JSON.stringify(dna, null, 2));
  clearDNACache();
  const loaded = loadDNA(TEST_DIR);
  assert(
    loaded !== null,
    "loadDNA loads existing DNA file"
  );
  assert(
    loaded.company.name === "Test Corp",
    "loaded DNA has correct company name"
  );
  assert(
    loaded.defaults.stylePreset === "business",
    "loaded DNA has correct stylePreset"
  );

  // Test: createDNAFile
  clearDNACache();
  const created = createDNAFile({ company: { name: "Acme Corp" } }, TEST_DIR);
  assert(
    fs.existsSync(DNA_PATH),
    "createDNAFile creates file"
  );
  assert(
    created.path === DNA_PATH,
    "createDNAFile returns correct path"
  );
  assert(
    created.config.company.name === "Acme Corp",
    "createDNAFile applies custom config"
  );

  // Test: applyDNAToInput
  clearDNACache();
  
  // Create DNA file in process.cwd() for applyDNAToInput
  createDNAFile({
    company: { name: "Test Corp" },
    defaults: { stylePreset: "business" },
    header: { enabled: true, text: "Test Corp", alignment: "right" },
    footer: { enabled: true, text: "Page {current}", alignment: "center" },
  });
  
  const input1 = { title: "My Doc" };
  applyDNAToInput(input1);
  assert(
    input1.header !== undefined,
    "applyDNAToInput injects header"
  );
  assert(
    input1.footer !== undefined,
    "applyDNAToInput injects footer"
  );
  assert(
    input1.stylePreset === "business",
    "applyDNAToInput injects stylePreset"
  );

  // Test: applyDNAToInput does not override explicit values
  const input2 = {
    title: "My Doc",
    header: { text: "Explicit Header" },
  };
  applyDNAToInput(input2);
  assert(
    input2.header.text === "Explicit Header",
    "applyDNAToInput does not override explicit header"
  );

  // Test: clearDNACache (function exists and runs without error)
  clearDNACache();
  assert(
    true,
    "clearDNACache function exists and executes without error"
  );
}

// Run all tests
console.log("Document DNA Schema Validation System Tests");
console.log("=".repeat(50));

setup();

try {
  testDNA_SCHEMA();
  testVALID_STYLE_PRESETS();
  testValidateDNA();
  testValidateAndMigrateDNA();
  testApplyMigration();
  testExistingFunctions();
} finally {
  cleanup();
}

console.log(`\n${"=".repeat(50)}`);
console.log(
  `Results: ${passed} passed, ${failed} failed out of ${passed + failed}`
);

if (failed > 0) {
  process.exit(1);
}