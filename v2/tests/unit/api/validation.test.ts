import { describe, it, expect } from 'vitest';
import { safeUrlSchema, securePasswordSchema, dnsRecordFilterSchema } from '../../../src/api/validation.js';

const ok = (u: string) => safeUrlSchema.safeParse(u).success;

describe('safeUrlSchema (SSRF protection)', () => {
  it.each([
    'https://hooks.slack.com/services/x',
    'https://fcm.googleapis.com/fcm/send',
    'https://fd.example.com/hook',
    'https://feather.io/',
    'https://fe80.example.com/',
    'https://2001-db8.example.com/',
    'http://[2606:4700:4700::1111]/',
    'https://8.8.8.8/',
  ])('allows public URL %s', (u) => expect(ok(u)).toBe(true));

  it.each([
    'http://localhost/', 'http://127.0.0.1/', 'http://[::1]/', 'http://0.0.0.0/', 'http://[::]/',
    'http://10.0.0.1/', 'http://172.16.0.1/', 'http://172.31.255.255/', 'http://192.168.1.1/',
    'http://169.254.169.254/latest/meta-data', 'http://100.64.0.1/',
    'http://[fd00::1]/', 'http://[fc00::1]/', 'http://[fe80::1]/', 'http://[febf::1]/',
    'http://[::ffff:10.0.0.1]/', 'http://[::ffff:127.0.0.1]/', 'http://[2001:db8::1]/',
    'http://host.docker.internal/', 'ftp://example.com/', 'file:///etc/passwd', 'not a url',
  ])('blocks %s', (u) => expect(ok(u)).toBe(false));

  it('allows 172.x outside the private /12', () => {
    expect(ok('http://172.15.0.1/')).toBe(true);
    expect(ok('http://172.32.0.1/')).toBe(true);
  });
});

describe('securePasswordSchema', () => {
  it('accepts a strong password', () => expect(securePasswordSchema.safeParse('Str0ng!Passw0rd').success).toBe(true));
  it.each([
    ['too short', 'Sh0rt!a'],
    ['8 chars (old limit)', 'Abcdef1!'],
    ['no uppercase', 'lowercase123!'],
    ['no lowercase', 'UPPERCASE123!'],
    ['no digit', 'NoDigitsHere!!'],
    ['too long', 'Aa1!' + 'x'.repeat(130)],
  ])('rejects %s', (_l, p) => expect(securePasswordSchema.safeParse(p).success).toBe(false));
});

describe('dnsRecordFilterSchema', () => {
  it('applies defaults', () => {
    const r = dnsRecordFilterSchema.parse({});
    expect(r.orderBy).toBe('name');
    expect(r.direction).toBe('asc');
  });
  it('limits search/zone length', () => {
    expect(dnsRecordFilterSchema.safeParse({ search: 'a'.repeat(256) }).success).toBe(false);
    expect(dnsRecordFilterSchema.safeParse({ zone: 'a'.repeat(256) }).success).toBe(false);
    expect(dnsRecordFilterSchema.safeParse({ content: 'a'.repeat(513) }).success).toBe(false);
  });
  it('rejects unknown orderBy (prevents ORDER BY injection)', () => {
    expect(dnsRecordFilterSchema.safeParse({ orderBy: 'name; DROP TABLE dns_records' }).success).toBe(false);
  });
});
