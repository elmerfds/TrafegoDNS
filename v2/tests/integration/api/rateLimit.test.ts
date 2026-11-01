/**
 * Login rate limiting and client-IP resolution behind proxies.
 * supertest connects from 127.0.0.1, which plays the role of the trusted reverse proxy.
 */
import { describe, it, expect, afterEach } from 'vitest';
import request from 'supertest';
import { createTestApp, type TestContext } from '../../helpers/testApp.js';

let ctx: TestContext | undefined;
afterEach(async () => { await ctx?.cleanup(); ctx = undefined; });

const attempt = (xff?: string) => {
  const r = request(ctx!.app).post('/api/v1/auth/login');
  if (xff) r.set('X-Forwarded-For', xff);
  return r.send({ username: 'admin', password: 'wrong' });
};

describe('auth rate limit', { timeout: 90_000 }, () => {
  it('blocks the 31st attempt from one client within the window', async () => {
    ctx = await createTestApp();
    for (let i = 0; i < 30; i++) expect((await attempt('203.0.113.10')).status).toBe(401);
    const blocked = await attempt('203.0.113.10');
    expect(blocked.status).toBe(429);
    // A different client is unaffected
    expect((await attempt('203.0.113.11')).status).toBe(401);
  });

  it('cannot be bypassed by forging X-Forwarded-For in front of a trusted proxy', async () => {
    ctx = await createTestApp();
    // The proxy appends the real client (203.0.113.20); the attacker controls everything to the left
    for (let i = 0; i < 30; i++) await attempt(`10.${i}.0.1, 203.0.113.20`);
    expect((await attempt('8.8.8.8, 203.0.113.20')).status).toBe(429);
  });

  it('ignores X-Forwarded-For entirely when TRUST_PROXY=false', async () => {
    ctx = await createTestApp({ TRUST_PROXY: 'false' });
    for (let i = 0; i < 30; i++) await attempt(`203.0.113.${i + 1}`);
    // All attempts came from 127.0.0.1 regardless of header
    expect((await attempt('203.0.113.200')).status).toBe(429);
  });

  it('TRUST_PROXY=true is treated as one hop, not "trust everything"', async () => {
    ctx = await createTestApp({ TRUST_PROXY: 'true' });
    for (let i = 0; i < 30; i++) await attempt(`192.0.2.${i + 1}, 203.0.113.30`);
    expect((await attempt('192.0.2.250, 203.0.113.30')).status).toBe(429);
  });

  it('general API traffic does not count towards the login limit', async () => {
    ctx = await createTestApp();
    for (let i = 0; i < 40; i++) await request(ctx.app).get('/api/v1/health').set('X-Forwarded-For', '203.0.113.40');
    expect((await attempt('203.0.113.40')).status).toBe(401);
  });
});
