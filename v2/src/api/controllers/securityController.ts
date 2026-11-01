/**
 * Security Logs Controller
 */
import type { Request, Response } from 'express';
import { z } from 'zod';
import { asyncHandler, ApiError } from '../middleware/index.js';
import { securityLogService } from '../../services/SecurityLogService.js';
import { getDatabase } from '../../database/connection.js';
import { securityLogs, users } from '../../database/schema/index.js';
import { eq } from 'drizzle-orm';
import { paginationSchema } from '../validation.js';

const securityFilterSchema = z
  .object({
    eventType: z.string().optional(),
    userId: z.string().uuid().optional(),
    ipAddress: z.string().optional(),
    success: z
      .enum(['true', 'false'])
      .transform((v) => v === 'true')
      .optional(),
    startDate: z.string().datetime().optional(),
    endDate: z.string().datetime().optional(),
  })
  .merge(paginationSchema);

/**
 * List security logs with filtering
 */
export const listSecurityLogs = asyncHandler(async (req: Request, res: Response) => {
  const filter = securityFilterSchema.parse(req.query);

  const result = await securityLogService.queryLogs({
    eventType: filter.eventType,
    userId: filter.userId,
    ipAddress: filter.ipAddress,
    success: filter.success,
    startDate: filter.startDate ? new Date(filter.startDate) : undefined,
    endDate: filter.endDate ? new Date(filter.endDate) : undefined,
    page: filter.page,
    limit: filter.limit,
  });

  res.json({
    success: true,
    data: {
      logs: result.logs,
      pagination: {
        page: result.page,
        limit: result.limit,
        total: result.total,
        totalPages: Math.ceil(result.total / result.limit),
      },
    },
  });
});

/**
 * Get a single security log entry
 */
export const getSecurityLog = asyncHandler(async (req: Request, res: Response) => {
  const id = req.params.id as string;
  const db = getDatabase();

  const [row] = await db.select().from(securityLogs).where(eq(securityLogs.id, id)).limit(1);
  if (!row) {
    throw ApiError.notFound('Security log');
  }

  // Join user info
  let user: { id: string; username: string } | null = null;
  if (row.userId) {
    const [u] = await db
      .select({ id: users.id, username: users.username })
      .from(users)
      .where(eq(users.id, row.userId))
      .limit(1);
    user = u ?? null;
  }

  res.json({
    success: true,
    data: {
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
    },
  });
});

/**
 * Get security statistics
 */
export const getSecurityStats = asyncHandler(async (req: Request, res: Response) => {
  const since = req.query.since as string | undefined;
  const sinceDate = since ? new Date(since) : undefined;

  const stats = await securityLogService.getStats(sinceDate);

  res.json({
    success: true,
    data: stats,
  });
});
