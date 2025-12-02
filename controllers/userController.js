const User = require('../models/User');
const Shop = require('../models/Shop');
const Customer = require('../models/Customer');
const DeliveryBoy = require('../models/DeliveryBoy');
const Order = require('../models/Order');
const path = require('path');
const { getFileSize, deleteFile } = require('../utils/fileUpload');
const RedisCache = require('../utils/redisCache');

class UserController {
  // Users profile view
  static async usersProfileView(req, res) {
    try {
      const { id } = req.params;

      console.log(`🔍 users_profile_view called: id=${id}`);

      if (!id) {
        return res.status(201).json({
          status: 'error',
          msg: 'empty param',
          data: ''
        });
      }

      // Ensure id is a string for consistent cache key generation
      const userId = String(id);

      // Check Redis cache first for profile data (only if previously successful)
      const cacheKey = RedisCache.userKey(userId, 'profile');
      const cachedProfile = await RedisCache.get(cacheKey);
      if (cachedProfile) {
        console.log(`⚡ Redis cache hit for profile: ${cacheKey}`);
        return res.json({
          status: 'success',
          msg: 'User Details',
          data: cachedProfile
        });
      }

      console.log(`🔎 Fetching user with id: ${userId}`);
      const user = await User.findById(userId);
   
      if (!user) {
        console.log(`❌ User not found: id=${userId}`);
        return res.status(201).json({
          status: 'error',
          msg: 'User Not Found',
          data: ''
        });
      }

      console.log(`✅ User found: id=${user.id}, user_type=${user.user_type}`);

      let profileData = null;

      if (user.user_type === 'S') {
        console.log(`🔎 Fetching shop data for user_id: ${user.id}`);
        profileData = await Shop.findByUserId(user.id);
        if (profileData) {
          if (profileData.profile_photo) {
            profileData.profile_photo = `${req.protocol}://${req.get('host')}/assets/images/profile/${profileData.profile_photo}`;
          } else {
            profileData.profile_photo = '';
          }
          console.log(`✅ Shop data found for user_id: ${user.id}`);
        } else {
          console.log(`❌ Shop data not found for user_id: ${user.id}`);
        }
      } else if (user.user_type === 'C') {
        console.log(`🔎 Fetching customer data for user_id: ${user.id}`);
        profileData = await Customer.findByUserId(user.id);
        if (profileData) {
          if (profileData.profile_photo) {
            profileData.profile_photo = `${req.protocol}://${req.get('host')}/assets/images/profile/${profileData.profile_photo}`;
          } else {
            profileData.profile_photo = '';
          }
          console.log(`✅ Customer data found for user_id: ${user.id}`);
        } else {
          console.log(`❌ Customer data not found for user_id: ${user.id}`);
        }
      } else if (user.user_type === 'D') {
        console.log(`🔎 Fetching delivery boy data for user_id: ${user.id}`);
        profileData = await DeliveryBoy.findByUserId(user.id);
        if (profileData) {
          if (profileData.profile_img) {
            profileData.profile_img = `${req.protocol}://${req.get('host')}/assets/images/deliveryboy/${profileData.profile_img}`;
          } else {
            profileData.profile_img = '';
          }
          console.log(`✅ Delivery boy data found for user_id: ${user.id}`);
        } else {
          console.log(`❌ Delivery boy data not found for user_id: ${user.id}`);
        }
      } else {
        console.log(`⚠️  Unknown user_type: ${user.user_type} for user_id: ${user.id}`);
      }

      if (!profileData) {
        console.log(`❌ Profile data not found for user_id: ${user.id}, user_type: ${user.user_type}`);
        // For B2B/B2C users without shop data, return basic user info instead of error
        if (user.user_type === 'S' || user.user_type === 'R' || user.user_type === 'SR' || user.user_type === 'N') {
          console.log(`⚠️  User type ${user.user_type} but no shop data - returning basic user info (user may not have completed signup)`);
          const basicProfile = {
            id: user.id,
            name: user.name || '',
            email: user.email || '',
            mob_num: user.mob_num || '',
            user_type: user.user_type,
            app_type: user.app_type || 'vendor_app',
            app_version: user.app_version || 'v1',
            profile_photo: '',
            image: ''
          };
          
          // Cache basic profile too
          try {
            await RedisCache.set(cacheKey, basicProfile, 'short');
            console.log(`💾 Redis cache set for basic profile: ${cacheKey}`);
          } catch (redisErr) {
            console.error('Redis cache error:', redisErr);
          }
          
          return res.json({
            status: 'success',
            msg: 'User Details',
            data: basicProfile
          });
        }
        
        return res.status(201).json({
          status: 'error',
          msg: 'Profile data not found',
          data: ''
        });
      }

      // Cache profile data in Redis only on success (use consistent string format)
      try {
        const cacheKey = RedisCache.userKey(userId, 'profile');
        await RedisCache.set(cacheKey, profileData, '365days');
        console.log(`💾 Redis cache set for profile: ${cacheKey}`);
      } catch (redisErr) {
        console.error('Redis cache error:', redisErr);
        // Continue even if Redis fails
      }

      res.json({
        status: 'success',
        msg: 'User Details',
        data: profileData
      });
    } catch (err) {
      console.error('User profile view error:', err);
      console.error('Error stack:', err.stack);
      
      // Log failed job (DynamoDB doesn't have failed_jobs table)
      try {
        console.error('Failed job:', {
          connection: 'users_profile_view',
          queue: 'default',
          payload: req.params,
          exception: err.message,
          timestamp: new Date().toISOString()
        });
      } catch (logErr) {
        console.error('Failed to log failed job:', logErr);
      }

      res.status(500).json({
        status: 'error',
        msg: 'Server error',
        data: err.message
      });
    }
  }

