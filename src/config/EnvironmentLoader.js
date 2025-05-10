/**
 * Environment variable loader
 * Handles loading and validating environment variables
 */
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
     * @param {string} name - Environment variable name
     * @param {string} defaultValue - Default value if not set
     * @returns {string} The secret value or default value
     */
    static getSecret(name, defaultValue = '') {
      const fileVarName = `${name}_FILE`;
      const filePath = process.env[fileVarName];

      if (filePath) {
        try {
          const fs = require('fs');
          if (fs.existsSync(filePath)) {
            return fs.readFileSync(filePath, 'utf8').trim();
          } else {
            throw new Error(`Secret file not found at path: ${filePath}`);
          }
        } catch (error) {
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
        // Handle various truthy values
        if (value === 'true' || value === '1' || value === 'yes' || value === 'y') {
          return true;
        }
        // Handle various falsy values
        if (value === 'false' || value === '0' || value === 'no' || value === 'n') {
          return false;
        }
        // Default behavior
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

    /**
     * Check if environment variable is set to a truthy value
     * @param {string} name - Environment variable name
     * @returns {boolean} True if variable is set and has a truthy value
     */
    static isEnabled(name) {
      const value = process.env[name];

      if (value === undefined || value === null || value === '') {
        return false;
      }

      return !(value === 'false' || value === '0' || value === 'no' || value === 'n');
    }

    /**
     * Get all environment variables as a formatted object for debugging
     * Optionally filter to a specific set of variables
     * @param {Array} filter - Optional list of variable names to include
     * @returns {Object} Environment variables
     */
    static getDebugInfo(filter = null) {
      const env = {};

      Object.keys(process.env).forEach(key => {
        // Skip if filter is provided and key is not in filter
        if (filter && !filter.includes(key)) {
          return;
        }

        // Skip sensitive keys
        if (key.includes('TOKEN') || key.includes('KEY') || key.includes('SECRET') || key.includes('PASSWORD')) {
          env[key] = '[REDACTED]';
        } else {
          env[key] = process.env[key];
        }
      });

      return env;
    }
  }

  module.exports = EnvironmentLoader;