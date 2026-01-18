import path from 'path';

/**
 * File type detector utility
 * Determines the document type based on file extension.
 */
export class FileTypeDetector {
  constructor() {
    this.name = 'FileTypeDetector';
  }

  /**
   * Detect file type from file path
   */
  detect(filePath) {
    const extension = this.getExtension(filePath);

    // Map extensions to document types
    const typeMap = {
      'pdf': 'pdf',
      'docx': 'docx',
      'xlsx': 'excel',
      'xls': 'excel',
      // Support legacy .doc format as docx
      'doc': 'docx'
    };

    // Get type from extension or default to null
    const fileType = typeMap[extension] || null;

    return {
      success: true,
      fileType,
      filePath,
      extension
    };
  }

  /**
   * Extract file extension from path
   */
  getExtension(filePath) {
    const ext = path.extname(filePath).toLowerCase();

    // Remove leading dot from extension
    return ext.replace(/^\./, '');
  }
}
