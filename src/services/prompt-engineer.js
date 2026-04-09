/**
 * Prompt Engineer Service
 *
 * Optimizes vision prompts for 8B VL models using:
 * - Task decomposition (multi-stage extraction)
 * - Few-shot examples for document types
 * - XML-structured output enforcement
 * - Chain-of-Thought prompting
 *
 * Designed specifically for small vision-language models (8B parameters)
 * that struggle with multi-step tasks and unstructured outputs.
 */

/**
 * Document type classification
 */
const DOCUMENT_TYPES = {
  INVOICE: {
    id: "invoice",
    name: "Invoice",
    keywords: ["invoice", "bill", "receipt", "charge", "payment"],
    sections: ["header", "vendor", "customer", "items", "totals", "footer"],
  },
  CONTRACT: {
    id: "contract",
    name: "Contract",
    keywords: ["agreement", "contract", "party", "term", "liability"],
    sections: [
      "header",
      "parties",
      "recitals",
      "terms",
      "clauses",
      "signatures",
    ],
  },
  REPORT: {
    id: "report",
    name: "Report",
    keywords: ["report", "analysis", "summary", "findings", "recommendation"],
    sections: ["executive-summary", "introduction", "body", "conclusion"],
  },
  FORM: {
    id: "form",
    name: "Form",
    keywords: ["form", "application", "application", "field", "input"],
    sections: ["header", "fields", "instructions", "footer"],
  },
  LETTER: {
    id: "letter",
    name: "Letter",
    keywords: ["dear", "sincerely", "regards", "letter"],
    sections: ["header", "salutation", "body", "closing", "signature"],
  },
  RESUME: {
    id: "resume",
    name: "Resume/CV",
    keywords: ["resume", "cv", "curriculum", "experience", "education"],
    sections: [
      "personal",
      "summary",
      "experience",
      "education",
      "skills",
      "projects",
    ],
  },
  GENERIC: {
    id: "generic",
    name: "Generic Document",
    keywords: [],
    sections: ["body"],
  },
};

/**
 * Few-shot examples for different document types
 */
