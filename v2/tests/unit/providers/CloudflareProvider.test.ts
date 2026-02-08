/**
 * CloudflareProvider unit tests
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { CloudflareProvider } from '../../../src/providers/cloudflare/CloudflareProvider.js';

describe('CloudflareProvider', () => {
  let provider: CloudflareProvider;

  beforeEach(() => {
    provider = new CloudflareProvider(
      'test-id',
      'Test Cloudflare',
      {
        apiToken: 'test-token',
        zoneName: 'example.com',
      }
    );
  });

  describe('getInfo', () => {
    it('should return provider info', () => {
      const info = provider.getInfo();

      expect(info.name).toBe('Test Cloudflare');
      expect(info.type).toBe('cloudflare');
      expect(info.features.proxied).toBe(true);
      expect(info.features.supportedTypes).toContain('A');
      expect(info.features.supportedTypes).toContain('CNAME');
    });
  });

  describe('getZoneName', () => {
    it('should return the zone name', () => {
      expect(provider.getZoneName()).toBe('example.com');
    });
  });

  describe('validateRecord', () => {
    it('should accept valid A record', () => {
      expect(() =>
        provider.validateRecord({
          type: 'A',
          name: 'test',
          content: '192.168.1.1',
        })
      ).not.toThrow();
    });

    it('should reject invalid IPv4 address', () => {
      expect(() =>
        provider.validateRecord({
          type: 'A',
          name: 'test',
          content: 'not-an-ip',
        })
      ).toThrow('Invalid IPv4 address');
    });

    it('should accept valid AAAA record', () => {
      expect(() =>
        provider.validateRecord({
          type: 'AAAA',
          name: 'test',
          content: '2001:db8::1',
        })
      ).not.toThrow();
    });

    it('should accept valid CNAME record', () => {
      expect(() =>
        provider.validateRecord({
          type: 'CNAME',
          name: 'www',
          content: 'example.com',
        })
      ).not.toThrow();
    });

    it('should require priority for MX records', () => {
      expect(() =>
        provider.validateRecord({
          type: 'MX',
          name: '@',
          content: 'mail.example.com',
        })
      ).toThrow('MX record requires priority');
    });

    it('should accept valid MX record with priority', () => {
      expect(() =>
        provider.validateRecord({
          type: 'MX',
          name: '@',
          content: 'mail.example.com',
          priority: 10,
        })
      ).not.toThrow();
    });

    it('should require all fields for SRV records', () => {
      expect(() =>
        provider.validateRecord({
          type: 'SRV',
          name: '_sip._tcp',
          content: 'sip.example.com',
        })
      ).toThrow('SRV record requires priority, weight, and port');
    });

    it('should accept valid SRV record', () => {
      expect(() =>
        provider.validateRecord({
          type: 'SRV',
          name: '_sip._tcp',
          content: 'sip.example.com',
          priority: 10,
          weight: 5,
          port: 5060,
        })
      ).not.toThrow();
    });

    it('should require flags and tag for CAA records', () => {
      expect(() =>
        provider.validateRecord({
          type: 'CAA',
          name: '@',
          content: 'letsencrypt.org',
        })
      ).toThrow('CAA record requires flags and tag');
    });

    it('should accept valid CAA record', () => {
      expect(() =>
        provider.validateRecord({
          type: 'CAA',
          name: '@',
          content: 'letsencrypt.org',
          flags: 0,
          tag: 'issue',
        })
      ).not.toThrow();
    });

    it('should reject missing type', () => {
      expect(() =>
        provider.validateRecord({
          type: '' as 'A',
          name: 'test',
          content: '192.168.1.1',
        })
      ).toThrow('Record type is required');
    });

    it('should reject missing name', () => {
      expect(() =>
        provider.validateRecord({
          type: 'A',
          name: '',
          content: '192.168.1.1',
        })
      ).toThrow('Record name is required');
    });

    it('should reject missing content', () => {
      expect(() =>
        provider.validateRecord({
          type: 'A',
          name: 'test',
          content: '',
        })
      ).toThrow('Record content is required');
    });

    it('should reject invalid TTL', () => {
      expect(() =>
        provider.validateRecord({
          type: 'A',
          name: 'test',
          content: '192.168.1.1',
          ttl: 100000,
        })
      ).toThrow('TTL must be between 1 and 86400');
    });
  });

  describe('recordNeedsUpdate', () => {
    it('should return true when content differs', () => {
      const existing = {
        id: '1',
        type: 'A' as const,
        name: 'test.example.com',
        content: '192.168.1.1',
        ttl: 300,
        providerId: 'test',
      };

      const newRecord = {
        type: 'A' as const,
        name: 'test',
        content: '192.168.1.2',
      };

      expect(provider.recordNeedsUpdate(existing, newRecord)).toBe(true);
    });

    it('should return false when records match', () => {
      const existing = {
        id: '1',
        type: 'A' as const,
        name: 'test.example.com',
        content: '192.168.1.1',
        ttl: 300,
        providerId: 'test',
      };

      const newRecord = {
        type: 'A' as const,
        name: 'test',
        content: '192.168.1.1',
        ttl: 300,
      };

      expect(provider.recordNeedsUpdate(existing, newRecord)).toBe(false);
    });

    it('should return true when proxied status differs', () => {
      const existing = {
        id: '1',
        type: 'A' as const,
        name: 'test.example.com',
        content: '192.168.1.1',
        ttl: 1,
        proxied: true,
        providerId: 'test',
      };

      const newRecord = {
        type: 'A' as const,
        name: 'test',
        content: '192.168.1.1',
        proxied: false,
      };

      expect(provider.recordNeedsUpdate(existing, newRecord)).toBe(true);
    });

    it('should ignore TTL difference for proxied records', () => {
      const existing = {
        id: '1',
        type: 'A' as const,
        name: 'test.example.com',
        content: '192.168.1.1',
        ttl: 1,
        proxied: true,
        providerId: 'test',
      };

      const newRecord = {
        type: 'A' as const,
        name: 'test',
        content: '192.168.1.1',
        ttl: 300,
        proxied: true,
      };

      expect(provider.recordNeedsUpdate(existing, newRecord)).toBe(false);
    });
  });

  describe('isInitialized', () => {
    it('should return false before init', () => {
      expect(provider.isInitialized()).toBe(false);
    });
  });
});
