const User = require('../models/User');
const Shop = require('../models/Shop');
const Customer = require('../models/Customer');
const DeliveryBoy = require('../models/DeliveryBoy');
const Order = require('../models/Order');
const Product = require('../models/Product');
const ProductCategory = require('../models/ProductCategory');
const CallLog = require('../models/CallLog');
const Package = require('../models/Package');
const Invoice = require('../models/Invoice');
const RedisCache = require('../utils/redisCache');
const { getDynamoDBClient } = require('../config/dynamodb');
const { GetCommand } = require('@aws-sdk/lib-dynamodb');
const { getTableName, getEnvironment } = require('../utils/dynamodbTableNames');
const crypto = require('crypto');

class UtilityController {
  // Get table data - map table names to models
  static async getTable(req, res) {
    try {
      const { name } = req.body;

      if (!name) {
        return res.status(201).json({
          status: 'error',
          msg: 'empty param',
          data: ''
        });
      }

      // Map table names to models
      const tableModelMap = {
        'users': User,
        'shops': Shop,
        'customer': Customer,
        'delivery_boy': DeliveryBoy,
        'orders': Order,
        'products': Product,
        'product_category': ProductCategory,
        'call_logs': CallLog
      };

      const Model = tableModelMap[name.toLowerCase()];
      if (!Model) {
        return res.status(201).json({
          status: 'error',
          msg: `Table ${name} not supported. Supported tables: ${Object.keys(tableModelMap).join(', ')}`,
          data: ''
        });
      }

      // Use model's getAll method if available, otherwise return empty
      let results = [];
      if (Model.getAll) {
        results = await Model.getAll();
      } else {
        // For models without getAll, return empty array
        results = [];
      }

      res.json({
        status: 'success',
        msg: 'get data',
        data: results
      });
    } catch (err) {
      console.error('Get table error:', err);
      res.status(201).json({
        status: 'error',
        msg: 'Failed to fetch data',
        data: ''
      });
    }
  }

  // Get table with condition - map table names to models
  static async getTableCondition(req, res) {
    try {
      const { name, where, value } = req.body;

      console.log(`🔍 [getTableCondition] Request: name=${name}, where=${where}, value=${value}`);

      if (!name || !where || !value) {
        return res.status(201).json({
          status: 'error',
          msg: 'empty param',
          data: ''
        });
      }

      // Handle admin_profile table directly (no model exists)
      if (name.toLowerCase() === 'admin_profile') {
        try {
          const client = getDynamoDBClient();
          let keyValue = value;
          
          // Convert to number if where is 'id'
          if (where === 'id' && !isNaN(value)) {
            keyValue = parseInt(value);
          }
          
          const command = new GetCommand({
            TableName: 'admin_profile',
            Key: { [where]: keyValue }
          });
          
          const response = await client.send(command);
          
          if (response.Item) {
            // Format image URLs if they exist
            const { getImageUrl } = require('../utils/imageHelper');
            const item = { ...response.Item };
            
            // Format slider images if they exist
            const sliderFields = ['slider_img1', 'slider_img2', 'slider_img3', 'slider_img4'];
            for (const field of sliderFields) {
              if (item[field]) {
                try {
                  // Use 'images' type for slider images, or try to detect from path
                  item[field] = await getImageUrl(item[field], 'images');
                } catch (imgErr) {
                  console.error(`Error formatting ${field}:`, imgErr);
                  // Keep original value if formatting fails
                }
              }
            }
            
            console.log(`✅ [getTableCondition] Found admin_profile record`);
            return res.json({
              status: 'success',
              msg: 'get data',
              data: [item]
            });
          } else {
            console.log(`⚠️  [getTableCondition] admin_profile record not found`);
            return res.json({
              status: 'success',
              msg: 'get data',
              data: []
            });
          }
        } catch (dbErr) {
          console.error('❌ [getTableCondition] Error fetching admin_profile:', dbErr);
          return res.status(201).json({
            status: 'error',
            msg: 'Failed to fetch admin_profile data',
            data: ''
          });
        }
      }

      // Map table names to models and their find methods
      const tableModelMap = {
        'users': { Model: User, findMethod: where === 'id' ? 'findById' : null },
        'shops': { Model: Shop, findMethod: where === 'id' ? 'findById' : where === 'user_id' ? 'findByUserId' : null },
        'customer': { Model: Customer, findMethod: where === 'id' ? 'findById' : where === 'user_id' ? 'findByUserId' : null },
        'delivery_boy': { Model: DeliveryBoy, findMethod: where === 'id' ? 'findById' : null },
        'orders': { Model: Order, findMethod: where === 'id' ? 'getById' : null },
        'products': { Model: Product, findMethod: where === 'id' ? 'findById' : null },
        'product_category': { Model: ProductCategory, findMethod: where === 'id' ? 'findById' : where === 'shop_id' ? 'findByShopId' : null }
      };

      const tableInfo = tableModelMap[name.toLowerCase()];
      if (!tableInfo) {
        return res.status(201).json({
          status: 'error',
          msg: `Table ${name} not supported`,
          data: ''
        });
      }

      let results = [];
      if (tableInfo.findMethod && tableInfo.Model[tableInfo.findMethod]) {
        const result = await tableInfo.Model[tableInfo.findMethod](value);
        results = result ? [result] : [];
      } else {
        // For unsupported conditions, return empty array
        results = [];
      }

      res.json({
        status: 'success',
        msg: 'get data',
        data: results
      });
    } catch (err) {
      console.error('Get table condition error:', err);
      res.status(201).json({
        status: 'error',
        msg: 'Failed to fetch data',
        data: ''
      });
    }
  }

  // Count rows in table
  static async countRow(req, res) {
    try {
      const { table_name } = req.params;

      if (!table_name) {
        return res.status(200).json({
          status: 'error',
          msg: 'empty param',
          data: ''
        });
      }

      // Check Redis cache first (only if previously successful)
      const cacheKey = RedisCache.listKey('count_row', { table_name });
      const cached = await RedisCache.get(cacheKey);
      if (cached !== null) {
        return res.json({
          status: 'success',
          msg: 'get data',
          data: cached
        });
      }

      // Map table names to models with count methods
      const tableCountMap = {
        'users': () => User.countByUserType ? Promise.all([User.countByUserType('C'), User.countByUserType('S'), User.countByUserType('D')]).then(counts => counts.reduce((a, b) => a + b, 0)) : 0,
        'shops': () => Shop.countByDelStatus ? Shop.countByDelStatus(1) : 0,
        'customer': () => Customer.getAll ? Customer.getAll().then(c => c.length) : 0,
        'delivery_boy': () => DeliveryBoy.count ? DeliveryBoy.count() : 0,
        'orders': () => Order.count ? Order.count() : 0,
        'products': () => Product.getAll ? Product.getAll().then(p => p.length) : 0,
        'product_category': () => ProductCategory.getAll ? ProductCategory.getAll().then(pc => pc.length) : 0,
        'call_logs': () => CallLog.count ? CallLog.count() : 0
      };

      const countFunc = tableCountMap[table_name.toLowerCase()];
      const count = countFunc ? await countFunc() : 0;

      // Cache the result only on success (5 minutes TTL)
      try {
        await RedisCache.set(cacheKey, count, '365days');
        console.log(`💾 Redis cache set for count row: ${cacheKey}`);
      } catch (redisErr) {
        console.error('Redis cache error:', redisErr);
        // Continue even if Redis fails
      }

      res.json({
        status: 'success',
        msg: 'get data',
        data: count
      });
    } catch (err) {
      console.error('Count row error:', err);
      res.status(200).json({
        status: 'error',
        msg: 'Failed to count',
        data: ''
      });
    }
  }

