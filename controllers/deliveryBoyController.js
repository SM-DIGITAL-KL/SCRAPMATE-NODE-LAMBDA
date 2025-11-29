const DeliveryBoy = require('../models/DeliveryBoy');
const Order = require('../models/Order');
const User = require('../models/User');
const path = require('path');
const fs = require('fs');
const { getFileSize, deleteFile } = require('../utils/fileUpload');
const RedisCache = require('../utils/redisCache');

class DeliveryBoyController {
  // Delivery boy add
  static async delvBoyAdd(req, res) {
    try {
      const {
        shop_id, user_type, name, dob, age, email, phone,
        address, licence_no
      } = req.body;

      const profileImg = req.files?.profile_img?.[0];
      const licenceImgFront = req.files?.licence_img_front?.[0];
      const licenceImgBack = req.files?.licence_img_back?.[0];

      if (!shop_id || !user_type || !name || !dob || !age || !email || !phone || !address) {
        return res.status(201).json({
          status: 'error',
          msg: 'empty param',
          data: ''
        });
      }

      // Check if email or phone already exists
      const emailExists = await User.emailExists(email);
      const mobileExists = await User.mobileExists(phone);

      if (emailExists) {
        return res.status(200).json({
          status: 'error',
          msg: 'Email already exists',
          data: ''
        });
      }

      if (mobileExists) {
        return res.status(200).json({
          status: 'error',
          msg: 'Mobile number already exists',
          data: ''
        });
      }

      // Handle file uploads
      let profileImgName = '';
      let fileSize = '';
      if (profileImg) {
        profileImgName = profileImg.filename;
        const filePath = path.join(__dirname, '../public/assets/images/deliveryboy', profileImgName);
        fileSize = getFileSize(filePath);
      }

      let licenceImgFrontName = '';
      if (licenceImgFront) {
        licenceImgFrontName = licenceImgFront.filename;
      }

      let licenceImgBackName = '';
      if (licenceImgBack) {
        licenceImgBackName = licenceImgBack.filename;
      }

      // Create user
      const user = await User.create(name, email, phone, user_type);

      // Create delivery boy
      const deliveryBoyData = {
        user_id: user.id,
        shop_id: shop_id,
        name: name,
        dob: dob,
        age: age,
        email: email,
        phone: phone,
        address: address,
        licence_no: licence_no || '',
        licence_img_front: licenceImgFrontName,
        licence_img_back: licenceImgBackName,
        profile_img: profileImgName,
        filesize: fileSize
      };

      const deliveryBoy = await DeliveryBoy.create(deliveryBoyData);
      const deliveryBoyDetails = await DeliveryBoy.findById(deliveryBoy.id);

      // Format image URLs
      if (deliveryBoyDetails) {
        deliveryBoyDetails.profile_img = deliveryBoyDetails.profile_img
          ? `${req.protocol}://${req.get('host')}/assets/images/deliveryboy/${deliveryBoyDetails.profile_img}`
          : '';
        deliveryBoyDetails.licence_img_front = deliveryBoyDetails.licence_img_front
          ? `${req.protocol}://${req.get('host')}/assets/images/deliveryboy/${deliveryBoyDetails.licence_img_front}`
          : '';
        deliveryBoyDetails.licence_img_back = deliveryBoyDetails.licence_img_back
          ? `${req.protocol}://${req.get('host')}/assets/images/deliveryboy/${deliveryBoyDetails.licence_img_back}`
          : '';
      }

      // Invalidate delivery boy list cache
      try {
        await RedisCache.delete(RedisCache.listKey('delivery_boys', { shop_id }));
        if (user.id) {
          await RedisCache.delete(RedisCache.userKey(user.id, 'profile'));
          await RedisCache.delete(RedisCache.userKey(user.id));
        }
        console.log(`🗑️  Invalidated delivery boy cache for shop_id: ${shop_id}`);
      } catch (redisErr) {
        console.error('Redis cache invalidation error:', redisErr);
      }

      res.json({
        status: 'success',
        msg: 'User Add Successfully',
        data: { data: deliveryBoyDetails }
      });
    } catch (err) {
      console.error('Delivery boy add error:', err);
      res.status(201).json({
        status: 'error',
        msg: 'Failed to add delivery boy',
        data: ''
      });
    }
  }

