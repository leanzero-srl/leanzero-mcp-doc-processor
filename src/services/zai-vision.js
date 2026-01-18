/**
 * Z.AI Vision Service
 * Integrates with Z.AI's GLM-4.6V model for OCR and image analysis
 */

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
   * Extract text from an image using OCR
   * @param {string} imageData - Base64 data URL of the image
   * @param {string} prompt - Optional prompt for extraction guidance
   * @returns {Promise<Object>} Extraction result
   */
  async extractText(
    imageData,
    prompt = "Extract all text from this image. Preserve the original formatting and structure as much as possible.",
  ) {
    if (!this.isConfigured()) {
      return {
        success: false,
        error:
          "Z.AI API key not configured. Set Z_AI_API_KEY environment variable.",
      };
    }

    try {
      const systemPrompt = `You are an advanced OCR and text extraction specialist. Your task is to accurately extract and recognize text from images.

Key responsibilities:
1. Extract ALL visible text from the image with high accuracy
2. Preserve the original formatting, layout, and structure
3. For documents with tables, maintain table structure using markdown
4. For code snippets, identify the programming language and format appropriately
5. Handle multiple languages if present
6. Note any text that is unclear or partially visible

Output format:
- Return the extracted text in a clean, readable format
- Use markdown formatting where appropriate (headers, lists, tables, code blocks)
- If the image contains structured data (invoices, forms), preserve that structure`;

      const messages = [
        {
          role: "system",
          content: systemPrompt,
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
              text: prompt,
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