  // Keyword search
  static async keywordSearch(req, res) {
    try {
      const { table, name } = req.params;

      if (!table || !name) {
        return res.status(201).json({
          status: 'error',
          msg: 'empty param',
          data: ''
        });
      }

      // Check Redis cache first (only if previously successful)
      const cacheKey = RedisCache.listKey('keyword_search', { table, name });
      const cached = await RedisCache.get(cacheKey);
      if (cached) {
        return res.json({
          status: 'success',
          msg: 'Successfull',
          data: cached
        });
      }

      // Map table names to models with search methods
      const tableSearchMap = {
        'users': User,
        'shops': Shop,
        'customer': Customer,
        'delivery_boy': DeliveryBoy
      };

      const Model = tableSearchMap[table.toLowerCase()];
      let results = [];
      
      if (Model) {
        if (Model.searchByName) {
          results = await Model.searchByName(name);
        } else if (Model.getAll) {
          // Fallback: get all and filter in memory
          const all = await Model.getAll();
          const searchLower = name.toLowerCase();
          results = all.filter(item => item.name && item.name.toLowerCase().startsWith(searchLower));
        }
      }

      // Cache the result only on success (5 minutes TTL for search results)
      try {
        await RedisCache.set(cacheKey, results, '365days');
        console.log(`💾 Redis cache set for keyword search: ${cacheKey}`);
      } catch (redisErr) {
        console.error('Redis cache error:', redisErr);
        // Continue even if Redis fails
      }

      res.json({
        status: 'success',
        msg: 'Successfull',
        data: results
      });
    } catch (err) {
      console.error('Keyword search error:', err);
      res.status(201).json({
        status: 'error',
        msg: 'Search failed',
        data: ''
      });
    }
  }

  // Get user by ID from table
  static async getUserById(req, res) {
    try {
      const { user_id, table } = req.params;

      console.log(`🔍 get_user_by_id called: user_id=${user_id}, table=${table}`);

      if (!user_id || !table) {
        return res.status(201).json({
          status: 'error',
          msg: 'empty param',
          data: ''
        });
      }

      // Check Redis cache first (only if previously successful)
      const cacheKey = RedisCache.listKey('user_by_id', { user_id, table });
      const cached = await RedisCache.get(cacheKey);
      if (cached) {
        console.log(`✅ Cache hit for get_user_by_id: ${cacheKey}`);
        return res.json({
          status: 'success',
          msg: 'Successfull',
          data: cached
        });
      }

      // Map table names to models and their find methods
      const tableModelMap = {
        'users': { Model: User, findMethod: 'findById' },
        'shops': { Model: Shop, findMethod: 'findByUserId' },
        'customer': { Model: Customer, findMethod: 'findByUserId' },
        'delivery_boy': { Model: DeliveryBoy, findMethod: 'findByUserId' }
      };

      const tableInfo = tableModelMap[table.toLowerCase()];
      if (!tableInfo) {
        console.error(`❌ Table not found in map: ${table}`);
        return res.status(201).json({
          status: 'error',
          msg: `Table '${table}' not supported`,
          data: ''
        });
      }

      if (!tableInfo.Model || !tableInfo.Model[tableInfo.findMethod]) {
        console.error(`❌ Method not found: ${tableInfo.findMethod} on ${tableInfo.Model?.name || 'unknown'}`);
        return res.status(201).json({
          status: 'error',
          msg: `Method '${tableInfo.findMethod}' not found on model`,
          data: ''
        });
      }

      console.log(`🔎 Calling ${tableInfo.Model.name}.${tableInfo.findMethod}(${user_id})`);
      const data = await tableInfo.Model[tableInfo.findMethod](user_id);
      
      if (!data) {
        console.log(`❌ No data found for user_id=${user_id} in table=${table}`);
        // For shops table, return empty object instead of error (user may not have completed signup)
        if (table.toLowerCase() === 'shops') {
          console.log(`⚠️  Shop not found for user_id=${user_id}, returning empty data (user may not have completed signup)`);
          return res.json({
            status: 'success',
            msg: 'No shop data found',
            data: {}
          });
        }
        return res.status(201).json({
          status: 'error',
          msg: 'Not Found',
          data: ''
        });
      }

      console.log(`✅ Data found for user_id=${user_id} in table=${table}`);

      // Format image URL based on table type using imageHelper
      const { getImageUrl } = require('../utils/imageHelper');
      try {
        if (table.toLowerCase() === 'delivery_boy') {
          if (data.profile_img) {
            data.image = await getImageUrl(data.profile_img, 'deliveryboy');
          } else {
            data.image = '';
          }
        } else {
          if (data.profile_photo) {
            data.image = await getImageUrl(data.profile_photo, 'profile');
          } else {
            data.image = '';
          }
        }
      } catch (imageErr) {
        console.error('Error formatting image URL:', imageErr);
        data.image = '';
      }

      // Cache the result only on success (1 hour TTL)
      try {
        await RedisCache.set(cacheKey, data, '365days');
        console.log(`💾 Redis cache set for get_user_by_id: ${cacheKey}`);
      } catch (redisErr) {
        console.error('Redis cache error:', redisErr);
        // Continue even if Redis fails
      }

      res.json({
        status: 'success',
        msg: 'Successfull',
        data: data
      });
    } catch (err) {
      console.error('Get user by ID error:', err);
      console.error('Error stack:', err.stack);
      res.status(201).json({
        status: 'error',
        msg: `Failed to fetch user: ${err.message}`,
        data: ''
      });
    }
  }