  // User profile pic edit
  static async userProfilePicEdit(req, res) {
    try {
      const { user_id } = req.body;
      const profileImg = req.file;

      if (!user_id || !profileImg) {
        return res.status(201).json({
          status: 'error',
          msg: 'empty param',
          data: ''
        });
      }

      // Ensure user_id is a string for consistent cache key generation
      const userId = String(user_id);

      const user = await User.findById(userId);
      if (!user) {
        return res.status(201).json({
          status: 'error',
          msg: 'User Not Found',
          data: ''
        });
      }

      const imagePath = path.join(__dirname, '../public/assets/images/profile');
      const filename = profileImg.filename;

      if (user.user_type === 'S') {
        const shop = await Shop.findByUserId(userId);
        if (!shop) {
          return res.status(404).json({
            status: 'error',
            msg: 'Shop not found',
            data: ''
          });
        }

        // Delete old image
        if (shop.profile_photo) {
          deleteFile(path.join(imagePath, shop.profile_photo));
        }

        await Shop.update(shop.id, { profile_photo: filename });

      } else if (user.user_type === 'C') {
        const customer = await Customer.findByUserId(userId);
        if (!customer) {
          return res.status(404).json({
            status: 'error',
            msg: 'Customer not found',
            data: ''
          });
        }

        // Delete old image
        if (customer.profile_photo) {
          deleteFile(path.join(imagePath, customer.profile_photo));
        }

        await Customer.update(customer.id, { profile_photo: filename });
      } else if (user.user_type === 'D') {
        const deliveryBoy = await DeliveryBoy.findByUserId(userId);
        if (!deliveryBoy) {
          return res.status(404).json({
            status: 'error',
            msg: 'Delivery boy not found',
            data: ''
          });
        }

        const deliveryBoyImagePath = path.join(__dirname, '../public/assets/images/deliveryboy');
        
        // Delete old image
        if (deliveryBoy.profile_img) {
          deleteFile(path.join(deliveryBoyImagePath, deliveryBoy.profile_img));
        }

        await DeliveryBoy.update(deliveryBoy.id, { profile_img: filename });
      }

      // Invalidate user profile cache after update (use consistent string format)
      try {
        const profileCacheKey = RedisCache.userKey(userId, 'profile');
        const userCacheKey = RedisCache.userKey(userId);
        
        console.log(`🗑️  Invalidating cache keys: ${profileCacheKey}, ${userCacheKey} for user_id: ${userId}`);
        
        const deleted1 = await RedisCache.delete(profileCacheKey);
        const deleted2 = await RedisCache.delete(userCacheKey);
        
        // Invalidate get_user_by_id cache based on user type
        if (user.user_type === 'S') {
          await RedisCache.delete(RedisCache.listKey('user_by_id', { user_id: userId, table: 'shops' }));
        } else if (user.user_type === 'C') {
          await RedisCache.delete(RedisCache.listKey('user_by_id', { user_id: userId, table: 'customer' }));
        } else if (user.user_type === 'D') {
          await RedisCache.delete(RedisCache.listKey('user_by_id', { user_id: userId, table: 'delivery_boy' }));
        }
        await RedisCache.delete(RedisCache.listKey('user_by_id', { user_id: userId, table: 'users' }));
        
        console.log(`✅ Cache invalidated - Profile: ${deleted1}, User: ${deleted2} for user_id: ${userId}`);
      } catch (redisErr) {
        console.error('Redis cache invalidation error:', redisErr);
        // Continue even if Redis fails
      }

      res.status(200).json({
        status: 'success',
        msg: 'Profile Updated Successfully',
        data: ''
      });
    } catch (err) {
      console.error('User profile pic edit error:', err);
      res.status(201).json({
        status: 'error',
        msg: 'Update failed',
        data: ''
      });
    }
  }

