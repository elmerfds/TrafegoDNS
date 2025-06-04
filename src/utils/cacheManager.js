/**
 * Centralized Cache Manager
 * Provides unified caching with TTL, invalidation, and monitoring
 */

const logger = require('./logger');
const { EventBus } = require('../events/EventBus');

class CacheManager {
  constructor(config = {}) {
    this.config = {
      defaultTtl: config.defaultTtl || 300000, // 5 minutes
      maxSize: config.maxSize || 1000,
      cleanupInterval: config.cleanupInterval || 60000, // 1 minute
      enableMetrics: config.enableMetrics !== false,
      ...config
    };

    // Cache storage
    this.caches = new Map();
    this.cacheConfigs = new Map();
    
    // Metrics
    this.metrics = {
      hits: 0,
      misses: 0,
      sets: 0,
      deletes: 0,
      invalidations: 0,
      cleanups: 0,
      errors: 0
    };

    // Event emitter for cache events
    this.eventBus = EventBus;

    // Start cleanup interval
    this.cleanupTimer = setInterval(() => this.cleanup(), this.config.cleanupInterval);

    logger.info('CacheManager initialized', {
      defaultTtl: this.config.defaultTtl,
      maxSize: this.config.maxSize,
      enableMetrics: this.config.enableMetrics
    });
  }

  /**
   * Register a cache with specific configuration
   * @param {string} namespace - Cache namespace
   * @param {Object} config - Cache configuration
   */
  registerCache(namespace, config = {}) {
    const cacheConfig = {
      ttl: config.ttl || this.config.defaultTtl,
      maxSize: config.maxSize || this.config.maxSize,
      warmupFunction: config.warmupFunction || null,
      invalidateOn: config.invalidateOn || [],
      keyPrefix: config.keyPrefix || namespace,
      compression: config.compression || false,
      persistToDisk: config.persistToDisk || false,
      ...config
    };

    this.cacheConfigs.set(namespace, cacheConfig);
    
    if (!this.caches.has(namespace)) {
      this.caches.set(namespace, new Map());
    }

    // Set up event listeners for invalidation
    if (cacheConfig.invalidateOn.length > 0) {
      cacheConfig.invalidateOn.forEach(event => {
        this.eventBus.on(event, (data) => {
          this.invalidateByPattern(namespace, data.pattern || '*');
        });
      });
    }

    logger.debug(`Registered cache namespace: ${namespace}`, cacheConfig);
    return this;
  }

  /**
   * Get value from cache
   * @param {string} namespace - Cache namespace
   * @param {string} key - Cache key
   * @returns {any} Cached value or null
   */
  get(namespace, key) {
    try {
      const cache = this.caches.get(namespace);
      if (!cache) {
        this._recordMetric('misses');
        return null;
      }

      const fullKey = this._getFullKey(namespace, key);
      const entry = cache.get(fullKey);

      if (!entry) {
        this._recordMetric('misses');
        return null;
      }

      // Check expiration
      if (this._isExpired(entry)) {
        cache.delete(fullKey);
        this._recordMetric('misses');
        this._recordMetric('cleanups');
        return null;
      }

      // Update access time and hit count
      entry.lastAccessed = Date.now();
      entry.hitCount = (entry.hitCount || 0) + 1;

      this._recordMetric('hits');
      
      logger.debug(`Cache hit: ${namespace}:${key}`, {
        hitCount: entry.hitCount,
        age: Date.now() - entry.createdAt
      });

      return entry.value;
    } catch (error) {
      this._recordMetric('errors');
      logger.error('Cache get error:', error);
      return null;
    }
  }

  /**
   * Set value in cache
   * @param {string} namespace - Cache namespace
   * @param {string} key - Cache key
   * @param {any} value - Value to cache
   * @param {Object} options - Set options
   */
  set(namespace, key, value, options = {}) {
    try {
      let cache = this.caches.get(namespace);
      if (!cache) {
        cache = new Map();
        this.caches.set(namespace, cache);
      }

      const config = this.cacheConfigs.get(namespace) || {};
      const ttl = options.ttl || config.ttl || this.config.defaultTtl;
      const fullKey = this._getFullKey(namespace, key);

      // Check cache size limits
      if (cache.size >= (config.maxSize || this.config.maxSize)) {
        this._evictLeastRecentlyUsed(cache, config.maxSize || this.config.maxSize);
      }

      const entry = {
        value: options.compression ? this._compress(value) : value,
        createdAt: Date.now(),
        expiresAt: Date.now() + ttl,
        lastAccessed: Date.now(),
        hitCount: 0,
        compressed: !!options.compression,
        tags: options.tags || [],
        namespace,
        key
      };

      cache.set(fullKey, entry);
      this._recordMetric('sets');

      logger.debug(`Cache set: ${namespace}:${key}`, {
        ttl,
        size: this._getValueSize(value),
        compressed: entry.compressed
      });

      // Emit cache set event
      this.eventBus.emit('cache:set', {
        namespace,
        key,
        size: this._getValueSize(value)
      });

      return this;
    } catch (error) {
      this._recordMetric('errors');
      logger.error('Cache set error:', error);
      return this;
    }
  }