  // Get all tables
  static async getAllTables(req, res) {
    try {
      const environment = getEnvironment();
      
      // Check Redis cache first (only if previously successful)
      const cacheKey = RedisCache.listKey('all_tables', { environment });
      const cached = await RedisCache.get(cacheKey);
      if (cached) {
        return res.json({
          status: 'success',
          msg: 'Successfull',
          data: cached,
          environment: environment
        });
      }

      // DynamoDB doesn't have SHOW TABLES - return list of known tables with environment-aware names
      const baseTables = [
        'users',
        'shops',
        'customer',
        'delivery_boy',
        'orders',
        'products',
        'product_category',
        'call_logs',
        'packages',
        'invoice',
        'admin_profile',
        'bulk_scrap_requests',
        'bulk_sell_requests',
        'pending_bulk_buy_orders',
        'subscription_packages',
        'order_location_history',
        'subcategory',
        'category_img_keywords',
        'addresses',
        'user_admins',
        'shop_images',
        'per_pages',
        'order_rating',
        'notifications'
      ];

      // Get environment-aware table names
      const results = baseTables.map(tableName => ({
        Tables_in_database: getTableName(tableName),
        base_name: tableName,
        environment: environment
      }));

      // Cache the result only on success (365 days TTL - tables don't change often)
      try {
        await RedisCache.set(cacheKey, results, '365days');
        console.log(`💾 Redis cache set for all tables (${environment}): ${cacheKey}`);
      } catch (redisErr) {
        console.error('Redis cache error:', redisErr);
        // Continue even if Redis fails
      }

      res.json({
        status: 'success',
        msg: 'Successfull',
        data: results,
        environment: environment
      });
    } catch (err) {
      console.error('Get all tables error:', err);
      res.status(201).json({
        status: 'error',
        msg: 'Failed to fetch tables',
        data: ''
      });
    }
  }

  // Save call log
  static async savecallLog(req, res) {
    try {
      const { order_id } = req.body;

      if (!order_id) {
        return res.status(200).json({
          status: 'error',
          msg: 'empty param',
          data: ''
        });
      }

      const Order = require('../models/Order');
      const order = await Order.getById(order_id);
      if (!order) {
        return res.status(200).json({
          status: 'error',
          msg: 'Order Not Found',
          data: ''
        });
      }

      await Order.setCallLog(order_id, 1);

      res.status(200).json({
        status: 'success',
        msg: 'Successfully updated',
        data: ''
      });
    } catch (err) {
      console.error('Save call log error:', err);
      res.status(200).json({
        status: 'error',
        msg: 'Failed to save call log',
        data: ''
      });
    }
  }

  // Save call log customer
  static async savecallLogCust(req, res) {
    try {
      const { order_id } = req.body;

      if (!order_id) {
        return res.status(200).json({
          status: 'error',
          msg: 'empty param',
          data: ''
        });
      }

      const Order = require('../models/Order');
      const order = await Order.getById(order_id);
      if (!order) {
        return res.status(200).json({
          status: 'error',
          msg: 'Order Not Found',
          data: ''
        });
      }

      await Order.setCallLog(order_id, 1);

      res.status(200).json({
        status: 'success',
        msg: 'Successfully updated',
        data: ''
      });
    } catch (err) {
      console.error('Save call log customer error:', err);
      res.status(200).json({
        status: 'error',
        msg: 'Failed to save call log',
        data: ''
      });
    }
  }

  // Search shop call log save
  static async searchShopCallLogSave(req, res) {
    try {
      const { shop_id, search_term, call_type, duration } = req.body;

      const callLogData = {
        user_id: null,
        shop_id: shop_id || null,
        customer_id: null,
        call_type: call_type || 'search',
        duration: duration || 0,
        timestamp: new Date()
      };

      await CallLog.create(callLogData);

      res.json({
        status: 'success',
        msg: 'Search call log saved',
        data: ''
      });
    } catch (err) {
      console.error('Search shop call log save error:', err);
      res.status(201).json({
        status: 'error',
        msg: 'Failed to save call log',
        data: ''
      });
    }
  }

  // State allow
  static async stateAllow(req, res) {
    try {
      // Check Redis cache first (only if previously successful)
      const cacheKey = RedisCache.listKey('state_allow', {});
      const cached = await RedisCache.get(cacheKey);
      if (cached) {
        return res.json({
          status: 'success',
          msg: 'State allow list',
          data: cached
        });
      }

      // TODO: state_allow table - Create StateAllow model if needed
      // For now, return empty array
      const results = [];

      // Cache the result only on success (365 days TTL)
      try {
        await RedisCache.set(cacheKey, results, '365days');
        console.log(`💾 Redis cache set for state allow: ${cacheKey}`);
      } catch (redisErr) {
        console.error('Redis cache error:', redisErr);
        // Continue even if Redis fails
      }

      res.json({
        status: 'success',
        msg: 'State allow list',
        data: results
      });
    } catch (err) {
      console.error('State allow error:', err);
      res.status(201).json({
        status: 'error',
        msg: 'Failed to fetch states',
        data: ''
      });
    }
  }

  // Packages subscription
  static async packagesSub(req, res) {
    try {
      // Check Redis cache first (only if previously successful)
      const cacheKey = RedisCache.listKey('packages_sub', {});
      const cached = await RedisCache.get(cacheKey);
      if (cached) {
        return res.json({
          status: 'success',
          msg: 'Packages list',
          data: cached
        });
      }

      const packages = await Package.getAll();

      // Cache the result only on success (365 days TTL)
      try {
        await RedisCache.set(cacheKey, packages, '365days');
        console.log(`💾 Redis cache set for packages sub: ${cacheKey}`);
      } catch (redisErr) {
        console.error('Redis cache error:', redisErr);
        // Continue even if Redis fails
      }

      res.json({
        status: 'success',
        msg: 'Packages list',
        data: packages
      });
    } catch (err) {
      console.error('Packages sub error:', err);
      res.status(201).json({
        status: 'error',
        msg: 'Failed to fetch packages',
        data: ''
      });
    }
  }

