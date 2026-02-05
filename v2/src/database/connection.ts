/**
 * Database connection management
 */
import Database from 'better-sqlite3';
import { drizzle, BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { existsSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { logger } from '../core/Logger.js';
import * as schema from './schema/index.js';

let db: BetterSQLite3Database<typeof schema> | null = null;
let sqliteDb: Database.Database | null = null;

export interface DatabaseOptions {
  path: string;
  runMigrations?: boolean;
  verbose?: boolean;
}

/**
 * Initialize the database connection
 */
export function initDatabase(options: DatabaseOptions): BetterSQLite3Database<typeof schema> {
  const { path, runMigrations = true, verbose = false } = options;

  if (db) {
    logger.warn('Database already initialized');
    return db;
  }

  // Ensure directory exists
  const dir = dirname(path);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
    logger.info({ dir }, 'Created database directory');
  }

  // Create SQLite connection
  sqliteDb = new Database(path, {
    verbose: verbose ? (sql: unknown) => logger.trace({ sql }, 'SQL') : undefined,
  });

  // Enable WAL mode for better concurrency
  sqliteDb.pragma('journal_mode = WAL');
  sqliteDb.pragma('foreign_keys = ON');
  sqliteDb.pragma('synchronous = NORMAL');
  sqliteDb.pragma('cache_size = -64000'); // 64MB cache

  // Create Drizzle ORM instance
  db = drizzle(sqliteDb, { schema });

  logger.info({ path }, 'Database connection established');

  // Run migrations if requested
  if (runMigrations) {
    try {
      runDatabaseMigrations();
    } catch (error) {
      logger.warn({ error }, 'Migration folder not found, creating tables directly');
      try {
        createTablesDirectly();
      } catch (tableError) {
        logger.error({ error: tableError }, 'Failed to create database tables');
        throw tableError;
      }
    }
  }

  return db;
}

/**
 * Run database migrations
 */
function runDatabaseMigrations(): void {
  if (!db) {
    throw new Error('Database not initialized');
  }

  const migrationsFolder = join(import.meta.dirname ?? '.', 'migrations');

  if (!existsSync(migrationsFolder)) {
    throw new Error(`Migrations folder not found: ${migrationsFolder}`);
  }

  migrate(db, { migrationsFolder });
  logger.info('Database migrations completed');
}

/**
 * Create tables directly (for initial setup without migrations)
 * Uses CREATE TABLE IF NOT EXISTS to preserve existing data
 */
function createTablesDirectly(): void {
  if (!sqliteDb) {
    throw new Error('SQLite database not initialized');
  }

  logger.info('Creating database tables (preserving existing data)');

  // Create providers table
  sqliteDb.exec(`
    CREATE TABLE IF NOT EXISTS providers (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      type TEXT NOT NULL CHECK(type IN ('cloudflare', 'digitalocean', 'route53', 'technitium')),
      is_default INTEGER NOT NULL DEFAULT 0,
      credentials TEXT NOT NULL,
      settings TEXT NOT NULL DEFAULT '{}',
      enabled INTEGER NOT NULL DEFAULT 1,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at INTEGER NOT NULL DEFAULT (unixepoch())
    )
  `);

  // Create dns_records table
  sqliteDb.exec(`
    CREATE TABLE IF NOT EXISTS dns_records (
      id TEXT PRIMARY KEY,
      provider_id TEXT NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
      external_id TEXT,
      type TEXT NOT NULL CHECK(type IN ('A', 'AAAA', 'CNAME', 'MX', 'TXT', 'SRV', 'CAA', 'NS')),
      name TEXT NOT NULL,
      content TEXT NOT NULL,
      ttl INTEGER NOT NULL DEFAULT 1,
      proxied INTEGER,
      priority INTEGER,
      weight INTEGER,
      port INTEGER,
      flags INTEGER,
      tag TEXT,
      comment TEXT,
      source TEXT NOT NULL DEFAULT 'traefik' CHECK(source IN ('traefik', 'direct', 'api', 'managed', 'discovered')),
      managed INTEGER NOT NULL DEFAULT 1,
      orphaned_at INTEGER,
      last_synced_at INTEGER,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at INTEGER NOT NULL DEFAULT (unixepoch())
    )
  `);

  // Create tunnels table
  sqliteDb.exec(`
    CREATE TABLE IF NOT EXISTS tunnels (
      id TEXT PRIMARY KEY,
      provider_id TEXT NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
      tunnel_id TEXT NOT NULL,
      name TEXT NOT NULL,
      secret TEXT,
      status TEXT NOT NULL DEFAULT 'inactive' CHECK(status IN ('active', 'inactive', 'degraded')),
      connector_id TEXT,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at INTEGER NOT NULL DEFAULT (unixepoch())
    )
  `);

  // Create tunnel_ingress_rules table
  sqliteDb.exec(`
    CREATE TABLE IF NOT EXISTS tunnel_ingress_rules (
      id TEXT PRIMARY KEY,
      tunnel_id TEXT NOT NULL REFERENCES tunnels(id) ON DELETE CASCADE,
      hostname TEXT NOT NULL,
      service TEXT NOT NULL,
      path TEXT,
      origin_request TEXT,
      "order" INTEGER NOT NULL DEFAULT 0,
      enabled INTEGER NOT NULL DEFAULT 1,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at INTEGER NOT NULL DEFAULT (unixepoch())
    )
  `);

  // Create webhooks table
  sqliteDb.exec(`
    CREATE TABLE IF NOT EXISTS webhooks (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      url TEXT NOT NULL,
      secret TEXT,
      events TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at INTEGER NOT NULL DEFAULT (unixepoch())
    )
  `);

  // Create webhook_deliveries table
  sqliteDb.exec(`
    CREATE TABLE IF NOT EXISTS webhook_deliveries (
      id TEXT PRIMARY KEY,
      webhook_id TEXT NOT NULL REFERENCES webhooks(id) ON DELETE CASCADE,
      event TEXT NOT NULL,
      payload TEXT NOT NULL,
      status_code INTEGER,
      response TEXT,
      attempts INTEGER NOT NULL DEFAULT 0,
      next_retry_at INTEGER,
      delivered_at INTEGER,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at INTEGER NOT NULL DEFAULT (unixepoch())
    )
  `);

  // Create users table
  sqliteDb.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'user' CHECK(role IN ('admin', 'user', 'readonly')),
      last_login_at INTEGER,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at INTEGER NOT NULL DEFAULT (unixepoch())
    )
  `);

  // Create api_keys table
  sqliteDb.exec(`
    CREATE TABLE IF NOT EXISTS api_keys (
      id TEXT PRIMARY KEY,
      user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      key_hash TEXT NOT NULL,
      key_prefix TEXT NOT NULL,
      permissions TEXT NOT NULL DEFAULT '["read"]',
      expires_at INTEGER,
      last_used_at INTEGER,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at INTEGER NOT NULL DEFAULT (unixepoch())
    )
  `);

  // Create audit_logs table
  sqliteDb.exec(`
    CREATE TABLE IF NOT EXISTS audit_logs (
      id TEXT PRIMARY KEY,
      user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      action TEXT NOT NULL CHECK(action IN ('create', 'update', 'delete', 'login', 'logout', 'sync', 'deploy')),
      resource_type TEXT NOT NULL,
      resource_id TEXT,
      details TEXT NOT NULL DEFAULT '{}',
      ip_address TEXT,
      user_agent TEXT,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at INTEGER NOT NULL DEFAULT (unixepoch())
    )
  `);

  // Create settings table
  sqliteDb.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      description TEXT,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at INTEGER NOT NULL DEFAULT (unixepoch())
    )
  `);

  // Create container_labels table
  sqliteDb.exec(`
    CREATE TABLE IF NOT EXISTS container_labels (
      container_id TEXT PRIMARY KEY,
      container_name TEXT NOT NULL,
      labels TEXT NOT NULL DEFAULT '{}',
      state TEXT NOT NULL DEFAULT 'running' CHECK(state IN ('running', 'stopped', 'paused')),
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at INTEGER NOT NULL DEFAULT (unixepoch())
    )
  `);

  // Create managed_hostnames table
  sqliteDb.exec(`
    CREATE TABLE IF NOT EXISTS managed_hostnames (
      id TEXT PRIMARY KEY,
      hostname TEXT NOT NULL UNIQUE,
      provider_id TEXT NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
      record_type TEXT NOT NULL CHECK(record_type IN ('A', 'AAAA', 'CNAME', 'MX', 'TXT', 'SRV', 'CAA', 'NS')),
      content TEXT NOT NULL,
      ttl INTEGER NOT NULL DEFAULT 1,
      proxied INTEGER,
      priority INTEGER,
      enabled INTEGER NOT NULL DEFAULT 1,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at INTEGER NOT NULL DEFAULT (unixepoch())
    )
  `);

  // Create preserved_hostnames table
  sqliteDb.exec(`
    CREATE TABLE IF NOT EXISTS preserved_hostnames (
      id TEXT PRIMARY KEY,
      hostname TEXT NOT NULL UNIQUE,
      reason TEXT,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at INTEGER NOT NULL DEFAULT (unixepoch())
    )
  `);

  // Create hostname_overrides table
  sqliteDb.exec(`
    CREATE TABLE IF NOT EXISTS hostname_overrides (
      id TEXT PRIMARY KEY,
      hostname TEXT NOT NULL UNIQUE,
      proxied INTEGER,
      ttl INTEGER,
      record_type TEXT CHECK(record_type IN ('A', 'AAAA', 'CNAME', 'MX', 'TXT', 'SRV', 'CAA', 'NS')),
      content TEXT,
      provider_id TEXT REFERENCES providers(id) ON DELETE CASCADE,
      reason TEXT,
      enabled INTEGER NOT NULL DEFAULT 1,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at INTEGER NOT NULL DEFAULT (unixepoch())
    )
  `);

  // Run schema migrations for existing databases BEFORE creating indexes
  // This ensures new columns exist before we try to create indexes on them
  runSchemaMigrations(sqliteDb);

  // Create indexes
  sqliteDb.exec(`
    CREATE INDEX IF NOT EXISTS idx_dns_records_provider ON dns_records(provider_id);
    CREATE INDEX IF NOT EXISTS idx_dns_records_name ON dns_records(name);
    CREATE INDEX IF NOT EXISTS idx_dns_records_type ON dns_records(type);
    CREATE INDEX IF NOT EXISTS idx_dns_records_orphaned ON dns_records(orphaned_at);
    CREATE INDEX IF NOT EXISTS idx_dns_records_managed ON dns_records(managed);
    CREATE INDEX IF NOT EXISTS idx_tunnels_provider ON tunnels(provider_id);
    CREATE INDEX IF NOT EXISTS idx_tunnel_ingress_rules_tunnel ON tunnel_ingress_rules(tunnel_id);
    CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_webhook ON webhook_deliveries(webhook_id);
    CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_retry ON webhook_deliveries(next_retry_at);
    CREATE INDEX IF NOT EXISTS idx_api_keys_user ON api_keys(user_id);
    CREATE INDEX IF NOT EXISTS idx_audit_logs_user ON audit_logs(user_id);
    CREATE INDEX IF NOT EXISTS idx_audit_logs_resource ON audit_logs(resource_type, resource_id);
    CREATE INDEX IF NOT EXISTS idx_managed_hostnames_provider ON managed_hostnames(provider_id);
    CREATE INDEX IF NOT EXISTS idx_hostname_overrides_hostname ON hostname_overrides(hostname);
  `);

  logger.info('Database tables created directly');
}

