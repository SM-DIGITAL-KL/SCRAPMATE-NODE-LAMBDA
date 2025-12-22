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

      // Parse customer and shop details from JSON strings
      const parsedOrders = recent_orders.map(order => {
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
        if (order.shopdetails) {
          try {
            const shopDetails = typeof order.shopdetails === 'string' 
              ? JSON.parse(order.shopdetails) 
              : order.shopdetails;
            parsed.shop_name = shopDetails?.shop_name || shopDetails?.name || 'N/A';
            parsed.shop = shopDetails;
          } catch (e) {
            console.error('Error parsing shop details:', e);
            parsed.shop_name = 'N/A';
          }
        } else {
          parsed.shop_name = 'N/A';
        }
        
        return parsed;
      });

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
          console.log(`   Records with address: ${withAddress}/${results.length} (${Math.round(withAddress/results.length*100)}%)`);
          console.log(`   Records with place: ${withPlace}/${results.length} (${Math.round(withPlace/results.length*100)}%)`);
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

      // Invalidate B2B users cache
      try {
        await RedisCache.invalidateB2BUsersCache();
        console.log('🗑️  Invalidated B2B users cache after approval status update');
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
        msg: `B2B approval status updated to ${approval_status}`,
        data: {
          userId: userId,
          shopId: shop.id,
          approval_status: approval_status
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

      // Invalidate B2C users cache
      try {
        await RedisCache.invalidateB2CUsersCache();
        console.log('🗑️  Invalidated B2C users cache after approval status update');
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
}

module.exports = AdminPanelController;
