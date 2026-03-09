/**
 * Z.AI Vision Service
 * Integrates with Z.AI's GLM-4.6V model for OCR and image analysis
 * Uses PromptEngineer for optimized 8B VL model prompts
 */

import { promptEngineer } from "./prompt-engineer.js";

/**
 * Z.AI Vision Service for OCR and image analysis
 */
export class ZaiVisionService {
  constructor() {
    this.name = "ZaiVisionService";
    this.baseUrl = this.determineBaseUrl();
    this.model = process.env.Z_AI_VISION_MODEL || "glm-4.6v";
    this.timeout = parseInt(process.env.Z_AI_TIMEOUT || "300000");
    this.maxTokens = parseInt(
      process.env.Z_AI_VISION_MODEL_MAX_TOKENS || "32768",
    );
    this.temperature = parseFloat(
      process.env.Z_AI_VISION_MODEL_TEMPERATURE || "0.8",
    );
    this.topP = parseFloat(process.env.Z_AI_VISION_MODEL_TOP_P || "0.6");
  }

  /**
   * Determine the correct base URL based on environment settings
   */
  determineBaseUrl() {
    // If explicitly set, use that
    if (process.env.Z_AI_BASE_URL) {
      return process.env.Z_AI_BASE_URL;
    }

    // Check platform mode
    const mode = (
      process.env.Z_AI_MODE ||
      process.env.PLATFORM_MODE ||
      ""
    ).toUpperCase();

    if (mode === "ZAI" || mode === "Z_AI" || mode === "Z") {
      // Default to coding endpoint for Z.AI (GLM Coding Plan)
      // Set Z_AI_CODING_PLAN=false to use the general endpoint
      const useCoding = process.env.Z_AI_CODING_PLAN !== "false";
      if (useCoding) {
        return "https://api.z.ai/api/coding/paas/v4/";
      }
      return "https://api.z.ai/api/paas/v4/";
    }

    // Default to zhipuai
    return "https://open.bigmodel.cn/api/paas/v4/";
  }

  /**
   * Check if Z.AI API key is configured
   */
  isConfigured() {
    const apiKey = this.getApiKey();
    return (
      apiKey &&
      !apiKey.toLowerCase().includes("api") &&
      !apiKey.toLowerCase().includes("key")
    );
  }

  /**
   * Get API key from environment
   * Checks multiple environment variables for flexibility
   */
  getApiKey() {
    // Primary keys
    if (process.env.Z_AI_API_KEY) return process.env.Z_AI_API_KEY;
    if (process.env.ZAI_API_KEY) return process.env.ZAI_API_KEY;

    // Fallback to ANTHROPIC_AUTH_TOKEN (like zai-mcp-server does)
    if (process.env.ANTHROPIC_AUTH_TOKEN) {
      console.error("[ZaiVision] Using ANTHROPIC_AUTH_TOKEN as Z_AI_API_KEY");
      return process.env.ANTHROPIC_AUTH_TOKEN;
    }

    return null;
  }

  /**
   * Initialize the service
   * This is primarily for interface compatibility with LmStudioService
   * @returns {Promise<boolean>} True if configured
   */
  async initialize() {
    if (this.isConfigured()) {
      console.error("[ZaiVision] Service initialized (API key present)");
      return true;
    }
    console.error("[ZaiVision] Service not initialized: Missing API key");
    return false;
  }

  /**
   * Extract text from an image using OCR with optimized PromptEngineer prompts
   * @param {string} imageData - Base64 data URL of the image
   * @param {Object|String} options - Extraction options or text hint string
   * @returns {Promise<Object>} Extraction result
   */
  async extractText(imageData, options = {}) {
    if (!this.isConfigured()) {
      return {
        success: false,
        error:
          "Z.AI API key not configured. Set Z_AI_API_KEY environment variable.",
      };
    }

    // Normalize options parameter (support string for textHint)
    const textHint = typeof options === "string" ? options : (options.textHint || "");
    const layoutAnalysis = typeof options === "object" ? (options.layoutAnalysis || null) : null;
    const documentType = typeof options === "object" ? (options.documentType || null) : null;

    try {
      // Generate optimized prompt using PromptEngineer
      const promptConfig = promptEngineer.generateExtractionPrompt(imageData, {
        textHint,
        layoutAnalysis,
        documentType,
        customInstructions: typeof options === "string" ? "" : (options.customInstructions || ""),
      });

      const messages = [
        {
          role: "system",
          content: promptConfig.systemInstruction,
        },
        {
          role: "user",
          content: [
            {
              type: "image_url",
              image_url: {
                url: imageData,
              },
            },
            {
              type: "text",
              text: promptConfig.userPrompt,
            },
          ],
        },
      ];

      const result = await this.callVisionApi(messages);

      return {
        success: true,
        text: result,
        source: "zai-vision",
        model: this.model,
        documentType: promptConfig.documentType,
        confidence: promptConfig.confidence,
        temperatureUsed: promptConfig.temperature,
      };
    } catch (error) {
      return {
        success: false,
        error: `OCR extraction failed: ${error.message}`,
        details: error,
      };
    }
  }

