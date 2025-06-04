/**
 * Audit Log Middleware
 * Logs security-relevant events for monitoring and compliance
 */

const logger = require('../../../utils/logger');

/**
 * Security event types for audit logging
 */
const AUDIT_EVENTS = {
  AUTH_SUCCESS: 'auth_success',
  AUTH_FAILURE: 'auth_failure',
  AUTH_LOCKED: 'auth_locked',
  PERMISSION_DENIED: 'permission_denied',
  RATE_LIMIT_EXCEEDED: 'rate_limit_exceeded',
  SUSPICIOUS_REQUEST: 'suspicious_request',
  DATA_ACCESS: 'data_access',
  DATA_MODIFICATION: 'data_modification',
  CONFIG_CHANGE: 'config_change',
  USER_CREATION: 'user_creation',
  USER_DELETION: 'user_deletion',
  PRIVILEGE_ESCALATION: 'privilege_escalation',
  PORT_SCAN: 'port_scan',
  PORT_RESERVATION: 'port_reservation',
  INVALID_INPUT: 'invalid_input'
};

/**
 * Risk levels for audit events
 */
const RISK_LEVELS = {
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high',
  CRITICAL: 'critical'
};

/**
 * Create audit log entry
 * @param {string} event - Event type
 * @param {Object} data - Event data
 * @param {Object} req - Express request object
 * @param {string} riskLevel - Risk level
 */
function logAuditEvent(event, data, req, riskLevel = RISK_LEVELS.LOW) {
  const auditEntry = {
    timestamp: new Date().toISOString(),
    event,
    riskLevel,
    source: {
      ip: getClientIP(req),
      userAgent: req.get('User-Agent'),
      method: req.method,
      path: req.path,
      query: req.query,
      sessionId: req.sessionID,
      requestId: req.id || req.headers['x-request-id']
    },
    user: {
      id: req.user?.id,
      username: req.user?.username,
      role: req.user?.role,
      permissions: req.user?.permissions
    },
    data: {
      ...data,
      // Sanitize sensitive data
      ...(data.password && { password: '[REDACTED]' }),
      ...(data.token && { token: '[REDACTED]' }),
      ...(data.secret && { secret: '[REDACTED]' })
    },
    environment: {
      nodeEnv: process.env.NODE_ENV,
      version: process.env.API_VERSION
    }
  };

  // Log at appropriate level based on risk
  switch (riskLevel) {
    case RISK_LEVELS.CRITICAL:
      logger.error('AUDIT [CRITICAL]:', auditEntry);
      break;
    case RISK_LEVELS.HIGH:
      logger.warn('AUDIT [HIGH]:', auditEntry);
      break;
    case RISK_LEVELS.MEDIUM:
      logger.info('AUDIT [MEDIUM]:', auditEntry);
      break;
    default:
      logger.debug('AUDIT [LOW]:', auditEntry);
  }

  // Send to external audit systems if configured
  if (process.env.AUDIT_WEBHOOK_URL) {
    sendAuditWebhook(auditEntry).catch(error => {
      logger.error('Failed to send audit webhook:', error);
    });
  }
}

/**
 * Get client IP address from request
 * @param {Object} req - Express request object
 * @returns {string} Client IP address
 */
function getClientIP(req) {
  return req.ip || 
         req.connection?.remoteAddress || 
         req.socket?.remoteAddress || 
         req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
         req.headers['x-real-ip'] ||
         'unknown';
}

/**
 * Send audit event to external webhook
 * @param {Object} auditEntry - Audit log entry
 */
async function sendAuditWebhook(auditEntry) {
  if (!process.env.AUDIT_WEBHOOK_URL) {
    return;
  }

  try {
    const fetch = (await import('node-fetch')).default;
    await fetch(process.env.AUDIT_WEBHOOK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'TrafegoDNS-Audit/1.0',
        ...(process.env.AUDIT_WEBHOOK_SECRET && {
          'Authorization': `Bearer ${process.env.AUDIT_WEBHOOK_SECRET}`
        })
      },
      body: JSON.stringify(auditEntry),
      timeout: 5000
    });
  } catch (error) {
    logger.error('Audit webhook error:', error);
  }
}

/**
 * Authentication audit middleware
 * Logs authentication attempts and results
 */
function createAuthAuditMiddleware() {
  return function authAuditMiddleware(req, res, next) {
    const originalSend = res.send;
    
    res.send = function(data) {
      // Parse response to determine auth result
      try {
        const response = typeof data === 'string' ? JSON.parse(data) : data;
        
        if (req.path.includes('/auth/login')) {
          if (response.success) {
            logAuditEvent(AUDIT_EVENTS.AUTH_SUCCESS, {
              username: req.body?.username,
              method: 'password'
            }, req, RISK_LEVELS.LOW);
          } else {
            logAuditEvent(AUDIT_EVENTS.AUTH_FAILURE, {
              username: req.body?.username,
              error: response.error,
              method: 'password'
            }, req, RISK_LEVELS.MEDIUM);
          }
        }
        
        if (req.path.includes('/auth/oidc')) {
          if (response.success) {
            logAuditEvent(AUDIT_EVENTS.AUTH_SUCCESS, {
              method: 'oidc',
              provider: req.body?.provider
            }, req, RISK_LEVELS.LOW);
          } else {
            logAuditEvent(AUDIT_EVENTS.AUTH_FAILURE, {
              method: 'oidc',
              provider: req.body?.provider,
              error: response.error
            }, req, RISK_LEVELS.MEDIUM);
          }
        }
      } catch (error) {
        // Ignore JSON parse errors
      }
      
      return originalSend.call(this, data);
    };
    
    next();
  };
}

