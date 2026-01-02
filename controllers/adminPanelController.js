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
        User.getMonthlyCountByUserType('C'),
        User.getMonthlyCountByUserType('S'),
        Order.getMonthlyCount(),
        Order.getMonthlyCount(4),
        Order.getMonthlyPendingCount()
      ]);

      const [
        month_wise_customers_count,
        month_wise_vendor_count,
        month_wise_orders_count,
        month_wise_completed_orders_count,
        month_wise_pending_orders_count
      ] = await Promise.race([dataPromise, timeoutPromise]);

      const result = {
        month_wise_customers_count,
        month_wise_vendor_count,
        month_wise_orders_count,
        month_wise_completed_orders_count,
        month_wise_pending_orders_count
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
        month_wise_customers_count,
        month_wise_vendor_count,
        month_wise_orders_count,
        month_wise_completed_orders_count,
        month_wise_pending_orders_count
      ] = await Promise.all([
        User.getMonthlyCountByUserType('C'),
        User.getMonthlyCountByUserType('S'),
        Order.getMonthlyCount(),
        Order.getMonthlyCount(4),
        Order.getMonthlyPendingCount()
      ]);

      const result = {
        month_wise_customers_count,
        month_wise_vendor_count,
        month_wise_orders_count,
        month_wise_completed_orders_count,
        month_wise_pending_orders_count
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
        'D': 'Door Step Buyers'
      };
      const userTypeName = userTypeMap[user_type] || `Unknown (${user_type})`;

      console.log('📊 Report Parameters:');
      console.log('   User Type:', user_type, `(${userTypeName})`);
      console.log('   Start Date:', start_date);
      console.log('   End Date:', end_date);
      console.log('   Date Range:', `${start_date} to ${end_date}`);

      // Build query based on user_type to join with appropriate table
      let query;
      let params;
      let tableJoin = '';

      if (user_type === 'S') {
        // Vendors - join with shops table
        tableJoin = 'shops';
        query = `
          SELECT 
            u.id,
            u.name,
            u.email,
            u.mob_num,
            s.address,
            s.place,
            u.created_at
          FROM users u
          LEFT JOIN shops s ON u.id = s.user_id
          WHERE u.created_at BETWEEN ? AND ? AND u.user_type = ?
          ORDER BY u.created_at DESC
        `;
        params = [`${start_date} 00:00:00`, `${end_date} 23:59:59`, user_type];
      } else if (user_type === 'C') {
        // Customers - join with customer table
        tableJoin = 'customer';
        query = `
          SELECT 
            u.id,
            u.name,
            u.email,
            u.mob_num,
            c.address,
            c.place,
            u.created_at
          FROM users u
          LEFT JOIN customer c ON u.id = c.user_id
          WHERE u.created_at BETWEEN ? AND ? AND u.user_type = ?
          ORDER BY u.created_at DESC
        `;
        params = [`${start_date} 00:00:00`, `${end_date} 23:59:59`, user_type];
      } else {
        // Door Step Buyers or other types - just users table
        tableJoin = 'none';
        query = `
          SELECT 
            u.id,
            u.name,
            u.email,
            u.mob_num,
            '' as address,
            '' as place,
            u.created_at
          FROM users u
          WHERE u.created_at BETWEEN ? AND ? AND u.user_type = ?
          ORDER BY u.created_at DESC
        `;
        params = [`${start_date} 00:00:00`, `${end_date} 23:59:59`, user_type];
      }

      console.log('🔍 Query Details:');
      console.log('   Table Join:', tableJoin || 'None (users only)');
      console.log('   SQL Query:', query.replace(/\s+/g, ' ').trim());
      console.log('   Query Params:', params);
      console.log('   Date Range in Query:', `${params[0]} to ${params[1]}`);

      const queryStartTime = Date.now();
      console.log('⏱️  Executing database query...');

      db.query(query, params, async (err, results) => {
        const queryDuration = Date.now() - queryStartTime;

        if (err) {
          console.error('═══════════════════════════════════════════════════════════');
          console.error('❌ signUpReport DATABASE ERROR');
          console.error('═══════════════════════════════════════════════════════════');
          console.error('   Error code:', err.code);
          console.error('   Error number:', err.errno);
          console.error('   Error message:', err.message);
          console.error('   SQL State:', err.sqlState);
          console.error('   Query Duration:', queryDuration, 'ms');
          console.error('   Failed Query:', query.replace(/\s+/g, ' ').trim());
          console.error('   Failed Params:', params);
          return res.json({
            status: 'error',
            msg: 'Error fetching report data',
            data: []
          });
        }

        console.log('═══════════════════════════════════════════════════════════');
        console.log('✅ signUpReport SUCCESS');
        console.log('═══════════════════════════════════════════════════════════');
        console.log(`   Total Records Found: ${results.length}`);
        console.log(`   Query Duration: ${queryDuration}ms`);
        console.log(`   User Type: ${user_type} (${userTypeName})`);
        console.log(`   Date Range: ${start_date} to ${end_date}`);

        if (results.length > 0) {
          console.log('📋 Sample Records (first 3):');
          results.slice(0, 3).forEach((record, index) => {
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
          const withAddress = results.filter(r => r.address && r.address.trim() !== '').length;
          const withPlace = results.filter(r => r.place && r.place.trim() !== '').length;
          console.log('📊 Data Quality:');
          console.log(`   Records with address: ${withAddress}/${results.length} (${Math.round(withAddress / results.length * 100)}%)`);
          console.log(`   Records with place: ${withPlace}/${results.length} (${Math.round(withPlace / results.length * 100)}%)`);
        } else {
          console.log('⚠️  No records found for the specified criteria');
        }

        console.log('═══════════════════════════════════════════════════════════');

        const response = {
          status: 'success',
          msg: 'Report data retrieved',
          data: results
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
      });
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

      // Check Redis cache first (only if no search term)
      const cacheKey = RedisCache.adminKey('b2b_users', null, { page, limit, search });
      // Don't cache search results
      if (!search) {
        try {
          const cached = await RedisCache.get(cacheKey);
          if (cached) {
            console.log('⚡ B2B users cache hit');
            return res.json({
              status: 'success',
              msg: 'B2B users retrieved',
              data: cached
            });
          }
        } catch (err) {
          console.error('Redis get error:', err);
        }
      }

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

        // Re-sort enriched users by created_at (newest first)
        enrichedUsers.sort((a, b) => {
          let dateA = a.created_at ? new Date(a.created_at) : null;
          let dateB = b.created_at ? new Date(b.created_at) : null;

          if (!dateA || isNaN(dateA.getTime())) {
            dateA = a.updated_at ? new Date(a.updated_at) : new Date(0);
          }
          if (!dateB || isNaN(dateB.getTime())) {
            dateB = b.updated_at ? new Date(b.updated_at) : new Date(0);
          }

          return dateB.getTime() - dateA.getTime();
        });

        // Apply pagination after filtering
        total = enrichedUsers.length;
        const skip = (pageNumber - 1) * pageSize;
        const paginatedUsers = enrichedUsers.slice(skip, skip + pageSize);
        enrichedUsers = paginatedUsers;

        console.log(`🔍 Paginated search results: Showing ${paginatedUsers.length} of ${total} users`);
      } else {
        // No search - use normal pagination
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
          console.log('💾 B2B users cached');
        } catch (err) {
          console.error('Redis cache set error:', err);
        }
      }

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

      // Check Redis cache first (only if no search term)
      const cacheKey = RedisCache.adminKey('b2c_users', null, { page, limit, search });
      // Don't cache search results
      if (!search) {
        try {
          const cached = await RedisCache.get(cacheKey);
          if (cached) {
            console.log('⚡ B2C users cache hit');
            return res.json({
              status: 'success',
              msg: 'B2C users retrieved',
              data: cached
            });
          }
        } catch (err) {
          console.error('Redis get error:', err);
        }
      }

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
              approval_status: shop?.approval_status || null
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
              driving_license: ''
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

        // Re-sort enriched users by created_at (newest first)
        enrichedUsers.sort((a, b) => {
          let dateA = a.created_at ? new Date(a.created_at) : null;
          let dateB = b.created_at ? new Date(b.created_at) : null;

          if (!dateA || isNaN(dateA.getTime())) {
            dateA = a.updated_at ? new Date(a.updated_at) : new Date(0);
          }
          if (!dateB || isNaN(dateB.getTime())) {
            dateB = b.updated_at ? new Date(b.updated_at) : new Date(0);
          }

          return dateB.getTime() - dateA.getTime();
        });

        // Apply pagination after filtering
        total = enrichedUsers.length;
        const skip = (pageNumber - 1) * pageSize;
        const paginatedUsers = enrichedUsers.slice(skip, skip + pageSize);
        enrichedUsers = paginatedUsers;

        console.log(`🔍 Paginated search results: Showing ${paginatedUsers.length} of ${total} users`);
      } else {
        // No search - use normal pagination
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
              approval_status: shop?.approval_status || null
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
              driving_license: ''
            };
          }
        }));

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
          console.log('💾 B2C users cached');
        } catch (err) {
          console.error('Redis cache set error:', err);
        }
      }

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

      // Check Redis cache first (only if no search term)
      const cacheKey = RedisCache.adminKey('sr_users', null, { page, limit, search });
      // Don't cache search results
      if (!search) {
        try {
          const cached = await RedisCache.get(cacheKey);
          if (cached) {
            console.log('⚡ SR users cache hit');
            return res.json({
              status: 'success',
              msg: 'SR users retrieved',
              data: cached
            });
          }
        } catch (err) {
          console.error('Redis get error:', err);
        }
      }

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

        // Re-sort enriched users by created_at (newest first)
        enrichedUsers.sort((a, b) => {
          let dateA = a.created_at ? new Date(a.created_at) : null;
          let dateB = b.created_at ? new Date(b.created_at) : null;

          if (!dateA || isNaN(dateA.getTime())) {
            dateA = a.updated_at ? new Date(a.updated_at) : new Date(0);
          }
          if (!dateB || isNaN(dateB.getTime())) {
            dateB = b.updated_at ? new Date(b.updated_at) : new Date(0);
          }

          return dateB.getTime() - dateA.getTime();
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
          console.log('💾 SR users cached');
        } catch (err) {
          console.error('Redis cache set error:', err);
        }
      }

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

      // Check Redis cache first (only if no search term)
      const cacheKey = RedisCache.adminKey('delivery_users', null, { page, limit, search });
      // Don't cache search results
      if (!search) {
        try {
          const cached = await RedisCache.get(cacheKey);
          if (cached) {
            console.log('⚡ Delivery users cache hit');
            return res.json({
              status: 'success',
              msg: 'Delivery users retrieved',
              data: cached
            });
          }
        } catch (err) {
          console.error('Redis get error:', err);
        }
      }

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

        // Re-sort enriched users by created_at (newest first)
        enrichedUsers.sort((a, b) => {
          let dateA = a.created_at ? new Date(a.created_at) : null;
          let dateB = b.created_at ? new Date(b.created_at) : null;

          if (!dateA || isNaN(dateA.getTime())) {
            dateA = a.updated_at ? new Date(a.updated_at) : new Date(0);
          }
          if (!dateB || isNaN(dateB.getTime())) {
            dateB = b.updated_at ? new Date(b.updated_at) : new Date(0);
          }

          return dateB.getTime() - dateA.getTime();
        });

        // Apply pagination after filtering
        total = enrichedUsers.length;
        const skip = (pageNumber - 1) * pageSize;
        const paginatedUsers = enrichedUsers.slice(skip, skip + pageSize);
        enrichedUsers = paginatedUsers;

        console.log(`🔍 Paginated search results: Showing ${paginatedUsers.length} of ${total} users`);
      } else {
        // No search - use normal pagination
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
          console.log('💾 Delivery users cached');
        } catch (err) {
          console.error('Redis cache set error:', err);
        }
      }

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
        enrichedUsers = await Promise.all(allResult.users.map(async (user) => {
          try {
            const customer = await Customer.findByUserId(user.id);

            return {
              ...user,
              customer: customer || null,
              contact: customer?.contact ? String(customer.contact) : (user.mob_num ? String(user.mob_num) : ''),
              address: customer?.address || '',
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

        // Re-sort enriched users by created_at (newest first)
        enrichedUsers.sort((a, b) => {
          let dateA = a.created_at ? new Date(a.created_at) : null;
          let dateB = b.created_at ? new Date(b.created_at) : null;

          if (!dateA || isNaN(dateA.getTime())) {
            dateA = a.updated_at ? new Date(a.updated_at) : new Date(0);
          }
          if (!dateB || isNaN(dateB.getTime())) {
            dateB = b.updated_at ? new Date(b.updated_at) : new Date(0);
          }

          return dateB.getTime() - dateA.getTime();
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
        enrichedUsers = await Promise.all(result.users.map(async (user) => {
          try {
            const customer = await Customer.findByUserId(user.id);

            return {
              ...user,
              customer: customer || null,
              contact: customer?.contact ? String(customer.contact) : (user.mob_num ? String(user.mob_num) : ''),
              address: customer?.address || '',
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
}

module.exports = AdminPanelController;
