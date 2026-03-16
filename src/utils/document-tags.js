/**
 * Document Tags System - Enables MCP AI models to understand and generate
 * beautiful, Claude-style professional documents.
 *
 * This system provides:
 * 1. Tag-based document classification (e.g., "claude-like", "marketing", "technical")
 * 2. Automatic style preset selection based on document purpose
 * 3. Template mapping for common document types
 * 4. Visual appearance descriptions for AI guidance
 */

/**
 * Color palettes for consistent theming across documents
 */
export const COLORS = {
  // Primary brand colors (Claude-inspired)
  PRIMARY: {
    BLUE: "1F4E79",      // Main brand blue
    LIGHT_BLUE: "2B579A", // Lighter accent
    DARK_BLUE: "3A5F8F",  // Darker variant
    EXTRA_LIGHT: "D6E4ED",
  },
  
  // Background colors
  BACKGROUND: {
    WHITE: "FFFFFF",
    OFF_WHITE: "F8F9FA",
    LIGHT_GRAY: "F2F2F2",
    GRAY: "E5E5E5",
    DARK_GRAY: "333333",
  },
  
  // Text colors
  TEXT: {
    PRIMARY: "1A1A1A",
    SECONDARY: "4A4A4A",
    LIGHT: "6B6B6B",
    EXTRA_LIGHT: "888888",
    WHITE: "FFFFFF",
  },
  
  // Status/error colors
  STATUS: {
    SUCCESS: "2E8B57",      // Sea green
    WARNING: "FFA500",      // Orange
    DANGER: "DC143C",       // Crimson
    INFO: "1F4E79",         // Blue
  },
  
  // Table styling colors
  TABLE: {
    HEADER_BG: "1F4E79",
    HEADER_TEXT: "FFFFFF",
    ZEBRA_BG: "F8F9FA",
    BORDER: "D0D7DE",
    LIGHT_BORDER: "E1E5EA",
  },
  
  // Code block colors
  CODE: {
    BACKGROUND: "F6F8FA",
    BORDER: "E3E8ED",
    TEXT: "24292E",
    KEYWORD: "D73A49",
    STRING: "50A54F",
    FUNCTION: "6F42C1",
  },
  
  // Section divider colors
  DIVIDER: {
    PRIMARY: "1F4E79",
    LIGHT: "CCCCCC",
    EXTRA_LIGHT: "E0E0E0",
  },
};

/**
 * Document templates with predefined structure and styling
 */
export const TEMPLATES = {
  /**
   * Claude-like professional document template
   * Clean, modern, blue-themed documents with excellent visual hierarchy
   */
  "claude-like": {
    name: "Claude-Like Professional",
    description: "Clean, modern professional documents with beautiful blue accents and excellent typography",
    stylePreset: "professional",
    colorTheme: "blue-primary",
    features: [
      "boxed-sections",
      "subtle-dividers",
      "icon-badges",
      "info-table-layout",
      "consistent-spacing"
    ],
    structure: {
      titleLevel: "heading1",
      hasCoverPage: false,
      hasTableOfContents: true,
      sectionSpacing: "loose",
    },
    recommendedFor: [
      "Blog posts",
      "Technical documentation",
      "Product announcements",
      "Engineering reports"
    ]
  },

  /**
   * Marketing/ promotional document template
   */
  "marketing": {
    name: "Marketing Promotion",
    description: "Vibrant, engaging documents for marketing campaigns and product launches",
    stylePreset: "colorful",
    colorTheme: "brand-orange",
    features: [
      "bold-headers",
      "highlighted-sections",
      "call-to-action-boxes"
    ],
    recommendedFor: ["Marketing materials", "Product launches", "Presentations"]
  },

  /**
   * Technical documentation template
   */
  "technical-docs": {
    name: "Technical Documentation",
    description: "Clear, structured technical documents with excellent code formatting",
    stylePreset: "technical",
    colorTheme: "dark-text",
    features: [
      "code-blocks",
      "step-by-step-instructions",
      "diagram-annotations"
    ],
    recommendedFor: ["API docs", "Developer guides", "Technical specs"]
  },

  /**
   * Business report template
   */
  "business-report": {
    name: "Business Report",
    description: "Professional business documents with executive summary and data presentation",
    stylePreset: "business",
    colorTheme: "corporate-blue",
    features: [
      "executive-summary",
      "data-tables",
      "action-items"
    ],
    recommendedFor: ["Reports", "Proposals", "Presentations"]
  },

  /**
   * Legal document template
   */
  "legal": {
    name: "Legal Document",
    description: "Formal legal documents with double spacing and proper hierarchy",
    stylePreset: "legal",
    colorTheme: "black-white",
    features: [
      "double-spaced",
      "section-numbering",
      "defined-terms"
    ],
    recommendedFor: ["Contracts", "Agreements", "Legal notices"]
  },
};

