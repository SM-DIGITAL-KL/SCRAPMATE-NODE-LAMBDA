/**
 * V2 Dashboard Statistics Controller
 * Handles HTTP requests for dashboard statistics (total recycled, carbon offset, total order value, operating categories)
 * Supports 365-day cache with incremental updates
 */

const Order = require('../models/Order');
const User = require('../models/User');
const Shop = require('../models/Shop');
const RedisCache = require('../utils/redisCache');

// Carbon offset factors in kg CO2 per kg of material (same as recycling controller)
const CARBON_OFFSET_FACTORS = {
  1: 2.5,  // Metal
  2: 1.8,  // Plastic
  3: 1.2,  // Paper
  4: 3.5,  // E-Waste
  5: 0.8,  // Organic
  6: 0.6,  // Glass
  7: 2.2,  // Automotive
  8: 1.5,  // Construction
  default: 1.5
};

/**
 * Calculate carbon offset for a given weight and category
 */
function calculateCarbonOffset(weightKg, categoryId) {
  const factor = CARBON_OFFSET_FACTORS[categoryId] || CARBON_OFFSET_FACTORS.default;
  return weightKg * factor;
}

/**
 * Parse order details to extract category and weight information
 */
function parseOrderDetails(orderdetails) {
  try {
    const details = typeof orderdetails === 'string' ? JSON.parse(orderdetails) : orderdetails;
    const items = [];
    
    if (Array.isArray(details)) {
      return details;
    } else if (typeof details === 'object') {
      for (const [categoryId, subcategoryItems] of Object.entries(details)) {
        if (Array.isArray(subcategoryItems)) {
          subcategoryItems.forEach(item => {
            items.push({
              category_id: parseInt(categoryId),
              ...item
            });
          });
        }
      }
      return items;
    }
    
    return [];
  } catch (error) {
    console.error('Error parsing orderdetails:', error);
    return [];
  }
}

/**
 * Get dashboard statistics for a user
 * GET /api/v2/stats/dashboard?userType=customer|b2c|b2b|delivery&userId=123
 */
