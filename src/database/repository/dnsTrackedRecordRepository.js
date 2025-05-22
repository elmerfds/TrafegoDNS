/**
 * DNS Tracked Record Repository
 * Manages database operations for DNS records tracked by the application
 */
const logger = require('../../utils/logger');

class DNSTrackedRecordRepository {
  constructor(db) {
    this.db = db;
    this.tableName = 'dns_tracked_records';
    this.tableExists = false; // Will be set during initialization
    
    // Skip auto-initialize in constructor to avoid race conditions 
    // and allow explicit initialization control
  }

  /**
   * Initialize the repository, creating tables if needed
   * @param {Object} options - Initialization options
   * @param {boolean} [options.createIfMissing=true] - Create table if it doesn't exist
   * @param {boolean} [options.skipIfExists=false] - Skip initialization if table exists
   * @returns {Promise<boolean>} - Whether initialization was successful
   */
  async initialize(options = {}) {
    const { createIfMissing = true, skipIfExists = false } = options;
    
    try {
      // Check if table exists
      this.tableExists = await this.checkTableExists();
      
      // If table exists and we're skipping, return early
      if (this.tableExists && skipIfExists) {
        logger.debug(`${this.tableName} table already exists, skipping initialization`);
        return true;
      }

      // Create the table if it doesn't exist and we're allowed to create it
      if (!this.tableExists && createIfMissing) {
        logger.info(`Creating ${this.tableName} table`);

        // Use IF NOT EXISTS to avoid errors if the table was created in parallel
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
            first_seen TEXT,
            metadata TEXT,
            UNIQUE(provider, record_id)
          )
        `);

        // Create indexes for performance - also with IF NOT EXISTS
        await this.db.run(`CREATE INDEX IF NOT EXISTS idx_dns_tracked_provider ON ${this.tableName}(provider)`);
        await this.db.run(`CREATE INDEX IF NOT EXISTS idx_dns_tracked_name ON ${this.tableName}(name)`);
        await this.db.run(`CREATE INDEX IF NOT EXISTS idx_dns_tracked_type ON ${this.tableName}(type)`);
        await this.db.run(`CREATE INDEX IF NOT EXISTS idx_dns_tracked_orphaned ON ${this.tableName}(is_orphaned)`);

        logger.info(`Created ${this.tableName} table and indexes`);
        
        // Update table exists flag
        this.tableExists = true;
      }
      
      return true;
    } catch (error) {
      logger.error(`Failed to initialize DNS tracked records table: ${error.message}`);
      // Don't throw the error, but return false to indicate failure
      return false;
    }
  }
  
  /**
   * Check if the table exists
   * @returns {Promise<boolean>} - Whether the table exists
   */
  async checkTableExists() {
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
      // Check if metadata is already a string (it shouldn't be double stringified)
      let metadata = null;
      if (record.metadata) {
        if (typeof record.metadata === 'string') {
          // If it's already a string, use it as is
          metadata = record.metadata;
        } else {
          // If it's an object, stringify it
          metadata = JSON.stringify(record.metadata);
        }
      }
      
      // Validate required parameters to prevent NOT NULL constraint failures
      if (!record.provider) {
        logger.warn('Provider is missing when tracking DNS record - using "unknown" provider');  
        record.provider = 'unknown';
      }
      
      // Ensure provider is never null or undefined - redundant check as safeguard
      record.provider = record.provider || 'unknown';
      
      if (!record.record_id) {
        throw new Error('Record ID is required when tracking DNS records');
      }
      
      try {
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
          record.type || 'UNKNOWN',
          record.name || 'unknown',
          record.content || '',
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
      } catch (dbError) {
        // Try to reconnect once if the error might be connection-related
        if (dbError.message.includes('database is locked') || 
            dbError.message.includes('no such table') ||
            dbError.message.includes('SQLITE_BUSY')) {
          
          logger.debug('Attempting to re-initialize database connection for tracking records');
          
          // Wait a moment for the database to become available
          await new Promise(resolve => setTimeout(resolve, 500));
          
          // Ensure the table exists before continuing
          await this.initialize();
          
          // Try the operation again
          const retryResult = await this.db.run(`
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
            record.type || 'UNKNOWN',
            record.name || 'unknown',
            record.content || '',
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
        } else {
          // If it's not a connection issue, rethrow
          throw dbError;
        }
      }
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
   * Check if a record is tracked by type and name
   * @param {string} provider - DNS provider name
   * @param {string} type - Record type
   * @param {string} name - Record name
   * @returns {Promise<boolean>} - Whether the record is tracked
   */
  async isTrackedByTypeAndName(provider, type, name) {
    try {
      const record = await this.db.get(`
        SELECT id FROM ${this.tableName}
        WHERE provider = ? AND type = ? AND name = ?
      `, [provider, type, name]);

      return !!record;
    } catch (error) {
      logger.error(`Failed to check if record is tracked by type and name: ${error.message}`);
      return false;
    }
  }

