/**
 * LM Studio Vision Service
 * Integrates with LM Studio's VLM (Vision Language Models) for OCR and image analysis
 * Uses PromptEngineer for optimized 8B VL model prompts
 */

import { promptEngineer } from "./prompt-engineer.js";

export class LmStudioService {
  constructor() {
    this.name = "LmStudioService";
    // Default to local LM Studio server - use v0 API for rich model information
    this.baseUrl =
      process.env.LM_STUDIO_BASE_URL || "http://localhost:1234/api/v0";
    this.apiKey = process.env.LM_STUDIO_API_KEY || "lm-studio";
    this.timeout = parseInt(process.env.LM_STUDIO_TIMEOUT || "30000");
    this.maxTokens = parseInt(process.env.LM_STUDIO_MAX_TOKENS || "32768");
    this.temperature = parseFloat(process.env.LM_STUDIO_TEMPERATURE || "0.8");
    this.topP = parseFloat(process.env.LM_STUDIO_TOP_P || "0.6");
    this.vlmModelId = null;

    console.error(
      `[LmStudio] Service initialized with baseUrl=${this.baseUrl}, timeout=${this.timeout}ms`,
    );
  }

  /**
   * Check if LM Studio is accessible
   */
  async checkConnection() {
    try {
      const modelsUrl = `${this.baseUrl}/models`;
      console.error(
        `[LmStudio] ==================== CHECKING CONNECTION ====================`,
      );
      console.error(`[LmStudio] Checking connection to: ${modelsUrl}`);
      console.error(`[LmStudio] Timeout: ${this.timeout}ms`);

      const response = await fetch(modelsUrl, {
        method: "GET",
        signal: AbortSignal.timeout(this.timeout),
      });

      if (!response.ok) {
        console.error(
          `[LmStudio] ❌ Connection check FAILED with status: ${response.status}`,
        );
        return false;
      }

      const data = await response.json();
      console.error(
        `[LmStudio] ✅ Connection SUCCESS - Found ${data.data?.length || 0} models`,
      );
      return true;
    } catch (error) {
      console.error(`[LmStudio] ❌ Connection check FAILED: ${error.message}`);
      console.error(`[LmStudio] Error details:`, error);
      return false;
    }
  }

