import { zaiVisionService } from "./zai-vision.js";
import { lmStudioService } from "./lm-studio-service.js";

/**
 * Vision Factory
 *
 * Selects the appropriate vision service (OCR/Image Analysis) based on configuration.
 *
 * Configuration:
 * - VISION_PROVIDER: "zai" or "lm-studio" (default: lm-studio)
 *
 * The service can be explicitly selected via the VISION_PROVIDER environment variable.
 * If not specified, it attempts to intelligently guess based on available credentials,
 * defaulting to LM Studio if ambiguous.
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

// Create factory instance
export const visionFactory = new VisionFactory();

// Export the selected service instance directly for transparent usage
export const visionService = visionFactory.getService();
