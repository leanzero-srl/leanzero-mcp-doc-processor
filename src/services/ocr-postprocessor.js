import { visionService } from "./vision-factory.js";

/**
 * OCR Post-Processor
 * Refines OCR output using AI to fix common errors and improve structure
 */
export class OcrPostProcessor {
  constructor() {
    this.name = "OcrPostProcessor";
  }

  /**
   * Post-process OCR output to improve accuracy and structure
   * @param {string} ocrText - Raw OCR text output
   * @param {Object} layoutAnalysis - Layout analysis results from DocumentLayoutAnalyzer
   * @returns {Promise<Object>} Processed text with improvements and metadata
   */
  async processOcrText(ocrText, layoutAnalysis = null, useAI = true) {
    console.error(
      `[OcrPostProcessor] Processing OCR output ${useAI ? "with AI" : "with basic cleaning"}...`,
    );

    if (!ocrText || ocrText.length === 0) {
      return {
        success: true,
        processedText: "",
        improvements: [],
        confidence: 0.85,
        processingSteps: [],
      };
    }

    // For text-based documents, skip AI processing and just do basic cleaning
    if (!useAI) {
      console.error(
        `[OcrPostProcessor] Skipping AI processing, using basic text cleaning only`,
      );
      const cleanedText = this.basicTextCleaning(ocrText);

      return {
        success: true,
        processedText: cleanedText,
        improvements: [],
        confidence: 0.9,
        processingSteps: ["Basic text cleaning"],
      };
    }

    // First, detect common OCR errors
    const detectedErrors = this.detectCommonOcrErrors(ocrText);

    // Generate AI prompt for refinement
    const prompt = this.generatePostProcessingPrompt(
      ocrText,
      detectedErrors,
      layoutAnalysis,
    );

    try {
      // Use vision service (LM Studio or Z.AI) to process text
      const result = await visionService.extractText(ocrText, prompt);

      // Analyze the improvements made
      const improvements = this.analyzeImprovements(ocrText, result.text);

      return {
        success: true,
        processedText: result.text || ocrText,
        improvements: improvements,
        confidence: this.calculateConfidence(ocrText, result.text),
        processingSteps: [
          "Initial OCR extraction",
          "Common error detection",
          "AI-based refinement",
        ],
      };
    } catch (error) {
      console.error(
        `[OcrPostProcessor] AI processing failed: ${error.message}`,
      );

      // Fallback to basic cleaning if AI processing fails
      const fallbackResult = this.basicTextCleaning(ocrText);

      return {
        success: true,
        processedText: fallbackResult,
        improvements: [],
        confidence: 0.75,
        processingSteps: ["Initial OCR extraction", "Basic text cleaning"],
      };
    }
  }

  /**
   * Detect common OCR errors in the text
   */
  detectCommonOcrErrors(text) {
    const errors = [];

    // Common OCR character substitutions (but be conservative - only flag obvious issues)
    // Look for patterns that are clearly wrong, not ambiguous cases

    // Check for broken words across lines
    const brokenWords = text.match(/\w+-\n\w+/g);
    if (brokenWords && brokenWords.length > 0) {
      errors.push({
        type: "line-break",
        description: "Words broken across lines with hyphens",
        count: brokenWords.length,
      });
    }

    // Detect multiple spaces which often indicate OCR spacing issues
    const multipleSpaces = text.match(/\s{3,}/g);
    if (multipleSpaces && multipleSpaces.length > 0) {
      errors.push({
        type: "spacing-issue",
        description:
          "Multiple consecutive spaces indicating potential OCR spacing errors",
        count: multipleSpaces.length,
      });
    }

    // Detect inconsistent capitalization in headers
    const headerPatterns = [
      /^[A-Z][a-z]+\s+[A-Z][a-z]+$/, // Two words with capital first letters
      /^[A-Z][a-z]+\s+[A-Z][a-z]+\s+[A-Z][a-z]+$/, // Three words
      /^[\d.]+\s+[A-Z][a-z]+/, // Numbered headings
    ];

    const lines = text.split("\n");
    let headersFound = 0;
    lines.forEach((line) => {
      const trimmed = line.trim();
      if (
        trimmed.length > 0 &&
        headerPatterns.some((pattern) => pattern.test(trimmed))
      ) {
        headersFound++;
      }
    });

    if (headersFound > 0) {
      errors.push({
        type: "header-formatting",
        description: "Potential headers with inconsistent capitalization",
        count: headersFound,
      });
    }

    return errors;
  }