  /**
   * Get all available models from LM Studio
   */
  async getModels() {
    try {
      const modelsUrl = `${this.baseUrl}/models`;
      console.error(`[LmStudio] Fetching models from: ${modelsUrl}`);

      const response = await fetch(modelsUrl, {
        method: "GET",
        signal: AbortSignal.timeout(this.timeout),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[LmStudio] ❌ HTTP ${response.status}: ${errorText}`);
        throw new Error(`Failed to fetch models: HTTP ${response.status}`);
      }

      const data = await response.json();
      console.error(`[LmStudio] ✅ Retrieved ${data.data?.length || 0} models`);
      return data.data || [];
    } catch (error) {
      console.error(`[LmStudio] ❌ Error fetching models: ${error.message}`);
      return [];
    }
  }

  /**
   * Find VLM (Vision Language Model) models
   */
  /**
   * Check if a model is a VLM based on heuristics (since API doesn't return type field)
   */
  isLikelyVlmModel(model) {
    if (!model || !model.id) return false;

    const modelName = model.id.toLowerCase();

    // Common VLM model name patterns
    const vlmPatterns = [
      "vl", // vision-language
      "vision", // vision models
      "llava", // LLaVA models
      "clip", // CLIP models
      "phi-3-vision", // Phi-3 Vision
      "qwen.*-vl", // Qwen VLM models (like qwen3-vl)
      "internvl", // InternVL
      "pix2struct", // Pix2Struct
      "blip", // BLIP models
      "fuyu", // Fuyu
    ];

    return vlmPatterns.some((pattern) => new RegExp(pattern).test(modelName));
  }

  async findVlmModel() {
    try {
      console.error(
        `[LmStudio] ==================== FINDING VLM MODEL ====================`,
      );
      const models = await this.getModels();

      // Filter for VLM models using heuristics (API doesn't return type field)
      const vlmModels = models.filter((model) => this.isLikelyVlmModel(model));

      if (!vlmModels || vlmModels.length === 0) {
        console.error(
          `[LmStudio] ❌ No VLM models found in ${models.length} total models`,
        );

        // Log all available models for debugging
        console.error(`[LmStudio] All available models:`);
        models.forEach((model, index) => {
          const isVlm = this.isLikelyVlmModel(model);
          console.error(
            `  ${index + 1}. ${model.id} (type: ${model.type || "N/A"}, isVLM: ${isVlm})`,
          );
        });

        return null;
      }

      console.error(`[LmStudio] ✅ Found ${vlmModels.length} VLM model(s)`);

      // Prefer loaded VLM models over not-loaded ones
      const loadedVlmModels = vlmModels.filter(
        (model) => model.state === "loaded",
      );

      let selectedModel;
      if (loadedVlmModels.length > 0) {
        selectedModel = loadedVlmModels[0];
        console.error(
          `[LmStudio] ✅ Found ${loadedVlmModels.length} loaded VLM models, using the first one`,
        );
      } else {
        selectedModel = vlmModels[0];
        console.error(
          `[LmStudio] ⚠️  Using first available VLM model (not currently loaded)`,
        );
      }

      this.vlmModelId = selectedModel.id;

      console.error(`[LmStudio] ✅ Selected VLM model: ${selectedModel.id}`);
      console.error(`[LmStudio] Model details:`);
      console.error(`  - type: ${selectedModel.type}`);
      console.error(`  - publisher: ${selectedModel.publisher}`);
      console.error(`  - arch: ${selectedModel.arch}`);
      console.error(`  - quantization: ${selectedModel.quantization}`);
      console.error(`  - state: ${selectedModel.state}`);
      console.error(`  - max context: ${selectedModel.max_context_length}`);
      console.error(
        `  - loaded context: ${selectedModel.loaded_context_length || "N/A"}`,
      );

      // Log all available VLM models for reference
      if (vlmModels.length > 1) {
        console.error(
          `[LmStudio] All available VLM models (${vlmModels.length}):`,
        );
        vlmModels.forEach((model, index) => {
          const stateStr =
            model.state === "loaded" ? "[LOADED]✅" : "[NOT LOADED]⚠️";
          console.error(
            `  ${index + 1}. ${stateStr} ${model.id} (publisher: ${model.publisher || "N/A"}, arch: ${model.arch || "N/A"})`,
          );
        });
      }

      return selectedModel;
    } catch (error) {
      console.error(`[LmStudio] ❌ Error finding VLM model: ${error.message}`);
      return null;
    }
  }

  /**
   * Initialize the service and find a VLM model
   */
  async initialize() {
    console.error(
      `[LmStudio] ==================== INITIALIZING SERVICE ====================`,
    );
    const connected = await this.checkConnection();
    if (!connected) {
      throw new Error("LM Studio server is not accessible");
    }

    const vlmModel = await this.findVlmModel();
    if (!vlmModel) {
      throw new Error(
        "No VLM (Vision Language Model) models detected in LM Studio",
      );
    }

    console.error(
      `[LmStudio] ✅ Service initialization complete, VLM model: ${this.vlmModelId}`,
    );
    return vlmModel;
  }

  /**
   * Prepare an image by validating the base64 data URL
   * @param {string} imageData - Base64 data URL of the image (e.g., "data:image/jpeg;base64,ABC123...")
   * @returns {Promise<string>} The validated base64 data URL
   */
  async prepareImage(imageData) {
    try {
      console.error(
        `[LmStudio] ==================== PREPARING IMAGE ====================`,
      );
      // Extract base64 content and mime type from data URL format
      const match = imageData.match(/^data:([^;]+);base64,(.+)$/);
      if (!match) {
        console.error(`[LmStudio] ❌ Invalid base64 data URL format`);
        throw new Error("Invalid base64 data URL format");
      }

      const mimeType = match[1];
      const base64Content = match[2];
      const imageBuffer = Buffer.from(base64Content, "base64");

      console.error(
        `[LmStudio] Image size: ${imageBuffer.length} bytes, MIME type: ${mimeType}`,
      );

      // For LM Studio REST API, we pass the base64 data URL directly in the message
      // No need to upload to /files endpoint
      console.error(`[LmStudio] ✅ Image validated (base64 data URL)`);
      return imageData;
    } catch (error) {
      console.error(`[LmStudio] ❌ Failed to prepare image: ${error.message}`);
      throw error;
    }
  }

  /**
   * Extract text from an image using the selected VLM model with optimized PromptEngineer prompts
   * @param {string} imageData - Base64 data URL of the image
   * @param {Object|String} options - Extraction options or text hint string
   * @returns {Promise<Object>} Extraction result
   */
  async extractText(imageData, options = {}) {
    console.error(
      `[LmStudio] ==================== EXTRACT TEXT (OCR) ====================`,
    );
    
    // Normalize options parameter
    const textHint = typeof options === "string" ? options : (options.textHint || "");
    const layoutAnalysis = typeof options === "object" ? (options.layoutAnalysis || null) : null;
    const documentType = typeof options === "object" ? (options.documentType || null) : null;

    if (!this.vlmModelId) {
      console.error(
        `[LmStudio] VLM model not initialized, initializing now...`,
      );
      const model = await this.initialize();
      if (!model) {
        console.error(
          `[LmStudio] ❌ Failed to initialize - No VLM models available`,
        );
        return {
          success: false,
          error: "No VLM models available in LM Studio",
        };
      }
    }

    try {
      console.error(
        `[LmStudio] Extracting text with VLM model: ${this.vlmModelId}`,
      );

      // Generate optimized prompt using PromptEngineer
      const customInstructions = typeof options === "object" ? (options.customInstructions || "") : "";
      
      const promptConfig = promptEngineer.generateExtractionPrompt(imageData, {
        textHint,
        layoutAnalysis,
        documentType,
        customInstructions,
      });

      console.error(
        `[LmStudio] Document type detected: ${promptConfig.documentType} (confidence: ${promptConfig.confidence})`,
      );
      console.error(
        `[LmStudio] Using temperature: ${promptConfig.temperature}`,
      );

      // Prepare the image first
      let preparedImageId;
      try {
        preparedImageId = await this.prepareImage(imageData);
      } catch (error) {
        console.error(
          `[LmStudio] ❌ Image preparation failed: ${error.message}`,
        );
        throw new Error(
          `Failed to prepare image for VLM processing: ${error.message}`,
        );
      }

      // Construct the messages in OpenAI vision API format
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
                url: preparedImageId,
              },
            },
            {
              type: "text",
              text: promptConfig.userPrompt,
            },
          ],
        },
      ];

      console.error(
        `[LmStudio] Sending OCR request with 1 image (base64 data URL)`,
      );
      console.error(`[LmStudio] Prompt length: ${promptConfig.userPrompt.length} chars`);

      const result = await this.callChatCompletions(messages);

      console.error(
        `[LmStudio] ✅ OCR extraction completed, extracted ${result.length} characters`,
      );
      return {
        success: true,
        text: result,
        source: "lm-studio-vlm",
        model: this.vlmModelId,
        documentType: promptConfig.documentType,
        confidence: promptConfig.confidence,
        temperatureUsed: promptConfig.temperature,
      };
    } catch (error) {
      console.error(`[LmStudio] ❌ Text extraction failed: ${error.message}`);
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
    console.error(
      `[LmStudio] ==================== EXTRACT WITH PIPELINE ====================`,
    );
    
    const textHint = typeof options === "string" ? options : (options.textHint || "");
    const layoutAnalysis = typeof options === "object" ? (options.layoutAnalysis || null) : null;

    if (!this.vlmModelId) {
      console.error(
        `[LmStudio] VLM model not initialized, initializing now...`,
      );
      const model = await this.initialize();
      if (!model) {
        console.error(
          `[LmStudio] ❌ Failed to initialize - No VLM models available`,
        );
        return {
          success: false,
          error: "No VLM models available in LM Studio",
        };
      }
    }

    const pipeline = promptEngineer.createExtractionPipeline(imageData, {
      textHint,
      layoutAnalysis,
    });

    const results = [];
    
    for (const stage of pipeline) {
      try {
        console.error(`[LmStudio] Pipeline stage: ${stage.stage} (${stage.description})`);
        console.error(`[LmStudio] Using temperature: ${stage.temperature || this.extractionTemperature}`);

        // Use stage-specific temperature if available, otherwise use default
        const stageTemp = stage.temperature !== undefined ? stage.temperature : this.extractionTemperature;

        const messages = [
          { role: "system", content: stage.prompt },
          {
            role: "user",
            content: [
              { type: "image_url", image_url: { url: imageData } },
            ],
          },
        ];

        const result = await this.callChatCompletionsWithTemperature(messages, stageTemp);
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
      source: "lm-studio-vlm-pipeline",
      model: this.vlmModelId,
      pipelineResults: results,
    };
  }

  /**
   * Call LM Studio chat completions endpoint with custom temperature
   * @param {Array} messages - Messages array for the API
   * @param {number} customTemperature - Custom temperature override
   * @returns {Promise<string>} API response content
   */
  async callChatCompletionsWithTemperature(messages, customTemperature) {
    const chatUrl = `${this.baseUrl}/chat/completions`;

    console.error(`[LmStudio] ==================== CALLING CHAT COMPLETIONS (custom temp) ====================`);

    // Convert messages to LM Studio format - handle images properly
    const formattedMessages = messages.map((msg) => ({
      role: msg.role,
      content: msg.content || "",
      ...(msg.images && { images: msg.images }),
    }));

    const requestBody = {
      model: this.vlmModelId,
      messages: formattedMessages,
      stream: false,
      temperature: customTemperature,
      top_p: this.topP,
      max_tokens: this.maxTokens,
    };

    const response = await fetch(chatUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
      signal: AbortSignal.timeout(this.timeout),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(
        `[LmStudio] ❌ Chat completions FAILED: HTTP ${response.status}`,
      );
      console.error(`[LmStudio] Error response: ${errorText}`);
      throw new Error(`HTTP ${response.status}: ${errorText}`);
    }

    const data = await response.json();

    // Parse the response
    let content;
    if (data.choices && data.choices.length > 0) {
      const choice = data.choices[0];
      content = choice.message.content || "";
    } else {
      console.error(`[LmStudio] ❌ Invalid API response: missing choices`);
      throw new Error("Invalid API response: missing choices");
    }

    return content;
  }

  /**
   * Analyze an image for general understanding using the VLM model
   * @param {string} imageData - Base64 data URL of the image
   * @param {string} prompt - Analysis prompt
   * @returns {Promise<Object>} Analysis result
   */
  async analyzeImage(imageData, prompt = "Describe this image in detail.") {
    console.error(
      `[LmStudio] ==================== ANALYZING IMAGE ====================`,
    );
    if (!this.vlmModelId) {
      console.error(
        `[LmStudio] VLM model not initialized, initializing now...`,
      );
      const model = await this.initialize();
      if (!model) {
        console.error(
          `[LmStudio] ❌ Failed to initialize - No VLM models available`,
        );
        return {
          success: false,
          error: "No VLM models available in LM Studio",
        };
      }
    }

    try {
      console.error(
        `[LmStudio] Analyzing image with VLM model: ${this.vlmModelId}`,
      );

      // Prepare the image first
      let preparedImageId;
      try {
        preparedImageId = await this.prepareImage(imageData);
      } catch (error) {
        console.error(
          `[LmStudio] ❌ Image preparation failed: ${error.message}`,
        );
        throw new Error(
          `Failed to prepare image for VLM processing: ${error.message}`,
        );
      }

      // Construct the messages in OpenAI vision API format
      const messages = [
        {
          role: "user",
          content: [
            {
              type: "image_url",
              image_url: {
                url: preparedImageId,
              },
            },
            {
              type: "text",
              text: prompt,
            },
          ],
        },
      ];

      console.error(
        `[LmStudio] Sending analysis request with 1 image (base64 data URL)`,
      );
      console.error(`[LmStudio] Prompt: ${prompt.substring(0, 100)}...`);

      const result = await this.callChatCompletions(messages);

      console.error(
        `[LmStudio] ✅ Image analysis completed, result length: ${result.length} characters`,
      );
      return {
        success: true,
        analysis: result,
        source: "lm-studio-vlm",
        model: this.vlmModelId,
      };
    } catch (error) {
      console.error(`[LmStudio] ❌ Image analysis failed: ${error.message}`);
      return {
        success: false,
        error: `Image analysis failed: ${error.message}`,
        details: error,
      };
    }
  }

  /**
   * Call LM Studio chat completions endpoint
   * @param {Array} messages - Messages array for the API
   * @returns {Promise<string>} API response content
   */
  async callChatCompletions(messages) {
    const chatUrl = `${this.baseUrl}/chat/completions`;

    console.error(
      `[LmStudio] ==================== CALLING CHAT COMPLETIONS ====================`,
    );
    console.error(`[LmStudio] Endpoint: ${chatUrl}`);
    console.error(`[LmStudio] Model: ${this.vlmModelId}`);

    // Convert messages to LM Studio format - handle images properly
    const formattedMessages = messages.map((msg) => ({
      role: msg.role,
      content: msg.content || "",
      ...(msg.images && { images: msg.images }),
    }));

    const requestBody = {
      model: this.vlmModelId,
      messages: formattedMessages,
      stream: false,
      temperature: this.temperature,
      top_p: this.topP,
      max_tokens: this.maxTokens,
    };

    console.error(`[LmStudio] Request parameters:`);
    console.error(`  - Messages: ${formattedMessages.length}`);
    console.error(`  - Temperature: ${this.temperature}`);
    console.error(`  - Top P: ${this.topP}`);
    console.error(`  - Max tokens: ${this.maxTokens}`);
    console.error(`  - Stream: false`);

    const response = await fetch(chatUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
      signal: AbortSignal.timeout(this.timeout),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(
        `[LmStudio] ❌ Chat completions FAILED: HTTP ${response.status}`,
      );
      console.error(`[LmStudio] Error response: ${errorText}`);
      throw new Error(`HTTP ${response.status}: ${errorText}`);
    }

    const data = await response.json();

    // Parse the response
    let content;
    if (data.choices && data.choices.length > 0) {
      const choice = data.choices[0];

      // Log stats if available in v0 API response
      if (data.stats) {
        console.error(`[LmStudio] 📊 Performance Stats:`);
        console.error(
          `  - Tokens/sec: ${data.stats.tokens_per_second?.toFixed(2) || "N/A"}`,
        );
        console.error(
          `  - Time to first token: ${data.stats.time_to_first_token || "N/A"}s`,
        );
        console.error(
          `  - Generation time: ${data.stats.generation_time || "N/A"}s`,
        );
        console.error(
          `  - Prompt tokens: ${data.stats.prompt_tokens || "N/A"}`,
        );
        console.error(
          `  - Completion tokens: ${data.stats.completion_tokens || "N/A"}`,
        );
      }

      // Log model info if available
      if (data.model_info) {
        console.error(`[LmStudio] 📦 Model Info:`);
        console.error(`  - Architecture: ${data.model_info.arch || "N/A"}`);
        console.error(`  - Quantization: ${data.model_info.quant || "N/A"}`);
        console.error(`  - Format: ${data.model_info.format || "N/A"}`);
      }

      content = choice.message.content || "";
      console.error(
        `[LmStudio] ✅ Chat completions SUCCESS - Response length: ${content.length} characters`,
      );
    } else {
      console.error(`[LmStudio] ❌ Invalid API response: missing choices`);
      throw new Error("Invalid API response: missing choices");
    }

    return content;
  }
}

// Export singleton instance
export const lmStudioService = new LmStudioService();
