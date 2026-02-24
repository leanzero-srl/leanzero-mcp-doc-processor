import fs from "fs";
import path from "path";
import { Footer } from "docx";
import {
  loadDNA,
  getDefaultDNA,
  createDNAFile,
  applyDNAToInput,
  clearDNACache,
} from "../src/utils/dna-manager.js";
import { createDocHeader, createDocFooter } from "../src/tools/doc-utils.js";

const TEST_DIR = path.join(process.cwd(), "test", "_tmp_dna_test");
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
// DNA Manager Tests
// ============================================================================

function testLoadDNA() {
  console.log("\n=== loadDNA Tests ===\n");

  // Test: returns null when no file exists
  clearDNACache();
  const result = loadDNA(TEST_DIR);
  assert(result === null, "returns null when no .document-dna.json exists");

  // Test: loads valid DNA file
  const dna = { version: 1, company: { name: "Test Corp" }, defaults: { stylePreset: "business" }, header: { enabled: true, text: "Test Corp" }, footer: { enabled: true, text: "Page {current}" } };
  fs.writeFileSync(DNA_PATH, JSON.stringify(dna, null, 2));
  clearDNACache();
  const loaded = loadDNA(TEST_DIR);
  assert(loaded !== null, "loads existing DNA file");
  assert(loaded.company.name === "Test Corp", "reads company name correctly");
  assert(loaded.defaults.stylePreset === "business", "reads stylePreset correctly");

  // Test: caching works (same mtime returns cached)
  const loaded2 = loadDNA(TEST_DIR);
  assert(loaded2 !== null, "cached load returns data");
  assert(loaded2.company.name === "Test Corp", "cached data is correct");

  // Test: handles malformed JSON gracefully
  fs.writeFileSync(DNA_PATH, "{ invalid json }}}");
  clearDNACache();
  const malformed = loadDNA(TEST_DIR);
  assert(malformed === null, "returns null on malformed JSON");
}

function testGetDefaultDNA() {
  console.log("\n=== getDefaultDNA Tests ===\n");

  const defaults = getDefaultDNA();
  assert(defaults.version === 1, "default version is 1");
  assert(typeof defaults.company === "object", "has company object");
  assert(typeof defaults.company.name === "string", "has company.name string");
  assert(typeof defaults.defaults === "object", "has defaults object");
  assert(typeof defaults.defaults.stylePreset === "string", "has defaults.stylePreset");
  assert(typeof defaults.header === "object", "has header object");
  assert(defaults.header.enabled === false, "header disabled by default (no generic placeholder)");
  assert(typeof defaults.header.text === "string", "has header.text");
  assert(typeof defaults.footer === "object", "has footer object");
  assert(defaults.footer.enabled === true, "footer enabled by default");
  assert(typeof defaults.footer.text === "string", "has footer.text");
  assert(defaults.footer.text.includes("{current}"), "footer uses {current} placeholder");
  assert(defaults.footer.text.includes("{total}"), "footer uses {total} placeholder");
}

function testCreateDNAFile() {
  console.log("\n=== createDNAFile Tests ===\n");

  clearDNACache();

  // Test: creates file with defaults
  const result = createDNAFile({}, TEST_DIR);
  assert(fs.existsSync(DNA_PATH), "creates .document-dna.json file");
  assert(result.path === DNA_PATH, "returns correct path");
  assert(result.config.version === 1, "config has version");
  assert(result.config.company.name === "", "uses empty default company name (no generic placeholder)");

  // Test: custom values override defaults
  const result2 = createDNAFile({
    company: { name: "Acme Corp" },
    defaults: { stylePreset: "colorful" },
    header: { text: "Acme Docs", alignment: "center" },
  }, TEST_DIR);
  assert(result2.config.company.name === "Acme Corp", "custom company name applied");
  assert(result2.config.defaults.stylePreset === "colorful", "custom stylePreset applied");
  assert(result2.config.header.text === "Acme Docs", "custom header text applied");
  assert(result2.config.header.alignment === "center", "custom header alignment applied");
  assert(result2.config.footer.enabled === true, "footer defaults preserved when not overridden");

  // Test: loadDNA reads back what createDNAFile wrote
  clearDNACache();
  const loaded = loadDNA(TEST_DIR);
  assert(loaded.company.name === "Acme Corp", "loadDNA reads back created DNA");
}

