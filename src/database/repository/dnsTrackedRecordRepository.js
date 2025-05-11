/**
 * DNS Tracked Record Repository
 * Manages database operations for DNS records tracked by the application
 */
const logger = require('../../utils/logger');

class DNSTrackedRecordRepository {
  constructor(db) {
    this.db = db;
    this.tableName = 'dns_tracked_records';
    this.initialize();
  }

  /**
   * Initialize the repository, creating tables if needed
   */
  async initialize() {
    try {
      // Create the dns_tracked_records table if it doesn't exist
      const tableExists = await this.tableExists();
      
      if (!tableExists) {
        logger.info(`Creating ${this.tableName} table`);
        
        await this.db.run(`
          CREATE TABLE IF NOT EXISTS ${this.tableName} (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            provider TEXT NOT NULL,
            record_id TEXT NOT NULL,
            type TEXT NOT NULL,
            name TEXT NOT NULL,
            content TEXT,
            ttl INTEGER,
            proxied INTEGER DEFAULT 0,
            is_orphaned INTEGER DEFAULT 0,
            orphaned_at TEXT,
            tracked_at TEXT NOT NULL,
            updated_at TEXT,
            metadata TEXT,
            UNIQUE(provider, record_id)
          )
        `);
        
        // Create indexes for performance
        await this.db.run(`CREATE INDEX IF NOT EXISTS idx_dns_tracked_provider ON ${this.tableName}(provider)`);
        await this.db.run(`CREATE INDEX IF NOT EXISTS idx_dns_tracked_name ON ${this.tableName}(name)`);
        await this.db.run(`CREATE INDEX IF NOT EXISTS idx_dns_tracked_type ON ${this.tableName}(type)`);
        await this.db.run(`CREATE INDEX IF NOT EXISTS idx_dns_tracked_orphaned ON ${this.tableName}(is_orphaned)`);
        
        logger.info(`Created ${this.tableName} table and indexes`);
      }
    } catch (error) {
      logger.error(`Failed to initialize DNS tracked records table: ${error.message}`);
      throw error;
    }
  }
  
  /**
   * Check if the table exists
   * @returns {Promise<boolean>} - Whether the table exists
   */
  async tableExists() {
    try {
      const result = await this.db.get(`
        SELECT name FROM sqlite_master 
        WHERE type='table' AND name=?
      `, [this.tableName]);
      
      return !!result;
    } catch (error) {
      logger.error(`Failed to check if table exists: ${error.message}`);
      return false;
    }
  }
  
  /**
   * Track a DNS record
   * @param {Object} record - Record to track
   * @returns {Promise<Object>} - Tracked record
   */
  async trackRecord(record) {
    try {
      const now = new Date().toISOString();
      const metadata = record.metadata ? JSON.stringify(record.metadata) : null;
      
      const result = await this.db.run(`
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
      `, [
        record.provider,
        record.record_id,
        record.type,
        record.name,
        record.content,
        record.ttl || 1,
        record.proxied ? 1 : 0,
        now,
        metadata,
        now
      ]);
      
      return {
        ...record,
        tracked_at: now
      };
    } catch (error) {
      logger.error(`Failed to track DNS record: ${error.message}`);
      throw error;
    }
  }
  
  /**
   * Untrack a DNS record
   * @param {string} provider - DNS provider name
   * @param {string} recordId - Record ID
   * @returns {Promise<boolean>} - Success status
   */
  async untrackRecord(provider, recordId) {
    try {
      const result = await this.db.run(`
        DELETE FROM ${this.tableName}
        WHERE provider = ? AND record_id = ?
      `, [provider, recordId]);
      
      return result.changes > 0;
    } catch (error) {
      logger.error(`Failed to untrack DNS record: ${error.message}`);
      throw error;
    }
  }
  
  /**
   * Check if a record is tracked
   * @param {string} provider - DNS provider name
   * @param {string} recordId - Record ID
   * @returns {Promise<boolean>} - Whether the record is tracked
   */
  async isTracked(provider, recordId) {
    try {
      const record = await this.db.get(`
        SELECT id FROM ${this.tableName}
        WHERE provider = ? AND record_id = ?
      `, [provider, recordId]);
      
      return !!record;
    } catch (error) {
      logger.error(`Failed to check if record is tracked: ${error.message}`);
      return false;
    }
  }
  
