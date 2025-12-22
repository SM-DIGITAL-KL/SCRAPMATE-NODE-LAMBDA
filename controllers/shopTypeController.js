const Shop = require('../models/Shop');
const User = require('../models/User');
const V2ShopTypeService = require('../services/shop/v2ShopTypeService');
const RedisCache = require('../utils/redisCache');

/**
 * Shop Types:
 * 1 - Industrial (B2B)
 * 2 - Door Step Buyer (Delivery Partner - cannot login as B2B/B2C)
 * 3 - Retailer (B2C)
 * 4 - Wholesaler (B2B)
 */

/**
 * Get all shop types
 * GET /api/v2/shop-types
 */
exports.getShopTypes = async (req, res) => {
  try {
    // Check Redis cache first
    const cacheKey = RedisCache.listKey('shop_types');
    console.log(`🔍 [getShopTypes] Checking cache with key: ${cacheKey}`);
    try {
      const cached = await RedisCache.get(cacheKey);
      console.log(`🔍 [getShopTypes] Cache check result:`, {
        found: cached !== null && cached !== undefined,
        type: typeof cached,
        isArray: Array.isArray(cached),
        length: Array.isArray(cached) ? cached.length : 'N/A'
      });
      if (cached !== null && cached !== undefined) {
        console.log('⚡ Shop types cache hit');
        return res.status(200).json({
          success: true,
          message: 'Shop types retrieved successfully',
          data: cached,
          hitBy: 'Redis'
        });
      } else {
        console.log('💾 Shop types cache miss');
      }
    } catch (err) {
      console.error('❌ Redis get error:', err);
      console.error('   Error stack:', err.stack);
    }

    const shopTypes = V2ShopTypeService.getShopTypes();
    console.log(`📊 [getShopTypes] Fetched from service:`, {
      type: typeof shopTypes,
      isArray: Array.isArray(shopTypes),
      length: Array.isArray(shopTypes) ? shopTypes.length : 'N/A'
    });

    // Cache the result (static data, cache for 30 days)
    try {
      const setResult = await RedisCache.set(cacheKey, shopTypes, '30days');
      console.log(`💾 Shop types cached: ${setResult ? 'Success' : 'Failed'}`);
    } catch (err) {
      console.error('❌ Redis cache set error:', err);
      console.error('   Error stack:', err.stack);
    }

    return res.status(200).json({
      success: true,
      message: 'Shop types retrieved successfully',
      data: shopTypes,
      hitBy: 'DynamoDB'
    });
  } catch (error) {
    console.error('Error getting shop types:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve shop types',
      error: error.message
    });
  }
};

/**
 * Get user's allowed dashboards based on shop type
 * GET /api/v2/user/dashboards/:userId
 */
exports.getUserDashboards = async (req, res) => {
  try {
    const { userId } = req.params;

    if (!userId) {
      return res.status(400).json({
        success: false,
        message: 'User ID is required'
      });
    }

    const userIdNum = parseInt(userId);

    // Check Redis cache first
    const cacheKey = RedisCache.userKey(userIdNum, 'dashboards');
    try {
      const cached = await RedisCache.get(cacheKey);
      if (cached !== null && cached !== undefined) {
        console.log('⚡ User dashboards cache hit');
        return res.status(200).json({
          success: true,
          message: 'User dashboards retrieved successfully',
          data: {
            userId: userIdNum,
            ...cached
          },
          hitBy: 'Redis'
        });
      }
    } catch (err) {
      console.error('Redis get error:', err);
    }

    const result = await V2ShopTypeService.getUserDashboards(userIdNum);

    // Cache the result (cache for 5 minutes - dashboard data)
    try {
      await RedisCache.set(cacheKey, result, 'dashboard');
      console.log('💾 User dashboards cached');
    } catch (err) {
      console.error('Redis cache set error:', err);
    }

    return res.status(200).json({
      success: true,
      message: 'User dashboards retrieved successfully',
      data: {
        userId: userIdNum,
        ...result
      },
      hitBy: 'DynamoDB'
    });
  } catch (error) {
    console.error('Error getting user dashboards:', error);
    const statusCode = error.message === 'User not found' ? 404 : 500;
    return res.status(statusCode).json({
      success: false,
      message: error.message || 'Failed to retrieve user dashboards',
      error: error.message
    });
  }
};

/**
 * Validate if user can access a specific dashboard
 * POST /api/v2/user/validate-dashboard
 * Body: { userId, dashboardType }
 */
exports.validateDashboard = async (req, res) => {
  try {
    const { userId, dashboardType } = req.body;

    if (!userId || !dashboardType) {
      return res.status(400).json({
        success: false,
        message: 'User ID and dashboard type are required'
      });
    }

    const result = await V2ShopTypeService.validateDashboard(parseInt(userId), dashboardType);

    return res.status(200).json({
      success: true,
      message: result.canAccess ? 'User can access this dashboard' : 'User cannot access this dashboard',
      data: result
    });
  } catch (error) {
    console.error('Error validating dashboard:', error);
    const statusCode = error.message === 'User not found' ? 404 : 500;
    return res.status(statusCode).json({
      success: false,
      message: error.message || 'Failed to validate dashboard access',
      error: error.message
    });
  }
};

/**
 * Switch user's current dashboard
 * POST /api/v2/user/switch-dashboard
 * Body: { userId, targetDashboard }
 */
exports.switchDashboard = async (req, res) => {
  try {
    const { userId, targetDashboard } = req.body;

    if (!userId || !targetDashboard) {
      return res.status(400).json({
        success: false,
        message: 'User ID and target dashboard are required'
      });
    }

    // Validate dashboard type
    const validDashboards = ['b2b', 'b2c', 'delivery'];
    if (!validDashboards.includes(targetDashboard.toLowerCase())) {
      return res.status(400).json({
        success: false,
        message: 'Invalid dashboard type. Must be one of: b2b, b2c, delivery'
      });
    }

    const result = await V2ShopTypeService.switchDashboard(parseInt(userId), targetDashboard);

    if (!result.success) {
      return res.status(403).json({
        success: false,
        message: result.message,
        data: result.data
      });
    }

    // Invalidate v2 API caches
    try {
      await RedisCache.invalidateV2ApiCache('profile', parseInt(userId));
      // Invalidate user dashboards cache
      await RedisCache.delete(RedisCache.userKey(parseInt(userId), 'dashboards'));
      console.log(`🗑️  Invalidated v2 user dashboards cache for user ${userId} (dashboard switched)`);
    } catch (err) {
      console.error('Cache invalidation error:', err);
    }

    return res.status(200).json({
      success: true,
      message: result.message,
      data: {
        userId: parseInt(userId),
        ...result.data
      }
    });
  } catch (error) {
    console.error('Error switching dashboard:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to switch dashboard',
      error: error.message
    });
  }
};

/**
 * Helper function to get shop type name
 * @deprecated Use V2ShopTypeService.getShopTypeName() instead
 */
function getShopTypeName(shopType) {
  return V2ShopTypeService.getShopTypeName(shopType);
}

