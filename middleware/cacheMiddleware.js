/**
 * Cache Middleware for API Routes
 * - GET requests: Check cache first, cache response for 365 days
 * - POST/PUT/DELETE requests: Invalidate related cache after successful operations
 */

const RedisCache = require('../utils/redisCache');

// 365 days in seconds
const CACHE_TTL_365_DAYS = 365 * 24 * 60 * 60; // 31536000 seconds

/**
 * Generate cache key from request
 * @param {object} req - Express request object
 * @returns {string} - Cache key
 */
function generateCacheKey(req) {
  const method = req.method;
  const path = req.path;
  const query = req.query;
  const params = req.params;
  
  // Normalize path (remove /api prefix if present)
  let normalizedPath = path.replace(/^\/api/, '');
  if (!normalizedPath.startsWith('/')) {
    normalizedPath = '/' + normalizedPath;
  }
  
  // Build key from method, path, and parameters
  let key = `api:${method.toLowerCase()}:${normalizedPath}`;
  
  // Add query parameters if any
  if (Object.keys(query).length > 0) {
    const queryStr = Object.keys(query)
      .sort()
      .map(k => `${k}:${String(query[k]).replace(/:/g, '_')}`)
      .join(':');
    key += `:q:${queryStr}`;
  }
  
  // Add path parameters if any
  if (Object.keys(params).length > 0) {
    const paramsStr = Object.keys(params)
      .sort()
      .map(k => `${k}:${String(params[k]).replace(/:/g, '_')}`)
      .join(':');
    key += `:p:${paramsStr}`;
  }
  
  return key;
}

/**
 * Get cache key for table-based invalidation
 * @param {string} tableName - Table name
 * @param {object} identifiers - Object with id fields (e.g., {shop_id: 123, user_id: 456})
 * @returns {Array<string>} - Array of cache keys to invalidate
 */
function getTableCacheKeys(tableName, identifiers = {}) {
  const keys = [];
  
  // Table-specific cache keys
  const tableKeyMap = {
    'users': (id) => [
      RedisCache.userKey(id),
      RedisCache.userKey(id, 'profile'),
      RedisCache.listKey('users'),
      RedisCache.dashboardKey('user', id)
    ],
    'shops': (id) => [
      RedisCache.shopKey(id),
      RedisCache.shopKey(id, 'images'),
      RedisCache.shopKey(id, 'categories'),
      RedisCache.shopKey(id, 'orders'),
      RedisCache.listKey('shops'),
      RedisCache.dashboardKey('shop', id)
    ],
    'products': (id) => [
      RedisCache.productKey(id),
      RedisCache.listKey('products'),
      RedisCache.listKey('shop_items', identifiers)
    ],
    'product_category': (id) => [
      RedisCache.categoryKey(id),
      RedisCache.listKey('shop_categories', identifiers),
      RedisCache.listKey('all_categories')
    ],
    'orders': (id) => [
      RedisCache.orderKey(id),
      RedisCache.listKey('orders'),
      RedisCache.listKey('customer_orders', identifiers),
      RedisCache.listKey('shop_orders', identifiers),
      RedisCache.dashboardKey('order', id)
    ],
    'delivery_boy': (id) => [
      RedisCache.deliveryBoyKey(id),
      RedisCache.listKey('delivery_boys'),
      RedisCache.dashboardKey('deliveryboy', id)
    ],
    'customer': (id) => [
      RedisCache.customerKey(id),
      RedisCache.listKey('customers'),
      RedisCache.dashboardKey('customer', id)
    ],
    'notifications': (id) => [
      RedisCache.notificationKey(id),
      RedisCache.listKey('notifications', identifiers)
    ]
  };
  
  // Get keys for specific ID
  if (identifiers.id || identifiers[`${tableName}_id`]) {
    const id = identifiers.id || identifiers[`${tableName}_id`];
    const keyGenerator = tableKeyMap[tableName];
    if (keyGenerator) {
      keys.push(...keyGenerator(id));
    }
  }
  
  // Add general list keys
  keys.push(RedisCache.listKey(tableName));
  
  // Add dashboard keys if applicable
  if (identifiers.shop_id) {
    keys.push(RedisCache.dashboardKey('shop', identifiers.shop_id));
  }
  if (identifiers.user_id || identifiers.customer_id) {
    const userId = identifiers.user_id || identifiers.customer_id;
    keys.push(RedisCache.dashboardKey('user', userId));
    keys.push(RedisCache.dashboardKey('customer', userId));
  }
  
  return [...new Set(keys)]; // Remove duplicates
}

