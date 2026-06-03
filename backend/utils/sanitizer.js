import path from 'path';
import crypto from 'crypto';

/**
 * Validates and sanitizes the uploaded file name.
 * Generates a unique, safe filename using UUID/Crypto.
 */
class FileSanitizer {
  // We only allow compiled Linux ELF binaries or .zip files for our sandbox
  static ALLOWED_EXTENSIONS = ['.zip', '']; // Empty string covers extensionless Linux binaries

  /**
   * Sanitizes a file name.
   * @param {string} originalName 
   * @returns {string} Safe, sanitized unique filename
   */
  static sanitizeFilename(originalName) {
    const parsed = path.parse(originalName);
    const ext = parsed.ext.toLowerCase();

    // Strict Extension check
    if (!this.ALLOWED_EXTENSIONS.includes(ext)) {
      throw new Error(`Invalid file extension. Only compiled binaries or .zip files are allowed.`);
    }

    // Clean base name: remove any path traversal characters
    let cleanBase = parsed.name.replace(/[^a-zA-Z0-9-_]/g, '');
    
    if (!cleanBase) {
      cleanBase = 'submission';
    }

    // Append a unique hash to prevent name collisions
    const uniqueHash = crypto.randomBytes(8).toString('hex');
    return `${cleanBase}-${uniqueHash}${ext}`;
  }
}

export default FileSanitizer;