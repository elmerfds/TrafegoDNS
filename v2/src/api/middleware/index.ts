/**
 * API Middleware exports
 */
export {
  ApiError,
  errorHandler,
  notFoundHandler,
  asyncHandler,
} from './errorHandler.js';

export {
  authenticate,
  optionalAuthenticate,
  requireRole,
  requirePermission,
  generateApiKey,
  generateToken,
  verifyToken,
  hashApiKey,
  type AuthenticatedUser,
  type ApiKeyInfo,
} from './auth.js';

export {
  rateLimit,
  standardRateLimit,
  authRateLimit,
  strictRateLimit,
  apiKeyRateLimit,
} from './rateLimit.js';

export {
  auditMiddleware,
  logAudit,
  setAuditContext,
  withAudit,
} from './audit.js';
