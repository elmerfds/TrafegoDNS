/**
 * DNS Tables Migration
 * Ensures both dns_records and dns_tracked_records tables are properly populated
 * This is used during application startup to ensure data consistency
 */
const logger = require('../../utils/logger');

/**
 * Migrate data between DNS tables
 * @param {Object} db - Database connection
 * @param {Object} repositoryManager - DNS Repository Manager
 * @returns {Promise<Object>} - Migration results
 */
async function migrateDnsTables(db, repositoryManager) {
  logger.info('Starting DNS tables migration/synchronization');
  
  try {
    // Verify the repository manager is initialized
    if (!repositoryManager || !repositoryManager.isInitialized()) {
      throw new Error('Repository manager not initialized');
    }
    
    // Get database instance if not provided
    if (!db) {
      const database = require('../index');
      db = database.db;
    }
    
    const results = {
      trackedToProvider: 0,
      providerToTracked: 0,
      errors: []
    };
    
    // First, sync dns_tracked_records to dns_records if needed
    try {
      results.trackedToProvider = await syncTrackedToProvider(db);
    } catch (error) {
      logger.error(`Failed to sync tracked records to provider cache: ${error.message}`);
      results.errors.push({
        operation: 'trackedToProvider',
        message: error.message
      });
    }
    
    // Then, sync dns_records to dns_tracked_records if needed
    try {
      results.providerToTracked = await syncProviderToTracked(db);
    } catch (error) {
      logger.error(`Failed to sync provider cache to tracked records: ${error.message}`);
      results.errors.push({
        operation: 'providerToTracked',
        message: error.message
      });
    }
    
    // Return migration results
    return {
      success: results.errors.length === 0,
      trackedToProvider: results.trackedToProvider,
      providerToTracked: results.providerToTracked,
      errors: results.errors
    };
  } catch (error) {
    logger.error(`DNS tables migration failed: ${error.message}`);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Sync dns_tracked_records to dns_records
 * @param {Object} db - Database connection
 * @returns {Promise<number>} - Number of records synced
 */
async function syncTrackedToProvider(db) {
  logger.info('Syncing dns_tracked_records to dns_records (if dns_records is empty)');
  
  try {
    // Check if both tables exist
    const trackedExists = await tableExists(db, 'dns_tracked_records');
    const providerExists = await tableExists(db, 'dns_records');
    
    if (!trackedExists) {
      logger.info('dns_tracked_records table does not exist, skipping sync');
      return 0;
    }
    
    if (!providerExists) {
      logger.info('dns_records table does not exist, will be created during sync');
    }
    
    // Check if dns_records is empty
    const providerCount = await getRecordCount(db, 'dns_records');
    const trackedCount = await getRecordCount(db, 'dns_tracked_records');
    
    if (providerCount > 0) {
      logger.info(`dns_records table already has ${providerCount} records, skipping sync`);
      return 0;
    }
    
    if (trackedCount === 0) {
      logger.info('dns_tracked_records table is empty, nothing to sync');
      return 0;
    }
    
    logger.info(`Found ${trackedCount} records in dns_tracked_records to sync to dns_records`);
    
    // Begin transaction
    await db.beginTransaction();
    
    try {
      // Create dns_records table if it doesn't exist
      if (!providerExists) {
        await db.run(`
          CREATE TABLE IF NOT EXISTS dns_records (
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
            UNIQUE(provider, record_id)
          )
        `);
        
        // Create indexes
        await db.run(`CREATE INDEX IF NOT EXISTS idx_dns_provider ON dns_records(provider)`);
        await db.run(`CREATE INDEX IF NOT EXISTS idx_dns_name ON dns_records(name)`);
        await db.run(`CREATE INDEX IF NOT EXISTS idx_dns_type ON dns_records(type)`);
        await db.run(`CREATE INDEX IF NOT EXISTS idx_dns_orphaned ON dns_records(is_orphaned)`);
        await db.run(`CREATE INDEX IF NOT EXISTS idx_dns_lastrefresh ON dns_records(last_refreshed)`);
        
        logger.info('Created dns_records table and indexes');
      }
      
      // Copy data from dns_tracked_records to dns_records
      const now = new Date().toISOString();
      
      const result = await db.run(`
        INSERT INTO dns_records
        (provider, record_id, type, name, content, ttl, proxied, is_orphaned, orphaned_at, tracked_at, updated_at, fingerprint, last_refreshed)
        SELECT 
          provider, 
          record_id, 
          type, 
          name, 
          content, 
          ttl, 
          proxied, 
          is_orphaned, 
          orphaned_at, 
          tracked_at, 
          updated_at,
          (type || '::' || name || '::' || IFNULL(content, '') || '::' || IFNULL(ttl, 1) || '::' || IFNULL(proxied, 0)) AS fingerprint,
          ? AS last_refreshed
        FROM dns_tracked_records
      `, [now]);
      
      // Commit transaction
      await db.commit();
      
      logger.info(`Successfully synced ${result.changes} records from dns_tracked_records to dns_records`);
      return result.changes;
    } catch (error) {
      // Rollback on error
      await db.rollback();
      throw error;
    }
  } catch (error) {
    logger.error(`Failed to sync tracked records to provider cache: ${error.message}`);
    throw error;
  }
}

/**
 * Sync dns_records to dns_tracked_records
 * @param {Object} db - Database connection
 * @returns {Promise<number>} - Number of records synced
 */
async function syncProviderToTracked(db) {
  logger.info('Syncing dns_records to dns_tracked_records (for missing records)');
  
  try {
    // Check if both tables exist
    const trackedExists = await tableExists(db, 'dns_tracked_records');
    const providerExists = await tableExists(db, 'dns_records');
    
    if (!providerExists) {
      logger.info('dns_records table does not exist, skipping sync');
      return 0;
    }
    
    if (!trackedExists) {
      logger.info('dns_tracked_records table does not exist, will be created during sync');
    }
    
    // Check record counts
    const providerCount = await getRecordCount(db, 'dns_records');
    
    if (providerCount === 0) {
      logger.info('dns_records table is empty, nothing to sync');
      return 0;
    }
    
    // Begin transaction
    await db.beginTransaction();
    
    try {
      // Create dns_tracked_records table if it doesn't exist
      if (!trackedExists) {
        await db.run(`
          CREATE TABLE IF NOT EXISTS dns_tracked_records (
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
        
        // Create indexes
        await db.run(`CREATE INDEX IF NOT EXISTS idx_dns_tracked_provider ON dns_tracked_records(provider)`);
        await db.run(`CREATE INDEX IF NOT EXISTS idx_dns_tracked_name ON dns_tracked_records(name)`);
        await db.run(`CREATE INDEX IF NOT EXISTS idx_dns_tracked_type ON dns_tracked_records(type)`);
        await db.run(`CREATE INDEX IF NOT EXISTS idx_dns_tracked_orphaned ON dns_tracked_records(is_orphaned)`);
        
        logger.info('Created dns_tracked_records table and indexes');
      }
      
      // Find records in dns_records that don't exist in dns_tracked_records
      const newRecords = await db.all(`
        SELECT r.*
        FROM dns_records r
        LEFT JOIN dns_tracked_records t
        ON r.provider = t.provider AND r.record_id = t.record_id
        WHERE t.id IS NULL
      `);
      
      logger.info(`Found ${newRecords.length} records in dns_records that don't exist in dns_tracked_records`);
      
      // Add each missing record to dns_tracked_records
      const now = new Date().toISOString();
      let syncedCount = 0;
      
      for (const record of newRecords) {
        // Create metadata
        const metadata = JSON.stringify({
          appManaged: false,
          autoTracked: true,
          trackedAt: now,
          source: 'provider_cache'
        });
        
        await db.run(`
          INSERT INTO dns_tracked_records
          (provider, record_id, type, name, content, ttl, proxied, is_orphaned, orphaned_at, tracked_at, updated_at, first_seen, metadata)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          record.provider,
          record.record_id,
          record.type,
          record.name,
          record.content,
          record.ttl,
          record.proxied,
          record.is_orphaned,
          record.orphaned_at,
          now,
          now,
          now,
          metadata
        ]);
        
        syncedCount++;
      }
      
      // Commit transaction
      await db.commit();
      
      logger.info(`Successfully synced ${syncedCount} records from dns_records to dns_tracked_records`);
      return syncedCount;
    } catch (error) {
      // Rollback on error
      await db.rollback();
      throw error;
    }
  } catch (error) {
    logger.error(`Failed to sync provider cache to tracked records: ${error.message}`);
    throw error;
  }
}

/**
 * Check if a table exists
 * @param {Object} db - Database connection
 * @param {string} tableName - Table name
 * @returns {Promise<boolean>} - Whether the table exists
 */
async function tableExists(db, tableName) {
  try {
    const result = await db.get(`
      SELECT name FROM sqlite_master
      WHERE type='table' AND name=?
    `, [tableName]);
    
    return !!result;
  } catch (error) {
    logger.error(`Failed to check if table exists: ${error.message}`);
    return false;
  }
}

/**
 * Get record count for a table
 * @param {Object} db - Database connection
 * @param {string} tableName - Table name
 * @returns {Promise<number>} - Record count
 */
async function getRecordCount(db, tableName) {
  try {
    const tableExists = await db.get(`
      SELECT name FROM sqlite_master
      WHERE type='table' AND name=?
    `, [tableName]);
    
    if (!tableExists) return 0;
    
    const result = await db.get(`SELECT COUNT(*) as count FROM ${tableName}`);
    return result ? result.count : 0;
  } catch (error) {
    logger.error(`Failed to get record count: ${error.message}`);
    return 0;
  }
}

module.exports = {
  migrateDnsTables,
  syncTrackedToProvider,
  syncProviderToTracked
};