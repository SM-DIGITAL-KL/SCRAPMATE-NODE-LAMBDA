/**
 * V2 Recycling Statistics Controller
 * Handles HTTP requests for recycling statistics (recycled count, carbon offset)
 */

const Order = require('../models/Order');
const CategoryImgKeywords = require('../models/CategoryImgKeywords');
const RedisCache = require('../utils/redisCache');

// Carbon offset factors in kg CO2 per kg of material (industry standard estimates)
const CARBON_OFFSET_FACTORS = {
  1: 2.5,  // Metal - high recycling value
  2: 1.8,  // Plastic - moderate recycling value
  3: 1.2,  // Paper - good recycling value
  4: 3.5,  // E-Waste - high environmental impact
  5: 0.8,  // Organic - compost, lower carbon offset
  6: 0.6,  // Glass - lower carbon offset
  7: 2.2,  // Automotive - metal-based, high value
  8: 1.5,  // Construction - mixed materials
  // Default factor for unknown categories
  default: 1.5
};

/**
 * Parse order details to extract category and weight information
 */
function parseOrderDetails(orderdetails) {
  try {
    const details = typeof orderdetails === 'string' ? JSON.parse(orderdetails) : orderdetails;
    const items = [];
    
    // Handle different orderdetails formats
    if (Array.isArray(details)) {
      // Format: [{ category_id, subcategory_id, quantity, ... }]
      return details;
    } else if (typeof details === 'object') {
      // Format: { "category_id": [{ subcategory_id, quantity, ... }] }
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
 * Calculate carbon offset for a given weight and category
 */
function calculateCarbonOffset(weightKg, categoryId) {
  const factor = CARBON_OFFSET_FACTORS[categoryId] || CARBON_OFFSET_FACTORS.default;
  return parseFloat((weightKg * factor).toFixed(2));
}

/**
 * Calculate recycling statistics for a user (customer, shop, or delivery boy)
 */
class V2RecyclingController {
  /**
   * GET /api/v2/recycling/stats/:userId
   * Get recycling statistics for a user (customer, shop, or delivery boy)
   * Query params: ?type=customer|shop|delivery
   */
  static async getRecyclingStats(req, res) {
    try {
      const { userId } = req.params;
      const { type = 'customer' } = req.query; // customer, shop, or delivery

      if (!userId) {
        return res.status(400).json({
          status: 'error',
          msg: 'User ID is required',
          data: null,
        });
      }

      const userIdNum = parseInt(userId);

      // Check Redis cache first
      const cacheKey = RedisCache.userKey(userIdNum, `recycling_stats_${type}`);
      try {
        const cached = await RedisCache.get(cacheKey);
        if (cached !== null && cached !== undefined) {
          console.log('⚡ Recycling stats cache hit');
          return res.json({
            status: 'success',
            msg: 'Recycling statistics retrieved successfully',
            data: cached,
            hitBy: 'Redis'
          });
        }
      } catch (err) {
        console.error('Redis get error:', err);
      }

      // Get completed orders based on type
      let completedOrders = [];
      if (type === 'customer') {
        const allOrders = await Order.findByCustomerId(userIdNum);
        completedOrders = allOrders.filter(order => order.status === 4);
      } else if (type === 'shop') {
        const allOrders = await Order.findByShopId(userIdNum);
        completedOrders = allOrders.filter(order => order.status === 4);
      } else if (type === 'delivery') {
        completedOrders = await Order.findCompletedByDeliveryBoyId(userIdNum);
      } else {
        return res.status(400).json({
          status: 'error',
          msg: 'Invalid type. Must be customer, shop, or delivery',
          data: null,
        });
      }

      // Calculate statistics
      let totalRecycledWeight = 0; // in kg
      let totalCarbonOffset = 0; // in kg CO2
      let orderCount = completedOrders.length;
      const categoryBreakdown = {}; // { categoryId: { weight, carbonOffset, count } }

      for (const order of completedOrders) {
        // Get weight from order (estim_weight is in kg)
        const orderWeight = parseFloat(order.estim_weight || order.quantity || 0);
        
        // Parse order details to get category information
        const orderItems = parseOrderDetails(order.orderdetails || order.order_details);
        
        if (orderItems.length > 0) {
          // Calculate per category if we have detailed items
          for (const item of orderItems) {
            const categoryId = parseInt(item.category_id || item.main_category_id || 0);
            const itemWeight = parseFloat(item.quantity || item.weight || orderWeight / orderItems.length);
            
            if (categoryId > 0) {
              const carbonOffset = calculateCarbonOffset(itemWeight, categoryId);
              
              if (!categoryBreakdown[categoryId]) {
                categoryBreakdown[categoryId] = {
                  category_id: categoryId,
                  weight: 0,
                  carbon_offset: 0,
                  order_count: 0
                };
              }
              
              categoryBreakdown[categoryId].weight += itemWeight;
              categoryBreakdown[categoryId].carbon_offset += carbonOffset;
              categoryBreakdown[categoryId].order_count += 1;
              
              totalRecycledWeight += itemWeight;
              totalCarbonOffset += carbonOffset;
            }
          }
        } else {
          // Fallback: use order weight if we can't parse details
          // Try to guess category from order or use default
          const categoryId = parseInt(order.category_id || order.main_category_id || 1);
          const carbonOffset = calculateCarbonOffset(orderWeight, categoryId);
          
          if (!categoryBreakdown[categoryId]) {
            categoryBreakdown[categoryId] = {
              category_id: categoryId,
              weight: 0,
              carbon_offset: 0,
              order_count: 0
            };
          }
          
          categoryBreakdown[categoryId].weight += orderWeight;
          categoryBreakdown[categoryId].carbon_offset += carbonOffset;
          categoryBreakdown[categoryId].order_count += 1;
          
          totalRecycledWeight += orderWeight;
          totalCarbonOffset += carbonOffset;
        }
      }

      // Get category names for breakdown
      const categoryBreakdownWithNames = await Promise.all(
        Object.values(categoryBreakdown).map(async (cat) => {
          try {
            const category = await CategoryImgKeywords.findById(cat.category_id);
            return {
              ...cat,
              category_name: category?.category_name || category?.cat_name || `Category ${cat.category_id}`,
              weight: parseFloat(cat.weight.toFixed(2)),
              carbon_offset: parseFloat(cat.carbon_offset.toFixed(2))
            };
          } catch (error) {
            // Fallback category names based on common IDs
            const categoryNames = {
              1: 'Metal',
              2: 'Plastic',
              3: 'Paper',
              4: 'E-Waste',
              5: 'Organic',
              6: 'Glass',
              7: 'Automotive',
              8: 'Construction'
            };
            return {
              ...cat,
              category_name: categoryNames[cat.category_id] || `Category ${cat.category_id}`,
              weight: parseFloat(cat.weight.toFixed(2)),
              carbon_offset: parseFloat(cat.carbon_offset.toFixed(2))
            };
          }
        })
      );

      const stats = {
        user_id: userIdNum,
        user_type: type,
        total_recycled_weight_kg: parseFloat(totalRecycledWeight.toFixed(2)),
        total_carbon_offset_kg: parseFloat(totalCarbonOffset.toFixed(2)),
        total_orders_completed: orderCount,
        category_breakdown: categoryBreakdownWithNames,
        // Additional metrics
        trees_equivalent: parseFloat((totalCarbonOffset / 20).toFixed(2)), // ~20 kg CO2 = 1 tree per year
        cars_off_road_days: parseFloat((totalCarbonOffset / 4.6).toFixed(2)) // ~4.6 kg CO2 per day for average car
      };

      // Cache the result (cache for 30 minutes - stats can change with new orders)
      try {
        await RedisCache.set(cacheKey, stats, 'long');
        console.log('💾 Recycling stats cached');
      } catch (err) {
        console.error('Redis cache set error:', err);
      }

      return res.json({
        status: 'success',
        msg: 'Recycling statistics retrieved successfully',
        data: stats,
        hitBy: 'DynamoDB'
      });
    } catch (error) {
      console.error('V2RecyclingController.getRecyclingStats error:', error);
      return res.status(500).json({
        status: 'error',
        msg: 'Failed to retrieve recycling statistics',
        data: null,
      });
    }
  }
}

module.exports = V2RecyclingController;
