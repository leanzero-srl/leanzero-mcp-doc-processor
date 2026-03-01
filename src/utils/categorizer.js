/**
 * Document Categorization Utility
 * Classifies documents and determines appropriate folder structure
 */

// Category definitions with keywords for classification
const CATEGORIES = {
  contracts: {
    path: "contracts",
    description: "Legal agreements, NDA, service contracts",
    keywords: [
      "contract", "agreement", "nda", "non-disclosure",
      "service level agreement", "sla", "terms of service",
      "termination", "liability", "indemnification",
      "party", "contractor", "vendor", "client",
      "effective date", "term", "renewal"
    ]
  },
  technical: {
    path: "technical",
    description: "Technical specs, architecture docs, API documentation",
    keywords: [
      "specification", "api", "architecture", "technical",
      "implementation", "integration", "sdk", "library",
      "endpoint", "request", "response", "schema",
      "database", "model", "module", "function"
    ]
  },
  business: {
    path: "business",
    description: "Business documents, reports, proposals",
    keywords: [
      "proposal", "report", "presentation", "business",
      "financial", "marketing", "strategy", "planning",
      "budget", "forecast", "revenue", "profit"
    ]
  },
  legal: {
    path: "legal",
    description: "Legal memos, opinions, compliance documents",
    keywords: [
      "memorandum", "opinion", "compliance", "regulation",
      "statute", "case law", "precedent", "litigation",
      "regulatory", "licensure", "permit", "certificate"
    ]
  },
  meeting: {
    path: "meetings",
    description: "Meeting minutes, agendas, notes",
    keywords: [
      "meeting", "agenda", "minutes", "discussion",
      "decision", "action item", "attendees", "stakeholder"
    ]
  },
  research: {
    path: "research",
    description: "Research papers, analysis, whitepapers",
    keywords: [
      "research", "analysis", "whitepaper", "case study",
      "literature review", "hypothesis", "experiment",
      "finding", "conclusion", "abstract"
    ]
  }
};

/**
 * Classify a document based on its title and content
 * @param {string} title - Document title
 * @param {string} [content] - Document content for analysis
 * @returns {Object} Category info with path and confidence
 */
export function classifyDocument(title, content = "") {
  return classifyDocumentContent(title, content);
}

/**
 * Classify a document based on its title and content
 * @param {string} title - Document title
 * @param {string} [content] - Document content for analysis
 * @returns {Object} Category info with path and confidence
 */
export function classifyDocumentContent(title, content = "") {
  if (!title && !content) {
    return { category: "misc", path: "documents" };
  }

  const text = `${title} ${content}`.toLowerCase();
  const scores = {};

  // Score each category based on keyword matches
  for (const [category, config] of Object.entries(CATEGORIES)) {
    scores[category] = 0;
    for (const keyword of config.keywords) {
      const regex = new RegExp(`\\b${keyword}\\b`, "gi");
      const matches = text.match(regex);
      if (matches) {
        scores[category] += matches.length;
      }
    }
  }

  // Find best match
  let bestCategory = "misc";
  let maxScore = 0;
  for (const [category, score] of Object.entries(scores)) {
    if (score > maxScore) {
      maxScore = score;
      bestCategory = category;
    }
  }

  // Determine confidence based on match strength
  const hasTitleMatch = CATEGORIES[bestCategory]?.keywords.some(k =>
    title.toLowerCase().includes(k)
  );

  const confidence = maxScore >= 3 ? "high" : maxScore === 1 || hasTitleMatch ? "medium" : "low";

  // Calculate total score for relative confidence
  const totalScore = Object.values(scores).reduce((sum, s) => sum + s, 0);
  
  // Return comprehensive classification with confidence
  return {
    category: bestCategory,
    path: CATEGORIES[bestCategory]?.path || "documents",
    confidence: confidence,
    scores: scores,
    confidenceLevel: confidence, // alias for backward compatibility
    categoryInfo: {
      name: bestCategory,
      description: CATEGORIES[bestCategory]?.description || "",
      path: CATEGORIES[bestCategory]?.path || "documents",
    },
    confidenceExplanation: maxScore === 0 
      ? "No category keywords found in title or content" 
      : confidence === "high" 
        ? `Strong match: ${maxScore} keyword matches found` 
        : confidence === "medium" 
          ? `Moderate match: ${maxScore} keyword match(es) found` 
          : `Weak match: ${maxScore} keyword match(es) found`,
    topCategories: Object.entries(scores)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([cat, score]) => ({ category: cat, score: score, isBest: cat === bestCategory })),
  };
}

/**
 * Get category information by name
 */
export function getCategoryInfo(categoryName) {
  return CATEGORIES[categoryName] || null;
}

/**
 * Get all available categories
 */
export function getAvailableCategories() {
  return Object.keys(CATEGORIES).map(key => ({
    name: key,
    path: CATEGORIES[key].path,
    description: CATEGORIES[key].description
  }));
}

/**
 * Extract key clauses from contract-like text
 * @param {string} content - Document content
 * @returns {Object} Extracted clause types and their text
 */
export function extractContractClauses(content) {
  if (!content || typeof content !== "string") return {};

  const clauses = {};

  // Common contract clause patterns
  const clausePatterns = {
    liability: /(?:liability|limitation of liability|indemnification).*?(?:\.|\n)/gi,
    termination: /(?:termination|terminat\w+)\s+(?:of|this\s+agreement).{0,100}/gi,
    confidentiality: /(?:confidential|non-disclosure|nda).*?(?:\.|\n)/gi,
    payment: /(?:payment|fee| compensation).{0,100}/gi,
    warranty: /(?:warranty|guarantee).{0,100}/gi,
    intellectual: /(?:intellectual property|ip|ownership).{0,100}/gi,
    govern: /(?:governing law|jurisdiction|venue).{0,100}/gi
  };

  for (const [clauseType, pattern] of Object.entries(clausePatterns)) {
    const matches = content.match(pattern);
    if (matches && matches.length > 0) {
      // Clean and deduplicate
      clauses[clauseType] = [...new Set(
        matches.map(m => m.trim().replace(/\s+/g, " "))
      )].slice(0, 3); // Keep up to 3 examples
    }
  }

  return clauses;
}

/**
 * Compare two documents for similarity
 * @param {string} title1 - First document title
 * @param {string} content1 - First document content
 * @param {string} title2 - Second document title
 * @param {string} content2 - Second document content
 * @returns {Object} Similarity analysis with duplicate risk level
 */
export function compareDocuments(title1, content1, title2, content2) {
  const text1 = `${title1} ${content1}`.toLowerCase();
  const text2 = `${title2} ${content2}`.toLowerCase();

  // Get word sets
  const words1 = new Set(text1.replace(/[^\w\s]/g, "").split(/\s+/).filter(w => w.length > 3));
  const words2 = new Set(text2.replace(/[^\w\s]/g, "").split(/\s+/).filter(w => w.length > 3));

  // Calculate overlap
  const commonWords = [...words1].filter(w => words2.has(w));
  const allWords = new Set([...words1, ...words2]);

  const jaccardIndex = allWords.size > 0 ? commonWords.length / allWords.size : 0;

  return {
    jaccardSimilarity: parseFloat(jaccardIndex.toFixed(3)),
    commonWordCount: commonWords.length,
    duplicateRisk: jaccardIndex > 0.5 ? "high" : jaccardIndex > 0.2 ? "medium" : "low"
  };
}
