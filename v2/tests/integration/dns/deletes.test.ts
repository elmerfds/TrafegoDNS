/**
 * B16: every delete path keeps the DB row on real provider failures and
 * removes it when the record is already gone at the provider.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { createDnsHarness, type DnsHarness } from '../../helpers/dnsManagerHarness.js';
import { ADMIN, login } from '../../helpers/testApp.js';

let h: DnsHarness;
let app: Express;
let token: string;

beforeEach(async () => {
  h = await createDnsHarness({ env: { AUTH_DEFAULT_ADMIN_USERNAME: ADMIN.username, AUTH_DEFAULT_ADMIN_PASSWORD: ADMIN.password } });
  const { ensureAdminUser } = await import('../../../src/api/controllers/authController.js');
  await ensureAdminUser(ADMIN.username, ADMIN.password, ADMIN.email);
  const { container, ServiceTokens } = await import('../../../src/core/ServiceContainer.js');
  container.registerInstance(ServiceTokens.DNS_MANAGER, h.manager);
  const { getConfig } = await import('../../../src/config/ConfigManager.js');
  const { createApp } = await import('../../../src/app.js');
  app = createApp({ trustProxy: getConfig().security.trustProxy });
  token = (await login(app)).token;
  await h.sync(['a.example.com', 'b.example.com', 'c.example.com']);
});
afterEach(async () => { await h.cleanup(); });

const idOf = async (name: string) => (await h.tracked()).find((r) => r.name === name)!.id as string;
const del = (id: string) => request(app).delete(`/api/v1/dns/records/${id}`).set('Authorization', `Bearer ${token}`);

describe('DELETE /dns/records/:id', () => {
  it('deletes at the provider and in the DB', async () => {
    expect((await del(await idOf('a.example.com'))).status).toBe(200);
    expect([...h.providers[0]!.remote.values()].map((r) => r.name).sort()).toEqual(['b.example.com', 'c.example.com']);
    expect((await h.tracked()).map((r) => r.name)).not.toContain('a.example.com');
  });

  it('removes a stale row whose record is already gone at the provider', async () => {
    const id = await idOf('a.example.com');
    h.providers[0]!.remote.clear();
    const res = await del(id);
    expect(res.status).toBe(200);
    expect((await h.tracked()).map((r) => r.id)).not.toContain(id);
  });

  it('removes a stale row when the provider throws "Record not found" (Cloudflare/AdGuard/Pi-hole style)', async () => {
    const id = await idOf('a.example.com');
    h.providers[0]!.deleteRecord = async (extId: string) => { throw new Error(`Record not found: ${extId}`); };
    expect((await del(id)).status).toBe(200);
    expect((await h.tracked()).map((r) => r.id)).not.toContain(id);
  });

  it('keeps the row and reports an error on a real provider failure', async () => {
    const id = await idOf('a.example.com');
    h.providers[0]!.failNext = { op: 'delete', error: Object.assign(new Error('Unauthorized'), { status: 401 }) };
    expect((await del(id)).status).toBeGreaterThanOrEqual(500);
    expect((await h.tracked()).map((r) => r.id)).toContain(id);
  });
});

describe('POST /dns/records/bulk-delete', () => {
  it('counts provider failures as failed and keeps those rows', async () => {
    const ids = [await idOf('a.example.com'), await idOf('b.example.com')];
    h.providers[0]!.failNext = { op: 'delete', error: new Error('rate limited') };
    const res = await request(app).post('/api/v1/dns/records/bulk-delete').set('Authorization', `Bearer ${token}`).send({ ids });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ deleted: 1, failed: 1 });
    expect((await h.tracked()).filter((r) => ids.includes(r.id as string))).toHaveLength(1);
  });
});

describe('orphan cleanup', () => {
  it('keeps the tracking row when the provider delete fails, removes it once it succeeds', async () => {
    await h.setSetting('cleanup_orphaned', 'true');
    await h.setSetting('cleanup_grace_period', '0');
    await h.sync(['a.example.com', 'b.example.com']); // c orphaned
    h.providers[0]!.failNext = { op: 'delete', error: new Error('network down') };
    await h.sync(['a.example.com', 'b.example.com']); // delete attempt fails
    expect((await h.tracked()).map((r) => r.name)).toContain('c.example.com');
    await h.sync(['a.example.com', 'b.example.com']); // retry succeeds
    expect((await h.tracked()).map((r) => r.name)).not.toContain('c.example.com');
    expect([...h.providers[0]!.remote.values()].map((r) => r.name)).not.toContain('c.example.com');
  });

  it('drops the tracking row when the orphaned record is already gone', async () => {
    await h.setSetting('cleanup_orphaned', 'true');
    await h.setSetting('cleanup_grace_period', '0');
    await h.sync(['a.example.com', 'b.example.com']);
    const c = [...h.providers[0]!.remote.values()].find((r) => r.name === 'c.example.com')!;
    h.providers[0]!.remote.delete(c.id!);
    await h.sync(['a.example.com', 'b.example.com']);
    expect((await h.tracked()).map((r) => r.name)).not.toContain('c.example.com');
  });
});
