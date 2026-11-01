/**
 * Boots a DNSManager against a throwaway SQLite DB with FakeProvider instances
 * injected (no loadProviders(), no network, no Docker).
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FakeProvider } from './fakeProvider.js';

export interface DnsHarness {
  manager: import('../../src/services/DNSManager.js').DNSManager;
  providers: FakeProvider[];
  db: ReturnType<typeof import('../../src/database/connection.js').getDatabase>;
  setSetting: (key: string, value: string) => Promise<void>;
  sync: (hostnames: string[], labels?: Record<string, Record<string, string>>) => Promise<void>;
  tracked: () => Promise<Array<Record<string, unknown>>>;
  cleanup: () => Promise<void>;
}

export async function createDnsHarness(opts: { providers?: Array<{ id: string; zone?: string; proxied?: boolean }>; env?: Record<string, string> } = {}): Promise<DnsHarness> {
  const dataDir = mkdtempSync(join(tmpdir(), 'trafego-dns-'));
  Object.assign(process.env, {
    NODE_ENV: 'test', LOG_LEVEL: 'error', DATA_DIR: dataDir, DATABASE_PATH: join(dataDir, 'test.db'),
    JWT_SECRET: 'test-jwt-secret-that-is-long-enough-for-validation-0123456789',
    ENCRYPTION_KEY: '0123456789abcdef0123456789abcdef',
    DNS_DEFAULT_TYPE: 'A', DNS_DEFAULT_CONTENT: '192.0.2.1', PUBLIC_IP: '192.0.2.1', DNS_DEFAULT_PROXIED: 'false',
    ...opts.env,
  });
  const { resetConfig, getConfig } = await import('../../src/config/ConfigManager.js');
  resetConfig();
  const config = getConfig();
  const { initDatabase, closeDatabase, getDatabase } = await import('../../src/database/connection.js');
  const { container, ServiceTokens } = await import('../../src/core/ServiceContainer.js');
  const db = initDatabase({ path: config.app.databasePath!, runMigrations: true });
  container.registerInstance(ServiceTokens.DATABASE, db);
  const { getSettingsService } = await import('../../src/services/SettingsService.js');
  const settings = getSettingsService();
  await settings.init();
  container.registerInstance(ServiceTokens.SETTINGS_SERVICE, settings);

  const { providers: providersTable, dnsRecords } = await import('../../src/database/schema/index.js');
  const { DNSManager } = await import('../../src/services/DNSManager.js');
  const manager = new DNSManager(config);
  const specs = opts.providers ?? [{ id: 'p1' }];
  const fakes: FakeProvider[] = [];
  const now = new Date();
  for (const [i, spec] of specs.entries()) {
    await db.insert(providersTable).values({ id: spec.id, name: `fake-${spec.id}`, type: 'cloudflare', credentials: '{}', isDefault: i === 0, createdAt: now, updatedAt: now });
    const fake = new FakeProvider(spec.id, spec.zone ?? 'example.com', spec.proxied ?? true);
    await fake.init();
    fakes.push(fake);
    (manager as unknown as { providerInstances: Map<string, unknown> }).providerInstances.set(spec.id, fake);
  }
  (manager as unknown as { defaultProviderId: string }).defaultProviderId = specs[0]!.id;
  (manager as unknown as { initialized: boolean }).initialized = true;

  return {
    manager, providers: fakes, db: getDatabase(),
    setSetting: async (k, v) => { await settings.set(k, v); },
    sync: async (hostnames, labels = {}) => { await manager.processHostnames(hostnames, labels); },
    tracked: async () => (await getDatabase().select().from(dnsRecords)) as Array<Record<string, unknown>>,
    cleanup: async () => { closeDatabase(); rmSync(dataDir, { recursive: true, force: true }); },
  };
}