const FEW_SHOT_EXAMPLES = {
  invoice: `Example Invoice Output:

<document type="invoice">
  <header>
    <field name="documentType">INVOICE</field>
    <field name="invoiceNumber">INV-2024-001</field>
    <field name="date">2024-01-15</field>
  </header>
  <vendor>
    <field name="name">Acme Corporation</field>
    <field name="address">123 Main St, City, State 12345</field>
    <field name="taxId">12-3456789</field>
  </vendor>
  <customer>
    <field name="name">Global Solutions Inc</field>
    <field name="address">456 Oak Ave, Town, State 67890</field>
    <field name="accountNumber">CUST-12345</field>
  </customer>
  <items>
    <item>
      <field name="description">Consulting Services</field>
      <field name="quantity">10</field>
      <field name="unitPrice">150.00</field>
      <field name="totalPrice">1500.00</field>
    </item>
  </items>
  <totals>
    <field name="subtotal">1500.00</field>
    <field name="tax">150.00</field>
    <field name="total">1650.00</field>
  </totals>
</document>`,


  contract: `Example Contract Output:

<document type="contract">
  <header>
    <field name="documentType">SERVICE AGREEMENT</field>
    <field name="agreementDate">2024-01-01</field>
  </header>
  <parties>
    <party type="client">
      <field name="name">Tech Corp</field>
      <field name="address">789 Business Blvd</field>
    </party>
    <party type="provider">
      <field name="name">Consulting Services LLC</field>
      <field name="address">321 Professional Way</field>
    </party>
  </parties>
  <terms>
    <term>
      <field name="title">Scope of Work</field>
      <field name="content">Provider shall deliver consulting services as described in Exhibit A.</field>
    </term>
    <term>
      <field name="title">Term</field>
      <field name="content">This agreement shall commence on January 1, 2024 and continue for one year.</field>
    </term>
  </terms>
</document>`,


  report: `Example Report Output:

<document type="report">
  <header>
    <field name="documentType">ANALYTICS REPORT</field>
    <field name="title">Q1 2024 Performance Analysis</field>
    <field name="date">2024-04-15</field>
  </header>
  <executive-summary>
    <paragraph>The Q1 2024 performance shows significant growth in user acquisition and revenue. Total revenue increased by 25% compared to Q4 2023.</paragraph>
  </executive-summary>
  <body>
    <section title="User Growth">
      <paragraph>User acquisition increased by 15% this quarter, driven by successful marketing campaigns.</paragraph>
    </section>
    <section title="Revenue Analysis">
      <paragraph>Revenue reached $2.5M, a 25% increase from the previous quarter.</paragraph>
    </section>
  </body>
  <conclusion>
    <paragraph>The company is on track to exceed annual targets. Recommended actions include expanding marketing efforts and improving customer retention.</paragraph>
  </conclusion>
</document>`,


  form: `Example Form Output:

<document type="form">
  <header>
    <field name="formName">EMPLOYMENT APPLICATION</field>
    <field name="version">2.0</field>
  </header>
  <fields>
    <field type="text" name="fullName">John Doe</field>
    <field type="text" name="email">john.doe@example.com</field>
    <field type="text" name="phone">(555) 123-4567</field>
    <field type="text" name="address">123 Main Street, City, State 12345</field>
    <field type="date" name="startDate">2024-02-01</field>
  </fields>
  <instructions>Please fill out all fields marked with *</instructions>
</document>`,


  letter: `Example Letter Output:

<document type="letter">
  <header>
    <field name="senderAddress">123 Business Road</field>
    <field name="senderCity">City, State 12345</field>
    <field name="date">January 15, 2024</field>
  </header>
  <salutation>Dear Mr. Smith,</salutation>
  <body>
    <paragraph>I am writing to express my interest in the position advertised. With my background in software development and project management, I believe I would be a strong fit for your team.</paragraph>
    <paragraph>I have over five years of experience in the industry and have successfully led multiple projects from conception to completion.</paragraph>
  </body>
  <closing>Sincerely,</closing>
  <signature>John Anderson</signature>
</document>`,


  resume: `Example Resume Output:

<document type="resume">
  <personal>
    <field name="fullName">Jane Smith</field>
    <field name="email">jane.smith@example.com</field>
    <field name="phone">(555) 987-6543</field>
    <field name="linkedin">linkedin.com/in/janesmith</field>
  </personal>
  <summary>Experienced software engineer with 7+ years of experience in full-stack development. Proven track record of delivering high-quality software products.</summary>
  <experience>
    <job>
      <field name="company">Tech Solutions Inc</field>
      <field name="title">Senior Software Engineer</field>
      <field name="dates">2020-2024</field>
      <paragraph>Lead development of enterprise applications using React and Node.js. Managed team of 5 developers.</paragraph>
    </job>
  </experience>
  <education>
    <degree>
      <field name="institution">University of Technology</field>
      <field name="degree">Bachelor of Science in Computer Science</field>
      <field name="graduationYear">2019</field>
    </degree>
  </education>
  <skills>
    <skill>JavaScript/TypeScript</skill>
    <skill>React/Angular</skill>
    <skill>Node.js/Python</skill>
  </skills>
</document>`,


  generic: `Example Generic Document Output:

<document type="generic">
  <body>
    <section title="Introduction">
      <paragraph>This is a generic document with no specific structure. The content provides general information about the topic.</paragraph>
    </section>
    <section title="Main Content">
      <paragraph>The main content section contains the primary information of the document. It may include multiple paragraphs and subsections.</paragraph>
      <paragraph>Additional information is provided here to support the main points of the document.</paragraph>
    </section>
  </body>
</document>`,
};

/**
 * Chain-of-Thought prompts for different extraction stages
 */
