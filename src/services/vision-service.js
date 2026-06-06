/**
 * Vision Service
 *
 * Single vision service for OCR and image analysis.
 * Uses Z.AI GLM-4.6V model (configurable via env vars).
 *
 * Env vars:
 *   Z_AI_API_KEY or ZAI_API_KEY - API key (also checks ANTHROPIC_AUTH_TOKEN)
 *   Z_AI_BASE_URL - Override base URL (default: auto-detect from Z_AI_MODE)
 *   Z_AI_VISION_MODEL - Model name (default: glm-4.6v)
 *   Z_AI_TIMEOUT - Request timeout ms (default: 300000)
 *
 * Over the HTTP transport, a caller may bring their own key per request via the
 * X-ZAI-Key header (or ?zai_key) — carried through request-context.js and read
 * here first, before falling back to the process env above.
 */

import { requestContext } from "../utils/request-context.js";

export class VisionService {
  constructor() {
    this.name = "VisionService";
    this.baseUrl = this._determineBaseUrl();
    this.model = process.env.Z_AI_VISION_MODEL || "glm-4.6v";
    this.timeout = parseInt(process.env.Z_AI_TIMEOUT || "300000");
    this.maxTokens = parseInt(process.env.Z_AI_VISION_MODEL_MAX_TOKENS || "32768");
  }

  _determineBaseUrl() {
    if (process.env.Z_AI_BASE_URL) return process.env.Z_AI_BASE_URL;

    const mode = (process.env.Z_AI_MODE || process.env.PLATFORM_MODE || "").toUpperCase();
    if (mode === "ZAI" || mode === "Z_AI" || mode === "Z") {
      if (process.env.Z_AI_CODING_PLAN !== "false") {
        return "https://api.z.ai/api/coding/paas/v4/";
      }
      return "https://api.z.ai/api/paas/v4/";
    }
    return "https://open.bigmodel.cn/api/paas/v4/";
  }

  _getApiKey() {
    // Per-request key (HTTP caller's X-ZAI-Key) wins; otherwise fall back to the
    // process env (stdio callers / a server-provided default).
    const perRequest = requestContext.getStore()?.zaiKey;
    if (perRequest) return perRequest;
    if (process.env.Z_AI_API_KEY) return process.env.Z_AI_API_KEY;
    if (process.env.ZAI_API_KEY) return process.env.ZAI_API_KEY;
    if (process.env.ANTHROPIC_AUTH_TOKEN) return process.env.ANTHROPIC_AUTH_TOKEN;
    return null;
  }

  isConfigured() {
    const key = this._getApiKey();
    return key && !key.toLowerCase().includes("api") && !key.toLowerCase().includes("key");
  }

  /**
   * Extract text from an image using OCR.
   * @param {string} imageData - Base64 data URL of the image
   * @param {string} prompt - Extraction prompt (default: generic OCR)
   * @returns {Promise<Object>} { success, text, source, model }
   */
  async extractText(imageData, prompt = "Extract all text from this image. Preserve original formatting and structure.") {
    if (!this.isConfigured()) {
      return { success: false, error: "Vision API key not configured. Set Z_AI_API_KEY." };
    }

    try {
      const messages = [
        { role: "system", content: "You are an OCR specialist. Extract all text accurately, preserving document structure." },
        {
          role: "user",
          content: [
            { type: "image_url", image_url: { url: imageData } },
            { type: "text", text: prompt },
          ],
        },
      ];

      const result = await this._callVisionApi(messages);
      return { success: true, text: result, source: "vision-service", model: this.model };
    } catch (error) {
      return { success: false, error: `OCR failed: ${error.message}` };
    }
  }

  /**
   * Analyze an image for general understanding.
   * @param {string} imageData - Base64 data URL of the image
   * @param {string} prompt - Analysis prompt
   * @returns {Promise<Object>} { success, analysis, source, model }
   */
  async analyzeImage(imageData, prompt = "Describe this image in detail.") {
    if (!this.isConfigured()) {
      return { success: false, error: "Vision API key not configured. Set Z_AI_API_KEY." };
    }

    try {
      const messages = [
        {
          role: "user",
          content: [
            { type: "image_url", image_url: { url: imageData } },
            { type: "text", text: prompt },
          ],
        },
      ];

      const result = await this._callVisionApi(messages);
      return { success: true, analysis: result, source: "vision-service", model: this.model };
    } catch (error) {
      return { success: false, error: `Image analysis failed: ${error.message}` };
    }
  }

  async _callVisionApi(messages) {
    const apiKey = this._getApiKey();
    const url = this.baseUrl + "chat/completions";

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "X-Title": "MCP Doc Processor",
        },
        body: JSON.stringify({
          model: this.model,
          messages,
          stream: false,
          max_tokens: this.maxTokens,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP ${response.status}: ${errorText}`);
      }

      const data = await response.json();
      const result = data.choices?.[0]?.message?.content;
      if (!result) throw new Error("Invalid API response: missing content");

      return result;
    } finally {
      clearTimeout(timeoutId);
    }
  }
}

export const visionService = new VisionService();
