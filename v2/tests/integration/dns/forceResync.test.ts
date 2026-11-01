/**
 * B2: "Sync" (forceResyncRecords) must re-apply defaults only to auto-managed
 * records without labels/overrides, never clobber label values, API records,
 * or churn providers that don't support proxying.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { createDnsHarness, type DnsHarness } from '../../helpers/dnsManagerHarness.js';

let h: DnsHarness | undefined;
afterEach(async () => { await h?.cleanup(); h = undefined; });

const byName = async (n: string) => (await h!.tracked()).find((r) => r.name === n)!;

describe('forceResyncRecords', () => {
  it('keeps label-specified content/ttl/proxied', async () => {
    h = await createDnsHarness();
    const labels = { 'app.example.com': { 'dns.type': 'A', 'dns.content': '10.0.0.5', 'dns.ttl': '300', 'dns.proxied': 'false' } };
    await h.sync(['app.example.com'], labels);
    const before = await byName('app.example.com');
    expect(before).toMatchObject({ content: '10.0.0.5', ttl: 300, proxied: false });

    const callsBefore = h.providers[0]!.calls.length;
    const res = await h.manager.forceResyncRecords();
    expect(res.updated).toBe(0);
    expect(h.providers[0]!.calls.length).toBe(callsBefore);
    expect(await byName('app.example.com')).toMatchObject({ content: '10.0.0.5', ttl: 300, proxied: false });
  });

  it('does not touch API-created records', async () => {
    h = await createDnsHarness();
    await h.sync(['app.example.com']);
    const { dnsRecords } = await import('../../../src/database/schema/index.js');
    const { eq } = await import('drizzle-orm');
    await h.db.update(dnsRecords).set({ source: 'api', ttl: 120, content: '203.0.113.7' }).where(eq(dnsRecords.name, 'app.example.com'));
    const res = await h.manager.forceResyncRecords();
    expect(res.updated).toBe(0);
    expect(await byName('app.example.com')).toMatchObject({ ttl: 120, content: '203.0.113.7' });
  });

  it('does not update every record on providers without proxy support', async () => {
    h = await createDnsHarness({ providers: [{ id: 'pihole', proxied: false }] });
    await h.sync(['a.example.com', 'b.example.com']);
    const callsBefore = h.providers[0]!.calls.length;
    const res = await h.manager.forceResyncRecords();
    expect(res.updated).toBe(0);
    expect(h.providers[0]!.calls.length).toBe(callsBefore);
  });

  it('still applies a changed default to label-less auto records', async () => {
    h = await createDnsHarness();
    await h.sync(['app.example.com']);
    await h.setSetting('dns_default_ttl_override', 'true');
    await h.setSetting('dns_default_ttl', '600');
    const res = await h.manager.forceResyncRecords();
    expect(res.updated).toBe(1);
    expect((await byName('app.example.com')).ttl).toBe(600);
  });

  it('persists the new externalId returned by the provider', async () => {
    h = await createDnsHarness();
    await h.sync(['app.example.com']);
    const fake = h.providers[0]!;
    const orig = fake.updateRecord.bind(fake);
    fake.updateRecord = async (id, input) => {
      const r = await orig(id, input);
      fake.remote.delete(id);
      const moved = { ...r, id: `${id}-v2` };
      fake.remote.set(moved.id, moved);
      return moved;
    };
    await h.setSetting('dns_default_ttl_override', 'true');
    await h.setSetting('dns_default_ttl', '900');
    await h.manager.forceResyncRecords();
    expect((await byName('app.example.com')).externalId).toMatch(/-v2$/);
  });

  it('skips records not seen in the latest sync (e.g. orphaned)', async () => {
    h = await createDnsHarness();
    await h.sync(['app.example.com', 'gone.example.com']);
    await h.sync(['app.example.com']);
    await h.setSetting('dns_default_ttl_override', 'true');
    await h.setSetting('dns_default_ttl', '600');
    await h.manager.forceResyncRecords();
    expect((await byName('gone.example.com')).ttl).not.toBe(600);
  });
});
