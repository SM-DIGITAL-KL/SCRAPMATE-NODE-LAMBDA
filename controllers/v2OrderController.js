/**
 * V2 Order Controller
 * Handles pickup request orders from user app (U type) 
 * and allows R, S, SR, D users to accept them
 */

const Order = require('../models/Order');
const User = require('../models/User');
const RedisCache = require('../utils/redisCache');

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

      // Handle multiple image uploads to S3
      const { uploadFileToS3 } = require('../utils/fileUpload');
      let image1 = req.body.image1 || '';
      let image2 = req.body.image2 || '';
      let image3 = req.body.image3 || '';
      let image4 = req.body.image4 || '';
      let image5 = req.body.image5 || '';
      let image6 = req.body.image6 || '';

      // Upload images to S3 if files are provided
      if (req.files?.image1?.[0]) {
        try {
          const result = await uploadFileToS3(req.files.image1[0], 'order-images');
          image1 = result.s3Url || result.filename;
        } catch (err) {
          console.error('Error uploading image1:', err);
        }
      }
      if (req.files?.image2?.[0]) {
        try {
          const result = await uploadFileToS3(req.files.image2[0], 'order-images');
          image2 = result.s3Url || result.filename;
        } catch (err) {
          console.error('Error uploading image2:', err);
        }
      }
      if (req.files?.image3?.[0]) {
        try {
          const result = await uploadFileToS3(req.files.image3[0], 'order-images');
          image3 = result.s3Url || result.filename;
        } catch (err) {
          console.error('Error uploading image3:', err);
        }
      }
      if (req.files?.image4?.[0]) {
        try {
          const result = await uploadFileToS3(req.files.image4[0], 'order-images');
          image4 = result.s3Url || result.filename;
        } catch (err) {
          console.error('Error uploading image4:', err);
        }
      }
      if (req.files?.image5?.[0]) {
        try {
          const result = await uploadFileToS3(req.files.image5[0], 'order-images');
          image5 = result.s3Url || result.filename;
        } catch (err) {
          console.error('Error uploading image5:', err);
        }
      }
      if (req.files?.image6?.[0]) {
        try {
          const result = await uploadFileToS3(req.files.image6[0], 'order-images');
          image6 = result.s3Url || result.filename;
        } catch (err) {
          console.error('Error uploading image6:', err);
        }
      }

      // Validation
      if (!customer_id || !orderdetails || !customerdetails) {
        return res.status(400).json({
          status: 'error',
          msg: 'Missing required fields: customer_id, orderdetails, customerdetails',
          data: null
        });
      }

      // Verify user type is 'U' (user app customer)
      const user = await User.findById(customer_id);
      if (!user) {
        return res.status(404).json({
          status: 'error',
          msg: 'User not found',
          data: null
        });
      }

      if (user.user_type !== 'U') {
        return res.status(403).json({
          status: 'error',
          msg: 'Only user app customers (type U) can place pickup requests',
          data: null
        });
      }

      // Get last order number
      const lastOrderNumber = await Order.getLastOrderNumber();
      let orderNumber = 10000;
      if (lastOrderNumber) {
        orderNumber = lastOrderNumber + 1;
      }

      // Format lat/lng for storage
      const latLog = latitude && longitude ? `${latitude},${longitude}` : '';

      const orderData = {
        order_number: orderNumber,
        customer_id: parseInt(customer_id),
        shop_id: null, // No shop assigned yet, will be assigned when accepted
        orderdetails: typeof orderdetails === 'string' ? orderdetails : JSON.stringify(orderdetails),
        customerdetails: customerdetails,
        shopdetails: '', // Will be filled when shop/vendor accepts
        del_type: 'pickup', // Pickup request
        estim_weight: parseFloat(estim_weight) || 0,
        estim_price: parseFloat(estim_price) || 0,
        status: 1, // 1 = pending (available for pickup)
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
      console.error('Error placing pickup request:', error);
      return res.status(500).json({
        status: 'error',
        msg: 'Failed to place pickup request',
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
      let cacheKey = null;
      if (latitude && longitude) {
        const latRounded = Math.round(parseFloat(latitude) * 100) / 100; // Round to 2 decimals
        const lngRounded = Math.round(parseFloat(longitude) * 100) / 100;
        cacheKey = RedisCache.listKey('available_pickup_requests', {
          user_type,
          lat: latRounded,
          lng: lngRounded,
          radius: parseFloat(radius)
        });
      } else {
        // Without location, cache by user_type only
        cacheKey = RedisCache.listKey('available_pickup_requests', { user_type });
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

      // Get all pending orders (status = 1) with no shop_id assigned
      // These are pickup requests from user app
      const client = require('../config/dynamodb').getDynamoDBClient();
      const { ScanCommand } = require('@aws-sdk/lib-dynamodb');

      const command = new ScanCommand({
        TableName: 'orders',
        FilterExpression: '#status = :status AND (shop_id = :null OR attribute_not_exists(shop_id))',
        ExpressionAttributeNames: {
          '#status': 'status'
        },
        ExpressionAttributeValues: {
          ':status': 1,
          ':null': null
        }
      });

      const response = await client.send(command);
      let orders = response.Items || [];

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

      // Format orders for response
      const formattedOrders = orders.map(order => {
        const [lat, lng] = order.lat_log ? order.lat_log.split(',').map(Number) : [null, null];
        
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

      // Check if order is still available (status = 1, no shop_id)
      if (order.status !== 1) {
        return res.status(400).json({
          status: 'error',
          msg: 'Order is no longer available for pickup',
          data: null
        });
      }

      if (order.shop_id) {
        return res.status(400).json({
          status: 'error',
          msg: 'Order has already been accepted',
          data: null
        });
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

      // Format orders for Active Pickup section
      const formattedOrders = orders.slice(0, 1).map(order => { // Get most recent active pickup
        const [lat, lng] = order.lat_log ? order.lat_log.split(',').map(Number) : [null, null];
        
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

        return {
          order_id: order.id,
          order_number: order.order_number,
          order_no: order.order_no,
          customer_id: order.customer_id,
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
          ].filter(Boolean)
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

module.exports = V2OrderController;






 * Handles pickup request orders from user app (U type) 
 * and allows R, S, SR, D users to accept them
 */

const Order = require('../models/Order');
const User = require('../models/User');
const RedisCache = require('../utils/redisCache');

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

      // Handle multiple image uploads to S3
      const { uploadFileToS3 } = require('../utils/fileUpload');
      let image1 = req.body.image1 || '';
      let image2 = req.body.image2 || '';
      let image3 = req.body.image3 || '';
      let image4 = req.body.image4 || '';
      let image5 = req.body.image5 || '';
      let image6 = req.body.image6 || '';

      // Upload images to S3 if files are provided
      if (req.files?.image1?.[0]) {
        try {
          const result = await uploadFileToS3(req.files.image1[0], 'order-images');
          image1 = result.s3Url || result.filename;
        } catch (err) {
          console.error('Error uploading image1:', err);
        }
      }
      if (req.files?.image2?.[0]) {
        try {
          const result = await uploadFileToS3(req.files.image2[0], 'order-images');
          image2 = result.s3Url || result.filename;
        } catch (err) {
          console.error('Error uploading image2:', err);
        }
      }
      if (req.files?.image3?.[0]) {
        try {
          const result = await uploadFileToS3(req.files.image3[0], 'order-images');
          image3 = result.s3Url || result.filename;
        } catch (err) {
          console.error('Error uploading image3:', err);
        }
      }
      if (req.files?.image4?.[0]) {
        try {
          const result = await uploadFileToS3(req.files.image4[0], 'order-images');
          image4 = result.s3Url || result.filename;
        } catch (err) {
          console.error('Error uploading image4:', err);
        }
      }
      if (req.files?.image5?.[0]) {
        try {
          const result = await uploadFileToS3(req.files.image5[0], 'order-images');
          image5 = result.s3Url || result.filename;
        } catch (err) {
          console.error('Error uploading image5:', err);
        }
      }
      if (req.files?.image6?.[0]) {
        try {
          const result = await uploadFileToS3(req.files.image6[0], 'order-images');
          image6 = result.s3Url || result.filename;
        } catch (err) {
          console.error('Error uploading image6:', err);
        }
      }

      // Validation
      if (!customer_id || !orderdetails || !customerdetails) {
        return res.status(400).json({
          status: 'error',
          msg: 'Missing required fields: customer_id, orderdetails, customerdetails',
          data: null
        });
      }

      // Verify user type is 'U' (user app customer)
      const user = await User.findById(customer_id);
      if (!user) {
        return res.status(404).json({
          status: 'error',
          msg: 'User not found',
          data: null
        });
      }

      if (user.user_type !== 'U') {
        return res.status(403).json({
          status: 'error',
          msg: 'Only user app customers (type U) can place pickup requests',
          data: null
        });
      }

      // Get last order number
      const lastOrderNumber = await Order.getLastOrderNumber();
      let orderNumber = 10000;
      if (lastOrderNumber) {
        orderNumber = lastOrderNumber + 1;
      }

      // Format lat/lng for storage
      const latLog = latitude && longitude ? `${latitude},${longitude}` : '';

      const orderData = {
        order_number: orderNumber,
        customer_id: parseInt(customer_id),
        shop_id: null, // No shop assigned yet, will be assigned when accepted
        orderdetails: typeof orderdetails === 'string' ? orderdetails : JSON.stringify(orderdetails),
        customerdetails: customerdetails,
        shopdetails: '', // Will be filled when shop/vendor accepts
        del_type: 'pickup', // Pickup request
        estim_weight: parseFloat(estim_weight) || 0,
        estim_price: parseFloat(estim_price) || 0,
        status: 1, // 1 = pending (available for pickup)
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
      console.error('Error placing pickup request:', error);
      return res.status(500).json({
        status: 'error',
        msg: 'Failed to place pickup request',
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
      let cacheKey = null;
      if (latitude && longitude) {
        const latRounded = Math.round(parseFloat(latitude) * 100) / 100; // Round to 2 decimals
        const lngRounded = Math.round(parseFloat(longitude) * 100) / 100;
        cacheKey = RedisCache.listKey('available_pickup_requests', {
          user_type,
          lat: latRounded,
          lng: lngRounded,
          radius: parseFloat(radius)
        });
      } else {
        // Without location, cache by user_type only
        cacheKey = RedisCache.listKey('available_pickup_requests', { user_type });
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

      // Get all pending orders (status = 1) with no shop_id assigned
      // These are pickup requests from user app
      const client = require('../config/dynamodb').getDynamoDBClient();
      const { ScanCommand } = require('@aws-sdk/lib-dynamodb');

      const command = new ScanCommand({
        TableName: 'orders',
        FilterExpression: '#status = :status AND (shop_id = :null OR attribute_not_exists(shop_id))',
        ExpressionAttributeNames: {
          '#status': 'status'
        },
        ExpressionAttributeValues: {
          ':status': 1,
          ':null': null
        }
      });

      const response = await client.send(command);
      let orders = response.Items || [];

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

      // Format orders for response
      const formattedOrders = orders.map(order => {
        const [lat, lng] = order.lat_log ? order.lat_log.split(',').map(Number) : [null, null];
        
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

      // Check if order is still available (status = 1, no shop_id)
      if (order.status !== 1) {
        return res.status(400).json({
          status: 'error',
          msg: 'Order is no longer available for pickup',
          data: null
        });
      }

      if (order.shop_id) {
        return res.status(400).json({
          status: 'error',
          msg: 'Order has already been accepted',
          data: null
        });
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

      // Format orders for Active Pickup section
      const formattedOrders = orders.slice(0, 1).map(order => { // Get most recent active pickup
        const [lat, lng] = order.lat_log ? order.lat_log.split(',').map(Number) : [null, null];
        
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

        return {
          order_id: order.id,
          order_number: order.order_number,
          order_no: order.order_no,
          customer_id: order.customer_id,
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
          ].filter(Boolean)
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

module.exports = V2OrderController;