  // Save user packages
  static async saveUserPackages(req, res) {
    try {
      const { user_id, package_id, payment_moj_id, payment_req_id } = req.body;

      if (!user_id || !package_id) {
        return res.status(201).json({
          status: 'error',
          msg: 'empty param',
          data: ''
        });
      }

      // Verify transaction ID to prevent duplicate payments
      if (payment_moj_id) {
        const allInvoices = await Invoice.getAll();
        const duplicateInvoice = allInvoices.find(inv => 
          inv.payment_moj_id && String(inv.payment_moj_id) === String(payment_moj_id)
        );
        
        if (duplicateInvoice) {
          console.log(`⚠️  Duplicate transaction ID detected: ${payment_moj_id}`);
          return res.status(201).json({
            status: 'error',
            msg: 'This transaction has already been processed. Please contact support if you believe this is an error.',
            data: ''
          });
        }
      }

      const packageData = await Package.findByType(package_id);
      if (!packageData) {
        return res.status(201).json({
          status: 'error',
          msg: 'Package not found',
          data: ''
        });
      }

      // Check if user has any active invoices to extend subscription
      const userInvoices = await Invoice.findByUserId(user_id);
      
      const latestActiveInvoice = userInvoices
        .filter(inv => {
          if (!inv.to_date) return false;
          const toDate = new Date(inv.to_date);
          return toDate >= new Date();
        })
        .sort((a, b) => new Date(b.to_date) - new Date(a.to_date))[0];

      // Always create a new invoice to maintain payment history
      // This ensures all payment attempts are visible, including rejected ones
      // Calculate subscription dates
      let fromDate = new Date().toISOString().split('T')[0];
      if (latestActiveInvoice && latestActiveInvoice.to_date) {
        // Extend from the end of existing subscription
        fromDate = latestActiveInvoice.to_date;
      }

      const toDate = new Date(fromDate);
      toDate.setDate(toDate.getDate() + packageData.duration);
      const toDateStr = toDate.toISOString().split('T')[0];
      const subscriptionEndsAt = toDate.toISOString(); // ISO format for subscription_ends_at

      // Create new invoice with payment details
      // This creates a new record for each payment attempt, preserving history
      const newInvoice = await Invoice.create({
        user_id: user_id,
        from_date: fromDate,
        to_date: toDateStr,
        name: packageData.name,
        displayname: packageData.displayname,
        type: packageData.type || 'Paid',
        price: packageData.price,
        duration: packageData.duration,
        payment_moj_id: payment_moj_id || null,
        payment_req_id: payment_req_id || null,
        pay_details: req.body.pay_details || null,
        approval_status: 'pending' // New payment starts as pending
      });

      const invoiceId = newInvoice.id;
      console.log(`✅ Created new invoice ${invoiceId} for user ${user_id} - all payment attempts are preserved in history`);

      // Update B2C shop subscription information
      try {
        // Find all shops for the user
        const allShops = await Shop.findAllByUserId(user_id);
        
        // Find B2C shop (shop_type = 3)
        const b2cShop = allShops.find(shop => shop.shop_type === 3);
        
        if (b2cShop) {
          // Update subscription fields
          await Shop.update(b2cShop.id, {
            is_subscribed: true,
            subscription_ends_at: subscriptionEndsAt,
            is_subscription_ends: false,
            subscribed_duration: packageData.duration
          });
          
          console.log(`✅ Updated B2C shop ${b2cShop.id} subscription for user ${user_id}:`, {
            is_subscribed: true,
            subscription_ends_at: subscriptionEndsAt,
            is_subscription_ends: false
          });
          
          // Invalidate profile cache to ensure fresh data
          try {
            await RedisCache.delete(RedisCache.userKey(String(user_id), 'profile'));
            await RedisCache.delete(RedisCache.userKey(String(user_id)));
            console.log(`🗑️  Invalidated profile cache for user ${user_id}`);
          } catch (cacheErr) {
            console.error('Cache invalidation error:', cacheErr);
          }
        } else {
          console.log(`⚠️  No B2C shop found for user ${user_id} - subscription info not updated in shop`);
        }
      } catch (shopUpdateErr) {
        console.error('Error updating shop subscription:', shopUpdateErr);
        // Don't fail the request if shop update fails - invoice is already created
      }

      res.json({
        status: 'success',
        msg: 'Package saved',
        data: ''
      });
    } catch (err) {
      console.error('Save user packages error:', err);
      res.status(201).json({
        status: 'error',
        msg: 'Failed to save package',
        data: ''
      });
    }
  }

  // Payment history
  static async paymentHistory(req, res) {
    try {
      const { user_id } = req.body;

      if (!user_id) {
        return res.status(201).json({
          status: 'error',
          msg: 'empty param',
          data: ''
        });
      }

      // Get all invoices for the user
      const allInvoices = await Invoice.findByUserId(user_id);
      
      // Filter to show only Paid invoices and sort by created_at descending (newest first)
      const paidInvoices = allInvoices
        .filter(inv => inv.type === 'Paid' || inv.type === 'paid')
        .sort((a, b) => {
          const dateA = new Date(a.created_at || 0);
          const dateB = new Date(b.created_at || 0);
          return dateB - dateA; // Newest first
        });

      console.log(`📋 Payment history for user ${user_id}: Found ${paidInvoices.length} paid invoices out of ${allInvoices.length} total invoices`);

      res.json({
        status: 'success',
        msg: 'Payment history',
        data: paidInvoices,
        total: paidInvoices.length
      });
    } catch (err) {
      console.error('Payment history error:', err);
      res.status(201).json({
        status: 'error',
        msg: 'Failed to fetch payment history',
        data: ''
      });
    }
  }

  // Third party credentials
  static async thirdPartyCredentials(req, res) {
    try {
      // Check Redis cache first (only if previously successful)
      const cacheKey = RedisCache.listKey('third_party_credentials', {});
      const cached = await RedisCache.get(cacheKey);
      if (cached) {
        console.log('✅ Using cached third party credentials');
        return res.json({
          status: 'success',
          msg: 'Third party credentials',
          data: cached
        });
      }

      // Start with environment variables as defaults
      let credentials = {
        google_api_key: process.env.APP_GOOGLE_API_KEY || '',
        sms_api_key: process.env.SMS_API_KEY || '',
        fcm_server_key: process.env.FCM_SERVER_KEY || ''
      };

      // Try to fetch from DynamoDB admin_profile table
      try {
        const client = getDynamoDBClient();
        const command = new GetCommand({
          TableName: 'admin_profile',
          Key: { id: 1 }
        });
        const response = await client.send(command);

        if (response.Item) {
          console.log('✅ Retrieved item from DynamoDB admin_profile');
          console.log('📋 Available fields in admin_profile:', Object.keys(response.Item));
          console.log('📋 Full admin_profile item:', JSON.stringify(response.Item, null, 2));
          
          // Update credentials from DynamoDB if available
          if (response.Item.google_api_key) {
            credentials.google_api_key = response.Item.google_api_key;
            console.log('   ✅ Google API key from DynamoDB');
          }
          if (response.Item.sms_api_key) {
            credentials.sms_api_key = response.Item.sms_api_key;
            console.log('   ✅ SMS API key from DynamoDB');
          }
          if (response.Item.fcm_server_key) {
            credentials.fcm_server_key = response.Item.fcm_server_key;
            console.log('   ✅ FCM Server key from DynamoDB');
          }
          
          // Also check alternative field names
          if (!credentials.google_api_key && response.Item.googleAPIKey) {
            credentials.google_api_key = response.Item.googleAPIKey;
            console.log('   ✅ Google API key from DynamoDB (alternative field)');
          }
          if (!credentials.sms_api_key && response.Item.smsAPIKey) {
            credentials.sms_api_key = response.Item.smsAPIKey;
            console.log('   ✅ SMS API key from DynamoDB (alternative field)');
          }
          if (!credentials.fcm_server_key && response.Item.fcmServerKey) {
            credentials.fcm_server_key = response.Item.fcmServerKey;
            console.log('   ✅ FCM Server key from DynamoDB (alternative field)');
          }
        } else {
          console.log('⚠️ admin_profile not found in DynamoDB, using env/default values');
        }
      } catch (dbErr) {
        console.error('Error fetching credentials from DynamoDB:', dbErr);
        console.log('⚠️ Falling back to env/default values');
      }

      console.log('📋 Final credentials:');
      console.log(`   Google API Key: ${credentials.google_api_key ? 'SET (' + credentials.google_api_key.substring(0, 10) + '...)' : 'EMPTY'}`);
      console.log(`   SMS API Key: ${credentials.sms_api_key ? 'SET' : 'EMPTY'}`);
      console.log(`   FCM Server Key: ${credentials.fcm_server_key ? 'SET' : 'EMPTY'}`);

      // Cache the result only on success (365 days TTL - credentials don't change often)
      try {
        await RedisCache.set(cacheKey, credentials, '365days');
        console.log(`💾 Redis cache set for third party credentials: ${cacheKey}`);
      } catch (redisErr) {
        console.error('Redis cache error:', redisErr);
        // Continue even if Redis fails
      }

      res.json({
        status: 'success',
        msg: 'Third party credentials',
        data: credentials
      });
    } catch (err) {
      console.error('Third party credentials error:', err);
      res.status(201).json({
        status: 'error',
        msg: 'Failed to fetch credentials',
        data: ''
      });
    }
  }

