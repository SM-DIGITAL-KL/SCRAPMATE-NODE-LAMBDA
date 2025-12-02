require('dotenv').config();
const redis = require('../config/redis');

class RedisCache {
  /**
   * Get TTL (Time To Live) from environment variables
   * @param {string} type - Cache type (dashboard, short, list, medium, record, long, static, very_long, notification, default)
   * @returns {number} - TTL in seconds
   */
  static getTTL(type = 'default') {
    const ttlMap = {
      '365days': process.env.CACHE_TTL_365_DAYS || 31536000, // 365 days
      '30days': process.env.CACHE_TTL_30_DAYS || 2592000,
      'dashboard': process.env.CACHE_TTL_DASHBOARD || 300,
      'short': process.env.CACHE_TTL_SHORT || 120,
      'list': process.env.CACHE_TTL_LIST || 600,
      'medium': process.env.CACHE_TTL_MEDIUM || 600,
      'record': process.env.CACHE_TTL_RECORD || 1800,
      'long': process.env.CACHE_TTL_LONG || 1800,
      'static': process.env.CACHE_TTL_STATIC || 3600,
      'very_long': process.env.CACHE_TTL_VERY_LONG || 3600,
      'notification': process.env.CACHE_TTL_NOTIFICATION || 300,
      'default': process.env.CACHE_TTL_DEFAULT || 3600
    };
    
    const ttl = parseInt(ttlMap[type.toLowerCase()] || ttlMap['default']);
    return ttl;
  }
  /**
   * Get cache with key
   * @param {string} key - Cache key
   * @returns {Promise<any>} - Cached value or null
   */
  static async get(key) {
    try {
      if (!redis) {
        return null;
      }
      
      const cached = await redis.get(key);
      if (cached) {
        console.log(`⚡ Redis cache hit: ${key}`);
        return typeof cached === 'string' ? JSON.parse(cached) : cached;
      }
      return null;
    } catch (err) {
      console.error(`Redis get error for key ${key}:`, err);
      return null;
    }
  }

  /**
   * Set cache with key and value
   * @param {string} key - Cache key
   * @param {any} value - Value to cache
   * @param {number|string} ttl - Time to live in seconds or cache type string (default: 'default')
   * @returns {Promise<boolean>} - Success status
   */
  static async set(key, value, ttl = 'default') {
    try {
      if (!redis) {
        console.warn(`⚠️  Redis client not available. Skipping cache set for key: ${key}`);
        return false;
      }
      
      // If ttl is a string, treat it as a cache type and get TTL from env
      const ttlSeconds = typeof ttl === 'string' ? this.getTTL(ttl) : ttl;
      
      const serialized = typeof value === 'string' ? value : JSON.stringify(value);
      await redis.set(key, serialized, { ex: ttlSeconds });
      console.log(`💾 Redis cache set: ${key} (TTL: ${ttlSeconds}s${typeof ttl === 'string' ? ` [${ttl}]` : ''})`);
      return true;
    } catch (err) {
      console.error(`Redis set error for key ${key}:`, err);
      return false;
    }
  }

  /**
   * Delete cache by key
   * @param {string} key - Cache key
   * @returns {Promise<boolean>} - Success status
   */
  static async delete(key) {
    try {
      if (!redis) {
        return false;
      }
      
      await redis.del(key);
      console.log(`🗑️  Redis cache deleted: ${key}`);
      return true;
    } catch (err) {
      console.error(`Redis delete error for key ${key}:`, err);
      return false;
    }
  }

  /**
   * Delete cache by pattern
   * @param {string} pattern - Cache key pattern (e.g., 'shop:*')
   * @returns {Promise<number>} - Number of keys deleted
   */
  static async deleteByPattern(pattern) {
    try {
      // Note: Upstash Redis doesn't support KEYS command
      // This is a placeholder - you may need to track keys separately
      console.log(`⚠️  Pattern deletion not fully supported: ${pattern}`);
      return 0;
    } catch (err) {
      console.error(`Redis delete pattern error for ${pattern}:`, err);
      return 0;
    }
  }

