const Customer = require('../models/Customer');
const Order = require('../models/Order');
const User = require('../models/User');
const RedisCache = require('../utils/redisCache');

class CustomerPanelController {
  static async customers(req, res) {
    try {
      console.log('🟢 CustomerPanelController.customers called');
      res.json({
        status: 'success',
        msg: 'Customers page data',
        data: { pagename: 'Customers' }
      });
    } catch (error) {
      console.error('❌ customers error:', error);
      res.status(500).json({ status: 'error', msg: 'Error loading customers page', data: { pagename: 'Customers' } });
    }
  }

  static async getCustomerById(req, res) {
    try {
      const { id } = req.params;
      console.log('🟢 CustomerPanelController.getCustomerById called', { id });
      
      // Check Redis cache first
      const cacheKey = RedisCache.customerKey(id);
      try {
        const cached = await RedisCache.get(cacheKey);
        if (cached) {
          console.log('⚡ Customer cache hit:', cacheKey);
          return res.json({ status: 'success', msg: 'Customer retrieved', data: cached });
        }
      } catch (err) {
        console.error('Redis get error:', err);
      }
      
      // Use Customer model
      const customerData = await Customer.findById(id);
      console.log(`✅ getCustomerById: Found customer:`, customerData ? 'Yes' : 'No');
      
      // Cache customer data for 30 minutes
      if (customerData) {
        try {
          await RedisCache.set(cacheKey, customerData, '30days');
          console.log('💾 Customer data cached:', cacheKey);
        } catch (err) {
          console.error('Redis cache set error:', err);
        }
      }
      
      res.json({ status: 'success', msg: 'Customer retrieved', data: customerData });
    } catch (error) {
      console.error('❌ getCustomerById error:', error);
      res.status(500).json({ status: 'error', msg: 'Error fetching customer', data: null });
    }
  }

  static async orders(req, res) {
    try {
      console.log('🟢 CustomerPanelController.orders called - returning page data');
      console.log('   Request method:', req.method);
      console.log('   Request path:', req.path);
      res.json({
        status: 'success',
        msg: 'Orders page data',
        data: { pagename: 'orders' }
      });
    } catch (error) {
      console.error('❌ orders error:', error);
      console.error('   Error stack:', error.stack);
      res.status(500).json({ status: 'error', msg: 'Error loading orders page', data: { pagename: 'orders' } });
    }
  }

  static async viewCustomers(req, res) {
    try {
      console.log('🟢 CustomerPanelController.viewCustomers called');
      
      // Check Redis cache first
      const cacheKey = RedisCache.listKey('customer_list');
      try {
        const cached = await RedisCache.get(cacheKey);
        if (cached) {
          console.log('⚡ View customers cache hit');
          return res.json({ 
            status: 'success',
            msg: 'Customers retrieved',
            data: cached 
          });
        }
      } catch (err) {
        console.error('Redis get error:', err);
      }
      
      // Use Customer model to get all customers
      const results = await Customer.getAll();
      console.log(`✅ viewCustomers: Found ${results.length} customers`);
      
      // Cache customers list for 10 minutes
      try {
        await RedisCache.set(cacheKey, results, '30days');
        console.log('💾 Customers list cached');
      } catch (err) {
        console.error('Redis cache set error:', err);
      }
      
      res.json({ 
        status: 'success',
        msg: 'Customers retrieved',
        data: results 
      });
    } catch (error) {
      console.error('❌ viewCustomers error:', error);
      res.json({ 
        status: 'error',
        msg: 'Error fetching customers',
        data: [] 
      });
    }
  }