  // Delivery boy list
  static async deliveryBoyList(req, res) {
    try {
      const { id } = req.params;

      console.log(`🔍 delivery_boy_list called: shop_id=${id}`);

      if (!id) {
        return res.status(201).json({
          status: 'error',
          msg: 'empty param',
          data: ''
        });
      }

      // Check Redis cache first (only if previously successful)
      const cacheKey = RedisCache.listKey('delivery_boys', { shop_id: id });
      const cached = await RedisCache.get(cacheKey);
      if (cached) {
        console.log(`⚡ Redis cache hit for delivery boys: ${cacheKey}`);
        return res.json({
          status: 'success',
          msg: 'Successfull',
          data: cached
        });
      }

      console.log(`🔎 Fetching delivery boys for shop_id: ${id} (type: ${typeof id})`);
      const deliveryBoys = await DeliveryBoy.findByShopId(id);
      console.log(`✅ Found ${deliveryBoys.length} delivery boy(s) for shop_id: ${id}`);
      
      // Debug: log first item's shop_id if found
      if (deliveryBoys.length > 0) {
        console.log(`   First delivery boy shop_id: ${deliveryBoys[0].shop_id} (type: ${typeof deliveryBoys[0].shop_id})`);
      } else {
        console.log(`   ⚠️  No delivery boys found. Checking all items in table...`);
        // Debug: scan all items to see what shop_ids exist
        try {
          const client = require('../config/dynamodb').getDynamoDBClient();
          const { ScanCommand } = require('@aws-sdk/lib-dynamodb');
          const debugCommand = new ScanCommand({
            TableName: 'delivery_boy',
            Limit: 10
          });
          const debugResponse = await client.send(debugCommand);
          if (debugResponse.Items && debugResponse.Items.length > 0) {
            console.log(`   Sample shop_ids in table:`, debugResponse.Items.map(item => ({
              id: item.id,
              shop_id: item.shop_id,
              shop_id_type: typeof item.shop_id
            })));
          }
        } catch (debugErr) {
          console.error('   Debug scan error:', debugErr);
        }
      }

      if (deliveryBoys.length === 0) {
        console.log(`❌ No delivery boys found for shop_id: ${id}`);
        return res.status(201).json({
          status: 'error',
          msg: 'Delivery boy Not Found',
          data: ''
        });
      }

      const formattedList = deliveryBoys.map(db => ({
        ...db,
        profile_img: db.profile_img
          ? `${req.protocol}://${req.get('host')}/assets/images/deliveryboy/${db.profile_img}`
          : '',
        licence_img_front: db.licence_img_front
          ? `${req.protocol}://${req.get('host')}/assets/images/deliveryboy/${db.licence_img_front}`
          : '',
        licence_img_back: db.licence_img_back
          ? `${req.protocol}://${req.get('host')}/assets/images/deliveryboy/${db.licence_img_back}`
          : ''
      }));

      // Cache the result only on success (1 hour TTL)
      try {
        await RedisCache.set(cacheKey, formattedList, '365days');
        console.log(`💾 Redis cache set for delivery boys: ${cacheKey}`);
      } catch (redisErr) {
        console.error('Redis cache error:', redisErr);
        // Continue even if Redis fails
      }

      res.json({
        status: 'success',
        msg: 'Delivery boy List',
        data: formattedList
      });
    } catch (err) {
      console.error('Delivery boy list error:', err);
      console.error('Error stack:', err.stack);
      res.status(201).json({
        status: 'error',
        msg: `Failed to fetch delivery boys: ${err.message}`,
        data: ''
      });
    }
  }

