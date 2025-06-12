/**
 * Enhanced Rate Limiting Middleware
 * Provides sophisticated protection against excessive API requests, DDoS, and brute force attacks
 */
const rateLimit = require('express-rate-limit');
const logger = require('../../../utils/logger');

/**
 * Normalize IPv4-mapped IPv6 addresses to IPv4 format
 * Converts ::ffff:192.168.1.1 to 192.168.1.1
 * @param {string} ip - IP address to normalize
 * @returns {string} - Normalized IP address
 */
function normalizeIP(ip) {
  if (ip && ip.startsWith('::ffff:')) {
    return ip.substring(7); // Remove "::ffff:" prefix
  }
  return ip;
}

/**
 * Check if an IP is in a local/private network range
 * @param {string} ip - IP address to check
 * @returns {boolean} - True if IP is in local network range
 */
function isLocalNetworkIP(ip) {
  const normalizedIP = normalizeIP(ip);
  
  // Localhost addresses
  if (normalizedIP === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1') {
    return true;
  }
  
  // Private IPv4 ranges (RFC 1918)
  const ipv4Regex = /^(\d+)\.(\d+)\.(\d+)\.(\d+)$/;
  const match = normalizedIP.match(ipv4Regex);
  
  if (match) {
    const [, a, b, c, d] = match.map(Number);
    
    // 10.0.0.0/8 (10.0.0.0 to 10.255.255.255)
    if (a === 10) return true;
    
    // 172.16.0.0/12 (172.16.0.0 to 172.31.255.255)
    if (a === 172 && b >= 16 && b <= 31) return true;
    
    // 192.168.0.0/16 (192.168.0.0 to 192.168.255.255)
    if (a === 192 && b === 168) return true;
    
    // 169.254.0.0/16 (Link-local addresses)
    if (a === 169 && b === 254) return true;
  }
  
  // IPv6 private ranges (simplified check for common ones)
  if (ip.startsWith('fc') || ip.startsWith('fd') || ip.startsWith('fe80:')) {
    return true;
  }
  
  return false;
}

// In-memory store for tracking suspicious IPs
const suspiciousIPs = new Map();
const blockedIPs = new Set();

// Cleanup suspicious IPs every hour
setInterval(() => {
  const now = Date.now();
  const oneHour = 60 * 60 * 1000;
  
  for (const [ip, data] of suspiciousIPs.entries()) {
    if (now - data.firstSeen > oneHour) {
      suspiciousIPs.delete(ip);
    }
  }
}, 60 * 60 * 1000);

/**
 * Create a configurable rate limiter
 * @param {Object} options - Rate limiting options
 * @returns {Function} Express middleware
 */
const createRateLimiter = (options = {}) => {
  const defaultOptions = {
    windowMs: 60 * 1000, // 1 minute by default
    max: 100, // 100 requests per minute by default
    standardHeaders: true, // Return rate limit info in headers
    legacyHeaders: false, // Don't use deprecated headers
    message: 'Too many requests, please try again later.',
    handler: (req, res, next, options) => {
      logger.warn(`Rate limit exceeded for IP ${req.ip}`);
      res.status(429).json({
        status: 'error',
        code: 'RATE_LIMIT_EXCEEDED',
        message: options.message
      });
    }
  };

  const limiterOptions = { ...defaultOptions, ...options };
  
  return rateLimit(limiterOptions);
};

/**
 * Default global rate limiter
 * Applies to all API routes
 */
const globalLimiter = createRateLimiter();

/**
 * Stricter rate limiter for auth endpoints
 * Helps prevent brute force attacks
 */
const authLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // 10 requests per 15 minutes
  message: 'Too many login attempts, please try again after 15 minutes'
});

/**
 * Rate limiter for write operations (POST, PUT, DELETE)
 */
const writeLimiter = createRateLimiter({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 30 // 30 write operations per 5 minutes
});

/**
 * Advanced rate limiter with user-specific limits
 * @param {Object} options - Configuration options
 * @returns {Function} Express middleware
 */
