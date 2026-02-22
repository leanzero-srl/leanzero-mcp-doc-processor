# AI Guidance System for Automatic Document Creation

## Overview
The AI guidance system enables the MCP to automatically create documents based on context, without requiring explicit user requests. This system uses "Project DNA" stored in the registry to guide document creation decisions.

## Project DNA

### What is Project DNA?
Project DNA is a set of default document preferences that the AI uses to make stylistic decisions. This eliminates the need for users to manually specify style presets, headers, footers, and other document formatting options.

### DNA Configuration
The Project DNA is stored in `docs/registry.json`:

```json
{
  "projectDNA": {
    "defaultStylePreset": "technical",
    "defaultHeader": "Technical Document",
    "defaultFooter": "Page {{page}}",
    "autoDetectCategories": true,
    "defaultDocumentType": "technical"
  }
}
```

### DNA Components
- **defaultStylePreset**: Default style preset for new documents (minimal, professional, technical, legal, business, casual, colorful)
- **defaultHeader**: Default header text for new documents
- **defaultFooter**: Default footer template (use {{page}} for page numbers)
- **autoDetectCategories**: Enable automatic category detection based on content
- **defaultDocumentType**: Default document type for auto-detection

## Document Type Detection

The system automatically detects document types based on keywords in title and content:

### Technical Documents
Keywords: specification, api, architecture, technical, implementation, integration, sdk, library, endpoint, request, response, schema

Default Style: technical (Arial font with clear hierarchy)

### Business Documents
Keywords: report, proposal, business, financial, marketing, strategy, planning

Default Style: business (Calibri with modern blue palette)

### Legal Documents
Keywords: contract, agreement, nda, legal, memorandum, compliance, regulation

Default Style: legal (Times New Roman with double spacing)

### Default Documents
If no clear category match is found, the system uses "professional" style (Garamond serif with full justification)

## How It Works

### Vibe Coding / Research Workflow
1. User starts working on something (coding, research, etc.)
2. AI detects need for documentation
3. AI automatically calls `createDoc` with minimal parameters (title, content)
4. System applies Project DNA preferences:
   - Style preset: automatic based on detected document type
   - Header: template from DNA
   - Footer: template with page numbers
5. Document created with proper styling without user input

### Example: Automatic Document Creation
```javascript
// User is coding and AI detects need for documentation
const input = {
  title: "API Architecture Documentation",
  paragraphs: ["Content about API endpoints..."]
};

// System automatically:
// 1. Detects document type (technical)
// 2. Applies style preset (technical)
// 3. Uses default header
// 4. Uses default footer with page numbers

const result = applyProjectDNAToDocument(input);
// Result includes stylePreset, header, footer from DNA
```

### Explicit Overrides
Users can still explicitly specify preferences when needed:

```javascript
createDoc({
  title: "Custom Document",
  paragraphs: ["Content"],
  stylePreset: "professional", // Override DNA default
  header: { text: "Custom Header" }, // Override DNA default
  footer: { text: "Page {{page}} of {{total}}" } // Override DNA default
})
```

## Memory System

### What are Memories?
Memories store user preferences that are automatically applied to future documents. When you explicitly specify styling options, they're saved as memories for consistent styling across documents.

### Memory Structure
```json
{
  "memories": [
    {
      "id": "memory_1",
      "type": "document_preferences",
      "content": {
        "stylePreset": "professional",
        "headerTemplate": "Technical Documentation",
        "footerTemplate": "{{page}}"
      },
      "appliedTo": ["technical"],
      "createdAt": "2026-02-22T..."
    }
  ]
}
```

### Memory Features
- **type**: Document preferences type
- **content**: Styling options (stylePreset, headerTemplate, footerTemplate)
- **appliedTo**: Categories where this memory applies
- **createdAt**: When the memory was created

### Using Memories
When creating documents, the system automatically applies memories that match the document's category:

```javascript
// If you previously saved a professional style preference for technical documents
// Future technical documents will automatically use that styling

const input = { title: "Technical Doc", paragraphs: ["Content"] };
// System automatically applies:
// - stylePreset from memory (professional)
// - headerTemplate from memory
// - footerTemplate from memory
```

## AI Instructions

When the AI works with this project, it should:

1. **Check Project DNA**: Use `getProjectDNA()` to get default preferences
2. **Auto-Detect Document Type**: Use `detectDocumentType(title, content)` to determine appropriate style
3. **Apply DNA Preferences**: Use `applyProjectDNAToDocument(input)` to add default styling
4. **Save Preferences as Memories**: Use `saveDocumentPreferences(input, category)` to store user preferences
5. **Auto-Generate Headers/Footers**: If not specified, use DNA defaults

## Usage Examples

### Example 1: Technical Document Creation
```javascript
import { getProjectDNA, detectDocumentType, applyProjectDNAToDocument } from './src/utils/dna-manager.js';

// User starts working on something that needs documentation
const input = {
  title: "API Architecture Specification",
  paragraphs: [
    "This document describes the API architecture...",
    "## Core Components",
    "### Endpoint Structure"
  ]
};

// AI detects document type
const detection = detectDocumentType(input.title, input.paragraphs.join(' '));
// { type: "technical", stylePreset: "technical" }

// AI applies DNA preferences
const result = applyProjectDNAToDocument(input);
// Result includes: stylePreset, header, footer from DNA
```

### Example 2: Business Document Creation
```javascript
// User creates a business report
const input = {
  title: "Q1 Financial Report",
  paragraphs: [
    "This report covers Q1 financial results...",
    "## Revenue Analysis",
    "### Key Metrics"
  ]
};

// AI detects document type
const detection = detectDocumentType(input.title, input.paragraphs.join(' '));
// { type: "business", stylePreset: "business" }

// AI applies DNA preferences
const result = applyProjectDNAToDocument(input);
// Result includes: stylePreset (business), header, footer from DNA
```

### Example 3: Legal Document Creation
```javascript
// User creates a contract document
const input = {
  title: "Service Agreement",
  paragraphs: [
    "This Service Agreement governs the relationship...",
    "## Terms of Service",
    "### Liability provisions"
  ]
};

// AI detects document type
const detection = detectDocumentType(input.title, input.paragraphs.join(' '));
// { type: "legal", stylePreset: "legal" }

// AI applies DNA preferences
const result = applyProjectDNAToDocument(input);
// Result includes: stylePreset (legal), header, footer from DNA
```

## Key Functions

### `getProjectDNA()`
Get current Project DNA configuration:
```javascript
const dna = getProjectDNA();
// { defaultStylePreset, defaultHeader, defaultFooter, autoDetectCategories, defaultDocumentType }
```

### `detectDocumentType(title, content)`
Auto-detect document type based on keywords:
```javascript
const detection = detectDocumentType("Technical Specification", "API architecture");
// { type: "technical", stylePreset: "technical" }
```

### `applyProjectDNAToDocument(input)`
Apply DNA preferences to document input:
```javascript
const result = applyProjectDNAToDocument({ title: "Doc", paragraphs: ["Content"] });
// Adds stylePreset, header, footer from DNA
```

### `saveDocumentPreferences(input, category)`
Save document preferences as memory:
```javascript
const memory = saveDocumentPreferences({ stylePreset: "professional" }, "technical");
// Saves to registry as memory
```

## Benefits

1. **No Explicit Requests Needed**: AI automatically creates documents during workflows
2. **Consistent Styling**: All documents follow project DNA preferences
3. **Automatic Category Detection**: Document type automatically determines appropriate styling
4. **User Preference Learning**: Explicit styling choices are remembered for future documents
5. **No Manual Configuration**: Users don't need to specify style presets, headers, footers