  // Delivery boy edit
  static async deliveryBoyEdit(req, res) {
    try {
      const {
        delivery_boy_id, name, dob, age, email, phone,
        address, licence_no
      } = req.body;

      const profileImg = req.files?.profile_img?.[0];
      const licenceImgFront = req.files?.licence_img_front?.[0];
      const licenceImgBack = req.files?.licence_img_back?.[0];

      if (!delivery_boy_id) {
        return res.status(201).json({
          status: 'error',
          msg: 'empty param',
          data: ''
        });
      }

      const deliveryBoy = await DeliveryBoy.findById(delivery_boy_id);
      if (!deliveryBoy) {
        return res.status(201).json({
          status: 'error',
          msg: 'Delivery boy not found',
          data: ''
        });
      }

      const updateData = {};
      if (name) updateData.name = name;
      if (dob) updateData.dob = dob;
      if (age) updateData.age = age;
      if (email) updateData.email = email;
      if (phone) updateData.phone = phone;
      if (address) updateData.address = address;
      if (licence_no) updateData.licence_no = licence_no;

      // Handle profile image
      if (profileImg) {
        if (deliveryBoy.profile_img) {
          const oldImagePath = path.join(__dirname, '../public/assets/images/deliveryboy', deliveryBoy.profile_img);
          deleteFile(oldImagePath);
        }
        updateData.profile_img = profileImg.filename;
        const filePath = path.join(__dirname, '../public/assets/images/deliveryboy', profileImg.filename);
        updateData.filesize = getFileSize(filePath);
      }

      // Handle licence images
      if (licenceImgFront) {
        if (deliveryBoy.licence_img_front) {
          const oldImagePath = path.join(__dirname, '../public/assets/images/deliveryboy', deliveryBoy.licence_img_front);
          deleteFile(oldImagePath);
        }
        updateData.licence_img_front = licenceImgFront.filename;
      }

      if (licenceImgBack) {
        if (deliveryBoy.licence_img_back) {
          const oldImagePath = path.join(__dirname, '../public/assets/images/deliveryboy', deliveryBoy.licence_img_back);
          deleteFile(oldImagePath);
        }
        updateData.licence_img_back = licenceImgBack.filename;
      }

      await DeliveryBoy.update(delivery_boy_id, updateData);

      // Invalidate user profile cache after delivery boy update
      try {
        const updatedDeliveryBoy = await DeliveryBoy.findById(delivery_boy_id);
        if (updatedDeliveryBoy && updatedDeliveryBoy.user_id) {
          const userId = String(updatedDeliveryBoy.user_id);
          await RedisCache.delete(RedisCache.userKey(userId, 'profile'));
          await RedisCache.delete(RedisCache.userKey(userId));
          await RedisCache.delete(RedisCache.listKey('user_by_id', { user_id: userId, table: 'delivery_boy' }));
        }
      } catch (redisErr) {
        console.error('Redis cache invalidation error:', redisErr);
        // Continue even if Redis fails
      }

      res.json({
        status: 'success',
        msg: 'Delivery boy updated',
        data: ''
      });
    } catch (err) {
      console.error('Delivery boy edit error:', err);
      res.status(201).json({
        status: 'error',
        msg: 'Update failed',
        data: ''
      });
    }
  }

  // Delivery boy delete
  static async delvBoyDelete(req, res) {
    try {
      const { deliveryBoyID, shop_id } = req.params;

      if (!deliveryBoyID || !shop_id) {
        return res.status(201).json({
          status: 'error',
          msg: 'empty param',
          data: ''
        });
      }

      const delivery = await DeliveryBoy.findById(deliveryBoyID);
      if (!delivery || delivery.shop_id != shop_id) {
        return res.status(201).json({
          status: 'error',
          msg: 'delivery boy Not Found',
          data: ''
        });
      }

      // Delete images
      const imagePath = path.join(__dirname, '../public/assets/images/deliveryboy');
      if (delivery.profile_img) {
        deleteFile(path.join(imagePath, delivery.profile_img));
      }
      if (delivery.licence_img_front) {
        deleteFile(path.join(imagePath, delivery.licence_img_front));
      }
      if (delivery.licence_img_back) {
        deleteFile(path.join(imagePath, delivery.licence_img_back));
      }

      // TODO: Delete user - User model doesn't have delete method yet
      // For now, just delete the delivery boy record

      // Delete delivery boy
      await DeliveryBoy.delete(deliveryBoyID, shop_id);

      // Invalidate delivery boy and user cache
      try {
        await RedisCache.delete(RedisCache.listKey('delivery_boys', { shop_id }));
        await RedisCache.delete(RedisCache.deliveryBoyKey(deliveryBoyID));
        if (delivery.user_id) {
          await RedisCache.delete(RedisCache.userKey(delivery.user_id, 'profile'));
          await RedisCache.delete(RedisCache.userKey(delivery.user_id));
        }
        console.log(`🗑️  Invalidated delivery boy cache for deliveryBoyID: ${deliveryBoyID}`);
      } catch (redisErr) {
        console.error('Redis cache invalidation error:', redisErr);
      }

      res.json({
        status: 'success',
        msg: 'Delete Successfully',
        data: ''
      });
    } catch (err) {
      console.error('Delivery boy delete error:', err);
      res.status(201).json({
        status: 'error',
        msg: 'Delete failed',
        data: ''
      });
    }
  }