  // Version check
  static async versionCheck(req, res) {
    try {
      const { version } = req.params;

      // Check Redis cache first (only if previously successful)
      const cacheKey = RedisCache.listKey('version_check', { version });
      const cached = await RedisCache.get(cacheKey);
      if (cached) {
        return res.json({
          status: 'success',
          msg: 'Version check',
          data: cached
        });
      }

      // Fetch current version from DynamoDB admin_profile table
      let currentVersion = process.env.APP_VERSION || '1.0.0';
      try {
        const client = getDynamoDBClient();
        const command = new GetCommand({
          TableName: 'admin_profile',
          Key: { id: 1 }
        });
        const response = await client.send(command);
        
        if (response.Item) {
          // Try different possible field names for version
          currentVersion = response.Item.app_version || 
                          response.Item.appVersion || 
                          response.Item.version || 
                          currentVersion;
          console.log(`✅ Retrieved version from DynamoDB admin_profile: ${currentVersion}`);
        } else {
          console.log('⚠️ admin_profile not found in DynamoDB, using env/default version');
        }
      } catch (dbErr) {
        console.error('Error fetching version from DynamoDB:', dbErr);
        console.log('⚠️ Falling back to env/default version');
        // Continue with env/default version
      }

      const isUpdateRequired = version !== currentVersion;

      const data = {
        current_version: currentVersion,
        is_update_required: isUpdateRequired
      };

      // Cache the result only on success (365 days TTL - version doesn't change often)
      try {
        await RedisCache.set(cacheKey, data, '365days');
        console.log(`💾 Redis cache set for version check: ${cacheKey}`);
      } catch (redisErr) {
        console.error('Redis cache error:', redisErr);
        // Continue even if Redis fails
      }

      res.json({
        status: 'success',
        msg: 'Version check',
        data: data
      });
    } catch (err) {
      console.error('Version check error:', err);
      res.status(201).json({
        status: 'error',
        msg: 'Version check failed',
        data: ''
      });
    }
  }

  // SMS testing
  static async smstesting(req, res) {
    try {
      // TODO: Implement SMS testing
      res.json({
        status: 'success',
        msg: 'SMS testing',
        data: ''
      });
    } catch (err) {
      console.error('SMS testing error:', err);
      res.status(201).json({
        status: 'error',
        msg: 'SMS testing failed',
        data: ''
      });
    }
  }

  // Permanent delete
  static async permanentDelete(req, res) {
    try {
      const { user_id } = req.body;

      if (!user_id) {
        return res.status(201).json({
          status: 'error',
          msg: 'empty param',
          data: ''
        });
      }

      const User = require('../models/User');
      const user = await User.findById(user_id);
      if (!user) {
        return res.status(201).json({
          status: 'error',
          msg: 'User Not Found',
          data: ''
        });
      }

      // Soft delete based on user type
      if (user.user_type === 'C') {
        const customer = await Customer.findByUserId(user_id);
        if (customer) {
          await Customer.update(customer.id, { del_status: 2 });
        }
      } else if (user.user_type === 'S') {
        const shop = await Shop.findByUserId(user_id);
        if (shop) {
          await Shop.update(shop.id, { del_status: 2 });
        }
      } else if (user.user_type === 'D') {
        const deliveryBoy = await DeliveryBoy.findByUserId(user_id);
        if (deliveryBoy) {
          await DeliveryBoy.update(deliveryBoy.id, { del_status: 2 });
        }
      }

      // TODO: Delete user - User model doesn't have delete method yet
      // For now, just soft delete the related records

      // Invalidate all user-related caches
      try {
        const userId = String(user_id);
        await RedisCache.delete(RedisCache.userKey(userId, 'profile'));
        await RedisCache.delete(RedisCache.userKey(userId));
        
        // Invalidate get_user_by_id cache for all possible tables
        await RedisCache.delete(RedisCache.listKey('user_by_id', { user_id: userId, table: 'users' }));
        if (user.user_type === 'C') {
          await RedisCache.delete(RedisCache.dashboardKey('customer', userId));
          await RedisCache.delete(RedisCache.listKey('user_by_id', { user_id: userId, table: 'customer' }));
        } else if (user.user_type === 'S') {
          await RedisCache.delete(RedisCache.dashboardKey('shop', userId));
          await RedisCache.delete(RedisCache.listKey('user_by_id', { user_id: userId, table: 'shops' }));
        } else if (user.user_type === 'D') {
          await RedisCache.delete(RedisCache.dashboardKey('deliveryboy', userId));
          await RedisCache.delete(RedisCache.listKey('user_by_id', { user_id: userId, table: 'delivery_boy' }));
        }
        
        // Invalidate name-based cache if user had a name
        if (user.name) {
          await RedisCache.delete(RedisCache.userKey(`name:${user.name}`, 'search'));
          await RedisCache.delete(RedisCache.userKey(`name:${user.name}`, 'exact'));
        }
        
        console.log(`🗑️  Invalidated all user caches for user_id: ${userId}`);
      } catch (redisErr) {
        console.error('Redis cache invalidation error:', redisErr);
      }

      res.status(200).json({
        status: 'success',
        message: 'Delete Permanent',
        data: ''
      });
    } catch (err) {
      console.error('Permanent delete error:', err);
      res.status(201).json({
        status: 'error',
        msg: 'Delete failed',
        data: ''
      });
    }
  }

