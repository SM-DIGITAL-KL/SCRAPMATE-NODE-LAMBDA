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
        // For shop type, first find the shop_id from user_id
        const Shop = require('../models/Shop');
        const shop = await Shop.findByUserId(userIdNum);
        if (!shop || !shop.id) {
          // No shop found for this user, return empty stats
          return res.json({
            status: 'success',
            msg: 'Recycling statistics retrieved successfully',
            data: {
              user_id: userIdNum,
              user_type: type,
              total_recycled_weight_kg: 0,
              total_carbon_offset_kg: 0,
              total_orders_completed: 0,
              category_breakdown: [],
              trees_equivalent: 0,
              cars_off_road_days: 0
            },
            hitBy: 'DynamoDB'
          });
        }
        const shopId = parseInt(shop.id);
        const allOrders = await Order.findByShopId(shopId);
        completedOrders = allOrders.filter(order => order.status === 5); // Status 5 = Completed for B2C vendors
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
      const monthlyBreakdown = {}; // { monthKey: { weight, carbonOffset, orderCount } }

      // Initialize current year months for monthly breakdown
      const currentYear = new Date().getFullYear();
      const months = ['January', 'February', 'March', 'April', 'May', 'June', 
                     'July', 'August', 'September', 'October', 'November', 'December'];
      
      for (let i = 1; i <= 12; i++) {
        const monthKey = `${currentYear}-${String(i).padStart(2, '0')}`;
        monthlyBreakdown[monthKey] = {
          month: i,
          monthName: months[i - 1],
          year: currentYear,
          weight: 0,
          carbon_offset: 0,
          order_count: 0
        };
      }

      // Helper function to get month from date
      const getMonthFromDate = (dateString) => {
        try {
          const date = new Date(dateString);
          return {
            year: date.getFullYear(),
            month: date.getMonth() + 1,
            monthKey: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
          };
        } catch (error) {
          return null;
        }
      };

      for (const order of completedOrders) {
        // Get order date for monthly breakdown
        const orderDate = order.date || order.created_at || order.updated_at;
        const monthInfo = getMonthFromDate(orderDate);
        const monthKey = monthInfo && monthInfo.year === currentYear ? monthInfo.monthKey : null;
        // Get weight from order (estim_weight is in kg)
        const orderWeight = parseFloat(order.estim_weight || order.quantity || 0);
        
        // Parse order details to get category information
        const orderItems = parseOrderDetails(order.orderdetails || order.order_details);
        
        if (orderItems.length > 0) {
          // Calculate per category if we have detailed items
          for (const item of orderItems) {
            const categoryId = parseInt(item.category_id || item.main_category_id || 0);
            // Use actual_weight if available (from payment details), otherwise use expected_weight_kg or weight
            const itemWeight = parseFloat(
              item.actual_weight || 
              item.actual_weight_kg || 
              item.expected_weight_kg || 
              item.weight || 
              item.quantity || 
              orderWeight / orderItems.length || 
              0
            );
            
            if (categoryId > 0 && itemWeight > 0) {
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
              
              // Monthly breakdown
              if (monthKey && monthlyBreakdown[monthKey]) {
                monthlyBreakdown[monthKey].weight += itemWeight;
                monthlyBreakdown[monthKey].carbon_offset += carbonOffset;
              }
              
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
          
          // Monthly breakdown
          if (monthKey && monthlyBreakdown[monthKey]) {
            monthlyBreakdown[monthKey].weight += orderWeight;
            monthlyBreakdown[monthKey].carbon_offset += carbonOffset;
          }
          
          totalRecycledWeight += orderWeight;
          totalCarbonOffset += carbonOffset;
        }
      }

      // Count orders per month properly
      const orderMonths = new Set();
      for (const order of completedOrders) {
        const orderDate = order.date || order.created_at || order.updated_at;
        const monthInfo = getMonthFromDate(orderDate);
        const monthKey = monthInfo && monthInfo.year === currentYear ? monthInfo.monthKey : null;
        
        if (monthKey && monthlyBreakdown[monthKey]) {
          const orderKey = `${monthKey}_${order.id}`;
          if (!orderMonths.has(orderKey)) {
            monthlyBreakdown[monthKey].order_count += 1;
            orderMonths.add(orderKey);
          }
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

      // Format monthly breakdown for response (only months with data)
      const monthlyBreakdownArray = Object.values(monthlyBreakdown)
        .filter(month => month.weight > 0 || month.carbon_offset > 0 || month.order_count > 0)
        .map(month => ({
          ...month,
          weight: parseFloat(month.weight.toFixed(2)),
          carbon_offset: parseFloat(month.carbon_offset.toFixed(2))
        }))
        .sort((a, b) => {
          if (a.year !== b.year) return a.year - b.year;
          return a.month - b.month;
        });

      const stats = {
        user_id: userIdNum,
        user_type: type,
        total_recycled_weight_kg: parseFloat(totalRecycledWeight.toFixed(2)),
        total_carbon_offset_kg: parseFloat(totalCarbonOffset.toFixed(2)),
        total_orders_completed: orderCount,
        category_breakdown: categoryBreakdownWithNames,
        monthly_breakdown: monthlyBreakdownArray,
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

  /**
   * GET /api/v2/recycling/vendor-stats/:userId
   * Get recycling statistics for B2C vendors based on completed orders (status 5)
   * This endpoint specifically calculates from actual_weight in orderdetails if available
   */
  static async getVendorRecyclingStats(req, res) {
    try {
      const { userId } = req.params;

      if (!userId) {
        return res.status(400).json({
          status: 'error',
          msg: 'User ID is required',
          data: null,
        });
      }

      const userIdNum = parseInt(userId);

      // Check Redis cache first
      const cacheKey = RedisCache.userKey(userIdNum, 'vendor_recycling_stats');
      try {
        const cached = await RedisCache.get(cacheKey);
        if (cached !== null && cached !== undefined) {
          console.log('⚡ Vendor recycling stats cache hit');
          return res.json({
            status: 'success',
            msg: 'Vendor recycling statistics retrieved successfully',
            data: cached,
            hitBy: 'Redis'
          });
        }
      } catch (err) {
        console.error('Redis get error:', err);
      }

      // Find the shop_id from user_id for B2C vendors
      const Shop = require('../models/Shop');
      const shop = await Shop.findByUserId(userIdNum);
      if (!shop || !shop.id) {
        // No shop found for this user, return empty stats
        console.warn(`⚠️ [getVendorRecyclingStats] No shop found for user_id ${userIdNum}. Returning zero stats.`);
        return res.json({
          status: 'success',
          msg: 'Vendor recycling statistics retrieved successfully',
          data: {
            user_id: userIdNum,
            total_recycled_weight_kg: 0,
            total_carbon_offset_kg: 0,
            total_orders_completed: 0,
            category_breakdown: [],
            monthly_breakdown: [],
            trees_equivalent: 0,
            cars_off_road_days: 0
          },
          hitBy: 'DynamoDB'
        });
      }

      const shopId = parseInt(shop.id);
      
      // Get all orders for this shop - check both status 4 and 5 for completed orders
      const allOrders = await Order.findByShopId(shopId);
      const completedOrders = allOrders.filter(order => order.status === 4 || order.status === 5);

      console.log(`📊 [getVendorRecyclingStats] User ID: ${userIdNum}, Shop ID: ${shopId}`);
      console.log(`📊 [getVendorRecyclingStats] Total orders found: ${allOrders.length}, Completed orders (status 4 or 5): ${completedOrders.length}`);
      
      if (completedOrders.length === 0) {
        console.warn(`⚠️ [getVendorRecyclingStats] No completed orders found for shop_id ${shopId}. Returning zero stats.`);
        return res.json({
          status: 'success',
          msg: 'Vendor recycling statistics retrieved successfully',
          data: {
            user_id: userIdNum,
            total_recycled_weight_kg: 0,
            total_carbon_offset_kg: 0,
            total_orders_completed: 0,
            category_breakdown: [],
            monthly_breakdown: [],
            trees_equivalent: 0,
            cars_off_road_days: 0
          },
          hitBy: 'DynamoDB'
        });
      }

      // Calculate statistics using actual_weight from orderdetails if available
      let totalRecycledWeight = 0; // in kg
      let totalCarbonOffset = 0; // in kg CO2
      let orderCount = completedOrders.length;
      const categoryBreakdown = {}; // { categoryId: { weight, carbonOffset, orderCount } }
      const monthlyBreakdown = {}; // { monthKey: { weight, carbonOffset, orderCount } }

      // Initialize current year months for monthly breakdown
      const currentYear = new Date().getFullYear();
      const months = ['January', 'February', 'March', 'April', 'May', 'June', 
                     'July', 'August', 'September', 'October', 'November', 'December'];
      
      for (let i = 1; i <= 12; i++) {
        const monthKey = `${currentYear}-${String(i).padStart(2, '0')}`;
        monthlyBreakdown[monthKey] = {
          month: i,
          monthName: months[i - 1],
          year: currentYear,
          weight: 0,
          carbon_offset: 0,
          order_count: 0
        };
      }

      // Helper function to get month from date
      const getMonthFromDate = (dateString) => {
        try {
          const date = new Date(dateString);
          return {
            year: date.getFullYear(),
            month: date.getMonth() + 1,
            monthKey: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
          };
        } catch (error) {
          return null;
        }
      };

      let ordersWithWeight = 0;
      let ordersWithoutWeight = 0;
      let totalItemsProcessed = 0;
      let totalItemsWithWeight = 0;

      for (const order of completedOrders) {
        // Get order date for monthly breakdown
        const orderDate = order.date || order.created_at || order.updated_at;
        const monthInfo = getMonthFromDate(orderDate);
        const monthKey = monthInfo && monthInfo.year === currentYear ? monthInfo.monthKey : null;

        // Parse order details to get actual weights and category information
        const orderItems = parseOrderDetails(order.orderdetails || order.order_details);
        
        if (orderItems.length > 0) {
          totalItemsProcessed += orderItems.length;
          // Calculate per category using actual_weight if available
          for (const item of orderItems) {
            const categoryId = parseInt(item.category_id || item.main_category_id || 0);
            
            // Use actual_weight if available (from payment details), otherwise use expected_weight_kg or weight
            const itemWeight = parseFloat(
              item.actual_weight || 
              item.actual_weight_kg || 
              item.expected_weight_kg || 
              item.weight || 
              item.quantity || 
              0
            );
            
            if (categoryId > 0 && itemWeight > 0) {
              totalItemsWithWeight += 1;
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
              
              // Monthly breakdown
              if (monthKey && monthlyBreakdown[monthKey]) {
                monthlyBreakdown[monthKey].weight += itemWeight;
                monthlyBreakdown[monthKey].carbon_offset += carbonOffset;
              }
              
              totalRecycledWeight += itemWeight;
              totalCarbonOffset += carbonOffset;
            }
          }
          
          // Check if this order contributed any weight
          const orderHasWeight = orderItems.some(item => {
            const weight = parseFloat(
              item.actual_weight || 
              item.actual_weight_kg || 
              item.expected_weight_kg || 
              item.weight || 
              item.quantity || 
              0
            );
            return weight > 0;
          });
          
          if (orderHasWeight) {
            ordersWithWeight += 1;
          } else {
            ordersWithoutWeight += 1;
            console.warn(`⚠️ [getVendorRecyclingStats] Order ${order.order_number || order.id} has no weight in orderdetails:`, {
              orderId: order.id,
              orderNumber: order.order_number,
              hasOrderdetails: !!(order.orderdetails || order.order_details),
              itemsCount: orderItems.length
            });
          }
        } else {
          // Fallback: use order weight if we can't parse details
          const orderWeight = parseFloat(order.estim_weight || order.quantity || 0);
          if (orderWeight > 0) {
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
            
            // Monthly breakdown
            if (monthKey && monthlyBreakdown[monthKey]) {
              monthlyBreakdown[monthKey].weight += orderWeight;
              monthlyBreakdown[monthKey].carbon_offset += carbonOffset;
            }
            
            totalRecycledWeight += orderWeight;
            totalCarbonOffset += carbonOffset;
          }
        }
      }

      // Count orders per month properly
      const orderMonths = new Set();
      for (const order of completedOrders) {
        const orderDate = order.date || order.created_at || order.updated_at;
        const monthInfo = getMonthFromDate(orderDate);
        const monthKey = monthInfo && monthInfo.year === currentYear ? monthInfo.monthKey : null;
        
        if (monthKey && monthlyBreakdown[monthKey]) {
          const orderKey = `${monthKey}_${order.id}`;
          if (!orderMonths.has(orderKey)) {
            monthlyBreakdown[monthKey].order_count += 1;
            orderMonths.add(orderKey);
          }
        }
      }

      console.log(`📊 [getVendorRecyclingStats] Processing summary:`, {
        totalOrders: completedOrders.length,
        ordersWithWeight,
        ordersWithoutWeight,
        totalItemsProcessed,
        totalItemsWithWeight,
            totalRecycledWeightKg: totalRecycledWeight.toFixed(2),
            totalCarbonOffsetKg: totalCarbonOffset.toFixed(2),
            categoriesFound: Object.keys(categoryBreakdown).length,
            monthlyBreakdownKeys: Object.keys(monthlyBreakdown).length
      });

      // Log detailed order processing for debugging
      console.log(`📊 [getVendorRecyclingStats] Detailed order processing:`, {
        completedOrdersCount: completedOrders.length,
        orders: completedOrders.map(order => ({
          id: order.id,
          order_number: order.order_number,
          status: order.status,
          has_orderdetails: !!(order.orderdetails || order.order_details),
          estim_weight: order.estim_weight
        }))
      });

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

      // Format monthly breakdown for response (only months with data)
      const monthlyBreakdownArray = Object.values(monthlyBreakdown)
        .filter(month => month.weight > 0 || month.carbon_offset > 0 || month.order_count > 0)
        .map(month => ({
          ...month,
          weight: parseFloat(month.weight.toFixed(2)),
          carbon_offset: parseFloat(month.carbon_offset.toFixed(2))
        }))
        .sort((a, b) => {
          if (a.year !== b.year) return a.year - b.year;
          return a.month - b.month;
        });

      const stats = {
        user_id: userIdNum,
        total_recycled_weight_kg: parseFloat(totalRecycledWeight.toFixed(2)),
        total_carbon_offset_kg: parseFloat(totalCarbonOffset.toFixed(2)),
        total_orders_completed: orderCount,
        category_breakdown: categoryBreakdownWithNames,
        monthly_breakdown: monthlyBreakdownArray,
        // Additional metrics
        trees_equivalent: parseFloat((totalCarbonOffset / 20).toFixed(2)), // ~20 kg CO2 = 1 tree per year
        cars_off_road_days: parseFloat((totalCarbonOffset / 4.6).toFixed(2)) // ~4.6 kg CO2 per day for average car
      };

      // Cache the result (cache for 30 minutes - stats can change with new orders)
      try {
        await RedisCache.set(cacheKey, stats, 'long');
        console.log('💾 Vendor recycling stats cached');
      } catch (err) {
        console.error('Redis cache set error:', err);
      }

      return res.json({
        status: 'success',
        msg: 'Vendor recycling statistics retrieved successfully',
        data: stats,
        hitBy: 'DynamoDB'
      });
    } catch (error) {
      console.error('❌ [getVendorRecyclingStats] Error:', error);
      console.error('❌ [getVendorRecyclingStats] Error stack:', error.stack);
      console.error('❌ [getVendorRecyclingStats] User ID:', userId);
      return res.status(500).json({
        status: 'error',
        msg: 'Failed to retrieve vendor recycling statistics',
        data: null,
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }
}

module.exports = V2RecyclingController;
