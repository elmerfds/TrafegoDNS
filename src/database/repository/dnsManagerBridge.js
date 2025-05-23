/**
 * DNS Manager Bridge
 * Provides a standardized interface between the DNS Manager and the Record Tracker
 */
const logger = require('../../utils/logger');
const database = require('../index');

/**
 * Initializes the DNS repositories and provides a bridge to the DNS Manager
 * @param {Object} options - Initialization options
 * @param {boolean} [options.force=false] - Force reinitialization even if already initialized
 * @param {number} [options.maxRetries=3] - Maximum number of retries for initialization
 * @param {number} [options.retryDelayMs=500] - Delay between retries in milliseconds
 * @returns {Promise<boolean>} Success status 
 */
async function initializeDnsRepositories(options = {}) {
  const { 
    force = false,
    maxRetries = 5,  // Increased from 3 to 5 for better reliability
    retryDelayMs = 500,
    immediateFirstAttempt = true // Skip delay on first attempt
  } = options;
  
  // Track initialization attempts
  let attempts = 0;
  let initResult = false;
  
  // Add jitter to retryDelay to avoid thundering herd problem
  const getJitteredDelay = () => {
    const jitterFactor = 0.3; // 30% jitter
    const jitterRange = retryDelayMs * jitterFactor;
    const jitter = Math.floor(Math.random() * jitterRange * 2) - jitterRange;
    return retryDelayMs + jitter;
  };
  
  // Exponential backoff factor - reduced for faster recovery
  const backoffFactor = 1.2;
  
  // Create repository directly on first attempt without waiting for normal initialization
  if (!initResult && database && database.isInitialized() && database.db) {
    // Attempt immediate direct creation before entering retry loop
    try {
      logger.info('Attempting immediate DNS repository manager creation on first attempt');
      const DNSRepositoryManager = require('./dnsRepositoryManager');
      database.repositories = database.repositories || {};
      
      // Only create if it doesn't already exist
      if (!database.repositories.dnsManager) {
        database.repositories.dnsManager = new DNSRepositoryManager(database.db);
        
        // Initialize the repository with a short timeout
        const success = await Promise.race([
          database.repositories.dnsManager.initialize(),
          new Promise(resolve => setTimeout(() => resolve(false), 300)) // Short timeout
        ]);
        
        if (success) {
          logger.info('DNS repository manager created and initialized directly on first attempt');
          initResult = true;
          return true;
        }
      }
    } catch (directCreationError) {
      logger.debug(`Initial direct repository creation attempt failed: ${directCreationError.message}, continuing with regular process`);
    }
  }
  
  // Setup retry loop with exponential backoff
  while (attempts < maxRetries && !initResult) {
    attempts++;
    
    // Calculate actual delay with exponential backoff and jitter
    // Skip delay on first attempt if requested
    const actualDelay = attempts === 1 && immediateFirstAttempt
      ? 0
      : getJitteredDelay() * Math.pow(backoffFactor, attempts - 1);

    // Apply delay if needed (skip first attempt delay if configured)
    if (actualDelay > 0) {
      logger.debug(`Waiting ${Math.floor(actualDelay)}ms before DNS repository initialization attempt ${attempts}/${maxRetries}`);
      await new Promise(resolve => setTimeout(resolve, actualDelay));
    }
    
    try {
      // First, ensure the database is initialized
      if (!database.isInitialized() || force) {
        logger.info(`Database not fully initialized, initializing now (attempt ${attempts}/${maxRetries})...`);
        
        try {
          // Focus on initializing only the repositories we need
          await database.initialize(true, {
            force: force,
            onlyRepositories: ['dnsManager']
          });
        } catch (initError) {
          logger.warn(`Database initialization error: ${initError.message}. Retrying...`);
          continue;
        }
      }

      // Check if repositories are available
      if (!database.repositories || !database.repositories.dnsManager) {
        if (attempts < maxRetries) {
          logger.warn(`DNS repository manager not available, will retry (attempt ${attempts}/${maxRetries})...`);
          continue;
        } else {
          logger.error('DNS repository manager not available after maximum retries');
          
          // Try creating it directly as a last resort
          try {
            // First check if repositories were created while we were logging
            if (database.repositories && database.repositories.dnsManager) {
              logger.info('DNS repository manager became available after last check');
              const success = await database.repositories.dnsManager.initialize();
              if (success) {
                initResult = true;
                return true;
              }
            }
            
            // If the database is initialized but dnsManager is missing, create it directly
            if (database.isInitialized() && database.db) {
              const DNSRepositoryManager = require('./dnsRepositoryManager');
              database.repositories = database.repositories || {};
              database.repositories.dnsManager = new DNSRepositoryManager(database.db);
              
              // Initialize the repository
              const success = await database.repositories.dnsManager.initialize();
              if (success) {
                logger.info('DNS repository manager created and initialized directly as last resort');
                initResult = true;
                return true;
              }
            }
          } catch (directCreationError) {
            logger.error(`Failed to create DNS repository manager directly: ${directCreationError.message}`);
          }
          
          return false;
        }
      }
      
      // If we have the dnsManager, try to ensure it's initialized
      if (database.repositories.dnsManager) {
        // Check if the repository is marked as initialized
        if (!database.repositories.dnsManager.isInitialized()) {
          logger.info('DNS repository manager exists but not initialized, initializing now...');
          
          try {
            const success = await database.repositories.dnsManager.initialize();
            if (success) {
              logger.info('DNS repository manager initialized successfully');
              initResult = true;
              return true;
            } else {
              if (attempts < maxRetries) {
                logger.warn(`DNS repository manager initialization failed, retrying (attempt ${attempts}/${maxRetries})...`);
                await new Promise(resolve => setTimeout(resolve, retryDelayMs));
                continue;
              } else {
                logger.error('DNS repository manager initialization failed after maximum retries');
                return false;
              }
            }
          } catch (initError) {
            logger.error(`Error initializing DNS repository manager: ${initError.message}`);
            if (attempts < maxRetries) {
              await new Promise(resolve => setTimeout(resolve, retryDelayMs));
              continue;
            } else {
              return false;
            }
          }
        } else {
          // Repository exists and is initialized
          logger.debug('DNS repository manager already initialized');
          initResult = true;
          return true;
        }
      }
    } catch (error) {
      logger.error(`Failed to initialize DNS repositories (attempt ${attempts}/${maxRetries}): ${error.message}`);
      
      if (attempts < maxRetries) {
        // Delay before retry
        await new Promise(resolve => setTimeout(resolve, retryDelayMs));
      } else {
        // Last attempt failed
        return false;
      }
    }
  }
  
  return initResult;
}

