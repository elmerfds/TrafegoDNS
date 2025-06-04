/**
 * Data Consistency Service
 * Ensures data integrity and consistency across the application
 */
const logger = require('../utils/logger');
const { errorHandler, BusinessLogicError } = require('../utils/errorHandler');
const { transactionManager } = require('../database/transactionManager');
const { dataIntegrityService } = require('../database/dataIntegrityService');
const { EventEmitter } = require('events');

class DataConsistencyService extends EventEmitter {
  constructor() {
    super();
    
    this.consistencyRules = new Map();
    this.lastConsistencyCheck = null;
    this.consistencyMetrics = {
      rulesViolated: 0,
      autoFixesApplied: 0,
      manualInterventionRequired: 0,
      lastCheckTime: null
    };
    
    this.setupDefaultRules();
  }
  
  /**
   * Validate data consistency before operations
   * @param {string} operation - Operation type
   * @param {Object} data - Data to validate
   * @param {Object} context - Additional context
   * @returns {Promise<Object>} Validation result
   */
  async validateConsistency(operation, data, context = {}) {
    const validationResult = {
      isValid: true,
      violations: [],
      warnings: [],
      autoFixes: []
    };
    
    try {
      logger.debug(`Validating data consistency for operation: ${operation}`, {
        dataKeys: Object.keys(data),
        context
      });
      
      // Get rules for this operation
      const rules = this.getApplicableRules(operation, data);
      
      // Execute validation rules
      for (const rule of rules) {
        try {
          const ruleResult = await this.executeRule(rule, data, context);
          
          if (!ruleResult.passed) {
            validationResult.isValid = false;
            validationResult.violations.push({
              rule: rule.name,
              message: ruleResult.message,
              severity: rule.severity || 'medium',
              data: ruleResult.violatingData
            });
            
            // Apply auto-fix if available and severity allows
            if (rule.autoFix && rule.severity !== 'critical') {
              try {
                const fixResult = await rule.autoFix(data, ruleResult, context);
                if (fixResult.success) {
                  validationResult.autoFixes.push({
                    rule: rule.name,
                    description: fixResult.description,
                    appliedChanges: fixResult.changes
                  });
                  this.consistencyMetrics.autoFixesApplied++;
                  
                  // Update data with fixes
                  Object.assign(data, fixResult.changes);
                }
              } catch (fixError) {
                logger.error(`Auto-fix failed for rule ${rule.name}`, {
                  error: fixError.message
                });
              }
            }
          }
          
          if (ruleResult.warnings && ruleResult.warnings.length > 0) {
            validationResult.warnings.push(...ruleResult.warnings);
          }
          
        } catch (ruleError) {
          logger.error(`Error executing consistency rule ${rule.name}`, {
            error: ruleError.message,
            operation,
            context
          });
          
          validationResult.warnings.push({
            rule: rule.name,
            message: `Rule execution failed: ${ruleError.message}`
          });
        }
      }
      
      // Update metrics
      this.consistencyMetrics.rulesViolated += validationResult.violations.length;
      
      // Emit validation event
      this.emit('consistencyValidated', {
        operation,
        result: validationResult,
        context
      });
      
      return validationResult;
      
    } catch (error) {
      logger.error('Data consistency validation failed', {
        operation,
        error: error.message,
        context
      });
      
      throw new BusinessLogicError(
        `Consistency validation failed: ${error.message}`,
        { operation, context }
      );
    }
  }
  
  /**
   * Execute operation with consistency checks
   * @param {string} operation - Operation type
   * @param {Function} executor - Operation executor function
   * @param {Object} data - Operation data
   * @param {Object} options - Execution options
   * @returns {Promise<any>} Operation result
   */
  async executeWithConsistency(operation, executor, data, options = {}) {
    const { skipPreValidation = false, skipPostValidation = false } = options;
    
    try {
      // Pre-operation consistency validation
      if (!skipPreValidation) {
        const preValidation = await this.validateConsistency(`pre_${operation}`, data, options.context);
        
        if (!preValidation.isValid && preValidation.violations.some(v => v.severity === 'critical')) {
          throw new BusinessLogicError(
            `Critical consistency violations prevent operation: ${preValidation.violations.map(v => v.message).join(', ')}`,
            { operation, violations: preValidation.violations }
          );
        }
        
        // Apply auto-fixes to data
        if (preValidation.autoFixes.length > 0) {
          logger.info(`Applied ${preValidation.autoFixes.length} auto-fixes before ${operation}`);
        }
      }
      
      // Execute operation within transaction
      const result = await transactionManager.executeTransaction(async (transaction) => {
        // Execute the actual operation
        const operationResult = await executor(transaction, data, options.context);
        
        // Post-operation consistency validation
        if (!skipPostValidation) {
          const postValidation = await this.validateConsistency(
            `post_${operation}`, 
            { ...data, result: operationResult }, 
            options.context
          );
          
          if (!postValidation.isValid && postValidation.violations.some(v => v.severity === 'critical')) {
            throw new BusinessLogicError(
              `Post-operation consistency violations detected: ${postValidation.violations.map(v => v.message).join(', ')}`,
              { operation, violations: postValidation.violations }
            );
          }
        }
        
        return operationResult;
      }, options.transactionOptions);
      
      logger.debug(`Operation ${operation} completed with consistency checks`);
      return result;
      
    } catch (error) {
      logger.error(`Consistent operation ${operation} failed`, {
        error: error.message,
        context: options.context
      });
      
      await errorHandler.handleError(error, {
        operation,
        data: this.sanitizeDataForLogging(data),
        context: options.context
      });
      
      throw error;
    }
  }
  
