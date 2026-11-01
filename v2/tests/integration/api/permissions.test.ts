import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createTestApp, login, type TestContext } from '../../helpers/testApp.js';

let ctx: TestContext;
let adminToken: string;
const tokens: Record<string, string> = {};
const PASSWORD = 'Role!Passw0rd123';
const auth = (t: string) => ({ Authorization: `Bearer ${t}` });

beforeAll(async () => {
  ctx = await createTestApp();
  adminToken = (await login(ctx.app)).token;
  for (const role of ['user', 'readonly'] as const) {
    const res = await request(ctx.app).post('/api/v1/users').set(auth(adminToken))
      .send({ username: `${role}1`, email: `${role}@test.local`, password: PASSWORD, role });
    expect(res.status).toBe(201);
    tokens[role] = (await login(ctx.app, { username: `${role}1`, password: PASSWORD, email: '' })).token;
  }
});
afterAll(async () => { await ctx?.cleanup(); });

const webhook = { name: 'hook', url: 'https://example.com/h', secret: 's'.repeat(16), events: ['dns.record.created'] };

describe('role-based access', () => {
  it.each(['user', 'readonly'])('%s can read DNS records', async (role) => {
    expect((await request(ctx.app).get('/api/v1/dns/records').set(auth(tokens[role]!))).status).toBe(200);
  });

  it('readonly cannot write', async () => {
    expect((await request(ctx.app).post('/api/v1/webhooks').set(auth(tokens.readonly!)).send(webhook)).status).toBe(403);
    expect((await request(ctx.app).post('/api/v1/preserved-hostnames').set(auth(tokens.readonly!)).send({ hostname: 'a.example.com' })).status).toBe(403);
  });

  it('user can write webhooks', async () => {
    expect((await request(ctx.app).post('/api/v1/webhooks').set(auth(tokens.user!)).send(webhook)).status).toBe(201);
  });

  it.each(['user', 'readonly'])('%s cannot manage users, providers, settings, audit or security logs', async (role) => {
    const t = tokens[role]!;
    expect((await request(ctx.app).get('/api/v1/users').set(auth(t))).status).toBe(403);
    expect((await request(ctx.app).post('/api/v1/users').set(auth(t))
      .send({ username: 'evil', email: 'e@x.io', password: PASSWORD, role: 'admin' })).status).toBe(403);
    expect((await request(ctx.app).post('/api/v1/providers').set(auth(t)).send({ name: 'x', type: 'cloudflare', credentials: {} })).status).toBe(403);
    expect((await request(ctx.app).put('/api/v1/settings/poll_interval').set(auth(t)).send({ value: '1000' })).status).toBe(403);
    expect((await request(ctx.app).get('/api/v1/audit').set(auth(t))).status).toBe(403);
    expect((await request(ctx.app).get('/api/v1/security').set(auth(t))).status).toBe(403);
  });

  it('a user cannot escalate their own role via profile update', async () => {
    await request(ctx.app).put('/api/v1/auth/profile').set(auth(tokens.user!)).send({ role: 'admin' });
    const me = await request(ctx.app).get('/api/v1/auth/me').set(auth(tokens.user!));
    expect(me.body.data.role).toBe('user');
  });

  it('non-admins only see their own API keys', async () => {
    await request(ctx.app).post('/api/v1/auth/api-keys').set(auth(adminToken)).send({ name: 'admin-key' });
    await request(ctx.app).post('/api/v1/auth/api-keys').set(auth(tokens.user!)).send({ name: 'user-key' });
    const userList = await request(ctx.app).get('/api/v1/auth/api-keys').set(auth(tokens.user!));
    expect(userList.body.data.map((k: { name: string }) => k.name)).toEqual(['user-key']);
    const adminList = await request(ctx.app).get('/api/v1/auth/api-keys').set(auth(adminToken));
    expect(adminList.body.data.map((k: { name: string }) => k.name).sort()).toEqual(['admin-key', 'user-key']);
  });

  it('a user cannot revoke another user\'s API key', async () => {
    const k = await request(ctx.app).post('/api/v1/auth/api-keys').set(auth(adminToken)).send({ name: 'protected' });
    const res = await request(ctx.app).delete(`/api/v1/auth/api-keys/${k.body.data.id}`).set(auth(tokens.user!));
    expect([403, 404]).toContain(res.status);
    const still = await request(ctx.app).get('/api/v1/dns/records').set('X-API-Key', k.body.data.key);
    expect(still.status).toBe(200);
  });

  it('a user cannot revoke another user\'s session', async () => {
    const sessions = await request(ctx.app).get('/api/v1/auth/sessions').set(auth(adminToken));
    const adminSessionId = sessions.body.data?.[0]?.id ?? sessions.body.data?.sessions?.[0]?.id;
    expect(adminSessionId).toBeTruthy();
    await request(ctx.app).delete(`/api/v1/auth/sessions/${adminSessionId}`).set(auth(tokens.user!));
    expect((await request(ctx.app).get('/api/v1/auth/me').set(auth(adminToken))).status).toBe(200);
  });

  it('a deleted user\'s token stops working immediately', async () => {
    const created = await request(ctx.app).post('/api/v1/users').set(auth(adminToken))
      .send({ username: 'temp1', email: 'temp@test.local', password: PASSWORD, role: 'user' });
    const t = (await login(ctx.app, { username: 'temp1', password: PASSWORD, email: '' })).token;
    expect((await request(ctx.app).delete(`/api/v1/users/${created.body.data.id}`).set(auth(adminToken))).status).toBe(200);
    expect((await request(ctx.app).get('/api/v1/auth/me').set(auth(t))).status).toBe(401);
  });
});