  // User profile edit
  static async userProEdit(req, res) {
    try {
      const { user_id, name, email, address } = req.body;

      if (!user_id) {
        return res.status(201).json({
          status: 'error',
          msg: 'empty param',
          data: ''
        });
      }

      const user = await User.findById(user_id);
      if (!user) {
        return res.status(201).json({
          status: 'error',
          msg: 'empty param',
          data: ''
        });
      }

      // Check email uniqueness if provided
      if (email && email !== user.email) {
        const emailExists = await User.emailExists(email);
        if (emailExists) {
          return res.status(201).json({
            status: 'error',
            msg: 'Email already exists',
            data: ''
          });
        }
      }

      // Store old name for cache invalidation
      const oldName = user.name;
      const userId = String(user_id);

      // Update user
      const userUpdateData = {};
      if (name) userUpdateData.name = name;
      if (email) userUpdateData.email = email;
      await User.updateProfile(userId, userUpdateData);

      // Update profile based on user type
      if (user.user_type === 'S') {
        const shop = await Shop.findByUserId(userId);
        if (shop) {
          const shopUpdateData = {};
          if (name) shopUpdateData.shopname = name;
          if (email) shopUpdateData.email = email;
          if (address) shopUpdateData.address = address;
          await Shop.update(shop.id, shopUpdateData);
        }
      } else if (user.user_type === 'C') {
        const customer = await Customer.findByUserId(userId);
        if (customer) {
          const customerUpdateData = {};
          if (name) customerUpdateData.name = name;
          if (email) customerUpdateData.email = email;
          if (address) customerUpdateData.address = address;
          await Customer.update(customer.id, customerUpdateData);
        }
      } else if (user.user_type === 'D') {
        const deliveryBoy = await DeliveryBoy.findByUserId(userId);
        if (deliveryBoy) {
          const deliveryUpdateData = {};
          if (name) deliveryUpdateData.name = name;
          if (email) deliveryUpdateData.email = email;
          if (address) deliveryUpdateData.address = address;
          await DeliveryBoy.update(deliveryBoy.id, deliveryUpdateData);
        }
      }

      const updatedUser = await User.findById(userId);

      // Invalidate user profile cache after update
      try {
        const profileCacheKey = RedisCache.userKey(userId, 'profile');
        const userCacheKey = RedisCache.userKey(userId);
        
        await RedisCache.delete(profileCacheKey);
        await RedisCache.delete(userCacheKey);
        
        // Invalidate get_user_by_id cache for users table
        await RedisCache.delete(RedisCache.listKey('user_by_id', { user_id: userId, table: 'users' }));
        
        // Invalidate get_user_by_id cache based on user type
        if (user.user_type === 'S') {
          await RedisCache.delete(RedisCache.listKey('user_by_id', { user_id: userId, table: 'shops' }));
        } else if (user.user_type === 'C') {
          await RedisCache.delete(RedisCache.listKey('user_by_id', { user_id: userId, table: 'customer' }));
        } else if (user.user_type === 'D') {
          await RedisCache.delete(RedisCache.listKey('user_by_id', { user_id: userId, table: 'delivery_boy' }));
        }
        
        // Invalidate name-based cache keys if name was changed
        if (name && name !== oldName) {
          // Invalidate old name cache keys
          const oldNameSearchKey = RedisCache.userKey(`name:${oldName}`, 'search');
          const oldNameExactKey = RedisCache.userKey(`name:${oldName}`, 'exact');
          
          // Invalidate new name cache keys (in case they were already cached)
          const newNameSearchKey = RedisCache.userKey(`name:${name}`, 'search');
          const newNameExactKey = RedisCache.userKey(`name:${name}`, 'exact');
          
          console.log(`🗑️  Invalidating name cache keys for name change: ${oldName} -> ${name}`);
          
          await RedisCache.delete(oldNameSearchKey);
          await RedisCache.delete(oldNameExactKey);
          await RedisCache.delete(newNameSearchKey);
          await RedisCache.delete(newNameExactKey);
          
          console.log(`✅ Name cache invalidated for user_id: ${userId}`);
        }
      } catch (redisErr) {
        console.error('Redis cache invalidation error:', redisErr);
        // Continue even if Redis fails
      }

      res.json({
        status: 'success',
        msg: 'Successfull',
        data: updatedUser
      });
    } catch (err) {
      console.error('User profile edit error:', err);
      res.status(201).json({
        status: 'error',
        msg: 'Update failed',
        data: ''
      });
    }
  }