  /**
   * Update record ID by type and name
   * @param {string} provider - DNS provider name
   * @param {string} type - Record type
   * @param {string} name - Record name
   * @param {string} newRecordId - New record ID
   * @returns {Promise<boolean>} - Success status
   */
  async updateRecordByTypeAndName(provider, type, name, newRecordId) {
    try {
      // First check if the new record ID already exists in the database
      const existingByNewId = await this.db.get(`
        SELECT id FROM ${this.tableName}
        WHERE provider = ? AND record_id = ?
      `, [provider, newRecordId]);

      // Get the existing record with the given type and name
      const existingByType = await this.db.get(`
        SELECT id, record_id, is_orphaned, orphaned_at
        FROM ${this.tableName}
        WHERE provider = ? AND type = ? AND name = ?
      `, [provider, type, name]);

      // If the new record ID already exists AND there's a different record with this type/name
      if (existingByNewId && existingByType && existingByNewId.id !== existingByType.id) {
        // We need to merge the records - keep the one with the new ID
        // and transfer any orphaned status from the old one

        if (existingByType.is_orphaned === 1) {
          // If the type/name record was orphaned, update the orphaned status of the new record
          await this.db.run(`
            UPDATE ${this.tableName}
            SET is_orphaned = 1, orphaned_at = ?, updated_at = ?
            WHERE id = ?
          `, [existingByType.orphaned_at, new Date().toISOString(), existingByNewId.id]);
        }

        // Delete the old record since we've transferred its state
        await this.db.run(`
          DELETE FROM ${this.tableName}
          WHERE id = ?
        `, [existingByType.id]);

        logger.debug(`Merged record ${type}:${name} into existing record ID ${newRecordId}`);
        return true;
      }

      // If the new record ID exists but there's no record with this type/name, nothing to do
      if (existingByNewId && !existingByType) {
        logger.debug(`Record ID ${newRecordId} already exists, but no record with type=${type}, name=${name} found`);
        return false;
      }

      // If there's no record with the new ID but there is a record with this type/name, update normally
      if (!existingByNewId && existingByType) {
        const now = new Date().toISOString();

        const result = await this.db.run(`
          UPDATE ${this.tableName}
          SET record_id = ?, updated_at = ?
          WHERE id = ?
        `, [newRecordId, now, existingByType.id]);

        return result.changes > 0;
      }

      // No records found by ID or type/name - nothing to update
      logger.debug(`No records found to update for provider=${provider}, type=${type}, name=${name}`);
      return false;
    } catch (error) {
      logger.error(`Failed to update record by type and name: ${error.message}`);
      throw error;
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
      // First check if the new record ID already exists in the database
      const existingRecord = await this.db.get(`
        SELECT id FROM ${this.tableName}
        WHERE provider = ? AND record_id = ?
      `, [provider, newRecordId]);

      // If the new record ID already exists, we need to merge the records
      if (existingRecord) {
        // Get the type and name of both records
        const oldRecord = await this.db.get(`
          SELECT id, type, name, content, ttl, proxied, is_orphaned, orphaned_at, tracked_at
          FROM ${this.tableName}
          WHERE provider = ? AND record_id = ?
        `, [provider, oldRecordId]);

        if (!oldRecord) {
          logger.warn(`Cannot update record ID: Old record ${oldRecordId} not found`);
          return false;
        }

        // Handle the case where we need to merge orphaned status
        if (oldRecord.is_orphaned === 1) {
          // If the old record was orphaned, update the orphaned status of the new record
          await this.db.run(`
            UPDATE ${this.tableName}
            SET is_orphaned = 1, orphaned_at = ?
            WHERE id = ?
          `, [oldRecord.orphaned_at, existingRecord.id]);
        }

        // Delete the old record since we've transferred its state
        await this.db.run(`
          DELETE FROM ${this.tableName}
          WHERE id = ?
        `, [oldRecord.id]);

        logger.debug(`Merged record ID ${oldRecordId} into existing record ID ${newRecordId}`);
        return true;
      }

      // If the new record ID doesn't exist, perform a normal update
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
      
      // CRITICAL FIX: Check if we're already in a transaction first
      const isInTransaction = this.db.inTransaction;
      
      try {
        // Only start a transaction if we're not already in one
        if (!isInTransaction) {
          try {
            // First ensure no active transaction by attempting a rollback
            try {
              logger.debug('Attempting preliminary rollback to clear any active transactions');
              await this.db.rollback();
            } catch (rollbackError) {
              // Ignore "no transaction is active" errors
              if (!rollbackError.message.includes('no transaction is active')) {
                logger.warn(`Unexpected rollback error: ${rollbackError.message}`);
              }
            }
            
            // Now start a fresh transaction
            logger.debug('Starting new transaction for DNS tracked records migration');
            await this.db.beginTransaction();
          } catch (txError) {
            // If we can't start a transaction (like "already in transaction"), proceed anyway
            logger.warn(`Could not start DNS tracked records migration transaction: ${txError.message}. Proceeding without transaction.`);
          }
        } else {
          logger.debug('Using existing transaction for DNS tracked records migration');
        }

        // Process each provider's records
        for (const provider in jsonData.providers) {
          const providerData = jsonData.providers[provider];

          if (!providerData || !providerData.records) continue;

          for (const recordId in providerData.records) {
            try {
              const record = providerData.records[recordId];

              if (!record || !record.type || !record.name) continue;

              // Add metadata to track that this record was created by the app
              const metadata = {
                ...(record.metadata || {}),
                appManaged: true,
                migratedAt: new Date().toISOString()
              };

              // Use direct SQL to avoid nested operations that could cause transaction issues
              const now = new Date().toISOString();
              const metadataStr = JSON.stringify(metadata);
              const content = record.content || record.value || record.domain || '';
              const ttl = record.ttl || 1;
              const proxied = !!record.proxied ? 1 : 0;
              const isOrphaned = record.is_orphaned ? 1 : 0;
              const orphanedAt = record.orphaned_at || null;
              const trackedAt = record.tracked_at || record.createdAt || now;
              
              // Use INSERT OR REPLACE to handle conflicts
              await this.db.run(`
                INSERT OR REPLACE INTO ${this.tableName}
                (provider, record_id, type, name, content, ttl, proxied, is_orphaned, orphaned_at, tracked_at, updated_at, metadata)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
              `, [
                provider, 
                recordId, 
                record.type,
                record.name,
                content,
                ttl,
                proxied,
                isOrphaned,
                orphanedAt,
                trackedAt,
                now,
                metadataStr
              ]);

              migratedCount++;
            } catch (recordError) {
              // Log but continue with other records
              logger.warn(`Error migrating DNS tracked record ${recordId}: ${recordError.message}`);
            }
          }
        }

        // Only commit if we started the transaction
        if (!isInTransaction && this.db.inTransaction) {
          try {
            await this.db.commit();
            logger.debug('Committed transaction for DNS tracked records migration');
          } catch (commitError) {
            logger.error(`Failed to commit DNS tracked records migration: ${commitError.message}`);
            // Attempt rollback
            try {
              await this.db.rollback();
            } catch (rollbackError) {
              logger.error(`Additionally failed to rollback: ${rollbackError.message}`);
            }
          }
        }
        
        logger.info(`Successfully migrated ${migratedCount} DNS tracked records to SQLite`);
        return migratedCount;
      } catch (error) {
        // Rollback only if we started the transaction
        if (!isInTransaction && this.db.inTransaction) {
          try {
            await this.db.rollback();
            logger.debug('Rolled back transaction due to DNS tracked records migration error');
          } catch (rollbackError) {
            logger.error(`Failed to rollback: ${rollbackError.message}`);
          }
        }
        throw error;
      }
    } catch (error) {
      logger.error(`Failed to migrate DNS tracked records: ${error.message}`);
      return 0;
    }
  }

