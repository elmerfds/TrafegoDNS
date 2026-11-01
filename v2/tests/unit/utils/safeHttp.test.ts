import { describe, it, expect, vi, afterEach } from 'vitest';
import http from 'node:http';
import dns from 'node:dns';
import type { AddressInfo } from 'node:net';
import { isBlockedAddress, safePost, BlockedAddressError } from '../../../src/utils/safeHttp.js';

describe('isBlockedAddress', () => {
  it.each([
    '127.0.0.1', '10.1.2.3', '172.16.0.1', '172.31.255.255', '192.168.1.1', '169.254.169.254',
    '100.64.0.1', '0.0.0.0', '224.0.0.1', '::1', '::', 'fd00::1', 'fe80::1', '::ffff:10.0.0.1',
    '::ffff:a00:1', 'not-an-ip',
  ])('blocks %s', (ip) => expect(isBlockedAddress(ip)).toBe(true));

  it.each(['8.8.8.8', '1.1.1.1', '172.32.0.1', '2606:4700:4700::1111'])('allows %s', (ip) =>
    expect(isBlockedAddress(ip)).toBe(false)
  );
});

describe('safePost', () => {
  let server: http.Server | undefined;
  afterEach(() => {
    vi.restoreAllMocks();
    server?.close();
    server = undefined;
  });

  async function startServer(): Promise<{ port: number; hits: () => number }> {
    let hits = 0;
    server = http.createServer((_req, res) => {
      hits++;
      res.end('ok');
    });
    await new Promise<void>((r) => server!.listen(0, '127.0.0.1', r));
    return { port: (server!.address() as AddressInfo).port, hits: () => hits };
  }

  it('refuses IP literals in private ranges without connecting', async () => {
    const { port, hits } = await startServer();
    await expect(safePost(`http://127.0.0.1:${port}/`, {}, '{}')).rejects.toBeInstanceOf(BlockedAddressError);
    expect(hits()).toBe(0);
  });

  it('refuses hostnames that resolve to private addresses (DNS-based SSRF)', async () => {
    const { port, hits } = await startServer();
    vi.spyOn(dns, 'lookup').mockImplementation(((_h: string, _o: unknown, cb: Function) =>
      cb(null, [{ address: '127.0.0.1', family: 4 }])) as never);
    await expect(safePost(`http://hooks.attacker.example:${port}/`, {}, '{}')).rejects.toThrow(
      /non-public address 127\.0\.0\.1/
    );
    expect(hits()).toBe(0);
  });

  it('refuses when any resolved address is private', async () => {
    vi.spyOn(dns, 'lookup').mockImplementation(((_h: string, _o: unknown, cb: Function) =>
      cb(null, [{ address: '8.8.8.8', family: 4 }, { address: '10.0.0.5', family: 4 }])) as never);
    await expect(safePost('http://mixed.example/', {}, '{}')).rejects.toBeInstanceOf(BlockedAddressError);
  });

  it('rejects non-http protocols', async () => {
    await expect(safePost('file:///etc/passwd', {}, '')).rejects.toThrow(/Unsupported protocol/);
  });
});
