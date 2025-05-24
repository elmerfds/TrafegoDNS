/**
 * Provider Cache Repository
 * Manages the dns_records table which serves as a cache of all DNS records from the provider
 * This is NOT for app-managed records, but for ALL records from the provider
 */
const BaseRepository = require('./baseRepository');
const logger = require('../../utils/logger');

class ProviderCacheRepository extends BaseRepository {
  constructor(db) {
    super(db);
    this.tableName = 'dns_records';
    this.initialize();
  }

  /**
   * Initialize the repository, creating tables if needed
   */
  async initialize() {
    try {
      // Check if table exists
      const tableExists = await this.tableExists();

      if (!tableExists) {
        logger.info(`Creating ${this.tableName} table (provider cache)`);

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
            fingerprint TEXT,
            last_refreshed TEXT NOT NULL,
            UNIQUE(provider, record_id)
          )
        `);

        // Create indexes for performance
        await this.db.run(`CREATE INDEX IF NOT EXISTS idx_dns_provider ON ${this.tableName}(provider)`);
        await this.db.run(`CREATE INDEX IF NOT EXISTS idx_dns_name ON ${this.tableName}(name)`);
        await this.db.run(`CREATE INDEX IF NOT EXISTS idx_dns_type ON ${this.tableName}(type)`);
        await this.db.run(`CREATE INDEX IF NOT EXISTS idx_dns_orphaned ON ${this.tableName}(is_orphaned)`);
        await this.db.run(`CREATE INDEX IF NOT EXISTS idx_dns_lastrefresh ON ${this.tableName}(last_refreshed)`);

        logger.info(`Created ${this.tableName} table and indexes (provider cache)`);
      }
    } catch (error) {
      logger.error(`Failed to initialize ${this.tableName} table: ${error.message}`);
    }
  }

  /**
   * Check if the table exists
   * @returns {Promise<boolean>} Whether the table exists
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
   * Refresh the cache with records from the provider
   * @param {Array} records - Records from the provider
   * @param {string} provider - Provider name (cloudflare, digitalocean, etc.)
   * @returns {Promise<number>} Number of records refreshed
   */
  async refreshCache(records, provider) {
    try {
      if (!records || !Array.isArray(records)) {
        logger.warn(`Invalid records for cache refresh: ${JSON.stringify(records)}`);
        return 0;
      }

      // Ensure provider is not null
      if (!provider) {
        logger.warn('Null or undefined provider detected during cache refresh - using "unknown" provider');
        provider = 'unknown';
      }
      logger.info(`Refreshing provider cache with ${records.length} records from ${provider}`);
      
      // Start a transaction for bulk operations
      await this.db.beginTransaction();
      
      try {
        const now = new Date().toISOString();
        let refreshedCount = 0;

        // First record the existing record IDs for this provider
        const existingRecords = await this.getAllRecordIds(provider);
        const existingIds = new Set(existingRecords.map(r => r.record_id));
        const incomingIds = new Set();

        // Process each record
        for (const record of records) {
          if (!record) {
            logger.debug(`Skipping null record`);
            continue;
          }
          
          // Ensure required fields exist
          const recordId = record.id || record.record_id || `generated_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
          const recordType = record.type || 'UNKNOWN';
          const recordName = record.name || 'unknown.name';

          // Add to incoming IDs set
          incomingIds.add(recordId);

          // Create or update the record
          const fingerprint = this._generateFingerprint(record);
          
          await this.db.run(`
            INSERT INTO ${this.tableName} 
            (provider, record_id, type, name, content, ttl, proxied, tracked_at, updated_at, fingerprint, last_refreshed)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(provider, record_id) DO UPDATE SET
            type = excluded.type,
            name = excluded.name,
            content = excluded.content,
            ttl = excluded.ttl,
            proxied = excluded.proxied,
            updated_at = excluded.updated_at,
            fingerprint = excluded.fingerprint,
            last_refreshed = excluded.last_refreshed
          `, [
            provider,
            recordId,
            recordType,
            recordName,
            record.content || record.data || record.value || '',
            record.ttl || 1,
            record.proxied ? 1 : 0,
            now,
            now,
            fingerprint,
            now
          ]);

          refreshedCount++;
        }

        // Delete any records that no longer exist on the provider
        const idsToDelete = [...existingIds].filter(id => !incomingIds.has(id));
        if (idsToDelete.length > 0) {
          logger.info(`Removing ${idsToDelete.length} records from cache that no longer exist on provider`);
          
          for (const recordId of idsToDelete) {
            await this.db.run(`
              DELETE FROM ${this.tableName}
              WHERE provider = ? AND record_id = ?
            `, [provider, recordId]);
          }
        }

        // Commit the transaction
        await this.db.commit();
        
        logger.info(`Successfully refreshed ${refreshedCount} records in provider cache for ${provider}`);
        return refreshedCount;
      } catch (error) {
        // Rollback on error
        await this.db.rollback();
        throw error;
      }
    } catch (error) {
      logger.error(`Failed to refresh provider cache: ${error.message}`);
      return 0;
    }
  }

  /**
   * Get all records from the provider cache
   * @param {string} provider - Provider name
   * @param {Object} [options={}] - Filter options
   * @returns {Promise<Array>} Array of records
   */
  async getRecords(provider, options = {}) {
    try {
      let query = `SELECT * FROM ${this.tableName} WHERE provider = ?`;
      const params = [provider];

      // Apply filters
      if (options.type) {
        query += ` AND type = ?`;
        params.push(options.type.toUpperCase());
      }

      if (options.name) {
        query += ` AND name = ?`;
        params.push(options.name);
      }

      if (options.isOrphaned === true) {
        query += ` AND is_orphaned = 1`;
      } else if (options.isOrphaned === false) {
        query += ` AND is_orphaned = 0`;
      }

      // Add ordering
      query += ` ORDER BY name ASC`;

      // Add limit if specified
      if (options.limit && !isNaN(options.limit)) {
        query += ` LIMIT ?`;
        params.push(options.limit);
      }

      const records = await this.db.all(query, params);
      return records.map(this._formatRecordFromDb);
    } catch (error) {
      logger.error(`Failed to get records from provider cache: ${error.message}`);
      return [];
    }
  }

  /**
   * Get all record IDs for a provider
   * @param {string} provider - Provider name
   * @returns {Promise<Array>} Array of record objects with id and record_id fields
   */
  async getAllRecordIds(provider) {
    try {
      const records = await this.db.all(`
        SELECT id, record_id FROM ${this.tableName}
        WHERE provider = ?
      `, [provider]);
      
      return records;
    } catch (error) {
      logger.error(`Failed to get record IDs from provider cache: ${error.message}`);
      return [];
    }
  }

  /**
   * Get a record by its provider record ID
   * @param {string} recordId - Record ID from the provider
   * @param {string} provider - Provider name
   * @returns {Promise<Object|null>} Record or null if not found
   */
  async getRecordByProviderId(recordId, provider) {
    try {
      const record = await this.db.get(`
        SELECT * FROM ${this.tableName}
        WHERE provider = ? AND record_id = ?
      `, [provider, recordId]);

      return record ? this._formatRecordFromDb(record) : null;
    } catch (error) {
      logger.error(`Failed to get record by provider ID: ${error.message}`);
      return null;
    }
  }

  /**
   * Get a record by name and type
   * @param {string} name - Record name (hostname)
   * @param {string} type - Record type (A, CNAME, etc.)
   * @param {string} provider - Provider name
   * @returns {Promise<Object|null>} Record or null if not found
   */
  async getRecordByNameAndType(name, type, provider) {
    try {
      const record = await this.db.get(`
        SELECT * FROM ${this.tableName}
        WHERE provider = ? AND name = ? AND type = ?
      `, [provider, name, type.toUpperCase()]);

      return record ? this._formatRecordFromDb(record) : null;
    } catch (error) {
      logger.error(`Failed to get record by name and type: ${error.message}`);
      return null;
    }
  }

  /**
   * Get the last refresh time for a provider
   * @param {string} provider - Provider name
   * @returns {Promise<string|null>} ISO timestamp of last refresh or null
   */
  async getLastRefreshTime(provider) {
    try {
      const result = await this.db.get(`
        SELECT MAX(last_refreshed) as last_refreshed
        FROM ${this.tableName}
        WHERE provider = ?
      `, [provider]);

      return result ? result.last_refreshed : null;
    } catch (error) {
      logger.error(`Failed to get last refresh time: ${error.message}`);
      return null;
    }
  }

  /**
   * Check if the cache needs refreshing based on TTL
   * @param {string} provider - Provider name
   * @param {number} cacheTtl - Cache TTL in seconds
   * @returns {Promise<boolean>} Whether the cache needs refreshing
   */
  async needsRefresh(provider, cacheTtl) {
    try {
      const lastRefresh = await this.getLastRefreshTime(provider);
      
      // If no records or no last refresh, definitely needs refresh
      if (!lastRefresh) {
        return true;
      }
      
      // Calculate if TTL has expired
      const lastRefreshTime = new Date(lastRefresh).getTime();
      const now = Date.now();
      const ttlMs = cacheTtl * 1000;
      
      return (now - lastRefreshTime) > ttlMs;
    } catch (error) {
      logger.error(`Failed to check if cache needs refresh: ${error.message}`);
      // On error, assume refresh is needed
      return true;
    }
  }

  /**
   * Delete a record from the cache
   * @param {string} provider - Provider name
   * @param {string} recordId - Provider record ID
   * @returns {Promise<boolean>} - Success status
   */
  async deleteRecord(provider, recordId) {
    try {
      const result = await this.db.run(`
        DELETE FROM ${this.tableName}
        WHERE provider = ? AND id = ?
      `, [provider, recordId]);
      
      if (result.changes > 0) {
        logger.debug(`Deleted record ${recordId} from provider cache`);
        return true;
      } else {
        logger.debug(`Record ${recordId} not found in provider cache for deletion`);
        return false;
      }
    } catch (error) {
      logger.error(`Failed to delete record from provider cache: ${error.message}`);
      return false;
    }
  }
  
  /**
   * Generate a fingerprint for a record
   * Used to detect changes in record content
   * @param {Object} record - DNS record
   * @returns {string} - Record fingerprint
   * @private
   */
  _generateFingerprint(record) {
    const content = record.content || record.data || record.value || '';
    const fieldsToHash = [
      record.type,
      record.name,
      content,
      record.ttl,
      record.proxied ? 1 : 0
    ];
    
    return fieldsToHash.join('::');
  }

  /**
   * Format a record from the database for external use
   * @param {Object} dbRecord - Record from database
   * @returns {Object} Formatted record
   * @private
   */
  _formatRecordFromDb(dbRecord) {
    return {
      id: dbRecord.id,
      providerId: dbRecord.record_id,
      provider: dbRecord.provider,
      type: dbRecord.type,
      name: dbRecord.name,
      content: dbRecord.content,
      ttl: dbRecord.ttl,
      proxied: dbRecord.proxied === 1,
      isOrphaned: dbRecord.is_orphaned === 1,
      orphanedAt: dbRecord.orphaned_at,
      trackedAt: dbRecord.tracked_at,
      updatedAt: dbRecord.updated_at,
      lastRefreshed: dbRecord.last_refreshed
    };
  }
}

module.exports = ProviderCacheRepository;