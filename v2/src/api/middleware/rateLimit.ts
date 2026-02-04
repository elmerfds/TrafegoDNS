/**
 * Rate limiting middleware
 * Uses a sliding window algorithm with in-memory storage
 */
import type { Request, Response, NextFunction } from 'express';
import { ApiError } from './errorHandler.js';
import { createChildLogger } from '../../core/Logger.js';

const logger = createChildLogger({ service: 'RateLimit' });

interface RateLimitWindow {
  count: number;
  resetAt: number;
}

interface RateLimitConfig {
  windowMs: number; // Time window in milliseconds
  maxRequests: number; // Maximum requests per window
  keyGenerator?: (req: Request) => string; // Function to generate rate limit key
  skip?: (req: Request) => boolean; // Function to skip rate limiting
  message?: string; // Custom error message
}

// In-memory store for rate limit windows
const rateLimitStore: Map<string, RateLimitWindow> = new Map();

// Cleanup old entries periodically
setInterval(
  () => {
    const now = Date.now();
    for (const [key, window] of rateLimitStore.entries()) {
      if (window.resetAt < now) {
        rateLimitStore.delete(key);
      }
    }
  },
  60 * 1000
); // Every minute

/**
 * Default key generator - uses IP address
 */
function defaultKeyGenerator(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  const ip = typeof forwarded === 'string' ? forwarded.split(',')[0]?.trim() : req.ip;
  return `ip:${ip ?? 'unknown'}`;
}

/**
 * Create rate limit middleware
 */
export function rateLimit(config: RateLimitConfig) {
  const {
    windowMs,
    maxRequests,
    keyGenerator = defaultKeyGenerator,
    skip,
    message = 'Too many requests, please try again later',
  } = config;

  return (req: Request, res: Response, next: NextFunction): void => {
    // Check if we should skip rate limiting
    if (skip?.(req)) {
      next();
      return;
    }

    const key = keyGenerator(req);
    const now = Date.now();

    let window = rateLimitStore.get(key);

    // Initialize or reset window if expired
    if (!window || window.resetAt < now) {
      window = {
        count: 0,
        resetAt: now + windowMs,
      };
    }

    // Increment count
    window.count++;
    rateLimitStore.set(key, window);

    // Set rate limit headers
    const remaining = Math.max(0, maxRequests - window.count);
    const resetSeconds = Math.ceil((window.resetAt - now) / 1000);

    res.setHeader('X-RateLimit-Limit', maxRequests);
    res.setHeader('X-RateLimit-Remaining', remaining);
    res.setHeader('X-RateLimit-Reset', resetSeconds);

    // Check if over limit
    if (window.count > maxRequests) {
      res.setHeader('Retry-After', resetSeconds);
      logger.warn({ key, count: window.count, maxRequests }, 'Rate limit exceeded');
      next(ApiError.tooManyRequests(message));
      return;
    }

    next();
  };
}

/**
 * Per-IP rate limiter with standard limits
 */
export const standardRateLimit = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  maxRequests: 100, // 100 requests per minute
});

/**
 * Stricter rate limiter for auth endpoints
 */
export const authRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  maxRequests: 30, // 30 requests per 15 minutes
  message: 'Too many authentication attempts, please try again later',
});

/**
 * Very strict rate limiter for password reset, etc.
 */
export const strictRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  maxRequests: 5, // 5 requests per hour
  message: 'Too many requests, please try again later',
});

/**
 * Per-API-key rate limiter
 */
export const apiKeyRateLimit = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  maxRequests: 200, // 200 requests per minute
  keyGenerator: (req) => {
    if (req.apiKey) {
      return `apikey:${req.apiKey.id}`;
    }
    return defaultKeyGenerator(req);
  },
});
