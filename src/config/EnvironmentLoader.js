const path = require('path');

/**
 * Environment variable loader
 * Handles loading and validating environment variables
 */

// Allowed directories for secret files (Docker secrets standard locations)
const ALLOWED_SECRET_PATHS = [
  '/run/secrets',
  '/var/run/secrets',
  '/config/secrets'
];

/**
 * Validate that a file path is within allowed secret directories
 * Prevents path traversal attacks via *_FILE environment variables
 * @param {string} filePath - The file path to validate
 * @returns {boolean} - True if the path is safe
 */
function isPathSafe(filePath) {
  if (!filePath) return false;

  // Resolve to absolute path and normalize (handles ../, ./, etc.)
  const normalizedPath = path.resolve(filePath);

  // Check if the normalized path starts with any allowed directory
  return ALLOWED_SECRET_PATHS.some(allowedDir => {
    const normalizedAllowedDir = path.resolve(allowedDir);
    // Ensure path is within allowed directory (not just starts with the string)
    return normalizedPath.startsWith(normalizedAllowedDir + path.sep) ||
           normalizedPath === normalizedAllowedDir;
  });
}

class EnvironmentLoader {
    /**
     * Get environment variable with type conversion
     * @param {string} name - Environment variable name
     * @param {*} defaultValue - Default value if not set
     * @param {Function} converter - Converter function
     * @returns {*} The environment variable value
     */
    static get(name, defaultValue, converter = null) {
      const value = process.env[name];
      
      if (value === undefined) {
        return defaultValue;
      }
      
      if (converter) {
        try {
          return converter(value);
        } catch (error) {
          throw new Error(`Invalid format for environment variable ${name}: ${error.message}`);
        }
      }
      
      return value;
    }
    
    /**
     * Get environment variable as string
     */
    static getString(name, defaultValue = '') {
      return this.get(name, defaultValue);
    }
    
    /**
     * Get environment variable as a secret
     * Checks if <name>_FILE is defined and reads the contents from the file
     * Security: Validates file path is within allowed secret directories
     * @param {string} name - Environment variable name
     * @param {string} defaultValue - Default value if not set
     * @returns {string} The secret value or default value
     */
    static getSecret(name, defaultValue = '') {
      const fileVarName = `${name}_FILE`;
      const filePath = process.env[fileVarName];

      if (filePath) {
        // Security: Validate path is within allowed secret directories
        if (!isPathSafe(filePath)) {
          throw new Error(
            `Security error: Secret file path "${filePath}" is outside allowed directories. ` +
            `Allowed paths: ${ALLOWED_SECRET_PATHS.join(', ')}`
          );
        }

        try {
          const fs = require('fs');
          const normalizedPath = path.resolve(filePath);
          if (fs.existsSync(normalizedPath)) {
            return fs.readFileSync(normalizedPath, 'utf8').trim();
          } else {
            throw new Error(`Secret file not found at path: ${filePath}`);
          }
        } catch (error) {
          if (error.message.includes('Security error')) {
            throw error; // Re-throw security errors as-is
          }
          throw new Error(`Error reading secret file for ${name}: ${error.message}`);
        }
      }

      return this.get(name, defaultValue);
    }
    
    /**
     * Get environment variable as integer
     */
    static getInt(name, defaultValue = 0) {
      return this.get(name, defaultValue, (value) => {
        const parsed = parseInt(value, 10);
        if (isNaN(parsed)) {
          throw new Error(`Expected an integer`);
        }
        return parsed;
      });
    }
    
    /**
     * Get environment variable as boolean
     */
    static getBool(name, defaultValue = false) {
      return this.get(name, defaultValue, (value) => {
        return value !== 'false';
      });
    }
    
    /**
     * Get required environment variable
     * @throws {Error} If the variable is not set
     */
    static getRequired(name) {
      const value = process.env[name];
      
      if (value === undefined) {
        throw new Error(`Required environment variable ${name} is not set`);
      }
      
      return value;
    }
  }
  
  module.exports = EnvironmentLoader;