/**
 * V2 Order Controller
 * Handles pickup request orders from user app (U type) 
 * and allows R, S, SR, D users to accept them
 */

const Order = require('../models/Order');
const User = require('../models/User');
const Shop = require('../models/Shop');
const Customer = require('../models/Customer');
const RedisCache = require('../utils/redisCache');
const { sendVendorNotification } = require('../utils/fcmNotification');

/**
 * Place a pickup request order (User type 'U' from user app)
 */
class V2OrderController {
  /**
   * POST /api/v2/orders/pickup-request
   * Place a pickup request order from user app (user type 'U')
   * Body: {
   *   customer_id: number,
   *   orderdetails: JSON string or object,
   *   customerdetails: string (address),
   *   latitude: number,
   *   longitude: number,
   *   estim_weight: number,
   *   estim_price: number,
   *   preferred_pickup_time?: string,
   *   images: [File]
   * }
   */
  static async placePickupRequest(req, res) {
    try {
      console.log('📥 [V2OrderController.placePickupRequest] Request received');
      console.log('   Body keys:', Object.keys(req.body || {}));
      console.log('   Body data:', {
        customer_id: req.body?.customer_id,
        has_orderdetails: !!req.body?.orderdetails,
        has_customerdetails: !!req.body?.customerdetails,
        latitude: req.body?.latitude,
        longitude: req.body?.longitude,
        estim_weight: req.body?.estim_weight,
        estim_price: req.body?.estim_price,
      });
      console.log('   Files:', req.files ? Object.keys(req.files) : 'none');

      const {
        customer_id,
        orderdetails,
        customerdetails,
        latitude,
        longitude,
        estim_weight,
        estim_price,
        preferred_pickup_time
      } = req.body;

      // Handle multiple image uploads to S3 with compression
      const { uploadFileToS3 } = require('../utils/fileUpload');
      const { compressImage } = require('../utils/imageCompression');
      let image1 = req.body.image1 || '';
      let image2 = req.body.image2 || '';
      let image3 = req.body.image3 || '';
      let image4 = req.body.image4 || '';
      let image5 = req.body.image5 || '';
      let image6 = req.body.image6 || '';

      // Helper function to compress and upload image
      const compressAndUploadImage = async (file, imageNumber) => {
        try {
          if (!file || !file.buffer) {
            console.error(`⚠️  Image${imageNumber}: No file buffer provided`);
            return '';
          }

          console.log(`📤 Compressing and uploading image${imageNumber}...`);
          console.log(`   Original size: ${(file.buffer.length / 1024).toFixed(2)}KB`);

          // Compress image to 50KB
          const compressedBuffer = await compressImage(file.buffer);
          console.log(`   Compressed size: ${(compressedBuffer.length / 1024).toFixed(2)}KB`);

          // Create a new file object with compressed buffer
          const compressedFile = {
            ...file,
            buffer: compressedBuffer,
            size: compressedBuffer.length
          };

          // Upload compressed image to S3
          const result = await uploadFileToS3(compressedFile, 'order-images');
          console.log(`✅ Image${imageNumber} uploaded successfully`);
          return result.s3Url || result.filename;
        } catch (err) {
          console.error(`❌ Error uploading image${imageNumber}:`, err);
          return '';
        }
      };

      // Upload images to S3 if files are provided
      if (req.files?.image1?.[0]) {
        image1 = await compressAndUploadImage(req.files.image1[0], 1);
      }
      if (req.files?.image2?.[0]) {
        image2 = await compressAndUploadImage(req.files.image2[0], 2);
      }
      if (req.files?.image3?.[0]) {
        image3 = await compressAndUploadImage(req.files.image3[0], 3);
      }
      if (req.files?.image4?.[0]) {
        image4 = await compressAndUploadImage(req.files.image4[0], 4);
      }
      if (req.files?.image5?.[0]) {
        image5 = await compressAndUploadImage(req.files.image5[0], 5);
      }
      if (req.files?.image6?.[0]) {
        image6 = await compressAndUploadImage(req.files.image6[0], 6);
      }

      // Validation
      if (!customer_id || !orderdetails || !customerdetails) {
        return res.status(400).json({
          status: 'error',
          msg: 'Missing required fields: customer_id, orderdetails, customerdetails',
          data: null
        });
      }

      // Verify user type is 'U' (user app customer) or 'C' (customer app)
      const user = await User.findById(customer_id);
      if (!user) {
        console.log(`❌ [V2OrderController.placePickupRequest] User not found: ${customer_id}`);
        return res.status(404).json({
          status: 'error',
          msg: 'User not found',
          data: null
        });
      }

      console.log(`✅ [V2OrderController.placePickupRequest] User found: ID=${user.id}, Type=${user.user_type}, App=${user.app_type}`);

      // Allow both 'U' (user app) and 'C' (customer app) users to place pickup requests
      if (user.user_type !== 'U' && user.user_type !== 'C') {
        console.log(`❌ [V2OrderController.placePickupRequest] Invalid user type: ${user.user_type} (expected U or C)`);
        return res.status(403).json({
          status: 'error',
          msg: `Only customer app users (type U or C) can place pickup requests. Your user type is: ${user.user_type}`,
          data: null
        });
      }

      // Get last order number and generate new one in standard format
      const lastOrderNumber = await Order.getLastOrderNumber();
      let orderNumber = 10000;
      if (lastOrderNumber && !isNaN(lastOrderNumber)) {
        const lastNum = typeof lastOrderNumber === 'string' ? parseInt(lastOrderNumber) : lastOrderNumber;
        // Ensure order number is in valid range (10000 to 999999999)
        if (lastNum >= 10000 && lastNum < 999999999) {
          orderNumber = lastNum + 1;
        } else {
          // If last order number is invalid, start from 10000
          console.log(`⚠️  Invalid last order number (${lastOrderNumber}), starting from 10000`);
          orderNumber = 10000;
        }
      }
      
      console.log(`📝 Generated order number: ${orderNumber} (last was: ${lastOrderNumber || 'none'})`);

      // Format lat/lng for storage
      const latLog = latitude && longitude ? `${latitude},${longitude}` : '';

      // Find nearest B2C vendor if location is provided
      let assignedShopId = null;
      let assignedShopDetails = '';
      let orderStatus = 1; // Default: pending (available for pickup)
      
      if (latitude && longitude && !isNaN(parseFloat(latitude)) && !isNaN(parseFloat(longitude))) {
        try {
          console.log(`🔍 Finding nearest B2C vendor for pickup request at ${latitude}, ${longitude}`);
          
          // Search within 15km radius for B2C vendors
          const searchRadius = 15; // km
          const nearbyShops = await Shop.getShopsByLocation(
            parseFloat(latitude),
            parseFloat(longitude),
            searchRadius
          );
          
          // Filter for B2C vendors (shop_type 2 = Retailer/Door Step Buyer, shop_type 3 = Retailer B2C)
          const b2cShops = nearbyShops.filter(shop => {
            const shopType = typeof shop.shop_type === 'string' ? parseInt(shop.shop_type) : shop.shop_type;
            return shopType === 2 || shopType === 3; // B2C vendors
          });
          
          if (b2cShops.length > 0) {
            // Get the nearest B2C vendor (already sorted by distance)
            const nearestB2CVendor = b2cShops[0];
            assignedShopId = nearestB2CVendor.id;
            
            // Build shop details string
            const shopDetailsParts = [];
            if (nearestB2CVendor.shopname) shopDetailsParts.push(nearestB2CVendor.shopname);
            if (nearestB2CVendor.address) shopDetailsParts.push(nearestB2CVendor.address);
            if (nearestB2CVendor.contact) shopDetailsParts.push(`Contact: ${nearestB2CVendor.contact}`);
            assignedShopDetails = shopDetailsParts.join(', ');
            
            // Set status to 2 (assigned/accepted) since we're auto-assigning
            orderStatus = 2;
            
            console.log(`✅ Auto-assigned order to nearest B2C vendor:`);
            console.log(`   Shop ID: ${assignedShopId}`);
            console.log(`   Shop Name: ${nearestB2CVendor.shopname || 'N/A'}`);
            console.log(`   Distance: ${nearestB2CVendor.distance.toFixed(2)} km`);
          } else {
            console.log(`⚠️  No B2C vendors found within ${searchRadius}km radius. Order will remain unassigned.`);
          }
        } catch (error) {
          console.error('❌ Error finding nearest B2C vendor:', error);
          // Continue without auto-assignment if there's an error
        }
      } else {
        console.log('⚠️  No valid location provided. Order will remain unassigned.');
      }

      const orderData = {
        order_number: orderNumber,
        customer_id: parseInt(customer_id),
        shop_id: assignedShopId, // Auto-assigned to nearest B2C vendor if found
        orderdetails: typeof orderdetails === 'string' ? orderdetails : JSON.stringify(orderdetails),
        customerdetails: customerdetails,
        shopdetails: assignedShopDetails, // Shop details if auto-assigned
        del_type: 'pickup', // Pickup request
        estim_weight: parseFloat(estim_weight) || 0,
        estim_price: parseFloat(estim_price) || 0,
        status: orderStatus, // 2 = assigned if auto-assigned, 1 = pending if not
        address: customerdetails,
        lat_log: latLog,
        date: new Date().toISOString().split('T')[0],
        image1: image1,
        image2: image2,
        image3: image3,
        image4: image4,
        image5: image5,
        image6: image6,
        preferred_pickup_time: preferred_pickup_time || null
      };

      const order = await Order.create(orderData);

      // Invalidate v2 API caches
      try {
        // Invalidate available pickup requests cache (new order is now available)
        await RedisCache.invalidateV2ApiCache('available_pickup_requests', null, {
          user_id: 'all',
          user_type: 'all'
        });
        // Also invalidate for customer's active pickup (if any)
        await RedisCache.invalidateV2ApiCache('active_pickup', customer_id, {
          user_type: 'U'
        });
        console.log(`🗑️  Invalidated v2 order caches after placing pickup request`);
      } catch (err) {
        console.error('Cache invalidation error:', err);
      }

      console.log(`✅ [V2OrderController.placePickupRequest] Order created successfully:`, {
        order_id: order.id,
        order_number: order.order_number,
        status: order.status,
        shop_id: order.shop_id,
      });

      // Send push notification to vendor if order is assigned
      if (assignedShopId && orderStatus === 2) {
        try {
          console.log(`📤 Sending notification to vendor (shop_id: ${assignedShopId})...`);
          
          // Get shop details to find vendor user_id
          const shop = await Shop.findById(assignedShopId);
          if (shop && shop.user_id) {
            // Get vendor user to get FCM token
            const vendorUser = await User.findById(shop.user_id);
            
            if (vendorUser && vendorUser.fcm_token) {
              // Parse order details for notification
              let orderDetailsText = 'New pickup request';
              try {
                const orderDetailsObj = typeof order.orderdetails === 'string' 
                  ? JSON.parse(order.orderdetails) 
                  : order.orderdetails;
                
                if (orderDetailsObj && Array.isArray(orderDetailsObj) && orderDetailsObj.length > 0) {
                  const materialCount = orderDetailsObj.length;
                  const totalQty = orderDetailsObj.reduce((sum, item) => {
                    const qty = parseFloat(item.quantity || item.qty || 0);
                    return sum + qty;
                  }, 0);
                  orderDetailsText = `${materialCount} material(s), ${totalQty} kg`;
                }
              } catch (parseErr) {
                console.warn('⚠️  Could not parse order details for notification:', parseErr.message);
              }

              // Create concise notification (FCM body limit is ~1000 chars, but keep it short for better UX)
              const notificationTitle = `📦 New Pickup Request #${order.order_number}`;
              const addressPreview = order.customerdetails 
                ? (order.customerdetails.length > 50 
                    ? order.customerdetails.substring(0, 50) + '...' 
                    : order.customerdetails)
                : 'Address not provided';
              const notificationBody = `${orderDetailsText} | Weight: ${order.estim_weight || 0} kg | Price: ₹${order.estim_price || 0} | ${addressPreview}`;
              
              // Send notification to vendor
              await sendVendorNotification(
                vendorUser.fcm_token,
                notificationTitle,
                notificationBody,
                {
                  type: 'new_order',
                  order_id: order.id.toString(),
                  order_number: order.order_number.toString(),
                  shop_id: assignedShopId.toString(),
                  customer_id: customer_id.toString(),
                  status: '2', // assigned
                  timestamp: new Date().toISOString()
                }
              );
              
              console.log(`✅ Notification sent to vendor (user_id: ${vendorUser.id})`);
            } else {
              console.warn(`⚠️  Vendor user (user_id: ${shop.user_id}) not found or has no FCM token`);
            }
          } else {
            console.warn(`⚠️  Shop (shop_id: ${assignedShopId}) not found or has no user_id`);
          }
        } catch (notifError) {
          // Don't fail the order placement if notification fails
          console.error('❌ Error sending notification to vendor:', notifError);
          console.error('   Order was still created successfully');
        }
      } else {
        console.log('ℹ️  Order not assigned to vendor, skipping notification');
      }

      return res.json({
        status: 'success',
        msg: 'Pickup request placed successfully',
        data: {
          order_number: order.order_number,
          order_id: order.id,
          status: order.status
        }
      });
    } catch (error) {
      console.error('❌ [V2OrderController.placePickupRequest] Error:', error);
      console.error('   Error message:', error.message);
      console.error('   Error stack:', error.stack);
      return res.status(500).json({
        status: 'error',
        msg: error.message || 'Failed to place pickup request',
        data: null
      });
    }
  }

