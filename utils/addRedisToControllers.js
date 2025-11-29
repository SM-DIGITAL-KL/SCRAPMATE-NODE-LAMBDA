/**
 * Helper script to add Redis caching to controllers
 * This file documents the pattern for adding Redis to controllers
 */

const RedisCache = require('./redisCache');

/**
 * Pattern for adding Redis to GET methods:
 * 
 * 1. Add import: const RedisCache = require('../utils/redisCache');
 * 
 * 2. Before database query, check cache:
 *    const cacheKey = RedisCache.listKey('type', { params });
 *    try {
 *      const cached = await RedisCache.get(cacheKey);
 *      if (cached) {
 *        console.log('⚡ Cache hit');
 *        return res.json(cached);
 *      }
 *    } catch (err) {
 *      console.error('Redis get error:', err);
 *    }
 * 
 * 3. After database query, cache result:
 *    try {
 *      await RedisCache.set(cacheKey, results, TTL);
 *      console.log('💾 Data cached');
 *    } catch (err) {
 *      console.error('Redis cache set error:', err);
 *    }
 * 
 * 4. For POST/PUT/DELETE methods, invalidate cache:
 *    try {
 *      await RedisCache.invalidateTableCache('table_name');
 *      await RedisCache.delete(RedisCache.listKey('type', { params }));
 *      console.log('🗑️  Invalidated caches');
 *    } catch (err) {
 *      console.error('Redis cache invalidation error:', err);
 *    }
 */

module.exports = {
  // Common TTL values
  TTL: {
    SHORT: 120,      // 2 minutes
    MEDIUM: 600,     // 10 minutes
    LONG: 1800,      // 30 minutes
    VERY_LONG: 3600  // 1 hour
  }
};
