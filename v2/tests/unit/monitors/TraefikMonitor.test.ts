import { describe, it, expect, vi, afterEach } from 'vitest';
import { TraefikMonitor } from '../../../src/monitors/TraefikMonitor.js';
import { eventBus, EventTypes } from '../../../src/core/EventBus.js';

type Router = { name: string; rule: string; service: string; provider: string };
const routers = (n: number): Router[] =>
  Array.from({ length: n }, (_, i) => ({ name: `r${i}@docker`, rule: `Host(\`h${i}.example.com\`)`, service: 's', provider: 'docker' }));

/** Fake Traefik API: honours page/per_page, sets X-Next-Page ("1" on last page). */
function stubTraefik(all: Router[], failPage?: number) {
  const calls: string[] = [];
  vi.stubGlobal('fetch', async (url: string) => {
    calls.push(url);
    const u = new URL(url);
    const page = Number(u.searchParams.get('page') ?? 1);
    const per = Number(u.searchParams.get('per_page') ?? 100);
    if (page === failPage) return new Response('boom', { status: 500 });
    const slice = all.slice((page - 1) * per, page * per);
    const next = page * per < all.length ? page + 1 : 1;
    return new Response(JSON.stringify(slice), { headers: { 'X-Next-Page': String(next), 'content-type': 'application/json' } });
  });
  return calls;
}

async function pollOnce(): Promise<string[] | null> {
  let got: string[] | null = null;
  const unsub = eventBus.subscribe(EventTypes.TRAEFIK_ROUTERS_UPDATED, (d: { hostnames: string[] }) => { got = d.hostnames; });
  const m = new TraefikMonitor({ app: { pollInterval: 60000 }, traefik: { apiUrl: 'http://traefik:8080/api' } } as never);
  await m.poll();
  await new Promise((r) => setTimeout(r, 20));
  (unsub as unknown as (() => void) | undefined)?.();
  return got;
}

afterEach(() => vi.unstubAllGlobals());

describe('TraefikMonitor pagination', () => {
  it('collects routers across all pages (>100 routers)', async () => {
    const calls = stubTraefik(routers(250));
    const hostnames = await pollOnce();
    expect(hostnames).toHaveLength(250);
    expect(calls).toHaveLength(3);
  });

  it('makes a single request when everything fits on one page', async () => {
    const calls = stubTraefik(routers(5));
    expect(await pollOnce()).toHaveLength(5);
    expect(calls).toHaveLength(1);
  });

  it('publishes nothing if any page fails (no partial list that would orphan records)', async () => {
    stubTraefik(routers(250), 2);
    expect(await pollOnce()).toBeNull();
  });

  it('extracts multi-argument Host() rules and skips internal routers', async () => {
    stubTraefik([
      { name: 'multi@docker', rule: 'Host(`a.example.com`, `b.example.com`)', service: 's', provider: 'docker' },
      { name: 'api@internal', rule: 'Host(`traefik.example.com`)', service: 'api@internal', provider: 'internal' },
    ]);
    expect((await pollOnce())?.sort()).toEqual(['a.example.com', 'b.example.com']);
  });
});