  /**
   * Generate AI post-processing prompt
   */
  generatePostProcessingPrompt(ocrText, detectedErrors, layoutAnalysis) {
    let prompt = `You are an expert document processing AI. Your task is to improve OCR output by fixing common errors and preserving structure.

Raw OCR text:
${ocrText}

Detected OCR issues:
${
  detectedErrors.length > 0
    ? detectedErrors
        .map((e) => `- ${e.description} (${e.count} occurrences)`)
        .join("\n")
    : "No specific errors detected"
}
`;

    // Add layout context if available
    if (layoutAnalysis && layoutAnalysis.success) {
      prompt += `\n\nDocument structure context: ${layoutAnalysis.structureType}`;

      // Add page-specific information
      if (layoutAnalysis.pages && layoutAnalysis.pages.length > 0) {
        const firstPage = layoutAnalysis.pages[0];
        if (firstPage.textBlocks && firstPage.textBlocks.length > 0) {
          prompt += `\nText blocks detected: ${firstPage.textBlocks.length}`;
        }
        if (firstPage.tables && firstPage.tables.length > 0) {
          prompt += `\nTables detected: ${firstPage.tables.length}`;
        }
      }
    }

    // Add specific instructions
    prompt += `

Please improve this text by:
1. Fixing obvious character substitutions only when clearly wrong (be conservative)
2. Reconstructing broken words across line breaks
3. Preserving document structure (headers, paragraphs, lists)
4. Correcting spacing and punctuation issues
5. Maintaining the original meaning while improving readability

IMPORTANT: Be very conservative with character substitutions. Only change characters that are OBVIOUSLY wrong. For example:
- Don't change '0' to 'O' unless it's clearly a letter (like in "Product 01" vs "PRODUCT O1")
- Don't change '1' to 'l' unless it's clearly a lowercase letter
- Preserve all numbers and special characters unless they're obviously wrong

Output only the improved text with proper formatting.
Do not add any commentary, explanations, or additional text beyond the processed content.`;

    return prompt;
  }

  /**
   * Analyze improvements made by AI processing
   */
  analyzeImprovements(original, processed) {
    const improvements = [];

    // Check for word reconstruction
    if (original.includes("-\n") && !processed.includes("-\n")) {
      improvements.push({
        type: "word-reconstruction",
        description: "Reconstructed broken words across line breaks",
        impact: "medium",
      });
    }

    // Check for spacing improvements
    if (original.includes("  ") && !processed.includes("  ")) {
      improvements.push({
        type: "spacing",
        description: "Fixed multiple spaces",
        impact: "low",
      });
    }

    // Check for structure preservation
    const originalLineCount = (original.match(/\n/g) || []).length;
    const processedLineCount = (processed.match(/\n/g) || []).length;

    if (Math.abs(originalLineCount - processedLineCount) <= 2) {
      improvements.push({
        type: "structure",
        description: `Preserved structure (${originalLineCount} → ${processedLineCount} lines)`,
        impact: "high",
      });
    }

    return improvements;
  }

  /**
   * Calculate confidence score for processed text
   */
  calculateConfidence(original, processed) {
    if (!original || !processed) return 0.8;

    // Base confidence
    let confidence = 0.85;

    // Add points for improvements
    const originalLength = original.length;
    const processedLength = processed.length;

    // Length change should be minimal (within 20%)
    if (Math.abs(originalLength - processedLength) < originalLength * 0.2) {
      confidence += 0.05;
    }

    // More improvements detected = higher potential for improvement
    const detectedErrors = this.detectCommonOcrErrors(original);
    if (detectedErrors.length > 0) {
      confidence += 0.1;
    }

    // Ensure max confidence is 0.95
    return Math.min(confidence, 0.95);
  }

  /**
   * Basic text cleaning as fallback
   */
  basicTextCleaning(text) {
    if (!text) return "";

    // Clean common OCR artifacts (conservative approach)
    let cleaned = text
      .replace(/\s{3,}/g, " ") // Multiple spaces to single space
      .replace(/\n\s*\n/g, "\n\n"); // Extra line breaks

    return cleaned;
  }
}
