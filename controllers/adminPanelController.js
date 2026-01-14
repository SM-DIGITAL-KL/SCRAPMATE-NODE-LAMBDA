const User = require('../models/User');
const Shop = require('../models/Shop');
const Order = require('../models/Order');
const DeliveryBoy = require('../models/DeliveryBoy');
const CallLog = require('../models/CallLog');
const ProductCategory = require('../models/ProductCategory');
const RedisCache = require('../utils/redisCache');

class AdminPanelController {
  // Dashboard KPIs (counts only) - Optimized for performance
  static async dashboardKPIs(req, res) {
    console.log('✅ AdminPanelController.dashboardKPIs called');

    const cacheKey = RedisCache.adminKey('dashboard_kpis');
    let cached = null;

    // Check cache first and return immediately if available
    try {
      cached = await RedisCache.get(cacheKey);
      if (cached) {
        console.log('⚡ Dashboard KPIs cache hit - returning immediately');
        // Return cached data immediately
        res.json({
          status: 'success',
          msg: 'Dashboard KPIs retrieved',
          data: cached
        });

        // Refresh cache in background (don't await)
        this._refreshKPIsCache(cacheKey).catch(err => {
          console.error('Background cache refresh error:', err);
        });

        return;
      }
    } catch (err) {
      console.error('Redis get error:', err);
    }

    // If no cache, fetch with timeout protection
    try {
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Query timeout')), 25000); // 25 second timeout
      });

      const dataPromise = Promise.all([
        Shop.countByDelStatus(1),
        User.countByUserType('C'),
        User.countByUserTypeAndCurrentMonth('C'),
        User.countByUserTypeAndCurrentMonth('S'),
        DeliveryBoy.count(),
        (async () => {
          const UserAdmin = require('../models/UserAdmin');
          return await UserAdmin.count();
        })(),
        Order.count(),
        Shop.countPendingB2BApprovals(),
        User.countV2Users(),
        User.countV2B2BUsers(),
        User.countV2B2CUsers(),
        Shop.countDoorStepBuyers(),
        Shop.countV2DoorStepBuyers()
      ]);

      const [
        shops,
        customers,
        this_month_customers,
        this_month_vendors,
        deliveryboys,
        users,
        orders,
        pending_b2b_approvals,
        v2_users_count,
        v2_b2b_count,
        v2_b2c_count,
        door_step_buyers_count,
        v2_door_step_buyers_count
      ] = await Promise.race([dataPromise, timeoutPromise]);

      const result = {
        shops,
        customers,
        this_month_customers,
        this_month_vendors,
        deliveryboys,
        users,
        orders,
        pending_b2b_approvals,
        v2_users_count,
        v2_b2b_count,
        v2_b2c_count,
        door_step_buyers_count,
        v2_door_step_buyers_count
      };

      // Cache for 2 hours (7200 seconds) - KPIs don't change frequently
      try {
        await RedisCache.set(cacheKey, result, 7200);
        console.log('💾 Dashboard KPIs cached for 2 hours');
      } catch (err) {
        console.error('Redis cache set error:', err);
      }