function testApplyDNAToInput() {
  console.log("\n=== applyDNAToInput Tests ===\n");

  // Setup: create a DNA file
  createDNAFile({
    company: { name: "Test Corp" },
    defaults: { stylePreset: "business" },
    header: { enabled: true, text: "Test Corp", alignment: "right" },
    footer: { enabled: true, text: "Page {current} of {total}", alignment: "center" },
  }, TEST_DIR);
  clearDNACache();

  // We need to temporarily override cwd for applyDNAToInput
  // Since applyDNAToInput calls loadDNA() which defaults to cwd,
  // let's test by directly loading and applying
  // Actually, applyDNAToInput uses loadDNA() internally which uses process.cwd()
  // For this test, create DNA in process.cwd()
  createDNAFile({
    company: { name: "Test Corp" },
    defaults: { stylePreset: "business" },
    header: { enabled: true, text: "Test Corp", alignment: "right" },
    footer: { enabled: true, text: "Page {current} of {total}", alignment: "center" },
  });
  clearDNACache();

  // Test: injects header when not provided
  const input1 = { title: "My Doc" };
  applyDNAToInput(input1);
  assert(input1.header !== undefined, "injects header when not provided");
  assert(input1.header.text === "Test Corp", "injected header has correct text");
  assert(input1.header.alignment === "right", "injected header has correct alignment");

  // Test: injects footer when not provided
  assert(input1.footer !== undefined, "injects footer when not provided");
  assert(input1.footer.text === "Page {current} of {total}", "injected footer has correct text");
  assert(input1.footer.alignment === "center", "injected footer has correct alignment");

  // Test: injects stylePreset when not provided
  assert(input1.stylePreset === "business", "injects stylePreset when not provided");

  // Test: does NOT override explicit header
  clearDNACache();
  const input2 = { title: "My Doc", header: { text: "Explicit Header" } };
  applyDNAToInput(input2);
  assert(input2.header.text === "Explicit Header", "does NOT override explicit header");

  // Test: does NOT override explicit footer
  clearDNACache();
  const input3 = { title: "My Doc", footer: { text: "My Footer" } };
  applyDNAToInput(input3);
  assert(input3.footer.text === "My Footer", "does NOT override explicit footer");

  // Test: does NOT override explicit stylePreset
  clearDNACache();
  const input4 = { title: "My Doc", stylePreset: "legal" };
  applyDNAToInput(input4);
  assert(input4.stylePreset === "legal", "does NOT override explicit stylePreset");

  // Test: with header.enabled = false, does not inject header
  clearDNACache();
  createDNAFile({
    company: { name: "Disabled Corp" },
    header: { enabled: false, text: "Should Not Appear" },
    footer: { enabled: true, text: "Footer OK" },
  });
  clearDNACache();
  const input5 = { title: "My Doc" };
  applyDNAToInput(input5);
  assert(input5.header === undefined, "does NOT inject header when enabled=false");
  assert(input5.footer !== undefined, "still injects footer when footer enabled=true");

  // Test: no DNA file returns input unchanged
  cleanup();
  clearDNACache();
  const input6 = { title: "My Doc" };
  const result = applyDNAToInput(input6);
  assert(result === input6, "returns same input when no DNA");
  assert(input6.header === undefined, "no header injected when no DNA");
  assert(input6.footer === undefined, "no footer injected when no DNA");
}

// ============================================================================
// Header/Footer Tests (doc-utils.js)
// ============================================================================

function testCreateDocHeader() {
  console.log("\n=== createDocHeader Tests ===\n");

  const header = createDocHeader("Test Header", { alignment: "right" });
  assert(header !== null, "creates a header object");
  assert(header.options !== undefined || header.rootKey !== undefined, "header has internal structure");
}

function testCreateDocFooter() {
  console.log("\n=== createDocFooter Tests ===\n");

  // Test: creates a footer with placeholders
  const footer = createDocFooter({ text: "Page {current} of {total}", alignment: "center" });
  assert(footer !== null, "creates a footer object");
  assert(footer instanceof Footer, "footer is an instance of Footer");

  // Test: creates footer with no text
  const emptyFooter = createDocFooter({});
  assert(emptyFooter instanceof Footer, "empty footer is valid Footer instance");

  // Test: legacy {{page}} syntax
  const legacyFooter = createDocFooter({ text: "Page {{page}}", alignment: "left" });
  assert(legacyFooter instanceof Footer, "legacy footer is valid Footer instance");

  // Test: plain text footer (no placeholders)
  const plainFooter = createDocFooter({ text: "Confidential", alignment: "center" });
  assert(plainFooter instanceof Footer, "plain text footer is valid Footer instance");

  // Test: multiple placeholders
  const multiFooter = createDocFooter({ text: "{current} / {total} - Draft" });
  assert(multiFooter instanceof Footer, "multi-placeholder footer is valid");
}

// ============================================================================
// Run all tests
// ============================================================================

console.log("Document DNA System Tests");
console.log("=".repeat(50));

setup();

try {
  testLoadDNA();
  testGetDefaultDNA();
  testCreateDNAFile();
  testApplyDNAToInput();
  testCreateDocHeader();
  testCreateDocFooter();
} finally {
  cleanup();
}

console.log(`\n${"=".repeat(50)}`);
console.log(`Results: ${passed} passed, ${failed} failed out of ${passed + failed}`);

if (failed > 0) {
  process.exit(1);
}
