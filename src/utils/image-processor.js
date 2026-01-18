/**
 * Image Processor Module
 * Handles formatting and validation of images extracted from documents for MCP responses.
 *
 * IMPORTANT: MCP servers do NOT call each other directly. The proper workflow is:
 * 1. This MCP server extracts images from documents and returns them in tool responses
 * 2. The MCP client (LM Studio, Cline, etc.) receives the response with image data
 * 3. The client can then call zai-mcp-server's tools with the image data if needed
 * 4. The client coordinates all tool calls between MCP servers
 *
 * This module focuses on properly formatting extracted images for MCP responses.
 */

export class ImageProcessor {
  constructor() {
    this.name = "ImageProcessor";
  }

  /**
   * Format a single image for MCP response
   * @param {Object} image - Image object with data, name, and metadata
   * @returns {Object} Formatted image ready for MCP response
   */
  formatImage(image) {
    if (!image || !image.data) {
      throw new Error("Invalid image: missing data field");
    }

    // Ensure the image data is in the correct format
    const imageData = this.ensureDataUrlFormat(image.data);

    return {
      name: image.name || "unnamed_image",
      data: imageData,
      mimeType: image.mimeType || this.extractMimeType(imageData),
      size: image.size || this.calculateBase64Size(imageData),
      metadata: {
        page: image.page || null,
        width: image.width || null,
        height: image.height || null,
        kind: image.kind || null,
        path: image.path || null,
      },
    };
  }

  /**
   * Format multiple images for MCP response
   * @param {Array} images - Array of image objects
   * @returns {Object} Formatted result with images and any errors
   */
  formatImages(images) {
    if (!Array.isArray(images)) {
      return {
        success: false,
        images: [],
        errors: ["Input is not an array of images"],
      };
    }

    const formattedImages = [];
    const errors = [];

    images.forEach((image, index) => {
      try {
        const formatted = this.formatImage(image);
        formattedImages.push(formatted);
      } catch (error) {
        errors.push({
          index,
          image: image.name || `image_${index}`,
          error: error.message,
        });
      }
    });

    return {
      success: errors.length === 0,
      images: formattedImages,
      errors: errors.length > 0 ? errors : undefined,
      count: formattedImages.length,
      totalImages: images.length,
    };
  }

  /**
   * Convert image to MCP content format for responses
   * This formats images as they should appear in tool responses
   * @param {Object} image - Image object
   * @returns {Object} MCP-formatted content object
   */
  toMcpContent(image) {
    const formatted = this.formatImage(image);

    return {
      type: "text",
      text: this.formatImageAsText(formatted),
    };
  }

  /**
   * Convert multiple images to MCP content format
   * @param {Array} images - Array of image objects
   * @returns {Array} Array of MCP-formatted content objects
   */
  toMcpContents(images) {
    const result = this.formatImages(images);
    const contents = [];

    // Add formatted images as text content
    result.images.forEach((image) => {
      contents.push(this.toMcpContent(image));
    });

    // Add summary of images
    contents.push({
      type: "text",
      text: `\n\nExtracted ${result.count} image(s) from document.${
        result.errors
          ? ` Failed to process ${result.errors.length} image(s).`
          : ""
      }`,
    });

    return contents;
  }

  /**
   * Format image data as text for inclusion in response
   * @param {Object} formattedImage - Formatted image object
   * @returns {string} Text representation of the image
   */
  formatImageAsText(formattedImage) {
    let text = `Image: ${formattedImage.name}\n`;
    text += `  Type: ${formattedImage.mimeType}\n`;
    text += `  Size: ${formattedImage.size}\n`;

    if (formattedImage.metadata.page) {
      text += `  Page: ${formattedImage.metadata.page}\n`;
    }

    if (formattedImage.metadata.width && formattedImage.metadata.height) {
      text += `  Dimensions: ${formattedImage.metadata.width}x${formattedImage.metadata.height}\n`;
    }

    text += `  Data URL: ${formattedImage.data.substring(0, 50)}...\n`;

    return text;
  }

  /**
   * Ensure image data is in Data URL format
   * @param {string} imageData - Image data, possibly base64 only
   * @returns {string} Data URL format
   */
  ensureDataUrlFormat(imageData) {
    if (!imageData || typeof imageData !== "string") {
      throw new Error("Image data must be a string");
    }

    // If already a data URL, return as is
    if (imageData.startsWith("data:image/")) {
      return imageData;
    }

    // If it's base64 without the prefix, add it
    // Assume JPEG as default if unknown
    return `data:image/jpeg;base64,${imageData}`;
  }

  /**
   * Extract MIME type from data URL
   * @param {string} dataUrl - Data URL string
   * @returns {string} MIME type
   */
  extractMimeType(dataUrl) {
    const match = dataUrl.match(/^data:([^;]+);/);
    return match ? match[1] : "image/jpeg";
  }

  /**
   * Calculate size of base64 encoded data in human-readable format
   * @param {string} dataUri - Data URI
   * @returns {string} Human-readable size
   */
  calculateBase64Size(dataUri) {
    // Remove the prefix "data:image/type;base64,"
    const base64Data = dataUri.split(",")[1] || "";

    // Each character in a base64 string represents roughly 0.75 bytes
    const sizeBytes = Math.round(base64Data.length * 0.75);

    // Format in a human-readable way
    if (sizeBytes < 1024) return `${sizeBytes} B`;
    if (sizeBytes < 1048576) return `${Math.round(sizeBytes / 1024)} KB`;
    return `${(sizeBytes / 1048576).toFixed(1)} MB`;
  }

  /**
   * Validate image data
   * @param {string} imageData - Image data to validate
   * @returns {Object} Validation result
   */
  validateImage(imageData) {
    if (!imageData || typeof imageData !== "string") {
      return {
        valid: false,
        error: "Image data must be a string",
      };
    }

    // Check for data URL format
    if (!imageData.startsWith("data:image/")) {
      return {
        valid: false,
        error:
          "Image data must be in Data URL format (data:image/type;base64,...)",
      };
    }

    // Extract and validate base64 data
    const base64Data = imageData.split(",")[1];
    if (!base64Data || base64Data.length === 0) {
      return {
        valid: false,
        error: "Image data contains no base64 content",
      };
    }

    // Validate base64 characters
    if (!/^[A-Za-z0-9+/]*={0,2}$/.test(base64Data)) {
      return {
        valid: false,
        error: "Image data contains invalid base64 characters",
      };
    }

    return {
      valid: true,
      mimeType: this.extractMimeType(imageData),
      size: this.calculateBase64Size(imageData),
    };
  }

  /**
   * Create image summary for document overview
   * @param {Array} images - Array of image objects
   * @returns {string} Summary text
   */
  createImageSummary(images) {
    try {
      if (!images || images.length === 0) {
        return "No images found in document";
      }

      const result = this.formatImages(images);
      let summary = `Found ${result.count} image(s) in document:\n`;

      if (result.images && Array.isArray(result.images)) {
        result.images.forEach((image) => {
          const imageName = image?.name || "unnamed_image";
          const mimeType = image?.mimeType || "unknown";
          const size = image?.size || "0";
          summary += `- ${imageName} (${mimeType}, ${size})\n`;
          if (image?.metadata?.page) {
            summary += `  Page: ${image.metadata.page}\n`;
          }
        });
      }

      if (result.errors && result.errors.length > 0) {
        summary += `\nFailed to process ${result.errors.length} image(s)\n`;
      }

      return summary || "Image summary unavailable";
    } catch (error) {
      return "Error processing image summary";
    }
  }
}

// Export singleton instance
export const imageProcessor = new ImageProcessor();
