/**
 * DNS Record Repository
 * Handles database operations for DNS records
 */
const BaseRepository = require('./baseRepository');
const logger = require('../../utils/logger');

class DnsRecordRepository extends BaseRepository {
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
            fingerprint TEXT,
            last_refreshed TEXT,
            last_processed TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            managed INTEGER DEFAULT 0,
            UNIQUE(provider, record_id)
          )
        `);

        // Create indexes for performance
        await this.db.run(`CREATE INDEX IF NOT EXISTS idx_dns_provider ON ${this.tableName}(provider)`);
        await this.db.run(`CREATE INDEX IF NOT EXISTS idx_dns_name ON ${this.tableName}(name)`);
        await this.db.run(`CREATE INDEX IF NOT EXISTS idx_dns_type ON ${this.tableName}(type)`);
        await this.db.run(`CREATE INDEX IF NOT EXISTS idx_dns_orphaned ON ${this.tableName}(is_orphaned)`);
        await this.db.run(`CREATE INDEX IF NOT EXISTS idx_dns_lastrefreshed ON ${this.tableName}(last_refreshed)`);

        logger.info(`Created ${this.tableName} table and indexes`);
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
   * Find records by provider
   * @param {string} provider - Provider name
   * @returns {Promise<Array>} - Found records
   */
  async findByProvider(provider) {
    return this.findByField('provider', provider);
  }

  /**
   * Find records by record_id
   * @param {string} recordId - Record ID
   * @param {string} provider - Provider name
   * @returns {Promise<Object>} - Found record or null
   */
  async findByRecordId(recordId, provider) {
    const sql = `
      SELECT * FROM ${this.tableName}
      WHERE record_id = ? AND provider = ?
    `;
    return this.db.get(sql, [recordId, provider]);
  }

  /**
   * Find orphaned records
   * @param {string} provider - Provider name
   * @returns {Promise<Array>} - Orphaned records
   */
  async findOrphaned(provider) {
    const sql = `
      SELECT * FROM ${this.tableName}
      WHERE provider = ? AND is_orphaned = 1
      ORDER BY orphaned_at ASC
    `;
    return this.db.all(sql, [provider]);
  }

  /**
   * Mark record as orphaned
   * @param {string} recordId - Record ID
   * @param {string} provider - Provider name
   * @returns {Promise<Object>} - Updated record
   */
  async markOrphaned(recordId, provider) {
    const now = new Date().toISOString();
    const sql = `
      UPDATE ${this.tableName}
      SET is_orphaned = 1, orphaned_at = ?
      WHERE record_id = ? AND provider = ?
    `;
    await this.db.run(sql, [now, recordId, provider]);
    return this.findByRecordId(recordId, provider);
  }

  /**
   * Unmark record as orphaned
   * @param {string} recordId - Record ID
   * @param {string} provider - Provider name
   * @returns {Promise<Object>} - Updated record
   */
  async unmarkOrphaned(recordId, provider) {
    const sql = `
      UPDATE ${this.tableName}
      SET is_orphaned = 0, orphaned_at = NULL
      WHERE record_id = ? AND provider = ?
    `;
    await this.db.run(sql, [recordId, provider]);
    return this.findByRecordId(recordId, provider);
  }

  /**
   * Create or update a DNS record
   * @param {Object} record - DNS record
   * @param {string} provider - Provider name
   * @returns {Promise<Object>} - Created/updated record
   */
  async createOrUpdate(record, provider) {
    // Check if record exists
    const existingRecord = await this.findByRecordId(record.id, provider);
    
    // Generate fingerprint for change detection
    const fingerprint = this._generateFingerprint(record);
    
    if (existingRecord) {
      // Update existing record
      const updated = {
        record_id: record.id,
        provider,
        type: record.type,
        name: record.name,
        content: record.content || record.data || record.value,
        ttl: record.ttl,
        proxied: record.proxied ? 1 : 0,
        // Only update tracked_at if fingerprint changed
        ...(fingerprint !== existingRecord.fingerprint && { tracked_at: new Date().toISOString() }),
        fingerprint
      };
      
      // Keep orphaned status if already orphaned
      if (existingRecord.is_orphaned) {
        updated.is_orphaned = 1;
        updated.orphaned_at = existingRecord.orphaned_at;
      }
      
      await this.update(existingRecord.id, updated);
      return { ...updated, id: existingRecord.id };
    } else {
      // Create new record
      const newRecord = {
        record_id: record.id,
        provider,
        type: record.type,
        name: record.name,
        content: record.content || record.data || record.value,
        ttl: record.ttl,
        proxied: record.proxied ? 1 : 0,
        tracked_at: new Date().toISOString(),
        is_orphaned: 0,
        orphaned_at: null,
        fingerprint
      };
      
      return this.create(newRecord);
    }
  }

  /**
   * Delete records by record_id and provider
   * @param {string} recordId - Record ID
   * @param {string} provider - Provider name
   * @returns {Promise<boolean>} - Success status
   */
  async deleteByRecordId(recordId, provider) {
    const sql = `
      DELETE FROM ${this.tableName}
      WHERE record_id = ? AND provider = ?
    `;
    const result = await this.db.run(sql, [recordId, provider]);
    return result.changes > 0;
  }

  /**
   * Generate a fingerprint for a record
   * Used to detect changes in record content
   * @param {Object} record - DNS record
   * @returns {string} - Record fingerprint
   * @private
   */
  _generateFingerprint(record) {
    const content = record.content || record.data || record.value;
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
   * Migrate from JSON tracking file
   * @param {Object} jsonData - JSON data
   * @returns {Promise<number>} - Number of migrated records
   */
  async migrateFromJson(jsonData) {
    if (!jsonData || !jsonData.providers) {
      logger.warn('No JSON data to migrate for DNS records');
      return 0;
    }
    
    let migratedCount = 0;
    
    // Start a transaction
    await this.db.beginTransaction();
    
    try {
      // Process each provider
      for (const [provider, providerData] of Object.entries(jsonData.providers)) {
        if (!providerData.records) continue;
        
        // Process each record
        for (const [recordKey, recordData] of Object.entries(providerData.records)) {
          // Extract record ID from key if available, otherwise use the key
          const recordId = recordData.id || recordKey;
          
          // Skip if already exists
          const exists = await this.findByRecordId(recordId, provider);
          if (exists) continue;
          
          // Prepare record for database
          const record = {
            record_id: recordId,
            provider,
            type: recordData.type || 'UNKNOWN',
            name: recordData.name || recordKey.split('::')[1] || 'unknown',
            content: recordData.content || recordData.data || recordData.value || '',
            ttl: recordData.ttl || 3600,
            proxied: recordData.proxied ? 1 : 0,
            tracked_at: recordData.trackedAt || new Date().toISOString(),
            is_orphaned: recordData.orphaned ? 1 : 0,
            orphaned_at: recordData.orphanedAt || null,
            fingerprint: this._generateFingerprint(recordData)
          };
          
          await this.create(record);
          migratedCount++;
        }
      }
      
      // Commit the transaction
      await this.db.commit();
      logger.info(`Migrated ${migratedCount} DNS records from JSON`);
      
      return migratedCount;
    } catch (error) {
      // Rollback on error
      await this.db.rollback();
      logger.error(`Failed to migrate DNS records: ${error.message}`);
      throw error;
    }
  }
}

module.exports = DnsRecordRepository;