/**
 * Middleware to handle GET requests with cache (365 days)
 * This middleware intercepts GET requests, checks cache first,
 * and caches successful responses for 365 days
 */
async function cacheGetMiddleware(req, res, next) {
  // Only process GET requests
  if (req.method !== 'GET') {
    return next();
  }
  
  // Skip cache for certain paths (e.g., health checks, metrics)
  const skipCachePaths = ['/health', '/api/health', '/metrics', '/api/metrics'];
  if (skipCachePaths.some(path => req.path === path || req.originalUrl === path)) {
    return next();
  }
  
  try {
    const cacheKey = generateCacheKey(req);
    const cached = await RedisCache.get(cacheKey);
    
    if (cached !== null && cached !== undefined) {
      console.log(`⚡ Cache hit (365 days): ${cacheKey}`);
      return res.json(cached);
    }
    
    console.log(`💾 Cache miss: ${cacheKey}`);
    
    // Store original json method
    const originalJson = res.json.bind(res);
    
    // Override res.json to cache the response
    res.json = function(data) {
      // Cache successful responses only (status: 'success' or HTTP 200)
      const isSuccess = data && (
        data.status === 'success' || 
        res.statusCode === 200 || 
        (res.statusCode >= 200 && res.statusCode < 300)
      );
      
      if (isSuccess) {
        // Cache for 365 days
        RedisCache.set(cacheKey, data, CACHE_TTL_365_DAYS).catch(err => {
          console.error(`❌ Failed to cache response for ${cacheKey}:`, err.message);
        });
      }
      
      return originalJson(data);
    };
    
    next();
  } catch (err) {
    console.error('❌ Cache middleware error:', err);
    next(); // Continue even if cache fails
  }
}

/**
 * Helper function to invalidate API route cache keys for a given path pattern
 * This invalidates all GET requests that match the pattern
 * @param {string} pathPattern - Path pattern to match (e.g., '/api/shops', '/api/products')
 */
async function invalidateApiRouteCache(pathPattern) {
  try {
    // Since we can't scan Redis keys, we'll invalidate common patterns
    // Controllers should handle specific cache invalidation
    // This is a fallback for route-level cache
    console.log(`🗑️  Route cache invalidation requested for: ${pathPattern}`);
    // Note: Actual invalidation is handled by controllers using RedisCache.delete()
    // This function is a placeholder for future pattern-based invalidation
  } catch (err) {
    console.error(`Route cache invalidation error for ${pathPattern}:`, err);
  }
}

/**
 * Middleware to invalidate cache on POST/PUT/DELETE
 * @param {string} tableName - Table name that will be affected
 * @param {function} getIdentifiers - Function to extract identifiers from request
 */
function cacheInvalidateMiddleware(tableName, getIdentifiers = null) {
  return async (req, res, next) => {
    if (!['POST', 'PUT', 'DELETE', 'PATCH'].includes(req.method)) {
      return next();
    }
    
    // Store original json method
    const originalJson = res.json.bind(res);
    
    // Override res.json to invalidate cache after successful response
    res.json = function(data) {
      // Only invalidate on success
      if (data && (data.status === 'success' || res.statusCode === 200 || res.statusCode === 201)) {
        // Get identifiers from request
        const identifiers = getIdentifiers ? getIdentifiers(req) : {
          id: req.params.id || req.body.id,
          ...req.params,
          ...req.body
        };
        
        // Get cache keys to invalidate
        const keysToInvalidate = getTableCacheKeys(tableName, identifiers);
        
        // Also invalidate the current route's GET cache
        const routeCacheKey = generateCacheKey({ ...req, method: 'GET' });
        keysToInvalidate.push(routeCacheKey);
        
        // Invalidate all related cache keys
        Promise.all(keysToInvalidate.map(key => RedisCache.delete(key)))
          .then(results => {
            const deletedCount = results.filter(r => r).length;
            console.log(`🗑️  Invalidated ${deletedCount} cache keys for table: ${tableName}`);
          })
          .catch(err => {
            console.error(`Cache invalidation error for ${tableName}:`, err);
          });
      }
      
      return originalJson(data);
    };
    
    next();
  };
}

module.exports = {
  cacheGetMiddleware,
  cacheInvalidateMiddleware,
  invalidateApiRouteCache,
  generateCacheKey,
  getTableCacheKeys,
  CACHE_TTL_365_DAYS
};

