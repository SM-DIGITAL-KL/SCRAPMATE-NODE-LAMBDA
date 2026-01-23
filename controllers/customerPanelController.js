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
            const Shop = require('../models/Shop');
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
              
              // Get order location for distance calculation
              let orderLat = null, orderLng = null;
              if (order.lat_log) {
                const [lat, lng] = order.lat_log.split(',').map(Number);
                if (!isNaN(lat) && !isNaN(lng)) {
                  orderLat = lat;
                  orderLng = lng;
                }
              }
              
              // Haversine formula to calculate distance
              const calculateDistance = (lat1, lon1, lat2, lon2) => {
                const R = 6371; // Earth's radius in km
                const dLat = (lat2 - lat1) * Math.PI / 180;
                const dLon = (lon2 - lon1) * Math.PI / 180;
                const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                  Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
                  Math.sin(dLon / 2) * Math.sin(dLon / 2);
                const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
                return R * c;
              };
              
              // OPTIMIZED: Batch fetch all shops at once instead of N+1 queries
              const vendorUserIds = notifiedVendors.map(u => u.id).filter(id => id);
              let shopsMap = new Map(); // Map<userId, shop>
              
              if (vendorUserIds.length > 0 && orderLat !== null && orderLng !== null) {
                try {
                  console.log(`📦 Batch fetching shops for ${vendorUserIds.length} vendors...`);
                  const shops = await Shop.findByUserIds(vendorUserIds);
                  shops.forEach(shop => {
                    if (shop.user_id) {
                      const userId = typeof shop.user_id === 'string' ? parseInt(shop.user_id) : shop.user_id;
                      if (!shopsMap.has(userId)) {
                        shopsMap.set(userId, shop);
                      }
                    }
                  });
                  console.log(`✅ Batch fetched ${shopsMap.size} shops for ${vendorUserIds.length} vendors`);
                } catch (batchErr) {
                  console.error('Error batch fetching shops:', batchErr.message);
                }
              }
              
              // Add vendor details to order with distance calculation
              const vendorDetailsWithDistance = notifiedVendors.map((user) => {
                let distance = null;
                let shopName = null;
                let shopAddress = null;
                
                // Get shop from batch-fetched map
                const shop = shopsMap.get(user.id);
                if (shop) {
                  shopName = shop.shopname || shop.name || null;
                  shopAddress = shop.address || null;
                  if (shop.lat_log && orderLat !== null && orderLng !== null) {
                    const [shopLat, shopLng] = shop.lat_log.split(',').map(Number);
                    if (!isNaN(shopLat) && !isNaN(shopLng)) {
                      distance = calculateDistance(orderLat, orderLng, shopLat, shopLng);
                    }
                  }
                }
                
                return {
                  id: user.id,
                  name: user.name || 'N/A',
                  mobile: user.mob_num || user.mobile || user.phone || 'N/A',
                  email: user.email || 'N/A',
                  user_type: user.user_type || 'N/A',
                  app_version: user.app_version || 'N/A',
                  shop_name: shopName,
                  shop_address: shopAddress,
                  distance_km: distance !== null ? parseFloat(distance.toFixed(2)) : null
                };
              });
              
              // Sort vendors by distance (closest first), null distances at the end
              order.notified_vendors = vendorDetailsWithDistance.sort((a, b) => {
                if (a.distance_km === null && b.distance_km === null) return 0;
                if (a.distance_km === null) return 1;
                if (b.distance_km === null) return -1;
                return a.distance_km - b.distance_km;
              });
              
              console.log(`✅ Enriched order with ${order.notified_vendors.length} notified vendor details (sorted by distance)`);
              console.log(`   User types: ${order.notified_vendors.map(v => v.user_type).join(', ')}`);
              console.log(`   Distances: ${order.notified_vendors.slice(0, 5).map(v => v.distance_km !== null ? v.distance_km + ' km' : 'N/A').join(', ')}${order.notified_vendors.length > 5 ? '...' : ''}`);
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
      
      // Helper function to enrich accepted vendor details
      const enrichAcceptedVendorDetails = async (order) => {
        try {
          const User = require('../models/User');
          const Shop = require('../models/Shop');
          
          order.accepted_vendor = null;
          
          // Check if order was accepted by a shop (shop_id)
          if (order.shop_id) {
            console.log(`📋 Order accepted by shop_id: ${order.shop_id}`);
            
            // Get shop details
            let shop = null;
            try {
              shop = await Shop.findById(order.shop_id);
              console.log(`   Shop lookup by id result: ${shop ? 'Found' : 'Not found'}`);
              
              // If shop not found by id, it might be that shop_id is actually a user_id
              // Try to find shop by user_id
              if (!shop) {
                console.log(`   Shop not found by id, trying to find shop by user_id (${order.shop_id})...`);
                try {
                  shop = await Shop.findByUserId(order.shop_id);
                  if (shop) {
                    console.log(`   ✅ Found shop by user_id! Shop ID: ${shop.id}, User ID: ${shop.user_id}`);
                  }
                } catch (userShopErr) {
                  console.log(`   Shop not found by user_id either: ${userShopErr.message}`);
                }
              }
              
              if (shop) {
                console.log(`   Shop fields: id=${shop.id}, shopname=${shop.shopname || 'N/A'}, shop_name=${shop.shop_name || 'N/A'}, name=${shop.name || 'N/A'}, user_id=${shop.user_id || 'N/A'}`);
                console.log(`   Shop all keys: ${Object.keys(shop).join(', ')}`);
              } else {
                console.warn(`   ⚠️ Shop with id ${order.shop_id} not found in database (tried both id and user_id lookup)`);
              }
            } catch (shopErr) {
              console.error(`   ❌ Error fetching shop ${order.shop_id}:`, shopErr.message);
              console.error(`   Error stack:`, shopErr.stack);
            }
            
            if (shop) {
              // Get vendor user details from shop.user_id
              let vendorUser = null;
              if (shop.user_id) {
                try {
                  vendorUser = await User.findById(shop.user_id);
                  console.log(`   Vendor user lookup by shop.user_id (${shop.user_id}): ${vendorUser ? 'Found' : 'Not found'}`);
                  if (vendorUser) {
                    console.log(`   User details: name=${vendorUser.name}, user_type=${vendorUser.user_type}, mobile=${vendorUser.mob_num || vendorUser.mobile}`);
                  }
                } catch (userErr) {
                  console.error(`   Error fetching vendor user ${shop.user_id}:`, userErr.message);
                }
              }
              
              // If user not found by shop.user_id, try to find user by checking if shop.user_id exists but user lookup failed
              // Or if shop.user_id is missing, try to find users with type 'R' or 'SR' that might own this shop
              if (!vendorUser) {
                console.log(`   User not found via shop.user_id (${shop.user_id || 'missing'}), trying alternative lookup...`);
                
                // If shop.user_id exists but user lookup failed, try again with different type conversion
                if (shop.user_id) {
                  try {
                    // Try as number if it was a string, or vice versa
                    const userIdNum = typeof shop.user_id === 'string' && !isNaN(shop.user_id) ? parseInt(shop.user_id) : shop.user_id;
                    const userIdStr = String(shop.user_id);
                    
                    // Try number first
                    if (typeof shop.user_id !== 'number') {
                      vendorUser = await User.findById(userIdNum);
                      if (vendorUser) {
                        console.log(`   Found vendor user with numeric ID conversion: ${vendorUser.id}`);
                      }
                    }
                    
                    // If still not found, the user might not exist or shop.user_id is incorrect
                    // In that case, we'll leave vendorUser as null and use shop details only
                  } catch (retryErr) {
                    console.error(`   Retry user lookup failed:`, retryErr.message);
                  }
                }
                
                // If still no user found and we want to be thorough, we could scan users
                // But that's expensive, so we'll just use shop details for now
                if (!vendorUser) {
                  console.log(`   No vendor user found, will use shop details only`);
                }
              }
              
              // Get shop name from all possible fields
              const shopName = shop.shopname || shop.shop_name || shop.name || shop.shopName || shop.ShopName || 'N/A';
              
              order.accepted_vendor = {
                type: 'shop',
                shop_id: shop.id,
                shop_name: shopName,
                user_id: vendorUser?.id || shop.user_id || null,
                user_name: vendorUser?.name || vendorUser?.user_name || 'N/A',
                user_mobile: vendorUser?.mob_num || vendorUser?.mobile || vendorUser?.phone || vendorUser?.phone_number || 'N/A',
                user_email: vendorUser?.email || vendorUser?.email_id || 'N/A',
                user_type: vendorUser?.user_type || vendorUser?.userType || 'N/A',
                app_version: vendorUser?.app_version || vendorUser?.appVersion || vendorUser?.app_version || 'N/A',
                shop_contact: shop.contact || shop.phone || shop.mob_num || shop.mobile || shop.phone_number || 'N/A',
                shop_address: shop.address || shop.location || shop.full_address || 'N/A',
                shop_place: shop.place || shop.city || shop.district || 'N/A',
                shop_state: shop.state || shop.State || 'N/A',
                shop_pincode: shop.pincode || shop.pin_code || shop.pin || 'N/A'
              };
              
              console.log(`✅ Enriched accepted vendor (shop): shop_name=${order.accepted_vendor.shop_name}, user_id=${order.accepted_vendor.user_id}, user_name=${order.accepted_vendor.user_name}, user_type=${order.accepted_vendor.user_type}`);
            } else {
              // Shop not found - try to use shopdetails from order if available
              console.warn(`⚠️  Shop not found for shop_id: ${order.shop_id}, trying to use shopdetails from order`);
              
              let shopName = 'N/A';
              let shopDetails = null;
              
              if (order.shopdetails) {
                try {
                  shopDetails = typeof order.shopdetails === 'string' 
                    ? JSON.parse(order.shopdetails) 
                    : order.shopdetails;
                  shopName = shopDetails.shopname || shopDetails.shop_name || shopDetails.name || 'N/A';
                } catch (e) {
                  if (typeof order.shopdetails === 'string') {
                    shopName = order.shopdetails;
                  }
                }
              }
              
              // If shop not found and no shopdetails, create accepted_vendor with shop_id only
              // This at least shows that the order was accepted by a shop (even if shop record is missing)
              order.accepted_vendor = {
                type: 'shop',
                shop_id: order.shop_id,
                shop_name: shopName !== 'N/A' ? shopName : `Shop ID ${order.shop_id} (Not found in database)`,
                user_id: shopDetails?.user_id || shopDetails?.shop_id || null,
                user_name: shopDetails?.ownername || shopDetails?.owner_name || 'N/A',
                user_mobile: shopDetails?.contact || shopDetails?.phone || 'N/A',
                user_email: shopDetails?.email || 'N/A',
                user_type: 'N/A',
                app_version: 'N/A',
                shop_contact: shopDetails?.contact || shopDetails?.phone || 'N/A',
                shop_address: shopDetails?.address || shopDetails?.location || 'N/A',
                shop_place: shopDetails?.place || 'N/A',
                shop_state: shopDetails?.state || 'N/A',
                shop_pincode: shopDetails?.pincode || 'N/A',
                shop_not_found: true // Flag to indicate shop was not found
              };
              
              console.log(`⚠️  Created accepted_vendor from shopdetails or with shop_id only: ${order.accepted_vendor.shop_name}`);
            }
          }
          // Check if order was accepted by a delivery boy (delv_id)
          else if (order.delv_id || order.delv_boy_id) {
            const delvId = order.delv_id || order.delv_boy_id;
            console.log(`📋 Order accepted by delivery boy (delv_id): ${delvId}`);
            
            // Get delivery boy user details
            let deliveryUser = null;
            try {
              deliveryUser = await User.findById(delvId);
              console.log(`   Delivery user lookup result: ${deliveryUser ? 'Found' : 'Not found'}`);
            } catch (userErr) {
              console.error(`   Error fetching delivery user ${delvId}:`, userErr.message);
            }
            
            if (deliveryUser) {
              order.accepted_vendor = {
                type: 'delivery',
                user_id: deliveryUser.id,
                user_name: deliveryUser.name || 'N/A',
                user_mobile: deliveryUser.mob_num || deliveryUser.mobile || deliveryUser.phone || 'N/A',
                user_email: deliveryUser.email || 'N/A',
                user_type: deliveryUser.user_type || 'N/A',
                app_version: deliveryUser.app_version || 'N/A'
              };
              
              console.log(`✅ Enriched accepted vendor (delivery): ${order.accepted_vendor.user_name}`);
            } else {
              console.warn(`⚠️  Delivery user not found for delv_id: ${delvId}`);
            }
          } else {
            console.log(`ℹ️  Order has not been accepted yet (no shop_id or delv_id)`);
          }
          
          return order;
        } catch (err) {
          console.error('Error enriching accepted vendor details:', err);
          console.error('Error stack:', err.stack);
          // Don't fail the request if vendor enrichment fails
          // Try to create basic accepted_vendor from order data if shop_id exists
          if (order.shop_id && !order.accepted_vendor) {
            let shopName = 'N/A';
            if (order.shopdetails) {
              try {
                const shopDetails = typeof order.shopdetails === 'string' 
                  ? JSON.parse(order.shopdetails) 
                  : order.shopdetails;
                shopName = shopDetails.shopname || shopDetails.shop_name || shopDetails.name || 'N/A';
              } catch (e) {
                if (typeof order.shopdetails === 'string') {
                  shopName = order.shopdetails;
                }
              }
            }
            order.accepted_vendor = {
              type: 'shop',
              shop_id: order.shop_id,
              shop_name: shopName,
              user_id: null,
              user_name: 'N/A',
              user_mobile: 'N/A',
              user_email: 'N/A',
              user_type: 'N/A',
              app_version: 'N/A',
              shop_contact: 'N/A',
              shop_address: 'N/A',
              shop_place: 'N/A',
              shop_state: 'N/A',
              shop_pincode: 'N/A'
            };
          }
          return order;
        }
      };
      
      // Helper function to fetch monthly subscribed vendors
      // Matches the logic from /accounts/paid-subscriptions endpoint
      const fetchMonthlySubscribedVendors = async () => {
        try {
          const Shop = require('../models/Shop');
          const User = require('../models/User');
          const Invoice = require('../models/Invoice');
          
          console.log('📋 Fetching monthly subscribed vendors (matching paid subscriptions logic)...');
          
          // Get all invoices (same as paid subscriptions endpoint)
          const allInvoices = await Invoice.getAll();
          console.log(`📊 Found ${allInvoices.length} total invoices`);
          
          // Filter for paid invoices (same as paid subscriptions page)
          const paidInvoices = allInvoices.filter(inv => inv.type === 'Paid' || inv.type === 'paid');
          console.log(`✅ Found ${paidInvoices.length} paid invoices`);
          
          // Filter for active subscriptions (to_date > now) and approved status
          const now = new Date();
          const activePaidInvoices = paidInvoices.filter(invoice => {
            // Must have user_id
            if (!invoice.user_id) {
              return false;
            }
            
            // Check if approved (or pending - include both for now)
            const approvalStatus = invoice.approval_status || 'pending';
            if (approvalStatus === 'rejected') {
              return false; // Exclude rejected subscriptions
            }
            
            // Check if subscription is still active (to_date > now)
            if (!invoice.to_date) {
              return false; // No end date means not active
            }
            
            try {
              const toDate = new Date(invoice.to_date);
              return toDate > now;
            } catch (e) {
              console.warn(`⚠️  Invalid to_date for invoice ${invoice.id}:`, invoice.to_date);
              return false;
            }
          });
          
          console.log(`✅ Found ${activePaidInvoices.length} active paid subscriptions (approved/pending, to_date > now)`);
          
          // Get unique user IDs from active paid invoices
          const userIds = [...new Set(activePaidInvoices.map(inv => inv.user_id).filter(id => id != null))];
          
          if (userIds.length === 0) {
            return [];
          }
          
          console.log(`📋 Fetching users for ${userIds.length} subscribed vendors...`);
          
          // Fetch users
          const users = await User.findByIds(userIds);
          
          // Fetch shops for these users
          const shops = await Shop.findByUserIds(userIds);
          const shopMap = {};
          shops.forEach(shop => {
            if (shop && shop.user_id) {
              if (!shopMap[shop.user_id]) {
                shopMap[shop.user_id] = shop;
              }
            }
          });
          
          // Map users to include shop info and subscription details
          const monthlySubscribedVendors = users.map(user => {
            const shop = shopMap[user.id];
            const userInvoices = activePaidInvoices.filter(inv => inv.user_id === user.id);
            // Get the latest invoice (by to_date)
            const latestInvoice = userInvoices.sort((a, b) => {
              const dateA = new Date(a.to_date);
              const dateB = new Date(b.to_date);
              return dateB - dateA; // Sort descending (latest first)
            })[0];
            
            return {
              id: user.id,
              name: user.name || 'N/A',
              mobile: user.mob_num || user.mobile || user.phone || 'N/A',
              email: user.email || 'N/A',
              user_type: user.user_type || 'N/A',
              app_version: user.app_version || 'N/A',
              shop_id: shop?.id || null,
              shop_name: shop?.shopname || 'N/A',
              subscription_ends_at: latestInvoice?.to_date || null,
              approval_status: latestInvoice?.approval_status || 'pending'
            };
          });
          
          console.log(`✅ Fetched ${monthlySubscribedVendors.length} monthly subscribed vendors`);
          
          // Log shop names for debugging
          if (monthlySubscribedVendors.length > 0) {
            const shopNames = monthlySubscribedVendors.map(v => v.shop_name).filter(Boolean);
            console.log(`   Shop names: ${shopNames.slice(0, 10).join(', ')}${shopNames.length > 10 ? '...' : ''}`);
          }
          
          return monthlySubscribedVendors;
        } catch (err) {
          console.error('Error fetching monthly subscribed vendors:', err);
          return [];
        }
      };
      
      // Check Redis cache first
      const cacheKey = RedisCache.orderKey(id);
      try {
        const cached = await RedisCache.get(cacheKey);
        if (cached) {
          console.log('⚡ Order details cache hit:', cacheKey);
          console.log(`   Cached notified_vendor_ids: ${cached.notified_vendor_ids ? (typeof cached.notified_vendor_ids === 'string' ? cached.notified_vendor_ids.substring(0, 100) : JSON.stringify(cached.notified_vendor_ids).substring(0, 100)) : 'N/A'}`);
          // Still enrich customer details, notified vendors, and accepted vendor even if cached
          const enrichedOrder = await enrichOrderCustomerDetails(cached);
          await enrichNotifiedVendors(enrichedOrder);
          await enrichAcceptedVendorDetails(enrichedOrder);
          // Fetch monthly subscribed vendors (not cached, always fresh)
          enrichedOrder.monthly_subscribed_vendors = await fetchMonthlySubscribedVendors();
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
        await enrichAcceptedVendorDetails(enrichedOrder);
        
        // Fetch monthly subscribed vendors
        enrichedOrder.monthly_subscribed_vendors = await fetchMonthlySubscribedVendors();
        
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