      res.json({
        status: 'success',
        msg: 'Dashboard KPIs retrieved',
        data: result
      });
    } catch (error) {
      console.error('Dashboard KPIs API error:', error);

      // If we have stale cache, return it
      if (cached) {
        console.log('⚠️ Returning stale cache due to error');
        return res.json({
          status: 'success',
          msg: 'Dashboard KPIs retrieved (cached)',
          data: cached
        });
      }

      res.status(500).json({
        status: 'error',
        msg: 'Error loading dashboard KPIs',
        data: null
      });
    }
  }

  // Background cache refresh helper
  static async _refreshKPIsCache(cacheKey) {
    try {
      const [
        shops,
        customers,
        this_month_customers,
        this_month_vendors,
        deliveryboys,
        users,
        orders,
        pending_b2b_approvals,
        v2_users_count,
        v2_b2b_count,
        v2_b2c_count,
        door_step_buyers_count,
        v2_door_step_buyers_count
      ] = await Promise.all([
        Shop.countByDelStatus(1),
        User.countByUserType('C'),
        User.countByUserTypeAndCurrentMonth('C'),
        User.countByUserTypeAndCurrentMonth('S'),
        DeliveryBoy.count(),
        (async () => {
          const UserAdmin = require('../models/UserAdmin');
          return await UserAdmin.count();
        })(),
        Order.count(),
        Shop.countPendingB2BApprovals(),
        User.countV2Users(),
        User.countV2B2BUsers(),
        User.countV2B2CUsers(),
        Shop.countDoorStepBuyers(),
        Shop.countV2DoorStepBuyers()
      ]);

      const result = {
        shops,
        customers,
        this_month_customers,
        this_month_vendors,
        deliveryboys,
        users,
        orders,
        pending_b2b_approvals,
        v2_users_count,
        v2_b2b_count,
        v2_b2c_count,
        door_step_buyers_count,
        v2_door_step_buyers_count
      };

      await RedisCache.set(cacheKey, result, 7200);
      console.log('🔄 Background cache refresh completed');
    } catch (err) {
      console.error('Background cache refresh error:', err);
    }
  }

  // Dashboard Charts (monthly statistics) - Optimized for performance
  static async dashboardCharts(req, res) {
    console.log('✅ AdminPanelController.dashboardCharts called');

    const cacheKey = RedisCache.adminKey('dashboard_charts');
    let cached = null;

    // Check cache first and return immediately if available
    try {
      cached = await RedisCache.get(cacheKey);
      if (cached) {
        console.log('⚡ Dashboard charts cache hit - returning immediately');
        // Return cached data immediately
        res.json({
          status: 'success',
          msg: 'Dashboard charts retrieved',
          data: cached
        });

        // Refresh cache in background (don't await)
        this._refreshChartsCache(cacheKey).catch(err => {
          console.error('Background cache refresh error:', err);
        });

        return;
      }
    } catch (err) {
      console.error('Redis get error:', err);
    }

    // If no cache, fetch with timeout protection
    try {
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Query timeout')), 25000); // 25 second timeout
      });

      const dataPromise = Promise.all([
        User.getMonthlyCountByUserType('N'),
        User.getMonthlyCountByUserType('D'),
        User.getMonthlyCountByUserType('R'),
        User.getMonthlyCountByUserType('S'),
        User.getMonthlyCountByUserType('C'),
        User.getMonthlyCountByUserType('SR'),
        Order.getMonthlyCount(),
        Order.getMonthlyCount(4),
        Order.getMonthlyPendingCount(),
        User.countV2CustomerAppUsers(),
        User.countV2VendorAppUsers()
      ]);

      const [
        month_wise_new_users_count,
        month_wise_delivery_count,
        month_wise_recycler_count,
        month_wise_vendor_count,
        month_wise_customers_count,
        month_wise_shop_recycler_count,
        month_wise_orders_count,
        month_wise_completed_orders_count,
        month_wise_pending_orders_count,
        v2_customer_app_count,
        v2_vendor_app_count
      ] = await Promise.race([dataPromise, timeoutPromise]);

      // Log the results for debugging
      console.log('📊 [dashboardCharts] Monthly counts retrieved:');
      console.log(`   N (New Users): [${month_wise_new_users_count.join(', ')}] - Total: ${month_wise_new_users_count.reduce((a, b) => a + b, 0)}`);
      console.log(`   D (Delivery): [${month_wise_delivery_count.join(', ')}] - Total: ${month_wise_delivery_count.reduce((a, b) => a + b, 0)}`);
      console.log(`   R (Recycler): [${month_wise_recycler_count.join(', ')}] - Total: ${month_wise_recycler_count.reduce((a, b) => a + b, 0)}`);
      console.log(`   S (Vendors): [${month_wise_vendor_count.join(', ')}] - Total: ${month_wise_vendor_count.reduce((a, b) => a + b, 0)}`);
      console.log(`   C (Customers): [${month_wise_customers_count.join(', ')}] - Total: ${month_wise_customers_count.reduce((a, b) => a + b, 0)}`);
      console.log(`   SR (Shop+Recycler): [${month_wise_shop_recycler_count.join(', ')}] - Total: ${month_wise_shop_recycler_count.reduce((a, b) => a + b, 0)}`);

      const result = {
        month_wise_new_users_count,      // N
        month_wise_delivery_count,       // D
        month_wise_recycler_count,       // R
        month_wise_vendor_count,         // S
        month_wise_customers_count,      // C
        month_wise_shop_recycler_count,  // SR
        month_wise_orders_count,
        month_wise_completed_orders_count,
        month_wise_pending_orders_count,
        v2_customer_app_count,
        v2_vendor_app_count
      };

      // Cache for 2 hours (7200 seconds) - Chart data doesn't change frequently
      try {
        await RedisCache.set(cacheKey, result, 7200);
        console.log('💾 Dashboard charts cached for 2 hours');
      } catch (err) {
        console.error('Redis cache set error:', err);
      }

      res.json({
        status: 'success',
        msg: 'Dashboard charts retrieved',
        data: result
      });
    } catch (error) {
      console.error('Dashboard charts API error:', error);

      // If we have stale cache, return it
      if (cached) {
        console.log('⚠️ Returning stale cache due to error');
        return res.json({
          status: 'success',
          msg: 'Dashboard charts retrieved (cached)',
          data: cached
        });
      }

      res.status(500).json({
        status: 'error',
        msg: 'Error loading dashboard charts',
        data: null
      });
    }
  }

  // Background cache refresh helper for charts
  static async _refreshChartsCache(cacheKey) {
    try {
      const [
        month_wise_new_users_count,
        month_wise_delivery_count,
        month_wise_recycler_count,
        month_wise_vendor_count,
        month_wise_customers_count,
        month_wise_shop_recycler_count,
        month_wise_orders_count,
        month_wise_completed_orders_count,
        month_wise_pending_orders_count,
        v2_customer_app_count,
        v2_vendor_app_count
      ] = await Promise.all([
        User.getMonthlyCountByUserType('N'),
        User.getMonthlyCountByUserType('D'),
        User.getMonthlyCountByUserType('R'),
        User.getMonthlyCountByUserType('S'),
        User.getMonthlyCountByUserType('C'),
        User.getMonthlyCountByUserType('SR'),
        Order.getMonthlyCount(),
        Order.getMonthlyCount(4),
        Order.getMonthlyPendingCount(),
        User.countV2CustomerAppUsers(),
        User.countV2VendorAppUsers()
      ]);

      const result = {
        month_wise_new_users_count,      // N
        month_wise_delivery_count,       // D
        month_wise_recycler_count,       // R
        month_wise_vendor_count,         // S
        month_wise_customers_count,      // C
        month_wise_shop_recycler_count,  // SR
        month_wise_orders_count,
        month_wise_completed_orders_count,
        month_wise_pending_orders_count,
        v2_customer_app_count,
        v2_vendor_app_count
      };

      await RedisCache.set(cacheKey, result, 7200);
      console.log('🔄 Background charts cache refresh completed');
    } catch (err) {
      console.error('Background charts cache refresh error:', err);
    }
  }

  // Dashboard Recent Orders
  static async dashboardRecentOrders(req, res) {
    console.log('✅ AdminPanelController.dashboardRecentOrders called');

    const limit = parseInt(req.query.limit) || 8;
    const cacheKey = RedisCache.adminKey(`dashboard_recent_orders_${limit}`);

    try {
      const cached = await RedisCache.get(cacheKey);
      if (cached) {
        console.log('⚡ Dashboard recent orders cache hit');
        return res.json({
          status: 'success',
          msg: 'Recent orders retrieved',
          data: cached
        });
      }
    } catch (err) {
      console.error('Redis get error:', err);
    }

    try {
      const recent_orders = await Order.getRecent(limit);

      // Parse customer and shop details from JSON strings, and enrich from shop_id if needed
      const parsedOrders = await Promise.all(recent_orders.map(async (order) => {
        const parsed = { ...order };

        // Parse customer details
        if (order.customerdetails) {
          try {
            const customerDetails = typeof order.customerdetails === 'string'
              ? JSON.parse(order.customerdetails)
              : order.customerdetails;
            parsed.customer_name = customerDetails?.name || customerDetails?.customer_name || 'N/A';
            parsed.customer = customerDetails;
          } catch (e) {
            console.error('Error parsing customer details:', e);
            parsed.customer_name = 'N/A';
          }
        } else {
          parsed.customer_name = 'N/A';
        }

        // Parse shop details
        let shopDetails = null;
        if (order.shopdetails) {
          try {
            // Check if shopdetails is a plain string (not JSON)
            if (typeof order.shopdetails === 'string') {
              try {
                shopDetails = JSON.parse(order.shopdetails);
              } catch (e) {
                // It's a plain string, not JSON - we need to fetch from shop_id
                shopDetails = null;
              }
            } else {
              shopDetails = order.shopdetails;
            }

            // Check if shopdetails has shopname
            if (shopDetails && (!shopDetails.shopname && !shopDetails.shop_name && !shopDetails.name)) {
              shopDetails = null; // Need to fetch from shop_id
            }
          } catch (e) {
            console.error('Error parsing shop details:', e);
            shopDetails = null;
          }
        }

        // If shopdetails is missing or invalid, fetch from shop_id
        if (!shopDetails && order.shop_id) {
          try {
            const Shop = require('../models/Shop');
            const shop = await Shop.findById(order.shop_id);
            if (shop) {
              shopDetails = {
                id: shop.id,
                shop_id: shop.id,
                shopname: shop.shopname || shop.shop_name || '',
                shop_name: shop.shopname || shop.shop_name || '',
                name: shop.shopname || shop.shop_name || '',
                ownername: shop.ownername || shop.owner_name || '',
                contact: shop.contact || '',
                email: shop.email || '',
                address: shop.address || '',
                location: shop.location || '',
                place: shop.place || '',
                state: shop.state || '',
                pincode: shop.pincode || ''
              };
            }
          } catch (shopErr) {
            console.error('Error fetching shop details:', shopErr);
          }
        }

        if (shopDetails) {
          parsed.shop_name = shopDetails.shopname || shopDetails.shop_name || shopDetails.name || 'N/A';
          parsed.shop = shopDetails;
        } else {
          parsed.shop_name = 'N/A';
          parsed.shop = null;
        }

        return parsed;
      }));

      // Cache for 10 minutes (recent orders - balance between freshness and performance)
      try {
        await RedisCache.set(cacheKey, parsedOrders, 600);
        console.log('💾 Dashboard recent orders cached for 10 minutes');
      } catch (err) {
        console.error('Redis cache set error:', err);
      }

      res.json({
        status: 'success',
        msg: 'Recent orders retrieved',
        data: parsedOrders
      });
    } catch (error) {
      console.error('Dashboard recent orders API error:', error);
      res.status(500).json({
        status: 'error',
        msg: 'Error loading recent orders',
        data: null
      });
    }
  }

  // Dashboard Call Logs
  static async dashboardCallLogs(req, res) {
    console.log('✅ AdminPanelController.dashboardCallLogs called');

    const cacheKey = RedisCache.adminKey('dashboard_call_logs');
    try {
      const cached = await RedisCache.get(cacheKey);
      if (cached) {
        console.log('⚡ Dashboard call logs cache hit');
        return res.json({
          status: 'success',
          msg: 'Call logs retrieved',
          data: cached
        });
      }
    } catch (err) {
      console.error('Redis get error:', err);
    }

    try {
      const [calllogs, todayscalllogs] = await Promise.all([
        CallLog.count(),
        CallLog.countByDate()
      ]);

      const result = {
        calllogs,
        todayscalllogs
      };

      // Cache for 30 minutes (call logs change moderately)
      try {
        await RedisCache.set(cacheKey, result, 1800);
        console.log('💾 Dashboard call logs cached for 30 minutes');
      } catch (err) {
        console.error('Redis cache set error:', err);
      }

      res.json({
        status: 'success',
        msg: 'Call logs retrieved',
        data: result
      });
    } catch (error) {
      console.error('Dashboard call logs API error:', error);
      res.status(500).json({
        status: 'error',
        msg: 'Error loading call logs',
        data: null
      });
    }
  }

  // Dashboard data (legacy - kept for backward compatibility)
  static async dashboard(req, res) {
    console.log('✅ AdminPanelController.dashboard called - API request received');
    console.log('Request headers:', req.headers);

    // Check Redis cache first
    const cacheKey = RedisCache.adminKey('dashboard');
    try {
      const cached = await RedisCache.get(cacheKey);
      if (cached) {
        console.log('⚡ Dashboard cache hit');
        return res.json({
          status: 'success',
          msg: 'Dashboard data retrieved',
          data: cached
        });
      }
    } catch (err) {
      console.error('Redis get error:', err);
    }

    try {
      // Get all counts using DynamoDB models
      const [
        shops,
        customers,
        this_month_customers,
        this_month_vendors,
        deliveryboys,
        users,
        orders,
        calllogs,
        todayscalllogs,
        recent_orders,
        pending_b2b_approvals,
        v2_users_count,
        v2_b2b_count,
        v2_b2c_count,
        door_step_buyers_count,
        v2_door_step_buyers_count
      ] = await Promise.all([
        Shop.countByDelStatus(1),
        User.countByUserType('C'),
        User.countByUserTypeAndCurrentMonth('C'),
        User.countByUserTypeAndCurrentMonth('S'),
        DeliveryBoy.count(),
        (async () => {
          const UserAdmin = require('../models/UserAdmin');
          return await UserAdmin.count();
        })(),
        Order.count(),
        CallLog.count(),
        CallLog.countByDate(),
        Order.getRecent(8),
        Shop.countPendingB2BApprovals(),
        User.countV2Users(),
        User.countV2B2BUsers(),
        User.countV2B2CUsers(),
        Shop.countDoorStepBuyers(),
        Shop.countV2DoorStepBuyers()
      ]);

      const result = {
        shops,
        customers,
        this_month_customers,
        this_month_vendors,
        deliveryboys,
        users,
        orders,
        calllogs,
        todayscalllogs,
        recent_orders,
        pending_b2b_approvals,
        v2_users_count,
        v2_b2b_count,
        v2_b2c_count,
        door_step_buyers_count,
        v2_door_step_buyers_count
      };

      // Get monthly statistics using model methods
      result.month_wise_customers_count = await User.getMonthlyCountByUserType('C');
      result.month_wise_vendor_count = await User.getMonthlyCountByUserType('S');
      result.month_wise_orders_count = await Order.getMonthlyCount();
      result.month_wise_completed_orders_count = await Order.getMonthlyCount(4);
      result.month_wise_pending_orders_count = await Order.getMonthlyPendingCount();
      result.locations = [];

      // Cache dashboard data for 5 minutes (300 seconds)
      try {
        await RedisCache.set(cacheKey, result, '30days');
        console.log('💾 Dashboard data cached');
      } catch (err) {
        console.error('Redis cache set error:', err);
      }

      res.json({
        status: 'success',
        msg: 'Dashboard data retrieved',
        data: result
      });
    } catch (error) {
      console.error('Dashboard API error:', error);
      res.status(500).json({
        status: 'error',
        msg: 'Error loading dashboard data',
        data: null
      });
    }
  }

  // These methods are now handled by model methods:
  // - getMonthlyCount() -> User.getMonthlyCountByUserType() or Order.getMonthlyCount()
  // - getMonthlyPendingOrders() -> Order.getMonthlyPendingCount()

  // Users
  static async users(req, res) {
    try {
      console.log('✅ AdminPanelController.users called - fetching users');

      // Check Redis cache first
      const cacheKey = RedisCache.adminKey('users');
      try {
        const cached = await RedisCache.get(cacheKey);
        if (cached) {
          console.log('⚡ Users cache hit');
          return res.json({
            status: 'success',
            msg: 'Users retrieved',
            data: cached
          });
        }
      } catch (err) {
        console.error('Redis get error:', err);
      }

      // Fetch all users from different tables
      const UserAdmin = require('../models/UserAdmin');
      const userAdmins = await UserAdmin.getAll();

      // Also fetch regular users if needed
      const allUsers = userAdmins.map(admin => ({
        id: admin.id,
        name: admin.name,
        email: admin.email,
        user_type: admin.user_type || 'U',
        created_at: admin.created_at,
        updated_at: admin.updated_at
      }));

      console.log(`✅ Found ${allUsers.length} users`);

      // Cache users list for 30 days
      try {
        await RedisCache.set(cacheKey, allUsers, '30days');
        console.log('💾 Users list cached');
      } catch (err) {
        console.error('Redis cache set error:', err);
      }

      res.json({
        status: 'success',
        msg: 'Users retrieved',
        data: allUsers
      });
    } catch (error) {
      console.error('users error:', error);
      res.json({
        status: 'error',
        msg: 'Error fetching users',
        data: []
      });
    }
  }

  static async getUserById(req, res) {
    try {
      const { id } = req.params;

      // Check Redis cache first
      const cacheKey = RedisCache.adminKey('user', id);
      try {
        const cached = await RedisCache.get(cacheKey);
        if (cached) {
          console.log('⚡ User cache hit:', cacheKey);
          return res.json({
            status: 'success',
            msg: 'User retrieved',
            data: cached
          });
        }
      } catch (err) {
        console.error('Redis get error:', err);
      }

      // Use UserAdmin model to fetch user admin by ID
      const UserAdmin = require('../models/UserAdmin');
      const userData = await UserAdmin.findById(id);

      // Cache user data for 1 hour
      if (userData) {
        try {
          await RedisCache.set(cacheKey, userData, '30days');
          console.log('💾 User data cached:', cacheKey);
        } catch (err) {
          console.error('Redis cache set error:', err);
        }
      }

      res.json({
        status: 'success',
        msg: 'User retrieved',
        data: userData
      });
    } catch (error) {
      res.status(500).json({
        status: 'error',
        msg: 'Error fetching user',
        data: null
      });
    }
  }

  static async viewUsers(req, res) {
    try {
      console.log('✅ AdminPanelController.viewUsers called - fetching user_admins');

      // Check Redis cache first
      const cacheKey = RedisCache.adminKey('view_users');
      try {
        const cached = await RedisCache.get(cacheKey);
        if (cached) {
          console.log('⚡ View users cache hit');
          return res.json({
            status: 'success',
            msg: 'Users retrieved',
            data: cached
          });
        }
      } catch (err) {
        console.error('Redis get error:', err);
      }

      // Use UserAdmin model to fetch all user admins
      const UserAdmin = require('../models/UserAdmin');
      const results = await UserAdmin.getAll();
      console.log(`✅ Found ${results.length} user_admins`);

      // Cache users list for 10 minutes
      try {
        await RedisCache.set(cacheKey, results, '30days');
        console.log('💾 Users list cached');
      } catch (err) {
        console.error('Redis cache set error:', err);
      }

      res.json({
        status: 'success',
        msg: 'Users retrieved',
        data: results
      });
    } catch (error) {
      console.error('viewUsers error:', error);
      res.json({
        status: 'error',
        msg: 'Error fetching users',
        data: []
      });
    }
  }

  // Call log search
  static async callLogSearch(req, res) {
    res.json({
      status: 'success',
      msg: 'Call log search page',
      data: { pagename: 'Call Log Search' }
    });
  }

  static async getcallLogSearch(req, res) {
    const draw = parseInt(req.query.draw) || 1;
    const start = parseInt(req.query.start) || 0;
    const length = parseInt(req.query.length) || 10;
    const search = req.query.search?.value || '';

    // Check Redis cache first
    const cacheKey = RedisCache.adminKey('callLogSearch', null, { draw, start, length, search });
    try {
      const cached = await RedisCache.get(cacheKey);
      if (cached) {
        console.log('⚡ Call log search cache hit');
        return res.json(cached);
      }
    } catch (err) {
      console.error('Redis get error:', err);
    }

    try {
      // Use CallLog model's searchWithNames method
      const { data: results, total } = await CallLog.searchWithNames(search, length, start);

      const formattedData = results.map((row, index) => ({
        DT_RowIndex: start + index + 1,
        user_name: row.user_name || '',
        shop_name: row.shop_name || '',
        created_at: new Date(row.created_at).toLocaleString()
      }));

      const response = {
        draw,
        recordsTotal: total,
        recordsFiltered: total,
        data: formattedData
      };

      // Cache call log search for 2 minutes
      try {
        await RedisCache.set(cacheKey, response, '30days');
        console.log('💾 Call log search cached');
      } catch (err) {
        console.error('Redis cache set error:', err);
      }

      res.json(response);
    } catch (error) {
      console.error('Call log search error:', error);
      res.json({ draw, recordsTotal: 0, recordsFiltered: 0, data: [] });
    }
  }

  // Sign up report
  static async signUpReport(req, res) {
    // Log immediately when function is called
    console.log('\n\n');
    console.log('═══════════════════════════════════════════════════════════');
    console.log('🟢🟢🟢 signUpReport FUNCTION CALLED 🟢🟢🟢');
    console.log('═══════════════════════════════════════════════════════════');
    console.log('Timestamp:', new Date().toISOString());

    try {
      const { start_date, end_date, user_type } = req.query;

      // Check Redis cache first (only if all params provided)
      if (start_date && end_date && user_type) {
        const cacheKey = RedisCache.adminKey('signUpReport', null, { start_date, end_date, user_type });
        try {
          const cached = await RedisCache.get(cacheKey);
          if (cached) {
            console.log('⚡ Sign up report cache hit');
            return res.json(cached);
          }
        } catch (err) {
          console.error('Redis get error:', err);
        }
      }

      console.log('═══════════════════════════════════════════════════════════');
      console.log('🟢 AdminPanelController.signUpReport called');
      console.log('═══════════════════════════════════════════════════════════');
      console.log('   Request Method:', req.method);
      console.log('   Request Path:', req.path);
      console.log('   Query params:', { start_date, end_date, user_type });

      if (!start_date || !end_date || !user_type) {
        console.log('⚠️ signUpReport: Missing required params, returning page data');
        console.log('   Missing:', {
          start_date: !start_date ? 'MISSING' : 'OK',
          end_date: !end_date ? 'MISSING' : 'OK',
          user_type: !user_type ? 'MISSING' : 'OK'
        });
        return res.json({
          status: 'success',
          msg: 'Sign up report page',
          data: { pagename: 'Sign Up Report' }
        });
      }

      // Map user_type to readable name
      const userTypeMap = {
        'S': 'Vendors',
        'C': 'Customers',
        'D': 'Door Step Buyers',
        'N': 'New Users (Not Registered)',
        'R': 'Retailers (B2C)',
        'SR': 'Shop + Recycler (B2B + B2C)'
      };
      const userTypeName = userTypeMap[user_type] || `Unknown (${user_type})`;

      console.log('📊 Report Parameters:');
      console.log('   User Type:', user_type, `(${userTypeName})`);
      console.log('   Start Date:', start_date);
      console.log('   End Date:', end_date);
      console.log('   Date Range:', `${start_date} to ${end_date}`);

      const queryStartTime = Date.now();
      console.log('⏱️  Executing DynamoDB query...');

      try {
        // Get users by type and date range using DynamoDB
        const users = await User.getUsersByTypeAndDateRange(user_type, start_date, end_date);
        const queryDuration = Date.now() - queryStartTime;

        console.log('═══════════════════════════════════════════════════════════');
        console.log('✅ signUpReport SUCCESS');
        console.log('═══════════════════════════════════════════════════════════');
        console.log(`   Total Records Found: ${users.length}`);
        console.log(`   Query Duration: ${queryDuration}ms`);
        console.log(`   User Type: ${user_type} (${userTypeName})`);
        console.log(`   Date Range: ${start_date} to ${end_date}`);

        // Enrich users with shop/customer data based on user_type
        const Customer = require('../models/Customer');
        const enrichedResults = await Promise.all(users.map(async (user) => {
          let address = '';
          let place = '';

          try {
            if (user_type === 'S' || user_type === 'SR' || user_type === 'R') {
              // Vendors - get from shops table
              const shop = await Shop.findByUserId(user.id);
              if (shop) {
                address = shop.address || '';
                place = shop.place || '';
              }
            } else if (user_type === 'C') {
              // Customers - get from customer table
              const customer = await Customer.findByUserId(user.id);
              if (customer) {
                address = customer.address || '';
                place = customer.place || '';
              }
            }
            // For 'N' and 'D' types, address and place remain empty
          } catch (err) {
            console.error(`Error fetching shop/customer for user ${user.id}:`, err);
          }

          return {
            id: user.id,
            name: user.name || '',
            email: user.email || '',
            mob_num: user.mob_num || '',
            address: address,
            place: place,
            created_at: user.created_at || ''
          };
        }));

        if (enrichedResults.length > 0) {
          console.log('📋 Sample Records (first 3):');
          enrichedResults.slice(0, 3).forEach((record, index) => {
            console.log(`   Record ${index + 1}:`, {
              id: record.id,
              name: record.name || 'N/A',
              email: record.email || 'N/A',
              mobile: record.mob_num || 'N/A',
              address: record.address || 'N/A',
              place: record.place || 'N/A',
              created_at: record.created_at || 'N/A'
            });
          });

          // Summary statistics
          const withAddress = enrichedResults.filter(r => r.address && r.address.trim() !== '').length;
          const withPlace = enrichedResults.filter(r => r.place && r.place.trim() !== '').length;
          console.log('📊 Data Quality:');
          console.log(`   Records with address: ${withAddress}/${enrichedResults.length} (${Math.round(withAddress / enrichedResults.length * 100)}%)`);
          console.log(`   Records with place: ${withPlace}/${enrichedResults.length} (${Math.round(withPlace / enrichedResults.length * 100)}%)`);
        } else {
          console.log('⚠️  No records found for the specified criteria');
        }

        console.log('═══════════════════════════════════════════════════════════');

        const response = {
          status: 'success',
          msg: 'Report data retrieved',
          data: enrichedResults
        };

        // Cache report data for 10 minutes (only if params provided)
        if (start_date && end_date && user_type) {
          try {
            const cacheKey = RedisCache.adminKey('signUpReport', null, { start_date, end_date, user_type });
            await RedisCache.set(cacheKey, response, '30days');
            console.log('💾 Sign up report cached');
          } catch (err) {
            console.error('Redis cache set error:', err);
          }
        }

        res.json(response);
      } catch (err) {
        const queryDuration = Date.now() - queryStartTime;
        console.error('═══════════════════════════════════════════════════════════');
        console.error('❌ signUpReport DATABASE ERROR');
        console.error('═══════════════════════════════════════════════════════════');
        console.error('   Error message:', err.message);
        console.error('   Query Duration:', queryDuration, 'ms');
        console.error('   Error stack:', err.stack);
        return res.json({
          status: 'error',
          msg: 'Error fetching report data',
          data: []
        });
      }
    } catch (error) {
      console.error('═══════════════════════════════════════════════════════════');
      console.error('❌ signUpReport EXCEPTION');
      console.error('═══════════════════════════════════════════════════════════');
      console.error('   Error:', error.message);
      console.error('   Error stack:', error.stack);
      res.status(500).json({
        status: 'error',
        msg: 'Error generating report',
        data: []
      });
    }
  }

  // Notifications
  static async custNotification(req, res) {
    try {
      console.log('🟢 AdminPanelController.custNotification called');
      console.log('   Fetching customers with FCM tokens');

      // Check Redis cache first
      const cacheKey = RedisCache.adminKey('custNotification');
      try {
        const cached = await RedisCache.get(cacheKey);
        if (cached) {
          console.log('⚡ Customer notification cache hit');
          return res.json(cached);
        }
      } catch (err) {
        console.error('Redis get error:', err);
      }

      // Use User model to get customers with FCM tokens
      const results = await User.findWithFcmTokenByUserType('C');
      console.log(`✅ custNotification: Found ${results.length} customers with FCM tokens`);
      if (results.length > 0) {
        console.log('   Sample customer:', {
          id: results[0].id,
          name: results[0].name
        });
      }

      const response = {
        status: 'success',
        msg: 'Customers retrieved',
        data: results
      };

      // Cache customer notification list for 5 minutes
      try {
        await RedisCache.set(cacheKey, response, '30days');
        console.log('💾 Customer notification list cached');
      } catch (err) {
        console.error('Redis cache set error:', err);
      }

      res.json(response);
    } catch (error) {
      console.error('❌ custNotification error:', error);
      console.error('   Error stack:', error.stack);
      res.status(500).json({
        status: 'error',
        msg: 'Error fetching customers',
        data: []
      });
    }
  }

  static async vendorNotification(req, res) {
    try {
      console.log('🟢 AdminPanelController.vendorNotification called');
      console.log('   Fetching vendors with FCM tokens');

      // Check Redis cache first
      const cacheKey = RedisCache.adminKey('vendorNotification');
      try {
        const cached = await RedisCache.get(cacheKey);
        if (cached) {
          console.log('⚡ Vendor notification cache hit');
          return res.json(cached);
        }
      } catch (err) {
        console.error('Redis get error:', err);
      }

      // Use User model to get vendors with FCM tokens
      const results = await User.findWithFcmTokenByUserType('S');
      console.log(`✅ vendorNotification: Found ${results.length} vendors with FCM tokens`);
      if (results.length > 0) {
        console.log('   Sample vendor:', {
          id: results[0].id,
          name: results[0].name
        });
      }

      const response = {
        status: 'success',
        msg: 'Vendors retrieved',
        data: {
          shops: results,
          shops_count: results.length
        }
      };

      // Cache vendor notification list for 5 minutes
      try {
        await RedisCache.set(cacheKey, response, '30days');
        console.log('💾 Vendor notification list cached');
      } catch (err) {
        console.error('Redis cache set error:', err);
      }

      res.json(response);
    } catch (error) {
      console.error('❌ vendorNotification error:', error);
      console.error('   Error stack:', error.stack);
      res.status(500).json({
        status: 'error',
        msg: 'Error fetching vendors',
        data: { shops: [], shops_count: 0 }
      });
    }
  }

  static async sendCustNotification(req, res) {
    try {
      const { cust_ids, message, title } = req.body;
      console.log('🟢 AdminPanelController.sendCustNotification called');
      console.log('   Request data:', {
        cust_ids: cust_ids || 'none',
        hasMessage: !!message,
        hasTitle: !!title
      });

      if (!cust_ids || !message || !title) {
        console.error('❌ sendCustNotification: Missing required fields');
        return res.json({
          status: 'error',
          msg: 'Customer IDs, message, and title are required',
          data: null
        });
      }

      // TODO: Implement actual notification sending logic
      // This would involve:
      // 1. Fetching FCM tokens for the cust_ids
      // 2. Sending notifications via Firebase
      // 3. Saving notification records to database

      // Invalidate customer notification cache after sending
      try {
        await RedisCache.delete(RedisCache.adminKey('custNotification'));
        console.log('🗑️  Invalidated customer notification cache after send');
      } catch (err) {
        console.error('Redis cache invalidation error:', err);
      }

      console.log('✅ sendCustNotification: Notification sent successfully');
      res.json({
        status: 'success',
        msg: 'Notification sent successfully',
        data: null
      });
    } catch (error) {
      console.error('❌ sendCustNotification error:', error);
      console.error('   Error stack:', error.stack);
      res.json({
        status: 'error',
        msg: 'Error sending notification',
        data: null
      });
    }
  }

  static async sendVendorNotification(req, res) {
    try {
      const { vendor_ids, message, title, criteria } = req.body;
      console.log('🟢 AdminPanelController.sendVendorNotification called');
      console.log('   Request data:', {
        vendor_ids: vendor_ids ? (Array.isArray(vendor_ids) ? vendor_ids.length : 1) : 0,
        hasMessage: !!message,
        hasTitle: !!title,
        criteria: criteria || 'none'
      });

      if (!vendor_ids || !message || !title) {
        console.error('❌ sendVendorNotification: Missing required fields');
        return res.json({
          status: 'error',
          msg: 'Vendor IDs, message, and title are required',
          data: null
        });
      }

      // TODO: Implement actual notification sending logic
      // This would involve:
      // 1. Fetching FCM tokens for the vendor_ids
      // 2. Sending notifications via Firebase
      // 3. Saving notification records to database

      // Invalidate vendor notification cache after sending
      try {
        await RedisCache.delete(RedisCache.adminKey('vendorNotification'));
        console.log('🗑️  Invalidated vendor notification cache after send');
      } catch (err) {
        console.error('Redis cache invalidation error:', err);
      }

      console.log('✅ sendVendorNotification: Notification sent successfully');
      res.json({
        status: 'success',
        msg: 'Notification sent successfully',
        data: null
      });
    } catch (error) {
      console.error('❌ sendVendorNotification error:', error);
      console.error('   Error stack:', error.stack);
      res.json({
        status: 'error',
        msg: 'Error sending notification',
        data: null
      });
    }
  }

  // Manage users (create/update)
  static async manageUsers(req, res) {
    try {
      const dbPromise = db.promise();
      const { user_id, names, email, password, phone } = req.body;
      const id = req.params.id || user_id; // Support both URL param and body param
      console.log('hj');
      if (req.method === 'POST') {
        if (id) {
          // Update existing user
          const [userAdmins] = await dbPromise.query('SELECT * FROM user_admins WHERE id = ?', [id]);
          if (userAdmins.length === 0) {
            return res.json({
              status: 'error',
              msg: 'User not found',
              data: null
            });
          }

          const userAdmin = userAdmins[0];
          await dbPromise.query('UPDATE users SET name = ? WHERE id = ?', [names, userAdmin.user_id]);
          await dbPromise.query(
            'UPDATE user_admins SET name = ?, phone = ? WHERE id = ?',
            [names, phone || null, id]
          );

          // Invalidate related caches
          try {
            await RedisCache.invalidateTableCache('user_admins');
            await RedisCache.invalidateTableCache('users');
            await RedisCache.delete(RedisCache.adminKey('user', id));
            console.log('🗑️  Invalidated user caches after update');
          } catch (err) {
            console.error('Redis cache invalidation error:', err);
          }

          return res.json({
            status: 'success',
            msg: 'User updated successfully',
            data: null
          });
        } else {
          // Create new user
          if (!email || !password) {
            return res.json({
              status: 'error',
              msg: 'Email and password are required',
              data: null
            });
          }

          // Check if email exists
          const [existingUsers] = await dbPromise.query('SELECT id FROM users WHERE email = ?', [email]);
          if (existingUsers.length > 0) {
            return res.json({
              status: 'error',
              msg: 'Email already exists',
              data: null
            });
          }

          const bcrypt = require('bcryptjs');
          const hashedPassword = await bcrypt.hash(password, 10);

          // Create user
          const [userResult] = await dbPromise.query(
            'INSERT INTO users (name, email, password, user_type) VALUES (?, ?, ?, ?)',
            [names, email, hashedPassword, 'U']
          );

          // Create user_admin
          await dbPromise.query(
            'INSERT INTO user_admins (user_id, email, name, phone) VALUES (?, ?, ?, ?)',
            [userResult.insertId, email, names, phone || null]
          );

          // Invalidate related caches
          try {
            await RedisCache.invalidateTableCache('user_admins');
            await RedisCache.invalidateTableCache('users');
            console.log('🗑️  Invalidated user caches after create');
          } catch (err) {
            console.error('Redis cache invalidation error:', err);
          }

          return res.json({
            status: 'success',
            msg: 'User created successfully',
            data: null
          });
        }
      } else {
        // GET request - return user data if id provided
        if (req.params.id) {
          return AdminPanelController.getUserById(req, res);
        }
        return res.json({
          status: 'success',
          msg: 'User management page',
          data: { pagename: 'Users', user: null }
        });
      }
    } catch (error) {
      console.error('Manage users error:', error);
      res.status(500).json({
        status: 'error',
        msg: 'Error managing user',
        data: null
      });
    }
  }

  // Delete user
  static async deleteUser(req, res) {
    try {
      const { id } = req.params;
      const dbPromise = db.promise();

      const [userAdmins] = await dbPromise.query('SELECT * FROM user_admins WHERE id = ?', [id]);
      if (userAdmins.length === 0) {
        return res.json({
          status: 'error',
          msg: 'User not found',
          data: null
        });
      }

      const userAdmin = userAdmins[0];
      await dbPromise.query('DELETE FROM users WHERE id = ?', [userAdmin.user_id]);
      await dbPromise.query('DELETE FROM user_admins WHERE id = ?', [id]);

      // Invalidate related caches
      try {
        await RedisCache.invalidateTableCache('user_admins');
        await RedisCache.invalidateTableCache('users');
        await RedisCache.delete(RedisCache.adminKey('user', id));
        console.log('🗑️  Invalidated user caches after delete');
      } catch (err) {
        console.error('Redis cache invalidation error:', err);
      }

      return res.json({
        status: 'success',
        msg: 'User deleted successfully',
        data: null
      });
    } catch (error) {
      console.error('Delete user error:', error);
      res.status(500).json({
        status: 'error',
        msg: 'Error deleting user',
        data: null
      });
    }
  }

  // User password reset
  static async userPasswordReset(req, res) {
    try {
      const { id } = req.params;
      const { new_pass } = req.body;

      if (req.method === 'POST') {
        if (!new_pass) {
          return res.json({
            status: 'error',
            msg: 'New password is required',
            data: null
          });
        }

        const dbPromise = db.promise();
        // id can be either user_id (from users table) or user_admin id
        // Check if it's a user_id first
        const [users] = await dbPromise.query('SELECT id FROM users WHERE id = ?', [id]);
        let userId = id;

        if (users.length === 0) {
          // If not found in users, check if it's a user_admin id
          const [userAdmins] = await dbPromise.query('SELECT user_id FROM user_admins WHERE id = ?', [id]);
          if (userAdmins.length === 0) {
            return res.json({
              status: 'error',
              msg: 'User not found',
              data: null
            });
          }
          userId = userAdmins[0].user_id;
        }

        const bcrypt = require('bcryptjs');
        const hashedPassword = await bcrypt.hash(new_pass, 10);
        await dbPromise.query('UPDATE users SET password = ? WHERE id = ?', [hashedPassword, userId]);

        // Invalidate user cache after password change
        try {
          await RedisCache.delete(RedisCache.adminKey('user', userId));
          await RedisCache.delete(RedisCache.adminKey('user', id));
          console.log('🗑️  Invalidated user cache after password reset');
        } catch (err) {
          console.error('Redis cache invalidation error:', err);
        }

        return res.json({
          status: 'success',
          msg: 'Password reset successfully',
          data: null
        });
      } else {
        // GET request - return form HTML or JSON
        return res.json({
          status: 'success',
          msg: 'Password reset form',
          data: { user_id: id }
        });
      }
    } catch (error) {
      console.error('Password reset error:', error);
      res.status(500).json({
        status: 'error',
        msg: 'Error resetting password',
        data: null
      });
    }
  }

  // Set permission page
  static async setPermission(req, res) {
    console.log('🟢 AdminController::setPermission called', {
      id: req.params.id,
      query: req.query,
      url: req.url
    });

    try {
      const { id } = req.params;

      // Check Redis cache first
      const cacheKey = RedisCache.adminKey('set_permission', id || 'all');
      try {
        const cached = await RedisCache.get(cacheKey);
        if (cached) {
          console.log('⚡ Set permission cache hit:', cacheKey);
          return res.json(cached);
        }
      } catch (err) {
        console.error('Redis get error:', err);
      }

      // Use DynamoDB models instead of SQL queries
      const UserAdmin = require('../models/UserAdmin');
      const PerPage = require('../models/PerPage');

      let userData = null;
      if (id) {
        console.log('🔵 Fetching user data for ID:', id);
        try {
          userData = await UserAdmin.findById(id);
          console.log('🔵 User data found:', userData ? 'Yes' : 'No', userData);
        } catch (err) {
          console.error('❌ Error fetching user data:', err.message);
          throw err;
        }
      }

      console.log('🔵 Fetching permissions...');
      let permissions = [];
      try {
        permissions = await PerPage.getAll();
        console.log('✅ Permissions fetched:', permissions.length, 'items');
        if (permissions.length > 0) {
          console.log('🔵 Sample permissions:', permissions.slice(0, 3));
        } else {
          console.warn('⚠️ No permissions found in database');
        }
      } catch (err) {
        console.error('❌ Error fetching permissions:', err.message);
        console.error('❌ Error stack:', err.stack);
        throw err;
      }

      console.log('🔵 Fetching all users...');
      let allUsers = [];
      try {
        allUsers = await UserAdmin.getAll();
        console.log('✅ Users fetched:', allUsers.length, 'items');
        if (allUsers.length > 0) {
          console.log('🔵 Sample users:', allUsers.slice(0, 3));
        } else {
          console.warn('⚠️ No users found in user_admins table');
        }
      } catch (err) {
        console.error('❌ Error fetching users:', err.message);
        console.error('❌ Error stack:', err.stack);
        throw err;
      }

      const response = {
        status: 'success',
        msg: 'Permission page',
        data: {
          pagename: 'Users Permission',
          user_data: userData,
          permission: permissions,
          user_id: id || '',
          users: allUsers
        }
      };

      console.log('✅ setPermission: Successfully returning data', {
        hasUserData: !!userData,
        permissionsCount: permissions.length,
        usersCount: allUsers.length
      });

      // Cache permission page data for 15 minutes
      try {
        await RedisCache.set(cacheKey, response, '30days');
        console.log('💾 Permission page data cached:', cacheKey);
      } catch (err) {
        console.error('Redis cache set error:', err);
      }

      return res.json(response);
    } catch (error) {
      console.error('❌ Set permission error:', error);
      console.error('❌ Error message:', error.message);
      console.error('❌ Error stack:', error.stack);
      res.status(500).json({
        status: 'error',
        msg: 'Error loading permission page: ' + error.message,
        data: null
      });
    }
  }

  // Store user permission
  static async storeUserPermission(req, res) {
    try {
      const { user_id } = req.body;
      if (!user_id) {
        return res.json({
          status: 'error',
          msg: 'User ID is required',
          data: null
        });
      }

      const permissions = [];
      for (const key in req.body) {
        if (key.startsWith('permission-')) {
          permissions.push(req.body[key]);
        }
      }

      const permissionString = permissions.join(',');

      // Use UserAdmin model to update permissions
      const UserAdmin = require('../models/UserAdmin');
      await UserAdmin.update(user_id, { page_permission: permissionString });

      // Invalidate related caches
      try {
        await RedisCache.invalidateTableCache('user_admins');
        await RedisCache.delete(RedisCache.adminKey('set_permission', user_id));
        await RedisCache.delete(RedisCache.adminKey('set_permission', 'all'));
        await RedisCache.delete(RedisCache.adminKey('user', user_id));
        console.log('🗑️  Invalidated permission caches after update');
      } catch (err) {
        console.error('Redis cache invalidation error:', err);
      }

      return res.json({
        status: 'success',
        msg: 'Permissions set successfully',
        data: null
      });
    } catch (error) {
      console.error('Store permission error:', error);
      res.status(500).json({
        status: 'error',
        msg: 'Error storing permissions',
        data: null
      });
    }
  }

  // Check distance
  static async checkDistance(req, res) {
    try {
      // Distance calculation logic would go here
      // This is typically used for calculating distance between two coordinates
      const { lat1, lon1, lat2, lon2 } = req.body;

      if (!lat1 || !lon1 || !lat2 || !lon2) {
        return res.json({
          status: 'error',
          msg: 'Coordinates are required',
          data: null
        });
      }

      // Haversine formula to calculate distance
      const R = 6371; // Radius of the Earth in km
      const dLat = (lat2 - lat1) * Math.PI / 180;
      const dLon = (lon2 - lon1) * Math.PI / 180;
      const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      const distance = R * c; // Distance in km

      return res.json({
        status: 'success',
        msg: 'Distance calculated',
        data: { distance: parseFloat(distance.toFixed(2)), unit: 'km' }
      });
    } catch (error) {
      console.error('Check distance error:', error);
      res.status(500).json({
        status: 'error',
        msg: 'Error calculating distance',
        data: null
      });
    }
  }

  // Get B2B users with pagination
  static async b2bUsers(req, res) {
    try {
      console.log('✅ AdminPanelController.b2bUsers called');
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 10;
      const search = req.query.search || null;
      const appVersion = req.query.app_version || null;

      const User = require('../models/User');
      const Shop = require('../models/Shop');

      let enrichedUsers;
      let total;
      const pageNumber = parseInt(page) || 1;
      const pageSize = parseInt(limit) || 10;

      // If searching, get all users first (no pagination), then filter, then paginate
      // If not searching, get paginated users directly
      if (search && search.trim()) {
        // Get all B2B users (no pagination) to search across entire database
        // Use a very large limit to get all users
        const allResult = await User.getB2BUsers(1, 999999, null);

        console.log(`📊 Total B2B users fetched: ${allResult.total}, users in result: ${allResult.users.length}`);

        // Enrich all users with shop data
        enrichedUsers = await Promise.all(allResult.users.map(async (user) => {
          try {
            const shop = await Shop.findByUserId(user.id);

            // Determine email - prioritize shop email fields for v2 B2B users
            let email = '';
            if (shop) {
              // For v2 B2B users, email should be in shop.contact_person_email or shop.email
              email = shop.contact_person_email || shop.email || user.email || '';

              // Log email source for debugging v2 users
              if (user.app_version === 'v2' && (user.user_type === 'S' || user.user_type === 'SR')) {
                console.log(`📧 [B2B Users - All] User ${user.id} (${user.name || 'N/A'}):`);
                console.log(`   Final email: ${email || 'EMPTY'}`);
                console.log(`   shop.contact_person_email: ${shop.contact_person_email || 'N/A'}`);
                console.log(`   shop.email: ${shop.email || 'N/A'}`);
                console.log(`   user.email: ${user.email || 'N/A'}`);
                console.log(`   Shop keys: ${Object.keys(shop).join(', ')}`);
              }
            } else {
              // Fallback to user email if no shop found
              email = user.email || '';

              // Log for v2 users without shop
              if (user.app_version === 'v2' && (user.user_type === 'S' || user.user_type === 'SR')) {
                console.log(`⚠️ [B2B Users - All] User ${user.id} (${user.name || 'N/A'}): No shop found, using user.email=${email || 'EMPTY'}`);
              }
            }

            return {
              ...user,
              shop: shop || null,
              shopname: shop?.shopname || '',
              contact: shop?.contact || user.mob_num || '',
              address: shop?.address || '',
              shop_type: shop?.shop_type || null,
              approval_status: shop?.approval_status || null,
              company_name: shop?.company_name || '',
              gst_number: shop?.gst_number || '',
              // Include shop email (contactEmail from B2B signup) - prioritize over user email
              email: email,
              contact_person_email: shop?.contact_person_email || shop?.email || '',
              contact_person_name: shop?.contact_person_name || ''
            };
          } catch (err) {
            console.error(`Error fetching shop for user ${user.id}:`, err);

            // For v2 users, try to get email from user record even if shop fetch fails
            let email = user.email || '';

            return {
              ...user,
              shop: null,
              shopname: '',
              contact: user.mob_num || '',
              address: '',
              shop_type: null,
              approval_status: null,
              company_name: '',
              gst_number: '',
              email: email,
              contact_person_email: '',
              contact_person_name: ''
            };
          }
        }));

        // Apply search filter after enriching with shop data (to search contact from shop)
        const searchTerm = search.trim();
        const searchTermLower = searchTerm.toLowerCase();
        // Try to parse as number for exact phone number matching
        const searchAsNumber = !isNaN(searchTerm) && searchTerm.length > 0 ? parseInt(searchTerm) : null;
        const searchAsNumberStr = searchAsNumber ? searchAsNumber.toString() : null;

        console.log(`🔍 Searching for: "${searchTerm}" (as number: ${searchAsNumber}, as string: "${searchAsNumberStr}")`);
        console.log(`   Total users before filter: ${enrichedUsers.length}`);

        // Debug: Check if the specific user exists in the list
        const testUser = enrichedUsers.find(u => u.mob_num && u.mob_num.toString() === '1234564890');
        if (testUser) {
          console.log(`   ✅ Found test user in list: ${testUser.name}, mob_num: ${testUser.mob_num}, contact: ${testUser.contact}`);
        } else {
          console.log(`   ⚠️  Test user 1234564890 NOT found in enriched users list`);
        }

        enrichedUsers = enrichedUsers.filter(user => {
          // Search by phone number (mob_num from user) - check both string and number
          let userPhoneMatch = false;
          if (user.mob_num !== null && user.mob_num !== undefined) {
            const userPhoneNum = typeof user.mob_num === 'number' ? user.mob_num : parseInt(user.mob_num);
            const userPhoneStr = user.mob_num.toString();

            // String contains check (case-insensitive)
            if (userPhoneStr.toLowerCase().includes(searchTermLower)) {
              userPhoneMatch = true;
            }

            // Exact number match
            if (searchAsNumber !== null && !isNaN(userPhoneNum)) {
              if (userPhoneNum === searchAsNumber) {
                userPhoneMatch = true;
              }
              // Also check string equality
              if (userPhoneStr === searchTerm || userPhoneStr === searchAsNumberStr) {
                userPhoneMatch = true;
              }
            }
          }

          // Search by contact number (contact from shop) - check both string and number
          let shopContactMatch = false;
          if (user.contact !== null && user.contact !== undefined && user.contact !== '') {
            const shopContactNum = typeof user.contact === 'number' ? user.contact : (!isNaN(user.contact) ? parseInt(user.contact) : null);
            const shopContactStr = user.contact.toString();

            // String contains check (case-insensitive)
            if (shopContactStr.toLowerCase().includes(searchTermLower)) {
              shopContactMatch = true;
            }

            // Exact number match
            if (searchAsNumber !== null && shopContactNum !== null && !isNaN(shopContactNum)) {
              if (shopContactNum === searchAsNumber) {
                shopContactMatch = true;
              }
              // Also check string equality
              if (shopContactStr === searchTerm || shopContactStr === searchAsNumberStr) {
                shopContactMatch = true;
              }
            }
          }

          // Search by vendor name (name)
          const nameMatch = user.name && typeof user.name === 'string' &&
            user.name.toLowerCase().includes(searchTermLower);

          const matches = userPhoneMatch || shopContactMatch || nameMatch;

          // Debug logging for specific phone number
          if (user.mob_num && (user.mob_num.toString() === '1234564890' || user.mob_num === 1234564890)) {
            console.log(`   🔍 Debug user 1234564890: userPhoneMatch=${userPhoneMatch}, shopContactMatch=${shopContactMatch}, nameMatch=${nameMatch}, matches=${matches}`);
            console.log(`      mob_num: ${user.mob_num} (${typeof user.mob_num}), contact: ${user.contact} (${typeof user.contact})`);
            console.log(`      searchTerm: "${searchTerm}", searchAsNumber: ${searchAsNumber}`);
            console.log(`      userPhoneStr: "${user.mob_num.toString()}", includes check: ${user.mob_num.toString().toLowerCase().includes(searchTermLower)}`);
          }

          return matches;
        });

        console.log(`   Total users after filter: ${enrichedUsers.length}`);

        // Debug: Check if the specific user is in filtered results
        const testUserAfter = enrichedUsers.find(u => (u.mob_num && u.mob_num.toString() === '1234564890') || u.mob_num === 1234564890);
        if (testUserAfter) {
          console.log(`   ✅ Test user 1234564890 found in filtered results`);
        } else {
          console.log(`   ❌ Test user 1234564890 NOT found in filtered results`);
        }

        console.log(`🔍 Search results for "${search}": ${enrichedUsers.length} users found after filtering`);

        // Re-sort enriched users: v2 users first, then v1 users
        enrichedUsers.sort((a, b) => {
          // Prioritize v2 users over v1 users
          const aIsV2 = a.app_version === 'v2' ? 1 : 0;
          const bIsV2 = b.app_version === 'v2' ? 1 : 0;
          return bIsV2 - aIsV2; // v2 users come first
        });

        // Apply pagination after filtering
        total = enrichedUsers.length;
        const skip = (pageNumber - 1) * pageSize;
        const paginatedUsers = enrichedUsers.slice(skip, skip + pageSize);
        enrichedUsers = paginatedUsers;

        console.log(`🔍 Paginated search results: Showing ${paginatedUsers.length} of ${total} users`);
      } else if (appVersion && (appVersion === 'v1' || appVersion === 'v2')) {
        // If app_version filter is specified, get all users first, then filter and paginate
        console.log(`🔍 Filtering by app_version=${appVersion}, fetching all users first`);
        const allResult = await User.getB2BUsers(1, 999999, null);

        // Enrich all users with shop data
        enrichedUsers = await Promise.all(allResult.users.map(async (user) => {
          try {
            const shop = await Shop.findByUserId(user.id);

            // Determine email - prioritize shop email fields for v2 B2B users
            let email = '';
            if (shop) {
              email = shop.contact_person_email || shop.email || user.email || '';
            } else {
              email = user.email || '';
            }

            return {
              ...user,
              shop: shop || null,
              shopname: shop?.shopname || '',
              contact: shop?.contact || user.mob_num || '',
              address: shop?.address || '',
              shop_type: shop?.shop_type || null,
              approval_status: shop?.approval_status || null,
              company_name: shop?.company_name || '',
              gst_number: shop?.gst_number || '',
              email: email,
              contact_person_email: shop?.contact_person_email || shop?.email || '',
              contact_person_name: shop?.contact_person_name || ''
            };
          } catch (err) {
            console.error(`Error fetching shop for user ${user.id}:`, err);
            return {
              ...user,
              shop: null,
              shopname: '',
              contact: user.mob_num || '',
              address: '',
              shop_type: null,
              approval_status: null,
              company_name: '',
              gst_number: '',
              email: user.email || '',
              contact_person_email: '',
              contact_person_name: ''
            };
          }
        }));

        // Filter by app_version
        enrichedUsers = enrichedUsers.filter(user => {
          const userAppVersion = user.app_version || 'v1';
          const matches = userAppVersion === appVersion;
          return matches;
        });
        console.log(`✅ Filtered by app_version=${appVersion}: ${enrichedUsers.length} users found out of ${allResult.users.length} total`);

        // Sort enriched users: v2 users first, then v1 users (though all should be same version now)
        enrichedUsers.sort((a, b) => {
          const aIsV2 = a.app_version === 'v2' ? 1 : 0;
          const bIsV2 = b.app_version === 'v2' ? 1 : 0;
          return bIsV2 - aIsV2;
        });

        // Apply pagination after filtering
        total = enrichedUsers.length;
        const skip = (pageNumber - 1) * pageSize;
        const paginatedUsers = enrichedUsers.slice(skip, skip + pageSize);
        enrichedUsers = paginatedUsers;

        console.log(`🔍 Paginated filtered results: Showing ${paginatedUsers.length} of ${total} users`);
      } else {
        // No search and no app_version filter - use normal pagination
        const result = await User.getB2BUsers(page, limit, null);

        // Enrich paginated users with shop data
        enrichedUsers = await Promise.all(result.users.map(async (user) => {
          try {
            const shop = await Shop.findByUserId(user.id);

            // Determine email - prioritize shop email fields for v2 B2B users
            let email = '';
            if (shop) {
              // For v2 B2B users, email should be in shop.contact_person_email or shop.email
              email = shop.contact_person_email || shop.email || user.email || '';

              // Log email source for debugging v2 users
              if (user.app_version === 'v2' && (user.user_type === 'S' || user.user_type === 'SR')) {
                console.log(`📧 [B2B Users - Paginated] User ${user.id} (${user.name || 'N/A'}):`);
                console.log(`   Final email: ${email || 'EMPTY'}`);
                console.log(`   shop.contact_person_email: ${shop.contact_person_email || 'N/A'}`);
                console.log(`   shop.email: ${shop.email || 'N/A'}`);
                console.log(`   user.email: ${user.email || 'N/A'}`);
                console.log(`   Shop keys: ${Object.keys(shop).join(', ')}`);
              }
            } else {
              // Fallback to user email if no shop found
              email = user.email || '';

              // Log for v2 users without shop
              if (user.app_version === 'v2' && (user.user_type === 'S' || user.user_type === 'SR')) {
                console.log(`⚠️ [B2B Users - Paginated] User ${user.id} (${user.name || 'N/A'}): No shop found, using user.email=${email || 'EMPTY'}`);
              }
            }

            return {
              ...user,
              shop: shop || null,
              shopname: shop?.shopname || '',
              contact: shop?.contact || user.mob_num || '',
              address: shop?.address || '',
              shop_type: shop?.shop_type || null,
              approval_status: shop?.approval_status || null,
              company_name: shop?.company_name || '',
              gst_number: shop?.gst_number || '',
              // Include shop email (contactEmail from B2B signup) - prioritize over user email
              email: email,
              contact_person_email: shop?.contact_person_email || shop?.email || '',
              contact_person_name: shop?.contact_person_name || ''
            };
          } catch (err) {
            console.error(`Error fetching shop for user ${user.id}:`, err);

            // For v2 users, try to get email from user record even if shop fetch fails
            let email = user.email || '';

            return {
              ...user,
              shop: null,
              shopname: '',
              contact: user.mob_num || '',
              address: '',
              shop_type: null,
              approval_status: null,
              company_name: '',
              gst_number: '',
              email: email,
              contact_person_email: '',
              contact_person_name: ''
            };
          }
        }));

        // Filter by app_version if specified
        if (appVersion && (appVersion === 'v1' || appVersion === 'v2')) {
          enrichedUsers = enrichedUsers.filter(user => {
            const userAppVersion = user.app_version || 'v1';
            const matches = userAppVersion === appVersion;
            return matches;
          });
          console.log(`✅ Filtered by app_version=${appVersion}: ${enrichedUsers.length} users found`);
          // Recalculate total after filtering
          total = enrichedUsers.length;
          
          // Re-apply pagination after filtering
          const skip = (pageNumber - 1) * pageSize;
          const paginatedUsers = enrichedUsers.slice(skip, skip + pageSize);
          enrichedUsers = paginatedUsers;
        } else {
          // Sort enriched users: v2 users first, then v1 users
          enrichedUsers.sort((a, b) => {
            const aIsV2 = a.app_version === 'v2' ? 1 : 0;
            const bIsV2 = b.app_version === 'v2' ? 1 : 0;
            return bIsV2 - aIsV2; // v2 users come first
          });
          total = result.total;
        }
      }

      const responseData = {
        users: enrichedUsers,
        total: total,
        page: pageNumber,
        limit: pageSize,
        totalPages: Math.ceil(total / pageSize),
        hasMore: (pageNumber * pageSize) < total
      };

      res.json({
        status: 'success',
        msg: 'B2B users retrieved',
        data: responseData
      });
    } catch (error) {
      console.error('b2bUsers error:', error);
      res.json({
        status: 'error',
        msg: 'Error fetching B2B users',
        data: {
          users: [],
          total: 0,
          page: 1,
          limit: 10,
          totalPages: 0,
          hasMore: false
        }
      });
    }
  }

  // Get B2B user details with documents
  static async getB2BUserDetails(req, res) {
    try {
      console.log('✅ AdminPanelController.getB2BUserDetails called');
      const userId = req.params.userId;

      if (!userId) {
        return res.status(400).json({
          status: 'error',
          msg: 'User ID is required',
          data: null
        });
      }

      // Get user
      const user = await User.findById(userId);
      if (!user) {
        return res.status(404).json({
          status: 'error',
          msg: 'User not found',
          data: null
        });
      }

      // Get shop data with documents
      const shop = await Shop.findByUserId(userId);

      const userData = {
        id: user.id,
        name: user.name || '',
        email: user.email || '',
        phone: user.mob_num || '',
        user_type: user.user_type,
        app_type: user.app_type,
        created_at: user.created_at,
        updated_at: user.updated_at,
        shop: shop ? {
          id: shop.id,
          shopname: shop.shopname || '',
          ownername: shop.ownername || '',
          address: shop.address || '',
          contact: shop.contact || '',
          company_name: shop.company_name || '',
          gst_number: shop.gst_number || '',
          pan_number: shop.pan_number || '',
          business_license_url: shop.business_license_url || '',
          gst_certificate_url: shop.gst_certificate_url || '',
          address_proof_url: shop.address_proof_url || '',
          kyc_owner_url: shop.kyc_owner_url || '',
          approval_status: shop.approval_status || null,
          rejection_reason: shop.rejection_reason || null,
          application_submitted_at: shop.application_submitted_at || null,
          documents_verified_at: shop.documents_verified_at || null,
          review_initiated_at: shop.review_initiated_at || null,
          created_at: shop.created_at,
          updated_at: shop.updated_at
        } : null
      };

      res.json({
        status: 'success',
        msg: 'B2B user details retrieved',
        data: userData
      });
    } catch (error) {
      console.error('getB2BUserDetails error:', error);
      res.status(500).json({
        status: 'error',
        msg: 'Error fetching B2B user details',
        data: null
      });
    }
  }

  // Update B2B approval status
  static async updateB2BApprovalStatus(req, res) {
    try {
      console.log('✅ AdminPanelController.updateB2BApprovalStatus called');
      const userId = req.params.userId;
      const { approval_status } = req.body;

      if (!userId) {
        return res.status(400).json({
          status: 'error',
          msg: 'User ID is required',
          data: null
        });
      }

      if (!approval_status || !['approved', 'rejected', 'pending'].includes(approval_status)) {
        return res.status(400).json({
          status: 'error',
          msg: 'Valid approval_status is required (approved, rejected, or pending)',
          data: null
        });
      }

      // Get shop by user_id
      const shop = await Shop.findByUserId(userId);
      if (!shop) {
        return res.status(404).json({
          status: 'error',
          msg: 'Shop record not found for this user',
          data: null
        });
      }

      // Prepare update data
      const updateData = {
        approval_status: approval_status
      };

      // Add rejection reason if status is rejected
      if (approval_status === 'rejected' && req.body.rejection_reason) {
        updateData.rejection_reason = req.body.rejection_reason;
        console.log('📋 Rejection reason:', req.body.rejection_reason);
      } else if (approval_status !== 'rejected') {
        // Clear rejection reason if status is not rejected
        updateData.rejection_reason = null;
      }

      // Track timestamps for approval workflow
      const currentTime = new Date().toISOString();

      // If status is being set to pending and review_initiated_at is not set, set it
      if (approval_status === 'pending' && !shop.review_initiated_at) {
        updateData.review_initiated_at = currentTime;
        console.log('📋 Setting review_initiated_at for B2B user:', userId);
      }

      // If status is being changed to approved or rejected, set documents_verified_at
      if ((approval_status === 'approved' || approval_status === 'rejected') && !shop.documents_verified_at) {
        updateData.documents_verified_at = currentTime;
        console.log('📋 Setting documents_verified_at for B2B user:', userId);
      }

      // Update approval status and rejection reason
      // Note: Shop.update automatically sets updated_at, so don't include it here
      await Shop.update(shop.id, updateData);

      // Prepare response data
      const responseData = {
        status: 'success',
        msg: `B2B approval status updated to ${approval_status}`,
        data: {
          userId: userId,
          shopId: shop.id,
          approval_status: approval_status
        }
      };

      // Send response immediately to avoid timeout
      res.json(responseData);

      // Run cache invalidation and user type upgrade asynchronously in the background
      // This prevents blocking the response and causing timeouts
      setImmediate(async () => {
        try {
          // If approval status is 'approved', check if user_type is 'R' and upgrade to 'SR'
          if (approval_status === 'approved') {
            try {
              // Get the user record
              const user = await User.findById(userId);

              if (user && user.user_type === 'R') {
                console.log(`🔄 Upgrading user_type from 'R' to 'SR' for user ${userId}`);

                // Update user_type to 'SR' (Shop + Recycler)
                await User.updateProfile(userId, { user_type: 'SR' });

                console.log(`✅ Successfully upgraded user ${userId} to user_type 'SR'`);

                // Invalidate user cache to ensure fresh data
                await RedisCache.delete(RedisCache.userKey(String(userId), 'profile'));
                await RedisCache.delete(RedisCache.userKey(String(userId)));
              } else if (user) {
                console.log(`ℹ️  User ${userId} has user_type '${user.user_type}', no upgrade needed`);
              }
            } catch (userUpdateError) {
              console.error('Error updating user_type:', userUpdateError);
              // Don't fail the entire approval if user_type update fails
              // The shop approval is still successful
            }
          }

          // Invalidate B2B users cache (non-blocking)
          try {
            await RedisCache.invalidateB2BUsersCache();
            console.log('🗑️  Invalidated B2B users cache after approval status update');
          } catch (err) {
            console.error('Redis cache invalidation error:', err);
          }

          // Invalidate user profile cache to ensure fresh data in React Native app (non-blocking)
          try {
            const userIdStr = String(userId);
            console.log(`🗑️  Invalidating profile cache for user ${userIdStr} after approval status update`);

            // Invalidate user profile cache
            await RedisCache.delete(RedisCache.userKey(userIdStr, 'profile'));
            await RedisCache.delete(RedisCache.userKey(userIdStr));

            // Invalidate get_user_by_id cache for shops table
            await RedisCache.delete(RedisCache.listKey('user_by_id', { user_id: userIdStr, table: 'shops' }));

            // Invalidate shops table cache
            await RedisCache.invalidateTableCache('shops');

            console.log(`✅ Profile cache invalidated for user ${userIdStr}`);
          } catch (err) {
            console.error('Redis profile cache invalidation error:', err);
          }
        } catch (backgroundError) {
          console.error('Error in background cache invalidation:', backgroundError);
          // Don't throw - this is background work
        }
      });
    } catch (error) {
      console.error('updateB2BApprovalStatus error:', error);
      res.status(500).json({
        status: 'error',
        msg: 'Error updating approval status',
        data: null
      });
    }
  }

  // Get B2C users list with pagination and search
  static async b2cUsers(req, res) {
    try {
      console.log('✅ AdminPanelController.b2cUsers called');
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 10;
      const search = req.query.search || null;
      const appVersion = req.query.app_version || null;
      const approvalStatus = req.query.approval_status || null;

      const User = require('../models/User');
      const Shop = require('../models/Shop');

      let enrichedUsers;
      let total;
      const pageNumber = parseInt(page) || 1;
      const pageSize = parseInt(limit) || 10;

      // If searching, get all users first (no pagination), then filter, then paginate
      // If not searching, get paginated users directly
      if (search && search.trim()) {
        // Get all B2C users (no pagination) to search across entire database
        const allResult = await User.getB2CUsers(1, 999999, null);

        console.log(`📊 Total B2C users fetched: ${allResult.total}, users in result: ${allResult.users.length}`);

        // Enrich all users with shop data
        enrichedUsers = await Promise.all(allResult.users.map(async (user) => {
          try {
            const shop = await Shop.findByUserId(user.id);

            return {
              ...user,
              shop: shop || null,
              shopname: shop?.shopname || '',
              contact: shop?.contact || user.mob_num || '',
              address: shop?.address || '',
              aadhar_card: shop?.aadhar_card || '',
              driving_license: shop?.driving_license || '',
              approval_status: shop?.approval_status || null,
              is_contacted: shop?.is_contacted === true || shop?.is_contacted === 1 || false
            };
          } catch (err) {
            console.error(`Error fetching shop for user ${user.id}:`, err);
            return {
              ...user,
              shop: null,
              shopname: '',
              contact: user.mob_num || '',
              address: '',
              aadhar_card: '',
              driving_license: '',
              is_contacted: false
            };
          }
        }));

        // Apply search filter after enriching with shop data
        const searchTerm = search.trim();
        const searchTermLower = searchTerm.toLowerCase();
        const searchAsNumber = !isNaN(searchTerm) && searchTerm.length > 0 ? parseInt(searchTerm) : null;
        const searchAsNumberStr = searchAsNumber ? searchAsNumber.toString() : null;

        console.log(`🔍 Searching for: "${searchTerm}" (as number: ${searchAsNumber})`);

        enrichedUsers = enrichedUsers.filter(user => {
          // Search by phone number (mob_num from user)
          let userPhoneMatch = false;
          if (user.mob_num !== null && user.mob_num !== undefined) {
            const userPhoneStr = user.mob_num.toString();
            if (userPhoneStr.toLowerCase().includes(searchTermLower)) {
              userPhoneMatch = true;
            }
            if (searchAsNumber !== null && user.mob_num === searchAsNumber) {
              userPhoneMatch = true;
            }
          }

          // Search by contact number (contact from shop)
          let shopContactMatch = false;
          if (user.contact !== null && user.contact !== undefined && user.contact !== '') {
            const shopContactStr = user.contact.toString();
            if (shopContactStr.toLowerCase().includes(searchTermLower)) {
              shopContactMatch = true;
            }
            if (searchAsNumber !== null && user.contact === searchAsNumber) {
              shopContactMatch = true;
            }
          }

          // Search by name
          const nameMatch = user.name && typeof user.name === 'string' &&
            user.name.toLowerCase().includes(searchTermLower);

          return userPhoneMatch || shopContactMatch || nameMatch;
        });

        console.log(`🔍 Search results for "${search}": ${enrichedUsers.length} users found after filtering`);

        // Filter by app_version if specified
        if (appVersion && (appVersion === 'v1' || appVersion === 'v2')) {
          enrichedUsers = enrichedUsers.filter(user => {
            const userAppVersion = user.app_version || 'v1';
            return userAppVersion === appVersion;
          });
          console.log(`🔍 Filtered by app_version=${appVersion}: ${enrichedUsers.length} users found`);
        }

        // Filter by approval_status if specified (only for v2 users)
        if (approvalStatus && (approvalStatus === 'pending' || approvalStatus === 'approved' || approvalStatus === 'rejected')) {
          enrichedUsers = enrichedUsers.filter(user => {
            const userAppVersion = user.app_version || 'v1';
            // Only apply approval_status filter to v2 users
            if (userAppVersion !== 'v2') {
              return true; // Include v1 users regardless of approval_status filter
            }
            const userApprovalStatus = user.approval_status || 'pending';
            return userApprovalStatus === approvalStatus;
          });
          console.log(`🔍 Filtered by approval_status=${approvalStatus} (v2 only): ${enrichedUsers.length} users found`);
        }

        // Re-sort enriched users: v2 users first, then v1 users
        enrichedUsers.sort((a, b) => {
          // Prioritize v2 users over v1 users
          const aIsV2 = a.app_version === 'v2' ? 1 : 0;
          const bIsV2 = b.app_version === 'v2' ? 1 : 0;
          return bIsV2 - aIsV2; // v2 users come first
        });

        // Apply pagination after filtering
        total = enrichedUsers.length;
        const skip = (pageNumber - 1) * pageSize;
        const paginatedUsers = enrichedUsers.slice(skip, skip + pageSize);
        enrichedUsers = paginatedUsers;

        console.log(`🔍 Paginated search results: Showing ${paginatedUsers.length} of ${total} users`);
      } else if (appVersion && (appVersion === 'v1' || appVersion === 'v2')) {
        // If app_version filter is specified, get all users first, then filter and paginate
        console.log(`🔍 Filtering by app_version=${appVersion}, fetching all users first`);
        const allResult = await User.getB2CUsers(1, 999999, null);

        // Enrich all users with shop data
        enrichedUsers = await Promise.all(allResult.users.map(async (user) => {
          try {
            const shop = await Shop.findByUserId(user.id);

            return {
              ...user,
              shop: shop || null,
              shopname: shop?.shopname || '',
              contact: shop?.contact || user.mob_num || '',
              address: shop?.address || '',
              aadhar_card: shop?.aadhar_card || '',
              driving_license: shop?.driving_license || '',
              approval_status: shop?.approval_status || null,
              is_contacted: shop?.is_contacted === true || shop?.is_contacted === 1 || false
            };
          } catch (err) {
            console.error(`Error fetching shop for user ${user.id}:`, err);
            return {
              ...user,
              shop: null,
              shopname: '',
              contact: user.mob_num || '',
              address: '',
              aadhar_card: '',
              driving_license: '',
              is_contacted: false
            };
          }
        }));

        // Filter by app_version - ensure we check the actual app_version field
        enrichedUsers = enrichedUsers.filter(user => {
          // Get app_version from user object (should be preserved during enrichment)
          const userAppVersion = user.app_version || 'v1';
          const matches = userAppVersion === appVersion;
          if (!matches && enrichedUsers.length < 100) {
            // Only log first 100 mismatches to avoid spam
            console.log(`❌ User ${user.id} (${user.name}) filtered out: app_version="${userAppVersion}", expected="${appVersion}"`);
          }
          return matches;
        });
        console.log(`✅ Filtered by app_version=${appVersion}: ${enrichedUsers.length} users found out of ${allResult.users.length} total`);

        // Filter by approval_status if specified (only for v2 users)
        if (approvalStatus && (approvalStatus === 'pending' || approvalStatus === 'approved' || approvalStatus === 'rejected')) {
          enrichedUsers = enrichedUsers.filter(user => {
            const userAppVersion = user.app_version || 'v1';
            // Only apply approval_status filter to v2 users
            if (userAppVersion !== 'v2') {
              return true; // Include v1 users regardless of approval_status filter
            }
            const userApprovalStatus = user.approval_status || 'pending';
            return userApprovalStatus === approvalStatus;
          });
          console.log(`🔍 Filtered by approval_status=${approvalStatus} (v2 only): ${enrichedUsers.length} users found`);
        }
        
        // Verify all remaining users have correct app_version
        const incorrectVersions = enrichedUsers.filter(user => {
          const userAppVersion = user.app_version || 'v1';
          return userAppVersion !== appVersion;
        });
        if (incorrectVersions.length > 0) {
          console.error(`⚠️ WARNING: Found ${incorrectVersions.length} users with incorrect app_version after filtering!`);
          incorrectVersions.slice(0, 5).forEach(user => {
            console.error(`   User ${user.id} (${user.name}): app_version="${user.app_version || 'v1'}", expected="${appVersion}"`);
          });
        }

        // Sort enriched users: v2 users first, then v1 users (though all should be same version now)
        enrichedUsers.sort((a, b) => {
          const aIsV2 = a.app_version === 'v2' ? 1 : 0;
          const bIsV2 = b.app_version === 'v2' ? 1 : 0;
          return bIsV2 - aIsV2; // v2 users come first
        });

        // Apply pagination after filtering
        total = enrichedUsers.length;
        const skip = (pageNumber - 1) * pageSize;
        const paginatedUsers = enrichedUsers.slice(skip, skip + pageSize);
        enrichedUsers = paginatedUsers;

        console.log(`🔍 Paginated filtered results: Showing ${paginatedUsers.length} of ${total} users`);
      } else {
        // No search and no app_version filter - use normal pagination
        const result = await User.getB2CUsers(page, limit, null);

        // Enrich paginated users with shop data
        enrichedUsers = await Promise.all(result.users.map(async (user) => {
          try {
            const shop = await Shop.findByUserId(user.id);

            return {
              ...user,
              shop: shop || null,
              shopname: shop?.shopname || '',
              contact: shop?.contact || user.mob_num || '',
              address: shop?.address || '',
              aadhar_card: shop?.aadhar_card || '',
              driving_license: shop?.driving_license || '',
              approval_status: shop?.approval_status || null,
              is_contacted: shop?.is_contacted === true || shop?.is_contacted === 1 || false
            };
          } catch (err) {
            console.error(`Error fetching shop for user ${user.id}:`, err);
            return {
              ...user,
              shop: null,
              shopname: '',
              contact: user.mob_num || '',
              address: '',
              aadhar_card: '',
              driving_license: '',
              is_contacted: false
            };
          }
        }));

        // Sort enriched users: v2 users first, then v1 users
        enrichedUsers.sort((a, b) => {
          const aIsV2 = a.app_version === 'v2' ? 1 : 0;
          const bIsV2 = b.app_version === 'v2' ? 1 : 0;
          return bIsV2 - aIsV2; // v2 users come first
        });

        // Filter by approval_status if specified (only for v2 users)
        if (approvalStatus && (approvalStatus === 'pending' || approvalStatus === 'approved' || approvalStatus === 'rejected')) {
          enrichedUsers = enrichedUsers.filter(user => {
            const userAppVersion = user.app_version || 'v1';
            // Only apply approval_status filter to v2 users
            if (userAppVersion !== 'v2') {
              return true; // Include v1 users regardless of approval_status filter
            }
            const userApprovalStatus = user.approval_status || 'pending';
            return userApprovalStatus === approvalStatus;
          });
          console.log(`🔍 Filtered by approval_status=${approvalStatus} (v2 only): ${enrichedUsers.length} users found`);
          // Recalculate total after filtering
          total = enrichedUsers.length;
          // Re-apply pagination after filtering
          const skip = (pageNumber - 1) * pageSize;
          enrichedUsers = enrichedUsers.slice(skip, skip + pageSize);
        } else {
          total = result.total;
        }
      }

      const responseData = {
        users: enrichedUsers,
        total: total,
        page: pageNumber,
        limit: pageSize,
        totalPages: Math.ceil(total / pageSize),
        hasMore: (pageNumber * pageSize) < total
      };

      res.json({
        status: 'success',
        msg: 'B2C users retrieved',
        data: responseData
      });
    } catch (error) {
      console.error('b2cUsers error:', error);
      res.json({
        status: 'error',
        msg: 'Error fetching B2C users',
        data: {
          users: [],
          total: 0,
          page: 1,
          limit: 10,
          totalPages: 0,
          hasMore: false
        }
      });
    }
  }

  // Get SR users list with pagination and search
  static async srUsers(req, res) {
    try {
      console.log('✅ AdminPanelController.srUsers called');
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 10;
      const search = req.query.search || null;

      const User = require('../models/User');
      const Shop = require('../models/Shop');

      let enrichedUsers;
      let total;
      const pageNumber = parseInt(page) || 1;
      const pageSize = parseInt(limit) || 10;

      // If searching, get all users first (no pagination), then filter, then paginate
      // If not searching, get paginated users directly
      if (search && search.trim()) {
        // Get all SR users (no pagination) to search across entire database
        const allResult = await User.getSRUsers(1, 999999, null);

        console.log(`📊 Total SR users fetched: ${allResult.total}, users in result: ${allResult.users.length}`);

        // Enrich all users with shop data
        enrichedUsers = await Promise.all(allResult.users.map(async (user) => {
          try {
            // For SR users, get all shops to find B2B and B2C separately
            let b2bShop = null;
            let b2cShop = null;
            let shop = null;
            let approval_status = null;
            
            if (user.user_type === 'SR') {
              const allShops = await Shop.findAllByUserId(user.id);
              if (allShops.length > 0) {
                // Find B2C shop (shop_type = 3) and B2B shop (shop_type = 1 or 4)
                b2cShop = allShops.find(s => s.shop_type === 3);
                b2bShop = allShops.find(s => s.shop_type === 1 || s.shop_type === 4);
                
                // Calculate overall SR approval status - if both B2B and B2C are approved, show "approved"
                if (b2bShop && b2cShop) {
                  const b2bApproved = b2bShop.approval_status === 'approved';
                  const b2cApproved = b2cShop.approval_status === 'approved';
                  
                  console.log(`🔍 SR User ${user.id} - B2B status: ${b2bShop.approval_status}, B2C status: ${b2cShop.approval_status}`);
                  
                  if (b2bApproved && b2cApproved) {
                    approval_status = 'approved';
                    console.log(`✅ SR User ${user.id} - Both approved, setting overall status to: approved`);
                  } else if (b2bShop.approval_status === 'rejected' || b2cShop.approval_status === 'rejected') {
                    approval_status = 'rejected';
                    console.log(`❌ SR User ${user.id} - One or both rejected, setting overall status to: rejected`);
                  } else {
                    approval_status = 'pending';
                    console.log(`⏳ SR User ${user.id} - Not both approved, setting overall status to: pending`);
                  }
                } else if (b2bShop) {
                  approval_status = b2bShop.approval_status || 'pending';
                  console.log(`ℹ️ SR User ${user.id} - Only B2B shop exists, status: ${approval_status}`);
                } else if (b2cShop) {
                  approval_status = b2cShop.approval_status || 'pending';
                  console.log(`ℹ️ SR User ${user.id} - Only B2C shop exists, status: ${approval_status}`);
                }
                
                // Keep merged shop for backward compatibility (use B2B if available, otherwise B2C)
                if (b2bShop) {
                  shop = b2bShop;
                } else if (b2cShop) {
                  shop = b2cShop;
                } else if (allShops.length > 0) {
                  shop = allShops[0];
                }
              }
            } else {
              // For non-SR users, use the existing findByUserId method
              shop = await Shop.findByUserId(user.id);
              approval_status = shop?.approval_status || null;
            }

            return {
              ...user,
              shop: shop || null,
              b2bShop: b2bShop || null,
              b2cShop: b2cShop || null,
              shopname: shop?.shopname || '',
              contact: shop?.contact || user.mob_num || '',
              address: shop?.address || '',
              aadhar_card: shop?.aadhar_card || '',
              driving_license: shop?.driving_license || '',
              approval_status: approval_status
            };
          } catch (err) {
            console.error(`Error fetching shop for user ${user.id}:`, err);
            return {
              ...user,
              shop: null,
              b2bShop: null,
              b2cShop: null,
              shopname: '',
              contact: user.mob_num || '',
              address: '',
              aadhar_card: '',
              driving_license: '',
              approval_status: null
            };
          }
        }));

        // Apply search filter after enriching with shop data
        const searchTerm = search.trim();
        const searchTermLower = searchTerm.toLowerCase();
        const searchAsNumber = !isNaN(searchTerm) && searchTerm.length > 0 ? parseInt(searchTerm) : null;
        const searchAsNumberStr = searchAsNumber ? searchAsNumber.toString() : null;

        console.log(`🔍 Searching for: "${searchTerm}" (as number: ${searchAsNumber})`);

        enrichedUsers = enrichedUsers.filter(user => {
          // Search by phone number (mob_num from user)
          let userPhoneMatch = false;
          if (user.mob_num !== null && user.mob_num !== undefined) {
            const userPhoneStr = user.mob_num.toString();
            if (userPhoneStr.toLowerCase().includes(searchTermLower)) {
              userPhoneMatch = true;
            }
            if (searchAsNumber !== null && user.mob_num === searchAsNumber) {
              userPhoneMatch = true;
            }
          }

          // Search by contact number (contact from shop)
          let shopContactMatch = false;
          if (user.contact !== null && user.contact !== undefined && user.contact !== '') {
            const shopContactStr = user.contact.toString();
            if (shopContactStr.toLowerCase().includes(searchTermLower)) {
              shopContactMatch = true;
            }
            if (searchAsNumber !== null && user.contact === searchAsNumber) {
              shopContactMatch = true;
            }
          }

          // Search by name
          const nameMatch = user.name && typeof user.name === 'string' &&
            user.name.toLowerCase().includes(searchTermLower);

          return userPhoneMatch || shopContactMatch || nameMatch;
        });

        console.log(`🔍 Search results for "${search}": ${enrichedUsers.length} users found after filtering`);

        // Re-sort enriched users: v2 users first, then v1 users
        enrichedUsers.sort((a, b) => {
          // Prioritize v2 users over v1 users
          const aIsV2 = a.app_version === 'v2' ? 1 : 0;
          const bIsV2 = b.app_version === 'v2' ? 1 : 0;
          return bIsV2 - aIsV2; // v2 users come first
        });

        // Apply pagination after filtering
        total = enrichedUsers.length;
        const skip = (pageNumber - 1) * pageSize;
        const paginatedUsers = enrichedUsers.slice(skip, skip + pageSize);
        enrichedUsers = paginatedUsers;

        console.log(`🔍 Paginated search results: Showing ${paginatedUsers.length} of ${total} users`);
      } else {
        // No search - use normal pagination
        const result = await User.getSRUsers(page, limit, null);

        // Enrich paginated users with shop data
        enrichedUsers = await Promise.all(result.users.map(async (user) => {
          try {
            // For SR users, get all shops to find B2B and B2C separately
            let b2bShop = null;
            let b2cShop = null;
            let shop = null;
            let approval_status = null;
            
            if (user.user_type === 'SR') {
              const allShops = await Shop.findAllByUserId(user.id);
              if (allShops.length > 0) {
                // Find B2C shop (shop_type = 3) and B2B shop (shop_type = 1 or 4)
                b2cShop = allShops.find(s => s.shop_type === 3);
                b2bShop = allShops.find(s => s.shop_type === 1 || s.shop_type === 4);
                
                // Calculate overall SR approval status - if both B2B and B2C are approved, show "approved"
                if (b2bShop && b2cShop) {
                  const b2bApproved = b2bShop.approval_status === 'approved';
                  const b2cApproved = b2cShop.approval_status === 'approved';
                  
                  console.log(`🔍 SR User ${user.id} - B2B status: ${b2bShop.approval_status}, B2C status: ${b2cShop.approval_status}`);
                  
                  if (b2bApproved && b2cApproved) {
                    approval_status = 'approved';
                    console.log(`✅ SR User ${user.id} - Both approved, setting overall status to: approved`);
                  } else if (b2bShop.approval_status === 'rejected' || b2cShop.approval_status === 'rejected') {
                    approval_status = 'rejected';
                    console.log(`❌ SR User ${user.id} - One or both rejected, setting overall status to: rejected`);
                  } else {
                    approval_status = 'pending';
                    console.log(`⏳ SR User ${user.id} - Not both approved, setting overall status to: pending`);
                  }
                } else if (b2bShop) {
                  approval_status = b2bShop.approval_status || 'pending';
                  console.log(`ℹ️ SR User ${user.id} - Only B2B shop exists, status: ${approval_status}`);
                } else if (b2cShop) {
                  approval_status = b2cShop.approval_status || 'pending';
                  console.log(`ℹ️ SR User ${user.id} - Only B2C shop exists, status: ${approval_status}`);
                }
                
                // Keep merged shop for backward compatibility (use B2B if available, otherwise B2C)
                if (b2bShop) {
                  shop = b2bShop;
                } else if (b2cShop) {
                  shop = b2cShop;
                } else if (allShops.length > 0) {
                  shop = allShops[0];
                }
              }
            } else {
              // For non-SR users, use the existing findByUserId method
              shop = await Shop.findByUserId(user.id);
              approval_status = shop?.approval_status || null;
            }

            return {
              ...user,
              shop: shop || null,
              b2bShop: b2bShop || null,
              b2cShop: b2cShop || null,
              shopname: shop?.shopname || '',
              contact: shop?.contact || user.mob_num || '',
              address: shop?.address || '',
              aadhar_card: shop?.aadhar_card || '',
              driving_license: shop?.driving_license || '',
              approval_status: approval_status
            };
          } catch (err) {
            console.error(`Error fetching shop for user ${user.id}:`, err);
            return {
              ...user,
              shop: null,
              b2bShop: null,
              b2cShop: null,
              shopname: '',
              contact: user.mob_num || '',
              address: '',
              aadhar_card: '',
              driving_license: '',
              approval_status: null
            };
          }
        }));

        // Sort enriched users: v2 users first, then v1 users
        enrichedUsers.sort((a, b) => {
          const aIsV2 = a.app_version === 'v2' ? 1 : 0;
          const bIsV2 = b.app_version === 'v2' ? 1 : 0;
          return bIsV2 - aIsV2; // v2 users come first
        });

        total = result.total;
      }

      const responseData = {
        users: enrichedUsers,
        total: total,
        page: pageNumber,
        limit: pageSize,
        totalPages: Math.ceil(total / pageSize),
        hasMore: (pageNumber * pageSize) < total
      };

      res.json({
        status: 'success',
        msg: 'SR users retrieved',
        data: responseData
      });
    } catch (error) {
      console.error('srUsers error:', error);
      res.json({
        status: 'error',
        msg: 'Error fetching SR users',
        data: {
          users: [],
          total: 0,
          page: 1,
          limit: 10,
          totalPages: 0,
          hasMore: false
        }
      });
    }
  }

  // Get SR user details by ID
  static async getSRUserDetails(req, res) {
    try {
      const userId = parseInt(req.params.userId);
      console.log('✅ AdminPanelController.getSRUserDetails called', { userId });

      const User = require('../models/User');
      const Shop = require('../models/Shop');

      // Get user
      const user = await User.findById(userId);
      if (!user) {
        return res.json({
          status: 'error',
          msg: 'User not found',
          data: null
        });
      }

      // Check if user is SR type
      if (user.user_type !== 'SR') {
        return res.json({
          status: 'error',
          msg: 'User is not an SR user',
          data: null
        });
      }

      // For SR users, find all shops and return B2C and B2B shop data separately
      let b2bShop = null;
      let b2cShop = null;
      let shop = null; // Keep for backward compatibility
      
      if (user.user_type === 'SR') {
        const allShops = await Shop.findAllByUserId(userId);
        console.log(`🔍 All shops lookup for SR user ${userId}:`, allShops.length > 0 ? `Found ${allShops.length} shops` : 'Not found');
        console.log(`🔍 Shop details:`, allShops.map(s => ({ id: s.id, shop_type: s.shop_type, shopname: s.shopname, del_status: s.del_status })));

        if (allShops.length > 0) {
          // Find B2C shop (shop_type = 3) and B2B shop (shop_type = 1 or 4)
          b2cShop = allShops.find(s => s.shop_type === 3);
          b2bShop = allShops.find(s => s.shop_type === 1 || s.shop_type === 4);
          
          console.log(`🔍 Found B2C shop:`, b2cShop ? `ID ${b2cShop.id}, shop_type: ${b2cShop.shop_type}` : 'None');
          console.log(`🔍 Found B2B shop:`, b2bShop ? `ID ${b2bShop.id}, shop_type: ${b2bShop.shop_type}` : 'None');

          // Format B2B shop with all documents
          if (b2bShop) {
            b2bShop = {
              id: b2bShop.id,
              shopname: b2bShop.shopname || '',
              ownername: b2bShop.ownername || '',
              address: b2bShop.address || '',
              contact: b2bShop.contact || '',
              company_name: b2bShop.company_name || '',
              gst_number: b2bShop.gst_number || '',
              pan_number: b2bShop.pan_number || '',
              business_license_url: b2bShop.business_license_url || '',
              gst_certificate_url: b2bShop.gst_certificate_url || '',
              address_proof_url: b2bShop.address_proof_url || '',
              kyc_owner_url: b2bShop.kyc_owner_url || '',
              approval_status: b2bShop.approval_status || null,
              rejection_reason: b2bShop.rejection_reason || null,
              application_submitted_at: b2bShop.application_submitted_at || null,
              documents_verified_at: b2bShop.documents_verified_at || null,
              review_initiated_at: b2bShop.review_initiated_at || null,
              shop_type: b2bShop.shop_type,
              created_at: b2bShop.created_at,
              updated_at: b2bShop.updated_at
            };
          }

          // Format B2C shop with all documents
          if (b2cShop) {
            b2cShop = {
              id: b2cShop.id,
              shopname: b2cShop.shopname || '',
              address: b2cShop.address || '',
              contact: b2cShop.contact || '',
              aadhar_card: b2cShop.aadhar_card || '',
              driving_license: b2cShop.driving_license || '',
              approval_status: b2cShop.approval_status || null,
              rejection_reason: b2cShop.rejection_reason || null,
              application_submitted_at: b2cShop.application_submitted_at || null,
              documents_verified_at: b2cShop.documents_verified_at || null,
              review_initiated_at: b2cShop.review_initiated_at || null,
              shop_type: b2cShop.shop_type,
              created_at: b2cShop.created_at,
              updated_at: b2cShop.updated_at
            };
          }

          // Keep merged shop for backward compatibility (use B2B if available, otherwise B2C)
          if (b2bShop) {
            shop = b2bShop;
          } else if (b2cShop) {
            shop = b2cShop;
          } else if (allShops.length > 0) {
            // Use first shop if type doesn't match expected patterns
            shop = allShops[0];
            console.log(`⚠️ Using first shop (ID: ${shop.id}, shop_type: ${shop.shop_type}) for SR user`);
          }
        } else {
          console.log(`⚠️ No shops found for SR user ${userId}`);
        }
      } else {
        // For non-SR users, use the existing findByUserId method
        shop = await Shop.findByUserId(userId);
      }

      // Remove password from user object
      const { password: _, ...userWithoutPassword } = user;

      // Calculate overall SR approval status based on both shops
      let overallSRStatus = null;
      if (b2bShop && b2cShop) {
        const b2bApproved = b2bShop.approval_status === 'approved';
        const b2cApproved = b2cShop.approval_status === 'approved';
        
        if (b2bApproved && b2cApproved) {
          overallSRStatus = 'approved';
          console.log(`✅ Both B2B and B2C shops are approved - SR overall status: approved`);
        } else if (b2bShop.approval_status === 'rejected' || b2cShop.approval_status === 'rejected') {
          overallSRStatus = 'rejected';
          console.log(`⚠️ One or both shops are rejected - SR overall status: rejected`);
        } else {
          overallSRStatus = 'pending';
          console.log(`⏳ One or both shops are pending - SR overall status: pending`);
        }
      } else if (b2bShop) {
        // Only B2B shop exists
        overallSRStatus = b2bShop.approval_status || 'pending';
        console.log(`ℹ️ Only B2B shop exists - SR overall status: ${overallSRStatus}`);
      } else if (b2cShop) {
        // Only B2C shop exists
        overallSRStatus = b2cShop.approval_status || 'pending';
        console.log(`ℹ️ Only B2C shop exists - SR overall status: ${overallSRStatus}`);
      } else if (shop) {
        // Legacy shop
        overallSRStatus = shop.approval_status || 'pending';
        console.log(`ℹ️ Using legacy shop - SR overall status: ${overallSRStatus}`);
      }

      const responseData = {
        ...userWithoutPassword,
        shop: shop || null, // Keep for backward compatibility
        b2bShop: b2bShop || null, // B2B shop details with documents
        b2cShop: b2cShop || null,  // B2C shop details with documents
        srApprovalStatus: overallSRStatus // Overall SR approval status
      };

      // Log the response for debugging
      console.log(`🔍 getSRUserDetails response for user ${userId}:`, {
        hasB2BShop: !!b2bShop,
        hasB2CShop: !!b2cShop,
        b2bShopId: b2bShop?.id || null,
        b2cShopId: b2cShop?.id || null,
        hasShop: !!shop,
        shopId: shop?.id || null,
        shopType: shop?.shop_type || null,
        overallSRStatus: overallSRStatus
      });

      res.json({
        status: 'success',
        msg: 'SR user details retrieved',
        data: responseData
      });
    } catch (error) {
      console.error('getSRUserDetails error:', error);
      res.json({
        status: 'error',
        msg: 'Error fetching SR user details',
        data: null
      });
    }
  }

  // Update SR user approval status
  static async updateSRApprovalStatus(req, res) {
    try {
      const userId = parseInt(req.params.userId);
      const { approval_status, rejection_reason, shop_type } = req.body;

      console.log('✅ AdminPanelController.updateSRApprovalStatus called', {
        userId,
        approval_status,
        rejection_reason,
        shop_type
      });

      if (!['approved', 'rejected', 'pending'].includes(approval_status)) {
        return res.json({
          status: 'error',
          msg: 'Invalid approval status',
          data: null
        });
      }

      const User = require('../models/User');
      const Shop = require('../models/Shop');

      // Get user to verify it's an SR user
      const user = await User.findById(userId);
      if (!user) {
        return res.json({
          status: 'error',
          msg: 'User not found',
          data: null
        });
      }

      if (user.user_type !== 'SR') {
        return res.json({
          status: 'error',
          msg: 'User is not an SR user',
          data: null
        });
      }

      // Get all shops for this user
      const allShops = await Shop.findAllByUserId(userId);
      const b2bShop = allShops.find(s => s.shop_type === 1 || s.shop_type === 4);
      const b2cShop = allShops.find(s => s.shop_type === 3);

      // Determine which shop(s) to update
      let shopsToUpdate = [];
      if (shop_type === 'b2b' && b2bShop) {
        shopsToUpdate.push({ shop: b2bShop, type: 'B2B' });
      } else if (shop_type === 'b2c' && b2cShop) {
        shopsToUpdate.push({ shop: b2cShop, type: 'B2C' });
      } else if (!shop_type) {
        // If no shop_type specified, update both shops (for backward compatibility)
        if (b2bShop) shopsToUpdate.push({ shop: b2bShop, type: 'B2B' });
        if (b2cShop) shopsToUpdate.push({ shop: b2cShop, type: 'B2C' });
        // If no separate shops found, try legacy shop
        if (shopsToUpdate.length === 0) {
          const legacyShop = await Shop.findByUserId(userId);
          if (legacyShop) {
            shopsToUpdate.push({ shop: legacyShop, type: 'Legacy' });
          }
        }
      }

      if (shopsToUpdate.length === 0) {
        return res.json({
          status: 'error',
          msg: 'No shop found to update',
          data: null
        });
      }

      // Update each shop
      const updateData = {
        approval_status: approval_status
      };

      if (approval_status === 'rejected' && rejection_reason) {
        updateData.rejection_reason = rejection_reason;
      }

      for (const { shop, type } of shopsToUpdate) {
        await Shop.update(shop.id, updateData);
        console.log(`✅ Updated ${type} shop ${shop.id} approval status to ${approval_status}`);
      }

      // After updating, check if both B2B and B2C shops are approved
      // Re-fetch shops to get updated status
      const updatedAllShops = await Shop.findAllByUserId(userId);
      const updatedB2BShop = updatedAllShops.find(s => s.shop_type === 1 || s.shop_type === 4);
      const updatedB2CShop = updatedAllShops.find(s => s.shop_type === 3);
      
      let overallSRStatus = null;
      if (updatedB2BShop && updatedB2CShop) {
        const b2bApproved = updatedB2BShop.approval_status === 'approved';
        const b2cApproved = updatedB2CShop.approval_status === 'approved';
        
        if (b2bApproved && b2cApproved) {
          overallSRStatus = 'approved';
          console.log(`✅ Both B2B and B2C shops are approved - SR overall status: approved`);
        } else if (updatedB2BShop.approval_status === 'rejected' || updatedB2CShop.approval_status === 'rejected') {
          overallSRStatus = 'rejected';
          console.log(`⚠️ One or both shops are rejected - SR overall status: rejected`);
        } else {
          overallSRStatus = 'pending';
          console.log(`⏳ One or both shops are pending - SR overall status: pending`);
        }
      } else if (updatedB2BShop) {
        // Only B2B shop exists
        overallSRStatus = updatedB2BShop.approval_status || 'pending';
        console.log(`ℹ️ Only B2B shop exists - SR overall status: ${overallSRStatus}`);
      } else if (updatedB2CShop) {
        // Only B2C shop exists
        overallSRStatus = updatedB2CShop.approval_status || 'pending';
        console.log(`ℹ️ Only B2C shop exists - SR overall status: ${overallSRStatus}`);
      }

      // Invalidate cache
      await RedisCache.delete(RedisCache.adminKey('sr_users'));
      
      // Invalidate user profile cache
      try {
        const userIdStr = String(userId);
        await RedisCache.delete(RedisCache.userKey(userIdStr, 'profile'));
        await RedisCache.delete(RedisCache.userKey(userIdStr));
        await RedisCache.invalidateTableCache('shops');
      } catch (err) {
        console.error('Redis cache invalidation error:', err);
      }

      res.json({
        status: 'success',
        msg: `SR ${shopsToUpdate.map(s => s.type).join(' and ')} approval status updated to ${approval_status}`,
        data: {
          userId: userId,
          approval_status: approval_status,
          updatedShops: shopsToUpdate.map(s => ({ id: s.shop.id, type: s.type })),
          overallSRStatus: overallSRStatus,
          b2bStatus: updatedB2BShop?.approval_status || null,
          b2cStatus: updatedB2CShop?.approval_status || null
        }
      });
    } catch (error) {
      console.error('updateSRApprovalStatus error:', error);
      res.json({
        status: 'error',
        msg: 'Error updating SR approval status',
        data: null
      });
    }
  }

  // Get Delivery users (door buyers) list
  static async deliveryUsers(req, res) {
    try {
      console.log('✅ AdminPanelController.deliveryUsers called');
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 10;
      const search = req.query.search || null;
      const appVersion = req.query.app_version || null;

      const User = require('../models/User');
      const DeliveryBoy = require('../models/DeliveryBoy');

      let enrichedUsers;
      let total;
      const pageNumber = parseInt(page) || 1;
      const pageSize = parseInt(limit) || 10;

      // If searching, get all users first (no pagination), then filter, then paginate
      // If not searching, get paginated users directly
      if (search && search.trim()) {
        // Get all delivery users (no pagination) to search across entire database
        const allResult = await User.getDeliveryUsers(1, 999999, null);

        console.log(`📊 Total delivery users fetched: ${allResult.total}, users in result: ${allResult.users.length}`);

        // Enrich all users with delivery boy data
        enrichedUsers = await Promise.all(allResult.users.map(async (user) => {
          try {
            const deliveryBoy = await DeliveryBoy.findByUserId(user.id);
            const deliveryData = Array.isArray(deliveryBoy) && deliveryBoy.length > 0 ? deliveryBoy[0] : deliveryBoy;

            return {
              ...user,
              delivery: deliveryData || null,
              delivery_boy: deliveryData || null,
              contact: deliveryData?.contact || user.mob_num || '',
              address: deliveryData?.address || '',
              aadhar_card: deliveryData?.aadhar_card || '',
              driving_license: deliveryData?.driving_license || '',
              approval_status: deliveryData?.approval_status || 'pending'
            };
          } catch (err) {
            console.error(`Error fetching delivery boy for user ${user.id}:`, err);
            return {
              ...user,
              delivery: null,
              delivery_boy: null,
              contact: user.mob_num || '',
              address: '',
              aadhar_card: '',
              driving_license: '',
              approval_status: 'pending'
            };
          }
        }));

        // Apply search filter after enriching with delivery boy data
        const searchTerm = search.trim();
        const searchTermLower = searchTerm.toLowerCase();
        const searchAsNumber = !isNaN(searchTerm) && searchTerm.length > 0 ? parseInt(searchTerm) : null;

        console.log(`🔍 Searching for: "${searchTerm}" (as number: ${searchAsNumber})`);

        enrichedUsers = enrichedUsers.filter(user => {
          // Search by phone number (mob_num from user)
          let userPhoneMatch = false;
          if (user.mob_num !== null && user.mob_num !== undefined) {
            const userPhoneStr = user.mob_num.toString();
            if (userPhoneStr.toLowerCase().includes(searchTermLower)) {
              userPhoneMatch = true;
            }
            if (searchAsNumber !== null && user.mob_num === searchAsNumber) {
              userPhoneMatch = true;
            }
          }

          // Search by contact number (contact from delivery boy)
          let deliveryContactMatch = false;
          if (user.contact !== null && user.contact !== undefined && user.contact !== '') {
            const deliveryContactStr = user.contact.toString();
            if (deliveryContactStr.toLowerCase().includes(searchTermLower)) {
              deliveryContactMatch = true;
            }
            if (searchAsNumber !== null && user.contact === searchAsNumber) {
              deliveryContactMatch = true;
            }
          }

          // Search by name
          const nameMatch = user.name && typeof user.name === 'string' &&
            user.name.toLowerCase().includes(searchTermLower);

          return userPhoneMatch || deliveryContactMatch || nameMatch;
        });

        console.log(`🔍 Search results for "${search}": ${enrichedUsers.length} users found after filtering`);

        // Filter by app_version if specified
        if (appVersion && (appVersion === 'v1' || appVersion === 'v2')) {
          enrichedUsers = enrichedUsers.filter(user => {
            const userAppVersion = user.app_version || 'v1';
            return userAppVersion === appVersion;
          });
          console.log(`🔍 Filtered by app_version=${appVersion}: ${enrichedUsers.length} users found`);
        }

        // Re-sort enriched users: v2 users first, then v1 users
        enrichedUsers.sort((a, b) => {
          // Prioritize v2 users over v1 users
          const aIsV2 = a.app_version === 'v2' ? 1 : 0;
          const bIsV2 = b.app_version === 'v2' ? 1 : 0;
          return bIsV2 - aIsV2; // v2 users come first
        });

        // Apply pagination after filtering
        total = enrichedUsers.length;
        const skip = (pageNumber - 1) * pageSize;
        const paginatedUsers = enrichedUsers.slice(skip, skip + pageSize);
        enrichedUsers = paginatedUsers;

        console.log(`🔍 Paginated search results: Showing ${paginatedUsers.length} of ${total} users`);
      } else if (appVersion && (appVersion === 'v1' || appVersion === 'v2')) {
        // If app_version filter is specified, get all users first, then filter and paginate
        console.log(`🔍 Filtering by app_version=${appVersion}, fetching all users first`);
        const allResult = await User.getDeliveryUsers(1, 999999, null);

        // Enrich all users with delivery boy data
        enrichedUsers = await Promise.all(allResult.users.map(async (user) => {
          try {
            const deliveryBoy = await DeliveryBoy.findByUserId(user.id);
            const deliveryData = Array.isArray(deliveryBoy) && deliveryBoy.length > 0 ? deliveryBoy[0] : deliveryBoy;

            return {
              ...user,
              delivery: deliveryData || null,
              delivery_boy: deliveryData || null,
              contact: deliveryData?.contact || user.mob_num || '',
              address: deliveryData?.address || '',
              aadhar_card: deliveryData?.aadhar_card || '',
              driving_license: deliveryData?.driving_license || '',
              approval_status: deliveryData?.approval_status || 'pending'
            };
          } catch (err) {
            console.error(`Error fetching delivery boy for user ${user.id}:`, err);
            return {
              ...user,
              delivery: null,
              delivery_boy: null,
              contact: user.mob_num || '',
              address: '',
              aadhar_card: '',
              driving_license: '',
              approval_status: 'pending'
            };
          }
        }));

        // Filter by app_version
        enrichedUsers = enrichedUsers.filter(user => {
          const userAppVersion = user.app_version || 'v1';
          const matches = userAppVersion === appVersion;
          return matches;
        });
        console.log(`✅ Filtered by app_version=${appVersion}: ${enrichedUsers.length} users found out of ${allResult.users.length} total`);

        // Sort enriched users: v2 users first, then v1 users (though all should be same version now)
        enrichedUsers.sort((a, b) => {
          const aIsV2 = a.app_version === 'v2' ? 1 : 0;
          const bIsV2 = b.app_version === 'v2' ? 1 : 0;
          return bIsV2 - aIsV2;
        });

        // Apply pagination after filtering
        total = enrichedUsers.length;
        const skip = (pageNumber - 1) * pageSize;
        const paginatedUsers = enrichedUsers.slice(skip, skip + pageSize);
        enrichedUsers = paginatedUsers;

        console.log(`🔍 Paginated filtered results: Showing ${paginatedUsers.length} of ${total} users`);
      } else {
        // No search and no app_version filter - use normal pagination
        const result = await User.getDeliveryUsers(page, limit, null);

        // Enrich paginated users with delivery boy data
        enrichedUsers = await Promise.all(result.users.map(async (user) => {
          try {
            const deliveryBoy = await DeliveryBoy.findByUserId(user.id);
            const deliveryData = Array.isArray(deliveryBoy) && deliveryBoy.length > 0 ? deliveryBoy[0] : deliveryBoy;

            return {
              ...user,
              delivery: deliveryData || null,
              delivery_boy: deliveryData || null,
              contact: deliveryData?.contact || user.mob_num || '',
              address: deliveryData?.address || '',
              aadhar_card: deliveryData?.aadhar_card || '',
              driving_license: deliveryData?.driving_license || '',
              approval_status: deliveryData?.approval_status || 'pending'
            };
          } catch (err) {
            console.error(`Error fetching delivery boy for user ${user.id}:`, err);
            return {
              ...user,
              delivery: null,
              delivery_boy: null,
              contact: user.mob_num || '',
              address: '',
              aadhar_card: '',
              driving_license: '',
              approval_status: 'pending'
            };
          }
        }));

        // Filter by app_version if specified
        if (appVersion && (appVersion === 'v1' || appVersion === 'v2')) {
          enrichedUsers = enrichedUsers.filter(user => {
            const userAppVersion = user.app_version || 'v1';
            const matches = userAppVersion === appVersion;
            return matches;
          });
          console.log(`✅ Filtered by app_version=${appVersion}: ${enrichedUsers.length} users found`);
          // Recalculate total after filtering
          total = enrichedUsers.length;
          
          // Re-apply pagination after filtering
          const skip = (pageNumber - 1) * pageSize;
          const paginatedUsers = enrichedUsers.slice(skip, skip + pageSize);
          enrichedUsers = paginatedUsers;
        } else {
          // Sort enriched users: v2 users first, then v1 users
          enrichedUsers.sort((a, b) => {
            const aIsV2 = a.app_version === 'v2' ? 1 : 0;
            const bIsV2 = b.app_version === 'v2' ? 1 : 0;
            return bIsV2 - aIsV2; // v2 users come first
          });
          total = result.total;
        }
      }

      const responseData = {
        users: enrichedUsers,
        total: total,
        page: pageNumber,
        limit: pageSize,
        totalPages: Math.ceil(total / pageSize),
        hasMore: (pageNumber * pageSize) < total
      };

      res.json({
        status: 'success',
        msg: 'Delivery users retrieved',
        data: responseData
      });
    } catch (error) {
      console.error('deliveryUsers error:', error);
      res.json({
        status: 'error',
        msg: 'Error fetching delivery users',
        data: {
          users: [],
          total: 0,
          page: 1,
          limit: 10,
          totalPages: 0,
          hasMore: false
        }
      });
    }
  }

  // Get Customers (common users) list with pagination and search
  static async customers(req, res) {
    try {
      console.log('✅ AdminPanelController.customers called');
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 10;
      const search = req.query.search || null;

      // Check Redis cache first (only if no search term)
      const cacheKey = RedisCache.adminKey('customers', null, { page, limit, search });
      // Don't cache search results
      if (!search) {
        try {
          const cached = await RedisCache.get(cacheKey);
          if (cached) {
            console.log('⚡ Customers cache hit');
            return res.json({
              status: 'success',
              msg: 'Customers retrieved',
              data: cached
            });
          }
        } catch (err) {
          console.error('Redis get error:', err);
        }
      }

      const User = require('../models/User');
      const Customer = require('../models/Customer');

      let enrichedUsers;
      let total;
      const pageNumber = parseInt(page) || 1;
      const pageSize = parseInt(limit) || 10;

      // If searching, get all users first (no pagination), then filter, then paginate
      // If not searching, get paginated users directly
      if (search && search.trim()) {
        // Get all customers (no pagination) to search across entire database
        const allResult = await User.getCustomers(1, 999999, null);

        console.log(`📊 Total customers fetched: ${allResult.total}, users in result: ${allResult.users.length}`);

        // Enrich all users with customer data
        const Address = require('../models/Address');
        enrichedUsers = await Promise.all(allResult.users.map(async (user) => {
          try {
            const customer = await Customer.findByUserId(user.id);
            
            // Get address from customer table first, then from addresses table if not found
            let customerAddress = customer?.address || '';
            if (!customerAddress) {
              try {
                let addresses = [];
                // Try with customer.id first
                if (customer?.id) {
                  addresses = await Address.findByCustomerId(customer.id);
                }
                // Also try with user.id (user_id) as addresses are often saved with customer_id = user_id
                if ((!addresses || addresses.length === 0) && user.id) {
                  addresses = await Address.findByCustomerId(user.id);
                }
                
                if (addresses && addresses.length > 0) {
                  // Sort by created_at (most recent first) and get the latest address
                  addresses.sort((a, b) => {
                    const dateA = new Date(a.created_at || a.updated_at || 0).getTime();
                    const dateB = new Date(b.created_at || b.updated_at || 0).getTime();
                    return dateB - dateA; // Descending order (newest first)
                  });
                  customerAddress = addresses[0]?.address || '';
                }
              } catch (addrErr) {
                console.error(`Error fetching addresses for customer ${customer?.id || user.id}:`, addrErr);
              }
            }

            return {
              ...user,
              customer: customer || null,
              contact: customer?.contact ? String(customer.contact) : (user.mob_num ? String(user.mob_num) : ''),
              address: customerAddress,
              email: customer?.email || user.email || '',
              location: customer?.location || '',
              state: customer?.state || '',
              place: customer?.place || ''
            };
          } catch (err) {
            console.error(`Error fetching customer for user ${user.id}:`, err);
            return {
              ...user,
              customer: null,
              contact: user.mob_num ? String(user.mob_num) : '',
              address: '',
              email: user.email || '',
              location: '',
              state: '',
              place: ''
            };
          }
        }));

        // Apply search filter after enriching with customer data
        const searchTerm = search.trim();
        const searchTermLower = searchTerm.toLowerCase();
        const searchAsNumber = !isNaN(searchTerm) && searchTerm.length > 0 ? parseInt(searchTerm) : null;
        const searchAsNumberStr = searchAsNumber ? searchAsNumber.toString() : null;

        console.log(`🔍 Searching for: "${searchTerm}" (as number: ${searchAsNumber})`);

        enrichedUsers = enrichedUsers.filter(user => {
          // Search by phone number (mob_num from user)
          let userPhoneMatch = false;
          if (user.mob_num !== null && user.mob_num !== undefined) {
            const userPhoneStr = user.mob_num.toString();
            if (userPhoneStr.toLowerCase().includes(searchTermLower)) {
              userPhoneMatch = true;
            }
            if (searchAsNumber !== null && user.mob_num === searchAsNumber) {
              userPhoneMatch = true;
            }
          }

          // Search by contact number (contact from customer)
          let customerContactMatch = false;
          if (user.contact !== null && user.contact !== undefined && user.contact !== '') {
            const customerContactStr = user.contact.toString();
            if (customerContactStr.toLowerCase().includes(searchTermLower)) {
              customerContactMatch = true;
            }
            if (searchAsNumber !== null && user.contact === searchAsNumber) {
              customerContactMatch = true;
            }
          }

          // Search by name
          const nameMatch = user.name && typeof user.name === 'string' &&
            user.name.toLowerCase().includes(searchTermLower);

          // Search by email
          const emailMatch = user.email && typeof user.email === 'string' &&
            user.email.toLowerCase().includes(searchTermLower);

          return userPhoneMatch || customerContactMatch || nameMatch || emailMatch;
        });

        console.log(`🔍 Search results for "${search}": ${enrichedUsers.length} customers found after filtering`);

        // Sort enriched users by app_version (v2 first, then v1), without sorting by date
        enrichedUsers.sort((a, b) => {
          const aIsV2 = a.app_version === 'v2' ? 1 : 0;
          const bIsV2 = b.app_version === 'v2' ? 1 : 0;
          return bIsV2 - aIsV2; // v2 users come first
        });

        // Apply pagination after filtering
        total = enrichedUsers.length;
        const skip = (pageNumber - 1) * pageSize;
        const paginatedUsers = enrichedUsers.slice(skip, skip + pageSize);
        enrichedUsers = paginatedUsers;

        console.log(`🔍 Paginated search results: Showing ${paginatedUsers.length} of ${total} customers`);
      } else {
        // No search - use normal pagination
        const result = await User.getCustomers(page, limit, null);

        // Enrich paginated users with customer data
        const Address = require('../models/Address');
        enrichedUsers = await Promise.all(result.users.map(async (user) => {
          try {
            const customer = await Customer.findByUserId(user.id);
            
            // Get address from customer table first, then from addresses table if not found
            let customerAddress = customer?.address || '';
            if (!customerAddress) {
              try {
                let addresses = [];
                // Try with customer.id first
                if (customer?.id) {
                  addresses = await Address.findByCustomerId(customer.id);
                }
                // Also try with user.id (user_id) as addresses are often saved with customer_id = user_id
                if ((!addresses || addresses.length === 0) && user.id) {
                  addresses = await Address.findByCustomerId(user.id);
                }
                
                if (addresses && addresses.length > 0) {
                  // Sort by created_at (most recent first) and get the latest address
                  addresses.sort((a, b) => {
                    const dateA = new Date(a.created_at || a.updated_at || 0).getTime();
                    const dateB = new Date(b.created_at || b.updated_at || 0).getTime();
                    return dateB - dateA; // Descending order (newest first)
                  });
                  customerAddress = addresses[0]?.address || '';
                }
              } catch (addrErr) {
                console.error(`Error fetching addresses for customer ${customer?.id || user.id}:`, addrErr);
              }
            }

            return {
              ...user,
              customer: customer || null,
              contact: customer?.contact ? String(customer.contact) : (user.mob_num ? String(user.mob_num) : ''),
              address: customerAddress,
              email: customer?.email || user.email || '',
              location: customer?.location || '',
              state: customer?.state || '',
              place: customer?.place || ''
            };
          } catch (err) {
            console.error(`Error fetching customer for user ${user.id}:`, err);
            return {
              ...user,
              customer: null,
              contact: user.mob_num ? String(user.mob_num) : '',
              address: '',
              email: user.email || '',
              location: '',
              state: '',
              place: ''
            };
          }
        }));

        // Sort enriched users by app_version (v2 first, then v1), without sorting by date
        enrichedUsers.sort((a, b) => {
          const aIsV2 = a.app_version === 'v2' ? 1 : 0;
          const bIsV2 = b.app_version === 'v2' ? 1 : 0;
          return bIsV2 - aIsV2; // v2 users come first
        });

        total = result.total;
      }

      const responseData = {
        users: enrichedUsers,
        total: total,
        page: pageNumber,
        limit: pageSize,
        totalPages: Math.ceil(total / pageSize),
        hasMore: (pageNumber * pageSize) < total
      };

      // Cache for 5 minutes (only if no search term)
      if (!search) {
        try {
          await RedisCache.set(cacheKey, responseData, 'short');
          console.log('💾 Customers cached');
        } catch (err) {
          console.error('Redis cache set error:', err);
        }
      }

      res.json({
        status: 'success',
        msg: 'Customers retrieved',
        data: responseData
      });
    } catch (error) {
      console.error('customers error:', error);
      res.json({
        status: 'error',
        msg: 'Error fetching customers',
        data: {
          users: [],
          total: 0,
          page: 1,
          limit: 10,
          totalPages: 0,
          hasMore: false
        }
      });
    }
  }

  // Get B2C user details
  static async getB2CUserDetails(req, res) {
    try {
      console.log('✅ AdminPanelController.getB2CUserDetails called');
      const userId = req.params.userId;

      if (!userId) {
        return res.status(400).json({
          status: 'error',
          msg: 'User ID is required',
          data: null
        });
      }

      // Get user
      const user = await User.findById(userId);
      if (!user) {
        return res.status(404).json({
          status: 'error',
          msg: 'User not found',
          data: null
        });
      }

      // Get shop data with documents
      const shop = await Shop.findByUserId(userId);

      const userData = {
        id: user.id,
        name: user.name || '',
        email: user.email || '',
        phone: user.mob_num || '',
        user_type: user.user_type,
        app_type: user.app_type,
        created_at: user.created_at,
        updated_at: user.updated_at,
        shop: shop ? {
          id: shop.id,
          shopname: shop.shopname || '',
          address: shop.address || '',
          contact: shop.contact || '',
          aadhar_card: shop.aadhar_card || '',
          driving_license: shop.driving_license || '',
          approval_status: shop.approval_status || null,
          rejection_reason: shop.rejection_reason || null,
          application_submitted_at: shop.application_submitted_at || null,
          documents_verified_at: shop.documents_verified_at || null,
          review_initiated_at: shop.review_initiated_at || null,
          created_at: shop.created_at,
          updated_at: shop.updated_at
        } : null
      };

      res.json({
        status: 'success',
        msg: 'B2C user details retrieved',
        data: userData
      });
    } catch (error) {
      console.error('getB2CUserDetails error:', error);
      res.status(500).json({
        status: 'error',
        msg: 'Error fetching B2C user details',
        data: null
      });
    }
  }

  // Update B2C approval status
  static async updateB2CApprovalStatus(req, res) {
    try {
      console.log('✅ AdminPanelController.updateB2CApprovalStatus called');
      const userId = req.params.userId;
      const { approval_status, rejection_reason } = req.body;

      if (!userId) {
        return res.status(400).json({
          status: 'error',
          msg: 'User ID is required',
          data: null
        });
      }

      if (!approval_status || !['approved', 'rejected', 'pending'].includes(approval_status)) {
        return res.status(400).json({
          status: 'error',
          msg: 'Valid approval_status is required (approved, rejected, or pending)',
          data: null
        });
      }

      // Get shop by user_id
      const shop = await Shop.findByUserId(userId);
      if (!shop) {
        return res.status(404).json({
          status: 'error',
          msg: 'Shop record not found for this user',
          data: null
        });
      }

      // Prepare update data
      const updateData = {
        approval_status: approval_status
      };

      // Add rejection reason if status is rejected
      if (approval_status === 'rejected' && rejection_reason) {
        updateData.rejection_reason = rejection_reason;
        console.log('📋 Rejection reason:', rejection_reason);
      } else if (approval_status !== 'rejected') {
        // Clear rejection reason if status is not rejected
        updateData.rejection_reason = null;
      }

      // Track timestamps for approval workflow
      const currentTime = new Date().toISOString();

      // If status is being set to pending and review_initiated_at is not set, set it
      if (approval_status === 'pending' && !shop.review_initiated_at) {
        updateData.review_initiated_at = currentTime;
        console.log('📋 Setting review_initiated_at for B2C user:', userId);
      }

      // If status is being changed to approved or rejected, set documents_verified_at
      if ((approval_status === 'approved' || approval_status === 'rejected') && !shop.documents_verified_at) {
        updateData.documents_verified_at = currentTime;
        console.log('📋 Setting documents_verified_at for B2C user:', userId);
      }

      // Update approval status and rejection reason
      // Note: Shop.update automatically sets updated_at, so don't include it here
      await Shop.update(shop.id, updateData);

      // Invalidate B2C users cache (first page only - approval status doesn't affect list order)
      try {
        await RedisCache.invalidateB2CUsersCacheFirstPage();
        console.log('🗑️  Invalidated B2C users cache (first page) after approval status update');
      } catch (err) {
        console.error('Redis cache invalidation error:', err);
      }

      // Invalidate user profile cache to ensure fresh data in React Native app
      try {
        const userIdStr = String(userId);
        console.log(`🗑️  Invalidating profile cache for user ${userIdStr} after approval status update`);

        // Invalidate user profile cache
        await RedisCache.delete(RedisCache.userKey(userIdStr, 'profile'));
        await RedisCache.delete(RedisCache.userKey(userIdStr));

        // Invalidate get_user_by_id cache for shops table
        await RedisCache.delete(RedisCache.listKey('user_by_id', { user_id: userIdStr, table: 'shops' }));

        // Invalidate shops table cache
        await RedisCache.invalidateTableCache('shops');

        console.log(`✅ Profile cache invalidated for user ${userIdStr}`);
      } catch (err) {
        console.error('Redis profile cache invalidation error:', err);
      }

      res.json({
        status: 'success',
        msg: `B2C approval status updated to ${approval_status}`,
        data: {
          userId: userId,
          shopId: shop.id,
          approval_status: approval_status
        }
      });
    } catch (error) {
      console.error('updateB2CApprovalStatus error:', error);
      res.status(500).json({
        status: 'error',
        msg: 'Error updating approval status',
        data: null
      });
    }
  }

  // Update contacted status for B2C users
  static async updateB2CContactedStatus(req, res) {
    try {
      console.log('✅ AdminPanelController.updateB2CContactedStatus called');
      const userId = req.params.userId;
      const { is_contacted } = req.body;

      if (!userId) {
        return res.status(400).json({
          status: 'error',
          msg: 'User ID is required',
          data: null
        });
      }

      if (typeof is_contacted !== 'boolean') {
        return res.status(400).json({
          status: 'error',
          msg: 'is_contacted must be a boolean value',
          data: null
        });
      }

      const Shop = require('../models/Shop');

      // Get shop by user_id
      const shop = await Shop.findByUserId(userId);
      if (!shop) {
        return res.status(404).json({
          status: 'error',
          msg: 'Shop record not found for this user',
          data: null
        });
      }

      // Update the is_contacted field
      const updateData = {
        is_contacted: is_contacted
      };

      await Shop.update(shop.id, updateData);

      console.log(`✅ Updated contacted status for B2C user ${userId}: ${is_contacted}`);

      res.json({
        status: 'success',
        msg: `Contacted status updated to ${is_contacted ? 'true' : 'false'}`,
        data: {
          userId: userId,
          shopId: shop.id,
          is_contacted: is_contacted
        }
      });
    } catch (error) {
      console.error('updateB2CContactedStatus error:', error);
      res.status(500).json({
        status: 'error',
        msg: 'Error updating contacted status',
        data: null
      });
    }
  }

  // Get Delivery/Door Step user details
  static async getDeliveryUserDetails(req, res) {
    try {
      console.log('✅ AdminPanelController.getDeliveryUserDetails called');
      const userId = req.params.userId;

      if (!userId) {
        return res.status(400).json({
          status: 'error',
          msg: 'User ID is required',
          data: null
        });
      }

      // Get user
      const user = await User.findById(userId);
      if (!user) {
        return res.status(404).json({
          status: 'error',
          msg: 'User not found',
          data: null
        });
      }

      // Get delivery boy data with documents
      const DeliveryBoy = require('../models/DeliveryBoy');
      const deliveryBoy = await DeliveryBoy.findByUserId(userId);

      const userData = {
        id: user.id,
        name: user.name || '',
        email: user.email || '',
        phone: user.mob_num || '',
        user_type: user.user_type,
        app_type: user.app_type,
        created_at: user.created_at,
        updated_at: user.updated_at,
        delivery_boy: deliveryBoy ? {
          id: deliveryBoy.id,
          name: deliveryBoy.name || '',
          address: deliveryBoy.address || '',
          contact: deliveryBoy.contact || '',
          vehicle_type: deliveryBoy.vehicle_type || '',
          vehicle_model: deliveryBoy.vehicle_model || '',
          vehicle_registration_number: deliveryBoy.vehicle_registration_number || '',
          aadhar_card: deliveryBoy.aadhar_card || '',
          driving_license: deliveryBoy.driving_license || '',
          approval_status: deliveryBoy.approval_status || null,
          rejection_reason: deliveryBoy.rejection_reason || null,
          application_submitted_at: deliveryBoy.application_submitted_at || null,
          documents_verified_at: deliveryBoy.documents_verified_at || null,
          review_initiated_at: deliveryBoy.review_initiated_at || null,
          created_at: deliveryBoy.created_at,
          updated_at: deliveryBoy.updated_at
        } : null
      };

      // Also add delivery object for consistency
      if (deliveryBoy) {
        userData.delivery = userData.delivery_boy;
      }

      res.json({
        status: 'success',
        msg: 'Delivery user details retrieved',
        data: userData
      });
    } catch (error) {
      console.error('getDeliveryUserDetails error:', error);
      res.status(500).json({
        status: 'error',
        msg: 'Error fetching delivery user details',
        data: null
      });
    }
  }

  // Update Delivery/Door Step approval status
  static async updateDeliveryApprovalStatus(req, res) {
    try {
      console.log('✅ AdminPanelController.updateDeliveryApprovalStatus called');
      const userId = req.params.userId;
      const { approval_status, rejection_reason } = req.body;

      if (!userId) {
        return res.status(400).json({
          status: 'error',
          msg: 'User ID is required',
          data: null
        });
      }

      if (!approval_status || !['approved', 'rejected', 'pending'].includes(approval_status)) {
        return res.status(400).json({
          status: 'error',
          msg: 'Valid approval_status is required (approved, rejected, or pending)',
          data: null
        });
      }

      // Get delivery boy by user_id
      const DeliveryBoy = require('../models/DeliveryBoy');
      const deliveryBoy = await DeliveryBoy.findByUserId(userId);
      if (!deliveryBoy) {
        return res.status(404).json({
          status: 'error',
          msg: 'Delivery boy record not found for this user',
          data: null
        });
      }

      // Prepare update data
      const updateData = {
        approval_status: approval_status
      };

      // Add rejection reason if status is rejected
      if (approval_status === 'rejected' && rejection_reason) {
        updateData.rejection_reason = rejection_reason;
        console.log('📋 Rejection reason:', rejection_reason);
      } else if (approval_status !== 'rejected') {
        // Clear rejection reason if status is not rejected
        updateData.rejection_reason = null;
      }

      // Track timestamps for approval workflow
      const currentTime = new Date().toISOString();

      // If status is being set to pending and review_initiated_at is not set, set it
      if (approval_status === 'pending' && !deliveryBoy.review_initiated_at) {
        updateData.review_initiated_at = currentTime;
        console.log('📋 Setting review_initiated_at for delivery user:', userId);
      }

      // If status is being changed to approved or rejected, set documents_verified_at
      if ((approval_status === 'approved' || approval_status === 'rejected') && !deliveryBoy.documents_verified_at) {
        updateData.documents_verified_at = currentTime;
        console.log('📋 Setting documents_verified_at for delivery user:', userId);
      }

      // Update approval status and rejection reason
      await DeliveryBoy.update(deliveryBoy.id, updateData);

      // Invalidate user profile cache to ensure fresh data in React Native app
      try {
        const RedisCache = require('../utils/redisCache');
        await RedisCache.invalidateUserProfileCache(userId);
        console.log('🗑️  Invalidated user profile cache after delivery approval status update');
      } catch (err) {
        console.error('Redis cache invalidation error:', err);
      }

      res.json({
        status: 'success',
        msg: 'Delivery approval status updated successfully',
        data: {
          approval_status: approval_status,
          rejection_reason: approval_status === 'rejected' ? rejection_reason : null
        }
      });
    } catch (error) {
      console.error('updateDeliveryApprovalStatus error:', error);
      res.status(500).json({
        status: 'error',
        msg: 'Error updating approval status',
        data: null
      });
    }
  }

  // ==================== SUBCATEGORY APPROVAL MANAGEMENT ====================

  /**
   * Get all pending subcategory requests from B2C users
   * GET /admin/subcategory-requests/pending
   */
  static async getPendingSubcategoryRequests(req, res) {
    try {
      console.log('✅ AdminPanelController.getPendingSubcategoryRequests called');

      const Subcategory = require('../models/Subcategory');
      const CategoryImgKeywords = require('../models/CategoryImgKeywords');
      const User = require('../models/User');

      const pendingRequests = await Subcategory.findPendingRequests();
      const mainCategories = await CategoryImgKeywords.getAll();

      // Create a map of main category ID to name
      const mainCategoryMap = {};
      mainCategories.forEach(cat => {
        mainCategoryMap[cat.id] = {
          id: cat.id,
          name: cat.category_name || cat.cat_name || '',
          image: cat.category_img || cat.cat_img || ''
        };
      });

      // Enrich with main category info and user info
      const enriched = await Promise.all(pendingRequests.map(async (sub) => {
        let requesterInfo = null;
        if (sub.requested_by_user_id) {
          try {
            const requester = await User.findById(sub.requested_by_user_id);
            if (requester) {
              requesterInfo = {
                id: requester.id,
                name: requester.name,
                contact: requester.contact || requester.mob_num || '',
                email: requester.email || '',
                user_type: requester.user_type
              };
            }
          } catch (err) {
            console.error('Error fetching requester info:', err);
          }
        }

        return {
          id: sub.id,
          subcategory_name: sub.subcategory_name,
          subcategory_img: sub.subcategory_img || '',
          default_price: sub.default_price || '0',
          price_unit: sub.price_unit || 'kg',
          main_category_id: sub.main_category_id,
          main_category: mainCategoryMap[sub.main_category_id] || null,
          approval_status: sub.approval_status,
          requested_by_user_id: sub.requested_by_user_id,
          requester: requesterInfo,
          created_at: sub.created_at,
          updated_at: sub.updated_at
        };
      }));

      return res.json({
        status: 'success',
        msg: 'Pending subcategory requests retrieved successfully',
        data: enriched,
        count: enriched.length
      });
    } catch (err) {
      console.error('❌ Error fetching pending subcategory requests:', err);
      return res.status(500).json({
        status: 'error',
        msg: 'Error fetching pending subcategory requests: ' + err.message,
        data: null
      });
    }
  }

  /**
   * Approve or reject a subcategory request
   * POST /admin/subcategory-requests/:id/approve
   * Body: { action: 'approve' | 'reject', approval_notes?: string }
   */
  static async approveRejectSubcategoryRequest(req, res) {
    try {
      console.log('✅ AdminPanelController.approveRejectSubcategoryRequest called');
      const { id } = req.params;
      const { action, approval_notes } = req.body;
      const adminUserId = req.user?.id || req.body.admin_user_id;

      if (!id) {
        return res.status(400).json({
          status: 'error',
          msg: 'Subcategory ID is required',
          data: null
        });
      }

      if (!action || !['approve', 'reject'].includes(action)) {
        return res.status(400).json({
          status: 'error',
          msg: 'Action must be either "approve" or "reject"',
          data: null
        });
      }

      const Subcategory = require('../models/Subcategory');
      const RedisCache = require('../utils/redisCache');

      const subcategory = await Subcategory.findById(parseInt(id));
      if (!subcategory) {
        return res.status(404).json({
          status: 'error',
          msg: 'Subcategory not found',
          data: null
        });
      }

      if (subcategory.approval_status !== 'pending') {
        return res.status(400).json({
          status: 'error',
          msg: `Subcategory is already ${subcategory.approval_status}`,
          data: null
        });
      }

      const updateData = {
        approval_status: action === 'approve' ? 'approved' : 'rejected',
        approved_by_user_id: adminUserId ? parseInt(adminUserId) : null,
        approval_notes: approval_notes || null
      };

      const result = await Subcategory.update(parseInt(id), updateData);

      if (result.affectedRows === 0) {
        return res.status(404).json({
          status: 'error',
          msg: 'Subcategory not found',
          data: null
        });
      }

      const updatedSubcategory = await Subcategory.findById(parseInt(id));

      // Invalidate v2 API caches
      try {
        const categoryId = updatedSubcategory?.main_category_id;
        await RedisCache.invalidateV2ApiCache('subcategories', null, { categoryId: categoryId || 'all' });
        await RedisCache.invalidateV2ApiCache('categories', null, {});
        console.log(`🗑️  Invalidated v2 subcategories cache after ${action}ing subcategory`);
      } catch (err) {
        console.error('Cache invalidation error:', err);
      }

      return res.json({
        status: 'success',
        msg: `Subcategory ${action === 'approve' ? 'approved' : 'rejected'} successfully`,
        data: updatedSubcategory
      });
    } catch (err) {
      console.error('❌ Error approving/rejecting subcategory:', err);
      return res.status(500).json({
        status: 'error',
        msg: `Error ${req.body.action === 'approve' ? 'approving' : 'rejecting'} subcategory: ` + err.message,
        data: null
      });
    }
  }

  /**
   * Clear Redis cache for specific user types (B2B, B2C, SR, D)
   * POST /admin/cache/clear
   * Body: { userType: 'b2b' | 'b2c' | 'sr' | 'd' | 'all' }
   */
  static async clearCacheByUserType(req, res) {
    try {
      const { userType } = req.body;
      const RedisCache = require('../utils/redisCache');
      const User = require('../models/User');
      const Shop = require('../models/Shop');

      if (!userType || !['b2b', 'b2c', 'sr', 'd', 'all'].includes(userType.toLowerCase())) {
        return res.status(400).json({
          status: 'error',
          msg: 'Invalid user type. Must be one of: b2b, b2c, sr, d, all',
          data: null
        });
      }

      const type = userType.toLowerCase();
      let deletedCount = 0;
      const deletedKeys = [];

      console.log(`🗑️  Clearing cache for user type: ${type}`);

      if (type === 'all') {
        // Clear cache for all user types
        const allTypes = ['b2b', 'b2c', 'sr', 'd'];
        for (const t of allTypes) {
          const result = await this._clearCacheForUserType(t, User, Shop, RedisCache);
          deletedCount += result.count;
          deletedKeys.push(...result.keys);
        }
      } else {
        const result = await this._clearCacheForUserType(type, User, Shop, RedisCache);
        deletedCount = result.count;
        deletedKeys.push(...result.keys);
      }

      res.json({
        status: 'success',
        msg: `Cache cleared for ${type === 'all' ? 'all user types' : type.toUpperCase()} users`,
        data: {
          userType: type,
          deletedCount: deletedCount,
          deletedKeys: deletedKeys.slice(0, 100) // Limit to first 100 keys for response size
        }
      });
    } catch (error) {
      console.error('❌ Error clearing cache:', error);
      res.status(500).json({
        status: 'error',
        msg: 'Failed to clear cache: ' + error.message,
        data: null
      });
    }
  }

  /**
   * Helper method to clear cache for a specific user type
   */
  static async _clearCacheForUserType(userType, User, Shop, RedisCache) {
    let deletedCount = 0;
    const deletedKeys = [];
    
    try {
      // Map user types to user_type values
      const userTypeMap = {
        'b2b': 'S',
        'b2c': 'R',
        'sr': 'SR',
        'd': 'D'
      };

      const dbUserType = userTypeMap[userType];
      if (!dbUserType) {
        return { count: 0, keys: [] };
      }

      // Get all users of this type
      let users = [];
      if (userType === 'b2b') {
        const result = await User.getB2BUsers(1, 999999, null);
        users = result.users || [];
      } else if (userType === 'b2c') {
        const result = await User.getB2CUsers(1, 999999, null);
        users = result.users || [];
      } else if (userType === 'sr') {
        const result = await User.getSRUsers(1, 999999, null);
        users = result.users || [];
      } else if (userType === 'd') {
        const result = await User.getDeliveryUsers(1, 999999, null);
        users = result.users || [];
      }

      console.log(`🔍 Found ${users.length} ${userType.toUpperCase()} users to clear cache for`);

      // Clear admin panel user list caches first (most important)
      const commonLimits = [10, 20, 50, 100];
      const commonPages = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
      
      // Clear admin list caches with various pagination combinations
      for (const limit of commonLimits) {
        for (const page of commonPages) {
          const adminKey = RedisCache.adminKey(`${userType}_users`, null, { page, limit });
          if (await RedisCache.delete(adminKey)) {
            deletedCount++;
            deletedKeys.push(adminKey);
          }
        }
      }

      // Clear base admin cache
      const baseAdminKey = RedisCache.adminKey(`${userType}_users`);
      if (await RedisCache.delete(baseAdminKey)) {
        deletedCount++;
        deletedKeys.push(baseAdminKey);
      }

      // Clear cache for a sample of users (first 100 to avoid timeout)
      const usersToProcess = users.slice(0, 100);
      console.log(`🔍 Processing cache clear for ${usersToProcess.length} users (limited to 100 for performance)`);

      for (const user of usersToProcess) {
        const userId = String(user.id);
        
        // Clear user profile cache
        const userProfileKey = RedisCache.userKey(userId, 'profile');
        if (await RedisCache.delete(userProfileKey)) {
          deletedCount++;
          deletedKeys.push(userProfileKey);
        }

        // Clear user cache
        const userKey = RedisCache.userKey(userId);
        if (await RedisCache.delete(userKey)) {
          deletedCount++;
          deletedKeys.push(userKey);
        }

        // Clear dashboard cache based on user type
        let dashboardType = 'b2b';
        if (userType === 'b2c') dashboardType = 'b2c';
        else if (userType === 'sr') dashboardType = 'b2b'; // SR users use B2B dashboard
        else if (userType === 'd') dashboardType = 'delivery';
        
        const dashboardKey = RedisCache.dashboardKey(dashboardType, userId);
        if (await RedisCache.delete(dashboardKey)) {
          deletedCount++;
          deletedKeys.push(dashboardKey);
        }
      }

      // If there are more users, log a message
      if (users.length > 100) {
        console.log(`ℹ️  Note: ${users.length - 100} more users exist. Their individual caches will expire naturally.`);
      }

      console.log(`✅ Cleared ${deletedCount} cache keys for ${userType.toUpperCase()} users`);
      return { count: deletedCount, keys: deletedKeys };
    } catch (error) {
      console.error(`❌ Error clearing cache for ${userType}:`, error);
      return { count: deletedCount, keys: deletedKeys };
    }
  }

  // V2 User Types Dashboard (R, S, SR, D, C)
  // No caching - always fetch fresh data from database
  static async v2UserTypesDashboard(req, res) {
    console.log('✅ AdminPanelController.v2UserTypesDashboard called (no cache)');

    try {
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Query timeout')), 30000);
      });

      // Get counts for each v2 user type (N, R, S, SR, D, C)
      // Filter: app_version='v2' AND app_type='vendor_app' for N, R, S, SR, D
      // Filter: app_version='v2' AND app_type='customer_app' for C
      // No caching - always fetch fresh data
      const dataPromise = Promise.all([
        User.countByUserTypeV2('N'), // New User (v2, vendor_app)
        User.countByUserTypeV2('R'), // Recycler (v2, vendor_app)
        User.countByUserTypeV2('S'), // Shop (v2, vendor_app)
        User.countByUserTypeV2('SR'), // Shop Recycler (v2, vendor_app)
        User.countByUserTypeV2('D'), // Delivery (v2, vendor_app)
        User.countByUserTypeV2('C'), // Customer (v2, customer_app)
        // Get monthly counts for each type (v2 with app_type filter)
        User.getMonthlyCountByUserTypeV2('N'),
        User.getMonthlyCountByUserTypeV2('R'),
        User.getMonthlyCountByUserTypeV2('S'),
        User.getMonthlyCountByUserTypeV2('SR'),
        User.getMonthlyCountByUserTypeV2('D'),
        User.getMonthlyCountByUserTypeV2('C'),
        // Get order counts
        Order.countCustomerAppOrdersV2(), // Orders from v2 customer_app users
        Order.countBulkOrders(), // Bulk orders (buy/sell)
        // Get recent order details
        Order.getCustomerAppOrdersV2(10), // Recent customer_app orders
        Order.getBulkOrders(10) // Recent bulk orders
      ]);

      const [
        newUserCount,
        recyclerCount,
        shopCount,
        shopRecyclerCount,
        deliveryCount,
        customerCount,
        newUserMonthly,
        recyclerMonthly,
        shopMonthly,
        shopRecyclerMonthly,
        deliveryMonthly,
        customerMonthly,
        customerAppOrdersCount,
        bulkOrdersCount,
        recentCustomerAppOrders,
        recentBulkOrders
      ] = await Promise.race([dataPromise, timeoutPromise]);

      // Log the counts for debugging
      console.log('📊 V2 Dashboard Counts (no cache):');
      console.log(`   N (New User, v2, vendor_app): ${newUserCount}`);
      console.log(`   R (Recycler, v2, vendor_app): ${recyclerCount}`);
      console.log(`   S (Shop, v2, vendor_app): ${shopCount}`);
      console.log(`   SR (Shop Recycler, v2, vendor_app): ${shopRecyclerCount}`);
      console.log(`   D (Delivery, v2, vendor_app): ${deliveryCount}`);
      console.log(`   C (Customer, v2, customer_app): ${customerCount}`);
      console.log(`   Total Users: ${newUserCount + recyclerCount + shopCount + shopRecyclerCount + deliveryCount + customerCount}`);
      console.log(`   Customer App Orders (v2, excluding bulk): ${customerAppOrdersCount}`);
      console.log(`   Bulk Orders (all non-customer_app orders): ${bulkOrdersCount}`);

      const result = {
        userTypes: {
          N: {
            name: 'New User',
            count: newUserCount,
            monthlyCounts: newUserMonthly || []
          },
          R: {
            name: 'Recycler',
            count: recyclerCount,
            monthlyCounts: recyclerMonthly || []
          },
          S: {
            name: 'Shop',
            count: shopCount,
            monthlyCounts: shopMonthly || []
          },
          SR: {
            name: 'Shop Recycler',
            count: shopRecyclerCount,
            monthlyCounts: shopRecyclerMonthly || []
          },
          D: {
            name: 'Delivery',
            count: deliveryCount,
            monthlyCounts: deliveryMonthly || []
          },
          C: {
            name: 'Customer',
            count: customerCount,
            monthlyCounts: customerMonthly || []
          }
        },
        orders: {
          customerAppOrders: customerAppOrdersCount || 0,
          bulkOrders: bulkOrdersCount || 0,
          recentCustomerAppOrders: recentCustomerAppOrders || [],
          recentBulkOrders: recentBulkOrders || []
        },
        totalUsers: newUserCount + recyclerCount + shopCount + shopRecyclerCount + deliveryCount + customerCount
      };

      // No caching - return fresh data directly
      res.json({
        status: 'success',
        msg: 'V2 user types dashboard data retrieved',
        data: result
      });
    } catch (error) {
      console.error('V2 User Types Dashboard API error:', error);
      res.status(500).json({
        status: 'error',
        msg: 'Error loading v2 user types dashboard data',
        data: null,
        error: error.message
      });
    }
  }

  // Add nearby 'N' type users to order's notified_vendor_ids
  static async addNearbyNUsersToOrder(req, res) {
    try {
      const { orderId } = req.params;
      const { radius = 20 } = req.query; // Default 20 km radius
      
      console.log(`🟢 AdminPanelController.addNearbyNUsersToOrder called`, { orderId, radius });
      
      // Get order details
      const order = await Order.getById(orderId);
      if (!order) {
        return res.status(404).json({
          status: 'error',
          msg: 'Order not found',
          data: null
        });
      }
      
      // Get order location from lat_log or customerdetails
      let orderLat = null;
      let orderLng = null;
      
      if (order.lat_log) {
        const [lat, lng] = order.lat_log.split(',').map(Number);
        if (!isNaN(lat) && !isNaN(lng)) {
          orderLat = lat;
          orderLng = lng;
        }
      }
      
      // If no lat_log, try to get from customer location
      if (!orderLat || !orderLng) {
        const Customer = require('../models/Customer');
        if (order.customer_id) {
          const customer = await Customer.findById(order.customer_id);
          if (customer && customer.lat_log) {
            const [lat, lng] = customer.lat_log.split(',').map(Number);
            if (!isNaN(lat) && !isNaN(lng)) {
              orderLat = lat;
              orderLng = lng;
            }
          }
        }
      }
      
      // If no order location, we'll still proceed to select random 'N' type users
      if (!orderLat || !orderLng) {
        console.log(`⚠️  Order location not found. Will select random 'N' type users instead.`);
      } else {
        console.log(`📍 Order location: ${orderLat}, ${orderLng}`);
      }
      
      // Find all 'N' type users (new users)
      const { getDynamoDBClient } = require('../config/dynamodb');
      const { ScanCommand } = require('@aws-sdk/lib-dynamodb');
      const client = getDynamoDBClient();
      
      let lastKey = null;
      const nUsers = [];
      
      do {
        const params = {
          TableName: 'users',
          FilterExpression: 'user_type = :typeN AND (attribute_not_exists(del_status) OR del_status <> :deleted)',
          ExpressionAttributeValues: {
            ':typeN': 'N',
            ':deleted': 2
          }
        };
        
        if (lastKey) {
          params.ExclusiveStartKey = lastKey;
        }
        
        const command = new ScanCommand(params);
        const response = await client.send(command);
        
        if (response.Items) {
          nUsers.push(...response.Items);
        }
        
        lastKey = response.LastEvaluatedKey;
      } while (lastKey);
      
      console.log(`📊 Found ${nUsers.length} 'N' type users`);
      
      // Batch fetch all customer locations at once (optimization)
      const Customer = require('../models/Customer');
      const userIds = nUsers.map(u => u.id);
      console.log(`🔍 Batch fetching customer locations for ${userIds.length} users...`);
      const customers = await Customer.findByUserIds(userIds);
      
      // Create a map of user_id -> customer for quick lookup
      const customerMap = {};
      customers.forEach(customer => {
        if (customer.user_id) {
          customerMap[customer.user_id] = customer;
        }
      });
      
      console.log(`✅ Found ${customers.length} customer records with locations`);
      
      // Calculate distance for each user and filter by radius (only if we have order location)
      const R = 6371; // Earth's radius in km
      let nearbyUsers = [];
      
      if (orderLat && orderLng) {
        // Only calculate distances if we have order location
        for (const user of nUsers) {
          const customer = customerMap[user.id];
          
          if (customer && customer.lat_log) {
            const [userLat, userLng] = customer.lat_log.split(',').map(Number);
            if (!isNaN(userLat) && !isNaN(userLng)) {
              // Calculate distance using Haversine formula
              const dLat = (userLat - orderLat) * Math.PI / 180;
              const dLng = (userLng - orderLng) * Math.PI / 180;
              const a =
                Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                Math.cos(orderLat * Math.PI / 180) * Math.cos(userLat * Math.PI / 180) *
                Math.sin(dLng / 2) * Math.sin(dLng / 2);
              const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
              const distance = R * c;
              
              if (distance <= parseFloat(radius)) {
                nearbyUsers.push({
                  user_id: user.id,
                  name: user.name || 'N/A',
                  mobile: user.mob_num || 'N/A',
                  distance: distance.toFixed(2)
                });
              }
            }
          }
        }
        
        // Sort by distance
        nearbyUsers.sort((a, b) => parseFloat(a.distance) - parseFloat(b.distance));
        console.log(`✅ Found ${nearbyUsers.length} 'N' type users within ${radius} km`);
      } else {
        console.log(`⚠️  No order location - will select random 'N' type users`);
      }
      
      // Get current notified_vendor_ids and nearby_n_vendors (need this before random selection)
      let currentVendorIds = [];
      if (order.notified_vendor_ids) {
        try {
          if (typeof order.notified_vendor_ids === 'string') {
            currentVendorIds = JSON.parse(order.notified_vendor_ids);
          } else {
            currentVendorIds = order.notified_vendor_ids;
          }
          if (!Array.isArray(currentVendorIds)) {
            currentVendorIds = [currentVendorIds];
          }
        } catch (e) {
          console.error('Error parsing notified_vendor_ids:', e);
          currentVendorIds = [];
        }
      }
      
      let alreadyNotifiedNUsers = [];
      if (order.nearby_n_vendors) {
        try {
          if (typeof order.nearby_n_vendors === 'string') {
            alreadyNotifiedNUsers = JSON.parse(order.nearby_n_vendors);
          } else {
            alreadyNotifiedNUsers = order.nearby_n_vendors;
          }
          if (!Array.isArray(alreadyNotifiedNUsers)) {
            alreadyNotifiedNUsers = [alreadyNotifiedNUsers];
          }
        } catch (e) {
          console.error('Error parsing nearby_n_vendors:', e);
          alreadyNotifiedNUsers = [];
        }
      }
      
      // Get already notified IDs set
      const alreadyNotifiedIds = new Set(alreadyNotifiedNUsers.map(id => String(id)));
      
      // If no nearby users found within 20 km, select 5 random 'N' type users (excluding already notified)
      if (nearbyUsers.length === 0) {
        console.log(`⚠️  No 'N' type users found within ${radius} km. Selecting 5 random 'N' type users instead...`);
        
        // Select 5 random 'N' type users (exclude already notified, NO location check required)
        console.log(`🔍 Debug: nUsers.length = ${nUsers.length}, alreadyNotifiedIds.size = ${alreadyNotifiedIds.size}`);
        console.log(`🔍 Debug: Sample nUsers IDs: ${nUsers.slice(0, 3).map(u => u.id).join(', ')}`);
        console.log(`🔍 Debug: Already notified IDs: ${Array.from(alreadyNotifiedIds).slice(0, 5).join(', ')}`);
        
        const availableUsers = nUsers.filter(user => {
          const userIdStr = String(user.id);
          const isNotAlreadyNotified = !alreadyNotifiedIds.has(userIdStr);
          return isNotAlreadyNotified;
        });
        
        console.log(`📊 Total 'N' type users: ${nUsers.length}, Already notified: ${alreadyNotifiedNUsers.length}, Available for random: ${availableUsers.length}`);
        
        if (availableUsers.length === 0) {
          console.log(`⚠️  WARNING: No available users after filtering! This should not happen if nUsers.length > 0`);
        }
        
        // Shuffle array and take first 5 (random selection) - no location requirement
        const shuffled = [...availableUsers].sort(() => Math.random() - 0.5);
        const randomUsers = shuffled.slice(0, Math.min(5, availableUsers.length));
        
        console.log(`🎲 Randomly selected ${randomUsers.length} users from ${availableUsers.length} available`);
        
        nearbyUsers = randomUsers.map(user => {
          const customer = customerMap[user.id];
          let distance = 'N/A';
          
          // Calculate distance if we have order location and customer location (optional, for display only)
          if (orderLat && orderLng && customer && customer.lat_log) {
            const [userLat, userLng] = customer.lat_log.split(',').map(Number);
            if (!isNaN(userLat) && !isNaN(userLng)) {
              const R = 6371; // Earth's radius in km
              const dLat = (userLat - orderLat) * Math.PI / 180;
              const dLng = (userLng - orderLng) * Math.PI / 180;
              const a =
                Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                Math.cos(orderLat * Math.PI / 180) * Math.cos(userLat * Math.PI / 180) *
                Math.sin(dLng / 2) * Math.sin(dLng / 2);
              const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
              distance = (R * c).toFixed(2);
            }
          }
          
          return {
            user_id: user.id,
            name: user.name || 'N/A',
            mobile: user.mob_num || 'N/A',
            distance: distance,
            is_random: true // Flag to indicate this is a random selection
          };
        });
        
        console.log(`✅ Selected ${nearbyUsers.length} random 'N' type users (from ${availableUsers.length} available, ${alreadyNotifiedNUsers.length} already notified)`);
      }
      
      // Filter out already notified users (for nearby users that were found within radius)
      let newNearbyUsers = nearbyUsers.filter(u => !alreadyNotifiedIds.has(String(u.user_id)));
      
      console.log(`🔍 After filtering: ${newNearbyUsers.length} new users from ${nearbyUsers.length} nearby users (${alreadyNotifiedIds.size} already notified)`);
      
      // If random selection was used and we have less than 5 new users, select more random users
      if (nearbyUsers.length > 0 && nearbyUsers[0] && nearbyUsers[0].is_random && newNearbyUsers.length < 5) {
        // Get already selected random user IDs (from nearbyUsers)
        const alreadySelectedIds = new Set(nearbyUsers.map(u => String(u.user_id)));
        
        // Select additional random users to reach 5 total (NO location requirement)
        const additionalUsersNeeded = 5 - newNearbyUsers.length;
        const additionalAvailableUsers = nUsers.filter(user => {
          const userIdStr = String(user.id);
          const isNotAlreadyNotified = !alreadyNotifiedIds.has(userIdStr);
          const isNotAlreadySelected = !alreadySelectedIds.has(userIdStr);
          return isNotAlreadyNotified && isNotAlreadySelected;
        });
        
        console.log(`📊 Need ${additionalUsersNeeded} more users, ${additionalAvailableUsers.length} available`);
        
        const additionalUsers = additionalAvailableUsers
          .sort(() => Math.random() - 0.5)
          .slice(0, additionalUsersNeeded);
        
        // Add additional random users to nearbyUsers array
        additionalUsers.forEach(user => {
          const customer = customerMap[user.id];
          let distance = 'N/A';
          
          // Calculate distance if we have order location and customer location (optional, for display only)
          if (orderLat && orderLng && customer && customer.lat_log) {
            const [userLat, userLng] = customer.lat_log.split(',').map(Number);
            if (!isNaN(userLat) && !isNaN(userLng)) {
              const R = 6371;
              const dLat = (userLat - orderLat) * Math.PI / 180;
              const dLng = (userLng - orderLng) * Math.PI / 180;
              const a =
                Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                Math.cos(orderLat * Math.PI / 180) * Math.cos(userLat * Math.PI / 180) *
                Math.sin(dLng / 2) * Math.sin(dLng / 2);
              const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
              distance = (R * c).toFixed(2);
            }
          }
          
          nearbyUsers.push({
            user_id: user.id,
            name: user.name || 'N/A',
            mobile: user.mob_num || 'N/A',
            distance: distance,
            is_random: true
          });
        });
        
        // Re-filter to get final list of new users
        newNearbyUsers = nearbyUsers.filter(u => !alreadyNotifiedIds.has(String(u.user_id)));
        
        if (additionalUsers.length > 0) {
          console.log(`✅ Added ${additionalUsers.length} additional random users to reach ${newNearbyUsers.length} total`);
        }
      }
      
      console.log(`📋 Final newNearbyUsers count: ${newNearbyUsers.length}, User IDs: ${newNearbyUsers.map(u => u.user_id).join(', ')}`);
      
      const newUserIds = newNearbyUsers.map(u => u.user_id);
      
      console.log(`📝 Preparing to update order ${orderId}:`);
      console.log(`   Current notified_vendor_ids: ${currentVendorIds.length} (${currentVendorIds.slice(0, 5).join(', ')}...)`);
      console.log(`   New user IDs to add: ${newUserIds.length} (${newUserIds.join(', ')})`);
      console.log(`   Already notified N users: ${alreadyNotifiedNUsers.length}`);
      
      // Add new user IDs to both notified_vendor_ids and nearby_n_vendors (avoid duplicates)
      const allVendorIds = [...new Set([...currentVendorIds, ...newUserIds])];
      const allNearbyNVendorIds = [...new Set([...alreadyNotifiedNUsers, ...newUserIds])];
      
      console.log(`   Final notified_vendor_ids count: ${allVendorIds.length}`);
      console.log(`   Final nearby_n_vendors count: ${allNearbyNVendorIds.length}`);
      console.log(`   Final notified_vendor_ids: ${allVendorIds.join(', ')}`);
      
      // Update order
      const updateResult = await Order.updateById(orderId, {
        notified_vendor_ids: JSON.stringify(allVendorIds),
        nearby_n_vendors: JSON.stringify(allNearbyNVendorIds)
      });
      
      console.log(`✅ Order ${orderId} updated in database with ${newUserIds.length} new 'N' type users`);
      console.log(`   Update result:`, updateResult);
      
      // Verify the update by fetching the order again
      try {
        const updatedOrder = await Order.getById(orderId);
        if (updatedOrder && updatedOrder.notified_vendor_ids) {
          let verifiedIds = updatedOrder.notified_vendor_ids;
          if (typeof verifiedIds === 'string') {
            verifiedIds = JSON.parse(verifiedIds);
          }
          console.log(`✅ Verified: Order ${orderId} now has ${Array.isArray(verifiedIds) ? verifiedIds.length : 0} notified_vendor_ids in database`);
          console.log(`   Verified IDs: ${Array.isArray(verifiedIds) ? verifiedIds.join(', ') : 'N/A'}`);
        } else {
          console.warn(`⚠️  Warning: Could not verify update - order.notified_vendor_ids is missing or null`);
        }
      } catch (verifyErr) {
        console.error('Error verifying order update:', verifyErr);
      }
      
      // Clear order cache to ensure fresh data is fetched
      try {
        const RedisCache = require('../utils/redisCache');
        const cacheKey = RedisCache.orderKey(orderId);
        await RedisCache.delete(cacheKey);
        console.log(`🗑️  Cleared order cache for ${orderId}`);
      } catch (cacheErr) {
        console.error('Error clearing order cache:', cacheErr);
      }
      
      console.log(`✅ Updated order ${orderId} with ${newUserIds.length} new 'N' type users (${alreadyNotifiedNUsers.length} already notified)`);
      
      // Send SMS notifications to newly added vendors
      if (newNearbyUsers.length > 0) {
        try {
          console.log(`📱 [SMS] Sending SMS notifications to ${newNearbyUsers.length} newly added vendor(s)...`);
          
          // Extract material name from order details for SMS
          let materialName = 'scrap';
          try {
            const orderDetailsObj = typeof order.orderdetails === 'string'
              ? JSON.parse(order.orderdetails)
              : order.orderdetails;
            
            if (orderDetailsObj && Array.isArray(orderDetailsObj) && orderDetailsObj.length > 0) {
              const firstItem = orderDetailsObj[0];
              materialName = firstItem.material_name || firstItem.name || firstItem.category_name || 'scrap';
            } else if (orderDetailsObj && typeof orderDetailsObj === 'object') {
              const firstKey = Object.keys(orderDetailsObj)[0];
              if (firstKey) {
                materialName = firstKey;
              }
            }
          } catch (parseErr) {
            console.warn('⚠️  Could not parse order details for SMS material name:', parseErr.message);
          }
          
          // Build SMS message
          const orderNumber = order.order_number || order.order_no || 'N/A';
          const payableAmount = Math.round(order.estim_price || order.estimated_price || 0);
          const firstVar = `${orderNumber} of ${materialName}`;
          const secondVar = `${payableAmount}`;
          const smsMessage = `Scrapmate pickup request ${firstVar}. Payable amount Rs${secondVar}. Open B2C dashboard to accept.`;
          
          console.log(`📱 [SMS] Message: ${smsMessage}`);
          
          // SMS configuration
          const BulkMessageNotification = require('../models/BulkMessageNotification');
          const http = require('http');
          const querystring = require('querystring');
          const User = require('../models/User');
          
          const SMS_CONFIG = {
            username: 'scrapmate',
            sendername: 'SCRPMT',
            smstype: 'TRANS',
            apikey: '1bf0131f-d1f2-49ed-9c57-19f1b4400f32',
            peid: '1701173389563945545',
            templateid: '1707176812500484578'
          };
          
          // Helper function to send SMS
          const sendSMS = (phoneNumber, message) => {
            return new Promise((resolve, reject) => {
              const params = querystring.stringify({
                username: SMS_CONFIG.username,
                message: message,
                sendername: SMS_CONFIG.sendername,
                smstype: SMS_CONFIG.smstype,
                numbers: phoneNumber,
                apikey: SMS_CONFIG.apikey,
                peid: SMS_CONFIG.peid,
                templateid: SMS_CONFIG.templateid,
              });
              
              const options = {
                hostname: 'sms.bulksmsind.in',
                path: `/v2/sendSMS?${params}`,
                method: 'GET',
              };
              
              const req = http.request(options, (res) => {
                let data = '';
                res.on('data', (chunk) => { data += chunk; });
                res.on('end', () => {
                  try {
                    const response = JSON.parse(data);
                    resolve(response);
                  } catch (e) {
                    resolve({ raw: data });
                  }
                });
              });
              
              req.on('error', (error) => reject(error));
              req.end();
            });
          };
          
          // Helper function to extract phone number
          const extractPhoneNumber = (phone) => {
            if (!phone) return null;
            let phoneStr = String(phone);
            let cleaned = phoneStr.replace(/\s+/g, '').replace(/[^\d+]/g, '');
            if (cleaned.startsWith('+91')) {
              cleaned = cleaned.substring(3);
            } else if (cleaned.startsWith('91') && cleaned.length === 12) {
              cleaned = cleaned.substring(2);
            }
            if (cleaned.length === 10 && /^[6-9]\d{9}$/.test(cleaned)) {
              return cleaned;
            }
            return null;
          };
          
          // Send SMS to each newly added vendor
          const smsPromises = newNearbyUsers.map(async (vendorInfo) => {
            try {
              const vendorUserId = vendorInfo.user_id;
              console.log(`📱 [SMS] Processing SMS for vendor user_id: ${vendorUserId}`);
              
              // Get vendor user details to get phone number
              const vendorUser = await User.findById(vendorUserId);
              if (!vendorUser) {
                console.warn(`⚠️  [SMS] Vendor user (user_id: ${vendorUserId}) not found in database`);
                return { success: false, user_id: vendorUserId, reason: 'user_not_found' };
              }
              
              const phoneNumber = extractPhoneNumber(vendorUser.mob_num || vendorInfo.mobile);
              
              if (phoneNumber) {
                console.log(`📱 [SMS] Sending SMS to ${phoneNumber} (vendor ${vendorUserId})...`);
                let smsResult = null;
                try {
                  smsResult = await sendSMS(phoneNumber, smsMessage);
                  console.log(`📱 [SMS] API response for ${phoneNumber}:`, JSON.stringify(smsResult));
                } catch (smsApiError) {
                  console.error(`❌ [SMS ERROR] SMS API error for ${phoneNumber}:`, smsApiError.message);
                  smsResult = { error: smsApiError.message, status: 'error' };
                }
                
                // Save to bulk_message_notifications table
                try {
                  const notificationRecord = await BulkMessageNotification.save({
                    phone_number: phoneNumber,
                    business_data: {
                      order_id: order.id,
                      order_number: orderNumber,
                      vendor_user_id: vendorUserId,
                      material_name: materialName,
                      amount: payableAmount
                    },
                    message: smsMessage,
                    status: (() => {
                      if (Array.isArray(smsResult) && smsResult.length > 0) {
                        return smsResult[0].status === 'success' ? 'sent' : 'failed';
                      } else if (smsResult && typeof smsResult === 'object') {
                        return (smsResult.status === 'success' || smsResult.success === true) ? 'sent' : 'failed';
                      }
                      return 'failed';
                    })(),
                    language: 'en'
                  });
                  console.log(`📱 [SMS] ✅ Saved SMS record to database: ${notificationRecord.id}`);
                } catch (dbErr) {
                  console.error(`❌ [SMS ERROR] Error saving SMS to database:`, dbErr.message);
                }
                
                // Check if SMS was successful
                let isSuccess = false;
                if (Array.isArray(smsResult) && smsResult.length > 0) {
                  isSuccess = smsResult[0].status === 'success';
                } else if (smsResult && typeof smsResult === 'object') {
                  isSuccess = smsResult.status === 'success' || smsResult.success === true;
                }
                
                if (isSuccess) {
                  console.log(`✅ [SMS] SMS sent successfully to vendor (user_id: ${vendorUserId}, phone: ${phoneNumber})`);
                } else {
                  console.warn(`⚠️  [SMS] SMS may have failed for vendor (user_id: ${vendorUserId}, phone: ${phoneNumber})`);
                }
                
                return { success: isSuccess, user_id: vendorUserId, phone: phoneNumber, smsResult };
              } else {
                console.warn(`⚠️  [SMS] Invalid phone number for vendor (user_id: ${vendorUserId}): ${vendorUser.mob_num || vendorInfo.mobile}`);
                return { success: false, user_id: vendorUserId, reason: 'invalid_phone' };
              }
            } catch (err) {
              console.error(`❌ [SMS ERROR] Error sending SMS to vendor (user_id: ${vendorInfo.user_id}):`, err.message);
              return { success: false, user_id: vendorInfo.user_id, error: err.message };
            }
          });
          
          // Wait for all SMS to be sent
          console.log(`📱 [SMS] Waiting for all SMS promises to complete for ${newNearbyUsers.length} vendors...`);
          const smsResults = await Promise.allSettled(smsPromises);
          console.log(`📱 [SMS] All SMS promises completed. Total results: ${smsResults.length}`);
          
          const smsSuccessCount = smsResults.filter(r => r.status === 'fulfilled' && r.value?.success).length;
          const smsFailedResults = smsResults.filter(r => r.status === 'fulfilled' && !r.value?.success);
          const smsRejectedResults = smsResults.filter(r => r.status === 'rejected');
          
          console.log(`📱 [SMS] Summary: ${smsSuccessCount} successful, ${smsFailedResults.length} failed, ${smsRejectedResults.length} rejected`);
          console.log(`📱 [SMS] Sent SMS notifications to ${smsSuccessCount}/${newNearbyUsers.length} newly added vendors`);
          
          // Detailed logging for each vendor
          console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
          console.log(`📱 [SMS] Detailed SMS Status for ${newNearbyUsers.length} Vendors:`);
          console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
          
          smsResults.forEach((result, index) => {
            const vendorInfo = newNearbyUsers[index];
            if (result.status === 'fulfilled') {
              const smsResult = result.value;
              if (smsResult.success) {
                console.log(`✅ [SMS] Vendor ${index + 1}/${newNearbyUsers.length}:`);
                console.log(`   User ID: ${smsResult.user_id}`);
                console.log(`   Phone: ${smsResult.phone}`);
                console.log(`   Status: ✅ SMS SENT SUCCESSFULLY`);
                if (smsResult.smsResult && Array.isArray(smsResult.smsResult) && smsResult.smsResult[0] && smsResult.smsResult[0].msgid) {
                  console.log(`   Message ID: ${smsResult.smsResult[0].msgid}`);
                }
              } else {
                console.log(`❌ [SMS] Vendor ${index + 1}/${newNearbyUsers.length}:`);
                console.log(`   User ID: ${smsResult.user_id || vendorInfo?.user_id || 'N/A'}`);
                console.log(`   Phone: ${smsResult.phone || vendorInfo?.mobile || 'N/A'}`);
                console.log(`   Status: ❌ SMS FAILED`);
                console.log(`   Reason: ${smsResult.reason || smsResult.error || 'Unknown error'}`);
                if (smsResult.smsResult) {
                  console.log(`   API Response: ${JSON.stringify(smsResult.smsResult)}`);
                }
              }
            } else {
              console.log(`❌ [SMS] Vendor ${index + 1}/${newNearbyUsers.length}:`);
              console.log(`   User ID: ${vendorInfo?.user_id || 'N/A'}`);
              console.log(`   Status: ❌ SMS PROMISE REJECTED`);
              console.log(`   Error: ${result.reason?.message || result.reason || 'Unknown error'}`);
              if (result.reason?.stack) {
                console.log(`   Stack: ${result.reason.stack.split('\n')[0]}`);
              }
            }
          });
          
          console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
          console.log(`📊 [SMS] Final Summary:`);
          console.log(`   ✅ Successfully sent: ${smsSuccessCount}/${newNearbyUsers.length}`);
          console.log(`   ❌ Failed: ${smsFailedResults.length}/${newNearbyUsers.length}`);
          console.log(`   ⚠️  Rejected: ${smsRejectedResults.length}/${newNearbyUsers.length}`);
          console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);
        } catch (smsError) {
          console.error('❌ [SMS ERROR] Error sending SMS notifications:', smsError.message);
          // Don't fail the entire operation if SMS fails
        }
      }
      
      // Determine message based on whether random users were selected
      let msg = '';
      if (nearbyUsers.length > 0 && nearbyUsers[0].is_random) {
        msg = `No 'N' type users found within ${radius} km. Selected ${newUserIds.length} random 'N' type users and added to order.`;
      } else if (nearbyUsers.length === 0) {
        msg = '0 users found within 20 km range. Not notified - No \'N\' type users are within 20 km of this order location.';
      } else if (newUserIds.length === 0) {
        msg = `All ${nearbyUsers.length} 'N' type users within 20 km were already notified.`;
      } else {
        msg = `Added ${newUserIds.length} nearby 'N' type users to order`;
      }
      
      return res.json({
        status: 'success',
        msg: msg,
        data: {
          order_id: orderId,
          added_users: newNearbyUsers,
          total_notified_vendors: allVendorIds.length,
          previous_count: currentVendorIds.length,
          new_count: newUserIds.length,
          already_notified_count: alreadyNotifiedNUsers.length,
          total_found: nearbyUsers.length,
          is_random_selection: nearbyUsers.length > 0 && nearbyUsers[0].is_random || false
        }
      });
      
    } catch (error) {
      console.error('❌ Error adding nearby N users to order:', error);
      return res.status(500).json({
        status: 'error',
        msg: 'Failed to add nearby users',
        data: null
      });
    }
  }

  // Add nearby 'D' type users to order's notified_vendor_ids
  static async addNearbyDUsersToOrder(req, res) {
    try {
      const { orderId } = req.params;
      const { radius = 20 } = req.query; // Default 20 km radius
      
      console.log(`🟢 AdminPanelController.addNearbyDUsersToOrder called`, { orderId, radius });
      
      // Get order details
      const order = await Order.getById(orderId);
      if (!order) {
        return res.status(404).json({
          status: 'error',
          msg: 'Order not found',
          data: null
        });
      }
      
      // Get order location from lat_log or customerdetails
      let orderLat = null;
      let orderLng = null;
      
      if (order.lat_log) {
        const [lat, lng] = order.lat_log.split(',').map(Number);
        if (!isNaN(lat) && !isNaN(lng)) {
          orderLat = lat;
          orderLng = lng;
        }
      }
      
      // If no lat_log, try to get from customer location
      if (!orderLat || !orderLng) {
        const Customer = require('../models/Customer');
        if (order.customer_id) {
          const customer = await Customer.findById(order.customer_id);
          if (customer && customer.lat_log) {
            const [lat, lng] = customer.lat_log.split(',').map(Number);
            if (!isNaN(lat) && !isNaN(lng)) {
              orderLat = lat;
              orderLng = lng;
            }
          }
        }
      }
      
      if (!orderLat || !orderLng) {
        return res.status(400).json({
          status: 'error',
          msg: 'Order location not found. Cannot find nearby users without location data.',
          data: null
        });
      }
      
      console.log(`📍 Order location: ${orderLat}, ${orderLng}`);
      
      // Find all 'D' type users (delivery users)
      const { getDynamoDBClient } = require('../config/dynamodb');
      const { ScanCommand } = require('@aws-sdk/lib-dynamodb');
      const client = getDynamoDBClient();
      
      let lastKey = null;
      const dUsers = [];
      
      do {
        const params = {
          TableName: 'users',
          FilterExpression: 'user_type = :typeD AND (attribute_not_exists(del_status) OR del_status <> :deleted)',
          ExpressionAttributeValues: {
            ':typeD': 'D',
            ':deleted': 2
          }
        };
        
        if (lastKey) {
          params.ExclusiveStartKey = lastKey;
        }
        
        const command = new ScanCommand(params);
        const response = await client.send(command);
        
        if (response.Items) {
          dUsers.push(...response.Items);
        }
        
        lastKey = response.LastEvaluatedKey;
      } while (lastKey);
      
      console.log(`📊 Found ${dUsers.length} 'D' type users`);
      
      // Batch fetch all delivery boy locations at once (optimization)
      const DeliveryBoy = require('../models/DeliveryBoy');
      const userIds = dUsers.map(u => u.id);
      console.log(`🔍 Batch fetching delivery boy locations for ${userIds.length} users...`);
      
      // Fetch delivery boys in parallel batches
      const deliveryBoys = [];
      const batchSize = 10;
      
      for (let i = 0; i < userIds.length; i += batchSize) {
        const batch = userIds.slice(i, i + batchSize);
        const batchDeliveryBoys = await Promise.all(
          batch.map(async (userId) => {
            try {
              return await DeliveryBoy.findByUserId(userId);
            } catch (err) {
              console.error(`Error fetching delivery boy for user ${userId}:`, err);
              return null;
            }
          })
        );
        deliveryBoys.push(...batchDeliveryBoys.filter(db => db !== null));
      }
      
      // Create a map of user_id -> delivery boy for quick lookup
      const deliveryBoyMap = {};
      deliveryBoys.forEach(db => {
        if (db && db.user_id) {
          deliveryBoyMap[db.user_id] = db;
        }
      });
      
      console.log(`✅ Found ${deliveryBoys.length} delivery boy records with locations`);
      
      // Calculate distance for each user and filter by radius
      const R = 6371; // Earth's radius in km
      const nearbyUsers = [];
      
      for (const user of dUsers) {
        const deliveryBoy = deliveryBoyMap[user.id];
        
        if (deliveryBoy && deliveryBoy.lat_log) {
          const [userLat, userLng] = deliveryBoy.lat_log.split(',').map(Number);
          if (!isNaN(userLat) && !isNaN(userLng)) {
            // Calculate distance using Haversine formula
            const dLat = (userLat - orderLat) * Math.PI / 180;
            const dLng = (userLng - orderLng) * Math.PI / 180;
            const a =
              Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(orderLat * Math.PI / 180) * Math.cos(userLat * Math.PI / 180) *
              Math.sin(dLng / 2) * Math.sin(dLng / 2);
            const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
            const distance = R * c;
            
            if (distance <= parseFloat(radius)) {
              nearbyUsers.push({
                user_id: user.id,
                name: user.name || 'N/A',
                mobile: user.mob_num || 'N/A',
                distance: distance.toFixed(2)
              });
            }
          }
        }
      }
      
      // Sort by distance
      nearbyUsers.sort((a, b) => parseFloat(a.distance) - parseFloat(b.distance));
      
      console.log(`✅ Found ${nearbyUsers.length} 'D' type users within ${radius} km`);
      
      // Get current notified_vendor_ids and nearby_d_vendors
      let currentVendorIds = [];
      if (order.notified_vendor_ids) {
        try {
          if (typeof order.notified_vendor_ids === 'string') {
            currentVendorIds = JSON.parse(order.notified_vendor_ids);
          } else {
            currentVendorIds = order.notified_vendor_ids;
          }
          if (!Array.isArray(currentVendorIds)) {
            currentVendorIds = [currentVendorIds];
          }
        } catch (e) {
          console.error('Error parsing notified_vendor_ids:', e);
          currentVendorIds = [];
        }
      }
      
      let alreadyNotifiedDUsers = [];
      if (order.nearby_d_vendors) {
        try {
          if (typeof order.nearby_d_vendors === 'string') {
            alreadyNotifiedDUsers = JSON.parse(order.nearby_d_vendors);
          } else {
            alreadyNotifiedDUsers = order.nearby_d_vendors;
          }
          if (!Array.isArray(alreadyNotifiedDUsers)) {
            alreadyNotifiedDUsers = [alreadyNotifiedDUsers];
          }
        } catch (e) {
          console.error('Error parsing nearby_d_vendors:', e);
          alreadyNotifiedDUsers = [];
        }
      }
      
      // Filter out already notified users
      const alreadyNotifiedIds = new Set(alreadyNotifiedDUsers.map(id => String(id)));
      const newNearbyUsers = nearbyUsers.filter(u => !alreadyNotifiedIds.has(String(u.user_id)));
      const newUserIds = newNearbyUsers.map(u => u.user_id);
      
      // Add new user IDs to both notified_vendor_ids and nearby_d_vendors (avoid duplicates)
      const allVendorIds = [...new Set([...currentVendorIds, ...newUserIds])];
      const allNearbyDVendorIds = [...new Set([...alreadyNotifiedDUsers, ...newUserIds])];
      
      // Update order
      await Order.updateById(orderId, {
        notified_vendor_ids: JSON.stringify(allVendorIds),
        nearby_d_vendors: JSON.stringify(allNearbyDVendorIds)
      });
      
      // Clear order cache to ensure fresh data is fetched
      try {
        const cacheKey = RedisCache.orderKey(orderId);
        await RedisCache.delete(cacheKey);
        console.log(`🗑️  Cleared order cache for ${orderId}`);
      } catch (cacheErr) {
        console.error('Error clearing order cache:', cacheErr);
      }
      
      console.log(`✅ Updated order ${orderId} with ${newUserIds.length} new 'D' type users (${alreadyNotifiedDUsers.length} already notified)`);
      
      // Send SMS notifications to newly added vendors
      if (newNearbyUsers.length > 0) {
        try {
          console.log(`📱 [SMS] Sending SMS notifications to ${newNearbyUsers.length} newly added 'D' type vendor(s)...`);
          
          // Extract material name from order details for SMS
          let materialName = 'scrap';
          try {
            const orderDetailsObj = typeof order.orderdetails === 'string'
              ? JSON.parse(order.orderdetails)
              : order.orderdetails;
            
            if (orderDetailsObj && Array.isArray(orderDetailsObj) && orderDetailsObj.length > 0) {
              const firstItem = orderDetailsObj[0];
              materialName = firstItem.material_name || firstItem.name || firstItem.category_name || 'scrap';
            } else if (orderDetailsObj && typeof orderDetailsObj === 'object') {
              const firstKey = Object.keys(orderDetailsObj)[0];
              if (firstKey) {
                materialName = firstKey;
              }
            }
          } catch (parseErr) {
            console.warn('⚠️  Could not parse order details for SMS material name:', parseErr.message);
          }
          
          // Build SMS message
          const orderNumber = order.order_number || order.order_no || 'N/A';
          const payableAmount = Math.round(order.estim_price || order.estimated_price || 0);
          const firstVar = `${orderNumber} of ${materialName}`;
          const secondVar = `${payableAmount}`;
          const smsMessage = `Scrapmate pickup request ${firstVar}. Payable amount Rs${secondVar}. Open B2C dashboard to accept.`;
          
          console.log(`📱 [SMS] Message: ${smsMessage}`);
          
          // SMS configuration
          const BulkMessageNotification = require('../models/BulkMessageNotification');
          const http = require('http');
          const querystring = require('querystring');
          const User = require('../models/User');
          
          const SMS_CONFIG = {
            username: 'scrapmate',
            sendername: 'SCRPMT',
            smstype: 'TRANS',
            apikey: '1bf0131f-d1f2-49ed-9c57-19f1b4400f32',
            peid: '1701173389563945545',
            templateid: '1707176812500484578'
          };
          
          // Helper function to send SMS
          const sendSMS = (phoneNumber, message) => {
            return new Promise((resolve, reject) => {
              const params = querystring.stringify({
                username: SMS_CONFIG.username,
                message: message,
                sendername: SMS_CONFIG.sendername,
                smstype: SMS_CONFIG.smstype,
                numbers: phoneNumber,
                apikey: SMS_CONFIG.apikey,
                peid: SMS_CONFIG.peid,
                templateid: SMS_CONFIG.templateid,
              });
              
              const options = {
                hostname: 'sms.bulksmsind.in',
                path: `/v2/sendSMS?${params}`,
                method: 'GET',
              };
              
              const req = http.request(options, (res) => {
                let data = '';
                res.on('data', (chunk) => { data += chunk; });
                res.on('end', () => {
                  try {
                    const response = JSON.parse(data);
                    resolve(response);
                  } catch (e) {
                    resolve({ raw: data });
                  }
                });
              });
              
              req.on('error', (error) => reject(error));
              req.end();
            });
          };
          
          // Helper function to extract phone number
          const extractPhoneNumber = (phone) => {
            if (!phone) return null;
            let phoneStr = String(phone);
            let cleaned = phoneStr.replace(/\s+/g, '').replace(/[^\d+]/g, '');
            if (cleaned.startsWith('+91')) {
              cleaned = cleaned.substring(3);
            } else if (cleaned.startsWith('91') && cleaned.length === 12) {
              cleaned = cleaned.substring(2);
            }
            if (cleaned.length === 10 && /^[6-9]\d{9}$/.test(cleaned)) {
              return cleaned;
            }
            return null;
          };
          
          // Send SMS to each newly added vendor
          const smsPromises = newNearbyUsers.map(async (vendorInfo) => {
            try {
              const vendorUserId = vendorInfo.user_id;
              console.log(`📱 [SMS] Processing SMS for vendor user_id: ${vendorUserId}`);
              
              // Get vendor user details to get phone number
              const vendorUser = await User.findById(vendorUserId);
              if (!vendorUser) {
                console.warn(`⚠️  [SMS] Vendor user (user_id: ${vendorUserId}) not found in database`);
                return { success: false, user_id: vendorUserId, reason: 'user_not_found' };
              }
              
              const phoneNumber = extractPhoneNumber(vendorUser.mob_num || vendorInfo.mobile);
              
              if (phoneNumber) {
                console.log(`📱 [SMS] Sending SMS to ${phoneNumber} (vendor ${vendorUserId})...`);
                let smsResult = null;
                try {
                  smsResult = await sendSMS(phoneNumber, smsMessage);
                  console.log(`📱 [SMS] API response for ${phoneNumber}:`, JSON.stringify(smsResult));
                } catch (smsApiError) {
                  console.error(`❌ [SMS ERROR] SMS API error for ${phoneNumber}:`, smsApiError.message);
                  smsResult = { error: smsApiError.message, status: 'error' };
                }
                
                // Save to bulk_message_notifications table
                try {
                  const notificationRecord = await BulkMessageNotification.save({
                    phone_number: phoneNumber,
                    business_data: {
                      order_id: order.id,
                      order_number: orderNumber,
                      vendor_user_id: vendorUserId,
                      material_name: materialName,
                      amount: payableAmount
                    },
                    message: smsMessage,
                    status: (() => {
                      if (Array.isArray(smsResult) && smsResult.length > 0) {
                        return smsResult[0].status === 'success' ? 'sent' : 'failed';
                      } else if (smsResult && typeof smsResult === 'object') {
                        return (smsResult.status === 'success' || smsResult.success === true) ? 'sent' : 'failed';
                      }
                      return 'failed';
                    })(),
                    language: 'en'
                  });
                  console.log(`📱 [SMS] ✅ Saved SMS record to database: ${notificationRecord.id}`);
                } catch (dbErr) {
                  console.error(`❌ [SMS ERROR] Error saving SMS to database:`, dbErr.message);
                }
                
                // Check if SMS was successful
                let isSuccess = false;
                if (Array.isArray(smsResult) && smsResult.length > 0) {
                  isSuccess = smsResult[0].status === 'success';
                } else if (smsResult && typeof smsResult === 'object') {
                  isSuccess = smsResult.status === 'success' || smsResult.success === true;
                }
                
                if (isSuccess) {
                  console.log(`✅ [SMS] SMS sent successfully to vendor (user_id: ${vendorUserId}, phone: ${phoneNumber})`);
                } else {
                  console.warn(`⚠️  [SMS] SMS may have failed for vendor (user_id: ${vendorUserId}, phone: ${phoneNumber})`);
                }
                
                return { success: isSuccess, user_id: vendorUserId, phone: phoneNumber, smsResult };
              } else {
                console.warn(`⚠️  [SMS] Invalid phone number for vendor (user_id: ${vendorUserId}): ${vendorUser.mob_num || vendorInfo.mobile}`);
                return { success: false, user_id: vendorUserId, reason: 'invalid_phone' };
              }
            } catch (err) {
              console.error(`❌ [SMS ERROR] Error sending SMS to vendor (user_id: ${vendorInfo.user_id}):`, err.message);
              return { success: false, user_id: vendorInfo.user_id, error: err.message };
            }
          });
          
          // Wait for all SMS to be sent
          console.log(`📱 [SMS] Waiting for all SMS promises to complete for ${newNearbyUsers.length} vendors...`);
          const smsResults = await Promise.allSettled(smsPromises);
          console.log(`📱 [SMS] All SMS promises completed. Total results: ${smsResults.length}`);
          
          const smsSuccessCount = smsResults.filter(r => r.status === 'fulfilled' && r.value?.success).length;
          const smsFailedResults = smsResults.filter(r => r.status === 'fulfilled' && !r.value?.success);
          const smsRejectedResults = smsResults.filter(r => r.status === 'rejected');
          
          console.log(`📱 [SMS] Summary: ${smsSuccessCount} successful, ${smsFailedResults.length} failed, ${smsRejectedResults.length} rejected`);
          console.log(`📱 [SMS] Sent SMS notifications to ${smsSuccessCount}/${newNearbyUsers.length} newly added vendors`);
          
          // Detailed logging for each vendor
          console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
          console.log(`📱 [SMS] Detailed SMS Status for ${newNearbyUsers.length} 'D' Type Vendors:`);
          console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
          
          smsResults.forEach((result, index) => {
            const vendorInfo = newNearbyUsers[index];
            if (result.status === 'fulfilled') {
              const smsResult = result.value;
              if (smsResult.success) {
                console.log(`✅ [SMS] Vendor ${index + 1}/${newNearbyUsers.length}:`);
                console.log(`   User ID: ${smsResult.user_id}`);
                console.log(`   Phone: ${smsResult.phone}`);
                console.log(`   Status: ✅ SMS SENT SUCCESSFULLY`);
                if (smsResult.smsResult && Array.isArray(smsResult.smsResult) && smsResult.smsResult[0] && smsResult.smsResult[0].msgid) {
                  console.log(`   Message ID: ${smsResult.smsResult[0].msgid}`);
                }
              } else {
                console.log(`❌ [SMS] Vendor ${index + 1}/${newNearbyUsers.length}:`);
                console.log(`   User ID: ${smsResult.user_id || vendorInfo?.user_id || 'N/A'}`);
                console.log(`   Phone: ${smsResult.phone || vendorInfo?.mobile || 'N/A'}`);
                console.log(`   Status: ❌ SMS FAILED`);
                console.log(`   Reason: ${smsResult.reason || smsResult.error || 'Unknown error'}`);
                if (smsResult.smsResult) {
                  console.log(`   API Response: ${JSON.stringify(smsResult.smsResult)}`);
                }
              }
            } else {
              console.log(`❌ [SMS] Vendor ${index + 1}/${newNearbyUsers.length}:`);
              console.log(`   User ID: ${vendorInfo?.user_id || 'N/A'}`);
              console.log(`   Status: ❌ SMS PROMISE REJECTED`);
              console.log(`   Error: ${result.reason?.message || result.reason || 'Unknown error'}`);
              if (result.reason?.stack) {
                console.log(`   Stack: ${result.reason.stack.split('\n')[0]}`);
              }
            }
          });
          
          console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
          console.log(`📊 [SMS] Final Summary for 'D' Type Vendors:`);
          console.log(`   ✅ Successfully sent: ${smsSuccessCount}/${newNearbyUsers.length}`);
          console.log(`   ❌ Failed: ${smsFailedResults.length}/${newNearbyUsers.length}`);
          console.log(`   ⚠️  Rejected: ${smsRejectedResults.length}/${newNearbyUsers.length}`);
          console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);
        } catch (smsError) {
          console.error('❌ [SMS ERROR] Error sending SMS notifications:', smsError.message);
          // Don't fail the entire operation if SMS fails
        }
      }
      
      return res.json({
        status: 'success',
        msg: nearbyUsers.length === 0 
          ? '0 users found within 20 km range. Not notified - No \'D\' type users are within 20 km of this order location.'
          : newUserIds.length === 0
          ? `All ${nearbyUsers.length} 'D' type users within 20 km were already notified.`
          : `Added ${newUserIds.length} nearby 'D' type users to order`,
        data: {
          order_id: orderId,
          added_users: newNearbyUsers,
          total_notified_vendors: allVendorIds.length,
          previous_count: currentVendorIds.length,
          new_count: newUserIds.length,
          already_notified_count: alreadyNotifiedDUsers.length,
          total_found: nearbyUsers.length
        }
      });
      
    } catch (error) {
      console.error('❌ Error adding nearby D users to order:', error);
      return res.status(500).json({
        status: 'error',
        msg: 'Failed to add nearby users',
        data: null
      });
    }
  }

  // Add nearby bulk vendors from bulk_message_notifications and send SMS notifications
  static async addBulkNotifiedVendors(req, res) {
    try {
      const { orderId } = req.params;
      const http = require('http');
      const querystring = require('querystring');
      
      console.log(`🟢 AdminPanelController.addBulkNotifiedVendors called`, { orderId });
      
      // Get order details
      const order = await Order.getById(orderId);
      if (!order) {
        return res.status(404).json({
          status: 'error',
          msg: 'Order not found',
          data: null
        });
      }
      
      // Extract customer city and state from address
      const customerAddress = order.customerdetails || order.customer_address || '';
      let customerCity = '';
      let customerState = '';
      
      const addressParts = customerAddress.split(',');
      if (addressParts.length >= 4) {
        customerCity = addressParts[addressParts.length - 3].trim();
        customerState = addressParts[addressParts.length - 2].trim();
      }
      
      if (!customerCity || !customerState) {
        return res.status(400).json({
          status: 'error',
          msg: 'Cannot extract city/state from customer address',
          data: null
        });
      }
      
      console.log(`📍 Customer location: ${customerCity}, ${customerState}`);
      
      // Helper function to normalize city name
      const normalizeCityName = (city) => {
        if (!city) return '';
        return city.toLowerCase().replace(/[^\w\s]/g, '').replace(/\s+/g, ' ').trim();
      };
      
      // Helper function to check if cities match
      const isSimilarCity = (city1, city2) => {
        if (!city1 || !city2) return false;
        const norm1 = normalizeCityName(city1);
        const norm2 = normalizeCityName(city2);
        if (norm1 === norm2) return true;
        if (norm1.includes(norm2) || norm2.includes(norm1)) return true;
        const aliases = {
          'thiruvananthapuram': ['trivandrum', 'tvm'],
          'trivandrum': ['thiruvananthapuram', 'tvm'],
          'tvm': ['thiruvananthapuram', 'trivandrum']
        };
        for (const [key, values] of Object.entries(aliases)) {
          if ((norm1 === key && values.includes(norm2)) || (norm2 === key && values.includes(norm1))) {
            return true;
          }
        }
        return false;
      };
      
      // Scan bulk_message_notifications for matching vendors
      const BulkMessageNotification = require('../models/BulkMessageNotification');
      const { getDynamoDBClient } = require('../config/dynamodb');
      const { ScanCommand } = require('@aws-sdk/lib-dynamodb');
      const client = getDynamoDBClient();
      
      let allNotifications = [];
      let lastKey = null;
      
      do {
        const params = {
          TableName: 'bulk_message_notifications',
          FilterExpression: '#status = :status',
          ExpressionAttributeNames: { '#status': 'status' },
          ExpressionAttributeValues: { ':status': 'sent' }
        };
        if (lastKey) params.ExclusiveStartKey = lastKey;
        
        const command = new ScanCommand(params);
        const response = await client.send(command);
        if (response.Items) allNotifications.push(...response.Items);
        lastKey = response.LastEvaluatedKey;
      } while (lastKey);
      
      console.log(`📊 Scanned ${allNotifications.length} bulk message notifications`);
      
      // Filter vendors with matching city/state
      const matchingVendors = [];
      for (const notification of allNotifications) {
        const businessData = notification.business_data || {};
        const vendorCity = businessData.city || '';
        const vendorState = businessData.state || '';
        
        const cityMatch = customerCity && vendorCity && isSimilarCity(customerCity, vendorCity);
        const stateMatch = customerState && vendorState && normalizeCityName(customerState) === normalizeCityName(vendorState);
        
        if (cityMatch && stateMatch) {
          matchingVendors.push({
            phone_number: notification.phone_number,
            title: businessData.title || 'Vendor',
            city: vendorCity,
            street: businessData.street || '',
            business_data: businessData
          });
        }
      }
      
      // Get already notified bulk vendors (phone numbers)
      let alreadyNotifiedBulkVendors = [];
      if (order.bulk_notified_vendors) {
        try {
          if (typeof order.bulk_notified_vendors === 'string') {
            alreadyNotifiedBulkVendors = JSON.parse(order.bulk_notified_vendors);
          } else {
            alreadyNotifiedBulkVendors = order.bulk_notified_vendors;
          }
          if (!Array.isArray(alreadyNotifiedBulkVendors)) {
            alreadyNotifiedBulkVendors = [alreadyNotifiedBulkVendors];
          }
        } catch (e) {
          console.error('Error parsing bulk_notified_vendors:', e);
          alreadyNotifiedBulkVendors = [];
        }
      }
      
      // Filter out already notified vendors (by phone number)
      const alreadyNotifiedPhones = new Set(alreadyNotifiedBulkVendors.map(p => String(p).trim()));
      const newMatchingVendors = matchingVendors.filter(v => !alreadyNotifiedPhones.has(String(v.phone_number).trim()));
      
      // Limit to 5 vendors (excluding already notified)
      const selectedVendors = newMatchingVendors.slice(0, 5);
      console.log(`✅ Found ${selectedVendors.length} new matching vendors (${alreadyNotifiedBulkVendors.length} already notified, ${matchingVendors.length} total, limited to 5)`);
      
      if (matchingVendors.length === 0) {
        return res.json({
          status: 'success',
          msg: '0 vendors available - No matching vendors found in bulk_message_notifications',
          data: {
            order_id: orderId,
            vendors_notified: 0,
            total_found: 0,
            already_notified_count: alreadyNotifiedBulkVendors.length,
            vendors: []
          }
        });
      }
      
      if (selectedVendors.length === 0) {
        return res.json({
          status: 'success',
          msg: `All ${matchingVendors.length} matching vendors were already notified.`,
          data: {
            order_id: orderId,
            vendors_notified: 0,
            total_found: matchingVendors.length,
            already_notified_count: alreadyNotifiedBulkVendors.length,
            vendors: []
          }
        });
      }
      
      // Get customer details (name, phone, address)
      let customerName = 'Customer';
      let customerPhone = '';
      let customerLocation = customerAddress; // Default to full address
      
      try {
        // Try to get from order.customerdetails first
        if (order.customerdetails) {
          if (typeof order.customerdetails === 'object') {
            customerName = order.customerdetails.name || order.customerdetails.customer_name || order.customerdetails.full_name || 'Customer';
            customerPhone = order.customerdetails.phone || order.customerdetails.mobile || order.customerdetails.contact || order.customerdetails.mob_num || order.customerdetails.phone_number || '';
            customerLocation = order.customerdetails.address || order.customerdetails.full_address || customerAddress;
          } else if (typeof order.customerdetails === 'string') {
            customerLocation = order.customerdetails;
          }
        }
        
        // If name/phone not found, try Customer table
        if ((customerName === 'Customer' || !customerPhone) && order.customer_id) {
          const Customer = require('../models/Customer');
          const customer = await Customer.findById(order.customer_id);
          if (customer) {
            if (customerName === 'Customer' && customer.name) customerName = customer.name;
            if (!customerPhone && customer.contact) customerPhone = customer.contact;
            if (!customerLocation && customer.address) customerLocation = customer.address;
          }
        }
        
        // Fallback: try User table if customer_id is actually user_id
        if ((customerName === 'Customer' || !customerPhone) && order.customer_id) {
          const User = require('../models/User');
          const user = await User.findById(order.customer_id);
          if (user && user.user_type === 'C') {
            if (customerName === 'Customer' && user.name) customerName = user.name;
            if (!customerPhone && user.mob_num) customerPhone = user.mob_num;
            // Try to find customer record by user_id
            if ((customerName === 'Customer' || !customerPhone) && user.id) {
              const Customer = require('../models/Customer');
              const customerByUserId = await Customer.findByUserId(user.id);
              if (customerByUserId) {
                if (customerName === 'Customer' && customerByUserId.name) customerName = customerByUserId.name;
                if (!customerPhone && customerByUserId.contact) customerPhone = customerByUserId.contact;
                if (!customerLocation && customerByUserId.address) customerLocation = customerByUserId.address;
              }
            }
          }
        }
      } catch (e) {
        console.warn('Could not fetch customer details:', e.message);
      }
      
      // Clean phone number (remove spaces, +, etc.)
      if (customerPhone) {
        customerPhone = customerPhone.replace(/[\s+\-()]/g, '');
        if (customerPhone.startsWith('91') && customerPhone.length === 12) {
          customerPhone = customerPhone.substring(2);
        } else if (customerPhone.startsWith('+91')) {
          customerPhone = customerPhone.substring(3);
        }
      }
      
      console.log(`📋 Customer details: Name: ${customerName}, Phone: ${customerPhone}, Location: ${customerLocation}`);
      
      // Build SMS message - template: "Scrap pickup available near you. Name: {name} | Customer: {phone} | Location:{location} Download Scrapmate Partner app."
      // No URL - message is complete without it
      const baseTemplate = 'Scrap pickup available near you. Name: {name} | Customer: {phone} | Location:{location} Download Scrapmate Partner app.';
      const fixedParts = 'Scrap pickup available near you. Name:  | Customer:  | Location: Download Scrapmate Partner app.';
      const fixedLength = fixedParts.length; // 96 characters
      const maxMessageLength = 160;
      const availableSpace = maxMessageLength - fixedLength; // 64 characters for variables
      
      // Helper to trim text
      const trimText = (text, maxLength) => {
        if (!text || text.length <= maxLength) return text || '';
        // Try to cut at word boundary if close to maxLength
        const trimmed = text.substring(0, maxLength);
        const lastSpace = trimmed.lastIndexOf(' ');
        if (lastSpace > maxLength - 5) {
          return trimmed.substring(0, lastSpace);
        }
        return text.substring(0, maxLength);
      };
      
      // Helper to build message (maximize usage of available space - 64 chars for name, phone, location)
      const buildMessage = () => {
        // Allocate space: name gets ~40%, phone gets ~20% (phone is usually 10 digits), location gets ~40%
        const nameMax = Math.floor(availableSpace * 0.4); // ~25 chars
        const phoneMax = 10; // Phone numbers are typically 10 digits
        const locationMax = availableSpace - nameMax - phoneMax; // ~29 chars
        
        let trimmedName = trimText(customerName, nameMax);
        let trimmedPhone = customerPhone.substring(0, Math.min(phoneMax, customerPhone.length));
        let trimmedLocation = trimText(customerLocation, locationMax);
        
        // Build message using template replacement
        let message = baseTemplate
          .replace('{name}', trimmedName)
          .replace('{phone}', trimmedPhone)
          .replace('{location}', trimmedLocation);
        
        // If under limit, try to maximize by adding more characters
        if (message.length < maxMessageLength) {
          const remaining = maxMessageLength - message.length;
          // Try to add more to location first (usually has most content)
          if (trimmedLocation.length < customerLocation.length) {
            const addChars = Math.min(remaining, customerLocation.length - trimmedLocation.length);
            trimmedLocation = customerLocation.substring(0, trimmedLocation.length + addChars);
            message = baseTemplate
              .replace('{name}', trimmedName)
              .replace('{phone}', trimmedPhone)
              .replace('{location}', trimmedLocation);
          }
          // Then try to add more to name
          const newRemaining = maxMessageLength - message.length;
          if (newRemaining > 0 && trimmedName.length < customerName.length) {
            const addChars = Math.min(newRemaining, customerName.length - trimmedName.length);
            trimmedName = customerName.substring(0, trimmedName.length + addChars);
            message = baseTemplate
              .replace('{name}', trimmedName)
              .replace('{phone}', trimmedPhone)
              .replace('{location}', trimmedLocation);
          }
        }
        
        // Ensure message is exactly at or under 160
        if (message.length > maxMessageLength) {
          // Trim from location first
          const excess = message.length - maxMessageLength;
          trimmedLocation = trimText(customerLocation, trimmedLocation.length - excess);
          message = baseTemplate
            .replace('{name}', trimmedName)
            .replace('{phone}', trimmedPhone)
            .replace('{location}', trimmedLocation);
          
          // Final safety check
          if (message.length > maxMessageLength) {
            message = message.substring(0, maxMessageLength);
          }
        }
        
        return message;
      };
      
      // SMS API configuration
      const SMS_CONFIG = {
        username: 'scrapmate',
        sendername: 'SCRPMT',
        smstype: 'TRANS',
        apikey: '1bf0131f-d1f2-49ed-9c57-19f1b4400f32',
        peid: '1701173389563945545',
        templateid: '1707176810855754593'
      };
      
      // Helper to send SMS
      const sendSMS = (phoneNumber, message) => {
        return new Promise((resolve, reject) => {
          const params = querystring.stringify({
            username: SMS_CONFIG.username,
            message: message,
            sendername: SMS_CONFIG.sendername,
            smstype: SMS_CONFIG.smstype,
            numbers: phoneNumber,
            apikey: SMS_CONFIG.apikey,
            peid: SMS_CONFIG.peid,
            templateid: SMS_CONFIG.templateid
          });
          
          const options = {
            hostname: 'sms.bulksmsind.in',
            path: `/v2/sendSMS?${params}`,
            method: 'GET'
          };
          
          const req = http.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => { data += chunk; });
            res.on('end', () => {
              try {
                resolve(JSON.parse(data));
              } catch (e) {
                resolve({ raw: data });
              }
            });
          });
          
          req.on('error', reject);
          req.end();
        });
      };
      
      // Get current notified_vendor_ids (to add found user IDs)
      let currentVendorIds = [];
      if (order.notified_vendor_ids) {
        try {
          if (typeof order.notified_vendor_ids === 'string') {
            currentVendorIds = JSON.parse(order.notified_vendor_ids);
          } else {
            currentVendorIds = order.notified_vendor_ids;
          }
          if (!Array.isArray(currentVendorIds)) {
            currentVendorIds = [currentVendorIds];
          }
        } catch (e) {
          console.error('Error parsing notified_vendor_ids:', e);
          currentVendorIds = [];
        }
      }
      
      // Send SMS to each vendor (using same customer details message for all)
      const message = buildMessage();
      console.log(`📤 [BULK SMS] Built SMS message (${message.length} chars): ${message}`);
      console.log(`📤 [BULK SMS] Template ID: ${SMS_CONFIG.templateid}`);
      
      // Try to find user IDs from phone numbers for adding to notified_vendor_ids
      const User = require('../models/User');
      const vendorUserIds = [];
      
      // Find user IDs for successfully notified vendors
      const results = [];
      const successfullyNotifiedPhones = [];
      
      console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
      console.log(`📱 [BULK SMS] Sending SMS to ${selectedVendors.length} vendors`);
      console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);
      
      for (let i = 0; i < selectedVendors.length; i++) {
        const vendor = selectedVendors[i];
        try {
          console.log(`📱 [BULK SMS] Vendor ${i + 1}/${selectedVendors.length}:`);
          console.log(`   Phone: ${vendor.phone_number}`);
          console.log(`   Name: ${vendor.title}`);
          console.log(`   City: ${vendor.city || 'N/A'}`);
          console.log(`   Street: ${vendor.street || 'N/A'}`);
          console.log(`   Sending SMS...`);
          
          const smsResult = await sendSMS(vendor.phone_number, message);
          
          console.log(`📱 [BULK SMS] API Response for ${vendor.phone_number}:`, JSON.stringify(smsResult, null, 2));
          
          // Check if SMS was successful
          let isSuccess = false;
          let messageId = null;
          if (Array.isArray(smsResult) && smsResult.length > 0) {
            isSuccess = smsResult[0].status === 'success';
            messageId = smsResult[0].msgid || null;
          } else if (smsResult && typeof smsResult === 'object') {
            isSuccess = smsResult.status === 'success' || smsResult.success === true;
            messageId = smsResult.msgid || null;
          }
          
          if (isSuccess) {
            console.log(`✅ [BULK SMS] SMS sent successfully to ${vendor.phone_number}`);
            if (messageId) {
              console.log(`   Message ID: ${messageId}`);
            }
          } else {
            console.warn(`⚠️  [BULK SMS] SMS may have failed for ${vendor.phone_number}`);
          }
          
          results.push({
            phone_number: vendor.phone_number,
            vendor_name: vendor.title,
            city: vendor.city || '',
            street: vendor.street || '',
            success: isSuccess,
            message: message,
            message_id: messageId,
            sms_response: smsResult
          });
          
          if (isSuccess) {
            successfullyNotifiedPhones.push(vendor.phone_number);
          }
          
          // Try to find user ID by phone number to add to notified_vendor_ids
          try {
            // Clean phone number for search
            let cleanPhone = vendor.phone_number.replace(/[\s+\-()]/g, '');
            if (cleanPhone.startsWith('91') && cleanPhone.length === 12) {
              cleanPhone = cleanPhone.substring(2);
            } else if (cleanPhone.startsWith('+91')) {
              cleanPhone = cleanPhone.substring(3);
            }
            
            // Try to find user by mobile number
            const user = await User.findByMobile(cleanPhone);
            if (user && (user.user_type === 'S' || user.user_type === 'SR' || user.user_type === 'N' || user.user_type === 'D')) {
              vendorUserIds.push(user.id);
              console.log(`✅ Found user ID ${user.id} for phone ${vendor.phone_number}`);
            }
          } catch (userErr) {
            console.warn(`⚠️  Could not find user ID for phone ${vendor.phone_number}:`, userErr.message);
          }
          
          // Delay between SMS to avoid rate limiting
          await new Promise(resolve => setTimeout(resolve, 1000));
        } catch (error) {
          console.error(`❌ [BULK SMS ERROR] Error sending SMS to ${vendor.phone_number}:`, error.message);
          console.error(`   Stack:`, error.stack);
          results.push({
            phone_number: vendor.phone_number,
            vendor_name: vendor.title,
            city: vendor.city || '',
            street: vendor.street || '',
            success: false,
            error: error.message
          });
        }
      }
      
      const successCount = results.filter(r => r.success).length;
      const failedCount = results.filter(r => !r.success).length;
      
      console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
      console.log(`📊 [BULK SMS] Final Summary:`);
      console.log(`   ✅ Successfully sent: ${successCount}/${selectedVendors.length}`);
      console.log(`   ❌ Failed: ${failedCount}/${selectedVendors.length}`);
      console.log(`   📱 User IDs found: ${vendorUserIds.length}`);
      console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);
      
      // Update bulk_notified_vendors with successfully notified phone numbers
      const allBulkNotifiedVendors = [...new Set([...alreadyNotifiedBulkVendors, ...successfullyNotifiedPhones])];
      
      // Update notified_vendor_ids with found user IDs (if any)
      let updatedNotifiedVendorIds = currentVendorIds;
      if (vendorUserIds.length > 0) {
        updatedNotifiedVendorIds = [...new Set([...currentVendorIds, ...vendorUserIds])];
        console.log(`✅ Adding ${vendorUserIds.length} vendor user IDs to notified_vendor_ids`);
      }
      
      await Order.updateById(orderId, {
        bulk_notified_vendors: JSON.stringify(allBulkNotifiedVendors),
        notified_vendor_ids: JSON.stringify(updatedNotifiedVendorIds)
      });
      
      // Clear order cache to ensure fresh data is fetched
      try {
        const cacheKey = RedisCache.orderKey(orderId);
        await RedisCache.delete(cacheKey);
        console.log(`🗑️  Cleared order cache for ${orderId}`);
      } catch (cacheErr) {
        console.error('Error clearing order cache:', cacheErr);
      }
      
      return res.json({
        status: 'success',
        msg: successCount === 0 
          ? 'SMS sending failed for all vendors'
          : `Sent SMS notifications to ${successCount} new bulk vendors (can add more by clicking again)`,
        data: {
          order_id: orderId,
          vendors_notified: successCount,
          total_selected: selectedVendors.length,
          total_found: matchingVendors.length,
          already_notified_count: alreadyNotifiedBulkVendors.length,
          new_notified_count: successfullyNotifiedPhones.length,
          vendor_user_ids_added: vendorUserIds.length,
          vendors: results,
          sms_message: message,
          success_vendors: results.filter(r => r.success),
          failed_vendors: results.filter(r => !r.success)
        }
      });
      
    } catch (error) {
      console.error('❌ Error adding bulk notified vendors:', error);
      return res.status(500).json({
        status: 'error',
        msg: 'Failed to add bulk notified vendors',
        data: null,
        error: error.message
      });
    }
  }
}

module.exports = AdminPanelController;
