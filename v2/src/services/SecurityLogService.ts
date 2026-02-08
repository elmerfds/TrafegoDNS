/**
 * Security Log Service
 * Logs authentication and security events (separate from audit logs)
 */
import { v4 as uuidv4 } from 'uuid';
import { getDatabase } from '../database/connection.js';
import { securityLogs, users } from '../database/schema/index.js';
import { eq, and, gte, lte, desc, sql } from 'drizzle-orm';
import { createChildLogger } from '../core/Logger.js';

const logger = createChildLogger({ service: 'SecurityLogService' });

export type SecurityEventType =
  | 'login_success'
  | 'login_failure'
  | 'logout'
  | 'session_created'
  | 'session_revoked'
  | 'oidc_success'
  | 'oidc_failure'
  | 'token_rejected'
  | 'password_change';

export interface LogSecurityEventParams {
  eventType: SecurityEventType;
  userId?: string;
  sessionId?: string;
  ipAddress: string;
  userAgent?: string;
  authMethod?: 'local' | 'oidc' | 'apikey';
  success: boolean;
  failureReason?: string;
  details?: Record<string, unknown>;
}

export interface SecurityLogEntry {
  id: string;
  eventType: string;
  userId: string | null;
  sessionId: string | null;
  ipAddress: string;
  userAgent: string | null;
  authMethod: string | null;
  success: boolean;
  failureReason: string | null;
  details: Record<string, unknown>;
  createdAt: string;
  user?: { id: string; username: string } | null;
}

export interface SecurityLogFilters {
  eventType?: string;
  userId?: string;
  ipAddress?: string;
  success?: boolean;
  startDate?: Date;
  endDate?: Date;
  page?: number;
  limit?: number;
}

export class SecurityLogService {
  /**
   * Log a security event (fire-and-forget, never throws)
   */
  async logEvent(params: LogSecurityEventParams): Promise<void> {
    try {
      const db = getDatabase();

      await db.insert(securityLogs).values({
        id: uuidv4(),
        eventType: params.eventType,
        userId: params.userId ?? null,
        sessionId: params.sessionId ?? null,
        ipAddress: params.ipAddress,
        userAgent: params.userAgent ?? null,
        authMethod: params.authMethod ?? null,
        success: params.success,
        failureReason: params.failureReason ?? null,
        details: JSON.stringify(params.details ?? {}),
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      logger.debug(
        { eventType: params.eventType, userId: params.userId, success: params.success },
        'Security event logged',
      );
    } catch (error) {
      // Never throw — logging failures should not break auth flows
      logger.error({ error, eventType: params.eventType }, 'Failed to log security event');
    }
  }

  /**
   * Query security logs with filters and pagination
   */
  async queryLogs(filters: SecurityLogFilters): Promise<{
    logs: SecurityLogEntry[];
    total: number;
    page: number;
    limit: number;
  }> {
    const db = getDatabase();
    const page = filters.page ?? 1;
    const limit = filters.limit ?? 50;
    const offset = (page - 1) * limit;

    // Build where conditions
    const conditions: ReturnType<typeof eq>[] = [];
    if (filters.eventType) conditions.push(eq(securityLogs.eventType, filters.eventType));
    if (filters.userId) conditions.push(eq(securityLogs.userId, filters.userId));
    if (filters.ipAddress) conditions.push(eq(securityLogs.ipAddress, filters.ipAddress));
    if (filters.success !== undefined) conditions.push(eq(securityLogs.success, filters.success));
    if (filters.startDate) conditions.push(gte(securityLogs.createdAt, filters.startDate));
    if (filters.endDate) conditions.push(lte(securityLogs.createdAt, filters.endDate));

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    // Get total count
    const countResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(securityLogs)
      .where(whereClause);
    const total = countResult[0]?.count ?? 0;

    // Get paginated logs
    const rows = await db
      .select()
      .from(securityLogs)
      .where(whereClause)
      .orderBy(desc(securityLogs.createdAt))
      .limit(limit)
      .offset(offset);

    // Join user info
    const logs: SecurityLogEntry[] = await Promise.all(
      rows.map(async (row) => {
        let user: { id: string; username: string } | null = null;
        if (row.userId) {
          const [u] = await db
            .select({ id: users.id, username: users.username })
            .from(users)
            .where(eq(users.id, row.userId))
            .limit(1);
          user = u ?? null;
        }

        return {
          id: row.id,
          eventType: row.eventType,
          userId: row.userId,
          sessionId: row.sessionId,
          ipAddress: row.ipAddress,
          userAgent: row.userAgent,
          authMethod: row.authMethod,
          success: Boolean(row.success),
          failureReason: row.failureReason,
          details: JSON.parse(row.details),
          createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : new Date(row.createdAt).toISOString(),
          user,
        };
      }),
    );

    return { logs, total, page, limit };
  }

  /**
   * Get security statistics for a time period
   */
  async getStats(sinceDate?: Date): Promise<{
    totalEvents: number;
    failedLogins: number;
    successfulLogins: number;
    topIPs: Array<{ ip: string; count: number }>;
  }> {
    const db = getDatabase();
    const since = sinceDate ?? new Date(Date.now() - 24 * 60 * 60 * 1000);

    const [totalCount] = await db
      .select({ count: sql<number>`count(*)` })
      .from(securityLogs)
      .where(gte(securityLogs.createdAt, since));

    const [failedCount] = await db
      .select({ count: sql<number>`count(*)` })
      .from(securityLogs)
      .where(
        and(
          gte(securityLogs.createdAt, since),
          eq(securityLogs.eventType, 'login_failure'),
        ),
      );

    const [successCount] = await db
      .select({ count: sql<number>`count(*)` })
      .from(securityLogs)
      .where(
        and(
          gte(securityLogs.createdAt, since),
          eq(securityLogs.eventType, 'login_success'),
        ),
      );

    const topIPs = await db
      .select({
        ip: securityLogs.ipAddress,
        count: sql<number>`count(*)`,
      })
      .from(securityLogs)
      .where(gte(securityLogs.createdAt, since))
      .groupBy(securityLogs.ipAddress)
      .orderBy(desc(sql`count(*)`))
      .limit(10);

    return {
      totalEvents: totalCount?.count ?? 0,
      failedLogins: failedCount?.count ?? 0,
      successfulLogins: successCount?.count ?? 0,
      topIPs: topIPs.map((row) => ({ ip: row.ip, count: row.count })),
    };
  }
}

export const securityLogService = new SecurityLogService();