  /**
   * Delete specific key from cache
   * @param {string} namespace - Cache namespace
   * @param {string} key - Cache key
   */
  delete(namespace, key) {
    try {
      const cache = this.caches.get(namespace);
      if (!cache) return false;

      const fullKey = this._getFullKey(namespace, key);
      const deleted = cache.delete(fullKey);
      
      if (deleted) {
        this._recordMetric('deletes');
        logger.debug(`Cache delete: ${namespace}:${key}`);
        
        this.eventBus.emit('cache:delete', { namespace, key });
      }

      return deleted;
    } catch (error) {
      this._recordMetric('errors');
      logger.error('Cache delete error:', error);
      return false;
    }
  }

  /**
   * Invalidate cache entries by pattern
   * @param {string} namespace - Cache namespace
   * @param {string} pattern - Key pattern (supports wildcards)
   */
  invalidateByPattern(namespace, pattern = '*') {
    try {
      const cache = this.caches.get(namespace);
      if (!cache) return 0;

      let count = 0;
      const regex = this._patternToRegex(pattern);

      for (const [fullKey, entry] of cache.entries()) {
        if (regex.test(entry.key)) {
          cache.delete(fullKey);
          count++;
        }
      }

      this._recordMetric('invalidations', count);
      
      logger.debug(`Cache invalidation: ${namespace}:${pattern}`, { count });
      
      this.eventBus.emit('cache:invalidate', {
        namespace,
        pattern,
        count
      });

      return count;
    } catch (error) {
      this._recordMetric('errors');
      logger.error('Cache invalidation error:', error);
      return 0;
    }
  }

  /**
   * Invalidate cache entries by tags
   * @param {string} namespace - Cache namespace
   * @param {string[]} tags - Tags to invalidate
   */
  invalidateByTags(namespace, tags) {
    try {
      const cache = this.caches.get(namespace);
      if (!cache) return 0;

      let count = 0;
      const tagSet = new Set(tags);

      for (const [fullKey, entry] of cache.entries()) {
        if (entry.tags && entry.tags.some(tag => tagSet.has(tag))) {
          cache.delete(fullKey);
          count++;
        }
      }

      this._recordMetric('invalidations', count);
      
      logger.debug(`Cache tag invalidation: ${namespace}`, { tags, count });
      
      this.eventBus.emit('cache:invalidate:tags', {
        namespace,
        tags,
        count
      });

      return count;
    } catch (error) {
      this._recordMetric('errors');
      logger.error('Cache tag invalidation error:', error);
      return 0;
    }
  }

  /**
   * Clear entire namespace
   * @param {string} namespace - Cache namespace
   */
  clear(namespace) {
    try {
      const cache = this.caches.get(namespace);
      if (!cache) return 0;

      const count = cache.size;
      cache.clear();

      logger.debug(`Cache cleared: ${namespace}`, { count });
      
      this.eventBus.emit('cache:clear', { namespace, count });

      return count;
    } catch (error) {
      this._recordMetric('errors');
      logger.error('Cache clear error:', error);
      return 0;
    }
  }

  /**
   * Get or set pattern - get from cache or execute function and cache result
   * @param {string} namespace - Cache namespace
   * @param {string} key - Cache key
   * @param {Function} fn - Function to execute if cache miss
   * @param {Object} options - Cache options
   */
  async getOrSet(namespace, key, fn, options = {}) {
    try {
      // Try to get from cache first
      let value = this.get(namespace, key);
      
      if (value !== null) {
        return value;
      }

      // Cache miss - execute function
      logger.debug(`Cache miss, executing function: ${namespace}:${key}`);
      
      value = await fn();
      
      if (value !== null && value !== undefined) {
        this.set(namespace, key, value, options);
      }

      return value;
    } catch (error) {
      this._recordMetric('errors');
      logger.error('Cache getOrSet error:', error);
      throw error;
    }
  }