const CHAIN_OF_THOUGHT = {
  stage1_layout: `Step 1: Document Type Identification
- Look for keywords, layout patterns, and structural elements
- Identify if this is an invoice, contract, report, form, letter, resume, or other
- Consider: headers, tables, section markers, formatting patterns

Step 2: Structure Analysis
- Identify all major sections (headers, body, tables, footers)
- Locate text regions and their hierarchical relationships
- Note any special elements (tables, code blocks, lists)

Step 3: Region Classification
- Classify each region by type (header, body text, table, image caption)
- Identify reading order (top-to-bottom, left-to-right for LTR languages)

Let me think through this document...`,

  stage2_extraction: `Step 1: Extract from headers first
- Document title/type
- Dates, numbers, IDs
- Vendor/Customer information

Step 2: Extract body content section by section
- Preserve paragraph boundaries
- Maintain logical reading order
- Note any formatting (bold, italics, underlines if visible)

Step 3: Extract tables using XML format
- Each row as <row> element
- Each cell as <cell> element with appropriate attributes

Step 4: Extract lists and special elements
- Preserve list hierarchy (numbered/bulleted)
- Note any special formatting

Let me extract the content systematically...`,

  stage3_assembly: `Step 1: Review extracted sections for completeness
- Verify all sections are captured
- Check for missing information

Step 2: Validate XML structure
- Ensure all tags are properly closed
- Verify nesting hierarchy

Step 3: Final review for coherence
- Does the structure make sense?
- Are there any inconsistencies?

Output the final structured XML...`,
};

/**
 * Document type classifier
 */
export class DocumentTypeClassifier {
  /**
   * Classify document type based on content analysis
   * @param {string} text - Text content to analyze
   * @param {Object|null} layoutAnalysis - Optional layout analysis results
   * @returns {Object} Classification result with type and confidence
   */
  static classify(text, layoutAnalysis = null) {
    const lowerText = (text || "").toLowerCase();
    
    let bestType = DOCUMENT_TYPES.GENERIC;
    let highestScore = 0;

    for (const docType of Object.values(DOCUMENT_TYPES)) {
      let score = 0;
      
      // Keyword matching
      for (const keyword of docType.keywords) {
        if (lowerText.includes(keyword)) {
          score += 10;
        }
      }

      // Layout-based hints
      if (layoutAnalysis && layoutAnalysis.structureType) {
        if (docType.id === "invoice" && 
            (layoutAnalysis.structureType === "structured-document" || 
             layoutAnalysis.structureType === "text-dense-document")) {
          score += 5;
        }
      }

      // Document type specific patterns
      if (docType.id === "invoice") {
        const invoicePatterns = [
          /invoice\s*#?\s*\d+/i,
          /bill\s+to/i,
          /total\s+\d+/i,
          /amount\s+due/i,
        ];
        for (const pattern of invoicePatterns) {
          if (pattern.test(lowerText)) score += 15;
        }
      }

      if (docType.id === "contract") {
        const contractPatterns = [
          /agreement\s+between/i,
          /party\s+of\s+the\s+first/i,
          /liability/i,
          /term\s+and\s+condition/i,
        ];
        for (const pattern of contractPatterns) {
          if (pattern.test(lowerText)) score += 15;
        }
      }

      if (docType.id === "resume") {
        const resumePatterns = [
          /professional\s+experience/i,
          /education/i,
          /skill/i,
          /curriculum\s+vita[i]?/i,
        ];
        for (const pattern of resumePatterns) {
          if (pattern.test(lowerText)) score += 15;
        }
      }

      if (score > highestScore) {
        highestScore = score;
        bestType = docType;
      }
    }

    // Determine confidence level
    let confidence = "low";
    if (highestScore >= 30) confidence = "high";
    else if (highestScore >= 15) confidence = "medium";

    return {
      type: bestType,
      typeId: bestType.id,
      confidence,
      score: highestScore,
    };
  }
}

/**
 * Prompt Engineer Service
 */
export class PromptEngineer {
  constructor() {
    this.name = "PromptEngineer";
    
    // Temperature settings for different tasks
    // Lower temps (0.1-0.3) for extraction tasks (more deterministic)
    // Higher temps (0.5-0.7) for analysis/generation tasks
    this.extractionTemperature = 0.3;
    this.analysisTemperature = 0.5;
    
    // Output format preference
    this.outputFormat = "xml"; // Default to XML for 8B models
    
    // Enable chain-of-thought prompting
    this.enableCoT = true;
    
    // Enable few-shot examples
    this.enableFewShot = true;
    
    // Task decomposition stages
    this.stages = ["layout", "extraction", "assembly"];
  }