  /**
   * Extract text using multi-stage pipeline (task decomposition)
   * @param {string} imageData - Base64 data URL of the image
   * @param {Object|String} options - Extraction options or text hint string
   * @returns {Promise<Object>} Pipeline extraction result
   */
  async extractWithPipeline(imageData, options = {}) {
    if (!this.isConfigured()) {
      return {
        success: false,
        error:
          "Z.AI API key not configured. Set Z_AI_API_KEY environment variable.",
      };
    }

    const textHint = typeof options === "string" ? options : (options.textHint || "");
    const layoutAnalysis = typeof options === "object" ? (options.layoutAnalysis || null) : null;

    const pipeline = promptEngineer.createExtractionPipeline(imageData, {
      textHint,
      layoutAnalysis,
    });

    const results = [];
    
    for (const stage of pipeline) {
      try {
        const messages = [
          { role: "system", content: stage.prompt },
          {
            role: "user",
            content: [
              { type: "image_url", image_url: { url: imageData } },
            ],
          },
        ];

        const result = await this.callVisionApi(messages);
        results.push({ stage: stage.stage, result, success: true });
      } catch (error) {
        results.push({ stage: stage.stage, result: null, success: false, error: error.message });
      }
    }

    // Get final assembly result
    const finalResult = results.find(r => r.stage === "validation-assembly")?.result;
    
    return {
      success: true,
      text: finalResult || "",
      source: "zai-vision-pipeline",
      model: this.model,
      pipelineResults: results,
    };
  }

  /**
   * Analyze an image for general understanding
   * @param {string} imageData - Base64 data URL of the image
   * @param {string} prompt - Analysis prompt
   * @returns {Promise<Object>} Analysis result
   */
  async analyzeImage(imageData, prompt = "Describe this image in detail.") {
    if (!this.isConfigured()) {
      return {
        success: false,
        error:
          "Z.AI API key not configured. Set Z_AI_API_KEY environment variable.",
      };
    }

    try {
      const messages = [
        {
          role: "user",
          content: [
            {
              type: "image_url",
              image_url: {
                url: imageData,
              },
            },
            {
              type: "text",
              text: prompt,
            },
          ],
        },
      ];

      const result = await this.callVisionApi(messages);

      return {
        success: true,
        analysis: result,
        source: "zai-vision",
        model: this.model,
      };
    } catch (error) {
      return {
        success: false,
        error: `Image analysis failed: ${error.message}`,
        details: error,
      };
    }
  }

  /**
   * Call the Z.AI Vision API
   * @param {Array} messages - Messages array for the API
   * @returns {Promise<string>} API response content
   */
  async callVisionApi(messages) {
    const apiKey = this.getApiKey();
    const url = this.baseUrl + "chat/completions";

    const requestBody = {
      model: this.model,
      messages,
      stream: false,
      temperature: this.temperature,
      top_p: this.topP,
      max_tokens: this.maxTokens,
    };

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      console.error(
        `[ZaiVision] Calling API: ${url} with model: ${this.model}`,
      );

      const response = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "X-Title": "MCP Doc Reader",
          "Accept-Language": "en-US,en",
        },
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP ${response.status}: ${errorText}`);
      }

      const data = await response.json();
      const result = data.choices?.[0]?.message?.content;

      if (!result) {
        throw new Error("Invalid API response: missing content");
      }

      console.error("[ZaiVision] API call successful");
      return result;
    } catch (error) {
      clearTimeout(timeoutId);

      if (error.name === "AbortError") {
        throw new Error(`Request timeout after ${this.timeout}ms`);
      }

      throw error;
    }
  }
}

// Export singleton instance
export const zaiVisionService = new ZaiVisionService();
