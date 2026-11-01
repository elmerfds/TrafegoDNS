/**
 * Integration test harness: boots the Express app against a throwaway SQLite
 * database without Docker, monitors, or outbound network calls.
 *
 * Each test file runs in its own worker, so module singletons (config, db,
 * rate-limit store) are isolated per file.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Express } from 'express';
import request from 'supertest';

export const ADMIN = { username: 'admin', password: 'TestPassword123!', email: 'admin@test.local' };

export interface TestContext {
  app: Express;
  dataDir: string;
  cleanup: () => Promise<void>;
}

export async function createTestApp(env: Record<string, string> = {}): Promise<TestContext> {
  const dataDir = mkdtempSync(join(tmpdir(), 'trafego-test-'));
  Object.assign(process.env, {
    NODE_ENV: 'test',
    LOG_LEVEL: 'error',
    DATA_DIR: dataDir,
    DATABASE_PATH: join(dataDir, 'test.db'),
    JWT_SECRET: 'test-jwt-secret-that-is-long-enough-for-validation-0123456789',
    ENCRYPTION_KEY: '0123456789abcdef0123456789abcdef',
    AUTH_DEFAULT_ADMIN_USERNAME: ADMIN.username,
    AUTH_DEFAULT_ADMIN_PASSWORD: ADMIN.password,
    AUTH_DEFAULT_ADMIN_EMAIL: ADMIN.email,
    ...env,
  });

  const { resetConfig, getConfig } = await import('../../src/config/ConfigManager.js');
  resetConfig();
  const config = getConfig();

  const { initDatabase, closeDatabase } = await import('../../src/database/connection.js');
  const { container, ServiceTokens } = await import('../../src/core/ServiceContainer.js');
  const db = initDatabase({ path: config.app.databasePath!, runMigrations: true });
  container.registerInstance(ServiceTokens.DATABASE, db);

  const { getSettingsService } = await import('../../src/services/SettingsService.js');
  const settings = getSettingsService();
  await settings.init();
  container.registerInstance(ServiceTokens.SETTINGS_SERVICE, settings);

  if (config.security.authMode !== 'none') {
    const { ensureAdminUser } = await import('../../src/api/controllers/authController.js');
    const { defaultAdminUsername, defaultAdminPassword, defaultAdminEmail } = config.auth;
    await ensureAdminUser(defaultAdminUsername, defaultAdminPassword, defaultAdminEmail);
  }

  const { createApp } = await import('../../src/app.js');
  const app = createApp({ trustProxy: config.security.trustProxy });

  return {
    app,
    dataDir,
    cleanup: async () => {
      closeDatabase();
      rmSync(dataDir, { recursive: true, force: true });
    },
  };
}

let loginCounter = 0;
/** A distinct client IP per call, so helper logins don't share the auth rate-limit bucket.
 *  supertest connects from loopback, which TRUST_PROXY trusts by default. */
export function nextClientIp(): string {
  loginCounter++;
  return `198.51.100.${(loginCounter % 250) + 1}`;
}

/** Log in and return the Set-Cookie header plus bearer token */
export async function login(app: Express, creds = ADMIN): Promise<{ token: string; cookies: string[] }> {
  const res = await request(app).post('/api/v1/auth/login')
    .set('X-Forwarded-For', nextClientIp())
    .send({ username: creds.username, password: creds.password });
  if (res.status !== 200) throw new Error(`login failed: ${res.status} ${JSON.stringify(res.body)}`);
  const cookies = ([] as string[]).concat(res.headers['set-cookie'] ?? []);
  const token = res.body?.data?.token ?? res.body?.token;
  return { token, cookies };
}
