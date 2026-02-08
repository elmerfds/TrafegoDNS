/**
 * Database module exports
 */
export {
  initDatabase,
  getDatabase,
  getSqliteDatabase,
  closeDatabase,
  isDatabaseInitialized,
  type DatabaseOptions,
} from './connection.js';

export * from './schema/index.js';