  /**
   * GET /api/v2/orders/pickup-requests/available
   * Get available pickup requests that can be accepted by R, S, SR, or D users
   * Query params: ?user_id=number&user_type=R|S|SR|D&latitude=number&longitude=number&radius=number(km)
   */
  static async getAvailablePickupRequests(req, res) {
    try {
      const { user_id, user_type, latitude, longitude, radius = 10 } = req.query;

      if (!user_id || !user_type) {
        return res.status(400).json({
          status: 'error',
          msg: 'Missing required query params: user_id, user_type',
          data: null
        });
      }

      // Validate user type
      const validTypes = ['R', 'S', 'SR', 'D'];
      if (!validTypes.includes(user_type)) {
        return res.status(400).json({
          status: 'error',
          msg: 'Invalid user_type. Must be R, S, SR, or D',
          data: null
        });
      }

      // Check Redis cache first (only if location is provided, as results vary by location)
      // For location-based queries, cache key includes location and radius
      // Also include user_id since different vendors see different assigned orders
      let cacheKey = null;
      if (latitude && longitude) {
        const latRounded = Math.round(parseFloat(latitude) * 100) / 100; // Round to 2 decimals
        const lngRounded = Math.round(parseFloat(longitude) * 100) / 100;
        cacheKey = RedisCache.listKey('available_pickup_requests', {
          user_id: parseInt(user_id),
          user_type,
          lat: latRounded,
          lng: lngRounded,
          radius: parseFloat(radius)
        });
      } else {
        // Without location, cache by user_id and user_type
        cacheKey = RedisCache.listKey('available_pickup_requests', { 
          user_id: parseInt(user_id),
          user_type 
        });
      }

      try {
        const cached = await RedisCache.get(cacheKey);
        if (cached !== null && cached !== undefined) {
          console.log('⚡ Available pickup requests cache hit');
          return res.json({
            status: 'success',
            msg: 'Available pickup requests retrieved successfully',
            data: cached,
            hitBy: 'Redis'
          });
        }
      } catch (err) {
        console.error('Redis get error:', err);
      }

      // Get vendor's shop_id if they have one (for R, S, SR types)
      let vendorShopId = null;
      if (user_type === 'R' || user_type === 'S' || user_type === 'SR') {
        try {
          const Shop = require('../models/Shop');
          const shop = await Shop.findByUserId(parseInt(user_id));
          if (shop && shop.id) {
            vendorShopId = parseInt(shop.id);
            console.log(`✅ Found shop for vendor: shop_id=${vendorShopId}, user_id=${user_id}`);
          }
        } catch (shopErr) {
          console.warn('⚠️  Could not find shop for vendor:', shopErr.message);
        }
      }

      // Get orders that are available for this vendor:
      // 1. Unassigned orders (status = 1, shop_id = null) - available for any vendor
      // 2. Orders assigned to this vendor's shop (status = 2, shop_id = vendor's shop_id) - assigned to this vendor
      const client = require('../config/dynamodb').getDynamoDBClient();
      const { ScanCommand } = require('@aws-sdk/lib-dynamodb');

      let allOrders = [];

      // Get unassigned orders (status = 1, shop_id = null)
      const unassignedCommand = new ScanCommand({
        TableName: 'orders',
        FilterExpression: '#status = :status1 AND (shop_id = :null OR attribute_not_exists(shop_id))',
        ExpressionAttributeNames: {
          '#status': 'status'
        },
        ExpressionAttributeValues: {
          ':status1': 1,
          ':null': null
        }
      });

      const unassignedResponse = await client.send(unassignedCommand);
      allOrders = unassignedResponse.Items || [];
      console.log(`📦 Found ${allOrders.length} unassigned orders (status=1)`);

      // Get orders assigned to this vendor's shop (status = 2, shop_id = vendor's shop_id)
      if (vendorShopId) {
        const assignedCommand = new ScanCommand({
          TableName: 'orders',
          FilterExpression: '#status = :status2 AND shop_id = :shopId',
          ExpressionAttributeNames: {
            '#status': 'status'
          },
          ExpressionAttributeValues: {
            ':status2': 2,
            ':shopId': vendorShopId
          }
        });

        const assignedResponse = await client.send(assignedCommand);
        const assignedOrders = assignedResponse.Items || [];
        console.log(`📦 Found ${assignedOrders.length} orders assigned to this vendor (status=2, shop_id=${vendorShopId})`);
        
        // Combine both sets of orders (avoid duplicates)
        const existingOrderIds = new Set(allOrders.map(o => o.id));
        assignedOrders.forEach(order => {
          if (!existingOrderIds.has(order.id)) {
            allOrders.push(order);
          }
        });
      }

      let orders = allOrders;

      // If location provided, filter by distance
      if (latitude && longitude) {
        const userLat = parseFloat(latitude);
        const userLng = parseFloat(longitude);
        const radiusKm = parseFloat(radius);

        orders = orders.filter(order => {
          if (!order.lat_log) return false;
          const [orderLat, orderLng] = order.lat_log.split(',').map(Number);
          if (isNaN(orderLat) || isNaN(orderLng)) return false;

          // Calculate distance using Haversine formula
          const distance = calculateDistance(userLat, userLng, orderLat, orderLng);
          order.distance_km = distance;
          return distance <= radiusKm;
        });

        // Sort by distance
        orders.sort((a, b) => (a.distance_km || Infinity) - (b.distance_km || Infinity));
      }

      // Get unique customer IDs and fetch customer data
      const customerIds = [...new Set(orders.map(o => o.customer_id).filter(Boolean))];
      const customers = await Promise.all(
        customerIds.map(async (id) => {
          try {
            // First try to find by customer ID
            let customer = await Customer.findById(id);
            if (customer) {
              console.log(`✅ Found customer by ID ${id}:`, customer.name || 'No name');
              return customer;
            }
            // If not found, try to find by user_id (customer_id might be user_id)
            customer = await Customer.findByUserId(id);
            if (customer) {
              console.log(`✅ Found customer by user_id ${id}:`, customer.name || 'No name');
              return customer;
            }
            // If still not found, try to get from User table as fallback
            const User = require('../models/User');
            const user = await User.findById(id);
            if (user) {
              console.log(`✅ Found user ${id}, using as customer fallback:`, user.name || 'No name');
              // Return a customer-like object from user data
              return {
                id: id,
                name: user.name || null,
                contact: user.mob_num || null
              };
            }
            console.log(`❌ No customer or user found for ID ${id}`);
            return null;
          } catch (err) {
            console.error(`Error fetching customer ${id}:`, err);
            return null;
          }
        })
      );
      const customerMap = {};
      customers.forEach(c => {
        if (c) {
          // Map by both customer.id and the original customer_id
          customerMap[c.id] = c;
          // Also check if we need to map by a different key
          if (c.user_id && c.user_id !== c.id) {
            customerMap[c.user_id] = c;
          }
        }
      });
      
      // Also map customer_id to customer if customer_id is user_id
      customerIds.forEach(customerId => {
        if (!customerMap[customerId]) {
          // Try to find customer that matches this ID
          const found = customers.find(c => c && (c.id === customerId || c.user_id === customerId));
          if (found) {
            customerMap[customerId] = found;
          }
        }
      });

      // Format orders for response
      const formattedOrders = orders.map(order => {
        const [lat, lng] = order.lat_log ? order.lat_log.split(',').map(Number) : [null, null];
        
        // Get customer info
        // Try to find customer by customer_id, or by user_id if customer_id is actually a user_id
        let customer = order.customer_id ? customerMap[order.customer_id] : null;
        if (!customer && order.customer_id) {
          // Try to find by user_id in the map
          const found = Object.values(customerMap).find(c => c && c.user_id === order.customer_id);
          if (found) customer = found;
        }
        const customer_name = customer?.name || null;
        const customer_phone = customer?.contact ? String(customer.contact) : null;
        
        // Parse orderdetails to get scrap description
        let scrapDescription = 'Mixed Recyclables';
        let totalWeight = parseFloat(order.estim_weight) || 0;
        
        try {
          const details = typeof order.orderdetails === 'string' 
            ? JSON.parse(order.orderdetails) 
            : order.orderdetails;
          
          if (details && typeof details === 'object') {
            // Extract scrap types and weights from orderdetails
            const items = [];
            if (Array.isArray(details)) {
              items.push(...details);
            } else if (details.orders) {
              Object.entries(details.orders).forEach(([category, subcats]) => {
                if (Array.isArray(subcats)) {
                  items.push(...subcats);
                }
              });
            }
            
            if (items.length > 0) {
              const categories = [...new Set(items.map(item => item.name || item.category_name))];
              scrapDescription = categories.length > 0 
                ? categories.join(', ') 
                : 'Mixed Recyclables';
            }
          }
        } catch (e) {
          console.error('Error parsing orderdetails:', e);
        }

        return {
          order_id: order.id,
          order_number: order.order_number,
          customer_id: order.customer_id,
          customer_name: customer_name,
          customer_phone: customer_phone,
          address: order.address || order.customerdetails,
          latitude: lat,
          longitude: lng,
          scrap_description: scrapDescription,
          estimated_weight_kg: totalWeight,
          estimated_price: parseFloat(order.estim_price) || 0,
          status: order.status,
          preferred_pickup_time: order.preferred_pickup_time,
          created_at: order.created_at,
          distance_km: order.distance_km || null,
          images: [
            order.image1,
            order.image2,
            order.image3,
            order.image4,
            order.image5,
            order.image6
          ].filter(Boolean)
        };
      });

      // Cache the result (cache for 2 minutes - pickup requests change frequently)
      if (cacheKey) {
        try {
          await RedisCache.set(cacheKey, formattedOrders, 'short');
          console.log('💾 Available pickup requests cached');
        } catch (err) {
          console.error('Redis cache set error:', err);
        }
      }

      return res.json({
        status: 'success',
        msg: 'Available pickup requests retrieved successfully',
        data: formattedOrders,
        hitBy: 'DynamoDB'
      });
    } catch (error) {
      console.error('Error fetching available pickup requests:', error);
      return res.status(500).json({
        status: 'error',
        msg: 'Failed to fetch available pickup requests',
        data: null
      });
    }
  }

