import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { eq } from 'drizzle-orm';
import { createTestApp, login, ADMIN, type TestContext } from '../../helpers/testApp.js';
import type { OIDCConfig } from '../../../src/config/ConfigManager.js';

let ctx: TestContext;
const baseConfig: OIDCConfig = {
  issuerUrl: 'https://idp.example.com', clientId: 'c', clientSecret: 's', redirectUri: 'https://app/cb',
  scopes: 'openid', allowLocalLogin: true, autoCreateUsers: true, linkExistingByEmail: false,
  defaultRole: 'user', groupClaim: 'groups', adminGroups: [], userGroups: [], readonlyGroups: [],
  logoutUrl: undefined,
};

type FindOrCreate = (
  sub: string, email: string, name: string, role: string, avatar: null, verified: boolean
) => Promise<{ id: string; isNewUser: boolean }>;

async function service(overrides: Partial<OIDCConfig> = {}): Promise<{ findOrCreateUser: FindOrCreate }> {
  const { OIDCService } = await import('../../../src/services/OIDCService.js');
  return new OIDCService({ ...baseConfig, ...overrides }) as unknown as { findOrCreateUser: FindOrCreate };
}

async function db() {
  const { getDatabase } = await import('../../../src/database/connection.js');
  const schema = await import('../../../src/database/schema/index.js');
  return { db: getDatabase(), ...schema };
}

beforeAll(async () => { ctx = await createTestApp(); });
afterAll(async () => { await ctx?.cleanup(); });

describe('OIDC account linking by email (B6)', () => {
  it('refuses to link an existing local account by default', async () => {
    const svc = await service();
    await expect(svc.findOrCreateUser('attacker-sub', ADMIN.email, 'x', 'admin', null, true))
      .rejects.toThrow(/OIDC_LINK_EXISTING_BY_EMAIL/);
    await login(ctx.app); // local admin untouched
  });

  it('refuses unverified emails even when linking is enabled', async () => {
    const svc = await service({ linkExistingByEmail: true });
    await expect(svc.findOrCreateUser('attacker-sub', ADMIN.email, 'x', 'admin', null, false))
      .rejects.toThrow(/not mark the email as verified/);
  });

  it('links a verified email when enabled, clearing password, sessions and API keys', async () => {
    const { token } = await login(ctx.app);
    const k = await request(ctx.app).post('/api/v1/auth/api-keys').set({ Authorization: `Bearer ${token}` })
      .send({ name: 'k', permissions: ['read'] });
    expect(k.status).toBe(201);

    const svc = await service({ linkExistingByEmail: true });
    const linked = await svc.findOrCreateUser('admin-sub', ADMIN.email, 'Admin', 'admin', null, true);
    expect(linked.isNewUser).toBe(false);

    const { db: d, users, sessions, apiKeys } = await db();
    const [u] = await d.select().from(users).where(eq(users.id, linked.id));
    expect(u!.passwordHash).toBeNull();
    expect(u!.oidcSubject).toBe('admin-sub');
    expect(await d.select().from(sessions).where(eq(sessions.userId, linked.id))).toHaveLength(0);
    expect(await d.select().from(apiKeys).where(eq(apiKeys.userId, linked.id))).toHaveLength(0);
    expect((await request(ctx.app).get('/api/v1/auth/me').set('X-API-Key', k.body.data.key)).status).toBe(401);
  });

  it('never re-binds an account already linked to another subject', async () => {
    const svc = await service({ linkExistingByEmail: true });
    await expect(svc.findOrCreateUser('other-sub', ADMIN.email, 'x', 'admin', null, true))
      .rejects.toThrow(/already bound/);
    expect((await svc.findOrCreateUser('admin-sub', ADMIN.email, 'Admin', 'admin', null, true)).isNewUser).toBe(false);
  });
});