/**
 * Run schema migrations for existing databases
 * Adds new columns to existing tables if they don't exist
 */
function runSchemaMigrations(sqliteDb: Database.Database): void {
  // Check if 'managed' column exists in dns_records
  const tableInfo = sqliteDb.prepare('PRAGMA table_info(dns_records)').all() as Array<{ name: string }>;
  const hasManaged = tableInfo.some((col) => col.name === 'managed');

  if (!hasManaged) {
    logger.info('Adding managed column to dns_records table');
    sqliteDb.exec('ALTER TABLE dns_records ADD COLUMN managed INTEGER NOT NULL DEFAULT 1');
    sqliteDb.exec('CREATE INDEX IF NOT EXISTS idx_dns_records_managed ON dns_records(managed)');
    logger.info('Migration complete: added managed column');
  }

  // Fix CHECK constraint for source column (add 'discovered' if missing)
  // SQLite doesn't allow modifying CHECK constraints, so we need to recreate the table
  migrateSourceConstraint(sqliteDb);
}

/**
 * Migrate dns_records table to include 'discovered' in source CHECK constraint
 * This is needed because the original table was created without 'discovered'
 */
function migrateSourceConstraint(sqliteDb: Database.Database): void {
  // Check if 'discovered' source works by trying a test insert
  try {
    // Try to create a temp record with 'discovered' source
    sqliteDb.exec(`
      INSERT INTO dns_records (id, provider_id, type, name, content, source)
      SELECT 'test_discovered_check', id, 'A', 'test.check', '127.0.0.1', 'discovered'
      FROM providers LIMIT 1
    `);
    // If it worked, delete the test record and we're done
    sqliteDb.exec(`DELETE FROM dns_records WHERE id = 'test_discovered_check'`);
    return; // Constraint already includes 'discovered'
  } catch {
    // CHECK constraint failed - need to migrate
    logger.info('Migrating dns_records table to support discovered source');
  }

  // SQLite doesn't support ALTER TABLE to modify CHECK constraints
  // We need to recreate the table
  sqliteDb.exec('BEGIN TRANSACTION');
  try {
    // Create new table with correct constraint
    sqliteDb.exec(`
      CREATE TABLE dns_records_new (
        id TEXT PRIMARY KEY,
        provider_id TEXT NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
        external_id TEXT,
        type TEXT NOT NULL CHECK(type IN ('A', 'AAAA', 'CNAME', 'MX', 'TXT', 'SRV', 'CAA', 'NS')),
        name TEXT NOT NULL,
        content TEXT NOT NULL,
        ttl INTEGER NOT NULL DEFAULT 1,
        proxied INTEGER,
        priority INTEGER,
        weight INTEGER,
        port INTEGER,
        flags INTEGER,
        tag TEXT,
        comment TEXT,
        source TEXT NOT NULL DEFAULT 'traefik' CHECK(source IN ('traefik', 'direct', 'api', 'managed', 'discovered')),
        managed INTEGER NOT NULL DEFAULT 1,
        orphaned_at INTEGER,
        last_synced_at INTEGER,
        created_at INTEGER NOT NULL DEFAULT (unixepoch()),
        updated_at INTEGER NOT NULL DEFAULT (unixepoch())
      )
    `);

    // Copy data from old table
    sqliteDb.exec(`
      INSERT INTO dns_records_new
      SELECT * FROM dns_records
    `);

    // Drop old table
    sqliteDb.exec('DROP TABLE dns_records');

    // Rename new table
    sqliteDb.exec('ALTER TABLE dns_records_new RENAME TO dns_records');

    // Recreate indexes
    sqliteDb.exec(`
      CREATE INDEX IF NOT EXISTS idx_dns_records_provider ON dns_records(provider_id);
      CREATE INDEX IF NOT EXISTS idx_dns_records_name ON dns_records(name);
      CREATE INDEX IF NOT EXISTS idx_dns_records_type ON dns_records(type);
      CREATE INDEX IF NOT EXISTS idx_dns_records_orphaned ON dns_records(orphaned_at);
      CREATE INDEX IF NOT EXISTS idx_dns_records_managed ON dns_records(managed);
    `);

    sqliteDb.exec('COMMIT');
    logger.info('Migration complete: dns_records table updated with discovered source support');
  } catch (error) {
    sqliteDb.exec('ROLLBACK');
    logger.error({ error }, 'Failed to migrate dns_records table');
    throw error;
  }
}

/**
 * Get the database instance
 */
export function getDatabase(): BetterSQLite3Database<typeof schema> {
  if (!db) {
    throw new Error('Database not initialized. Call initDatabase() first.');
  }
  return db;
}

/**
 * Get the raw SQLite database instance
 */
export function getSqliteDatabase(): Database.Database {
  if (!sqliteDb) {
    throw new Error('Database not initialized. Call initDatabase() first.');
  }
  return sqliteDb;
}

/**
 * Close the database connection
 */
export function closeDatabase(): void {
  if (sqliteDb) {
    sqliteDb.close();
    sqliteDb = null;
    db = null;
    logger.info('Database connection closed');
  }
}

/**
 * Check if database is initialized
 */
export function isDatabaseInitialized(): boolean {
  return db !== null;
}