  static async viewOrders(req, res) {
    try {
      const status_id = req.query.status_id;
      console.log('🟢 CustomerPanelController.viewOrders called');
      console.log('   Query params:', req.query);
      console.log('   Status ID:', status_id || 'none');
      
      // Check Redis cache first
      const cacheKey = RedisCache.listKey('customer_orders', { status_id: status_id || 'all' });
      try {
        const cached = await RedisCache.get(cacheKey);
        if (cached) {
          console.log('⚡ View orders cache hit');
          return res.json(cached);
        }
      } catch (err) {
        console.error('Redis get error:', err);
      }
      
      // Use Order model to get all orders (optionally filtered by status)
      const statusId = status_id ? parseInt(status_id) : null;
      const results = await Order.getAll(statusId);
      console.log(`✅ viewOrders: Found ${results.length} orders`);
      
      // Enrich orders with app_version from customer data and shop details from shop_id
      const enrichedResults = await Promise.all(results.map(async (order) => {
        try {
          // Try to get app_version from customer_id
          if (order.customer_id) {
            const customer = await User.findById(order.customer_id);
            if (customer && customer.app_version) {
              order.app_version = customer.app_version;
            }
          }
          // Also try to parse from customerdetails if it's a JSON string
          if (!order.app_version && order.customerdetails) {
            try {
              let customerDetails = order.customerdetails;
              if (typeof customerDetails === 'string') {
                customerDetails = JSON.parse(customerDetails);
              }
              if (customerDetails && (customerDetails.app_version || customerDetails.appVersion)) {
                order.app_version = customerDetails.app_version || customerDetails.appVersion;
              }
            } catch (e) {
              // Ignore parsing errors
            }
          }
          // Default to v1 if not found
          if (!order.app_version) {
            order.app_version = 'v1';
          }
          
          // Enrich shopdetails from shop_id if shopdetails is missing or is a plain string
          if (order.shop_id) {
            try {
              // Check if shopdetails is missing or is a plain string (not JSON)
              let needsShopDetails = false;
              if (!order.shopdetails) {
                needsShopDetails = true;
              } else if (typeof order.shopdetails === 'string') {
                // Check if it's a plain string (not JSON)
                try {
                  JSON.parse(order.shopdetails);
                  // If it parses, it's JSON, so we might still want to check if it has shopname
                  const parsed = JSON.parse(order.shopdetails);
                  if (!parsed.shopname && !parsed.shop_name && !parsed.name) {
                    needsShopDetails = true;
                  }
                } catch (e) {
                  // If it doesn't parse, it's a plain string, so we need to populate it
                  needsShopDetails = true;
                }
              } else if (typeof order.shopdetails === 'object') {
                // Check if object has shopname
                if (!order.shopdetails.shopname && !order.shopdetails.shop_name && !order.shopdetails.name) {
                  needsShopDetails = true;
                }
              }
              
              if (needsShopDetails) {
                const Shop = require('../models/Shop');
                const shop = await Shop.findById(order.shop_id);
                if (shop) {
                  // Populate shopdetails as a JSON object
                  order.shopdetails = {
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
              }
            } catch (shopErr) {
              console.error('Error enriching shop details:', shopErr);
              // Continue without shop details if there's an error
            }
          }
        } catch (err) {
          // If error fetching customer, default to v1
          order.app_version = 'v1';
        }
        return order;
      }));
      
      if (enrichedResults.length > 0) {
        console.log('   Sample order:', {
          id: enrichedResults[0].id,
          order_number: enrichedResults[0].order_number,
          status: enrichedResults[0].status,
          customer_id: enrichedResults[0].customer_id,
          shop_id: enrichedResults[0].shop_id,
          app_version: enrichedResults[0].app_version
        });
      }
      
      const response = {
        status: 'success',
        msg: 'Orders retrieved',
        data: enrichedResults 
      };
      
      // Cache orders list for 5 minutes
      try {
        await RedisCache.set(cacheKey, response, '30days');
        console.log('💾 Orders list cached');
      } catch (err) {
        console.error('Redis cache set error:', err);
      }
      
      res.json(response);
    } catch (error) {
      console.error('❌ viewOrders error:', error);
      console.error('   Error stack:', error.stack);
      res.json({ 
        status: 'error',
        msg: 'Error fetching orders',
        data: [] 
      });
    }
  }

  static async viewOrderDetails(req, res) {
    try {
      const { id } = req.params;
      console.log('🟢 CustomerPanelController.viewOrderDetails called', { id });
      
      // Check Redis cache first
      const cacheKey = RedisCache.orderKey(id);
      try {
        const cached = await RedisCache.get(cacheKey);
        if (cached) {
          console.log('⚡ Order details cache hit:', cacheKey);
          return res.json({ status: 'success', msg: 'Order retrieved', data: cached });
        }
      } catch (err) {
        console.error('Redis get error:', err);
      }
      
      // Use Order model
      const orderData = await Order.getById(id);
      console.log(`✅ viewOrderDetails: Found order:`, orderData ? 'Yes' : 'No');
      
      // Cache order data for 10 minutes
      if (orderData) {
        try {
          await RedisCache.set(cacheKey, orderData, '30days');
          console.log('💾 Order data cached:', cacheKey);
        } catch (err) {
          console.error('Redis cache set error:', err);
        }
      }
      
      res.json({ status: 'success', msg: 'Order retrieved', data: orderData });
    } catch (error) {
      console.error('❌ viewOrderDetails error:', error);
      res.status(500).json({ status: 'error', msg: 'Error fetching order', data: null });
    }
  }

  static async showRecentOrders(req, res) {
    try {
      const id = req.params.id || req.query.id;
      console.log('🟢 CustomerPanelController.showRecentOrders called', { id });
      
      if (!id) {
        console.log('⚠️ showRecentOrders: No customer ID provided');
        return res.json({ status: 'success', msg: 'No orders', data: [] });
      }
      
      // Check Redis cache first
      const cacheKey = RedisCache.listKey('customer_recent_orders', { customer_id: id });
      try {
        const cached = await RedisCache.get(cacheKey);
        if (cached) {
          console.log('⚡ Recent orders cache hit');
          return res.json(cached);
        }
      } catch (err) {
        console.error('Redis get error:', err);
      }
      
      // Use Order model to get recent orders with shop names
      console.log('🟢 showRecentOrders: Fetching recent orders for customer:', id);
      const results = await Order.findByCustomerIdWithShopNames(id, 5);
      console.log(`✅ showRecentOrders: Found ${results.length} recent orders`);
      
      const response = {
        status: 'success',
        msg: 'Recent orders retrieved',
        data: results || []
      };
      
      // Cache recent orders for 5 minutes
      try {
        await RedisCache.set(cacheKey, response, '30days');
        console.log('💾 Recent orders cached');
      } catch (err) {
        console.error('Redis cache set error:', err);
      }
      
      res.json(response);
    } catch (error) {
      console.error('❌ showRecentOrders error:', error);
      res.status(500).json({ status: 'error', msg: 'Error fetching orders', data: [] });
    }
  }

  static async deleteCustomer(req, res) {
    try {
      const { id } = req.params;
      console.log('🟢 CustomerPanelController.deleteCustomer called', { id });
      // Get customer to find user_id
      console.log('🟢 deleteCustomer: Finding customer');
      const customer = await Customer.findById(id);
      if (!customer) {
        console.error('❌ deleteCustomer: Customer not found');
        return res.json({ status: 'error', msg: 'Customer not found', data: null });
      }

      const userId = customer.user_id;
      console.log(`✅ deleteCustomer: Found customer with user_id: ${userId}`);

      // TODO: Delete user - User model doesn't have delete method yet
      // For now, just delete the customer
      console.log('🟢 deleteCustomer: Deleting customer');
      await Customer.delete(id);
      console.log('✅ deleteCustomer: Customer deleted successfully');

      // Invalidate related caches
      try {
        await RedisCache.invalidateTableCache('customer');
        await RedisCache.invalidateTableCache('users');
        await RedisCache.delete(RedisCache.customerKey(id));
        await RedisCache.delete(RedisCache.listKey('customer_list'));
        console.log('🗑️  Invalidated customer caches after delete');
      } catch (err) {
        console.error('Redis cache invalidation error:', err);
      }

      res.json({ status: 'success', msg: 'Customer deleted successfully', data: null });
    } catch (error) {
      console.error('❌ deleteCustomer error:', error);
      res.status(500).json({ status: 'error', msg: 'Error deleting customer', data: null });
    }
  }
}

module.exports = CustomerPanelController;

