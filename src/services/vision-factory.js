import { zaiVisionService } from "./zai-vision.js";
import { lmStudioService } from "./lm-studio-service.js";

/**
 * Vision Factory
 *
 * Selects appropriate vision service (OCR/Image Analysis) based on configuration.
 *
 * Configuration:
 * - VISION_PROVIDER: "zai" or "lm-studio" (default: lm-studio)
 *
 * The service can be explicitly selected via VISION_PROVIDER environment variable.
 * If not specified, it attempts to intelligently guess based on available credentials,
 * defaulting to LM Studio if ambiguous.
 *
 * Automatic failover is enabled by default - if primary service (Z.AI) fails with
 * authentication errors, the system automatically retries with fallback service (LM Studio).
 */
export class VisionFactory {
  constructor() {
    this.name = "VisionFactory";
  }

  /**
   * Get the configured vision service instance
   * @returns {Object} The selected vision service (ZaiVisionService or LmStudioService)
   */
  getService() {
    const provider = (process.env.VISION_PROVIDER || "").toLowerCase();

    console.error(
      `[VisionFactory] Resolving vision service. Provider requested: '${provider}'`,
    );

    // Explicit selection
    if (
      provider === "zai" ||
      provider === "z.ai" ||
      provider === "zai-vision"
    ) {
      console.error("[VisionFactory] Selected: ZaiVisionService");
      return zaiVisionService;
    }

    if (
      provider === "lm-studio" ||
      provider === "lmstudio" ||
      provider === "local"
    ) {
      console.error("[VisionFactory] Selected: LmStudioService");
      return lmStudioService;
    }

    // Auto-detection logic if not explicitly set
    const hasZaiKey =
      !!process.env.Z_AI_API_KEY || !!process.env.ANTHROPIC_AUTH_TOKEN;
    const hasLmStudioUrl = !!process.env.LM_STUDIO_BASE_URL;

    // If only Z.AI is configured, use it
    if (hasZaiKey && !hasLmStudioUrl) {
      console.error(
        "[VisionFactory] Auto-detected: ZaiVisionService (only Z.AI key found)",
      );
      return zaiVisionService;
    }

    // If both are configured or neither, default to LM Studio (local)
    // LM Studio is preferred as default for "local first" approach
    console.error("[VisionFactory] Defaulting to: LmStudioService");
    return lmStudioService;
  }
}

/**
 * Failover Vision Service
 *
 * Provides automatic failover between vision services.
 * Tries primary service (Z.AI) first, then falls back to secondary (LM Studio)
 * on authentication failures or errors that indicate service unavailability.
 */
export class FailoverVisionService {
  constructor() {
    this.name = "FailoverVisionService";
    this.primary = zaiVisionService;
    this.fallback = lmStudioService;
    this.useFallback = false;
  }

  /**
   * Initialize the vision service with automatic failover
   * Tries primary service first, then falls back to secondary if it fails
   * @returns {Promise<Object>} Initialization result
   */
  async initialize() {
    console.error(
      "[Failover] Attempting to initialize primary service: ZaiVisionService",
    );

    try {
      // Try to initialize primary service (Z.AI)
      if (typeof this.primary.initialize === "function") {
        await this.primary.initialize();
        console.error("[Failover] Primary service initialized successfully");
        this.useFallback = false;
        return { success: true, service: "ZaiVisionService" };
      } else {
        // Primary service doesn't need initialization or doesn't have initialize method
        console.error(
          "[Failover] Primary service doesn't require initialization",
        );
        this.useFallback = false;
        return { success: true, service: "ZaiVisionService" };
      }
    } catch (error) {
      console.error(
        `[Failover] Primary service initialization failed: ${error.message}`,
      );

      // Try to initialize fallback service (LM Studio)
      try {
        if (typeof this.fallback.initialize === "function") {
          await this.fallback.initialize();
          console.error("[Failover] Fallback service initialized successfully");
          this.useFallback = true;
          return { success: true, service: "LmStudioService (fallback)" };
        } else {
          // Fallback service doesn't need initialization
          console.error(
            "[Failover] Fallback service doesn't require initialization",
          );
          this.useFallback = true;
          return { success: true, service: "LmStudioService (fallback)" };
        }
      } catch (fallbackError) {
        console.error(
          `[Failover] Fallback service initialization failed: ${fallbackError.message}`,
        );
        // Return error - both services failed to initialize
        return {
          success: false,
          error: `Both primary and fallback services failed to initialize: ${error.message}`,
        };
      }
    }
  }

