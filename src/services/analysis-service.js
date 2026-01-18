import { log, logFunctionCall } from "../utils/logger.js";

/**
 * Analysis Service
 * Handles document content analysis and question generation.
 */
export class AnalysisService {
  constructor() {
    this.name = "AnalysisService";
  }

  /**
   * Generate clarification questions based on document content
   * @param {string} text - Extracted text content
   * @param {Array} images - Array of extracted images
   * @returns {Array} List of clarification questions
   */
  generateClarificationQuestions(text, images) {
    logFunctionCall("generateClarificationQuestions", {
      textLength: text ? text.length : 0,
      imageCount: images?.length || 0,
    });

    const safeText = text || "";
    const imageCount = Array.isArray(images) ? images.length : 0;
    const textLength = safeText.length;

    // Analyze text to generate relevant questions
    const questions = [];

    if (textLength > 500) {
      // Document has substantial content
      log("info", "Adding question for substantial content document");
      questions.push({
        id: "scope",
        question:
          "What specific sections or topics in this document are most relevant to your current task?",
        type: "text",
      });
    }

    if (imageCount > 0) {
      // Document contains images
      log(
        "info",
        `Document contains ${imageCount} images, adding visual elements question`,
      );
      questions.push({
        id: "visual-elements",
        question: `This document contains ${imageCount} image(s). Would you like to focus on the text content, or also analyze the visual elements?`,
        type: "choice",
        options: ["Text only", "Images and text"],
      });
    }

    // Look for data/tables in the document
    if (safeText.includes("\t") || safeText.match(/^\s*\|/)) {
      log(
        "info",
        "Document appears to contain tabular data, adding tables question",
      );
      questions.push({
        id: "tables",
        question:
          "This document appears to contain tabular data. Would you like detailed analysis of the tables?",
        type: "choice",
        options: ["Yes", "No"],
      });
    }

    // Document is too long
    if (textLength > 5000) {
      log("info", "Long document detected, adding detail-level question");
      questions.push({
        id: "detail-level",
        question:
          "This is a long document. Would you like a comprehensive analysis, or to focus on specific aspects?",
        type: "choice",
        options: ["Comprehensive", "Specific topics"],
      });
    }

    // Check for legal document patterns
    if (
      /contract|agreement|clause|liability|indemnity|termination/i.test(
        safeText,
      )
    ) {
      log(
        "info",
        "Legal document patterns detected, adding legal analysis question",
      );
      questions.push({
        id: "legal-analysis",
        question:
          "This appears to be a legal document. Would you like me to identify key clauses, potential risks, or obligations?",
        type: "choice",
        options: [
          "Key clauses only",
          "Risks and obligations",
          "Full legal analysis",
          "Skip legal analysis",
        ],
      });
    }

    log("info", `Generated ${questions.length} clarification questions`);
    return questions;
  }
}

// Export singleton instance
export const analysisService = new AnalysisService();
