import fs from "fs";
import path from "path";
import {
  loadUserDNA,
  loadProjectDNA,
  mergeDNALevels,
  applyDNAToInput,
  clearDNACache,
  getSystemDefaults,
  getAllDNALevels
} from "../src/utils/dna-inheritance.js";
import {
  loadDNA,
  createDNAFile,
  getDefaultDNA,
} from "../src/utils/dna-manager.js";

const TEST_DIR = path.join(process.cwd(), "test", "_tmp_dna_inheritance_test");
const DNA_PATH = path.join(TEST_DIR, ".document-dna.json");
const USER_DNA_PATH = path.join(TEST_DIR, ".document-user.json");

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
  
  const rootUserDNA = path.join(process.cwd(), ".document-user.json");
  if (fs.existsSync(rootUserDNA)) {
    fs.unlinkSync(rootUserDNA);
  }
  
  clearDNACache();
}

// ============================================================================
// DNA Inheritance Tests
// ============================================================================

function testGetSystemDefaults() {
  console.log("\n=== getSystemDefaults Tests ===\n");
  
  const defaults = getSystemDefaults();
  assert(defaults.version === 1, "default version is 1");
  assert(typeof defaults.company === "object", "has company object");
  assert(defaults.defaults.stylePreset === "professional", "default stylePreset is professional");
}

function testLoadUserDNA() {
  console.log("\n=== loadUserDNA Tests ===\n");
  
  // Test: returns null when no file exists
  clearDNACache();
  const result = loadUserDNA(TEST_DIR);
  assert(result === null, "returns null when no .document-user.json exists");
  
  // Test: loads valid user DNA file
  const userDNA = { 
    company: { name: "User Corp" },
    defaults: { stylePreset: "colorful" }
  };
  fs.writeFileSync(USER_DNA_PATH, JSON.stringify(userDNA, null, 2));
  clearDNACache();
  const loaded = loadUserDNA(TEST_DIR);
  assert(loaded !== null, "loads existing user DNA file");
  assert(loaded.company.name === "User Corp", "reads company name correctly");
  assert(loaded.defaults.stylePreset === "colorful", "reads stylePreset correctly");
  
  // Test: caching works
  const loaded2 = loadUserDNA(TEST_DIR);
  assert(loaded2 !== null, "cached load returns data");
}

function testMergeDNALevels() {
  console.log("\n=== mergeDNALevels Tests ===\n");
  
  // Test: only defaults
  const result1 = mergeDNALevels(null, null);
  assert(result1.company.name === "My Project", "defaults company name applied");
  
  // Test: defaults + project
  const result2 = mergeDNALevels(null, {
    company: { name: "Project Corp" },
    defaults: { stylePreset: "business" }
  });
  assert(result2.company.name === "Project Corp", "project overrides defaults");
  assert(result2.defaults.stylePreset === "business", "project stylePreset applied");
  
  // Test: defaults + project + user
  const result3 = mergeDNALevels({
    company: { name: "User Corp" }
  }, {
    company: { name: "Project Corp" },
    defaults: { stylePreset: "business" }
  });
  assert(result3.company.name === "User Corp", "user overrides project");
  assert(result3.defaults.stylePreset === "business", "project stylePreset preserved when not overridden by user");
  
  // Test: partial overrides
  const result4 = mergeDNALevels({
    header: { text: "User Header" }
  }, {
    footer: { text: "Project Footer" },
    header: { alignment: "center" }
  });
  assert(result4.header.text === "User Header", "user header text wins");
  assert(result4.header.alignment === "center", "project header alignment preserved");
  assert(result4.footer.text === "Project Footer", "project footer applied");
}

