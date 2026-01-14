const Order = require('../models/Order');
const OrderRatings = require('../models/OrderRatings');
const path = require('path');
const { getFileSize } = require('../utils/fileUpload');
const RedisCache = require('../utils/redisCache');

class OrderController {
  // Order details
  static async orderDetails(req, res) {
    try {
      const { order_no } = req.params;

      if (!order_no) {
        return res.status(201).json({
          status: 'error',
          msg: 'empty param',
          data: ''
        });
      }

      // Check Redis cache first
      const cacheKey = RedisCache.orderKey(order_no);
      const cached = await RedisCache.get(cacheKey);
      if (cached) {
        return res.json({
          status: 'success',
          msg: 'Successfull',
          data: cached
        });
      }

      const orders = await Order.findByOrderNo(order_no);
      if (!orders || orders.length === 0) {
        return res.status(201).json({
          status: 'error',
          msg: 'Order not found',
          data: ''
        });
      }

      // Format image URLs for all orders - use getImageUrl helper to handle S3 URLs properly
      const { getImageUrl } = require('../utils/imageHelper');
      const formattedOrders = await Promise.all(orders.map(async (order) => {
        const formatted = { ...order };
        // Format image URLs
        for (let i = 1; i <= 6; i++) {
          const imageField = `image${i}`;
          if (formatted[imageField]) {
            // Check if already a full URL (S3 or external)
            if (formatted[imageField].startsWith('http://') || formatted[imageField].startsWith('https://')) {
              // If it's an S3 URL, convert to presigned URL, otherwise use as-is
              formatted[imageField] = await getImageUrl(formatted[imageField], 'order');
            } else {
              // Local path - prepend base URL (legacy support)
              formatted[imageField] = `${req.protocol}://${req.get('host')}/assets/images/order/${formatted[imageField]}`;
            }
          } else {
            formatted[imageField] = null;
          }
        }
        return formatted;
      }));

      // Cache for 10 minutes
      await RedisCache.set(cacheKey, formattedOrders, '365days');

      res.json({
        status: 'success',
        msg: 'Successfull',
        data: formattedOrders
      });
    } catch (err) {
      console.error('Order details error:', err);
      res.status(201).json({
        status: 'error',
        msg: 'Failed to fetch order',
        data: ''
      });
    }
  }

  // Customer orders
  static async customerOrders(req, res) {
    try {
      const { customer_id } = req.params;

      if (!customer_id) {
        return res.status(201).json({
          status: 'error',
          msg: 'empty param',
          data: ''
        });
      }

      const orders = await Order.findByCustomerId(customer_id);

      // Get shop details for orders that have shop_id
      const Shop = require('../models/Shop');
      const shopIds = [...new Set(orders.map(o => o.shop_id).filter(Boolean))];
      const shops = await Promise.all(shopIds.map(id => Shop.findById(id).catch(() => null)));
      const shopMap = {};
      shops.forEach(shop => {
        if (shop && shop.id) {
          shopMap[shop.id] = shop;
        }
      });

      // Format image URLs - use getImageUrl helper to handle S3 URLs properly
      const { getImageUrl } = require('../utils/imageHelper');
      const formattedOrders = await Promise.all(orders.map(async (order) => {
        const formatted = { ...order };
        
        // Add shop information if shop_id exists
        if (order.shop_id && shopMap[order.shop_id]) {
          const shop = shopMap[order.shop_id];
          formatted.shop_name = shop.shopname || '';
          formatted.shop_address = shop.address || shop.shopaddress || '';
          formatted.shop_latitude = shop.latitude || null;
          formatted.shop_longitude = shop.longitude || null;
        }
        
        // Convert id fields to strings for frontend compatibility
        if (formatted.id !== undefined) {
          formatted.id = String(formatted.id);
        }
        if (formatted.customer_id !== undefined) {
          formatted.customer_id = String(formatted.customer_id);
        }
        if (formatted.shop_id !== undefined) {
          formatted.shop_id = String(formatted.shop_id);
        }
        if (formatted.delv_id !== undefined && formatted.delv_id !== null) {
          formatted.delv_id = String(formatted.delv_id);
        }
        if (formatted.delv_boy_id !== undefined && formatted.delv_boy_id !== null) {
          formatted.delv_boy_id = String(formatted.delv_boy_id);
        }
        
        // Parse orderdetails if it's a JSON string
        if (formatted.orderdetails && typeof formatted.orderdetails === 'string') {
          try {
            formatted.orderdetails = JSON.parse(formatted.orderdetails);
          } catch (parseErr) {
            console.error('Error parsing orderdetails:', parseErr);
            // Keep as string if parsing fails
          }
        }
        
        for (let i = 1; i <= 6; i++) {
          const imageField = `image${i}`;
          if (formatted[imageField]) {
            // Check if already a full URL (S3 or external)
            if (formatted[imageField].startsWith('http://') || formatted[imageField].startsWith('https://')) {
              // If it's an S3 URL, convert to presigned URL, otherwise use as-is
              formatted[imageField] = await getImageUrl(formatted[imageField], 'order');
            } else {
              // Local path - prepend base URL (legacy support)
              formatted[imageField] = `${req.protocol}://${req.get('host')}/assets/images/order/${formatted[imageField]}`;
            }
          } else {
            formatted[imageField] = '';
          }
        }
        return formatted;
      }));

      if (formattedOrders.length > 0) {
        res.json({
          status: 'success',
          msg: 'Successfull',
          data: formattedOrders
        });
      } else {
        res.json({
          status: 'success',
          msg: 'Successfull',
          data: 'empty data'
        });
      }
    } catch (err) {
      console.error('Customer orders error:', err);
      res.status(201).json({
        status: 'error',
        msg: 'Failed to fetch orders',
        data: ''
      });
    }
  }

