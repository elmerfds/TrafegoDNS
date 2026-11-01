import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createTestApp, login, type TestContext } from '../../helpers/testApp.js';

let ctx: TestContext;
let token: string;
beforeAll(async () => { ctx = await createTestApp(); token = (await login(ctx.app)).token; });
afterAll(async () => { await ctx?.cleanup(); });

const create = (url: string, extra: object = {}) => request(ctx.app).post('/api/v1/webhooks')
  .set('Authorization', `Bearer ${token}`)
  .send({ name: `hook-${url.length}-${Math.abs(url.charCodeAt(8))}`, url, secret: 'webhook-secret-123456', events: ['dns.record.created'], ...extra });

describe('webhooks', () => {
  it.each(['https://fcm.googleapis.com/fcm/send', 'https://fd.example.com/hook', 'https://hooks.slack.com/services/T/B/x'])(
    'accepts public URL %s', async (url) => { expect((await create(url)).status).toBe(201); });

  it.each(['http://127.0.0.1:3000/api/v1/users', 'http://169.254.169.254/latest/meta-data', 'http://192.168.1.1/', 'http://[fd00::1]/', 'http://localhost/'])(
    'rejects internal URL %s (SSRF)', async (url) => { expect((await create(url)).status).toBe(400); });

  it('rejects a short secret', async () => {
    expect((await create('https://example.com/a', { secret: 'short' })).status).toBe(400);
  });

  it('rejects unknown event types', async () => {
    expect((await create('https://example.com/b', { events: ['not.an.event'] })).status).toBe(400);
  });

  it('does not return the secret in listings', async () => {
    const list = await request(ctx.app).get('/api/v1/webhooks').set('Authorization', `Bearer ${token}`);
    expect(list.status).toBe(200);
    expect(JSON.stringify(list.body)).not.toContain('webhook-secret-123456');
  });

  it('cannot be updated to an internal URL', async () => {
    const created = await create('https://example.com/c');
    const res = await request(ctx.app).put(`/api/v1/webhooks/${created.body.data.id}`)
      .set('Authorization', `Bearer ${token}`).send({ url: 'http://10.0.0.5/' });
    expect(res.status).toBe(400);
  });
});
