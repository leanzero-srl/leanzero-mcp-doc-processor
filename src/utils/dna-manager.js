/**
 * Document DNA Manager
 * Manages project DNA and document memories for AI guidance
 */

import fs from "fs/promises";
import fsSync from "fs";
import path from "path";

const REGISTRY_PATH = path.join(process.cwd(), "docs", "registry.json");

/**
 * Get project DNA configuration
 */
export function getProjectDNA() {
  return {
    defaultStylePreset: "technical",
    defaultHeader: "Technical Document",
    defaultFooter: "Page {{page}}",
    autoDetectCategories: true,
    defaultDocumentType: "technical"
  };
}

/**
 * Load registry with project DNA
 */
export async function loadRegistry() {
  try {
    const data = await fs.readFile(REGISTRY_PATH, "utf8");
    return JSON.parse(data);
  } catch (err) {
    if (err.code === "ENOENT") {
      return { documents: [], projectDNA: getProjectDNA(), memories: [], version: 1, lastUpdated: null };
    }
    throw err;
  }
}

/**
 * Get project DNA from registry (synchronous)
 */
export function getRegistryDNA() {
  try {
    // Try to read from registry file
    const data = fs.readFileSync(REGISTRY_PATH, "utf8");
    const registry = JSON.parse(data);
    return registry.projectDNA || getProjectDNA();
  } catch (err) {
    // If file doesn't exist, return default DNA
    return getProjectDNA();
  }
}

/**
 * Get memories from registry
 */
export async function getMemories() {
  const registry = await loadRegistry();
  return registry.memories || [];
}

/**
 * Apply project DNA to document creation input
 */
export function applyProjectDNAToDocument(input) {
  const dna = getRegistryDNA();
  
  return {
    ...input,
    stylePreset: input.stylePreset || dna.defaultStylePreset,
    header: input.header || { text: dna.defaultHeader },
    footer: input.footer || {
      text: dna.defaultFooter,
      alignment: "center"
    }
  };
}

/**
 * Apply document memories to input
 */
export async function applyMemories(input, category) {
  const memories = await getMemories();
  
  // Find memories that apply to this category or are general
  const applicableMemories = memories.filter(m => 
    !m.appliedTo || m.appliedTo.includes(category) || m.type === "document_preferences"
  );
  
  // Apply memory preferences
  let result = { ...input };
  
  for (const memory of applicableMemories) {
    if (memory.content?.stylePreset && !result.stylePreset) {
      result.stylePreset = memory.content.stylePreset;
    }
    
    if (memory.content?.headerTemplate && !result.header) {
      result.header = { text: memory.content.headerTemplate };
    }
    
    if (memory.content?.footerTemplate && !result.footer) {
      result.footer = { text: memory.content.footerTemplate };
    }
  }
  
  return result;
}

/**
 * Create a new memory in registry
 */
export async function createMemory(type, content, appliedTo = null) {
  const registry = await loadRegistry();
  
  const memory = {
    id: `memory_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    type: type,
    content: content,
    appliedTo: appliedTo || null,
    createdAt: new Date().toISOString()
  };
  
  if (!registry.memories) {
    registry.memories = [];
  }
  
  registry.memories.push(memory);
  registry.lastUpdated = new Date().toISOString();
  
  await fs.writeFile(REGISTRY_PATH, JSON.stringify(registry, null, 2));
  
  return memory;
}

/**
 * Get memories for a specific category
 */
export async function getMemoriesForCategory(category) {
  const memories = await getMemories();
  
  return memories.filter(m => 
    !m.appliedTo || m.appliedTo.includes(category)
  );
}

/**
 * Detect document type based on title and content
 */
export function detectDocumentType(title, content = "") {
  // Define keywords for each document type
  const technicalKeywords = ["specification", "api", "architecture", "technical"];
  const businessKeywords = ["report", "proposal", "business", "financial"];
  const legalKeywords = ["contract", "agreement", "nda", "legal"];
  
  // Combine title and content for analysis
  const text = `${title} ${content}`.toLowerCase();
  
  // Calculate scores for each type
  const technicalScore = technicalKeywords.reduce((sum, keyword) => {
    const regex = new RegExp(`\\b${keyword}\\b`, "gi");
    return sum + (text.match(regex)?.length || 0);
  }, 0);
  
  const businessScore = businessKeywords.reduce((sum, keyword) => {
    const regex = new RegExp(`\\b${keyword}\\b`, "gi");
    return sum + (text.match(regex)?.length || 0);
  }, 0);
  
  const legalScore = legalKeywords.reduce((sum, keyword) => {
    const regex = new RegExp(`\\b${keyword}\\b`, "gi");
    return sum + (text.match(regex)?.length || 0);
  }, 0);
  
  // Return best match
  if (technicalScore >= businessScore && technicalScore >= legalScore) {
    return { type: "technical", stylePreset: "technical" };
  }
  
  if (businessScore >= technicalScore && businessScore >= legalScore) {
    return { type: "business", stylePreset: "business" };
  }
  
  if (legalScore >= technicalScore && legalScore >= businessScore) {
    return { type: "legal", stylePreset: "legal" };
  }
  
  // Default to professional if no clear match
  return { type: "default", stylePreset: "professional" };
}

/**
 * Update project DNA in registry
 */
export async function updateProjectDNA(updatedConfig) {
  const registry = await loadRegistry();
  
  registry.projectDNA = {
    ...registry.projectDNA,
    ...updatedConfig
  };
  
  registry.lastUpdated = new Date().toISOString();
  
  await fs.writeFile(REGISTRY_PATH, JSON.stringify(registry, null, 2));
  
  return registry.projectDNA;
}

/**
 * Save document preferences as memory
 */
export async function saveDocumentPreferences(input, category) {
  // Extract style preferences from input
  const preferences = {};
  
  if (input.stylePreset) {
    preferences.stylePreset = input.stylePreset;
  }
  
  if (input.header) {
    preferences.headerTemplate = input.header.text;
  }
  
  if (input.footer) {
    preferences.footerTemplate = input.footer.text;
  }
  
  // Save as memory if we have preferences
  if (Object.keys(preferences).length > 0) {
    return await createMemory(
      "document_preferences",
      preferences,
      category ? [category] : null
    );
  }
  
  return null;
}