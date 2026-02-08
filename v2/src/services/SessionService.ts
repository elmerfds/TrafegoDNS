/**
 * Session Service
 * Manages user sessions tied to JWT tokens
 */
import { v4 as uuidv4 } from 'uuid';
import { createHash } from 'crypto';
import { getDatabase } from '../database/connection.js';
import { sessions } from '../database/schema/index.js';
import { eq, and, lt, isNull } from 'drizzle-orm';
import { createChildLogger } from '../core/Logger.js';

const logger = createChildLogger({ service: 'SessionService' });

export interface SessionInfo {
  id: string;
  userId: string;
  authMethod: 'local' | 'oidc';
  ipAddress: string;
  userAgent: string | null;
  deviceInfo: { browser?: string; os?: string; device?: string } | null;
  createdAt: string;
  lastActivityAt: string;
  expiresAt: string;
  isCurrent: boolean;
}

/**
 * Parse basic device info from user-agent string (no external dependency)
 */
function parseDeviceInfo(userAgent?: string): { browser?: string; os?: string; device?: string } | null {
  if (!userAgent) return null;

  let browser: string | undefined;
  let os: string | undefined;
  let device = 'desktop';

  // Detect browser
  if (userAgent.includes('Firefox/')) {
    const m = userAgent.match(/Firefox\/([\d.]+)/);
    browser = `Firefox ${m?.[1] ?? ''}`.trim();
  } else if (userAgent.includes('Edg/')) {
    const m = userAgent.match(/Edg\/([\d.]+)/);
    browser = `Edge ${m?.[1] ?? ''}`.trim();
  } else if (userAgent.includes('Chrome/') && !userAgent.includes('Edg/')) {
    const m = userAgent.match(/Chrome\/([\d.]+)/);
    browser = `Chrome ${m?.[1] ?? ''}`.trim();
  } else if (userAgent.includes('Safari/') && !userAgent.includes('Chrome/')) {
    const m = userAgent.match(/Version\/([\d.]+)/);
    browser = `Safari ${m?.[1] ?? ''}`.trim();
  } else if (userAgent.includes('curl/')) {
    browser = 'curl';
  }

  // Detect OS
  if (userAgent.includes('Windows NT')) {
    os = 'Windows';
  } else if (userAgent.includes('Mac OS X')) {
    const m = userAgent.match(/Mac OS X ([\d_.]+)/);
    os = `macOS ${m?.[1]?.replace(/_/g, '.') ?? ''}`.trim();
  } else if (userAgent.includes('Linux')) {
    os = 'Linux';
  } else if (userAgent.includes('Android')) {
    os = 'Android';
  } else if (userAgent.includes('iPhone') || userAgent.includes('iPad')) {
    os = 'iOS';
  }

  // Detect device type
  if (userAgent.includes('Mobile') || userAgent.includes('Android') || userAgent.includes('iPhone')) {
    device = 'mobile';
  } else if (userAgent.includes('iPad') || userAgent.includes('Tablet')) {
    device = 'tablet';
  }

  return { browser, os, device };
}