  /**
   * POST /api/v2/orders/pickup-request/:orderId/accept
   * Accept a pickup request (R, S, SR, or D users)
   * Body: { user_id: number, user_type: 'R'|'S'|'SR'|'D' }
   */
  static async acceptPickupRequest(req, res) {
    try {
      const { orderId } = req.params;
      const { user_id, user_type } = req.body;

      if (!user_id || !user_type) {
        return res.status(400).json({
          status: 'error',
          msg: 'Missing required fields: user_id, user_type',
          data: null
        });
      }

      // Validate user type
      const validTypes = ['R', 'S', 'SR', 'D'];
      if (!validTypes.includes(user_type)) {
        return res.status(400).json({
          status: 'error',
          msg: 'Invalid user_type. Must be R, S, SR, or D',
          data: null
        });
      }

      // Find order by order number or ID
      // Try to parse as number first (order_number), otherwise try as string (order_no) or ID
      const orderIdNum = !isNaN(orderId) ? parseInt(orderId) : null;
      
      let orders = [];
      if (orderIdNum) {
        orders = await Order.findByOrderNo(orderIdNum);
      } else {
        // Try finding by ID directly
        const client = require('../config/dynamodb').getDynamoDBClient();
        const { GetCommand, ScanCommand } = require('@aws-sdk/lib-dynamodb');
        
        // Try by ID first
        try {
          const getCommand = new GetCommand({
            TableName: 'orders',
            Key: { id: orderId }
          });
          const response = await client.send(getCommand);
          if (response.Item) {
            orders = [response.Item];
          }
        } catch (e) {
          // If not found by ID, try by order_no
          const scanCommand = new ScanCommand({
            TableName: 'orders',
            FilterExpression: 'order_no = :orderNo',
            ExpressionAttributeValues: {
              ':orderNo': orderId
            }
          });
          const response = await client.send(scanCommand);
          orders = response.Items || [];
        }
      }
      
      if (!orders || orders.length === 0) {
        return res.status(404).json({
          status: 'error',
          msg: 'Order not found',
          data: null
        });
      }

      const order = orders[0];

      // Get vendor's shop_id if they have one (for R, S, SR types)
      let vendorShopId = null;
      if (user_type === 'R' || user_type === 'S' || user_type === 'SR') {
        try {
          const Shop = require('../models/Shop');
          const shop = await Shop.findByUserId(parseInt(user_id));
          if (shop && shop.id) {
            vendorShopId = parseInt(shop.id);
          }
        } catch (shopErr) {
          console.warn('⚠️  Could not find shop for vendor:', shopErr.message);
        }
      }

      // Check if order is available for this vendor:
      // 1. Unassigned orders (status = 1, shop_id = null) - any vendor can accept
      // 2. Orders assigned to this vendor's shop (status = 2, shop_id = vendor's shop_id) - this vendor can accept
      const isUnassigned = order.status === 1 && (!order.shop_id || order.shop_id === null);
      const isAssignedToVendor = vendorShopId && order.status === 2 && parseInt(order.shop_id) === vendorShopId;

      if (!isUnassigned && !isAssignedToVendor) {
        if (order.status === 2 && order.shop_id) {
          return res.status(400).json({
            status: 'error',
            msg: 'Order has already been assigned to another vendor',
            data: null
          });
        } else if (order.status === 3 || order.status === 4) {
          return res.status(400).json({
            status: 'error',
            msg: 'Order has already been accepted or completed',
            data: null
          });
        } else {
          return res.status(400).json({
            status: 'error',
            msg: 'Order is no longer available for pickup',
            data: null
          });
        }
      }

      // Update order with shop_id/vendor_id and change status to 3 (pickup assigned)
      const UpdateCommand = require('@aws-sdk/lib-dynamodb').UpdateCommand;
      const client = require('../config/dynamodb').getDynamoDBClient();

      // For D type (delivery), set delv_id
      // For R, S, SR types, set shop_id
      const updateExpression = user_type === 'D' 
        ? 'SET delv_id = :userId, delv_boy_id = :userId, #status = :status, updated_at = :updatedAt'
        : 'SET shop_id = :userId, #status = :status, updated_at = :updatedAt';

      const command = new UpdateCommand({
        TableName: 'orders',
        Key: { id: order.id },
        UpdateExpression: updateExpression,
        ExpressionAttributeNames: {
          '#status': 'status'
        },
        ExpressionAttributeValues: {
          ':userId': parseInt(user_id),
          ':status': 3, // 3 = pickup assigned
          ':updatedAt': new Date().toISOString()
        }
      });

      await client.send(command);

      // Send FCM notification to customer
      try {
        // Get vendor/partner name
        let partnerName = 'Partner';
        if (user_type === 'R' || user_type === 'S' || user_type === 'SR') {
          const Shop = require('../models/Shop');
          const shop = await Shop.findByUserId(parseInt(user_id));
          if (shop && shop.shopname) {
            partnerName = shop.shopname;
          } else {
            const vendorUser = await User.findById(parseInt(user_id));
            if (vendorUser && vendorUser.name) {
              partnerName = vendorUser.name;
            }
          }
        } else if (user_type === 'D') {
          const DeliveryBoy = require('../models/DeliveryBoy');
          const deliveryBoy = await DeliveryBoy.findByUserId(parseInt(user_id));
          if (deliveryBoy && deliveryBoy.name) {
            partnerName = deliveryBoy.name;
          } else {
            const vendorUser = await User.findById(parseInt(user_id));
            if (vendorUser && vendorUser.name) {
              partnerName = vendorUser.name;
            }
          }
        }

        // Get customer FCM token
        let customerFcmToken = null;
        if (order.customer_id) {
          // Try to find customer by customer_id (might be user_id)
          let customerUser = null;
          try {
            const Customer = require('../models/Customer');
            let customer = await Customer.findById(order.customer_id);
            if (!customer) {
              customer = await Customer.findByUserId(order.customer_id);
            }
            if (customer && customer.user_id) {
              customerUser = await User.findById(customer.user_id);
            } else {
              // customer_id might be user_id directly
              customerUser = await User.findById(order.customer_id);
            }
            if (customerUser && customerUser.fcm_token) {
              customerFcmToken = customerUser.fcm_token;
            }
          } catch (customerErr) {
            console.warn('⚠️  Could not fetch customer FCM token:', customerErr.message);
          }
        }

        // Send notification to customer if FCM token exists
        if (customerFcmToken) {
          // Use customer app Firebase service account for customer notifications
          const { sendCustomerNotification } = require('../utils/fcmNotification');
          await sendCustomerNotification(
            customerFcmToken,
            'Pickup Accepted',
            `${partnerName} accepted your pickup request`,
            {
              type: 'order_accepted',
              order_id: String(order.id),
              order_number: String(order.order_number || order.order_no || ''),
              partner_name: partnerName,
              screen: 'MyOrders'
            }
          );
          console.log(`✅ Sent FCM notification to customer ${order.customer_id} about order acceptance`);
        } else {
          console.log(`⚠️  No FCM token found for customer ${order.customer_id}, skipping notification`);
        }
      } catch (notificationErr) {
        console.error('❌ Error sending customer notification:', notificationErr);
        // Don't fail the request if notification fails
      }

      // Invalidate v2 API caches
      try {
        // Invalidate available pickup requests (order is no longer available)
        await RedisCache.invalidateV2ApiCache('available_pickup_requests', null, {
          user_id: 'all',
          user_type: 'all'
        });
        // Invalidate active pickup for the accepting user
        await RedisCache.invalidateV2ApiCache('active_pickup', user_id, {
          user_type: user_type
        });
        // Invalidate active pickup for the customer
        if (order.customer_id) {
          await RedisCache.invalidateV2ApiCache('active_pickup', order.customer_id, {
            user_type: 'U'
          });
        }
        // Invalidate order cache
        await RedisCache.invalidateV2ApiCache('order', null, {
          order_id: order.id,
          customer_id: order.customer_id,
          user_id: user_id,
          user_type: user_type
        });
        console.log(`🗑️  Invalidated v2 order caches after accepting pickup request`);
      } catch (err) {
        console.error('Cache invalidation error:', err);
      }

      return res.json({
        status: 'success',
        msg: 'Pickup request accepted successfully',
        data: {
          order_id: order.id,
          order_number: order.order_number,
          status: 3
        }
      });
    } catch (error) {
      console.error('Error accepting pickup request:', error);
      return res.status(500).json({
        status: 'error',
        msg: 'Failed to accept pickup request',
        data: null
      });
    }
  }

