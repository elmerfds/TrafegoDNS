/**
 * Audit Logs Controller
 */
import type { Request, Response } from 'express';
import { z } from 'zod';
import { getDatabase } from '../../database/connection.js';
import { auditLogs, users } from '../../database/schema/index.js';
import { eq, and, desc, sql, gte, lte } from 'drizzle-orm';
import { asyncHandler } from '../middleware/index.js';
import { paginationSchema } from '../validation.js';

const auditFilterSchema = z
  .object({
    action: z.enum(['create', 'update', 'delete', 'login', 'logout', 'sync', 'deploy']).optional(),
    resourceType: z.string().optional(),
    resourceId: z.string().optional(),
    userId: z.string().uuid().optional(),
    startDate: z.string().datetime().optional(),
    endDate: z.string().datetime().optional(),
  })
  .merge(paginationSchema);

/**
 * List audit logs with filtering
 */
export const listAuditLogs = asyncHandler(async (req: Request, res: Response) => {
  const filter = auditFilterSchema.parse(req.query);
  const db = getDatabase();

  // Build where conditions
  const conditions = [];
  if (filter.action) {
    conditions.push(eq(auditLogs.action, filter.action));
  }
  if (filter.resourceType) {
    conditions.push(eq(auditLogs.resourceType, filter.resourceType));
  }
  if (filter.resourceId) {
    conditions.push(eq(auditLogs.resourceId, filter.resourceId));
  }
  if (filter.userId) {
    conditions.push(eq(auditLogs.userId, filter.userId));
  }
  if (filter.startDate) {
    conditions.push(gte(auditLogs.createdAt, new Date(filter.startDate)));
  }
  if (filter.endDate) {
    conditions.push(lte(auditLogs.createdAt, new Date(filter.endDate)));
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  // Get total count
  const countResult = await db
    .select({ count: sql<number>`count(*)` })
    .from(auditLogs)
    .where(whereClause);
  const count = countResult[0]?.count ?? 0;

  // Get paginated logs
  const offset = (filter.page - 1) * filter.limit;
  const logs = await db
    .select({
      id: auditLogs.id,
      userId: auditLogs.userId,
      action: auditLogs.action,
      resourceType: auditLogs.resourceType,
      resourceId: auditLogs.resourceId,
      details: auditLogs.details,
      ipAddress: auditLogs.ipAddress,
      userAgent: auditLogs.userAgent,
      createdAt: auditLogs.createdAt,
    })
    .from(auditLogs)
    .where(whereClause)
    .orderBy(desc(auditLogs.createdAt))
    .limit(filter.limit)
    .offset(offset);

  // Optionally join user info
  const logsWithUsers = await Promise.all(
    logs.map(async (log) => {
      let user = null;
      if (log.userId) {
        const [userRecord] = await db
          .select({ id: users.id, username: users.username })
          .from(users)
          .where(eq(users.id, log.userId))
          .limit(1);
        user = userRecord ?? null;
      }
      return {
        ...log,
        details: JSON.parse(log.details),
        user,
      };
    })
  );

  res.json({
    success: true,
    data: {
      logs: logsWithUsers,
      pagination: {
        page: filter.page,
        limit: filter.limit,
        total: count,
        totalPages: Math.ceil(count / filter.limit),
      },
    },
  });
});

/**
 * Get a single audit log entry
 */
export const getAuditLog = asyncHandler(async (req: Request, res: Response) => {
  const id = req.params.id as string;
  const db = getDatabase();

  const [log] = await db.select().from(auditLogs).where(eq(auditLogs.id, id)).limit(1);

  if (!log) {
    res.status(404).json({
      success: false,
      error: { code: 'NOT_FOUND', message: 'Audit log not found' },
    });
    return;
  }

  // Get user info if available
  let user = null;
  if (log.userId) {
    const [userRecord] = await db
      .select({ id: users.id, username: users.username, email: users.email })
      .from(users)
      .where(eq(users.id, log.userId))
      .limit(1);
    user = userRecord ?? null;
  }

  res.json({
    success: true,
    data: {
      ...log,
      details: JSON.parse(log.details),
      user,
    },
  });
});

/**
 * Get audit log statistics
 */
export const getAuditStats = asyncHandler(async (req: Request, res: Response) => {
  const db = getDatabase();

  // Count by action type
  const actionStats = await db
    .select({
      action: auditLogs.action,
      count: sql<number>`count(*)`,
    })
    .from(auditLogs)
    .groupBy(auditLogs.action);

  // Count by resource type
  const resourceStats = await db
    .select({
      resourceType: auditLogs.resourceType,
      count: sql<number>`count(*)`,
    })
    .from(auditLogs)
    .groupBy(auditLogs.resourceType);

  // Recent activity (last 24 hours)
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const recentResult = await db
    .select({ recentCount: sql<number>`count(*)` })
    .from(auditLogs)
    .where(gte(auditLogs.createdAt, oneDayAgo));
  const recentCount = recentResult[0]?.recentCount ?? 0;

  // Total count
  const totalResult = await db.select({ totalCount: sql<number>`count(*)` }).from(auditLogs);
  const totalCount = totalResult[0]?.totalCount ?? 0;

  res.json({
    success: true,
    data: {
      total: totalCount,
      last24Hours: recentCount,
      byAction: Object.fromEntries(actionStats.map((s) => [s.action, s.count])),
      byResourceType: Object.fromEntries(resourceStats.map((s) => [s.resourceType, s.count])),
    },
  });
});