  /**
   * Generate cache key for shop
   * @param {number} shopId - Shop ID
   * @param {string} suffix - Additional suffix
   * @returns {string} - Cache key
   */
  static shopKey(shopId, suffix = '') {
    return `shop:${shopId}${suffix ? ':' + suffix : ''}`;
  }

  /**
   * Generate cache key for order
   * @param {string|number} orderNo - Order number
   * @param {string} suffix - Additional suffix
   * @returns {string} - Cache key
   */
  static orderKey(orderNo, suffix = '') {
    return `order:${orderNo}${suffix ? ':' + suffix : ''}`;
  }

  /**
   * Generate cache key for user
   * @param {number} userId - User ID
   * @param {string} suffix - Additional suffix
   * @returns {string} - Cache key
   */
  static userKey(userId, suffix = '') {
    return `user:${userId}${suffix ? ':' + suffix : ''}`;
  }

  /**
   * Generate cache key for product
   * @param {number} productId - Product ID
   * @param {string} suffix - Additional suffix
   * @returns {string} - Cache key
   */
  static productKey(productId, suffix = '') {
    return `product:${productId}${suffix ? ':' + suffix : ''}`;
  }

  /**
   * Generate cache key for category
   * @param {number} categoryId - Category ID
   * @param {string} suffix - Additional suffix
   * @returns {string} - Cache key
   */
  static categoryKey(categoryId, suffix = '') {
    return `category:${categoryId}${suffix ? ':' + suffix : ''}`;
  }

  /**
   * Generate cache key for delivery boy
   * @param {number} delvBoyId - Delivery boy ID
   * @param {string} suffix - Additional suffix
   * @returns {string} - Cache key
   */
  static deliveryBoyKey(delvBoyId, suffix = '') {
    return `deliveryboy:${delvBoyId}${suffix ? ':' + suffix : ''}`;
  }

  /**
   * Generate cache key for customer
   * @param {number} customerId - Customer ID
   * @param {string} suffix - Additional suffix
   * @returns {string} - Cache key
   */
  static customerKey(customerId, suffix = '') {
    return `customer:${customerId}${suffix ? ':' + suffix : ''}`;
  }

  /**
   * Generate cache key for notification
   * @param {number} userId - User ID
   * @param {string} suffix - Additional suffix
   * @returns {string} - Cache key
   */
  static notificationKey(userId, suffix = '') {
    return `notification:${userId}${suffix ? ':' + suffix : ''}`;
  }

  /**
   * Generate cache key for dashboard counts
   * @param {string} type - Type (shop, customer, deliveryboy)
   * @param {number} id - ID
   * @returns {string} - Cache key
   */
  static dashboardKey(type, id) {
    return `dashboard:${type}:${id}`;
  }

  /**
   * Generate cache key for list queries
   * @param {string} type - Type (shops, orders, products, etc.)
   * @param {object} params - Query parameters
   * @returns {string} - Cache key
   */
  static listKey(type, params = {}) {
    const paramStr = Object.keys(params)
      .sort()
      .map(key => `${key}:${params[key]}`)
      .join(':');
    return `list:${type}${paramStr ? ':' + paramStr : ''}`;
  }

  /**
   * Generate cache key for admin panel
   * @param {string} type - Type (dashboard, users, permissions, etc.)
   * @param {string|number} id - Optional ID
   * @param {object} params - Additional parameters
   * @returns {string} - Cache key
   */
  static adminKey(type, id = null, params = {}) {
    let key = `admin:${type}`;
    if (id !== null) {
      key += `:${id}`;
    }
    if (Object.keys(params).length > 0) {
      const paramStr = Object.keys(params)
        .sort()
        .map(k => `${k}:${params[k]}`)
        .join(':');
      key += `:${paramStr}`;
    }
    return key;
  }