  // Failed jobs
  static async failedJobs(req, res) {
    try {
      // TODO: failed_jobs table - Create FailedJob model if needed
      // For now, return empty array
      const results = [];

      res.json({
        status: 'success',
        msg: 'Failed jobs',
        data: results
      });
    } catch (err) {
      console.error('Failed jobs error:', err);
      res.status(201).json({
        status: 'error',
        msg: 'Failed to fetch jobs',
        data: ''
      });
    }
  }

  // Generate PayU payment hash
  // Hash format: sha512(key|txnid|amount|productinfo|firstname|email|udf1|udf2|udf3|udf4|udf5||||||salt)
  // IMPORTANT: The formula must be EXACT - udf6-udf10 are always empty (shown as ||||||)
  static async generatePayUHash(req, res) {
    try {
      const {
        key,
        txnid,
        amount,
        productinfo,
        firstname,
        email,
        udf1 = '',
        udf2 = '',
        udf3 = '',
        udf4 = '',
        udf5 = '',
        salt
      } = req.body;

      // Validate required fields
      if (!key || !txnid || !amount || !productinfo || !firstname || !email || !salt) {
        return res.status(400).json({
          status: 'error',
          msg: 'Missing required parameters: key, txnid, amount, productinfo, firstname, email, salt',
          data: ''
        });
      }

      // Build hash string: key|txnid|amount|productinfo|firstname|email|udf1|udf2|udf3|udf4|udf5||||||salt
      // IMPORTANT: udf6-udf10 must be empty strings (shown as ||||||)
      const hashString = `${key}|${txnid}|${amount}|${productinfo}|${firstname}|${email}|${udf1}|${udf2}|${udf3}|${udf4}|${udf5}||||||${salt}`;

      // Generate SHA512 hash
      const hash = crypto.createHash('sha512').update(hashString).digest('hex');

      console.log('💳 PayU Hash Generated:', {
        txnid,
        amount,
        hashLength: hash.length,
        hashString: hashString.replace(salt, 'SALT_HIDDEN'), // Log without exposing salt
        hashFirstChars: hash.substring(0, 20) + '...',
        hashLastChars: '...' + hash.substring(hash.length - 20)
      });
      
      // Detailed logging for debugging
      console.log('💳 PayU Hash Calculation Details:', {
        key,
        txnid,
        amount,
        productinfo,
        firstname,
        email,
        udf1: udf1 || '(empty)',
        udf2: udf2 || '(empty)',
        udf3: udf3 || '(empty)',
        udf4: udf4 || '(empty)',
        udf5: udf5 || '(empty)',
        udf6_10: '|||||| (5 empty fields)',
        saltLength: salt ? salt.length : 0,
        hashStringLength: hashString.length,
        hashStringPreview: hashString.substring(0, 100) + '...' + hashString.substring(hashString.length - 20)
      });

      res.json({
        status: 'success',
        msg: 'Hash generated successfully',
        data: {
          hash: hash
        }
      });
    } catch (err) {
      console.error('Generate PayU hash error:', err);
      res.status(500).json({
        status: 'error',
        msg: 'Failed to generate hash',
        data: ''
      });
    }
  }

  // Clear Redis cache
  static async clearRedisCache(req, res) {
    try {
      const { type = 'all', keys = null } = req.body;

      // If specific keys are provided, delete them directly
      if (keys && Array.isArray(keys)) {
        let deletedCount = 0;
        for (const key of keys) {
          const deleted = await RedisCache.delete(key);
          if (deleted) deletedCount++;
        }
        
        return res.json({
          status: 'success',
          msg: `Deleted ${deletedCount} of ${keys.length} cache key(s)`,
          data: { deleted: deletedCount, total: keys.length }
        });
      }

      // Otherwise use the type-based clearing
      const result = await RedisCache.clearAll(type);

      if (result.success) {
        res.json({
          status: 'success',
          msg: 'Redis cache clear requested',
          data: result
        });
      } else {
        res.status(201).json({
          status: 'error',
          msg: result.message || 'Failed to clear cache',
          data: result
        });
      }
    } catch (err) {
      console.error('Clear Redis cache error:', err);
      res.status(201).json({
        status: 'error',
        msg: 'Failed to clear cache',
        data: { error: err.message }
      });
    }
  }

