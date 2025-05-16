/**
 * Simple Tracked Records Repository
 * A streamlined repository for tracking DNS records
 */
const logger = require('../utils/logger');

class SimpleTrackedRepository {
  constructor(db) {
    this.db = db;
    this.tableName = 'dns_tracked_records';
  }
  
  /**
   * Track a DNS record
   * @param {string} provider - Provider name
   * @param {Object} record - Record to track
   * @returns {Promise<boolean>} Success status
   */
  async trackRecord(provider, record) {
    try {
      // Validate and set defaults to prevent constraint failures
      provider = provider || 'unknown';
      
      // Safety validations to prevent null values
      if (!record.id && !record.record_id) {
        logger.warn('Record is missing ID, cannot track');
        return false;
      }
      
      const recordId = record.id || record.record_id;
      const type = record.type || 'UNKNOWN';
      const name = record.name || 'unknown';
      const content = record.content || record.value || '';
      const ttl = record.ttl || 1;
      const proxied = record.proxied ? 1 : 0;
      
      // Current timestamp
      const now = new Date().toISOString();
      
      // Prepare metadata
      let metadata = null;
      if (record.metadata) {
        try {
          if (typeof record.metadata === 'string') {
            // Check if already JSON string
            metadata = record.metadata;
          } else {
            metadata = JSON.stringify(record.metadata);
          }
        } catch (error) {
          logger.warn(`Failed to stringify metadata: ${error.message}`);
        }
      }
      
      // SQL to insert or update
      const sql = `
        INSERT INTO ${this.tableName}
        (provider, record_id, type, name, content, ttl, proxied, tracked_at, metadata)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(provider, record_id) DO UPDATE SET
        type = excluded.type,
        name = excluded.name,
        content = excluded.content,
        ttl = excluded.ttl,
        proxied = excluded.proxied,
        updated_at = ?,
        metadata = excluded.metadata
      `;
      
      const result = await this.db.run(sql, [
        provider,
        recordId,
        type,
        name,
        content,
        ttl,
        proxied,
        now,
        metadata,
        now  // For the updated_at field in the UPDATE clause
      ]);
      
      return true;
    } catch (error) {
      logger.error(`Failed to track record: ${error.message}`);
      return false;
    }
  }
  
  /**
   * Get all tracked records
   * @returns {Promise<Object>} All tracked records
   */
  async getAllTrackedRecords() {
    try {
      const rows = await this.db.all(`SELECT * FROM ${this.tableName} ORDER BY provider, name`);
      
      // Format into nested structure
      const result = { providers: {} };
      
      for (const row of rows) {
        if (!result.providers[row.provider]) {
          result.providers[row.provider] = { records: {} };
        }
        
        result.providers[row.provider].records[row.record_id] = {
          id: row.record_id,
          type: row.type,
          name: row.name,
          content: row.content,
          ttl: row.ttl,
          proxied: row.proxied === 1,
          tracked_at: row.tracked_at,
          is_orphaned: row.is_orphaned === 1,
          orphaned_at: row.orphaned_at,
          metadata: row.metadata ? JSON.parse(row.metadata) : null
        };
      }
      
      return result;
    } catch (error) {
      logger.error(`Failed to get all tracked records: ${error.message}`);
      return { providers: {} };
    }
  }
  
  /**
   * Get tracked records for a provider
   * @param {string} provider - Provider name
   * @returns {Promise<Object>} Provider records
   */
  async getProviderRecords(provider) {
    try {
      // Ensure provider is never NULL
      provider = provider || 'unknown';
      
      const rows = await this.db.all(
        `SELECT * FROM ${this.tableName} WHERE provider = ? ORDER BY name`, 
        [provider]
      );
      
      const records = {};
      
      for (const row of rows) {
        records[row.record_id] = {
          id: row.record_id,
          type: row.type,
          name: row.name,
          content: row.content,
          ttl: row.ttl,
          proxied: row.proxied === 1,
          tracked_at: row.tracked_at,
          is_orphaned: row.is_orphaned === 1,
          orphaned_at: row.orphaned_at,
          metadata: row.metadata ? JSON.parse(row.metadata) : null
        };
      }
      
      return { records };
    } catch (error) {
      logger.error(`Failed to get provider records: ${error.message}`);
      return { records: {} };
    }
  }
  
  /**
   * Check if a record is tracked
   * @param {string} provider - Provider name
   * @param {string} recordId - Record ID
   * @returns {Promise<boolean>} Whether the record is tracked
   */
  async isTracked(provider, recordId) {
    try {
      // Ensure provider is never NULL
      provider = provider || 'unknown';
      
      const record = await this.db.get(
        `SELECT id FROM ${this.tableName} WHERE provider = ? AND record_id = ?`,
        [provider, recordId]
      );
      
      return !!record;
    } catch (error) {
      logger.error(`Failed to check if record is tracked: ${error.message}`);
      return false;
    }
  }
}

module.exports = SimpleTrackedRepository;