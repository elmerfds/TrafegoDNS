/**
 * DNS record listing/filtering against seeded DB rows (no live provider needed).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { v4 as uuid } from 'uuid';
import { createTestApp, login, type TestContext } from '../../helpers/testApp.js';

let ctx: TestContext;
let token: string;
const providerId = uuid();

beforeAll(async () => {
  ctx = await createTestApp();
  token = (await login(ctx.app)).token;
  const { getDatabase } = await import('../../../src/database/connection.js');
  const { providers, dnsRecords } = await import('../../../src/database/schema/index.js');
  const db = getDatabase();
  const now = new Date();
  await db.insert(providers).values({ id: providerId, name: 'seed', type: 'cloudflare', credentials: '{}', createdAt: now, updatedAt: now });
  const rows: Array<[string, string, string, Partial<{ orphanedAt: Date; source: 'traefik' | 'api'; managed: boolean }>?]> = [
    ['A', 'example.com', '1.2.3.4'],
    ['CNAME', 'app.example.com', 'example.com'],
    ['CNAME', 'api.example.com', 'example.com', { source: 'api' }],
    ['TXT', '_acme.example.com', 'token-value'],
    ['TXT', 'sub._acme.example.com', '100%_done'],
    ['A', 'notexample.com', '5.6.7.8'],
    ['A', 'old.example.com', '9.9.9.9', { orphanedAt: now }],
    ['A', 'unmanaged.example.com', '8.8.8.8', { managed: false }],
  ];
  await db.insert(dnsRecords).values(rows.map(([type, name, content, extra]) => ({
    id: uuid(), providerId, type: type as 'A', name, content, ttl: 300, source: 'traefik' as const, managed: true,
    createdAt: now, updatedAt: now, ...extra,
  })));
});
afterAll(async () => { await ctx?.cleanup(); });

const list = async (q: Record<string, string>) => {
  const res = await request(ctx.app).get('/api/v1/dns/records').query(q).set('Authorization', `Bearer ${token}`);
  expect(res.status).toBe(200);
  return (res.body.data.records as Array<{ name: string }>).map((r) => r.name).sort();
};

describe('GET /dns/records filtering', () => {
  it('zone filter matches apex and subdomains only', async () => {
    const names = await list({ zone: 'example.com', limit: '100' });
    expect(names).toContain('example.com');
    expect(names).toContain('app.example.com');
    expect(names).not.toContain('notexample.com');
  });

  it('zone filter with underscore matches the exact apex (no escaped = comparison)', async () => {
    expect(await list({ zone: '_acme.example.com' })).toEqual(['_acme.example.com', 'sub._acme.example.com']);
  });

  it('search treats % and _ literally', async () => {
    expect(await list({ search: '100%_' })).toEqual(['sub._acme.example.com']);
    expect(await list({ search: '%' })).toEqual(['sub._acme.example.com']);
  });

  it('filters by type, source, managed and status', async () => {
    expect(await list({ type: 'TXT' })).toEqual(['_acme.example.com', 'sub._acme.example.com']);
    expect(await list({ source: 'api' })).toEqual(['api.example.com']);
    expect(await list({ managed: 'false' })).toEqual(['unmanaged.example.com']);
    expect(await list({ status: 'orphaned' })).toEqual(['old.example.com']);
  });

  it('paginates', async () => {
    const res = await request(ctx.app).get('/api/v1/dns/records').query({ limit: '3', page: '2' }).set('Authorization', `Bearer ${token}`);
    expect(res.body.data.records).toHaveLength(3);
    expect(res.body.data.pagination).toMatchObject({ page: 2, limit: 3, total: 8, totalPages: 3 });
  });

  it('rejects an invalid orderBy', async () => {
    const res = await request(ctx.app).get('/api/v1/dns/records').query({ orderBy: 'name;drop' }).set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(400);
  });

  it('sorts descending by name', async () => {
    const res = await request(ctx.app).get('/api/v1/dns/records').query({ orderBy: 'name', direction: 'desc', limit: '100' }).set('Authorization', `Bearer ${token}`);
    const names = res.body.data.records.map((r: { name: string }) => r.name);
    expect(names).toEqual([...names].sort().reverse());
  });
});
