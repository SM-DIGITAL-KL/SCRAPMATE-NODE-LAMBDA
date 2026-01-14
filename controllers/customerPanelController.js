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
      
      // Helper function to enrich customer details
      const enrichOrderCustomerDetails = async (order) => {
        try {
          // Check if customerdetails needs enrichment
          const needsEnrichment = !order.customerdetails || 
                                  (typeof order.customerdetails === 'string') ||
                                  (typeof order.customerdetails === 'object' && 
                                   (!order.customerdetails.name && !order.customerdetails.customer_name &&
                                    !order.customerdetails.contact && !order.customerdetails.phone));
          
          if (needsEnrichment && order.customer_id) {
            const Customer = require('../models/Customer');
            const User = require('../models/User');
            let customer = null;
            let user = null;
            
            // Try to find customer by customer_id first
            try {
              customer = await Customer.findById(order.customer_id);
              console.log(`🔍 Customer lookup by customer_id ${order.customer_id}:`, customer ? 'Found' : 'Not found');
            } catch (err) {
              console.error('Error fetching customer by id:', err);
            }
            
            // If customer not found, customer_id might be a user_id (for v2 orders)
            // Try to find user by customer_id
            if (!customer) {
              try {
                user = await User.findById(order.customer_id);
                console.log(`🔍 User lookup by customer_id (as user_id) ${order.customer_id}:`, user ? 'Found' : 'Not found');
                // If user found, try to find customer record by user_id
                if (user && user.user_type === 'C') {
                  try {
                    customer = await Customer.findByUserId(user.id);
                    console.log(`🔍 Customer lookup by user_id ${user.id}:`, customer ? 'Found' : 'Not found');
                  } catch (err) {
                    console.error('Error fetching customer by user_id:', err);
                  }
                }
              } catch (err) {
                console.error('Error fetching user by customer_id:', err);
              }
            }
            
            // If not found and we have user_id, try finding by user_id
            if (!customer && order.user_id) {
              try {
                customer = await Customer.findByUserId(order.user_id);
                console.log(`🔍 Customer lookup by order.user_id ${order.user_id}:`, customer ? 'Found' : 'Not found');
              } catch (err) {
                console.error('Error fetching customer by order.user_id:', err);
              }
            }
            
            // Helper function to check if name is a placeholder
            const isPlaceholderName = (name) => {
              return !name || name.startsWith('User_') || name === '';
            };
            
            // Choose the best name: prefer real name over placeholder
            let bestName = '';
            let nameSource = '';
            if (customer?.name && !isPlaceholderName(customer.name)) {
              bestName = customer.name;
              nameSource = 'Customer table';
            } else if (user?.name && !isPlaceholderName(user.name)) {
              bestName = user.name;
              nameSource = 'User table';
            } else if (customer?.name) {
              bestName = customer.name;
              nameSource = 'Customer table (placeholder)';
            } else if (user?.name) {
              bestName = user.name;
              nameSource = 'User table (placeholder)';
            }
            
            // Use customer data if found, otherwise use user data
            const sourceData = customer || user;
            
            if (sourceData) {
              // Initialize customerdetails as object
              if (!order.customerdetails || typeof order.customerdetails === 'string') {
                const addressString = typeof order.customerdetails === 'string' ? order.customerdetails : '';
                order.customerdetails = {
                  address: addressString || (customer?.address || '')
                };
              } else if (typeof order.customerdetails === 'object') {
                // Ensure it's a plain object
                order.customerdetails = { ...order.customerdetails };
              }
              
              // Populate name and contact if missing - use best name (real name preferred)
              if (!order.customerdetails.name && !order.customerdetails.customer_name) {
                order.customerdetails.name = bestName || '';
                order.customerdetails.customer_name = bestName || '';
              }
              if (!order.customerdetails.contact && !order.customerdetails.phone && !order.customerdetails.mobile) {
                order.customerdetails.contact = customer?.contact || customer?.phone || user?.mob_num || user?.mobile || user?.phone || '';
                order.customerdetails.phone = order.customerdetails.contact;
              }
              if (!order.customerdetails.address && customer?.address) {
                order.customerdetails.address = customer.address;
              }
              
              console.log('✅ Customer details enriched for order', {
                order_id: order.id,
                customer_id: order.customer_id,
                name_source: nameSource || (customer ? 'Customer table' : 'User table'),
                name: order.customerdetails.name,
                contact: order.customerdetails.contact
              });
            } else {
              console.warn('⚠️ Customer/User not found for order', {
                order_id: order.id,
                customer_id: order.customer_id,
                user_id: order.user_id
              });
            }
          }
          
          return order;
        } catch (error) {
          console.error('Error enriching customer details:', error);
          return order; // Return original order if enrichment fails
        }
      };
      
      // Helper function to enrich notified vendor details
      const enrichNotifiedVendors = async (order) => {
        try {
          if (order.notified_vendor_ids) {
            const User = require('../models/User');
            let notifiedVendorIds = order.notified_vendor_ids;
            
            // Parse if it's a string
            if (typeof notifiedVendorIds === 'string') {
              notifiedVendorIds = JSON.parse(notifiedVendorIds);
            }
            
            // Ensure it's an array
            if (!Array.isArray(notifiedVendorIds)) {
              notifiedVendorIds = [notifiedVendorIds];
            }
            
            // Convert to numbers and filter out invalid IDs
            const validIds = notifiedVendorIds
              .map(id => typeof id === 'string' && !isNaN(id) ? parseInt(id) : id)
              .filter(id => !isNaN(id) && id > 0);
            
            if (validIds.length > 0) {
              console.log(`📋 Fetching details for ${validIds.length} notified vendors`);
              console.log(`   Valid IDs: ${validIds.slice(0, 20).join(', ')}${validIds.length > 20 ? '...' : ''}`);
              const notifiedVendors = await User.findByIds(validIds);
              
              console.log(`   Found ${notifiedVendors.length} users from database`);
              
              // Add vendor details to order
              order.notified_vendors = notifiedVendors.map(user => ({
                id: user.id,
                name: user.name || 'N/A',
                mobile: user.mob_num || user.mobile || user.phone || 'N/A',
                email: user.email || 'N/A',
                user_type: user.user_type || 'N/A',
                app_version: user.app_version || 'N/A'
              }));
              
              console.log(`✅ Enriched order with ${order.notified_vendors.length} notified vendor details`);
              console.log(`   User types: ${order.notified_vendors.map(v => v.user_type).join(', ')}`);
            } else {
              console.warn(`⚠️  No valid IDs found in notified_vendor_ids`);
              order.notified_vendors = [];
            }
          } else {
            order.notified_vendors = [];
          }
          
          // Enrich bulk_notified_vendors (phone numbers from bulk_message_notifications)
          if (order.bulk_notified_vendors) {
            try {
              let bulkNotifiedVendors = order.bulk_notified_vendors;
              
              // Parse if it's a string
              if (typeof bulkNotifiedVendors === 'string') {
                bulkNotifiedVendors = JSON.parse(bulkNotifiedVendors);
              }
              
              // Ensure it's an array
              if (!Array.isArray(bulkNotifiedVendors)) {
                bulkNotifiedVendors = [bulkNotifiedVendors];
              }
              
              if (bulkNotifiedVendors.length > 0) {
                console.log(`📋 Found ${bulkNotifiedVendors.length} bulk notified vendors (phone numbers)`);
                // Keep bulk_notified_vendors as array of phone numbers or objects
                // The admin panel will display them from window.bulkNotifiedVendors or from this field
                order.bulk_notified_vendors = bulkNotifiedVendors;
              }
            } catch (err) {
              console.error('Error parsing bulk_notified_vendors:', err);
              order.bulk_notified_vendors = [];
            }
          } else {
            order.bulk_notified_vendors = [];
          }
        } catch (err) {
          console.error('Error enriching notified vendor details:', err);
          // Don't fail the request if vendor enrichment fails
          order.notified_vendors = [];
          order.bulk_notified_vendors = [];
        }
        return order;
      };
      
      // Check Redis cache first
      const cacheKey = RedisCache.orderKey(id);
      try {
        const cached = await RedisCache.get(cacheKey);
        if (cached) {
          console.log('⚡ Order details cache hit:', cacheKey);
          console.log(`   Cached notified_vendor_ids: ${cached.notified_vendor_ids ? (typeof cached.notified_vendor_ids === 'string' ? cached.notified_vendor_ids.substring(0, 100) : JSON.stringify(cached.notified_vendor_ids).substring(0, 100)) : 'N/A'}`);
          // Still enrich customer details and notified vendors even if cached
          const enrichedOrder = await enrichOrderCustomerDetails(cached);
          await enrichNotifiedVendors(enrichedOrder);
          console.log(`   Enriched notified_vendors count: ${enrichedOrder.notified_vendors ? enrichedOrder.notified_vendors.length : 0}`);
          return res.json({ status: 'success', msg: 'Order retrieved', data: enrichedOrder });
        }
      } catch (err) {
        console.error('Redis get error:', err);
      }
      
      // Use Order model
      const orderData = await Order.getById(id);
      console.log(`✅ viewOrderDetails: Found order:`, orderData ? 'Yes' : 'No');
      if (orderData) {
        console.log(`   Database notified_vendor_ids: ${orderData.notified_vendor_ids ? (typeof orderData.notified_vendor_ids === 'string' ? orderData.notified_vendor_ids.substring(0, 100) : JSON.stringify(orderData.notified_vendor_ids).substring(0, 100)) : 'N/A'}`);
      }
      
      // Enrich customer details if needed
      let enrichedOrder = orderData;
      if (orderData) {
        enrichedOrder = await enrichOrderCustomerDetails(orderData);
        await enrichNotifiedVendors(enrichedOrder);
        
        // Cache enriched order data
        try {
          await RedisCache.set(cacheKey, enrichedOrder, '30days');
          console.log('💾 Order data cached:', cacheKey);
        } catch (err) {
          console.error('Redis cache set error:', err);
        }
      }
      
      res.json({ status: 'success', msg: 'Order retrieved', data: enrichedOrder });
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

