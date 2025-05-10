/**
 * StateStore - Central state management for TrafegoDNS
 * Provides a single source of truth for application state
 */
const logger = require('../utils/logger');

class StateStore {
  constructor() {
    // Initialize the application state structure
    this.state = {
      dns: {
        records: [],
        orphaned: [],
        preserved: [],
        managed: []
      },
      containers: {
        list: [],
        labels: {}
      },
      config: {
        // Will be populated by ConfigManager
      },
      system: {
        started: new Date().toISOString(),
        status: 'initializing',
        uptime: 0,
        version: process.env.npm_package_version || '1.0.0'
      },
      users: {
        list: []
      }
    };

    this.revisions = [];
    this.maxRevisions = 100;

    // Set up interval for updating uptime
    setInterval(() => {
      this._updateState('system.uptime', process.uptime(), { source: 'system' });
    }, 60000); // Update once per minute
  }

  /**
   * Get a section of the state using dot notation
   * @param {string} path - Dot notation path to state section (e.g., 'dns.records')
   * @returns {*} - The requested state section
   */
  getState(path = '') {
    if (!path) return { ...this.state }; // Return a copy of the entire state

    return path.split('.').reduce((obj, prop) => {
      if (obj === undefined) return undefined;
      
      const value = obj[prop];
      
      // Return a copy to prevent accidental mutation
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        return { ...value };
      } else if (Array.isArray(value)) {
        return [...value];
      }
      
      return value;
    }, this.state);
  }

  /**
   * Check if a path exists in the state
   * @param {string} path - Dot notation path to check
   * @returns {boolean} - Whether the path exists
   */
  hasPath(path) {
    if (!path) return true;
    
    let current = this.state;
    const parts = path.split('.');
    
    for (const part of parts) {
      if (current === undefined || current === null || typeof current !== 'object') {
        return false;
      }
      
      current = current[part];
    }
    
    return current !== undefined;
  }

  /**
   * Get the revision history for a specific path
   * @param {string} path - Path to get history for
   * @param {number} limit - Max number of revisions to return
   * @returns {Array} - Revision history
   */
  getHistory(path, limit = 10) {
    if (!path) return [];
    
    return this.revisions
      .filter(rev => rev.path === path || rev.path.startsWith(`${path}.`))
      .slice(-limit);
  }

  /**
   * Update state (INTERNAL METHOD - should only be called by ActionBroker)
   * @param {string} path - Dot notation path to update
   * @param {*} value - New value
   * @param {Object} metadata - Metadata about the update
   * @returns {Object} - Updated state
   * @private
   */
  _updateState(path, value, metadata = {}) {
    if (!path) {
      logger.error('Cannot update state without a path');
      return this.state;
    }

    // Create a revision record
    const timestamp = new Date().toISOString();
    const oldValue = this.getState(path);
    
    const revision = {
      path,
      oldValue,
      newValue: value,
      timestamp,
      ...metadata
    };

    // Store revision (keeping history size limited)
    this.revisions.push(revision);
    if (this.revisions.length > this.maxRevisions) {
      this.revisions.shift();
    }

    // Update the state using immutable patterns
    const parts = path.split('.');
    let current = { ...this.state }; // Clone root state
    let temp = current;
    
    // Navigate to and update the nested property
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      
      if (i === parts.length - 1) {
        // Last part - update the value
        temp[part] = value;
      } else {
        // Create or clone intermediate objects
        if (!temp[part] || typeof temp[part] !== 'object') {
          temp[part] = {};
        } else {
          temp[part] = { ...temp[part] };
        }
        
        temp = temp[part];
      }
    }
    
    // Update state reference
    this.state = current;
    
    // Log state change
    if (process.env.DEBUG_MODE === 'true' && !path.startsWith('system.uptime')) {
      logger.debug(`State updated: ${path}`);
    }
    
    return this.state;
  }
}

module.exports = StateStore;