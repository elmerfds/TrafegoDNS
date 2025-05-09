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