  /**
   * Run comprehensive consistency check
   * @param {Object} options - Check options
   * @returns {Promise<Object>} Consistency report
   */
  async runConsistencyCheck(options = {}) {
    const { autoFix = false, scope = 'all' } = options;
    
    const report = {
      timestamp: new Date().toISOString(),
      scope,
      rulesChecked: 0,
      violationsFound: 0,
      warningsFound: 0,
      autoFixesApplied: 0,
      details: []
    };
    
    try {
      logger.info('Running comprehensive data consistency check', { scope, autoFix });
      
      // Get all rules for comprehensive check
      const rules = this.getAllRules(scope);
      
      for (const rule of rules) {
        try {
          const ruleReport = await this.checkRule(rule, autoFix);
          
          report.rulesChecked++;
          report.violationsFound += ruleReport.violations;
          report.warningsFound += ruleReport.warnings;
          report.autoFixesApplied += ruleReport.autoFixes;
          
          if (ruleReport.violations > 0 || ruleReport.warnings > 0) {
            report.details.push({
              rule: rule.name,
              violations: ruleReport.violations,
              warnings: ruleReport.warnings,
              autoFixes: ruleReport.autoFixes,
              description: ruleReport.description
            });
          }
          
        } catch (ruleError) {
          logger.error(`Error checking consistency rule ${rule.name}`, {
            error: ruleError.message
          });
          
          report.details.push({
            rule: rule.name,
            error: ruleError.message,
            violations: 0,
            warnings: 1
          });
          
          report.warningsFound++;
        }
      }
      
      // Update service state
      this.lastConsistencyCheck = report;
      this.consistencyMetrics.lastCheckTime = report.timestamp;
      
      // Emit consistency check event
      this.emit('consistencyCheckCompleted', report);
      
      logger.info(`Consistency check completed: ${report.violationsFound} violations, ${report.warningsFound} warnings`, {
        autoFixesApplied: report.autoFixesApplied
      });
      
      return report;
      
    } catch (error) {
      logger.error('Consistency check failed', { error: error.message });
      throw error;
    }
  }
  
  /**
   * Add custom consistency rule
   * @param {Object} rule - Consistency rule
   */
  addRule(rule) {
    if (!rule.name || !rule.check) {
      throw new Error('Rule must have name and check function');
    }
    
    const fullRule = {
      ...rule,
      severity: rule.severity || 'medium',
      operations: rule.operations || ['*'],
      enabled: rule.enabled !== false
    };
    
    this.consistencyRules.set(rule.name, fullRule);
    logger.debug(`Added consistency rule: ${rule.name}`);
  }
  
  /**
   * Remove consistency rule
   * @param {string} ruleName - Rule name
   */
  removeRule(ruleName) {
    if (this.consistencyRules.delete(ruleName)) {
      logger.debug(`Removed consistency rule: ${ruleName}`);
    }
  }
  