/**
 * Permission audit middleware
 * Logs permission denials and privilege escalation attempts
 */
function createPermissionAuditMiddleware() {
  return function permissionAuditMiddleware(req, res, next) {
    const originalStatus = res.status;
    
    res.status = function(code) {
      if (code === 403) {
        logAuditEvent(AUDIT_EVENTS.PERMISSION_DENIED, {
          requiredPermission: req.requiredPermission,
          userPermissions: req.user?.permissions,
          resource: req.path
        }, req, RISK_LEVELS.HIGH);
      }
      
      return originalStatus.call(this, code);
    };
    
    next();
  };
}

/**
 * Data access audit middleware
 * Logs access to sensitive data
 */
function createDataAccessAuditMiddleware() {
  const sensitiveEndpoints = [
    '/api/v1/users',
    '/api/v1/config',
    '/api/v1/auth',
    '/api/v1/ports/reservations'
  ];
  
  return function dataAccessAuditMiddleware(req, res, next) {
    const isSensitive = sensitiveEndpoints.some(endpoint => 
      req.path.startsWith(endpoint)
    );
    
    if (isSensitive) {
      const eventType = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method) 
        ? AUDIT_EVENTS.DATA_MODIFICATION 
        : AUDIT_EVENTS.DATA_ACCESS;
        
      const riskLevel = req.method === 'DELETE' 
        ? RISK_LEVELS.HIGH 
        : RISK_LEVELS.MEDIUM;
      
      logAuditEvent(eventType, {
        resource: req.path,
        method: req.method,
        params: req.params,
        bodyKeys: req.body ? Object.keys(req.body) : []
      }, req, riskLevel);
    }
    
    next();
  };
}

/**
 * Rate limit audit middleware
 * Logs rate limit violations
 */
function createRateLimitAuditMiddleware() {
  return function rateLimitAuditMiddleware(req, res, next) {
    const originalStatus = res.status;
    
    res.status = function(code) {
      if (code === 429) {
        logAuditEvent(AUDIT_EVENTS.RATE_LIMIT_EXCEEDED, {
          endpoint: req.path,
          method: req.method,
          rateLimitType: req.rateLimit?.type,
          limit: req.rateLimit?.limit,
          remaining: req.rateLimit?.remaining
        }, req, RISK_LEVELS.MEDIUM);
      }
      
      return originalStatus.call(this, code);
    };
    
    next();
  };
}

/**
 * Input validation audit middleware
 * Logs validation failures that might indicate attack attempts
 */
function createInputValidationAuditMiddleware() {
  return function inputValidationAuditMiddleware(req, res, next) {
    const originalStatus = res.status;
    
    res.status = function(code) {
      if (code === 400) {
        // Check for potential attack patterns
        const suspiciousPatterns = [
          /<script/i,
          /javascript:/i,
          /on\w+=/i,
          /\.\.\//,
          /\bselect\b.*\bfrom\b/i,
          /\bunion\b.*\bselect\b/i,
          /\bdrop\b.*\btable\b/i
        ];
        
        const requestData = JSON.stringify({
          body: req.body,
          query: req.query,
          params: req.params
        });
        
        const isSuspicious = suspiciousPatterns.some(pattern => 
          pattern.test(requestData)
        );
        
        const riskLevel = isSuspicious ? RISK_LEVELS.HIGH : RISK_LEVELS.LOW;
        
        logAuditEvent(AUDIT_EVENTS.INVALID_INPUT, {
          endpoint: req.path,
          method: req.method,
          suspicious: isSuspicious,
          validationErrors: req.validationErrors
        }, req, riskLevel);
      }
      
      return originalStatus.call(this, code);
    };
    
    next();
  };
}

/**
 * Port management specific audit middleware
 * Logs port-related security events
 */
function createPortAuditMiddleware() {
  return function portAuditMiddleware(req, res, next) {
    // Log port scanning attempts
    if (req.path.includes('/ports/scan') && req.method === 'POST') {
      logAuditEvent(AUDIT_EVENTS.PORT_SCAN, {
        targetHost: req.body?.host || req.body?.server,
        portRange: req.body?.portRange || `${req.body?.startPort}-${req.body?.endPort}`,
        protocol: req.body?.protocol,
        scanType: req.body?.scanType
      }, req, RISK_LEVELS.MEDIUM);
    }
    
    // Log port reservations
    if (req.path.includes('/ports/reserve') && req.method === 'POST') {
      logAuditEvent(AUDIT_EVENTS.PORT_RESERVATION, {
        ports: req.body?.ports,
        protocol: req.body?.protocol,
        containerId: req.body?.container_id,
        duration: req.body?.duration
      }, req, RISK_LEVELS.LOW);
    }
    
    next();
  };
}

module.exports = {
  AUDIT_EVENTS,
  RISK_LEVELS,
  logAuditEvent,
  createAuthAuditMiddleware,
  createPermissionAuditMiddleware,
  createDataAccessAuditMiddleware,
  createRateLimitAuditMiddleware,
  createInputValidationAuditMiddleware,
  createPortAuditMiddleware
};