  // Customer dashboard counts
  static async custDashCounts(req, res) {
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
      const cacheKey = RedisCache.dashboardKey('customer', id);
      const cached = await RedisCache.get(cacheKey);
      if (cached) {
        return res.json({
          status: 'success',
          msg: 'Dashboard counts',
          data: cached
        });
      }

      // Get order counts using Order model
      const pendingCount = await Order.getCountByCustomerIdAndStatus(id, 'pending');
      const completedCount = await Order.getCountByCustomerIdAndStatus(id, 'completed');

      const dashboardData = {
        pending_orders: pendingCount,
        completed_orders: completedCount
      };

      // Cache dashboard data in Redis only on success (5 minutes TTL - changes frequently)
      try {
        await RedisCache.set(cacheKey, dashboardData, '365days');
      } catch (redisErr) {
        console.error('Redis cache error:', redisErr);
        // Continue even if Redis fails
      }

      res.json({
        status: 'success',
        msg: 'Dashboard counts',
        data: dashboardData
      });
    } catch (err) {
      console.error('Customer dashboard counts error:', err);
      res.status(201).json({
        status: 'error',
        msg: 'Failed to fetch counts',
        data: ''
      });
    }
  }

  // Customer ads type edit
  static async custAdsTypeEdit(req, res) {
    try {
      console.log('🔍 [custAdsTypeEdit] Request received');
      console.log('   Content-Type:', req.headers['content-type'] || req.headers['Content-Type']);
      console.log('   Raw body:', typeof req.body, req.body);
      console.log('   Body keys:', req.body ? Object.keys(req.body) : 'no body');
      
      // Handle both JSON and form data
      let customer_id, address, building_no, nearby, addres_type, lat_log, landmark;
      
      if (req.body) {
        customer_id = req.body.customer_id || req.body.customerId;
        address = req.body.address;
        building_no = req.body.building_no || req.body.buildingNo;
        nearby = req.body.nearby || req.body.landmark; // Flutter sends 'landmark' but API expects 'nearby'
        addres_type = req.body.addres_type || req.body.addresType || req.body.address_type;
        lat_log = req.body.lat_log || req.body.latLog || req.body.lat_log;
        landmark = req.body.landmark; // Also accept landmark as separate field
      }

      console.log('   Parsed values:');
      console.log('     customer_id:', customer_id);
      console.log('     address:', address);
      console.log('     building_no:', building_no);
      console.log('     nearby/landmark:', nearby || landmark);
      console.log('     addres_type:', addres_type);
      console.log('     lat_log:', lat_log);

      if (!customer_id) {
        console.log('❌ [custAdsTypeEdit] Missing customer_id');
        return res.status(201).json({
          status: 'error',
          msg: 'empty param',
          data: ''
        });
      }

      const customer = await Customer.findById(customer_id);
      if (!customer) {
        return res.status(201).json({
          status: 'error',
          msg: 'Customer not found',
          data: ''
        });
      }

      const updateData = {};
      if (address !== undefined && address !== null && address !== '') updateData.address = address;
      if (building_no !== undefined && building_no !== null && building_no !== '') updateData.building_no = building_no;
      if ((nearby !== undefined && nearby !== null && nearby !== '') || (landmark !== undefined && landmark !== null && landmark !== '')) {
        updateData.nearby = nearby || landmark;
      }
      if (addres_type !== undefined && addres_type !== null && addres_type !== '') updateData.addres_type = addres_type;
      if (lat_log !== undefined && lat_log !== null && lat_log !== '') updateData.lat_log = lat_log;
      
      console.log('   Update data:', updateData);

      await Customer.update(customer_id, updateData);

      const updatedCustomer = await Customer.findById(customer_id);

      // Invalidate user profile cache after customer update
      try {
        const customer = await Customer.findById(customer_id);
        if (customer && customer.user_id) {
          const userId = String(customer.user_id);
          await RedisCache.delete(RedisCache.userKey(userId, 'profile'));
          await RedisCache.delete(RedisCache.userKey(userId));
          await RedisCache.delete(RedisCache.listKey('user_by_id', { user_id: userId, table: 'customer' }));
        }
      } catch (redisErr) {
        console.error('Redis cache invalidation error:', redisErr);
        // Continue even if Redis fails
      }

      res.status(200).json({
        status: 'success',
        msg: 'Successfull',
        data: updatedCustomer
      });
    } catch (err) {
      console.error('Customer ads type edit error:', err);
      res.status(201).json({
        status: 'error',
        msg: 'Update failed',
        data: ''
      });
    }
  }

  // FCM token store
  static async fcmTokenStore(req, res) {
    try {
      const { user_id, fcm_token } = req.body;

      if (!user_id || !fcm_token) {
        return res.status(201).json({
          status: 'error',
          msg: 'empty param',
          data: ''
        });
      }

      await User.updateFcmToken(user_id, fcm_token);
      // Update fcm_token_time using User model
      await User.updateProfile(user_id, { fcm_token_time: Math.floor(Date.now() / 1000) });

      // Invalidate user cache after FCM token update
      try {
        await RedisCache.delete(RedisCache.userKey(user_id));
      } catch (redisErr) {
        console.error('Redis cache invalidation error:', redisErr);
        // Continue even if Redis fails
      }

      res.status(200).json({
        status: 'success',
        msg: 'Added Fcm Token Successfully',
        data: ''
      });
    } catch (err) {
      console.error('FCM token store error:', err);
      res.status(201).json({
        status: 'error',
        msg: 'User Not Found',
        data: ''
      });
    }
  }

  // FCM token clear
  static async fcmTokenClear(req, res) {
    try {
      const { userid } = req.params;

      if (!userid) {
        return res.status(201).json({
          status: 'error',
          msg: 'empty param',
          data: ''
        });
      }

      await User.clearFcmToken(userid);

      // Invalidate user cache after FCM token clear
      try {
        await RedisCache.delete(RedisCache.userKey(userid));
      } catch (redisErr) {
        console.error('Redis cache invalidation error:', redisErr);
        // Continue even if Redis fails
      }

      res.json({
        status: 'success',
        msg: 'Fcm Token Clear Successfully',
        data: ''
      });
    } catch (err) {
      console.error('FCM token clear error:', err);
      res.status(201).json({
        status: 'error',
        msg: 'User Not Found',
        data: ''
      });
    }
  }

  // Create user (legacy route)
  static async createUser(req, res) {
    try {
      const { name, email, mob_num, user_type } = req.body;

      if (!name || !email || !mob_num || !user_type) {
        return res.status(201).json({
          status: 'error',
          msg: 'empty param',
          data: ''
        });
      }

      // Check if email exists
      const emailExists = await User.emailExists(email);
      if (emailExists) {
        return res.status(201).json({
          status: 'error',
          msg: 'Email already exists',
          data: ''
        });
      }

      // Check if mobile exists
      const mobileExists = await User.mobileExists(mob_num);
      if (mobileExists) {
        return res.status(201).json({
          status: 'error',
          msg: 'Mobile number already exists',
          data: ''
        });
      }

      const user = await User.create(name, email, mob_num, user_type);

      res.status(201).json({
        status: 'success',
        msg: 'User created successfully',
        data: user
      });
    } catch (err) {
      console.error('Create user error:', err);
      res.status(201).json({
        status: 'error',
        msg: 'Failed to create user',
        data: ''
      });
    }
  }

  // Get user by ID (legacy route)
  static async getUserById(req, res) {
    try {
      const { id } = req.params;

      if (!id) {
        return res.status(201).json({
          status: 'error',
          msg: 'empty param',
          data: ''
        });
      }

      const user = await User.findById(id);
      if (!user) {
        return res.status(201).json({
          status: 'error',
          msg: 'User not found',
          data: ''
        });
      }

      res.json({
        status: 'success',
        msg: 'User found',
        data: user
      });
    } catch (err) {
      console.error('Get user by ID error:', err);
      res.status(201).json({
        status: 'error',
        msg: 'Failed to fetch user',
        data: ''
      });
    }
  }

  // Get user by name
  static async getUserByName(req, res) {
    try {
      const { name } = req.params;
      const { exact } = req.query; // Optional query param: ?exact=true for exact match

      if (!name) {
        return res.status(201).json({
          status: 'error',
          msg: 'empty param',
          data: ''
        });
      }

      // Check Redis cache first (only if previously successful)
      const cacheKey = RedisCache.userKey(`name:${name}`, exact === 'true' ? 'exact' : 'search');
      const cached = await RedisCache.get(cacheKey);
      if (cached) {
        return res.json({
          status: 'success',
          msg: 'User found',
          data: cached
        });
      }

      let users;

      if (exact === 'true') {
        // Exact name match - returns single user or null
        users = await User.findByName(name);
      } else {
        // Partial name match - returns array of users
        users = await User.searchByName(name, 10);
      }

      if (!users || (Array.isArray(users) && users.length === 0)) {
        return res.status(201).json({
          status: 'error',
          msg: 'User not found',
          data: ''
        });
      }

      // Cache the result only on success (5 minutes TTL for search results)
      try {
        await RedisCache.set(cacheKey, users, '365days');
      } catch (redisErr) {
        console.error('Redis cache error:', redisErr);
        // Continue even if Redis fails
      }

      res.json({
        status: 'success',
        msg: 'User found',
        data: users
      });
    } catch (err) {
      console.error('Get user by name error:', err);
      res.status(201).json({
        status: 'error',
        msg: 'Failed to fetch user',
        data: ''
      });
    }
  }

  // Check user by name (legacy route)
  static async checkUserByName(req, res) {
    try {
      const { name } = req.params;

      if (!name) {
        return res.status(201).json({
          status: 'error',
          msg: 'empty param',
          data: ''
        });
      }

      // Search users by name using User model
      const users = await User.searchByName(name, 10);

      res.json({
        status: 'success',
        msg: 'Users found',
        data: users
      });
    } catch (err) {
      console.error('Check user by name error:', err);
      res.status(201).json({
        status: 'error',
        msg: 'Failed to search users',
        data: ''
      });
    }
  }
}

module.exports = UserController;