  /**
   * Extract text with automatic failover
   * @param {string} imageData - Base64 data URL of image
   * @param {string} prompt - Optional prompt for extraction guidance
   * @returns {Promise<Object>} Extraction result from primary or fallback service
   */
  async extractText(
    imageData,
    prompt = "Extract all text from this image. Preserve original formatting and structure as much as possible.",
  ) {
    // Try primary service first (Z.AI)
    console.error("[Failover] Attempting primary service: ZaiVisionService");
    const primaryResult = await this.primary.extractText(imageData, prompt);

    // If primary succeeds, return immediately
    if (primaryResult.success) {
      this.useFallback = false;
      console.error("[Failover] Primary service succeeded");
      return primaryResult;
    }

    // Check if error is authentication-related (might be recoverable)
    if (this.isAuthError(primaryResult.error)) {
      console.error(
        "[Failover] Primary failed with auth error, attempting fallback service: LmStudioService",
      );
      this.useFallback = true;

      // Try fallback service (LM Studio)
      const fallbackResult = await this.fallback.extractText(imageData, prompt);
      console.error(
        "[Failover] Fallback service result:",
        fallbackResult.success ? "SUCCESS" : "FAILED",
      );
      return fallbackResult;
    }

    // Return primary failure if not an auth error
    console.error(
      "[Failover] Primary failed with non-auth error, returning failure",
    );
    this.useFallback = false;
    return primaryResult;
  }

  /**
   * Analyze image with automatic failover
   * @param {string} imageData - Base64 data URL of image
   * @param {string} prompt - Analysis prompt
   * @returns {Promise<Object>} Analysis result from primary or fallback service
   */
  async analyzeImage(imageData, prompt = "Describe this image in detail.") {
    // Try primary service first (Z.AI)
    console.error("[Failover] Attempting primary service: ZaiVisionService");
    const primaryResult = await this.primary.analyzeImage(imageData, prompt);

    // If primary succeeds, return immediately
    if (primaryResult.success) {
      this.useFallback = false;
      console.error("[Failover] Primary service succeeded");
      return primaryResult;
    }

    // Check if error is authentication-related (might be recoverable)
    if (this.isAuthError(primaryResult.error)) {
      console.error(
        "[Failover] Primary failed with auth error, attempting fallback service: LmStudioService",
      );
      this.useFallback = true;

      // Try fallback service (LM Studio)
      const fallbackResult = await this.fallback.analyzeImage(
        imageData,
        prompt,
      );
      console.error(
        "[Failover] Fallback service result:",
        fallbackResult.success ? "SUCCESS" : "FAILED",
      );
      return fallbackResult;
    }

    // Return primary failure if not an auth error
    console.error(
      "[Failover] Primary failed with non-auth error, returning failure",
    );
    this.useFallback = false;
    return primaryResult;
  }

  /**
   * Check if error indicates authentication failure
   * @param {string} error - Error message from service
   * @returns {boolean} True if error is auth-related
   */
  isAuthError(error) {
    if (!error || typeof error !== "string") {
      return false;
    }

    const lowerError = error.toLowerCase();
    const authErrorPatterns = [
      "401 unauthorized",
      "403 forbidden",
      "api key",
      "api-key",
      "apikey",
      "unauthorized",
      "forbidden",
      "expired",
      "invalid token",
      "authentication failed",
      "auth failed",
      "not authenticated",
    ];

    return authErrorPatterns.some((pattern) => lowerError.includes(pattern));
  }

  /**
   * Get currently active service name
   * @returns {string} Name of service being used (primary or fallback)
   */
  getActiveService() {
    return this.useFallback
      ? "LmStudioService (fallback)"
      : "ZaiVisionService (primary)";
  }
}

// Create factory instance for initial service detection
export const visionFactory = new VisionFactory();

// Create and export failover service with automatic retry logic
export const visionService = new FailoverVisionService();