  // Delivery orders
  static async delvOrders(req, res) {
    try {
      const { delv_boy_id } = req.params;

      if (!delv_boy_id) {
        return res.status(201).json({
          status: 'error',
          msg: 'empty param',
          data: ''
        });
      }

      // Check Redis cache first (only if previously successful)
      const cacheKey = RedisCache.listKey('delivery_orders', { delv_boy_id });
      const cached = await RedisCache.get(cacheKey);
      if (cached) {
        return res.json({
          status: 'success',
          msg: 'Successfull',
          data: cached
        });
      }

      const orders = await Order.findByDeliveryBoyId(delv_boy_id);

      // Format image URLs - use getImageUrl helper to handle S3 URLs properly
      const { getImageUrl } = require('../utils/imageHelper');
      const formattedOrders = await Promise.all(orders.map(async (order) => {
        const formatted = { ...order };
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

      // Cache the result only on success (2 minutes TTL - changes frequently)
      try {
        const dataToCache = formattedOrders.length > 0 ? formattedOrders : 'empty data';
        await RedisCache.set(cacheKey, dataToCache, '365days');
        console.log(`💾 Redis cache set for delivery orders: ${cacheKey}`);
      } catch (redisErr) {
        console.error('Redis cache error:', redisErr);
        // Continue even if Redis fails
      }

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
      console.error('Delivery orders error:', err);
      res.status(201).json({
        status: 'error',
        msg: 'Failed to fetch orders',
        data: ''
      });
    }
  }

  // Delivery completed orders
  static async delvCompletedOrders(req, res) {
    try {
      const { delv_boy_id } = req.params;

      if (!delv_boy_id) {
        return res.status(201).json({
          status: 'error',
          msg: 'empty param',
          data: ''
        });
      }

      // Check Redis cache first (only if previously successful)
      const cacheKey = RedisCache.listKey('delivery_completed_orders', { delv_boy_id });
      const cached = await RedisCache.get(cacheKey);
      if (cached) {
        return res.json({
          status: 'success',
          msg: 'Successfull',
          data: cached
        });
      }

      const orders = await Order.findCompletedByDeliveryBoyId(delv_boy_id);

      // Format image URLs
      const formattedOrders = orders.map(order => {
        const formatted = { ...order };
        for (let i = 1; i <= 6; i++) {
          const imageField = `image${i}`;
          if (formatted[imageField]) {
            formatted[imageField] = `${req.protocol}://${req.get('host')}/assets/images/order/${formatted[imageField]}`;
          } else {
            formatted[imageField] = '';
          }
        }
        return formatted;
      });

      // Cache the result only on success (2 minutes TTL - changes frequently)
      try {
        const dataToCache = formattedOrders.length > 0 ? formattedOrders : 'empty data';
        await RedisCache.set(cacheKey, dataToCache, '365days');
        console.log(`💾 Redis cache set for delivery completed orders: ${cacheKey}`);
      } catch (redisErr) {
        console.error('Redis cache error:', redisErr);
        // Continue even if Redis fails
      }

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
      console.error('Completed orders error:', err);
      res.status(201).json({
        status: 'error',
        msg: 'Failed to fetch orders',
        data: ''
      });
    }
  }

  // Delivery boy dashboard counts
  static async delvBoyDashCounts(req, res) {
    try {
      const { id } = req.params;

      if (!id) {
        return res.status(201).json({
          status: 'error',
          msg: 'empty param',
          data: ''
        });
      }

      // Check Redis cache first (only if previously successful)
      const cacheKey = RedisCache.dashboardKey('deliveryboy', id);
      const cached = await RedisCache.get(cacheKey);
      if (cached) {
        return res.json({
          status: 'success',
          msg: 'Successfull',
          data: cached
        });
      }

      // Use model methods for counts
      const totalOrders = await Order.getCountByDeliveryBoyId(id);
      const pendingOrders = await Order.getCountByDeliveryBoyIdAndStatus(id, 3);
      const completedOrders = await Order.getCountByDeliveryBoyIdAndStatus(id, 4);
      const totalAmount = await Order.getSumEstimPriceByDeliveryBoyId(id);

      const data = {
        total_order_count: totalOrders,
        total_pending_order_count: pendingOrders,
        total_completed_order_count: completedOrders,
        toatal_order_estimated_amount: totalAmount
      };

      // Cache the result only on success (5 minutes TTL - dashboard data changes frequently)
      try {
        await RedisCache.set(cacheKey, data, '365days');
        console.log(`💾 Redis cache set for delivery boy dashboard: ${cacheKey}`);
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
      console.error('Delivery boy dashboard counts error:', err);
      res.status(201).json({
        status: 'error',
        msg: 'Failed to fetch counts',
        data: ''
      });
    }
  }
}

module.exports = DeliveryBoyController;

