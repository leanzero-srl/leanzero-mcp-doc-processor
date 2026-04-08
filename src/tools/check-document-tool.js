/**
 * Handler for check-document tool.
 * Checks if a document with a given title and category already exists.
 * 
 * @param {Object} params - Tool parameters
 * @param {string} params.title - Title of the document to check
 * @param {string} [params.category] - Category of the document to check
 * @returns {Promise<Object>} MCP response
 */
export async function handleCheckDocument(params) {
  const { checkForExistingDocument } = await import("../services/ai-guidance-system.js");
  
  const check = await checkForExistingDocument(params.title, params.category);
  
  return {
    action: check.action,
    existingPath: check.existing?.filePath || null
  };
}