class V2StatsController {
  static async getDashboardStats(req, res) {
    try {
      const { userType = 'customer', userId } = req.query;
      
      if (!userId) {
        return res.status(400).json({
          status: 'error',
          msg: 'User ID is required',
          data: null,
        });
      }

      const userIdNum = parseInt(userId);
      const sixMonthsAgo = new Date();
      sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

      // Check Redis cache first (365-day cache)
      const cacheKey = `dashboard_stats_${userType}_${userIdNum}`;
      try {
        const cached = await RedisCache.get(cacheKey);
        if (cached !== null && cached !== undefined) {
          console.log('⚡ Dashboard stats cache hit');
          return res.json({
            status: 'success',
            msg: 'Dashboard stats retrieved successfully',
            data: cached,
            meta: {
              lastUpdatedOn: cached.lastUpdatedOn,
              hasUpdates: false,
            },
            hitBy: 'Redis'
          });
        }
      } catch (err) {
        console.error('Redis get error:', err);
      }

      let totalRecycled = 0; // Total weight recycled in kg
      let carbonOffset = 0; // Total carbon offset in kg CO2
      let totalOrderValue = 0; // Total order value for last 6 months in rupees
      let operatingCategories = 0; // Number of scrap categories operating

      // Get user to find operating categories
      const user = await User.findById(userIdNum);
      if (user && user.operating_categories && Array.isArray(user.operating_categories)) {
        operatingCategories = user.operating_categories.length;
      }

      // Get orders based on userType
      let orders = [];
      if (userType === 'customer') {
        // Customer orders (status 5 = completed)
        const allOrders = await Order.findByCustomerId(userIdNum);
        orders = allOrders.filter(order => {
          const orderDate = new Date(order.created_at || order.createdAt || order.date);
          return order.status === 5 && orderDate >= sixMonthsAgo;
        });
      } else if (userType === 'b2c' || userType === 'b2b') {
        // B2C/B2B vendor orders - find shop first
        const shop = await Shop.findByUserId(userIdNum);
        if (shop && shop.id) {
          const shopId = parseInt(shop.id);
          const allOrders = await Order.findByShopId(shopId);
          orders = allOrders.filter(order => {
            const orderDate = new Date(order.created_at || order.createdAt || order.date);
            return (order.status === 4 || order.status === 5) && orderDate >= sixMonthsAgo;
          });
        }
      } else if (userType === 'delivery') {
        // Delivery orders (status 5 = completed)
        const allOrders = await Order.findByDeliveryBoyId(userIdNum);
        orders = allOrders.filter(order => {
          const orderDate = new Date(order.created_at || order.createdAt || order.date);
          return order.status === 5 && orderDate >= sixMonthsAgo;
        });
      }

      // Calculate total recycled weight and carbon offset
      for (const order of orders) {
        // Calculate order value (use estim_price or actual_price)
        const orderPrice = parseFloat(order.estim_price || order.actual_price || order.price || 0);
        totalOrderValue += orderPrice;

        // Parse order details to get weights
        const orderDetails = parseOrderDetails(order.orderdetails);
        
        if (orderDetails && orderDetails.length > 0) {
          // Use orderdetails if available
          for (const item of orderDetails) {
            const categoryId = item.category_id || item.main_category_id;
            // Use actual_weight if available, otherwise use quantity or estim_weight
            const itemWeight = parseFloat(
              item.actual_weight || 
              item.quantity || 
              item.estim_weight || 
              order.estim_weight || 
              0
            );
            
            if (itemWeight > 0 && categoryId) {
              totalRecycled += itemWeight;
              const itemCarbonOffset = calculateCarbonOffset(itemWeight, categoryId);
              carbonOffset += itemCarbonOffset;
            }
          }
        } else {
          // Fallback: use order-level weight
          const orderWeight = parseFloat(order.actual_weight || order.estim_weight || 0);
          if (orderWeight > 0) {
            // Try to get category from order or default to 1 (Metal)
            const categoryId = order.category_id || 1;
            totalRecycled += orderWeight;
            const orderCarbonOffset = calculateCarbonOffset(orderWeight, categoryId);
            carbonOffset += orderCarbonOffset;
          }
        }
      }

      // Round to 2 decimal places
      totalRecycled = parseFloat(totalRecycled.toFixed(2));
      carbonOffset = parseFloat(carbonOffset.toFixed(2));
      totalOrderValue = parseFloat(totalOrderValue.toFixed(2));

      const stats = {
        totalRecycled,
        carbonOffset,
        totalOrderValue,
        operatingCategories,
        lastUpdatedOn: new Date().toISOString(),
      };

      // Cache for 365 days
      try {
        await RedisCache.set(cacheKey, stats, '365days');
      } catch (err) {
        console.error('Redis set error:', err);
      }

      return res.json({
        status: 'success',
        msg: 'Dashboard stats retrieved successfully',
        data: stats,
        meta: {
          lastUpdatedOn: stats.lastUpdatedOn,
          hasUpdates: false,
        },
        hitBy: 'DynamoDB'
      });
    } catch (error) {
      console.error('Error getting dashboard stats:', error);
      return res.status(500).json({
        status: 'error',
        msg: error.message || 'Failed to fetch dashboard stats',
        data: null,
      });
    }
  }

