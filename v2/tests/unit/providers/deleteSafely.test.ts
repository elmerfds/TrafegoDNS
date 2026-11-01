import { describe, it, expect } from 'vitest';
import { isRecordNotFoundError, deleteSafely } from '../../../src/providers/base/deleteSafely.js';
import { FakeProvider } from '../../helpers/fakeProvider.js';

describe('isRecordNotFoundError', () => {
  it.each([
    [{ status: 404 }],
    [new Error('Record not found: abc')],
    [new Error('[not_found] The resource you were accessing could not be found.')],
  ])('true for %o', (e) => expect(isRecordNotFoundError(e)).toBe(true));
  it.each([
    [{ status: 401 }], [{ status: 429 }], [{ status: 500 }],
    [new Error('[unauthorized] Unable to authenticate you')], [new Error('fetch failed')], [null], ['x'],
  ])('false for %o', (e) => expect(isRecordNotFoundError(e)).toBe(false));
});

describe('deleteSafely', () => {
  it('deleted when the provider removes it', async () => {
    const p = new FakeProvider('p'); const r = p.seed({ type: 'A', name: 'a.example.com', content: '1.1.1.1', ttl: 1 });
    expect(await deleteSafely(p, r.id!)).toBe('deleted');
  });
  it('absent when the provider reports not found (after a retry)', async () => {
    const p = new FakeProvider('p');
    expect(await deleteSafely(p, 'missing')).toBe('absent');
  });
  it('absent when the provider throws a not-found error twice', async () => {
    const p = new FakeProvider('p');
    let n = 0; p.deleteRecord = async () => { n++; throw new Error('Record not found: x'); };
    expect(await deleteSafely(p, 'x')).toBe('absent');
    expect(n).toBe(2);
  });
  it('retries after a cache refresh when the first attempt says not found', async () => {
    const p = new FakeProvider('p'); const r = p.seed({ type: 'A', name: 'a.example.com', content: '1.1.1.1', ttl: 1 });
    let first = true; const orig = p.deleteRecord.bind(p);
    p.deleteRecord = async (id) => { if (first) { first = false; throw new Error('Record not found: stale cache'); } return orig(id); };
    expect(await deleteSafely(p, r.id!)).toBe('deleted');
    expect(p.remote.size).toBe(0);
  });
  it('rethrows real provider failures', async () => {
    const p = new FakeProvider('p'); p.failNext = { op: 'delete', error: Object.assign(new Error('rate limited'), { status: 429 }) };
    await expect(deleteSafely(p, 'x')).rejects.toThrow('rate limited');
  });
});
