/**
 * Handler for assemble-document tool.
 * Combines multiple document sources into a single document.
 * 
 * @param {Object} params - Tool parameters
 * @param {Array} params.sources - Array of source paths or objects
 * @param {string} [params.outputTitle] - Title for the assembled document
 * @param {string} [params.mode] - Assembly mode (e.g., 'concatenate')
 * @param {string} [params.blueprint] - Blueprint to enforce structure
 * @param {string} [params.stylePreset] - Style preset
 * @param {string} [params.outputPath] - Output file path
 * @param {string} [params.category] - Document category
 * @param {Array<string>} [params.tags] - Tags for the document
 * @returns {Promise<Object>} MCP response
 */
export async function handleAssembleDocument(params) {
  const { assembleDocument } = await import("../services/document-assembler.js");
  
  const assembleResult = await assembleDocument({ 
    sources: params.sources, 
    outputTitle: params.outputTitle, 
    mode: params.mode || "concatenate", 
    blueprint: params.blueprint, 
    stylePreset: params.stylePreset, 
    outputPath: params.outputPath, 
    category: params.category, 
    tags: params.tags 
  });

  return assembleResult;
}