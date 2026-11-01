/**
 * B3/B7: record ownership.
 * - records TrafegoDNS creates (or that carry its marker) are deleted when orphaned
 * - pre-existing records at an active hostname are adopted: kept in sync, released (not deleted) when orphaned
 * - a user "unclaim" is sticky; API-created records are left alone
 * - externalId lookups are scoped per provider
 */
import { describe, it, expect, afterEach } from 'vitest';
import { eq } from 'drizzle-orm';
import { createDnsHarness, type DnsHarness } from '../../helpers/dnsManagerHarness.js';
import { TRAFEGO_OWNERSHIP_MARKER } from '../../../src/providers/base/DNSProvider.js';

let h: DnsHarness | undefined;
afterEach(async () => { await h?.cleanup(); h = undefined; });

const row = async (name: string, providerId = 'p1') => (await h!.tracked()).find((r) => r.name === name && r.providerId === providerId);
const remoteNames = (i = 0) => [...h!.providers[i]!.remote.values()].map((r) => r.name).sort();

async function withCleanup() {
  h = await createDnsHarness();
  await h.setSetting('cleanup_orphaned', 'true');
  await h.setSetting('cleanup_grace_period', '0');
  return h;
}

describe('ownership', () => {
  it('created records are deleted after their hostname goes away', async () => {
    await withCleanup();
    await h!.sync(['keep.example.com', 'new.example.com']);
    expect((await row('new.example.com'))!.ownership).toBe('created');
    await h!.sync(['keep.example.com']);
    await h!.sync(['keep.example.com']);
    expect(remoteNames()).toEqual(['keep.example.com']);
  });

  it('a hand-made record at a Traefik hostname is adopted, updated, then released (not deleted)', async () => {
    await withCleanup();
    h!.providers[0]!.seed({ type: 'A', name: 'www.example.com', content: '198.51.100.9', ttl: 1 });
    await h!.sync(['keep.example.com', 'www.example.com']);
    const adopted = await row('www.example.com');
    expect(adopted).toMatchObject({ ownership: 'adopted', managed: true });
    expect([...h!.providers[0]!.remote.values()].find((r) => r.name === 'www.example.com')!.content).toBe('192.0.2.1');

    await h!.sync(['keep.example.com']); // orphaned
    await h!.sync(['keep.example.com']); // grace elapsed
    expect(remoteNames()).toContain('www.example.com'); // still exists at provider
    expect(await row('www.example.com')).toMatchObject({ managed: false, source: 'discovered', orphanedAt: null });
  });

  it('a pre-existing record with the ownership marker is fully owned', async () => {
    await withCleanup();
    h!.providers[0]!.seed({ type: 'A', name: 'old.example.com', content: '192.0.2.1', ttl: 1, comment: TRAFEGO_OWNERSHIP_MARKER });
    await h!.sync(['keep.example.com', 'old.example.com']);
    expect((await row('old.example.com'))!.ownership).toBe('created');
    await h!.sync(['keep.example.com']);
    await h!.sync(['keep.example.com']);
    expect(remoteNames()).toEqual(['keep.example.com']);
  });

  it('an explicit unclaim is never undone by sync and the record is not modified', async () => {
    await withCleanup();
    await h!.sync(['keep.example.com', 'mine.example.com']);
    const { dnsRecords } = await import('../../../src/database/schema/index.js');
    const r = (await row('mine.example.com'))!;
    // same effect as PATCH /dns/records/:id/managed {managed:false}
    await h!.db.update(dnsRecords).set({ managed: false, source: 'discovered', ownership: 'released' }).where(eq(dnsRecords.id, r.id as string));
    const ext = h!.providers[0]!.remote.get(r.externalId as string)!;
    ext.content = '203.0.113.50'; // user edits it at the provider

    await h!.sync(['keep.example.com', 'mine.example.com'], { 'mine.example.com': { 'dns.content': '192.0.2.99', 'dns.type': 'A' } });
    expect(await row('mine.example.com')).toMatchObject({ managed: false, ownership: 'released' });
    expect(h!.providers[0]!.remote.get(r.externalId as string)!.content).toBe('203.0.113.50');
  });

  it('API-created records are not converted to traefik-managed', async () => {
    await withCleanup();
    await h!.sync(['keep.example.com', 'api.example.com']);
    const { dnsRecords } = await import('../../../src/database/schema/index.js');
    await h!.db.update(dnsRecords).set({ source: 'api' }).where(eq(dnsRecords.name, 'api.example.com'));
    await h!.sync(['keep.example.com', 'api.example.com']);
    expect((await row('api.example.com'))!.source).toBe('api');
  });

  it('same content-derived externalId on two providers gets a row per provider', async () => {
    h = await createDnsHarness({ providers: [{ id: 'p1', proxied: false }, { id: 'p2', proxied: false }] });
    for (const p of h.providers) p.seed({ id: 'YXBwLmV4YW1wbGUuY29tOkE6MTkyLjAuMi4x', type: 'A', name: 'app.example.com', content: '192.0.2.1', ttl: 1 });
    await h.sync(['app.example.com'], { 'app.example.com': { 'dns.providers': 'all' } });
    expect(await row('app.example.com', 'p1')).toBeTruthy();
    expect(await row('app.example.com', 'p2')).toBeTruthy();
  });
});