  /**
   * Generate optimized prompt for document extraction
   * @param {string} imageData - Base64 image data URL
   * @param {Object} options - Extraction options
   * @returns {Object} Optimized prompt configuration
   */
  generateExtractionPrompt(imageData, options = {}) {
    const {
      textHint = "",
      layoutAnalysis = null,
      documentType = null,
      customInstructions = "",
    } = options;

    // Step 1: Classify document type
    const classification = documentType 
      ? { type: documentType, typeId: documentType.id, confidence: "explicit" }
      : DocumentTypeClassifier.classify(textHint, layoutAnalysis);

    // Step 2: Build the prompt with Chain-of-Thought
    const promptParts = [];

    // System role instruction
    promptParts.push(this._buildSystemInstruction(classification));

    // Task decomposition with CoT if enabled
    if (this.enableCoT) {
      promptParts.push(CHAIN_OF_THOUGHT.stage1_layout);
      promptParts.push("\n");
    }

    // Document-specific examples with few-shot if enabled
    if (this.enableFewShot && FEW_SHOT_EXAMPLES[classification.typeId]) {
      promptParts.push(FEW_SHOT_EXAMPLES[classification.typeId]);
      promptParts.push("\n");
    }

    // Current document instruction
    promptParts.push(this._buildCurrentDocumentInstruction(customInstructions));

    const fullPrompt = promptParts.join("\n\n");

    return {
      imageData,
      systemInstruction: this._buildSystemInstruction(classification),
      userPrompt: fullPrompt,
      documentType: classification.typeId,
      confidence: classification.confidence,
      temperature: this.extractionTemperature,
    };
  }

  /**
   * Generate multi-stage extraction prompt for task decomposition
   * @param {string} imageData - Base64 image data URL
   * @param {Object} options - Extraction options
   * @returns {Array<Object>} Array of prompts for each stage
   */
  generateTaskDecompositionPrompts(imageData, options = {}) {
    const prompts = [];
    
    // Stage 1: Layout Detection
    prompts.push({
      stage: "layout",
      temperature: this.analysisTemperature,
      prompt: `Analyze the document structure. Identify:
1. Document type (invoice, contract, report, form, letter, resume)
2. All major structural elements (headers, body regions, tables)
3. Reading order for text regions

Output in XML format:
<layout>
  <documentType confidence="high|medium|low">type</documentType>
  <regions count="N">
    <region id="1" type="header|body|table|footer" order="N">
      description of region content
    </region>
  </regions>
</layout>

Now analyze this document:`
    });

    // Stage 2: Text Extraction (for each region)
    prompts.push({
      stage: "extraction",
      temperature: this.extractionTemperature,
      prompt: `Extract text from the document following this structure:

${this.enableCoT ? CHAIN_OF_THOUGHT.stage2_extraction : ""}

Extract content in XML format:
<document type="detected_type">
  <header>
    [extracted header content]
  </header>
  <body>
    [extracted body content with section hierarchy]
  </body>
</document>

Extract the content now:`
    });

    // Stage 3: Structure Assembly
    prompts.push({
      stage: "assembly",
      temperature: this.extractionTemperature,
      prompt: `Review and refine the extracted content. Ensure:
1. All sections are complete
2. XML structure is valid
3. Content follows logical order

Final output format:
<document type="final_type">
  [complete structured content]
</document>

Assemble the final document:`
    });

    return prompts;
  }