  /**
   * Warm up cache using configured warmup functions
   * @param {string} namespace - Cache namespace
   */
  async warmup(namespace) {
    try {
      const config = this.cacheConfigs.get(namespace);
      if (!config || !config.warmupFunction) {
        logger.debug(`No warmup function configured for namespace: ${namespace}`);
        return;
      }

      logger.info(`Starting cache warmup for namespace: ${namespace}`);
      
      const startTime = Date.now();
      await config.warmupFunction(this, namespace);
      const duration = Date.now() - startTime;

      logger.info(`Cache warmup completed for namespace: ${namespace}`, { duration });
      
      this.eventBus.emit('cache:warmup:complete', {
        namespace,
        duration
      });
    } catch (error) {
      this._recordMetric('errors');
      logger.error('Cache warmup error:', error);
      
      this.eventBus.emit('cache:warmup:error', {
        namespace,
        error: error.message
      });
    }
  }

  /**
   * Get cache statistics
   * @param {string} namespace - Specific namespace or null for all
   */
  getStats(namespace = null) {
    const stats = {
      metrics: { ...this.metrics },
      namespaces: {}
    };

    if (namespace) {
      const cache = this.caches.get(namespace);
      const config = this.cacheConfigs.get(namespace);
      
      if (cache && config) {
        stats.namespaces[namespace] = this._getNamespaceStats(cache, config);
      }
    } else {
      for (const [ns, cache] of this.caches.entries()) {
        const config = this.cacheConfigs.get(ns);
        stats.namespaces[ns] = this._getNamespaceStats(cache, config);
      }
    }

    // Calculate hit ratio
    const total = this.metrics.hits + this.metrics.misses;
    stats.metrics.hitRatio = total > 0 ? (this.metrics.hits / total) : 0;

    return stats;
  }

  /**
   * Cleanup expired entries across all caches
   */
  cleanup() {
    try {
      let totalCleaned = 0;
      
      for (const [namespace, cache] of this.caches.entries()) {
        let cleaned = 0;
        const now = Date.now();

        for (const [key, entry] of cache.entries()) {
          if (this._isExpired(entry, now)) {
            cache.delete(key);
            cleaned++;
          }
        }

        totalCleaned += cleaned;
        
        if (cleaned > 0) {
          logger.debug(`Cache cleanup: ${namespace}`, { cleaned });
        }
      }

      if (totalCleaned > 0) {
        this._recordMetric('cleanups', totalCleaned);
        
        this.eventBus.emit('cache:cleanup', {
          cleaned: totalCleaned
        });
      }
    } catch (error) {
      this._recordMetric('errors');
      logger.error('Cache cleanup error:', error);
    }
  }

  /**
   * Shutdown cache manager
   */
  shutdown() {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }

    // Clear all caches
    for (const namespace of this.caches.keys()) {
      this.clear(namespace);
    }

    logger.info('CacheManager shutdown complete');
  }

  // Private methods

  _getFullKey(namespace, key) {
    const config = this.cacheConfigs.get(namespace);
    const prefix = config?.keyPrefix || namespace;
    return `${prefix}:${key}`;
  }

  _isExpired(entry, now = Date.now()) {
    return now > entry.expiresAt;
  }

  _evictLeastRecentlyUsed(cache, maxSize) {
    const entries = Array.from(cache.entries());
    entries.sort((a, b) => a[1].lastAccessed - b[1].lastAccessed);
    
    const toRemove = entries.length - maxSize + 1;
    for (let i = 0; i < toRemove; i++) {
      cache.delete(entries[i][0]);
    }
  }

  _compress(value) {
    // Simple JSON compression - in production, use actual compression library
    return JSON.stringify(value);
  }

  _decompress(value) {
    return JSON.parse(value);
  }

  _getValueSize(value) {
    return JSON.stringify(value).length;
  }

  _patternToRegex(pattern) {
    const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regexPattern = escaped.replace(/\\\*/g, '.*');
    return new RegExp(`^${regexPattern}$`);
  }

  _recordMetric(metric, value = 1) {
    if (this.config.enableMetrics) {
      this.metrics[metric] = (this.metrics[metric] || 0) + value;
    }
  }

  _getNamespaceStats(cache, config) {
    const entries = Array.from(cache.values());
    const now = Date.now();
    
    return {
      size: cache.size,
      maxSize: config.maxSize,
      ttl: config.ttl,
      expired: entries.filter(entry => this._isExpired(entry, now)).length,
      totalHits: entries.reduce((sum, entry) => sum + (entry.hitCount || 0), 0),
      avgAge: entries.length > 0 
        ? entries.reduce((sum, entry) => sum + (now - entry.createdAt), 0) / entries.length 
        : 0,
      memoryUsage: entries.reduce((sum, entry) => 
        sum + this._getValueSize(entry.value), 0
      )
    };
  }
}

// Export singleton instance
const cacheManager = new CacheManager();

module.exports = {
  CacheManager,
  cacheManager
};