/**
 * Hash a JWT token for storage (SHA-256)
 */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export class SessionService {
  /**
   * Create a new session
   */
  async createSession(params: {
    userId: string;
    token: string;
    authMethod: 'local' | 'oidc';
    ipAddress: string;
    userAgent?: string;
    expiresInSeconds: number;
  }): Promise<string> {
    const db = getDatabase();
    const sessionId = uuidv4();
    const tokenHash = hashToken(params.token);
    const deviceInfo = parseDeviceInfo(params.userAgent);
    const now = new Date();
    const expiresAt = new Date(now.getTime() + params.expiresInSeconds * 1000);

    await db.insert(sessions).values({
      id: sessionId,
      userId: params.userId,
      tokenHash,
      authMethod: params.authMethod,
      ipAddress: params.ipAddress,
      userAgent: params.userAgent ?? null,
      deviceInfo: deviceInfo ? JSON.stringify(deviceInfo) : null,
      expiresAt,
      lastActivityAt: now,
      createdAt: now,
      updatedAt: now,
    });

    logger.debug({ sessionId, userId: params.userId, authMethod: params.authMethod }, 'Session created');
    return sessionId;
  }

  /**
   * Verify a session exists for a token and is still valid.
   * Returns session ID and user ID, or null if invalid.
   * Updates lastActivityAt as a fire-and-forget side effect.
   */
  async verifySession(token: string): Promise<{ sessionId: string; userId: string } | null> {
    const db = getDatabase();
    const tokenHash = hashToken(token);

    const [session] = await db
      .select({
        id: sessions.id,
        userId: sessions.userId,
        expiresAt: sessions.expiresAt,
        revokedAt: sessions.revokedAt,
      })
      .from(sessions)
      .where(eq(sessions.tokenHash, tokenHash))
      .limit(1);

    if (!session) return null;

    // Check expiration
    if (session.expiresAt < new Date()) return null;

    // Check revoked
    if (session.revokedAt) return null;

    // Update last activity (fire-and-forget)
    void db
      .update(sessions)
      .set({ lastActivityAt: new Date(), updatedAt: new Date() })
      .where(eq(sessions.id, session.id));

    return { sessionId: session.id, userId: session.userId };
  }

  /**
   * List active (non-revoked, non-expired) sessions for a user
   */
  async listUserSessions(userId: string, currentTokenHash?: string): Promise<SessionInfo[]> {
    const db = getDatabase();
    const now = new Date();

    const rows = await db
      .select()
      .from(sessions)
      .where(
        and(
          eq(sessions.userId, userId),
          isNull(sessions.revokedAt),
        )
      )
      .orderBy(sessions.lastActivityAt);

    return rows
      .filter((s) => s.expiresAt >= now)
      .map((s) => ({
        id: s.id,
        userId: s.userId,
        authMethod: s.authMethod as 'local' | 'oidc',
        ipAddress: s.ipAddress,
        userAgent: s.userAgent,
        deviceInfo: s.deviceInfo ? JSON.parse(s.deviceInfo) : null,
        createdAt: s.createdAt instanceof Date ? s.createdAt.toISOString() : new Date(s.createdAt).toISOString(),
        lastActivityAt: s.lastActivityAt instanceof Date ? s.lastActivityAt.toISOString() : new Date(s.lastActivityAt).toISOString(),
        expiresAt: s.expiresAt instanceof Date ? s.expiresAt.toISOString() : new Date(s.expiresAt).toISOString(),
        isCurrent: currentTokenHash ? s.tokenHash === currentTokenHash : false,
      }));
  }

  /**
   * Revoke a specific session (set revokedAt)
   */
  async revokeSession(sessionId: string, userId: string): Promise<boolean> {
    const db = getDatabase();

    const [session] = await db
      .select({ id: sessions.id })
      .from(sessions)
      .where(and(eq(sessions.id, sessionId), eq(sessions.userId, userId)))
      .limit(1);

    if (!session) return false;

    await db
      .update(sessions)
      .set({ revokedAt: new Date(), updatedAt: new Date() })
      .where(eq(sessions.id, sessionId));

    logger.info({ sessionId, userId }, 'Session revoked');
    return true;
  }

  /**
   * Revoke all sessions for a user except the specified one
   */
  async revokeAllUserSessions(userId: string, exceptSessionId?: string): Promise<number> {
    const db = getDatabase();
    const now = new Date();

    // Get sessions to revoke
    const rows = await db
      .select({ id: sessions.id })
      .from(sessions)
      .where(
        and(
          eq(sessions.userId, userId),
          isNull(sessions.revokedAt),
        )
      );

    const toRevoke = rows.filter((r) => r.id !== exceptSessionId);
    if (toRevoke.length === 0) return 0;

    for (const row of toRevoke) {
      await db
        .update(sessions)
        .set({ revokedAt: now, updatedAt: now })
        .where(eq(sessions.id, row.id));
    }

    logger.info({ userId, count: toRevoke.length, exceptSessionId }, 'Sessions revoked');
    return toRevoke.length;
  }

  /**
   * Cleanup expired sessions (delete from DB)
   */
  async cleanupExpiredSessions(): Promise<number> {
    const db = getDatabase();

    const expired = await db
      .select({ id: sessions.id })
      .from(sessions)
      .where(lt(sessions.expiresAt, new Date()));

    if (expired.length === 0) return 0;

    for (const row of expired) {
      await db.delete(sessions).where(eq(sessions.id, row.id));
    }

    logger.info({ count: expired.length }, 'Expired sessions cleaned up');
    return expired.length;
  }
}

export const sessionService = new SessionService();
