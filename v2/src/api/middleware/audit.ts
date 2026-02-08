/**
 * Audit logging middleware
 * Logs all API mutations for compliance and debugging
 */
import type { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { getDatabase } from '../../database/connection.js';
import { auditLogs } from '../../database/schema/index.js';
import { createChildLogger } from '../../core/Logger.js';

const logger = createChildLogger({ service: 'Audit' });

type AuditAction = 'create' | 'update' | 'delete' | 'bulk_delete' | 'multi_create' | 'login' | 'logout' | 'sync' | 'deploy' | 'import' | 'export';

interface AuditContext {
  action: AuditAction;
  resourceType: string;
  resourceId?: string;
  details?: Record<string, unknown>;
}

declare global {
  namespace Express {
    interface Request {
      auditContext?: AuditContext;
    }
  }
}

/**
 * Set audit context for the request
 */
export function setAuditContext(
  req: Request,
  context: AuditContext
): void {
  req.auditContext = context;
}

/**
 * Log an audit entry
 */
export async function logAudit(
  req: Request,
  context: AuditContext
): Promise<void> {
  try {
    const db = getDatabase();

    // Include authMethod in details for traceability
    const details = { ...context.details };
    if (req.authMethod) {
      details.authMethod = req.authMethod;
    }

    await db.insert(auditLogs).values({
      id: uuidv4(),
      userId: req.user?.id ?? null,
      action: context.action,
      resourceType: context.resourceType,
      resourceId: context.resourceId ?? null,
      details: JSON.stringify(details),
      ipAddress: getClientIp(req),
      userAgent: req.headers['user-agent'] ?? null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    logger.debug(
      {
        userId: req.user?.id,
        action: context.action,
        resourceType: context.resourceType,
        resourceId: context.resourceId,
      },
      'Audit log created'
    );
  } catch (error) {
    logger.error({ error }, 'Failed to create audit log');
  }
}

/**
 * Get client IP address from request
 */
function getClientIp(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') {
    return forwarded.split(',')[0]?.trim() ?? 'unknown';
  }
  return req.ip ?? 'unknown';
}

/**
 * Audit middleware that logs request after response
 */
export function auditMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  // Only audit mutating requests
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
    next();
    return;
  }

  // Hook into response finish to log audit
  res.on('finish', () => {
    // Only log successful mutations
    if (res.statusCode >= 200 && res.statusCode < 300 && req.auditContext) {
      void logAudit(req, req.auditContext);
    }
  });

  next();
}

/**
 * Create an audit logging decorator for controller methods
 */
export function withAudit(
  action: AuditAction,
  resourceType: string,
  getResourceId?: (req: Request, result: unknown) => string | undefined
) {
  return function <T extends (...args: [Request, Response]) => Promise<void>>(
    target: T
  ): T {
    return (async (req: Request, res: Response) => {
      const originalJson = res.json.bind(res);

      res.json = function (body: unknown) {
        // Set audit context before sending response
        if (res.statusCode >= 200 && res.statusCode < 300) {
          const resourceId = getResourceId?.(req, body);
          setAuditContext(req, {
            action,
            resourceType,
            resourceId,
            details: {
              path: req.path,
              method: req.method,
            },
          });
        }
        return originalJson(body);
      };

      return target(req, res);
    }) as T;
  };
}