  /**
   * GET /api/v2/orders/active-pickup/:userId
   * Get active pickup orders for a user (R, S, SR, D)
   * Query params: ?user_type=R|S|SR|D
   */
  static async getActivePickup(req, res) {
    try {
      const { userId } = req.params;
      const { user_type } = req.query;

      if (!user_type) {
        return res.status(400).json({
          status: 'error',
          msg: 'Missing required query param: user_type',
          data: null
        });
      }

      const userIdNum = parseInt(userId);

      // Check Redis cache first
      const cacheKey = RedisCache.userKey(userIdNum, `active_pickup_${user_type}`);
      try {
        const cached = await RedisCache.get(cacheKey);
        if (cached !== null && cached !== undefined) {
          console.log('⚡ Active pickup cache hit');
          return res.json({
            status: 'success',
            msg: 'Active pickup retrieved successfully',
            data: cached,
            hitBy: 'Redis'
          });
        }
      } catch (err) {
        console.error('Redis get error:', err);
      }
      const client = require('../config/dynamodb').getDynamoDBClient();
      const { ScanCommand } = require('@aws-sdk/lib-dynamodb');

      // Find orders assigned to this user with status 3 (pickup assigned/scheduled)
      let filterExpression;
      let expressionAttributeValues;

      if (user_type === 'D') {
        filterExpression = '(delv_id = :userId OR delv_boy_id = :userId) AND #status = :status';
        expressionAttributeValues = {
          ':userId': userIdNum,
          ':status': 3
        };
      } else {
        filterExpression = 'shop_id = :userId AND #status = :status';
        expressionAttributeValues = {
          ':userId': userIdNum,
          ':status': 3
        };
      }

      const command = new ScanCommand({
        TableName: 'orders',
        FilterExpression: filterExpression,
        ExpressionAttributeNames: {
          '#status': 'status'
        },
        ExpressionAttributeValues: expressionAttributeValues
      });

      const response = await client.send(command);
      const orders = response.Items || [];

      // Get unique customer IDs and fetch customer data
      const customerIds = [...new Set(orders.map(o => o.customer_id).filter(Boolean))];
      const customers = await Promise.all(
        customerIds.map(async (id) => {
          try {
            // First try to find by customer ID
            let customer = await Customer.findById(id);
            if (customer) {
              console.log(`✅ [getActivePickup] Found customer by ID ${id}:`, customer.name || 'No name');
              return customer;
            }
            // If not found, try to find by user_id (customer_id might be user_id)
            customer = await Customer.findByUserId(id);
            if (customer) {
              console.log(`✅ [getActivePickup] Found customer by user_id ${id}:`, customer.name || 'No name');
              return customer;
            }
            // If still not found, try to get from User table as fallback
            const User = require('../models/User');
            const user = await User.findById(id);
            if (user) {
              console.log(`✅ [getActivePickup] Found user ${id}, using as customer fallback:`, user.name || 'No name');
              // Return a customer-like object from user data
              return {
                id: id,
                name: user.name || null,
                contact: user.mob_num || null
              };
            }
            console.log(`❌ [getActivePickup] No customer or user found for ID ${id}`);
            return null;
          } catch (err) {
            console.error(`Error fetching customer ${id}:`, err);
            return null;
          }
        })
      );
      const customerMap = {};
      customers.forEach(c => {
        if (c) {
          // Map by both customer.id and the original customer_id
          customerMap[c.id] = c;
          // Also check if we need to map by a different key
          if (c.user_id && c.user_id !== c.id) {
            customerMap[c.user_id] = c;
          }
        }
      });
      
      // Also map customer_id to customer if customer_id is user_id
      customerIds.forEach(customerId => {
        if (!customerMap[customerId]) {
          // Try to find customer that matches this ID
          const found = customers.find(c => c && (c.id === customerId || c.user_id === customerId));
          if (found) {
            customerMap[customerId] = found;
          }
        }
      });

      // Format orders for Active Pickup section
      const formattedOrders = orders.slice(0, 1).map(order => { // Get most recent active pickup
        const [lat, lng] = order.lat_log ? order.lat_log.split(',').map(Number) : [null, null];
        
        // Get customer info
        // Try to find customer by customer_id, or by user_id if customer_id is actually a user_id
        let customer = order.customer_id ? customerMap[order.customer_id] : null;
        if (!customer && order.customer_id) {
          // Try to find by user_id in the map
          const found = Object.values(customerMap).find(c => c && c.user_id === order.customer_id);
          if (found) customer = found;
        }
        const customer_name = customer?.name || null;
        const customer_phone = customer?.contact ? String(customer.contact) : null;
        
        // Parse orderdetails
        let scrapDescription = 'Mixed Recyclables';
        let totalWeight = parseFloat(order.estim_weight) || 0;
        
        try {
          const details = typeof order.orderdetails === 'string' 
            ? JSON.parse(order.orderdetails) 
            : order.orderdetails;
          
          if (details && typeof details === 'object') {
            const items = [];
            if (Array.isArray(details)) {
              items.push(...details);
            } else if (details.orders) {
              Object.entries(details.orders).forEach(([category, subcats]) => {
                if (Array.isArray(subcats)) {
                  items.push(...subcats);
                }
              });
            }
            
            if (items.length > 0) {
              const categories = [...new Set(items.map(item => item.name || item.category_name))];
              scrapDescription = categories.length > 0 
                ? categories.join(', ') 
                : 'Mixed Recyclables';
            }
          }
        } catch (e) {
          console.error('Error parsing orderdetails:', e);
        }

        // Format pickup time
        let pickupTimeDisplay = 'Today';
        if (order.preferred_pickup_time) {
          const timeStr = order.preferred_pickup_time;
          if (timeStr.includes('AM') || timeStr.includes('PM')) {
            pickupTimeDisplay = `Today, ${timeStr}`;
          }
        }

        // Parse orderdetails to get individual items
        let orderItems = [];
        try {
          const details = typeof order.orderdetails === 'string' 
            ? JSON.parse(order.orderdetails) 
            : order.orderdetails;
          
          if (details && typeof details === 'object') {
            if (Array.isArray(details)) {
              orderItems = details;
            } else if (details.orders) {
              Object.entries(details.orders).forEach(([category, subcats]) => {
                if (Array.isArray(subcats)) {
                  orderItems.push(...subcats);
                }
              });
            }
          }
        } catch (e) {
          console.error('Error parsing orderdetails for items:', e);
        }

        return {
          order_id: order.id,
          order_number: order.order_number,
          order_no: order.order_no,
          customer_id: order.customer_id,
          customer_name: customer_name,
          customer_phone: customer_phone,
          address: order.address || order.customerdetails,
          latitude: lat,
          longitude: lng,
          scrap_description: scrapDescription,
          estimated_weight_kg: totalWeight,
          estimated_price: parseFloat(order.estim_price) || 0,
          status: order.status,
          preferred_pickup_time: order.preferred_pickup_time,
          pickup_time_display: pickupTimeDisplay,
          created_at: order.created_at,
          images: [
            order.image1,
            order.image2,
            order.image3,
            order.image4,
            order.image5,
            order.image6
          ].filter(Boolean),
          orderdetails: orderItems // Include parsed order items
        };
      });

      const result = formattedOrders[0] || null;

      // Cache the result (cache for 2 minutes - active pickup can change)
      try {
        await RedisCache.set(cacheKey, result, 'short');
        console.log('💾 Active pickup cached');
      } catch (err) {
        console.error('Redis cache set error:', err);
      }

      return res.json({
        status: 'success',
        msg: 'Active pickup retrieved successfully',
        data: result,
        hitBy: 'DynamoDB'
      });
    } catch (error) {
      console.error('Error fetching active pickup:', error);
      return res.status(500).json({
        status: 'error',
        msg: 'Failed to fetch active pickup',
        data: null
      });
    }
  }
}