function createUserAwareRateLimiter(options = {}) {
  const defaults = {
    windowMs: 60 * 1000,
    anonymousMax: 50,    // Lower limit for unauthenticated users
    authenticatedMax: 150, // Higher limit for authenticated users
    premiumMax: 300,     // Even higher for premium users
    bypassRoles: ['admin'], // Roles that bypass rate limiting
    allowedIPs: [], // IPs that bypass rate limiting completely
    keyGenerator: (req) => {
      // Use user ID for authenticated users, IP for anonymous
      return req.user?.id ? `user:${req.user.id}` : `ip:${req.ip}`;
    }
  };

  const config = { ...defaults, ...options };

  return rateLimit({
    windowMs: config.windowMs,
    max: (req) => {
      const normalizedIP = normalizeIP(req.ip);
      
      // Bypass for allowed IPs (check both original and normalized)
      if (config.allowedIPs && (config.allowedIPs.includes(req.ip) || config.allowedIPs.includes(normalizedIP))) {
        return 0; // No limit for allowed IPs
      }
      
      // Bypass for local network IPs (unless explicitly disabled)
      if (config.allowLocalNetwork !== false && isLocalNetworkIP(req.ip)) {
        return 0; // No limit for local network IPs
      }

      // Bypass for certain roles
      if (req.user?.role && config.bypassRoles.includes(req.user.role)) {
        return 0; // No limit
      }

      // Different limits based on user status
      if (!req.user) {
        return config.anonymousMax;
      } else if (req.user.premium) {
        return config.premiumMax;
      } else {
        return config.authenticatedMax;
      }
    },
    keyGenerator: (req) => {
      // Use normalized IP for consistent key generation
      const normalizedIP = normalizeIP(req.ip);
      return req.user?.id ? `user:${req.user.id}` : `ip:${normalizedIP}`;
    },
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => {
      const normalizedIP = normalizeIP(req.ip);
      // Skip rate limiting entirely for allowed IPs (check both original and normalized)
      if (config.allowedIPs && (config.allowedIPs.includes(req.ip) || config.allowedIPs.includes(normalizedIP))) {
        return true;
      }
      // Skip rate limiting for local network IPs (unless explicitly disabled)
      if (config.allowLocalNetwork !== false && isLocalNetworkIP(req.ip)) {
        return true;
      }
      return false;
    },
    handler: (req, res) => {
      const userType = req.user ? (req.user.premium ? 'premium' : 'authenticated') : 'anonymous';
      logger.warn(`Rate limit exceeded for ${userType} user: ${req.user?.username || req.ip}`);
      
      res.status(429).json({
        success: false,
        status: 'error',
        message: 'Rate limit exceeded. Please try again later.',
        error: 'RATE_LIMIT_EXCEEDED',
        retryAfter: Math.ceil(config.windowMs / 1000)
      });
    }
  });
}

/**
 * Burst protection middleware
 * Prevents rapid-fire requests within a short time window
 * @param {Object} options - Configuration options
 * @returns {Function} Express middleware
 */
function createBurstProtectionMiddleware(options = {}) {
  const defaults = {
    windowMs: 1000,     // 1 second window
    maxBurst: 10,       // 10 requests per second max
    blockDuration: 60000, // Block for 1 minute if burst exceeded
    allowedIPs: [] // IPs that bypass burst protection
  };

  const config = { ...defaults, ...options };
  const burstTracker = new Map();

  return function burstProtectionMiddleware(req, res, next) {
    const normalizedIP = normalizeIP(req.ip);
    const key = normalizedIP;
    const now = Date.now();
    
    // Skip burst protection for allowed IPs
    if (config.allowedIPs && (config.allowedIPs.includes(req.ip) || config.allowedIPs.includes(normalizedIP))) {
      return next();
    }
    
    // Skip burst protection for local network IPs (unless explicitly disabled)
    if (config.allowLocalNetwork !== false && isLocalNetworkIP(req.ip)) {
      return next();
    }
    
    // Clean old entries
    if (burstTracker.has(key)) {
      const data = burstTracker.get(key);
      if (now - data.windowStart > config.windowMs) {
        data.count = 1;
        data.windowStart = now;
      } else {
        data.count++;
      }
      
      // Check if burst limit exceeded
      if (data.count > config.maxBurst) {
        // Block the IP temporarily
        blockedIPs.add(key);
        setTimeout(() => blockedIPs.delete(key), config.blockDuration);
        
        logger.warn(`Burst protection activated for IP: ${req.ip} (normalized: ${normalizedIP})`);
        return res.status(429).json({
          success: false,
          status: 'error',
          message: 'Too many rapid requests. Temporarily blocked.',
          error: 'BURST_PROTECTION_ACTIVATED',
          retryAfter: Math.ceil(config.blockDuration / 1000)
        });
      }
    } else {
      burstTracker.set(key, {
        count: 1,
        windowStart: now
      });
    }

    next();
  };
}

/**
 * IP blocking middleware
 * Blocks requests from known malicious IPs
 * @param {Object} options - Configuration options
 * @returns {Function} Express middleware
 */
function createIPBlockingMiddleware(options = {}) {
  const defaults = {
    allowedIPs: [], // IPs that are always allowed
    blockedIPs: [], // IPs that are always blocked
    suspiciousThreshold: 5, // Number of suspicious events before temporary block
    blockDuration: 24 * 60 * 60 * 1000 // 24 hours
  };

  const config = { ...defaults, ...options };

  return function ipBlockingMiddleware(req, res, next) {
    const clientIP = req.ip;
    const normalizedIP = normalizeIP(clientIP);

    // Check if IP is in allowed list (check both original and normalized)
    if (config.allowedIPs.includes(clientIP) || config.allowedIPs.includes(normalizedIP)) {
      return next();
    }

    // Check if IP is permanently blocked (check both original and normalized)
    if (config.blockedIPs.includes(clientIP) || config.blockedIPs.includes(normalizedIP) || 
        blockedIPs.has(clientIP) || blockedIPs.has(normalizedIP)) {
      logger.warn(`Blocked IP attempted access: ${clientIP} (normalized: ${normalizedIP})`);
      return res.status(403).json({
        success: false,
        status: 'error',
        message: 'Access denied',
        error: 'IP_BLOCKED'
      });
    }

    // Check suspicious activity (use normalized IP for consistency)
    if (suspiciousIPs.has(normalizedIP)) {
      const data = suspiciousIPs.get(normalizedIP);
      if (data.count >= config.suspiciousThreshold) {
        // Temporarily block suspicious IP
        blockedIPs.add(normalizedIP);
        setTimeout(() => blockedIPs.delete(normalizedIP), config.blockDuration);
        
        logger.warn(`Suspicious IP temporarily blocked: ${clientIP} (normalized: ${normalizedIP})`);
        return res.status(403).json({
          success: false,
          status: 'error',
          message: 'Suspicious activity detected. Temporarily blocked.',
          error: 'SUSPICIOUS_ACTIVITY_BLOCKED'
        });
      }
    }

    next();
  };
}