/**
 * Gets a tracked record repository from the DNS Manager
 * @param {Object} options - Options for repository retrieval
 * @param {boolean} [options.initialize=true] - Whether to initialize the repository if not found
 * @param {boolean} [options.createIfNeeded=true] - Whether to create the repository if not found
 * @param {boolean} [options.cached=true] - Whether to cache the repository for future use
 * @returns {Promise<Object>|Object|null} The tracked record repository or null
 */
async function getTrackedRecordRepository(options = {}) {
  const {
    initialize = true,
    createIfNeeded = true,
    cached = true
  } = options;
  
  // Use a static cache for direct repository access
  if (!getTrackedRecordRepository._directRepository) {
    getTrackedRecordRepository._directRepository = null;
  }
  
  // Return cached version if available and cached option is true
  if (cached && getTrackedRecordRepository._directRepository) {
    return getTrackedRecordRepository._directRepository;
  }
  
  // Try to retrieve from various sources
  try {
    // 1. Try via DNS Repository Manager (preferred method)
    if (database && database.isInitialized() && database.repositories && database.repositories.dnsManager) {
      // Check if we should initialize on-demand
      const repo = initialize ? 
        await database.repositories.dnsManager.getTrackedRecordRepository(true) : 
        database.repositories.dnsManager.getTrackedRecordRepository(false);
      
      // If we got a repository, return it (could be a promise or direct object)
      if (repo) {
        if (cached) {
          // Wait for the repository if it's a promise
          getTrackedRecordRepository._directRepository = await Promise.resolve(repo);
        }
        return repo;
      }
    }
    
    // 2. If we get here, no repository was found, try to create directly if needed
    if (createIfNeeded && database && database.isInitialized() && database.db) {
      try {
        const DNSTrackedRecordRepository = require('./dnsTrackedRecordRepository');
        const directRepo = new DNSTrackedRecordRepository(database.db);
        
        // Initialize if requested
        if (initialize) {
          try {
            // Initialize with create if missing option
            await directRepo.initialize({ createIfMissing: true });
            logger.debug('Created and initialized DNSTrackedRecordRepository directly');
          } catch (initError) {
            logger.warn(`Direct repository initialization failed: ${initError.message}`);
          }
        }
        
        // Cache if requested
        if (cached) {
          getTrackedRecordRepository._directRepository = directRepo;
        }
        
        return directRepo;
      } catch (repoError) {
        logger.warn(`Could not create DNSTrackedRecordRepository directly: ${repoError.message}`);
      }
    }
    
    // No repository found or created
    return null;
  } catch (error) {
    logger.error(`Failed to get tracked record repository: ${error.message}`);
    return null;
  }
}

/**
 * Saves a record to the DNS tracked record repository
 * @param {string} provider - The DNS provider name
 * @param {Object} record - The record to save
 * @param {boolean} [isAppManaged=false] - Whether this record is managed by the app - DEFAULT IS FALSE FOR SAFETY
 * @returns {Promise<boolean>} Success status
 */