/**
 * Tag to template mapping
 */
export const TAG_TO_TEMPLATE = {
  // Claude-like document tags
  "claude": "claude-like",
  "claude-like": "claude-like",
  "professional": "claude-like",
  "modern-doc": "claude-like",

  // Marketing tags
  "marketing": "marketing",
  "promo": "marketing",
  "launch": "marketing",
  "announcement": "marketing",

  // Technical tags
  "technical": "technical-docs",
  "api": "technical-docs",
  "developer": "technical-docs",
  "docs": "technical-docs",
  "code": "technical-docs",

  // Business tags
  "business": "business-report",
  "report": "business-report",
  "proposal": "business-report",
  "presentation": "business-report",

  // Legal tags
  "legal": "legal",
  "contract": "legal",
  "agreement": "legal",
};

/**
 * Get template by tag
 */
export function getTemplateByTag(tag) {
  return TAG_TO_TEMPLATE[tag?.toLowerCase()] || null;
}

/**
 * Get all available templates
 */
export function getAvailableTemplates() {
  return Object.entries(TEMPLATES).map(([key, value]) => ({
    key,
    ...value
  }));
}

/**
 * Find matching template for document based on content analysis
 */
export function findMatchingTemplate(title = "", content = "", tags = []) {
  // First check explicit tags
  if (Array.isArray(tags)) {
    for (const tag of tags) {
      const templateKey = TAG_TO_TEMPLATE[tag?.toLowerCase()];
      if (templateKey) return TEMPLATES[templateKey];
    }
  }

  // Then analyze title/content
  const combinedText = `${title} ${content}`.toLowerCase();

  const matches = [
    { template: "claude-like", keywords: ["blog", "post", "article", "documentation", "guide"] },
    { template: "marketing", keywords: ["launch", "promotion", "offer", "deal", "sale"] },
    { template: "technical-docs", keywords: ["api", "developer", "code", "integration", "endpoint"] },
    { template: "business-report", keywords: ["report", "summary", "analysis", "q1", "q2", "quarterly"] },
    { template: "legal", keywords: ["agreement", "contract", "terms", "conditions", "license"] }
  ];

  for (const match of matches) {
    if (match.keywords.some(keyword => combinedText.includes(keyword))) {
      return TEMPLATES[match.template];
    }
  }

  // Default to Claude-like for unknown documents
  return TEMPLATES["claude-like"];
}

/**
 * Generate document style configuration from template
 */
export function generateStyleFromTemplate(templateKey) {
  const template = TEMPLATES[templateKey];

  if (!template) {
    return {
      preset: "minimal",
      colors: COLORS.PRIMARY,
      features: []
    };
  }

  // Extract color theme
  let colorTheme = COLORS.PRIMARY;
  switch (template.colorTheme) {
    case "brand-orange":
      colorTheme = { PRIMARY: "E65100", LIGHT: "FF9800" };
      break;
    case "corporate-blue":
      colorTheme = { PRIMARY: "1F4E79", LIGHT: "2B579A" };
      break;
    case "black-white":
      colorTheme = { PRIMARY: "000000", LIGHT: "333333" };
      break;
    default:
      colorTheme = COLORS.PRIMARY;
  }

  return {
    preset: template.stylePreset,
    colors: colorTheme,
    features: template.features,
    recommendedFor: template.recommendedFor
  };
}

/**
 * Get descriptions for all templates (for AI guidance)
 */
export function getTemplateDescriptions() {
  return Object.entries(TEMPLATES).map(([key, template]) => ({
    tag: key,
    name: template.name,
    description: template.description,
    stylePreset: template.stylePreset,
    recommendedFor: template.recommendedFor?.join(", ") || "General use"
  }));
}