/**
 * B19: nsupdate command injection. Every field interpolated into the nsupdate
 * script must be rejected if it could add extra lines/commands.
 */
import { describe, it, expect, vi } from 'vitest';
import { RFC2136Provider } from '../../../src/providers/rfc2136/RFC2136Provider.js';

function provider() {
  const p = new RFC2136Provider('id', 'bind', { server: 'bind9', zone: 'test.local', keyName: 'k', keySecret: 's' });
  const scripts: string[] = [];
  (p as unknown as { execNsupdate: (c: string) => Promise<void> }).execNsupdate = vi.fn(async (c: string) => { scripts.push(c); });
  return { p, scripts };
}

describe('RFC2136Provider input validation', () => {
  it.each([
    ['newline in content', { type: 'TXT', name: 'a.test.local', content: 'x"\nupdate delete other.test.local A\n"' }],
    ['newline in name', { type: 'A', name: 'a.test.local A 1.1.1.1\nupdate delete b.test.local', content: '1.2.3.4' }],
    ['CR in CNAME target', { type: 'CNAME', name: 'a.test.local', content: 'b.test.local\rupdate' }],
    ['invalid IPv4', { type: 'A', name: 'a.test.local', content: '1.2.3.4 ; send' }],
    ['invalid IPv6', { type: 'AAAA', name: 'a.test.local', content: 'zz::1' }],
    ['space in name', { type: 'A', name: 'a b.test.local', content: '1.2.3.4' }],
    ['embedded quote in TXT', { type: 'TXT', name: 'a.test.local', content: 'v=spf1" "evil' }],
  ])('rejects %s and sends nothing', async (_l, rec) => {
    const { p, scripts } = provider();
    await expect(p.createRecord(rec as never)).rejects.toThrow();
    expect(scripts).toHaveLength(0);
  });

  it.each([
    [{ type: 'A', name: 'app.test.local', content: '192.0.2.1' }],
    [{ type: 'AAAA', name: 'app.test.local', content: '2001:db8::1' }],
    [{ type: 'CNAME', name: 'www.test.local', content: 'app.test.local' }],
    [{ type: 'TXT', name: '_acme-challenge.test.local', content: 'v=spf1 include:_spf.example.com ~all' }],
    [{ type: 'A', name: '*.test.local', content: '192.0.2.1' }],
  ])('accepts valid record %o', async (rec) => {
    const { p, scripts } = provider();
    await p.createRecord(rec as never);
    expect(scripts).toHaveLength(1);
    expect(scripts[0]!.split('\n').filter((l) => l.startsWith('update'))).toHaveLength(1);
  });

  it('rejects injection through updateRecord', async () => {
    const { p, scripts } = provider();
    const created = await p.createRecord({ type: 'TXT', name: 'a.test.local', content: 'ok' } as never);
    await expect(p.updateRecord(created.id!, { content: 'x"\nupdate delete b.test.local A\n"' })).rejects.toThrow();
    expect(scripts).toHaveLength(1);
  });
});