  /**
   * Update DNS record ID (when record ID changes but it's the same record)
   * @param {string} provider - DNS provider name
   * @param {string} oldRecordId - Old record ID
   * @param {string} newRecordId - New record ID
   * @returns {Promise<boolean>} - Success status
   */
  async updateRecordId(provider, oldRecordId, newRecordId) {
    try {
      const now = new Date().toISOString();
      
      const result = await this.db.run(`
        UPDATE ${this.tableName}
        SET record_id = ?, updated_at = ?
        WHERE provider = ? AND record_id = ?
      `, [newRecordId, now, provider, oldRecordId]);
      
      return result.changes > 0;
    } catch (error) {
      logger.error(`Failed to update record ID: ${error.message}`);
      throw error;
    }
  }
  
  /**
   * Get all tracked records for all providers
   * @returns {Promise<Object>} - Object with providers and their records
   */
  async getAllTrackedRecords() {
    try {
      const rows = await this.db.all(`
        SELECT * FROM ${this.tableName}
        ORDER BY provider, name
      `);
      
      // Format data to match the JSON structure expected by the application
      const result = { providers: {} };
      
      for (const row of rows) {
        // Initialize provider if needed
        if (!result.providers[row.provider]) {
          result.providers[row.provider] = { records: {} };
        }
        
        // Format record for compatibility with JSON format
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
   * Get tracked records for a specific provider
   * @param {string} provider - DNS provider name
   * @returns {Promise<Object>} - Provider records
   */
  async getProviderRecords(provider) {
    try {
      const rows = await this.db.all(`
        SELECT * FROM ${this.tableName}
        WHERE provider = ?
        ORDER BY name
      `, [provider]);
      
      // Format results for compatibility
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
   * Mark a record as orphaned
   * @param {string} provider - DNS provider name
   * @param {string} recordId - Record ID
   * @returns {Promise<boolean>} - Success status
   */
  async markRecordOrphaned(provider, recordId) {
    try {
      const now = new Date().toISOString();
      
      const result = await this.db.run(`
        UPDATE ${this.tableName}
        SET is_orphaned = 1, orphaned_at = ?, updated_at = ?
        WHERE provider = ? AND record_id = ?
      `, [now, now, provider, recordId]);
      
      return result.changes > 0;
    } catch (error) {
      logger.error(`Failed to mark record as orphaned: ${error.message}`);
      throw error;
    }
  }
  
  /**
   * Unmark a record as orphaned
   * @param {string} provider - DNS provider name
   * @param {string} recordId - Record ID
   * @returns {Promise<boolean>} - Success status
   */
  async unmarkRecordOrphaned(provider, recordId) {
    try {
      const now = new Date().toISOString();
      
      const result = await this.db.run(`
        UPDATE ${this.tableName}
        SET is_orphaned = 0, orphaned_at = NULL, updated_at = ?
        WHERE provider = ? AND record_id = ?
      `, [now, provider, recordId]);
      
      return result.changes > 0;
    } catch (error) {
      logger.error(`Failed to unmark record as orphaned: ${error.message}`);
      throw error;
    }
  }
  
  /**
   * Check if a record is orphaned
   * @param {string} provider - DNS provider name
   * @param {string} recordId - Record ID
   * @returns {Promise<boolean>} - Whether the record is orphaned
   */
  async isRecordOrphaned(provider, recordId) {
    try {
      const record = await this.db.get(`
        SELECT is_orphaned FROM ${this.tableName}
        WHERE provider = ? AND record_id = ?
      `, [provider, recordId]);
      
      return record ? record.is_orphaned === 1 : false;
    } catch (error) {
      logger.error(`Failed to check if record is orphaned: ${error.message}`);
      return false;
    }
  }
  
  /**
   * Get the orphaned time for a record
   * @param {string} provider - DNS provider name
   * @param {string} recordId - Record ID
   * @returns {Promise<string|null>} - Orphaned time or null if not orphaned
   */
  async getRecordOrphanedTime(provider, recordId) {
    try {
      const record = await this.db.get(`
        SELECT orphaned_at FROM ${this.tableName}
        WHERE provider = ? AND record_id = ? AND is_orphaned = 1
      `, [provider, recordId]);
      
      return record ? record.orphaned_at : null;
    } catch (error) {
      logger.error(`Failed to get record orphaned time: ${error.message}`);
      return null;
    }
  }
  
  /**
   * Get all records by hostname pattern
   * @param {string} hostname - Hostname pattern (can use % as wildcard)
   * @returns {Promise<Array>} - Array of matching records
   */
  async getRecordsByHostname(hostname) {
    try {
      // Use LIKE for wildcard matching with % character
      const rows = await this.db.all(`
        SELECT * FROM ${this.tableName}
        WHERE name LIKE ?
        ORDER BY provider, name
      `, [hostname]);
      
      return rows.map(row => ({
        provider: row.provider,
        id: row.record_id,
        type: row.type,
        name: row.name,
        content: row.content,
        ttl: row.ttl,
        proxied: row.proxied === 1,
        tracked_at: row.tracked_at,
        is_orphaned: row.is_orphaned === 1,
        orphaned_at: row.orphaned_at
      }));
    } catch (error) {
      logger.error(`Failed to get records by hostname: ${error.message}`);
      return [];
    }
  }
  
  /**
   * Get records by orphaned status
   * @param {boolean} isOrphaned - Whether to get orphaned or non-orphaned records
   * @returns {Promise<Array>} - Array of matching records
   */
  async getRecordsByOrphanedStatus(isOrphaned) {
    try {
      const orphanValue = isOrphaned ? 1 : 0;
      
      const rows = await this.db.all(`
        SELECT * FROM ${this.tableName}
        WHERE is_orphaned = ?
        ORDER BY provider, name
      `, [orphanValue]);
      
      return rows.map(row => ({
        provider: row.provider,
        id: row.record_id,
        type: row.type,
        name: row.name,
        content: row.content,
        ttl: row.ttl,
        proxied: row.proxied === 1,
        tracked_at: row.tracked_at,
        is_orphaned: row.is_orphaned === 1,
        orphaned_at: row.orphaned_at
      }));
    } catch (error) {
      logger.error(`Failed to get records by orphaned status: ${error.message}`);
      return [];
    }
  }
  
  /**
   * Migrate JSON data to SQLite database
   * @param {Object} jsonData - JSON data from file
   * @returns {Promise<number>} - Number of migrated records
   */
  async migrateFromJson(jsonData) {
    try {
      if (!jsonData || !jsonData.providers) {
        logger.warn('No valid JSON data provided for migration');
        return 0;
      }
      
      let migratedCount = 0;
      
      // Begin transaction for performance
      await this.db.beginTransaction();
      
      try {
        for (const provider in jsonData.providers) {
          const providerData = jsonData.providers[provider];
          
          if (!providerData || !providerData.records) continue;
          
          for (const recordId in providerData.records) {
            const record = providerData.records[recordId];
            
            if (!record || !record.type || !record.name) continue;
            
            await this.trackRecord({
              provider,
              record_id: recordId,
              type: record.type,
              name: record.name,
              content: record.content || record.value || record.domain || '',
              ttl: record.ttl || 1,
              proxied: !!record.proxied,
              is_orphaned: record.is_orphaned ? 1 : 0,
              orphaned_at: record.orphaned_at || null,
              tracked_at: record.tracked_at || record.createdAt || new Date().toISOString(),
              metadata: record.metadata || null
            });
            
            migratedCount++;
          }
        }
        
        // Commit the transaction
        await this.db.commit();
        logger.info(`Successfully migrated ${migratedCount} DNS tracked records to SQLite`);
        
        return migratedCount;
      } catch (transactionError) {
        // Rollback on error
        await this.db.rollback();
        throw transactionError;
      }
    } catch (error) {
      logger.error(`Failed to migrate DNS tracked records: ${error.message}`);
      return 0;
    }
  }
}

module.exports = DNSTrackedRecordRepository;