  /**
   * Update record metadata
   * @param {string} provider - DNS provider name
   * @param {string} recordId - Record ID
   * @param {string} metadata - JSON string of metadata
   * @returns {Promise<boolean>} - Success status
   */
  async updateRecordMetadata(provider, recordId, metadata) {
    try {
      const now = new Date().toISOString();

      const result = await this.db.run(`
        UPDATE ${this.tableName}
        SET metadata = ?, updated_at = ?
        WHERE provider = ? AND record_id = ?
      `, [metadata, now, provider, recordId]);

      return result.changes > 0;
    } catch (error) {
      logger.error(`Failed to update record metadata: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get record metadata
   * @param {string} provider - DNS provider name
   * @param {string} recordId - Record ID
   * @returns {Promise<Object|null>} - Record metadata or null
   */
  async getRecordMetadata(provider, recordId) {
    try {
      const record = await this.db.get(`
        SELECT metadata FROM ${this.tableName}
        WHERE provider = ? AND record_id = ?
      `, [provider, recordId]);

      if (!record || !record.metadata) {
        return null;
      }

      try {
        return JSON.parse(record.metadata);
      } catch (parseError) {
        logger.error(`Failed to parse record metadata: ${parseError.message}`);
        return null;
      }
    } catch (error) {
      logger.error(`Failed to get record metadata: ${error.message}`);
      return null;
    }
  }

  /**
   * Check if a record is app managed
   * @param {string} provider - DNS provider name
   * @param {string} recordId - Record ID
   * @returns {Promise<boolean>} - Whether the record is app managed
   */
  async isAppManaged(provider, recordId) {
    try {
      const metadata = await this.getRecordMetadata(provider, recordId);
      return metadata && metadata.appManaged === true;
    } catch (error) {
      logger.error(`Failed to check if record is app managed: ${error.message}`);
      return false;
    }
  }
  
  /**
   * Set the first_seen timestamp for a record
   * @param {string} provider - DNS provider name
   * @param {string} recordId - Record ID
   * @param {string} timestamp - ISO timestamp
   * @returns {Promise<boolean>} - Success status
   */
  async setRecordFirstSeen(provider, recordId, timestamp) {
    try {
      const now = new Date().toISOString();
      const firstSeen = timestamp || now;

      // Use an UPDATE statement with a WHERE clause that checks if first_seen is NULL
      // This ensures we only set first_seen once (on first detection)
      const result = await this.db.run(`
        UPDATE ${this.tableName}
        SET first_seen = CASE WHEN first_seen IS NULL THEN ? ELSE first_seen END,
            updated_at = ?
        WHERE provider = ? AND record_id = ?
      `, [firstSeen, now, provider, recordId]);

      return result.changes > 0;
    } catch (error) {
      logger.error(`Failed to set record first_seen timestamp: ${error.message}`);
      return false;
    }
  }
  
  /**
   * Get the first_seen timestamp for a record
   * @param {string} provider - DNS provider name
   * @param {string} recordId - Record ID
   * @returns {Promise<string|null>} - First seen timestamp or null
   */
  async getRecordFirstSeen(provider, recordId) {
    try {
      const record = await this.db.get(`
        SELECT first_seen FROM ${this.tableName}
        WHERE provider = ? AND record_id = ?
      `, [provider, recordId]);
      
      return record ? record.first_seen : null;
    } catch (error) {
      logger.error(`Failed to get record first_seen timestamp: ${error.message}`);
      return null;
    }
  }
}

module.exports = DNSTrackedRecordRepository;