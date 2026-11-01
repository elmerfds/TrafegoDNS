/**
 * Regression tests for table-rebuild migrations on pre-existing databases.
 * B1: rebuilding a parent table must not cascade-delete child rows.
 * B12: tunnels.status must accept 'deleted' after migration.
 */
import { describe, it, expect, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { initDatabase, closeDatabase, getSqliteDatabase } from '../../../src/database/connection.js';

let dir: string | undefined;
afterEach(() => { closeDatabase(); if (dir) rmSync(dir, { recursive: true, force: true }); dir = undefined; });

/** Create a current-schema DB, then downgrade selected constraints to mimic an old install. */
function makeOldDatabase(downgrade: (raw: Database.Database) => void): string {
  dir = mkdtempSync(join(tmpdir(), 'trafego-mig-'));
  const path = join(dir, 'old.db');
  initDatabase({ path });
  closeDatabase();
  const raw = new Database(path);
  raw.pragma('foreign_keys = OFF');
  const rewrite = (table: string, transform: (sql: string) => string) => {
    const { sql } = raw.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name=?").get(table) as { sql: string };
    const oldSql = transform(sql).replace(/CREATE TABLE\s+(IF NOT EXISTS\s+)?["`]?\w+["`]?/i, `CREATE TABLE ${table}_old`);
    raw.exec(oldSql);
    raw.exec(`INSERT INTO ${table}_old SELECT * FROM ${table}; DROP TABLE ${table}; ALTER TABLE ${table}_old RENAME TO ${table};`);
  };
  (raw as unknown as { rewrite: typeof rewrite }).rewrite = rewrite;
  downgrade(raw);
  raw.close();
  return path;
}

function seed(raw: Database.Database) {
  raw.pragma('foreign_keys = ON');
  raw.exec(`
    INSERT INTO providers (id, name, type, credentials) VALUES ('p1', 'cf', 'cloudflare', '{}');
    INSERT INTO dns_records (id, provider_id, type, name, content, ttl, source) VALUES ('r1', 'p1', 'A', 'a.example.com', '1.2.3.4', 300, 'traefik');
    INSERT INTO tunnels (id, provider_id, tunnel_id, name, status) VALUES ('t1', 'p1', 'cf-tunnel', 'tun', 'active');
    INSERT INTO users (id, username, email, password_hash, role) VALUES ('u1', 'bob', 'bob@x.io', 'h', 'admin');
    INSERT INTO api_keys (id, user_id, name, key_hash, key_prefix, permissions) VALUES ('k1', 'u1', 'k', 'hash', 'pref', '["read"]');
  `);
}

const count = (table: string) => (getSqliteDatabase().prepare(`SELECT COUNT(*) c FROM ${table}`).get() as { c: number }).c;

describe('schema migrations on existing databases', () => {
  it('rebuilding providers (old type CHECK) keeps dns_records and tunnels', () => {
    const path = makeOldDatabase((raw) => {
      (raw as unknown as { rewrite: (t: string, f: (s: string) => string) => void })
        .rewrite('providers', (sql) => sql.replace(/, 'rfc2136'/, ''));
    });
    const raw = new Database(path);
    seed(raw);
    expect((raw.prepare("SELECT sql FROM sqlite_master WHERE name='providers'").get() as { sql: string }).sql).not.toContain('rfc2136');
    raw.close();

    initDatabase({ path });
    expect((getSqliteDatabase().prepare("SELECT sql FROM sqlite_master WHERE name='providers'").get() as { sql: string }).sql).toContain("'rfc2136'");
    expect(count('dns_records')).toBe(1);
    expect(count('tunnels')).toBe(1);
    expect(count('api_keys')).toBe(1);
    expect(getSqliteDatabase().pragma('foreign_keys', { simple: true })).toBe(1);
  });

  it("migrates tunnels.status to allow 'deleted' without losing rows", () => {
    const path = makeOldDatabase((raw) => {
      (raw as unknown as { rewrite: (t: string, f: (s: string) => string) => void })
        .rewrite('tunnels', (sql) => sql.replace(", 'deleted'", ''));
    });
    const raw = new Database(path);
    seed(raw);
    expect(() => raw.prepare("UPDATE tunnels SET status='deleted' WHERE id='t1'").run()).toThrow(/CHECK/);
    raw.close();

    initDatabase({ path });
    expect(count('tunnels')).toBe(1);
    expect(() => getSqliteDatabase().prepare("UPDATE tunnels SET status='deleted' WHERE id='t1'").run()).not.toThrow();
    expect(getSqliteDatabase().prepare("SELECT name FROM sqlite_master WHERE name='idx_tunnels_provider'").get()).toBeTruthy();
  });

  it('a fresh database accepts tunnel status deleted', () => {
    dir = mkdtempSync(join(tmpdir(), 'trafego-mig-'));
    initDatabase({ path: join(dir, 'new.db') });
    const db = getSqliteDatabase();
    db.exec("INSERT INTO providers (id, name, type, credentials) VALUES ('p1','cf','cloudflare','{}')");
    expect(() => db.exec("INSERT INTO tunnels (id, provider_id, tunnel_id, name, status) VALUES ('t1','p1','x','t','deleted')")).not.toThrow();
  });
});
