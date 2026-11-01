/**
 * B10: when tunnel routing fails (e.g. dns.tunnel names a tunnel that doesn't exist),
 * the hostname's existing DNS record must not be orphaned or deleted.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { createDnsHarness, type DnsHarness } from '../../helpers/dnsManagerHarness.js';

let h: DnsHarness | undefined;
afterEach(async () => { await h?.cleanup(); h = undefined; });

async function registerTunnelManager(ensureIngressRule: () => Promise<void>) {
  const { container, ServiceTokens } = await import('../../../src/core/ServiceContainer.js');
  container.registerInstance(ServiceTokens.TUNNEL_MANAGER, { isTunnelSupportAvailable: () => true, ensureIngressRule, cleanupOrphanedIngressRules: async () => {} } as never);
}

describe('tunnel routing failure', () => {
  it('keeps the existing DNS record when the tunnel cannot be found', async () => {
    h = await createDnsHarness();
    await h.setSetting('cleanup_orphaned', 'true');
    await h.setSetting('cleanup_grace_period', '0');

    // Cycle 1: normal DNS
    await h.sync(['app.example.com', 'other.example.com']);
    expect(h.providers[0]!.remote.size).toBe(2);

    // Cycle 2+: app is now labelled for a tunnel that doesn't exist
    await h.setSetting('tunnel_mode', 'labeled');
    await registerTunnelManager(async () => { throw new Error('Tunnel "typo" not found'); });
    const labels = { 'app.example.com': { 'dns.tunnel': 'typo', 'dns.tunnel.service': 'http://app:80' } };
    await h.sync(['app.example.com', 'other.example.com'], labels);
    await h.sync(['app.example.com', 'other.example.com'], labels);

    const app = (await h.tracked()).find((r) => r.name === 'app.example.com');
    expect(app).toBeTruthy();
    expect(app!.orphanedAt).toBeNull();
    expect(h.providers[0]!.calls.filter((c) => c.op === 'delete')).toHaveLength(0);
  });

  it('a genuinely removed hostname is still cleaned up', async () => {
    h = await createDnsHarness();
    await h.setSetting('cleanup_orphaned', 'true');
    await h.setSetting('cleanup_grace_period', '0');
    await h.sync(['app.example.com', 'gone.example.com']);
    await h.sync(['app.example.com']); // marks gone.* orphaned
    await h.sync(['app.example.com']); // grace period 0 -> deleted
    expect([...h.providers[0]!.remote.values()].map((r) => r.name)).toEqual(['app.example.com']);
  });
});