  /**
   * Get incremental stats updates
   * GET /api/v2/stats/incremental-updates?userType=customer|b2c|b2b|delivery&userId=123&lastUpdatedOn=ISO_TIMESTAMP
   */
  static async getIncrementalStatsUpdates(req, res) {
    try {
      const { userType = 'customer', userId, lastUpdatedOn } = req.query;
      
      if (!userId) {
        return res.status(400).json({
          status: 'error',
          msg: 'User ID is required',
          data: null,
        });
      }

      if (!lastUpdatedOn) {
        return res.status(400).json({
          status: 'error',
          msg: 'lastUpdatedOn is required for incremental updates',
          data: null,
        });
      }

      const userIdNum = parseInt(userId);
      const lastUpdatedDate = new Date(lastUpdatedOn);
      const sixMonthsAgo = new Date();
      sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

      // Get cached stats to compare
      const cacheKey = `dashboard_stats_${userType}_${userIdNum}`;
      let cachedStats = null;
      try {
        cachedStats = await RedisCache.get(cacheKey);
      } catch (err) {
        console.error('Redis get error:', err);
      }

      // Get orders updated since lastUpdatedOn
      let orders = [];
      if (userType === 'customer') {
        const allOrders = await Order.findByCustomerId(userIdNum);
        orders = allOrders.filter(order => {
          const orderDate = new Date(order.created_at || order.createdAt || order.date);
          const updatedDate = new Date(order.updated_at || order.updatedAt || orderDate);
          return order.status === 5 && 
                 orderDate >= sixMonthsAgo && 
                 updatedDate > lastUpdatedDate;
        });
      } else if (userType === 'b2c' || userType === 'b2b') {
        const shop = await Shop.findByUserId(userIdNum);
        if (shop && shop.id) {
          const shopId = parseInt(shop.id);
          const allOrders = await Order.findByShopId(shopId);
          orders = allOrders.filter(order => {
            const orderDate = new Date(order.created_at || order.createdAt || order.date);
            const updatedDate = new Date(order.updated_at || order.updatedAt || orderDate);
            return (order.status === 4 || order.status === 5) && 
                   orderDate >= sixMonthsAgo && 
                   updatedDate > lastUpdatedDate;
          });
        }
      } else if (userType === 'delivery') {
        const allOrders = await Order.findByDeliveryBoyId(userIdNum);
        orders = allOrders.filter(order => {
          const orderDate = new Date(order.created_at || order.createdAt || order.date);
          const updatedDate = new Date(order.updated_at || order.updatedAt || orderDate);
          return order.status === 5 && 
                 orderDate >= sixMonthsAgo && 
                 updatedDate > lastUpdatedDate;
        });
      }

      // Check if user's operating categories changed
      const user = await User.findById(userIdNum);
      let operatingCategoriesChanged = false;
      let newOperatingCategories = 0;
      if (user && user.operating_categories && Array.isArray(user.operating_categories)) {
        newOperatingCategories = user.operating_categories.length;
        if (cachedStats && cachedStats.operatingCategories !== newOperatingCategories) {
          operatingCategoriesChanged = true;
        }
      }

      // If no new orders and no category changes, return no updates
      if (orders.length === 0 && !operatingCategoriesChanged) {
        return res.json({
          status: 'success',
          msg: 'No incremental updates found',
          data: {},
          meta: {
            hasUpdates: false,
            lastUpdatedOn: lastUpdatedOn,
          },
        });
      }

      // Calculate incremental changes
      let incrementalRecycled = 0;
      let incrementalCarbonOffset = 0;
      let incrementalOrderValue = 0;

      for (const order of orders) {
        const orderPrice = parseFloat(order.estim_price || order.actual_price || order.price || 0);
        incrementalOrderValue += orderPrice;

        const orderDetails = parseOrderDetails(order.orderdetails);
        
        if (orderDetails && orderDetails.length > 0) {
          for (const item of orderDetails) {
            const categoryId = item.category_id || item.main_category_id;
            const itemWeight = parseFloat(
              item.actual_weight || 
              item.quantity || 
              item.estim_weight || 
              order.estim_weight || 
              0
            );
            
            if (itemWeight > 0 && categoryId) {
              incrementalRecycled += itemWeight;
              incrementalCarbonOffset += calculateCarbonOffset(itemWeight, categoryId);
            }
          }
        } else {
          const orderWeight = parseFloat(order.actual_weight || order.estim_weight || 0);
          if (orderWeight > 0) {
            const categoryId = order.category_id || 1;
            incrementalRecycled += orderWeight;
            incrementalCarbonOffset += calculateCarbonOffset(orderWeight, categoryId);
          }
        }
      }

      const updates = {
        lastUpdatedOn: new Date().toISOString(),
      };

      // Only include fields that changed
      if (incrementalRecycled > 0) {
        updates.totalRecycled = parseFloat(incrementalRecycled.toFixed(2));
      }
      if (incrementalCarbonOffset > 0) {
        updates.carbonOffset = parseFloat(incrementalCarbonOffset.toFixed(2));
      }
      if (incrementalOrderValue > 0) {
        updates.totalOrderValue = parseFloat(incrementalOrderValue.toFixed(2));
      }
      if (operatingCategoriesChanged) {
        updates.operatingCategories = newOperatingCategories;
      }

      return res.json({
        status: 'success',
        msg: 'Incremental updates retrieved successfully',
        data: updates,
        meta: {
          hasUpdates: true,
          lastUpdatedOn: updates.lastUpdatedOn,
        },
      });
    } catch (error) {
      console.error('Error getting incremental stats updates:', error);
      return res.status(500).json({
        status: 'error',
        msg: error.message || 'Failed to fetch incremental stats updates',
        data: null,
      });
    }
  }
}

module.exports = V2StatsController;