/**
 * Mark IP as suspicious
 * @param {string} ip - IP address
 * @param {string} reason - Reason for suspicion
 */
function markIPSuspicious(ip, reason) {
  const normalizedIP = normalizeIP(ip);
  const now = Date.now();
  
  if (suspiciousIPs.has(normalizedIP)) {
    const data = suspiciousIPs.get(normalizedIP);
    data.count++;
    data.reasons.push({ reason, timestamp: now });
  } else {
    suspiciousIPs.set(normalizedIP, {
      count: 1,
      firstSeen: now,
      reasons: [{ reason, timestamp: now }]
    });
  }
  
  logger.info(`IP marked as suspicious: ${ip} (normalized: ${normalizedIP}) - ${reason}`);
}

/**
 * Clear a blocked IP address
 * @param {string} ip - IP address to unblock
 * @returns {boolean} - True if IP was blocked and is now cleared
 */
function clearBlockedIP(ip) {
  const normalizedIP = normalizeIP(ip);
  const wasBlocked = blockedIPs.has(ip) || blockedIPs.has(normalizedIP);
  
  // Clear both original and normalized IP formats
  blockedIPs.delete(ip);
  blockedIPs.delete(normalizedIP);
  suspiciousIPs.delete(ip);
  suspiciousIPs.delete(normalizedIP);
  
  if (wasBlocked) {
    logger.info(`Cleared blocked IP: ${ip} (normalized: ${normalizedIP})`);
  }
  
  return wasBlocked;
}

/**
 * Clear all blocked IPs
 * @returns {number} - Number of IPs that were cleared
 */
function clearAllBlockedIPs() {
  const count = blockedIPs.size;
  blockedIPs.clear();
  suspiciousIPs.clear();
  
  logger.info(`Cleared ${count} blocked IPs`);
  return count;
}

/**
 * Get current rate limiting status
 * @returns {Object} - Status information
 */
function getRateLimitStatus() {
  return {
    blockedIPs: Array.from(blockedIPs),
    suspiciousIPs: Array.from(suspiciousIPs.entries()).map(([ip, data]) => ({
      ip,
      count: data.count,
      firstSeen: new Date(data.firstSeen).toISOString(),
      reasons: data.reasons.map(r => ({
        reason: r.reason,
        timestamp: new Date(r.timestamp).toISOString()
      }))
    })),
    totalBlocked: blockedIPs.size,
    totalSuspicious: suspiciousIPs.size
  };
}

/**
 * Port-specific rate limiter
 * Special limits for port management operations
 */
const portOperationsLimiter = createRateLimiter({
  windowMs: 2 * 60 * 1000, // 2 minutes
  max: 20, // 20 port operations per 2 minutes
  message: 'Too many port operations. Please wait before trying again.',
  skip: (req) => {
    // Skip rate limiting for simple queries
    return req.method === 'GET' && !req.path.includes('/scan');
  }
});

/**
 * Critical operations limiter
 * Very strict limits for sensitive operations
 */
const criticalOperationsLimiter = createRateLimiter({
  windowMs: 10 * 60 * 1000, // 10 minutes
  max: 5, // 5 critical operations per 10 minutes
  message: 'Critical operation limit exceeded. Please contact administrator if needed.',
  handler: (req, res) => {
    markIPSuspicious(req.ip, 'Critical operations limit exceeded');
    logger.error(`Critical operations limit exceeded for IP: ${req.ip}, Path: ${req.path}`);
    
    res.status(429).json({
      success: false,
      status: 'error',
      message: 'Critical operation limit exceeded',
      error: 'CRITICAL_LIMIT_EXCEEDED'
    });
  }
});

module.exports = {
  globalLimiter,
  authLimiter,
  writeLimiter,
  portOperationsLimiter,
  criticalOperationsLimiter,
  createRateLimiter,
  createUserAwareRateLimiter,
  createBurstProtectionMiddleware,
  createIPBlockingMiddleware,
  markIPSuspicious,
  clearBlockedIP,
  clearAllBlockedIPs,
  getRateLimitStatus,
  normalizeIP
};