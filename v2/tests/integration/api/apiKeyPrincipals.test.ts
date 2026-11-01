import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createTestApp, login, type TestContext } from '../../helpers/testApp.js';

const GLOBAL_KEY = 'g'.repeat(40);
let ctx: TestContext;
let adminToken: string;
const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
const webhook = { name: 'hook', url: 'https://example.com/h', secret: 's'.repeat(16), events: ['dns.record.created'] };

beforeAll(async () => {
  ctx = await createTestApp({ GLOBAL_API_KEY: GLOBAL_KEY });
  adminToken = (await login(ctx.app)).token;
});
afterAll(async () => { await ctx?.cleanup(); });

async function auditCount(): Promise<number> {
  const res = await request(ctx.app).get('/api/v1/audit?limit=100').set(auth(adminToken));
  expect(res.status).toBe(200);
  return res.body.data.logs?.length ?? res.body.data.length ?? res.body.pagination?.total;
}

describe('global API key principal (B9)', () => {
  it('mutations are audited without violating the users FK', async () => {
    const before = await auditCount();
    const res = await request(ctx.app).post('/api/v1/webhooks').set('X-API-Key', GLOBAL_KEY).send(webhook);
    expect(res.status).toBe(201);
    await new Promise((r) => setTimeout(r, 50));
    expect(await auditCount()).toBeGreaterThan(before);
  });

  it('cannot mint user API keys (no user row to own them)', async () => {
    const res = await request(ctx.app).post('/api/v1/auth/api-keys').set('X-API-Key', GLOBAL_KEY)
      .send({ name: 'k', permissions: ['read'] });
    expect(res.status).toBe(400);
  });

  it('preference writes succeed without persisting', async () => {
    const res = await request(ctx.app).put('/api/v1/preferences/theme').set('X-API-Key', GLOBAL_KEY)
      .send({ value: 'dark' });
    expect(res.status).toBe(200);
    expect(res.body.data.persisted).toBe(false);
  });
});

describe('API keys follow the owner\'s current role (B17)', () => {
  const PASSWORD = 'Owner!Passw0rd123';
  let ownerId: string;
  let key: string;

  beforeAll(async () => {
    const created = await request(ctx.app).post('/api/v1/users').set(auth(adminToken))
      .send({ username: 'owner', email: 'owner@test.local', password: PASSWORD, role: 'admin' });
    expect(created.status).toBe(201);
    ownerId = created.body.data.id;
    const ownerToken = (await login(ctx.app, { username: 'owner', password: PASSWORD, email: '' })).token;
    const k = await request(ctx.app).post('/api/v1/auth/api-keys').set(auth(ownerToken))
      .send({ name: 'full', permissions: ['*'] });
    expect(k.status).toBe(201);
    key = k.body.data.key;
  });

  it('works while the owner is admin', async () => {
    expect((await request(ctx.app).get('/api/v1/users').set('X-API-Key', key)).status).toBe(200);
    expect((await request(ctx.app).post('/api/v1/webhooks').set('X-API-Key', key)
      .send({ ...webhook, name: 'h2' })).status).toBe(201);
  });

  it('loses write access when the owner is demoted to readonly', async () => {
    const r = await request(ctx.app).put(`/api/v1/users/${ownerId}`).set(auth(adminToken)).send({ role: 'readonly' });
    expect(r.status).toBe(200);
    expect((await request(ctx.app).post('/api/v1/webhooks').set('X-API-Key', key)
      .send({ ...webhook, name: 'h3' })).status).toBe(403);
    expect((await request(ctx.app).get('/api/v1/users').set('X-API-Key', key)).status).toBe(403);
    expect((await request(ctx.app).get('/api/v1/webhooks').set('X-API-Key', key)).status).toBe(200);
  });

  it('stops working when the owner is deleted', async () => {
    expect((await request(ctx.app).delete(`/api/v1/users/${ownerId}`).set(auth(adminToken))).status).toBe(200);
    expect((await request(ctx.app).get('/api/v1/webhooks').set('X-API-Key', key)).status).toBe(401);
  });
});
