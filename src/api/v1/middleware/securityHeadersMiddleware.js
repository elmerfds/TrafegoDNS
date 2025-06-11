/**
 * Security Headers Middleware
 * Implements comprehensive security headers for API protection
 */

const logger = require('../../../utils/logger');

/**
 * Configure security headers middleware
 * @param {Object} options - Configuration options
 * @returns {Function} Express middleware function
 */
function createSecurityHeadersMiddleware(options = {}) {
  const defaults = {
    // Content Security Policy
    contentSecurityPolicy: {
      enabled: true,
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:", "https:"],
        connectSrc: ["'self'"],
        fontSrc: ["'self'"],
        objectSrc: ["'none'"],
        mediaSrc: ["'self'"],
        frameSrc: ["'none'"]
      }
    },
    // HTTP Strict Transport Security
    hsts: {
      enabled: true,
      maxAge: 31536000, // 1 year
      includeSubDomains: true,
      preload: true
    },
    // X-Frame-Options
    frameOptions: {
      enabled: true,
      action: 'DENY' // or 'SAMEORIGIN'
    },
    // X-Content-Type-Options
    noSniff: {
      enabled: true
    },
    // X-XSS-Protection
    xssFilter: {
      enabled: true,
      mode: 'block'
    },
    // Referrer Policy
    referrerPolicy: {
      enabled: true,
      policy: 'strict-origin-when-cross-origin'
    },
    // Permissions Policy (formerly Feature Policy)
    permissionsPolicy: {
      enabled: true,
      features: {
        camera: [],
        microphone: [],
        geolocation: [],
        payment: [],
        usb: [],
        magnetometer: [],
        accelerometer: [],
        gyroscope: []
      }
    },
    // Cross-Origin policies
    crossOrigin: {
      embedderPolicy: 'require-corp',
      openerPolicy: 'same-origin',
      resourcePolicy: 'cross-origin'
    }
  };

  const config = { ...defaults, ...options };

  return function securityHeadersMiddleware(req, res, next) {
    try {
      // Content Security Policy
      if (config.contentSecurityPolicy.enabled) {
        const cspDirectives = [];
        for (const [directive, sources] of Object.entries(config.contentSecurityPolicy.directives)) {
          const kebabDirective = directive.replace(/([A-Z])/g, '-$1').toLowerCase();
          cspDirectives.push(`${kebabDirective} ${sources.join(' ')}`);
        }
        res.setHeader('Content-Security-Policy', cspDirectives.join('; '));
      }

      // HTTP Strict Transport Security
      if (config.hsts.enabled) {
        let hstsValue = `max-age=${config.hsts.maxAge}`;
        if (config.hsts.includeSubDomains) {
          hstsValue += '; includeSubDomains';
        }
        if (config.hsts.preload) {
          hstsValue += '; preload';
        }
        res.setHeader('Strict-Transport-Security', hstsValue);
      }

      // X-Frame-Options
      if (config.frameOptions.enabled) {
        res.setHeader('X-Frame-Options', config.frameOptions.action);
      }

      // X-Content-Type-Options
      if (config.noSniff.enabled) {
        res.setHeader('X-Content-Type-Options', 'nosniff');
      }

      // X-XSS-Protection
      if (config.xssFilter.enabled) {
        const xssValue = config.xssFilter.mode === 'block' ? '1; mode=block' : '1';
        res.setHeader('X-XSS-Protection', xssValue);
      }

      // Referrer Policy
      if (config.referrerPolicy.enabled) {
        res.setHeader('Referrer-Policy', config.referrerPolicy.policy);
      }

      // Permissions Policy
      if (config.permissionsPolicy.enabled) {
        const policies = [];
        for (const [feature, allowlist] of Object.entries(config.permissionsPolicy.features)) {
          const allowlistStr = allowlist.length > 0 ? allowlist.join(' ') : 'none';
          policies.push(`${feature}=(${allowlistStr})`);
        }
        if (policies.length > 0) {
          res.setHeader('Permissions-Policy', policies.join(', '));
        }
      }

      // Cross-Origin policies
      if (config.crossOrigin.embedderPolicy) {
        res.setHeader('Cross-Origin-Embedder-Policy', config.crossOrigin.embedderPolicy);
      }
      if (config.crossOrigin.openerPolicy) {
        res.setHeader('Cross-Origin-Opener-Policy', config.crossOrigin.openerPolicy);
      }
      if (config.crossOrigin.resourcePolicy) {
        res.setHeader('Cross-Origin-Resource-Policy', config.crossOrigin.resourcePolicy);
      }

      // Additional security headers
      res.setHeader('X-Powered-By', ''); // Hide technology stack
      res.removeHeader('X-Powered-By');
      
      // Cache control for sensitive endpoints
      if (req.path.includes('/auth/') || req.path.includes('/users/') || req.path.includes('/config/')) {
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
      }

      next();
    } catch (error) {
      logger.error('Security headers middleware error:', error);
      // Don't block the request if headers fail to set
      next();
    }
  };
}

/**
 * HTTPS enforcement middleware
 * Redirects HTTP requests to HTTPS in production
 * @param {Object} options - Configuration options
 * @returns {Function} Express middleware function
 */
function createHttpsEnforcementMiddleware(options = {}) {
  const defaults = {
    enabled: process.env.NODE_ENV === 'production',
    trustProxy: true,
    excludePaths: ['/health', '/metrics'], // Health checks may use HTTP
    port: process.env.HTTPS_PORT || 443
  };

  const config = { ...defaults, ...options };

  return function httpsEnforcementMiddleware(req, res, next) {
    if (!config.enabled) {
      return next();
    }

    // Skip excluded paths
    if (config.excludePaths.includes(req.path)) {
      return next();
    }

    // Check if request is already HTTPS
    const isHttps = req.secure || 
                   (config.trustProxy && req.headers['x-forwarded-proto'] === 'https') ||
                   req.headers['x-forwarded-ssl'] === 'on';

    if (!isHttps) {
      const redirectUrl = `https://${req.get('host')}${req.originalUrl}`;
      logger.info(`HTTPS redirect: ${req.originalUrl} -> ${redirectUrl}`);
      return res.redirect(301, redirectUrl);
    }

    next();
  };
}

/**
 * Security headers for API responses
 * Adds API-specific security headers
 * @param {Object} options - Configuration options
 * @returns {Function} Express middleware function
 */
function createApiSecurityMiddleware(options = {}) {
  const defaults = {
    noCache: true,
    validateContentType: true,
    allowedContentTypes: ['application/json', 'application/x-www-form-urlencoded', 'multipart/form-data']
  };

  const config = { ...defaults, ...options };

  return function apiSecurityMiddleware(req, res, next) {
    // Validate Content-Type for POST/PUT/PATCH requests
    if (config.validateContentType && ['POST', 'PUT', 'PATCH'].includes(req.method)) {
      const contentType = req.get('Content-Type');
      if (contentType) {
        const isValidContentType = config.allowedContentTypes.some(allowed => 
          contentType.startsWith(allowed)
        );
        
        if (!isValidContentType) {
          logger.warn(`Invalid Content-Type: ${contentType} from ${req.ip}`);
          return res.status(415).json({
            success: false,
            status: 'error',
            message: 'Unsupported Media Type',
            error: 'INVALID_CONTENT_TYPE'
          });
        }
      }
    }

    // API cache control
    if (config.noCache) {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
    }

    // API-specific headers
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-API-Version', process.env.API_VERSION || '1.0');
    
    next();
  };
}

module.exports = {
  createSecurityHeadersMiddleware,
  createHttpsEnforcementMiddleware,
  createApiSecurityMiddleware
};