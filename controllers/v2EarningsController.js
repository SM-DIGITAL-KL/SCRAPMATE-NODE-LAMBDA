/**
 * V2 Monthly Earnings Breakdown Controller
 * Handles HTTP requests for monthly earnings breakdown charts
 */

const Order = require('../models/Order');
const RedisCache = require('../utils/redisCache');

/**
 * Get monthly earnings breakdown for a user
 * Supports R (customer), S (shop), D (delivery), SR (shop+retail) user types
 */
class V2EarningsController {
  /**
   * GET /api/v2/earnings/monthly-breakdown/:userId
   * Get monthly earnings breakdown for last 6 months
   * Query params: ?type=customer|shop|delivery&months=6
   */
  static async getMonthlyBreakdown(req, res) {
    try {
      const { userId } = req.params;
      const { type = 'customer', months = 6 } = req.query; // customer, shop, or delivery

      if (!userId) {
        return res.status(400).json({
          status: 'error',
          msg: 'User ID is required',
          data: null,
        });
      }

      const userIdNum = parseInt(userId);
      const monthsNum = parseInt(months);

      // Check Redis cache first
      const cacheKey = RedisCache.userKey(userIdNum, `earnings_monthly_${type}_${monthsNum}`);
      try {
        const cached = await RedisCache.get(cacheKey);
        if (cached !== null && cached !== undefined) {
          console.log('⚡ Monthly earnings breakdown cache hit');
          return res.json({
            status: 'success',
            msg: 'Monthly breakdown retrieved successfully',
            data: cached,
            hitBy: 'Redis'
          });
        }
      } catch (err) {
        console.error('Redis get error:', err);
      }

      // Get orders based on type
      let orders = [];
      if (type === 'customer') {
        // R user type - customer orders (B2C)
        const allOrders = await Order.findByCustomerId(userIdNum);
        // Status 5 = Pickup Completed (changed from status 4)
        orders = allOrders.filter(order => order.status === 5); // Only completed orders
      } else if (type === 'shop') {
        // For shop type (B2C vendors), first find the shop_id from user_id
        const Shop = require('../models/Shop');
        const shop = await Shop.findByUserId(userIdNum);
        if (!shop || !shop.id) {
          // No shop found for this user, return empty breakdown
          console.warn(`⚠️ [getMonthlyBreakdown] No shop found for user_id ${userIdNum}. Returning zero earnings.`);
          const currentDate = new Date();
          const monthlyBreakdown = [];
          const monthsMap = {};
          const monthsNum = parseInt(months);
          
          // Initialize all months with zero values
          for (let i = monthsNum - 1; i >= 0; i--) {
            const date = new Date(currentDate.getFullYear(), currentDate.getMonth() - i, 1);
            const year = date.getFullYear();
            const month = date.getMonth() + 1;
            const monthKey = `${year}-${String(month).padStart(2, '0')}`;
            const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
            
            monthsMap[monthKey] = {
              month: month,
              monthName: monthNames[month - 1],
              year: year,
              earnings: 0,
              orderCount: 0
            };
          }
          
          const sortedMonths = Object.keys(monthsMap).sort();
          sortedMonths.forEach(monthKey => {
            monthlyBreakdown.push(monthsMap[monthKey]);
          });
          
          return res.json({
            status: 'success',
            msg: 'Monthly breakdown retrieved successfully',
            data: {
              monthlyBreakdown,
              totalEarnings: 0,
              totalOrders: 0,
              currency: 'INR',
              period: `Last ${monthsNum} months`
            },
            hitBy: 'DynamoDB'
          });
        }
        const shopId = parseInt(shop.id);
        const allOrders = await Order.findByShopId(shopId);
        orders = allOrders.filter(order => order.status === 5); // Status 5 = Completed for B2C vendors
        
        console.log(`📊 [getMonthlyBreakdown] User ID: ${userIdNum}, Shop ID: ${shopId}`);
        console.log(`📊 [getMonthlyBreakdown] Total orders: ${allOrders.length}, Completed orders (status 5): ${orders.length}`);
        
        if (orders.length === 0) {
          console.warn(`⚠️ [getMonthlyBreakdown] No completed orders found for shop_id ${shopId}. Returning zero earnings.`);
        }
      } else if (type === 'delivery') {
        // D user type - delivery boy orders
        orders = await Order.findCompletedByDeliveryBoyId(userIdNum);
      } else {
        return res.status(400).json({
          status: 'error',
          msg: 'Invalid type. Must be customer, shop, or delivery',
          data: null,
        });
      }

      // Calculate monthly breakdown for last N months
      const currentDate = new Date();
      const monthlyBreakdown = [];
      const monthsMap = {}; // { 'YYYY-MM': { month, monthName, earnings, orderCount } }

      // Initialize all months with zero values
      for (let i = monthsNum - 1; i >= 0; i--) {
        const date = new Date(currentDate.getFullYear(), currentDate.getMonth() - i, 1);
        const year = date.getFullYear();
        const month = date.getMonth() + 1;
        const monthKey = `${year}-${String(month).padStart(2, '0')}`;
        const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        
        monthsMap[monthKey] = {
          month: month,
          monthName: monthNames[month - 1],
          year: year,
          earnings: 0,
          orderCount: 0
        };
      }

      // Process orders and aggregate by month
      let ordersWithEarnings = 0;
      let ordersWithoutEarnings = 0;
      
      orders.forEach(order => {
        if (order.created_at) {
          const orderDate = new Date(order.created_at);
          const year = orderDate.getFullYear();
          const month = orderDate.getMonth() + 1;
          const monthKey = `${year}-${String(month).padStart(2, '0')}`;

          // Only include orders from the last N months
          if (monthsMap[monthKey]) {
            const earnings = parseFloat(order.estim_price || order.total_amount || 0);
            monthsMap[monthKey].earnings += earnings;
            monthsMap[monthKey].orderCount += 1;
            
            if (earnings > 0) {
              ordersWithEarnings += 1;
            } else {
              ordersWithoutEarnings += 1;
              console.warn(`⚠️ [getMonthlyBreakdown] Order ${order.order_number || order.id} has no earnings:`, {
                orderId: order.id,
                orderNumber: order.order_number,
                estim_price: order.estim_price,
                total_amount: order.total_amount
              });
            }
          }
        }
      });
      
      console.log(`📊 [getMonthlyBreakdown] Processing summary:`, {
        totalOrders: orders.length,
        ordersWithEarnings,
        ordersWithoutEarnings,
        totalEarnings: monthlyBreakdown.reduce((sum, month) => sum + month.earnings, 0).toFixed(2)
      });

      // Convert to array format (last N months)
      const sortedMonths = Object.keys(monthsMap).sort();
      sortedMonths.forEach(monthKey => {
        monthlyBreakdown.push(monthsMap[monthKey]);
      });

      // Calculate totals
      const totalEarnings = monthlyBreakdown.reduce((sum, month) => sum + month.earnings, 0);
      const totalOrders = monthlyBreakdown.reduce((sum, month) => sum + month.orderCount, 0);

      const result = {
        monthlyBreakdown,
        totalEarnings: parseFloat(totalEarnings.toFixed(2)),
        totalOrders,
        currency: type === 'delivery' ? 'USD' : 'INR', // Delivery might use USD
        period: `Last ${monthsNum} months`
      };

      // Cache the result (cache for 30 minutes - earnings can change with new orders)
      try {
        await RedisCache.set(cacheKey, result, 'long');
        console.log('💾 Monthly earnings breakdown cached');
      } catch (err) {
        console.error('Redis cache set error:', err);
      }

      return res.json({
        status: 'success',
        msg: 'Monthly breakdown retrieved successfully',
        data: result,
        hitBy: 'DynamoDB'
      });
    } catch (error) {
      console.error('❌ [getMonthlyBreakdown] Error:', error);
      console.error('❌ [getMonthlyBreakdown] Error stack:', error.stack);
      console.error('❌ [getMonthlyBreakdown] User ID:', userId, 'Type:', type);
      return res.status(500).json({
        status: 'error',
        msg: 'Failed to fetch monthly breakdown',
        data: null,
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }
}

module.exports = V2EarningsController;