  /**
   * Generate XML output schema for document type
   * @param {string} typeId - Document type ID
   * @returns {Object} XML schema structure
   */
  getXmlSchema(typeId) {
    const schemas = {
      invoice: {
        root: "document",
        attributes: { type: "invoice" },
        children: [
          { name: "header", children: ["field"] },
          { name: "vendor", children: ["field"] },
          { name: "customer", children: ["field"] },
          { name: "items", children: [{ name: "item", children: ["field"] }] },
          { name: "totals", children: ["field"] },
        ],
      },
      contract: {
        root: "document",
        attributes: { type: "contract" },
        children: [
          { name: "header", children: ["field"] },
          { name: "parties", children: [{ name: "party", children: ["field"] }] },
          { name: "terms", children: [{ name: "term", children: ["field"] }] },
        ],
      },
      report: {
        root: "document",
        attributes: { type: "report" },
        children: [
          { name: "header", children: ["field"] },
          { name: "executive-summary", children: ["paragraph"] },
          { name: "body", children: [{ name: "section", attributes: ["title"], children: ["paragraph"] }] },
          { name: "conclusion", children: ["paragraph"] },
        ],
      },
      form: {
        root: "document",
        attributes: { type: "form" },
        children: [
          { name: "header", children: ["field"] },
          { name: "fields", children: [{ name: "field", attributes: ["type", "name"] }] },
          { name: "instructions", children: [] },
        ],
      },
      letter: {
        root: "document",
        attributes: { type: "letter" },
        children: [
          { name: "header", children: ["field"] },
          { name: "salutation", children: [] },
          { name: "body", children: ["paragraph"] },
          { name: "closing", children: [] },
          { name: "signature", children: [] },
        ],
      },
      resume: {
        root: "document",
        attributes: { type: "resume" },
        children: [
          { name: "personal", children: ["field"] },
          { name: "summary", children: [] },
          { name: "experience", children: [{ name: "job", children: ["field", "paragraph"] }] },
          { name: "education", children: [{ name: "degree", children: ["field"] }] },
          { name: "skills", children: ["skill"] },
        ],
      },
    };

    return schemas[typeId] || {
      root: "document",
      children: [{ name: "body", children: ["paragraph"] }],
    };
  }

  /**
   * Build system instruction for OCR task
   */
  _buildSystemInstruction(classification) {
    const typeInfo = classification.type;
    
    return `You are an expert OCR and document structure extraction specialist. Your task is to accurately extract text from images while preserving the original structure.

Document Type: ${typeInfo.name} (${typeInfo.id})
Confidence: ${classification.confidence}

Output Format:
- Use XML format exclusively for structured output
- Preserve all document hierarchy and structure
- Include all visible text with accurate representation

Key Instructions:
1. Extract ALL visible text from the image
2. Maintain document structure using XML hierarchy
3. For tables, use proper XML table structure with rows and cells
4. Preserve section boundaries and heading levels
5. Handle multiple languages if present

Output must be valid XML with proper nesting.`;
  }

  /**
   * Build current document instruction
   */
  _buildCurrentDocumentInstruction(customInstructions = "") {
    let instruction = `Extract the text and structure from this document image. Follow the output format demonstrated in the examples above.

If you encounter any unclear or ambiguous content, note it with a comment.`;

    if (customInstructions) {
      instruction += `\n\nAdditional Instructions:\n${customInstructions}`;
    }

    return instruction;
  }

  /**
   * Generate refinement prompt for problematic areas
   * @param {string} imageData - Base64 image data URL
   * @param {Object} options - Refinement options
   * @returns {Object} Refinement prompt configuration
   */
  generateRefinementPrompt(imageData, options = {}) {
    const {
      previousExtraction = "",
      problematicSections = [],
      layoutAnalysis = null,
    } = options;

    const prompt = `Review the previous extraction and improve problematic areas.

Previous Extraction:
${previousExtraction}

Identified Issues:
${problematicSections.map((s, i) => `${i + 1}. ${s}`).join("\n")}

Focus Areas:
1. Tables and structured data
2. Small or low-contrast text
3. Complex formatting
4. Multi-column layouts

Refined output format:
<document type="refined">
  [corrected content]
</document>

Provide the refined extraction:`;

    return {
      imageData,
      prompt,
      temperature: this.extractionTemperature - 0.1, // Slightly lower for refinement
    };
  }

