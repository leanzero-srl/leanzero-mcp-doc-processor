/**
 * Document Assembler Service
 *
 * Reads multiple source documents and produces a single unified document.
 * The AI never needs to hold all source content in its context window —
 * the entire pipeline runs server-side.
 *
 * Modes:
 *   - concatenate: Join documents sequentially with section breaks
 *   - cherry-pick: Select specific sections from each source
 */

import { documentProcessor } from "./document-processor.js";
import { createDoc } from "../tools/create-doc.js";
import { loadBlueprint } from "../utils/blueprint-store.js";
import { validateAgainstBlueprint } from "./blueprint-extractor.js";
import { recordRead, recordWrite } from "./lineage-tracker.js";
import { applyDNAToInput } from "../utils/dna-manager.js";

/**
 * Parse a document's text into sections based on heading detection.
 *
 * @param {string} text - Full document text
 * @param {Array} structure - Heading structure from processor
 * @returns {Array<{heading: string, level: number, content: string}>}
 */
function parseIntoSections(text, structure) {
  const lines = text.split("\n");
  const sections = [];

  if (!structure || structure.length === 0) {
    // No structure detected — return entire text as one section
    return [{ heading: "(Full Document)", level: 1, content: text.trim() }];
  }

  for (let i = 0; i < structure.length; i++) {
    const heading = structure[i];
    const headingText = heading.text || heading.heading || "";
    const level = heading.level || 1;

    const startIdx = lines.findIndex(l => l.includes(headingText));
    const nextHeading = structure[i + 1];
    const endIdx = nextHeading
      ? lines.findIndex((l, idx) => idx > startIdx && l.includes(nextHeading.text || nextHeading.heading || ""))
      : lines.length;

    if (startIdx >= 0 && endIdx > startIdx) {
      const content = lines.slice(startIdx + 1, endIdx)
        .filter(l => l.trim().length > 0)
        .join("\n")
        .trim();
      sections.push({ heading: headingText, level, content });
    }
  }

  return sections;
}

/**
 * Assemble multiple documents into one.
 *
 * @param {Object} options
 * @param {Array<{filePath: string, sections?: string[]|"all"}>} options.sources
 * @param {string} options.outputTitle - Title for the assembled document
 * @param {string} [options.mode="concatenate"] - "concatenate" or "cherry-pick"
 * @param {string} [options.blueprint] - Blueprint name to validate against
 * @param {string} [options.stylePreset="professional"] - Style preset
 * @param {string} [options.outputPath] - Output path
 * @param {string} [options.category] - Category
 * @param {Array<string>} [options.tags] - Tags
 * @returns {Promise<Object>} Result with output path
 */
export async function assembleDocument(options) {
  // Apply DNA defaults to assembler input (respects DNA stylePreset, header, footer)
  const dnaApplied = applyDNAToInput({ ...options });

  const {
    sources,
    outputTitle,
    mode = "concatenate",
    blueprint: blueprintName,
    stylePreset,
    outputPath,
    category,
    tags,
    enforceDocsFolder,
    preventDuplicates,
  } = dnaApplied;

  if (!sources || sources.length === 0) {
    return { success: false, error: "No source documents provided." };
  }

  // Load and parse all source documents
  const parsedSources = [];

  for (const source of sources) {
    let result;
    try {
      result = await documentProcessor.processDocument(source.filePath, "indepth");
    } catch (err) {
      return {
        success: false,
        error: `Failed to read source "${source.filePath}": ${err.message}`,
      };
    }
    if (!result.success) {
      return {
        success: false,
        error: `Failed to read source "${source.filePath}": ${result.error || "unknown"}`,
      };
    }

    // Record this read for lineage tracking
    recordRead(source.filePath, "assemble-document");

    const sections = parseIntoSections(result.text || "", result.structure || []);

    parsedSources.push({
      filePath: source.filePath,
      requestedSections: source.sections || "all",
      allSections: sections,
      text: result.text || "",
    });
  }

  // Build assembled paragraphs
  const paragraphs = [];
  let sourceIndex = 0;

  for (const parsed of parsedSources) {
    sourceIndex++;

    let sectionsToInclude;

    if (mode === "cherry-pick" && Array.isArray(parsed.requestedSections)) {
      // Cherry-pick: only include named sections
      sectionsToInclude = parsed.allSections.filter(s =>
        parsed.requestedSections.some(req =>
          s.heading.toLowerCase().includes(req.toLowerCase()) ||
          req.toLowerCase().includes(s.heading.toLowerCase())
        )
      );
    } else {
      // Concatenate: include all sections
      sectionsToInclude = parsed.allSections;
    }

    // Add source separator (except for first source)
    if (sourceIndex > 1 && sectionsToInclude.length > 0) {
      paragraphs.push(""); // Blank line separator
    }

    for (const section of sectionsToInclude) {
      // Add heading
      const headingLevel = section.level === 1 ? "heading1"
        : section.level === 2 ? "heading2" : "heading3";

      paragraphs.push({
        text: section.heading,
        headingLevel,
      });

      // Add content paragraphs
      if (section.content) {
        const contentParagraphs = section.content.split("\n").filter(l => l.trim().length > 0);
        for (const p of contentParagraphs) {
          paragraphs.push(p);
        }
      }
    }
  }

  // Validate against blueprint if specified
  if (blueprintName) {
    const blueprint = loadBlueprint(blueprintName);
    if (!blueprint) {
      return {
        success: false,
        error: `Blueprint "${blueprintName}" not found. Use list-blueprints to see available blueprints.`,
      };
    }

    const validation = validateAgainstBlueprint(paragraphs, blueprint);
    if (!validation.valid) {
      return {
        success: false,
        blueprintValidation: validation,
        error: `Assembled content does not match blueprint "${blueprintName}". Missing sections: ${validation.errors.map(e => e.expectedPattern).join(", ")}`,
      };
    }
  }

  // Create the assembled document (stylePreset comes from DNA or explicit param)
  const docInput = {
    title: outputTitle,
    paragraphs,
    category,
    tags: tags || [],
    description: `Assembled from ${sources.length} source document(s)`,
    enforceDocsFolder,
    preventDuplicates,
  };

  // Only set stylePreset if explicitly provided or from DNA
  if (stylePreset) {
    docInput.stylePreset = stylePreset;
  }

  // Pass through header/footer from DNA if they were applied
  if (dnaApplied.header) docInput.header = dnaApplied.header;
  if (dnaApplied.footer) docInput.footer = dnaApplied.footer;

  if (outputPath) {
    docInput.outputPath = outputPath;
  }

  const result = await createDoc(docInput);

  // Record lineage
  if (result.success && result.filePath) {
    await recordWrite(result.filePath);
  }

  if (result.success) {
    return {
      ...result,
      assemblyInfo: {
        sourceCount: sources.length,
        sourcePaths: sources.map(s => s.filePath),
        mode,
        totalSections: paragraphs.filter(p => p && typeof p === "object" && p.headingLevel).length,
        totalParagraphs: paragraphs.length,
        blueprint: blueprintName || null,
      },
    };
  }

  return result;
}