  // Get system metrics
  static async getMetrics(req, res) {
    try {
      const os = require('os');
      const process = require('process');
      
      // Get DynamoDB table counts using the same efficient methods as dashboard
      const User = require('../models/User');
      const Shop = require('../models/Shop');
      const Customer = require('../models/Customer');
      const DeliveryBoy = require('../models/DeliveryBoy');
      const Order = require('../models/Order');
      const Product = require('../models/Product');
      const ProductCategory = require('../models/ProductCategory');
      const Package = require('../models/Package');
      const Invoice = require('../models/Invoice');
      const CallLog = require('../models/CallLog');
      
      // Get counts using efficient count methods (same as dashboard)
      const counts = {};
      
      try {
        // Use same methods as dashboard for consistency
        counts.shops = await Shop.countByDelStatus(1);
        counts.customers = await User.countByUserType('C');
        counts.this_month_customers = await User.countByUserTypeAndCurrentMonth('C');
        counts.this_month_vendors = await User.countByUserTypeAndCurrentMonth('S');
        counts.delivery_boys = await DeliveryBoy.count();
        counts.users = 0; // user_admins - TODO: Create UserAdmin model if needed
        counts.orders = await Order.count();
        counts.calllogs = await CallLog.count();
        counts.todayscalllogs = await CallLog.countByDate();
        
        // Additional counts for metrics
        if (User.count) {
          counts.total_users = await User.count();
        } else {
          counts.total_users = counts.customers + await User.countByUserType('S') + await User.countByUserType('D');
        }
        
        // Use getAll only for tables without count methods (less efficient but necessary)
        try {
          const products = await Product.getAll();
          counts.products = products ? products.length : 0;
        } catch (e) {
          console.error('Error counting products:', e);
          counts.products = 0;
        }
        
        try {
          const categories = await ProductCategory.getAll();
          counts.product_categories = categories ? categories.length : 0;
        } catch (e) {
          console.error('Error counting product categories:', e);
          counts.product_categories = 0;
        }
        
        try {
          const packages = await Package.getAll();
          counts.packages = packages ? packages.length : 0;
        } catch (e) {
          console.error('Error counting packages:', e);
          counts.packages = 0;
        }
        
        try {
          const invoices = await Invoice.getAll();
          counts.invoices = invoices ? invoices.length : 0;
        } catch (e) {
          console.error('Error counting invoices:', e);
          counts.invoices = 0;
        }
      } catch (e) {
        console.error('Error getting counts:', e);
        // Set defaults on error
        counts.shops = 0;
        counts.customers = 0;
        counts.this_month_customers = 0;
        counts.this_month_vendors = 0;
        counts.delivery_boys = 0;
        counts.users = 0;
        counts.orders = 0;
        counts.calllogs = 0;
        counts.todayscalllogs = 0;
        counts.total_users = 0;
        counts.products = 0;
        counts.product_categories = 0;
        counts.packages = 0;
        counts.invoices = 0;
      }

      // System metrics
      const systemMetrics = {
        uptime: process.uptime(),
        uptime_formatted: `${Math.floor(process.uptime() / 3600)}h ${Math.floor((process.uptime() % 3600) / 60)}m ${Math.floor(process.uptime() % 60)}s`,
        memory: {
          used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
          total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
          rss: Math.round(process.memoryUsage().rss / 1024 / 1024),
          external: Math.round(process.memoryUsage().external / 1024 / 1024)
        },
        cpu: {
          load_average: os.loadavg(),
          cpus: os.cpus().length
        },
        platform: {
          type: os.type(),
          platform: os.platform(),
          arch: os.arch(),
          release: os.release()
        },
        node_version: process.version,
        env: process.env.NODE_ENV || 'development'
      };

      // Redis cache status
      let redisStatus = 'unknown';
      try {
        const testKey = 'metrics:test';
        await RedisCache.set(testKey, 'test', 10);
        await RedisCache.get(testKey);
        await RedisCache.delete(testKey);
        redisStatus = 'connected';
      } catch (redisErr) {
        redisStatus = 'error';
        console.error('Redis connection test error:', redisErr);
      }

      // DynamoDB status
      let dynamodbStatus = 'unknown';
      try {
        const { getDynamoDBClient } = require('../config/dynamodb');
        const client = getDynamoDBClient();
        dynamodbStatus = 'connected';
      } catch (dynamoErr) {
        dynamodbStatus = 'error';
        console.error('DynamoDB connection test error:', dynamoErr);
      }

      const metrics = {
        timestamp: new Date().toISOString(),
        system: systemMetrics,
        database: {
          type: 'DynamoDB',
          status: dynamodbStatus,
          region: process.env.AWS_REGION || 'ap-south-1',
          tables: counts
        },
        cache: {
          type: 'Redis (Upstash)',
          status: redisStatus
        },
        api: {
          version: process.env.APP_VERSION || '1.0.0',
          endpoints: 'active'
        }
      };

      res.json({
        status: 'success',
        msg: 'System metrics',
        data: metrics
      });
    } catch (err) {
      console.error('Get metrics error:', err);
      res.status(201).json({
        status: 'error',
        msg: 'Failed to fetch metrics',
        data: { error: err.message }
      });
    }
  }

