/**
 * Managed Records Repository
 * Manages the dns_tracked_records table which stores records created and managed by the application
 * This is ONLY for app-managed records, not all records from the provider
 */
const logger = require('../../utils/logger');

class ManagedRecordsRepository {
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
        logger.info(`Creating ${this.tableName} table (app-managed records)`);

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

        logger.info(`Created ${this.tableName} table and indexes (app-managed records)`);
      }
    } catch (error) {
      logger.error(`Failed to initialize managed records table: ${error.message}`);
      // Don't throw the error, let the application continue
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
   * Track a DNS record (add to managed records)
   * @param {string} provider - DNS provider name
   * @param {Object} record - Record to track
   * @param {boolean} [isAppManaged=true] - Whether the record is managed by the app
   * @returns {Promise<boolean>} - Success status
   */
  async trackRecord(provider, record, isAppManaged = true) {
    try {
      // Validate record
      if (!record || !record.id || !record.type || !record.name) {
        logger.warn(`Cannot track invalid record: ${JSON.stringify(record)}`);
        return false;
      }
      
      // Ensure provider is not null or undefined
      if (!provider) {
        logger.warn(`Provider is undefined for record ${record.name} (${record.type}) - using record's provider or "unknown"`);
        provider = record.provider || 'unknown';
      }
      
      const now = new Date().toISOString();
      
      // Create metadata object
      const metadata = {
        ...(record.metadata || {}),
        appManaged: isAppManaged,
        trackedAt: now
      };
      
      // Insert or update the record
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
        provider,
        record.id,
        record.type,
        record.name,
        record.content || record.data || record.value || '',
        record.ttl || 1,
        record.proxied ? 1 : 0,
        now,
        JSON.stringify(metadata),
        now
      ]);
      
      logger.debug(`Tracked record ${record.name} (${record.type}) with ID ${record.id} for provider ${provider}`);
      return true;
    } catch (error) {
      logger.error(`Failed to track DNS record: ${error.message}`);
      return false;
    }
  }
  
  /**
   * Untrack a DNS record (remove from managed records)
   * @param {string} provider - DNS provider name
   * @param {string} recordId - Record ID
   * @returns {Promise<boolean>} - Success status
   */
  async untrackRecord(provider, recordId) {
    try {
      // Delete the record
      const result = await this.db.run(`
        DELETE FROM ${this.tableName}
        WHERE provider = ? AND record_id = ?
      `, [provider, recordId]);
      
      // Return success if at least one record was affected
      return result.changes > 0;
    } catch (error) {
      logger.error(`Failed to untrack DNS record: ${error.message}`);
      return false;
    }
  }
  
  /**
   * Check if a record is being tracked
   * @param {string} provider - DNS provider name
   * @param {string} recordId - Record ID
   * @returns {Promise<boolean>} - Whether the record is tracked
   */
  async isTracked(provider, recordId) {
    try {
      // Check if the record exists
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
      return false;
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
   * Get a managed record by ID
   * @param {string} provider - DNS provider name
   * @param {string} recordId - Record ID
   * @returns {Promise<Object|null>} - Record or null if not found
   */
  async getRecord(provider, recordId) {
    try {
      const record = await this.db.get(`
        SELECT * FROM ${this.tableName}
        WHERE provider = ? AND record_id = ?
      `, [provider, recordId]);
      
      if (!record) return null;
      
      // Format the record for external use
      return this._formatRecordFromDb(record);
    } catch (error) {
      logger.error(`Failed to get managed record: ${error.message}`);
      return null;
    }
  }
  
  /**
   * Get all managed records for a provider
   * @param {string} provider - DNS provider name
   * @param {Object} options - Filter options
   * @returns {Promise<Array>} - Array of managed records
   */
  async getRecords(provider, options = {}) {
    try {
      // Build the query
      let query = `SELECT * FROM ${this.tableName} WHERE provider = ?`;
      const params = [provider];
      
      // Add filters
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
      
      if (options.isAppManaged === true) {
        query += ` AND json_extract(metadata, '$.appManaged') = 1`;
      } else if (options.isAppManaged === false) {
        query += ` AND (json_extract(metadata, '$.appManaged') = 0 OR json_extract(metadata, '$.appManaged') IS NULL)`;
      }
      
      // Add ordering
      query += ` ORDER BY name ASC`;
      
      // Add limit if specified
      if (options.limit && !isNaN(options.limit)) {
        query += ` LIMIT ?`;
        params.push(parseInt(options.limit));
      }
      
      // Execute the query
      const records = await this.db.all(query, params);
      
      // Format the records
      return records.map(record => this._formatRecordFromDb(record));
    } catch (error) {
      logger.error(`Failed to get managed records: ${error.message}`);
      return [];
    }
  }
  
  /**
   * Update record ID (when record ID changes but it's the same record)
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
      return false;
    }
  }
  
  /**
   * Update record by type and name
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
      return false;
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
      return false;
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
      return false;
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
   * Check if a record is app managed
   * @param {string} provider - DNS provider name
   * @param {string} recordId - Record ID
   * @returns {Promise<boolean>} - Whether the record is app managed
   */
  async isAppManaged(provider, recordId) {
    try {
      const record = await this.db.get(`
        SELECT metadata FROM ${this.tableName}
        WHERE provider = ? AND record_id = ?
      `, [provider, recordId]);
      
      if (!record || !record.metadata) return false;
      
      try {
        const metadata = JSON.parse(record.metadata);
        return metadata && metadata.appManaged === true;
      } catch (parseError) {
        logger.error(`Failed to parse record metadata: ${parseError.message}`);
        return false;
      }
    } catch (error) {
      logger.error(`Failed to check if record is app managed: ${error.message}`);
      return false;
    }
  }
  
  /**
   * Set a record's app managed status
   * @param {string} provider - DNS provider name
   * @param {string} recordId - Record ID
   * @param {boolean} isAppManaged - Whether the record is app managed
   * @returns {Promise<boolean>} - Success status
   */
  async setAppManaged(provider, recordId, isAppManaged) {
    try {
      // Get current metadata
      const record = await this.db.get(`
        SELECT metadata FROM ${this.tableName}
        WHERE provider = ? AND record_id = ?
      `, [provider, recordId]);
      
      if (!record) return false;
      
      // Parse metadata or create new object
      let metadata = {};
      try {
        if (record.metadata) {
          metadata = JSON.parse(record.metadata);
        }
      } catch (parseError) {
        logger.warn(`Failed to parse existing metadata, creating new: ${parseError.message}`);
      }
      
      // Update app managed status
      metadata.appManaged = isAppManaged;
      
      // Save updated metadata
      const now = new Date().toISOString();
      const result = await this.db.run(`
        UPDATE ${this.tableName}
        SET metadata = ?, updated_at = ?
        WHERE provider = ? AND record_id = ?
      `, [JSON.stringify(metadata), now, provider, recordId]);
      
      return result.changes > 0;
    } catch (error) {
      logger.error(`Failed to set app managed status: ${error.message}`);
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
  
  /**
   * Migrate all records from JSON data to database
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
      let isInTransaction = this.db.inTransaction;
      
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
            logger.warn(`Could not start migration transaction: ${txError.message}. Proceeding without transaction.`);
          }
        } else {
          logger.debug('Using existing transaction for migration');
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
              logger.warn(`Error migrating record ${recordId}: ${recordError.message}`);
            }
          }
        }

        // Only commit if we started the transaction
        if (!isInTransaction && this.db.inTransaction) {
          try {
            await this.db.commit();
            logger.debug('Committed transaction for migration');
          } catch (commitError) {
            logger.error(`Failed to commit migration: ${commitError.message}`);
            // Attempt rollback
            try {
              await this.db.rollback();
            } catch (rollbackError) {
              logger.error(`Additionally failed to rollback: ${rollbackError.message}`);
            }
            throw commitError;
          }
        }
        
        logger.info(`Successfully migrated ${migratedCount} managed records to SQLite`);
        return migratedCount;
      } catch (error) {
        // Rollback only if we started the transaction
        if (!isInTransaction && this.db.inTransaction) {
          try {
            await this.db.rollback();
            logger.debug('Rolled back transaction due to migration error');
          } catch (rollbackError) {
            logger.error(`Failed to rollback: ${rollbackError.message}`);
          }
        }
        throw error;
      }
    } catch (error) {
      logger.error(`Failed to migrate records: ${error.message}`);
      return 0;
    }
  }
  
  /**
   * Format a database record for external use
   * @param {Object} dbRecord - Record from database
   * @returns {Object} - Formatted record
   */
  _formatRecordFromDb(dbRecord) {
    // Parse metadata
    let metadata = null;
    try {
      if (dbRecord.metadata) {
        metadata = JSON.parse(dbRecord.metadata);
      }
    } catch (error) {
      logger.warn(`Failed to parse metadata for record ${dbRecord.id}: ${error.message}`);
    }
    
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
      firstSeen: dbRecord.first_seen,
      metadata: metadata,
      isAppManaged: metadata && metadata.appManaged === true
    };
  }
  
  /**
   * Get all managed records for all providers
   * @returns {Promise<Object>} - Object with providers and their records
   */
  async getAllRecords() {
    try {
      const records = await this.db.all(`SELECT * FROM ${this.tableName} ORDER BY provider, name`);
      
      // Format data to match the JSON structure expected by the application
      const result = { providers: {} };
      
      for (const record of records) {
        // Initialize provider if needed
        if (!result.providers[record.provider]) {
          result.providers[record.provider] = { records: {} };
        }
        
        // Parse metadata
        let metadata = {};
        try {
          if (record.metadata) {
            metadata = JSON.parse(record.metadata);
          }
        } catch (error) {
          logger.warn(`Failed to parse metadata for record ${record.id}: ${error.message}`);
        }
        
        // Format record for compatibility with JSON format
        result.providers[record.provider].records[record.record_id] = {
          id: record.record_id,
          type: record.type,
          name: record.name,
          content: record.content,
          ttl: record.ttl,
          proxied: record.proxied === 1,
          tracked_at: record.tracked_at,
          is_orphaned: record.is_orphaned === 1,
          orphaned_at: record.orphaned_at,
          metadata: metadata
        };
      }
      
      return result;
    } catch (error) {
      logger.error(`Failed to get all managed records: ${error.message}`);
      return { providers: {} };
    }
  }
}

module.exports = ManagedRecordsRepository;