async function trackRecord(provider, record, isAppManaged = false) {
  try {
    logger.debug(`dnsManagerBridge.trackRecord called: provider=${provider}, record.id=${record.id}, record.name=${record.name}, isAppManaged=${isAppManaged}`);
    
    // Format the record for tracking
    const formattedRecord = {
      provider: provider,
      record_id: record.id || record.record_id,
      type: record.type || 'UNKNOWN',
      name: record.name || (record.id || record.record_id),
      content: record.content || '',
      ttl: record.ttl || 1,
      proxied: record.proxied === true ? 1 : 0,
      metadata: {
        appManaged: isAppManaged,
        trackedAt: new Date().toISOString()
      }
    };
    
    logger.debug(`Formatted record for tracking: ${JSON.stringify(formattedRecord)}`);
    
    // Try getting a repository - this will create one if none exists
    const repository = await getTrackedRecordRepository({
      initialize: true,
      createIfNeeded: true,
      cached: true
    });
    
    if (repository) {
      logger.debug(`Got repository, tracking record ${formattedRecord.name}`);
      // Track using the repository
      await repository.trackRecord(formattedRecord);
      logger.info(`✅ Successfully tracked record ${formattedRecord.name} via repository`);
      return true;
    } else {
      logger.warn(`No repository available for tracking record ${formattedRecord.name}`);
    }
    
    // If still no repository, try direct database access as a fallback
    if (database && database.isInitialized() && database.db) {
      try {
        // Create a direct SQL query to insert the record
        const now = new Date().toISOString();
        
        // First ensure the table exists
        try {
          await database.db.run(`
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
        } catch (tableError) {
          logger.debug(`Failed to create dns_tracked_records table: ${tableError.message}`);
          // Continue anyway - table might already exist
        }
        
        // Ensure we're explicitly marking newly created records as app-managed=true
        // This is especially important for records created directly through operations.js
        const metadata = JSON.stringify({
          appManaged: isAppManaged,
          trackedAt: now
        });
          
        // Directly insert into dns_tracked_records table
        await database.db.run(`
          INSERT OR REPLACE INTO dns_tracked_records
          (provider, record_id, type, name, content, ttl, proxied, tracked_at, metadata)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          formattedRecord.provider,
          formattedRecord.record_id,
          formattedRecord.type,
          formattedRecord.name,
          formattedRecord.content,
          formattedRecord.ttl,
          formattedRecord.proxied,
          now,
          metadata
        ]);
        
        return true;
      } catch (directDbError) {
        logger.error(`Direct database access failed: ${directDbError.message}`);
        return false;
      }
    }
    
    // If we get here, all methods failed
    logger.error('All attempts to track record failed - database not available');
    return false;
  } catch (error) {
    logger.error(`Failed to track record in DNS repository: ${error.message}`);
    return false;
  }
}

/**
 * Gets all records for a provider
 * @param {string} provider - The DNS provider name
 * @returns {Promise<Object>} The provider records
 */
async function getProviderRecords(provider) {
  try {
    // Get a repository - this will create one if none exists
    const repository = await getTrackedRecordRepository({
      initialize: true,
      createIfNeeded: true
    });
    
    if (repository) {
      // Get records using the repository
      return await repository.getProviderRecords(provider);
    }
    
    // If no repository is available, try direct database access
    if (database && database.isInitialized() && database.db) {
      try {
        // Try to query the table directly
        try {
          // Direct database query for provider records
          const rows = await database.db.all(`
            SELECT * FROM dns_tracked_records
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
        } catch (queryError) {
          // If the table doesn't exist yet, this is expected
          if (queryError.message.includes('no such table')) {
            logger.debug('dns_tracked_records table does not exist yet');
          } else {
            logger.warn(`Error querying dns_tracked_records table: ${queryError.message}`);
          }
        }
      } catch (directDbError) {
        logger.debug(`Direct database query for records failed: ${directDbError.message}`);
      }
    }
    
    // Return empty result if all methods fail
    return { records: {} };
  } catch (error) {
    logger.error(`Failed to get provider records: ${error.message}`);
    return { records: {} };
  }
}

/**
 * Checks if a record is tracked
 * @param {string} provider - The DNS provider name
 * @param {string} recordId - The record ID
 * @returns {Promise<boolean>} Whether the record is tracked
 */
async function isTracked(provider, recordId) {
  try {
    // Get a repository - this will create one if none exists
    const repository = await getTrackedRecordRepository({
      initialize: true,
      createIfNeeded: true
    });
    
    if (repository) {
      // Check if tracked using the repository
      return await repository.isTracked(provider, recordId);
    }
    
    // If no repository is available, try direct database access
    if (database && database.isInitialized() && database.db) {
      try {
        // Direct database query to check if record exists
        const record = await database.db.get(`
          SELECT id FROM dns_tracked_records
          WHERE provider = ? AND record_id = ?
        `, [provider, recordId]);
        
        return !!record;
      } catch (directDbError) {
        // If table doesn't exist, this is expected
        if (directDbError.message.includes('no such table')) {
          logger.debug('dns_tracked_records table does not exist yet');
        } else {
          logger.debug(`Direct database query to check tracked status failed: ${directDbError.message}`);
        }
      }
    }
    
    // If all methods fail, assume not tracked
    return false;
  } catch (error) {
    logger.error(`Failed to check if record is tracked: ${error.message}`);
    return false;
  }
}

// Export the module functions
module.exports = {
  initializeDnsRepositories,
  getTrackedRecordRepository,
  trackRecord,
  getProviderRecords,
  isTracked
};