function testApplyDNAToInput() {
  console.log("\n=== applyDNAToInput Tests ===\n");
  
  // Setup: create DNA files in test directory
  const userDNA = {
    company: { name: "User Corp" },
    defaults: { stylePreset: "colorful" },
    header: { enabled: true, text: "User Header", alignment: "right" },
    footer: { enabled: true, text: "User Footer", alignment: "center" }
  };
  
  const projectDNA = {
    company: { name: "Project Corp" },
    defaults: { stylePreset: "business" },
    header: { enabled: true, text: "Project Header", alignment: "left" },
    footer: { enabled: true, text: "Project Footer", alignment: "center" }
  };
  
  fs.writeFileSync(USER_DNA_PATH, JSON.stringify(userDNA, null, 2));
  fs.writeFileSync(DNA_PATH, JSON.stringify(projectDNA, null, 2));
  
  clearDNACache();
  
  // We need to temporarily override cwd for applyDNAToInput
  const originalCwd = process.cwd();
  
  try {
    // Test with project DNA only (user DNA not loaded)
    process.chdir(TEST_DIR);
    
    clearDNACache();
    
    // Test: injects header when not provided (user should override project)
    const input1 = { title: "My Doc" };
    applyDNAToInput(input1);
    assert(input1.header !== undefined, "injects header when not provided");
    // User header text should win
    assert(input1.header.text === "User Header", "injected header has user override text");
    
    // Test: injects footer when not provided
    assert(input1.footer !== undefined, "injects footer when not provided");
    // User footer text should win
    assert(input1.footer.text === "User Footer", "injected footer has user override text");
    
    // Test: injects stylePreset when not provided
    assert(input1.stylePreset === "colorful", "injects user stylePreset");
    
    // Test: explicit header overrides inheritance
    clearDNACache();
    const input2 = { title: "My Doc", header: { text: "Explicit Header" } };
    applyDNAToInput(input2);
    assert(input2.header.text === "Explicit Header", "explicit header overrides inheritance");
    
  } finally {
    process.chdir(originalCwd);
  }
}

function testGetAllDNALevels() {
  console.log("\n=== getAllDNALevels Tests ===\n");
  
  // Setup: create DNA files
  const userDNA = {
    company: { name: "User Corp" },
    defaults: { stylePreset: "colorful" }
  };
  
  const projectDNA = {
    company: { name: "Project Corp" },
    defaults: { stylePreset: "business" }
  };
  
  fs.writeFileSync(USER_DNA_PATH, JSON.stringify(userDNA, null, 2));
  fs.writeFileSync(DNA_PATH, JSON.stringify(projectDNA, null, 2));
  
  clearDNACache();
  
  const originalCwd = process.cwd();
  
  try {
    process.chdir(TEST_DIR);
    
    clearDNACache();
    
    const levels = getAllDNALevels();
    assert(levels.system !== undefined, "has system level");
    assert(levels.project !== undefined, "has project level");
    assert(levels.user !== undefined, "has user level");
    assert(levels.merged !== undefined, "has merged level");
    
    // Verify merge priority: user > project > system
    assert(levels.merged.company.name === "User Corp", "merged company name reflects user override");
    assert(levels.merged.defaults.stylePreset === "colorful", "merged stylePreset reflects user override");
    
  } finally {
    process.chdir(originalCwd);
  }
}

function testBackwardCompatibility() {
  console.log("\n=== Backward Compatibility Tests ===\n");
  
  // Test: loadDNA still works (should use project DNA)
  clearDNACache();
  const projectDNA = {
    company: { name: "Old Style Corp" },
    defaults: { stylePreset: "legal" }
  };
  
  fs.writeFileSync(DNA_PATH, JSON.stringify(projectDNA, null, 2));
  
  const loaded = loadDNA(TEST_DIR);
  assert(loaded !== null, "loadDNA still works");
  assert(loaded.company.name === "Old Style Corp", "loadDNA reads project DNA correctly");
  
  // Test: createDNAFile still works
  clearDNACache();
  const result = createDNAFile({
    company: { name: "Created Corp" }
  }, TEST_DIR);
  
  assert(fs.existsSync(DNA_PATH), "createDNAFile creates file");
  assert(result.config.company.name === "Created Corp", "createDNAFile applies custom values");
  
  // Test: clearDNACache still works
  clearDNACache();
  const afterClear = loadDNA(TEST_DIR);
  // Cache is cleared, should reload
  assert(afterClear !== null, "clearDNACache allows reload");
}

// ============================================================================
// Run all tests
// ============================================================================

console.log("\n=============================================");
console.log("DNA Inheritance System Tests");
console.log("=============================================\n");

try {
  setup();
  
  testGetSystemDefaults();
  testLoadUserDNA();
  testMergeDNALevels();
  testApplyDNAToInput();
  testGetAllDNALevels();
  testBackwardCompatibility();
  
  console.log("\n=============================================");
  console.log(`Results: ${passed} passed, ${failed} failed`);
  console.log("=============================================\n");
  
  if (failed > 0) {
    process.exit(1);
  }
  
} catch (error) {
  console.error("Test error:", error);
  cleanup();
  process.exit(1);
}

cleanup();