import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getConfig, resetConfig } from '../../../src/config/ConfigManager.js';

const KEYS = ['TRUST_PROXY', 'AUTH_DEFAULT_ADMIN_USERNAME', 'AUTH_DEFAULT_ADMIN_PASSWORD', 'AUTH_DEFAULT_ADMIN_EMAIL',
  'DEFAULT_ADMIN_USERNAME', 'DEFAULT_ADMIN_PASSWORD', 'DEFAULT_ADMIN_EMAIL', 'AUTH_MODE', 'AUTH_DISABLED', 'GLOBAL_API_KEY'];
let saved: Record<string, string | undefined>;

beforeEach(() => {
  saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));
  KEYS.forEach((k) => delete process.env[k]);
  process.env.DATA_DIR = '/tmp/trafego-config-test';
  resetConfig();
});
afterEach(() => {
  KEYS.forEach((k) => (saved[k] === undefined ? delete process.env[k] : (process.env[k] = saved[k])));
  resetConfig();
});

const cfg = () => { resetConfig(); return getConfig(); };

describe('TRUST_PROXY', () => {
  it('defaults to private/loopback peers only, never `true`', () => {
    expect(cfg().security.trustProxy).toBe('loopback, linklocal, uniquelocal');
  });
  it.each([
    ['1', 1], ['2', 2], ['false', false], ['0', false],
    ['true', 1], ['TRUE', 1],
    ['10.0.0.1, 172.18.0.0/16', '10.0.0.1, 172.18.0.0/16'],
  ])('parses %s', (raw, expected) => {
    process.env.TRUST_PROXY = raw as string;
    expect(cfg().security.trustProxy).toEqual(expected);
  });
});

describe('default admin env vars', () => {
  it('uses built-in defaults when nothing is set', () => {
    expect(cfg().auth).toEqual({ defaultAdminUsername: 'admin', defaultAdminPassword: 'admin', defaultAdminEmail: 'admin@localhost' });
  });
  it('honours legacy DEFAULT_ADMIN_* names (production compatibility)', () => {
    Object.assign(process.env, { DEFAULT_ADMIN_USERNAME: 'legacy', DEFAULT_ADMIN_PASSWORD: 'legacy-pass', DEFAULT_ADMIN_EMAIL: 'l@x.io' });
    expect(cfg().auth).toEqual({ defaultAdminUsername: 'legacy', defaultAdminPassword: 'legacy-pass', defaultAdminEmail: 'l@x.io' });
  });
  it('prefers AUTH_DEFAULT_ADMIN_* over legacy names', () => {
    Object.assign(process.env, { DEFAULT_ADMIN_PASSWORD: 'legacy', AUTH_DEFAULT_ADMIN_PASSWORD: 'new' });
    expect(cfg().auth.defaultAdminPassword).toBe('new');
  });
});

describe('auth mode', () => {
  it('AUTH_DISABLED=true maps to none', () => {
    process.env.AUTH_DISABLED = 'true';
    expect(cfg().security.authMode).toBe('none');
  });
  it('ignores a GLOBAL_API_KEY shorter than 32 chars', () => {
    process.env.GLOBAL_API_KEY = 'short';
    expect(cfg().security.globalApiKeyHash).toBeNull();
  });
  it('stores only a hash of a valid GLOBAL_API_KEY', () => {
    process.env.GLOBAL_API_KEY = 'k'.repeat(40);
    const h = cfg().security.globalApiKeyHash;
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(h).not.toContain('kkkk');
  });
});
