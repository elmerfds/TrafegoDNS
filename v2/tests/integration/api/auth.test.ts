import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createTestApp, login, nextClientIp, ADMIN, type TestContext } from '../../helpers/testApp.js';

let ctx: TestContext;
beforeAll(async () => { ctx = await createTestApp(); });
afterAll(async () => { await ctx?.cleanup(); });

const auth = (t: string) => ({ Authorization: `Bearer ${t}` });

describe('POST /auth/login', () => {
  it('returns a token and an httpOnly cookie scoped to /api/', async () => {
    const res = await request(ctx.app).post('/api/v1/auth/login').set('X-Forwarded-For', nextClientIp()).send({ username: ADMIN.username, password: ADMIN.password });
    expect(res.status).toBe(200);
    expect(res.body.data.token).toBeTruthy();
    expect(res.body.data.user).not.toHaveProperty('passwordHash');
    const cookie = ([] as string[]).concat(res.headers['set-cookie'])[0]!;
    expect(cookie).toMatch(/^token=/);
    expect(cookie).toMatch(/Path=\/api\//);
    expect(cookie).toMatch(/HttpOnly/);
    expect(cookie).toMatch(/SameSite=Strict/);
    expect(cookie).not.toMatch(/Secure/); // plain HTTP request
  });

  it('sets Secure when a trusted proxy reports HTTPS', async () => {
    const res = await request(ctx.app).post('/api/v1/auth/login').set('X-Forwarded-For', nextClientIp())
      .set('X-Forwarded-Proto', 'https')
      .send({ username: ADMIN.username, password: ADMIN.password });
    expect(([] as string[]).concat(res.headers['set-cookie'])[0]).toMatch(/Secure/);
  });

  it('rejects a wrong password with 401 and no cookie', async () => {
    const res = await request(ctx.app).post('/api/v1/auth/login').set('X-Forwarded-For', nextClientIp()).send({ username: ADMIN.username, password: 'wrong' });
    expect(res.status).toBe(401);
    expect(res.headers['set-cookie']).toBeUndefined();
  });

  it('gives the same error for unknown users (no user enumeration)', async () => {
    const a = await request(ctx.app).post('/api/v1/auth/login').set('X-Forwarded-For', nextClientIp()).send({ username: ADMIN.username, password: 'wrong' });
    const b = await request(ctx.app).post('/api/v1/auth/login').set('X-Forwarded-For', nextClientIp()).send({ username: 'nobody', password: 'wrong' });
    expect(b.status).toBe(a.status);
    expect(b.body.error?.message).toBe(a.body.error?.message);
  });

  it('rejects an empty body with 400', async () => {
    const res = await request(ctx.app).post('/api/v1/auth/login').set('X-Forwarded-For', nextClientIp()).send({});
    expect(res.status).toBe(400);
  });

  it('handles simultaneous logins for the same user (unique session tokens)', async () => {
    const results = await Promise.all([1, 2, 3].map(() => login(ctx.app)));
    expect(new Set(results.map((r) => r.token)).size).toBe(3);
  });
});

describe('authenticated access', () => {
  it('rejects requests without credentials', async () => {
    expect((await request(ctx.app).get('/api/v1/auth/me')).status).toBe(401);
    expect((await request(ctx.app).get('/api/v1/dns/records')).status).toBe(401);
  });

  it('rejects a tampered token', async () => {
    const { token } = await login(ctx.app);
    const [h, p] = token.split('.');
    const res = await request(ctx.app).get('/api/v1/auth/me').set(auth(`${h}.${p}.invalidsignature`));
    expect(res.status).toBe(401);
  });

  it('rejects alg=none tokens', async () => {
    const enc = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
    const forged = `${enc({ alg: 'none', typ: 'JWT' })}.${enc({ sub: 'x', role: 'admin' })}.`;
    expect((await request(ctx.app).get('/api/v1/auth/me').set(auth(forged))).status).toBe(401);
  });

  it('accepts the bearer token and the cookie', async () => {
    const { token, cookies } = await login(ctx.app);
    expect((await request(ctx.app).get('/api/v1/auth/me').set(auth(token))).body.data.username).toBe(ADMIN.username);
    expect((await request(ctx.app).get('/api/v1/auth/me').set('Cookie', cookies)).status).toBe(200);
  });
});

describe('POST /auth/logout', () => {
  it('revokes the session and clears both current and legacy cookie paths', async () => {
    const { token } = await login(ctx.app);
    const res = await request(ctx.app).post('/api/v1/auth/logout').set(auth(token));
    expect(res.status).toBe(200);
    const cleared = ([] as string[]).concat(res.headers['set-cookie']);
    expect(cleared.some((c) => /^token=;/.test(c) && /Path=\/api\//.test(c))).toBe(true);
    expect(cleared.some((c) => /^token=;/.test(c) && /Path=\/;/.test(c))).toBe(true);
    // Token must be unusable after logout
    expect((await request(ctx.app).get('/api/v1/auth/me').set(auth(token))).status).toBe(401);
  });
});

describe('PUT /auth/profile', () => {
  it('rejects a weak password', async () => {
    const { token } = await login(ctx.app);
    const res = await request(ctx.app).put('/api/v1/auth/profile').set(auth(token)).send({ password: 'weakpass' });
    expect(res.status).toBe(400);
  });

  it('accepts a strong password and the new password works', async () => {
    const { token } = await login(ctx.app);
    const newPassword = 'An0ther!StrongPass';
    expect((await request(ctx.app).put('/api/v1/auth/profile').set(auth(token)).send({ password: newPassword })).status).toBe(200);
    await login(ctx.app, { ...ADMIN, password: newPassword });
    // restore
    const t2 = (await login(ctx.app, { ...ADMIN, password: newPassword })).token;
    await request(ctx.app).put('/api/v1/auth/profile').set(auth(t2)).send({ password: ADMIN.password });
  });

  it('rejects a non-image avatar', async () => {
    const { token } = await login(ctx.app);
    const res = await request(ctx.app).put('/api/v1/auth/profile').set(auth(token)).send({ avatar: 'javascript:alert(1)' });
    expect(res.status).toBe(400);
  });
});

describe('API keys', () => {
  it('creates a key that authenticates via X-API-Key, then revokes it', async () => {
    const { token } = await login(ctx.app);
    const created = await request(ctx.app).post('/api/v1/auth/api-keys').set(auth(token)).send({ name: 'ci', permissions: ['read'] });
    expect(created.status).toBe(201);
    const key: string = created.body.data.key;
    expect(key).toBeTruthy();

    expect((await request(ctx.app).get('/api/v1/dns/records').set('X-API-Key', key)).status).toBe(200);

    const list = await request(ctx.app).get('/api/v1/auth/api-keys').set(auth(token));
    expect(JSON.stringify(list.body)).not.toContain(key); // full key never returned again

    expect((await request(ctx.app).delete(`/api/v1/auth/api-keys/${created.body.data.id}`).set(auth(token))).status).toBe(200);
    expect((await request(ctx.app).get('/api/v1/dns/records').set('X-API-Key', key)).status).toBe(401);
  });

  it('a read-only key cannot write', async () => {
    const { token } = await login(ctx.app);
    const created = await request(ctx.app).post('/api/v1/auth/api-keys').set(auth(token)).send({ name: 'ro', permissions: ['read'] });
    const res = await request(ctx.app).post('/api/v1/webhooks').set('X-API-Key', created.body.data.key)
      .send({ name: 'x', url: 'https://example.com/h', secret: 's'.repeat(16), events: ['dns.record.created'] });
    expect(res.status).toBe(403);
  });
});