  /**
   * Invalidate all admin panel caches
   * @returns {Promise<number>} - Number of keys deleted
   */
  static async invalidateAdminCache() {
    try {
      // Delete common admin cache patterns
      const patterns = [
        'admin:dashboard',
        'admin:users',
        'admin:view_users',
        'admin:set_permission',
        'admin:signUpReport',
        'admin:custNotification',
        'admin:vendorNotification',
        'admin:callLogSearch'
      ];
      
      let deleted = 0;
      for (const pattern of patterns) {
        // Note: Upstash Redis doesn't support KEYS, so we track keys manually
        // For now, we'll delete known keys
        const deletedCount = await this.delete(pattern);
        if (deletedCount) deleted++;
      }
      
      console.log(`🗑️  Invalidated admin panel caches: ${deleted} patterns`);
      return deleted;
    } catch (err) {
      console.error('Redis invalidate admin cache error:', err);
      return 0;
    }
  }

  /**
   * Invalidate B2B users cache
   * Deletes all cache keys matching the B2B users pattern
   * @returns {Promise<number>} - Number of keys deleted
   */
  static async invalidateB2BUsersCache() {
    try {
      let deleted = 0;
      
      // Delete common page/limit combinations (most common case)
      const commonLimits = [10, 20, 50, 100];
      const commonPages = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]; // Extended to cover more pages
      
      for (const limit of commonLimits) {
        for (const page of commonPages) {
          const cacheKey = this.adminKey('b2b_users', null, { page, limit });
          const result = await this.delete(cacheKey);
          if (result) deleted++;
        }
      }
      
      // Also try to delete without search parameter (most common case)
      const baseCacheKey = this.adminKey('b2b_users', null, {});
      const baseResult = await this.delete(baseCacheKey);
      if (baseResult) deleted++;
      
      // Try to delete with search parameter variations
      const searchVariations = ['', null, undefined];
      for (const search of searchVariations) {
        for (const limit of commonLimits) {
          for (const page of commonPages) {
            const cacheKey = this.adminKey('b2b_users', search, { page, limit });
            const result = await this.delete(cacheKey);
            if (result) deleted++;
          }
        }
      }
      
      console.log(`🗑️  Invalidated B2B users cache: ${deleted} keys`);
      return deleted;
    } catch (err) {
      console.error('Redis invalidate B2B users cache error:', err);
      return 0;
    }
  }

  /**
   * Invalidate B2C users cache
   * Deletes all cache keys matching the B2C users pattern
   * @returns {Promise<number>} - Number of keys deleted
   */
  static async invalidateB2CUsersCache() {
    try {
      let deleted = 0;
      
      // Delete common page/limit combinations (most common case)
      const commonLimits = [10, 20, 50, 100];
      const commonPages = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]; // Extended to cover more pages
      
      for (const limit of commonLimits) {
        for (const page of commonPages) {
          const cacheKey = this.adminKey('b2c_users', null, { page, limit });
          const result = await this.delete(cacheKey);
          if (result) deleted++;
        }
      }
      
      // Also try to delete without search parameter (most common case)
      const baseCacheKey = this.adminKey('b2c_users', null, {});
      const baseResult = await this.delete(baseCacheKey);
      if (baseResult) deleted++;
      
      // Try to delete with search parameter variations
      const searchVariations = ['', null, undefined];
      for (const search of searchVariations) {
        for (const limit of commonLimits) {
          for (const page of commonPages) {
            const cacheKey = this.adminKey('b2c_users', search, { page, limit });
            const result = await this.delete(cacheKey);
            if (result) deleted++;
          }
        }
      }
      
      console.log(`🗑️  Invalidated B2C users cache: ${deleted} keys`);
      return deleted;
    } catch (err) {
      console.error('Redis invalidate B2C users cache error:', err);
      return 0;
    }
  }

  /**
   * Invalidate cache for specific table updates
   * @param {string} tableName - Table name that was updated
   * @returns {Promise<number>} - Number of keys deleted
   */
  static async invalidateTableCache(tableName) {
    try {
      const tableCacheMap = {
        'user_admins': ['admin:users', 'admin:view_users', 'admin:set_permission', 'admin:dashboard'],
        'users': ['admin:dashboard', 'admin:users', 'admin:view_users'],
        'per_pages': ['admin:set_permission'],
        'shops': ['admin:dashboard'],
        'orders': ['admin:dashboard', 'admin:signUpReport'],
        'customer': ['admin:dashboard', 'admin:custNotification', 'admin:signUpReport'],
        'call_logs': ['admin:callLogSearch', 'admin:dashboard'],
        'packages': ['list:sub_packages'],
        'invoice': ['list:subscribers_list'],
        'admin_profile': ['admin:site_profile', 'admin:app_version'],
        'product_category': ['list:shop_categories'],
        'products': ['list:shop_items'],
        'delivery_boy': [], // Individual keys deleted in controllers
        'notifications': [], // Individual keys deleted in controllers
        'exams': [], // Individual keys deleted in controllers
        'questions': [], // Individual keys deleted in controllers
        'store_categories': [], // Individual keys deleted in controllers
        'stores': [], // Individual keys deleted in controllers
        'courses': [], // Individual keys deleted in controllers
        'course_categories': [], // Individual keys deleted in controllers
        'subjects': [], // Individual keys deleted in controllers
        'topics': [], // Individual keys deleted in controllers
        'videos': [], // Individual keys deleted in controllers
        'notes': [], // Individual keys deleted in controllers
        'audios': [], // Individual keys deleted in controllers
        'assignments': [], // Individual keys deleted in controllers
        'subschools': [], // Individual keys deleted in controllers
        'students': [] // Individual keys deleted in controllers
      };

      const keysToDelete = tableCacheMap[tableName] || [];
      let deleted = 0;
      
      for (const key of keysToDelete) {
        const result = await this.delete(key);
        if (result) deleted++;
      }

      // Also invalidate dashboard if any table is updated
      if (keysToDelete.length > 0) {
        await this.delete('admin:dashboard');
        deleted++;
      }

      console.log(`🗑️  Invalidated cache for table ${tableName}: ${deleted} keys`);
      return deleted;
    } catch (err) {
      console.error(`Redis invalidate table cache error for ${tableName}:`, err);
      return 0;
    }
  }

  /**
   * Clear all Redis cache - simplified version without bulk SCAN operations
   * @param {string} type - Optional: 'all', 'admin', 'user', 'shop', 'order', 'product', 'dashboard', 'list'
   * @returns {Promise<object>} - Result with deleted count and message
   */
  static async clearAll(type = 'all') {
    try {
      const prefixPatterns = {
        'all': [
          'admin:',
          'user:',
          'shop:',
          'order:',
          'product:',
          'category:',
          'deliveryboy:',
          'customer:',
          'notification:',
          'dashboard:',
          'list:'
        ],
        'admin': ['admin:'],
        'user': ['user:'],
        'shop': ['shop:'],
        'order': ['order:'],
        'product': ['product:', 'category:'],
        'dashboard': ['dashboard:'],
        'list': ['list:']
      };

      const prefixesToClear = prefixPatterns[type] || prefixPatterns['all'];
      let totalDeleted = 0;

      console.log(`🗑️  Cache clear requested for type: ${type}`);
      console.log(`   Prefixes to clear: ${prefixesToClear.join(', ')}`);
      console.log(`   ⚠️  Bulk SCAN operation removed - individual cache deletion only`);

      // Return success message without performing bulk operations
      // Individual cache deletions in controllers will handle cache invalidation
      return {
        success: true,
        message: `Cache clear request processed for type: ${type}. Individual cache deletions will be handled by controllers.`,
        deleted: totalDeleted,
        prefixes: prefixesToClear,
        note: 'Bulk SCAN operations removed - using individual deletions only'
      };
    } catch (err) {
      console.error('Redis clear all error:', err);
      return {
        success: false,
        message: `Failed to clear cache: ${err.message}`,
        error: err.message
      };
    }
  }
}

module.exports = RedisCache;