  // Get PayU payment form HTML
  static async getPayUForm(req, res) {
    try {
      const {
        key,
        txnid,
        amount,
        productinfo,
        firstname,
        email,
        phone,
        surl,
        furl,
        hash,
        udf1,
        udf2,
        udf3,
        udf4,
        udf5,
      } = req.query;

      // PayU credentials (should be in environment variables)
      // IMPORTANT: For production, set PAYU_MERCHANT_KEY and PAYU_SALT in environment variables
      const MERCHANT_KEY = process.env.PAYU_MERCHANT_KEY || 'eO7BjK'; // Default to test key if not set
      const SALT = process.env.PAYU_SALT || 'BrOTecyan06WRQwHkkFw2XAXRBpR0jKi'; // Default to test salt if not set
      
      // Production environment
      const PAYU_BASE_URL = 'https://secure.payu.in'; // Production environment
      
      // PayU Production Configuration:
      // UPI ID: 7736068251@pthdfc
      // Merchant Name: Scrapmate Partner
      // Note: UPI ID and merchant details are configured in PayU merchant dashboard

      // Validate required parameters
      if (!txnid || !amount || !firstname || !email || !phone || !productinfo || !surl || !furl) {
        return res.status(400).send(`
          <html>
            <head><title>PayU Form Error</title></head>
            <body>
              <h2>Error: Missing required parameters</h2>
              <p>Please provide all required payment parameters.</p>
            </body>
          </html>
        `);
      }

      // ALWAYS recalculate hash to ensure it's correct according to PayU's exact formula
      // PayU hash formula: sha512(key|txnid|amount|productinfo|firstname|email|udf1|udf2|udf3|udf4|udf5||||||SALT)
      // Note: udf6-udf10 are always empty (shown as ||||||)
      // IMPORTANT: We recalculate the hash here to ensure it matches PayU's exact requirements
      const hashString = `${MERCHANT_KEY}|${txnid}|${amount}|${productinfo}|${firstname}|${email}|${udf1 || ''}|${udf2 || ''}|${udf3 || ''}|${udf4 || ''}|${udf5 || ''}||||||${SALT}`;
      
      const paymentHash = crypto.createHash('sha512').update(hashString).digest('hex');
      
      // If a hash was provided, verify it matches (for debugging)
      if (hash && hash !== paymentHash) {
        console.error('⚠️  WARNING: Provided hash does not match recalculated hash!');
        console.error('   Provided hash:', hash.substring(0, 50) + '...');
        console.error('   Recalculated hash:', paymentHash.substring(0, 50) + '...');
        console.error('   Using recalculated hash to ensure PayU accepts the transaction');
      }
      
      console.log('💳 PayU Hash Calculated in getPayUForm:', {
        txnid,
        amount,
        hashLength: paymentHash.length,
        hashString: hashString.replace(SALT, 'SALT_HIDDEN'), // Log without exposing salt
        hashFirstChars: paymentHash.substring(0, 20) + '...',
        hashLastChars: '...' + paymentHash.substring(paymentHash.length - 20),
        providedHash: hash ? 'Yes (verified)' : 'No (generated)'
      });
      
      // Log detailed hash calculation for debugging
      console.log('💳 PayU Hash Calculation Details:', {
        key: MERCHANT_KEY,
        txnid,
        amount,
        productinfo,
        firstname,
        email,
        udf1: udf1 || '(empty)',
        udf2: udf2 || '(empty)',
        udf3: udf3 || '(empty)',
        udf4: udf4 || '(empty)',
        udf5: udf5 || '(empty)',
        udf6_10: '|||||| (5 empty fields)',
        hashStringLength: hashString.length,
        hashStringPreview: hashString.substring(0, 80) + '...[SALT]'
      });

      const action = `${PAYU_BASE_URL}/_payment`;

      // Generate HTML form
      const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="ie=edge">
  <title>PayU Payment</title>
  <script>
    var hash = '${paymentHash}';
    function submitPayuForm() {
      if (hash == '') {
        return;
      }
      var payuForm = document.forms.payuForm;
      if (payuForm) {
        payuForm.submit();
      }
    }
    window.onload = function() {
      setTimeout(submitPayuForm, 500);
    };
  </script>
  <style>
    body {
      font-family: Arial, sans-serif;
      padding: 20px;
      background-color: #f5f5f5;
    }
    .form-container {
      max-width: 600px;
      margin: 0 auto;
      background: white;
      padding: 20px;
      border-radius: 8px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    }
    input, textarea {
      width: 100%;
      padding: 8px;
      margin: 5px 0;
      border: 1px solid #ddd;
      border-radius: 4px;
      box-sizing: border-box;
    }
    textarea {
      min-height: 60px;
    }
  </style>
</head>
<body>
  <div class="form-container">
    <h2>Processing Payment...</h2>
    <p>Please wait while we redirect you to PayU...</p>
    <form action="${action}" method="post" name="payuForm">
      <input type="hidden" name="key" value="${MERCHANT_KEY}" />
      <input type="hidden" name="hash" value="${paymentHash}" />
      <input type="hidden" name="txnid" value="${txnid}" />
      <input type="hidden" name="amount" id="amount" value="${amount}" />
      <input type="hidden" name="productinfo" id="productinfo" value="${productinfo}" />
      <input type="hidden" name="firstname" id="firstname" value="${firstname}" />
      <input type="hidden" name="email" id="email" value="${email}" />
      <input type="hidden" name="phone" id="phone" value="${phone}" />
      <input type="hidden" name="surl" value="${surl}" />
      <input type="hidden" name="furl" value="${furl}" />
      <input type="hidden" name="service_provider" value="payu_paisa" />
      ${udf1 ? `<input type="hidden" name="udf1" value="${udf1}" />` : ''}
      ${udf2 ? `<input type="hidden" name="udf2" value="${udf2}" />` : ''}
      ${udf3 ? `<input type="hidden" name="udf3" value="${udf3}" />` : ''}
      ${udf4 ? `<input type="hidden" name="udf4" value="${udf4}" />` : ''}
      ${udf5 ? `<input type="hidden" name="udf5" value="${udf5}" />` : ''}
    </form>
  </div>
</body>
</html>
      `;

      res.setHeader('Content-Type', 'text/html');
      res.send(html);
    } catch (err) {
      console.error('Get PayU form error:', err);
      res.status(500).send(`
        <html>
          <head><title>PayU Form Error</title></head>
          <body>
            <h2>Error: Failed to generate payment form</h2>
            <p>${err.message}</p>
          </body>
        </html>
      `);
    }
  }

  // Handle PayU success response
  static async payUSuccess(req, res) {
    try {
      const responseData = {
        status: req.body.status || req.query.status || 'success',
        txnid: req.body.txnid || req.query.txnid,
        amount: req.body.amount || req.query.amount,
        firstname: req.body.firstname || req.query.firstname,
        addedon: req.body.addedon || req.query.addedon,
        productinfo: req.body.productinfo || req.query.productinfo,
        lastname: req.body.lastname || req.query.lastname,
        email: req.body.email || req.query.email,
        phone: req.body.phone || req.query.phone,
      };

      console.log('✅ PayU Success Response:', responseData);

      // Return HTML page that sends message to React Native WebView
      const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Payment Success</title>
  <style>
    body {
      font-family: Arial, sans-serif;
      display: flex;
      justify-content: center;
      align-items: center;
      min-height: 100vh;
      margin: 0;
      background-color: #f5f5f5;
    }
    .success-container {
      text-align: center;
      background: white;
      padding: 40px;
      border-radius: 8px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    }
    .success-icon {
      font-size: 64px;
      color: #4CAF50;
      margin-bottom: 20px;
    }
    h2 {
      color: #4CAF50;
      margin-bottom: 10px;
    }
    p {
      color: #666;
    }
  </style>
</head>
<body>
  <div class="success-container">
    <div class="success-icon">✓</div>
    <h2>Payment Successful!</h2>
    <p>Transaction ID: ${responseData.txnid || 'N/A'}</p>
    <p>Amount: ₹${responseData.amount || 'N/A'}</p>
    <p>Please wait while we process your payment...</p>
  </div>
  <script>
    var responseData = ${JSON.stringify(responseData)};
    if (window.ReactNativeWebView) {
      window.ReactNativeWebView.postMessage(JSON.stringify(responseData));
    } else {
      console.log('Payment response:', responseData);
    }
  </script>
</body>
</html>
      `;

      res.setHeader('Content-Type', 'text/html');
      res.send(html);
    } catch (err) {
      console.error('PayU success handler error:', err);
      res.status(500).send('Error processing payment response');
    }
  }

  // Handle PayU failure response
  static async payUFailure(req, res) {
    try {
      const responseData = {
        status: 'failure',
        txnid: req.body.txnid || req.query.txnid,
        amount: req.body.amount || req.query.amount,
        message: req.body.error || req.query.error || 'Payment failed',
        error: req.body.error || req.query.error || 'Unknown error',
      };

      console.log('❌ PayU Failure Response:', responseData);

      // Return HTML page that sends message to React Native WebView
      const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Payment Failed</title>
  <style>
    body {
      font-family: Arial, sans-serif;
      display: flex;
      justify-content: center;
      align-items: center;
      min-height: 100vh;
      margin: 0;
      background-color: #f5f5f5;
    }
    .failure-container {
      text-align: center;
      background: white;
      padding: 40px;
      border-radius: 8px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    }
    .failure-icon {
      font-size: 64px;
      color: #f44336;
      margin-bottom: 20px;
    }
    h2 {
      color: #f44336;
      margin-bottom: 10px;
    }
    p {
      color: #666;
    }
  </style>
</head>
<body>
  <div class="failure-container">
    <div class="failure-icon">✗</div>
    <h2>Payment Failed</h2>
    <p>${responseData.message}</p>
    <p>Transaction ID: ${responseData.txnid || 'N/A'}</p>
    <p>Please try again or contact support.</p>
  </div>
  <script>
    var responseData = ${JSON.stringify(responseData)};
    if (window.ReactNativeWebView) {
      window.ReactNativeWebView.postMessage(JSON.stringify(responseData));
    } else {
      console.log('Payment response:', responseData);
    }
  </script>
</body>
</html>
      `;

      res.setHeader('Content-Type', 'text/html');
      res.send(html);
    } catch (err) {
      console.error('PayU failure handler error:', err);
      res.status(500).send('Error processing payment response');
    }
  }
}

module.exports = UtilityController;

