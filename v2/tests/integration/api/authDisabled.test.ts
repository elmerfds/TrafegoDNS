import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createTestApp, type TestContext } from '../../helpers/testApp.js';

let ctx: TestContext;
beforeAll(async () => { ctx = await createTestApp({ AUTH_MODE: 'none' }); });
afterAll(async () => { await ctx?.cleanup(); });

describe('AUTH_MODE=none anonymous principal (B9)', () => {
  it('mutations are audited without violating the users FK', async () => {
    const res = await request(ctx.app).post('/api/v1/webhooks')
      .send({ name: 'hook', url: 'https://example.com/h', secret: 's'.repeat(16), events: ['dns.record.created'] });
    expect(res.status).toBe(201);
    await new Promise((r) => setTimeout(r, 50));
    const { getDatabase } = await import('../../../src/database/connection.js');
    const { auditLogs } = await import('../../../src/database/schema/index.js');
    const rows = await getDatabase().select().from(auditLogs);
    expect(rows.some((r) => r.resourceType === 'webhook' && r.userId === null)).toBe(true);
  });

  it('preference writes do not 500', async () => {
    const res = await request(ctx.app).put('/api/v1/preferences/theme').send({ value: 'dark' });
    expect(res.status).toBe(200);
  });
});