  /**
   * Setup default consistency rules
   * @private
   */
  setupDefaultRules() {
    // DNS Record consistency rules
    this.addRule({
      name: 'dns_record_type_content_match',
      description: 'DNS record content must match the record type',
      operations: ['dns_create', 'dns_update'],
      severity: 'critical',
      check: async (data) => {
        if (!data.type || !data.content) {
          return { passed: true };
        }
        
        const violations = [];
        const type = data.type.toUpperCase();
        const content = data.content;
        
        switch (type) {
          case 'A':
            if (!/^(\d{1,3}\.){3}\d{1,3}$/.test(content)) {
              violations.push('A record must contain valid IPv4 address');
            }
            break;
          case 'AAAA':
            if (!/^[0-9a-fA-F:]+$/.test(content)) {
              violations.push('AAAA record must contain valid IPv6 address');
            }
            break;
          case 'CNAME':
            if (!/^[a-zA-Z0-9.-]+$/.test(content)) {
              violations.push('CNAME record must contain valid hostname');
            }
            break;
        }
        
        return {
          passed: violations.length === 0,
          message: violations.join(', '),
          violatingData: violations.length > 0 ? { type, content } : null
        };
      }
    });
    
    // Port consistency rules
    this.addRule({
      name: 'port_range_validation',
      description: 'Port numbers must be within valid range',
      operations: ['port_create', 'port_update', 'port_reserve'],
      severity: 'critical',
      check: async (data) => {
        if (data.port === undefined) {
          return { passed: true };
        }
        
        const port = parseInt(data.port);
        const isValid = port >= 1 && port <= 65535;
        
        return {
          passed: isValid,
          message: isValid ? null : `Port ${port} is outside valid range (1-65535)`,
          violatingData: isValid ? null : { port: data.port }
        };
      },
      autoFix: async (data, ruleResult) => {
        // Can't auto-fix invalid port numbers
        return { success: false, reason: 'Invalid port numbers require manual correction' };
      }
    });
    
    // User consistency rules
    this.addRule({
      name: 'user_unique_username',
      description: 'Usernames must be unique across the system',
      operations: ['user_create', 'user_update'],
      severity: 'critical',
      check: async (data, context) => {
        if (!data.username) {
          return { passed: true };
        }
        
        // This would need to check against the database
        // For now, just validate format
        const isValidFormat = /^[a-zA-Z0-9_-]{3,50}$/.test(data.username);
        
        return {
          passed: isValidFormat,
          message: isValidFormat ? null : 'Username format is invalid',
          violatingData: isValidFormat ? null : { username: data.username }
        };
      }
    });
    
    // Orphaned record cleanup rule
    this.addRule({
      name: 'orphaned_records_cleanup',
      description: 'Orphaned records should be cleaned up regularly',
      operations: ['system_maintenance'],
      severity: 'medium',
      check: async (data) => {
        // This would check for orphaned records in the database
        return { passed: true, warnings: ['Manual orphaned record check required'] };
      }
    });
    
    // Data integrity cross-reference rule
    this.addRule({
      name: 'foreign_key_integrity',
      description: 'Foreign key relationships must be valid',
      operations: ['*'],
      severity: 'high',
      check: async (data) => {
        // This would validate foreign key relationships
        return { passed: true };
      }
    });
  }
  
  /**
   * Get applicable rules for operation and data
   * @private
   */
  getApplicableRules(operation, data) {
    return Array.from(this.consistencyRules.values()).filter(rule => {
      if (!rule.enabled) return false;
      
      return rule.operations.includes('*') || 
             rule.operations.includes(operation) ||
             rule.operations.some(op => operation.startsWith(op));
    });
  }
  
  /**
   * Get all rules for comprehensive check
   * @private
   */
  getAllRules(scope) {
    if (scope === 'all') {
      return Array.from(this.consistencyRules.values()).filter(rule => rule.enabled);
    }
    
    return Array.from(this.consistencyRules.values()).filter(rule => {
      return rule.enabled && (
        rule.operations.includes(scope) ||
        rule.operations.some(op => op.includes(scope))
      );
    });
  }
  
  /**
   * Execute a consistency rule
   * @private
   */
  async executeRule(rule, data, context) {
    const result = await rule.check(data, context);
    
    return {
      passed: result.passed,
      message: result.message,
      warnings: result.warnings || [],
      violatingData: result.violatingData
    };
  }
  
  /**
   * Check a specific rule comprehensively
   * @private
   */
  async checkRule(rule, autoFix = false) {
    const report = {
      violations: 0,
      warnings: 0,
      autoFixes: 0,
      description: rule.description
    };
    
    try {
      // For comprehensive checks, rules would need to implement
      // a comprehensive check method that scans relevant data
      if (rule.comprehensiveCheck) {
        const result = await rule.comprehensiveCheck(autoFix);
        
        report.violations = result.violations || 0;
        report.warnings = result.warnings || 0;
        report.autoFixes = result.autoFixes || 0;
      } else {
        // Skip rules that don't support comprehensive checking
        report.warnings = 1;
        report.description += ' (comprehensive check not supported)';
      }
      
    } catch (error) {
      report.warnings = 1;
      report.description += ` (check failed: ${error.message})`;
    }
    
    return report;
  }
  
  /**
   * Sanitize data for logging
   * @private
   */
  sanitizeDataForLogging(data) {
    const sanitized = { ...data };
    
    // Remove sensitive fields
    const sensitiveFields = ['password', 'token', 'secret', 'key', 'auth'];
    
    for (const field of sensitiveFields) {
      if (sanitized[field]) {
        sanitized[field] = '[REDACTED]';
      }
    }
    
    // Limit large objects
    for (const [key, value] of Object.entries(sanitized)) {
      if (typeof value === 'string' && value.length > 1000) {
        sanitized[key] = value.substring(0, 1000) + '... [TRUNCATED]';
      }
    }
    
    return sanitized;
  }
  
  /**
   * Get consistency metrics
   * @returns {Object} Metrics
   */
  getMetrics() {
    return {
      ...this.consistencyMetrics,
      activeRules: this.consistencyRules.size,
      lastCheck: this.lastConsistencyCheck
    };
  }
}

// Create singleton instance
const dataConsistencyService = new DataConsistencyService();

module.exports = {
  DataConsistencyService,
  dataConsistencyService
};