  // Customer pending orders
  static async customerPendingOrders(req, res) {
    try {
      const { customer_id } = req.params;

      if (!customer_id) {
        return res.status(201).json({
          status: 'error',
          msg: 'empty param',
          data: ''
        });
      }

      const orders = await Order.findPendingByCustomerId(customer_id);

      // Format image URLs - use getImageUrl helper to handle S3 URLs properly
      const { getImageUrl } = require('../utils/imageHelper');
      const formattedOrders = await Promise.all(orders.map(async (order) => {
        const formatted = { ...order };
        
        // Convert id fields to strings for frontend compatibility
        if (formatted.id !== undefined) {
          formatted.id = String(formatted.id);
        }
        if (formatted.customer_id !== undefined) {
          formatted.customer_id = String(formatted.customer_id);
        }
        if (formatted.shop_id !== undefined) {
          formatted.shop_id = String(formatted.shop_id);
        }
        if (formatted.delv_id !== undefined && formatted.delv_id !== null) {
          formatted.delv_id = String(formatted.delv_id);
        }
        if (formatted.delv_boy_id !== undefined && formatted.delv_boy_id !== null) {
          formatted.delv_boy_id = String(formatted.delv_boy_id);
        }
        
        // Parse orderdetails if it's a JSON string
        if (formatted.orderdetails && typeof formatted.orderdetails === 'string') {
          try {
            formatted.orderdetails = JSON.parse(formatted.orderdetails);
          } catch (parseErr) {
            console.error('Error parsing orderdetails:', parseErr);
            // Keep as string if parsing fails
          }
        }
        
        for (let i = 1; i <= 6; i++) {
          const imageField = `image${i}`;
          if (formatted[imageField]) {
            // Check if already a full URL (S3 or external)
            if (formatted[imageField].startsWith('http://') || formatted[imageField].startsWith('https://')) {
              // If it's an S3 URL, convert to presigned URL, otherwise use as-is
              formatted[imageField] = await getImageUrl(formatted[imageField], 'order');
            } else {
              // Local path - prepend base URL (legacy support)
              formatted[imageField] = `${req.protocol}://${req.get('host')}/assets/images/order/${formatted[imageField]}`;
            }
          } else {
            formatted[imageField] = '';
          }
        }
        return formatted;
      }));

      if (formattedOrders.length > 0) {
        res.json({
          status: 'success',
          msg: 'Successfull',
          data: formattedOrders
        });
      } else {
        res.json({
          status: 'success',
          msg: 'Successfull',
          data: 'empty data'
        });
      }
    } catch (err) {
      console.error('Customer pending orders error:', err);
      res.status(201).json({
        status: 'error',
        msg: 'Failed to fetch orders',
        data: ''
      });
    }
  }