/**
 * Calculate distance between two coordinates using Haversine formula
 * @param {number} lat1 
 * @param {number} lon1 
 * @param {number} lat2 
 * @param {number} lon2 
 * @returns {number} Distance in kilometers
 */
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // Radius of the Earth in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  const distance = R * c;
  return distance;
}

/**
 * POST /api/v2/orders/pickup-request/:orderId/start-pickup
 * Start pickup (vendor clicks "Myself Pickup")
 * Body: { user_id: number, user_type: 'R'|'S'|'SR'|'D' }
 */
V2OrderController.startPickup = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { user_id, user_type } = req.body;

    if (!user_id || !user_type) {
      return res.status(400).json({
        status: 'error',
        msg: 'user_id and user_type are required',
        data: null
      });
    }

    // Validate user type
    const validTypes = ['R', 'S', 'SR', 'D'];
    if (!validTypes.includes(user_type)) {
      return res.status(400).json({
        status: 'error',
        msg: 'Invalid user_type. Must be R, S, SR, or D',
        data: null
      });
    }

    // Find order
    const orderIdNum = !isNaN(orderId) ? parseInt(orderId) : null;
    let orders = [];
    if (orderIdNum) {
      orders = await Order.findByOrderNo(orderIdNum);
    } else {
      const client = require('../config/dynamodb').getDynamoDBClient();
      const { GetCommand, ScanCommand } = require('@aws-sdk/lib-dynamodb');
      
      try {
        const getCommand = new GetCommand({
          TableName: 'orders',
          Key: { id: orderId }
        });
        const response = await client.send(getCommand);
        if (response.Item) {
          orders = [response.Item];
        }
      } catch (e) {
        const scanCommand = new ScanCommand({
          TableName: 'orders',
          FilterExpression: 'order_no = :orderNo',
          ExpressionAttributeValues: {
            ':orderNo': orderId
          }
        });
        const response = await client.send(scanCommand);
        orders = response.Items || [];
      }
    }
    
    if (!orders || orders.length === 0) {
      return res.status(404).json({
        status: 'error',
        msg: 'Order not found',
        data: null
      });
    }

    const order = orders[0];

    // Check if order is accepted (status 3) and assigned to this vendor
    if (order.status !== 3) {
      return res.status(400).json({
        status: 'error',
        msg: 'Order must be accepted before starting pickup',
        data: null
      });
    }

    // Verify order is assigned to this vendor
    let vendorShopId = null;
    if (user_type === 'R' || user_type === 'S' || user_type === 'SR') {
      const Shop = require('../models/Shop');
      const shop = await Shop.findByUserId(parseInt(user_id));
      if (shop && shop.id) {
        vendorShopId = parseInt(shop.id);
      }
      if (!vendorShopId || parseInt(order.shop_id) !== vendorShopId) {
        return res.status(403).json({
          status: 'error',
          msg: 'Order is not assigned to you',
          data: null
        });
      }
    } else if (user_type === 'D') {
      if (parseInt(order.delv_id) !== parseInt(user_id) && parseInt(order.delv_boy_id) !== parseInt(user_id)) {
        return res.status(403).json({
          status: 'error',
          msg: 'Order is not assigned to you',
          data: null
        });
      }
    }

    // Update order status to 4 (pickup started/in progress)
    const UpdateCommand = require('@aws-sdk/lib-dynamodb').UpdateCommand;
    const client = require('../config/dynamodb').getDynamoDBClient();

    const command = new UpdateCommand({
      TableName: 'orders',
      Key: { id: order.id },
      UpdateExpression: 'SET #status = :status, pickup_started_at = :startedAt, updated_at = :updatedAt',
      ExpressionAttributeNames: {
        '#status': 'status'
      },
      ExpressionAttributeValues: {
        ':status': 4, // 4 = pickup started/in progress
        ':startedAt': new Date().toISOString(),
        ':updatedAt': new Date().toISOString()
      }
    });

    await client.send(command);

    // Invalidate caches
    try {
      await RedisCache.invalidateV2ApiCache('active_pickup', user_id, {
        user_type: user_type
      });
      if (order.customer_id) {
        await RedisCache.invalidateV2ApiCache('active_pickup', order.customer_id, {
          user_type: 'U'
        });
      }
      await RedisCache.invalidateV2ApiCache('order', null, {
        order_id: order.id,
        customer_id: order.customer_id,
        user_id: user_id,
        user_type: user_type
      });
    } catch (err) {
      console.error('Cache invalidation error:', err);
    }

    return res.json({
      status: 'success',
      msg: 'Pickup started successfully',
      data: {
        order_id: order.id,
        order_number: order.order_number,
        status: 4
      }
    });
  } catch (error) {
    console.error('Error starting pickup:', error);
    return res.status(500).json({
      status: 'error',
      msg: 'Failed to start pickup',
      data: null
    });
  }
};

module.exports = V2OrderController;
