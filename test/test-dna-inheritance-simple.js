import fs from "fs";
import path from "path";

const TEST_DIR = path.join(process.cwd(), "test", "_tmp_dna_inheritance_simple_test");
const DNA_PATH = path.join(TEST_DIR, ".document-dna.json");
const USER_DNA_PATH = path.join(TEST_DIR, ".document-user.json");

console.log("=== DNA Inheritance System - Simple Test ===\n");

// Setup
if (fs.existsSync(TEST_DIR)) {
  fs.rmSync(TEST_DIR, { recursive: true });
}
fs.mkdirSync(TEST_DIR, { recursive: true });

// Test 1: Create user DNA file
console.log("Test 1: Creating user DNA file");
const userDNA = {
  version: 1,
  company: { name: "User Corp", department: "Engineering" },
  defaults: { stylePreset: "colorful", category: "technical" },
  header: { enabled: true, text: "User Header", alignment: "right" },
  footer: { enabled: true, text: "Page {current} of {total}", alignment: "center" }
};

fs.writeFileSync(USER_DNA_PATH, JSON.stringify(userDNA, null, 2));
console.log("User DNA file created at:", USER_DNA_PATH);

// Test 2: Create project DNA file
console.log("\nTest 2: Creating project DNA file");
const projectDNA = {
  version: 1,
  company: { name: "Project Corp", department: "Docs" },
  defaults: { stylePreset: "business", category: "business" },
  header: { enabled: true, text: "Project Header", alignment: "left" },
  footer: { enabled: true, text: " Confidential ", alignment: "center" }
};

fs.writeFileSync(DNA_PATH, JSON.stringify(projectDNA, null, 2));
console.log("Project DNA file created at:", DNA_PATH);

// Test 3: Load user DNA
console.log("\nTest 3: Loading user DNA");
import { loadUserDNA } from "../src/utils/dna-inheritance.js";
const loadedUserDNA = loadUserDNA(TEST_DIR);
console.log("Loaded user DNA:", JSON.stringify(loadedUserDNA, null, 2));

// Test 4: Load project DNA
console.log("\nTest 4: Loading project DNA");
import { loadProjectDNA } from "../src/utils/dna-inheritance.js";
const loadedProjectDNA = loadProjectDNA(TEST_DIR);
console.log("Loaded project DNA:", JSON.stringify(loadedProjectDNA, null, 2));

// Test 5: Merge DNA levels
console.log("\nTest 5: Merging DNA levels");
import { mergeDNALevels } from "../src/utils/dna-inheritance.js";
const mergedDNA = mergeDNALevels(loadedUserDNA, loadedProjectDNA);
console.log("Merged DNA (user > project):", JSON.stringify(mergedDNA, null, 2));

// Verify priority
console.log("\nVerifying inheritance priority:");
console.log("Company name:", mergedDNA.company.name, "(should be 'User Corp' from user DNA)");
console.log("Style preset:", mergedDNA.defaults.stylePreset, "(should be 'colorful' from user DNA)");
console.log("Header alignment:", mergedDNA.header.alignment, "(should be 'left' from project DNA since user didn't override it)");
console.log("Footer text:", mergedDNA.footer.text, "(should be 'Page {current} of {total}' from user DNA)");

// Cleanup
fs.rmSync(TEST_DIR, { recursive: true });
console.log("\n=== Test completed ===");