  // Customer order placing
  static async custOrderPlacing(req, res) {
    try {
      const {
        customer_id, shop_id, orderdetails, customerdetails, shopdetails,
        deliverytype, estim_weight, estim_price, distance, cust_place
      } = req.body;

      // Handle multiple image uploads
      const image1 = req.files?.image1?.[0]?.filename || req.body.image1 || '';
      const image2 = req.files?.image2?.[0]?.filename || req.body.image2 || '';
      const image3 = req.files?.image3?.[0]?.filename || req.body.image3 || '';
      const image4 = req.files?.image4?.[0]?.filename || req.body.image4 || '';
      const image5 = req.files?.image5?.[0]?.filename || req.body.image5 || '';
      const image6 = req.files?.image6?.[0]?.filename || req.body.image6 || '';

      if (!customer_id || !shop_id || !orderdetails || !customerdetails || !shopdetails || !deliverytype) {
        return res.status(201).json({
          status: 'error',
          msg: 'empty param',
          data: ''
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

      const orderData = {
        order_number: orderNumber,
        shop_id: shop_id,
        customer_id: customer_id,
        orderdetails: orderdetails,
        customerdetails: customerdetails,
        shopdetails: shopdetails,
        del_type: deliverytype,
        estim_weight: estim_weight || 0,
        estim_price: estim_price || 0,
        status: 1, // 1 = pending
        address: customerdetails || '',
        date: new Date().toISOString().split('T')[0],
        image1: image1,
        image2: image2,
        image3: image3,
        image4: image4,
        image5: image5,
        image6: image6
      };

      const order = await Order.create(orderData);

      // Invalidate related caches (excluding customer_orders)
      await RedisCache.delete(RedisCache.listKey('shop_orders', { shop_id }));
      await RedisCache.delete(RedisCache.dashboardKey('shop', shop_id));
      await RedisCache.delete(RedisCache.dashboardKey('customer', customer_id));

      // TODO: Send SMS notification
      // TODO: Send FCM notifications to customer and shop

      res.json({
        status: 'success',
        msg: 'Successfull',
        data: order
      });
    } catch (err) {
      console.error('Order placing error:', err);
      
      // Log failed job (DynamoDB doesn't have failed_jobs table)
      try {
        console.error('Failed job:', {
          connection: 'cust_order_placeing',
          queue: 'default',
          payload: req.body,
          exception: err.message,
          timestamp: new Date().toISOString()
        });
      } catch (logErr) {
        console.error('Failed to log failed job:', logErr);
      }

      res.status(201).json({
        status: 'error',
        msg: 'Failed to place order',
        data: err.message
      });
    }
  }

  // Order status change
  static async orderStatusChange(req, res) {
    try {
      const { order_number, order_no, status, delv_id, delv_boy_id, amount, quantity } = req.body;
      const orderNumber = order_number || order_no;

      if (!orderNumber || !status) {
        return res.status(201).json({
          status: 'error',
          msg: 'empty param',
          data: ''
        });
      }

      const orders = await Order.findByOrderNo(orderNumber);
      if (!orders || orders.length === 0) {
        return res.status(201).json({
          status: 'error',
          msg: 'Order not found',
          data: ''
        });
      }

      const delvId = delv_id || delv_boy_id || null;

      // If status is 3 (pickup), set delv_id
      if (status == 3) {
        await Order.updateStatus(orderNumber, status, delvId, amount, quantity);
      } else {
        await Order.updateStatus(orderNumber, status, null, amount, quantity);
      }

      // Invalidate related caches (order status affects dashboard counts)
      const order = orders[0];
      if (order.customer_id) {
        await RedisCache.delete(RedisCache.dashboardKey('customer', order.customer_id));
      }
      if (order.shop_id) {
        await RedisCache.delete(RedisCache.dashboardKey('shop', order.shop_id));
      }
      if (order.delv_id || order.delv_boy_id) {
        const delvBoyId = order.delv_id || order.delv_boy_id;
        await RedisCache.delete(RedisCache.dashboardKey('deliveryboy', delvBoyId));
      }

      res.json({
        status: 'success',
        msg: 'Successfull',
        data: ''
      });
    } catch (err) {
      console.error('Order status change error:', err);
      res.status(201).json({
        status: 'error',
        msg: 'Failed to update status',
        data: ''
      });
    }
  }

  // Customer order rating
  static async custOrderRating(req, res) {
    try {
      const { order_no, shop_id, customer_id, rating, comment } = req.body;

      if (!order_no || !shop_id || !customer_id || !rating) {
        return res.status(201).json({
          status: 'error',
          msg: 'empty param',
          data: ''
        });
      }

      const ratingData = {
        order_no: order_no,
        shop_id: shop_id,
        customer_id: customer_id,
        rating: rating,
        comment: comment || ''
      };

      const orderRating = await OrderRatings.create(ratingData);

      // Invalidate order details cache
      try {
        await RedisCache.delete(RedisCache.orderKey(order_no));
        console.log(`🗑️  Invalidated order cache for order_no: ${order_no}`);
      } catch (redisErr) {
        console.error('Redis cache invalidation error:', redisErr);
      }

      res.json({
        status: 'success',
        msg: 'Rating submitted',
        data: orderRating
      });
    } catch (err) {
      console.error('Order rating error:', err);
      res.status(201).json({
        status: 'error',
        msg: 'Failed to submit rating',
        data: ''
      });
    }
  }
}

module.exports = OrderController;