  /**
   * Create multi-stage extraction pipeline
   * @param {string} imageData - Base64 image data URL
   * @param {Object} options - Extraction options
   * @returns {Array<Object>} Pipeline configuration
   */
  createExtractionPipeline(imageData, options = {}) {
    const pipeline = [];

    // Stage 1: Layout detection
    pipeline.push({
      stage: "layout-detection",
      description: "Identify document type and structure",
      prompt: `Analyze this document image and identify:
1. Document type (invoice, contract, report, form, letter, resume)
2. Number of pages/sections
3. Major structural elements

Output format:
<layout-analysis>
  <document-type confidence="high|medium|low">type</document-type>
  <pages count="N"/>
  <sections>
    <section id="1" type="header|body|table|footer"/>
  </sections>
</layout-analysis>

Analyze the document layout:`,
      temperature: this.analysisTemperature,
    });

    // Stage 2: Content extraction
    pipeline.push({
      stage: "content-extraction",
      description: "Extract text from each region",
      prompt: `Extract content following the structure identified above.

Output format:
<document type="detected_type">
  <header>
    [extracted header content]
  </header>
  <body>
    [extracted body with section hierarchy]
  </body>
</document>

Extract the content:`,
      temperature: this.extractionTemperature,
    });

    // Stage 3: Validation and assembly
    pipeline.push({
      stage: "validation-assembly",
      description: "Validate structure and assemble final document",
      prompt: `Review the extracted content for:
1. Structural completeness
2. XML validity
3. Logical flow

Final format:
<document type="final">
  [complete validated content]
</document>

Assemble the final document:`,
      temperature: this.extractionTemperature,
    });

    return pipeline;
  }

  /**
   * Generate prompt for table-specific extraction
   */
  generateTableExtractionPrompt(imageData, options = {}) {
    const { tableRegionDescription = "" } = options;

    return {
      imageData,
      prompt: `Extract the table from this image region.

Table context: ${tableRegionDescription}

Output format:
<table>
  <header>
    <column name="col1"/>
    <column name="col2"/>
    ...
  </header>
  <rows>
    <row>
      <cell>value</cell>
      <cell>value</cell>
    </row>
  </rows>
</table>

Extract the table data:`,
      temperature: this.extractionTemperature,
    };
  }

  /**
   * Generate prompt for code block extraction
   */
  generateCodeBlockExtractionPrompt(imageData, options = {}) {
    const { languageHint = "" } = options;

    return {
      imageData,
      prompt: `Extract the code from this image region.

${languageHint ? `Programming language: ${languageHint}` : "Identify the programming language."}

Output format:
<code-block language="detected_language">
  [extracted code preserving indentation]
</code-block>

Extract the code block:`,
      temperature: this.extractionTemperature,
    };
  }

  /**
   * Parse XML output from model
   */
  parseXmlOutput(xmlString) {
    try {
      // Basic XML validation
      if (!xmlString.trim().startsWith("<")) {
        // Try to find the first < in case there's prefix text
        const firstTag = xmlString.indexOf("<");
        if (firstTag !== -1) {
          xmlString = xmlString.substring(firstTag);
        }
      }

      // Simple XML parser (for structured output)
      const result = {
        success: true,
        xml: xmlString,
        sections: {},
      };

      // Extract document type attribute
      const typeMatch = xmlString.match(/<document[^>]*type="([^"]+)"/);
      if (typeMatch) {
        result.documentType = typeMatch[1];
      }

      return result;
    } catch (error) {
      return {
        success: false,
        error: `Failed to parse XML output: ${error.message}`,
      };
    }
  }

  /**
   * Set temperature for extraction tasks
   */
  setExtractionTemperature(temp) {
    this.extractionTemperature = Math.max(0.1, Math.min(0.5, temp));
    return this;
  }

  /**
   * Set temperature for analysis tasks
   */
  setAnalysisTemperature(temp) {
    this.analysisTemperature = Math.max(0.3, Math.min(0.7, temp));
    return this;
  }

  /**
   * Enable/disable Chain-of-Thought prompting
   */
  enableChainOfThought(enabled = true) {
    this.enableCoT = enabled;
    return this;
  }

  /**
   * Enable/disable few-shot examples
   */
  enableFewShot(enabled = true) {
    this.enableFewShot = enabled;
    return this;
  }

  /**
   * Get available document types
   */
  getDocumentTypes() {
    return Object.values(DOCUMENT_TYPES).map((t) => ({
      id: t.id,
      name: t.name,
      keywords: t.keywords,
    }));
  }

  /**
   * Get few-shot examples for a document type
   */
  getFewShotExample(typeId) {
    return FEW_SHOT_EXAMPLES[typeId] || null;
  }
}

/**
 * Extracted prompt engineer instance
 */
export const promptEngineer = new PromptEngineer();

// Export constants for external use
export { DOCUMENT_TYPES, FEW_SHOT_EXAMPLES, CHAIN_OF_THOUGHT };
