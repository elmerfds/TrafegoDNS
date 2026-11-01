/**
 * Shared request helpers. Rely on Express's 'trust proxy' setting (configured via
 * TRUST_PROXY) rather than reading X-Forwarded-* headers directly, which clients can forge.
 */
import type { Request } from 'express';

/** Client IP as resolved by Express from trusted proxies only */
export function getClientIp(req: Request): string {
  return req.ip ?? req.socket.remoteAddress ?? 'unknown';
}

/** Whether the request arrived over HTTPS (directly, or via a trusted proxy's X-Forwarded-Proto) */
export function isRequestSecure(req: Request): boolean {
  return req.secure;
}
