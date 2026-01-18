import fs from "fs";
import mammoth from "mammoth";
import JSZip from "jszip";

/**
 * DOCX Parser Module
 * Handles extraction of text and images from Word documents (.docx)
 */
export class DocxParser {
  constructor() {
    this.name = "DocxParser";
  }

  /**
   * Parse DOCX file and extract text content and images
   */
  async parse(filePath) {
    const dataBuffer = fs.readFileSync(filePath);

    try {
      // Extract text using mammoth
      const textResult = await mammoth.extractRawText({
        buffer: dataBuffer,
      });

      // Extract images using JSZip
      const images = await this.extractImages(dataBuffer);

      return {
        success: true,
        text: textResult.value || "",
        messages: textResult.messages || [],
        metadata: await this.extractMetadata(dataBuffer, filePath),
        images: images,
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to parse DOCX: ${error.message || "Unknown error"}`,
        details: this.handleError(error),
      };
    }
  }

  /**
   * Extract metadata from DOCX file
   */
  async extractMetadata(dataBuffer, filePath) {
    try {
      // Load the DOCX as a ZIP file to access metadata
      const zip = await JSZip.loadAsync(dataBuffer);

      const metadata = {
        filename: this.extractFilename(filePath),
        sizeBytes: dataBuffer.length || null,
      };

      // Try to extract document properties from docProps/core.xml
      try {
        const coreXml = await zip.file("docProps/core.xml")?.async("string");
        if (coreXml) {
          const parser = new DOMParser();
          const xmlDoc = parser.parseFromString(coreXml, "text/xml");

          // Extract common metadata fields
          const getTextContent = (tagName) => {
            const element = xmlDoc.getElementsByTagName(tagName)[0];
            return element ? element.textContent : null;
          };

          metadata.title = getTextContent("dc:title");
          metadata.author = getTextContent("dc:creator");
          metadata.subject = getTextContent("dc:subject");
          metadata.description = getTextContent("dc:description");

          const createdText = getTextContent("dcterms:created");
          metadata.created = createdText ? new Date(createdText) : null;

          const modifiedText = getTextContent("dcterms:modified");
          metadata.modified = modifiedText ? new Date(modifiedText) : null;
        }
      } catch (metadataError) {
        // Metadata extraction is not critical, continue without it
        console.warn("Could not extract metadata:", metadataError.message);
      }

      return metadata;
    } catch (error) {
      return { error: `Metadata extraction failed: ${error.message}` };
    }
  }

  /**
   * Extract images from DOCX using JSZip
   */
  async extractImages(dataBuffer) {
    const images = [];

    try {
      // Load the DOCX as a ZIP file
      const zip = await JSZip.loadAsync(dataBuffer);

      // Get relationships to find image references
      const rels = await this.getRelationships(zip);

      // Find all files in word/media/ folder
      const mediaFiles = zip.file(
        /word\/media\/.+\.(png|jpg|jpeg|gif|bmp|tiff|webp)/i,
      );

      if (!mediaFiles || mediaFiles.length === 0) {
        return images;
      }

      // Process each image file
      for (const file of mediaFiles) {
        try {
          // Read the image data as a buffer
          const imageData = await file.async("arraybuffer");
          const buffer = Buffer.from(imageData);

          // Get MIME type from file extension
          const mimeType = this.getMimeTypeFromFilename(file.name);

          // Create base64 data URL
          const base64Data = buffer.toString("base64");
          const dataUrl = `data:${mimeType};base64,${base64Data}`;

          images.push({
            data: dataUrl,
            name: file.name.split("/").pop(),
            path: file.name,
            mimeType: mimeType,
            size: buffer.length,
          });
        } catch (fileError) {
          console.warn(
            `Failed to extract image ${file.name}:`,
            fileError.message,
          );
          // Continue with other images even if one fails
        }
      }
    } catch (error) {
      console.warn("Failed to extract images from DOCX:", error.message);
    }

    return images;
  }

  /**
   * Get relationships from the document to understand image references
   */
  async getRelationships(zip) {
    const relationships = new Map();

    try {
      // Try to read the document relationships file
      const relsFile = zip.file("word/_rels/document.xml.rels");
      if (relsFile) {
        const relsContent = await relsFile.async("string");

        // Parse relationships XML (simple parsing)
        const relRegex =
          /<Relationship[^>]*Id="([^"]*)"[^>]*Type="([^"]*)"[^>]*Target="([^"]*)"[^>]*\/>/g;
        let match;

        while ((match = relRegex.exec(relsContent)) !== null) {
          relationships.set(match[1], {
            id: match[1],
            type: match[2],
            target: match[3],
          });
        }
      }
    } catch (error) {
      console.warn("Could not parse relationships:", error.message);
    }

    return relationships;
  }

  /**
   * Extract filename from file path
   */
  extractFilename(filePath) {
    const parts = filePath.split("/");
    return parts[parts.length - 1] || null;
  }

  /**
   * Get MIME type from filename extension
   */
  getMimeTypeFromFilename(filename) {
    const ext = filename.split(".").pop().toLowerCase();
    const mimeTypes = {
      png: "image/png",
      jpg: "image/jpeg",
      jpeg: "image/jpeg",
      gif: "image/gif",
      bmp: "image/bmp",
      tiff: "image/tiff",
      webp: "image/webp",
      svg: "image/svg+xml",
    };

    return mimeTypes[ext] || "image/jpeg";
  }

  /**
   * Handle and format parsing errors
   */
  handleError(error) {
    return {
      message: error.message,
      code: error.code || null,
      stack: process.env.NODE_ENV === "development" ? error.stack : undefined,
    };
  }

  /**
   * Get basic structure of the DOCX content
   */
  async getStructure(content) {
    const lines = content.split("\n");

    // Remove empty lines and whitespace-only lines
    const nonEmptyLines = lines.filter((line) => line.trim().length > 0);

    // Identify potential headers based on patterns
    const structure = nonEmptyLines.map((line) => ({
      text: line.trim(),
      isHeader: this.isLikelyHeader(line),
      level: this.guessHeadingLevel(line),
      position: line.length - line.trimStart().length,
    }));

    return structure;
  }

  /**
   * Determine if a line is likely a header based on patterns
   */
  isLikelyHeader(line) {
    const trimmed = line.trim();

    // All caps and not too long
    if (/^[A-Z\s\d\-\.,;:]+$/.test(trimmed) && trimmed.length < 50) {
      return true;
    }

    // Ends with colon
    if (trimmed.endsWith(":")) {
      return true;
    }

    // Numbered heading pattern (1.1, 1.2, etc.)
    if (/^\d+(\.\d+)*\s/.test(trimmed)) {
      return true;
    }

    // Roman numerals
    if (/^[IVX]+\.\s/.test(trimmed)) {
      return true;
    }

    // Looks like a section title (words followed by space and then more words)
    if (/^[A-Z][a-z]+(?:\s[A-Z][a-z]+)+$/.test(trimmed)) {
      return true;
    }

    // Common header patterns
    const headerPatterns = [
      /^(Chapter|Section|Part)\s+\d+/i,
      /^(Appendix)\s+[A-Z]/i,
      /^(Table|Figure)\s+\d+/i,
    ];

    for (const pattern of headerPatterns) {
      if (pattern.test(trimmed)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Guess heading level based on text formatting
   */
  guessHeadingLevel(line) {
    const trimmed = line.trim();
    const indent = line.length - trimmed.length;

    // Less indentation means higher level heading
    const level = Math.ceil(indent / 4);

    // Clamp to valid heading levels (1-6)
    return Math.max(1, Math.min(level, 6));
  }
}
