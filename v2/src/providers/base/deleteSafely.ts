/**
 * Shared delete semantics for every path that removes a tracked DNS record.
 *
 * - 'deleted': the provider removed it
 * - 'absent':  the provider reports it doesn't exist (confirmed after a cache refresh)
 * Any other provider failure (auth, rate limit, network) is re-thrown so callers
 * keep the DB row and report the error instead of silently losing track of a
 * record that is still live.
 */
import type { DNSProvider } from './DNSProvider.js';

export function isRecordNotFoundError(err: unknown): boolean {
  const status = (err as { status?: unknown } | null)?.status;
  if (status === 404) return true; // Cloudflare SDK NotFoundError / APIError
  const msg = err instanceof Error ? err.message : '';
  return /^Record not found\b/i.test(msg) || /\[not_found\]/i.test(msg);
}

export async function deleteSafely(provider: DNSProvider, externalId: string): Promise<'deleted' | 'absent'> {
  const attempt = async () => ((await provider.deleteRecord(externalId)) ? 'deleted' : 'absent') as 'deleted' | 'absent';
  try {
    const result = await attempt();
    if (result === 'deleted') return result;
  } catch (error) {
    if (!isRecordNotFoundError(error)) throw error;
  }
  // Not found: providers that look records up in a local cache may just be stale.
  // Refresh and retry once before concluding it's really gone.
  await provider.getRecordsFromCache(true);
  try {
    return await attempt();
  } catch (error) {
    if (isRecordNotFoundError(error)) return 'absent';
    throw error;
  }
}
