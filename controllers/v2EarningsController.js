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
        orders = allOrders.filter(order => order.status === 4); // Only completed orders
      } else if (type === 'shop') {
        // S user type - shop orders (B2B)
        const allOrders = await Order.findByShopId(userIdNum, 4); // Completed orders
        orders = allOrders;
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
          }
        }
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
      console.error('Error fetching monthly breakdown:', error);
      return res.status(500).json({
        status: 'error',
        msg: 'Failed to fetch monthly breakdown',
        data: null,
      });
    }
  }
}

module.exports = V2EarningsController;





