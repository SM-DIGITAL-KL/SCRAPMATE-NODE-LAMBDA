const User = require('../models/User');
const Shop = require('../models/Shop');
const Customer = require('../models/Customer');
const DeliveryBoy = require('../models/DeliveryBoy');
const Package = require('../models/Package');
const RedisCache = require('../utils/redisCache');
const { uploadFileToS3 } = require('../utils/fileUpload');
const { getImageUrl } = require('../utils/imageHelper');

class AuthController {
  // Index/Health check
  static async index(req, res) {
    try {
      res.json({
        status: 'success',
        msg: process.env.APP_NAME || 'ScrapMate Server Running',
        data: ''
      });
    } catch (err) {
      res.status(500).json({
        status: 'error',
        msg: 'Server error',
        data: err.message
      });
    }
  }

  // Login with mobile number (OTP based)
  // POST version of loginApp (for Flutter app)
  static async loginAppPost(req, res) {
    try {
      const { mob } = req.body;
      if (!mob) {
        return res.status(201).json({
          status: 'error',
          msg: 'empty param',
          data: ''
        });
      }
      const trimmedMob = mob.trim();
      
      // Reuse the same logic as loginApp
      req.params = { mob: trimmedMob };
      return await AuthController.loginApp(req, res);
    } catch (err) {
      console.error('Login POST error:', err);
      res.status(500).json({
        status: 'error',
        msg: 'Server error',
        data: err.message
      });
    }
  }

  static async loginApp(req, res) {
    try {
      const { mob } = req.params;
      const trimmedMob = mob.trim();

      if (!trimmedMob) {
        return res.status(201).json({
          status: 'error',
          msg: 'empty param',
          data: ''
        });
      }

      const staticOtp = Math.floor(1000 + Math.random() * 9000);
      let finalOtp = staticOtp;

      // Special OTP for test numbers
      if (trimmedMob === '9605056015' || trimmedMob === '7994095833') {
        finalOtp = 4876;
      }

      const checkMob = await User.findByMobile(trimmedMob);
      const data = { static_otp: finalOtp };

      if (checkMob) {
        // Check if user is Admin or User type (not allowed)
        if (checkMob.user_type === 'A' || checkMob.user_type === 'U') {
          return res.json({
            status: 'success',
            msg: 'This number is might be the Admin number',
            data: ''
          });
        }

        // Get user data - already have checkMob, just filter by user_type
        if (checkMob.user_type === 'A' || checkMob.user_type === 'U') {
          return res.json({
            status: 'success',
            msg: 'This number is might be the Admin number',
            data: ''
          });
        }

        // Use the user data from checkMob
        data.user = {
          id: checkMob.id,
          name: checkMob.name,
          email: checkMob.email,
          mob_num: checkMob.mob_num,
          user_type: checkMob.user_type
        };
        data.user.shop_type = null;

        // Get shop/customer/delivery boy specific data
        if (data.user.user_type === 'S') {
          const shop = await Shop.findByUserId(data.user.id);
          if (shop) {
            data.user.shop_type = shop.shop_type;
            data.user.language = shop.language;
          }
        } else if (data.user.user_type === 'C') {
          const customer = await Customer.findByUserId(data.user.id);
          if (customer) {
            data.user.language = customer.language;
          }
        } else {
          const deliveryBoy = await DeliveryBoy.findByUserId(data.user.id);
          if (deliveryBoy) {
            data.user.language = deliveryBoy.language || 'en';
          }
        }

        // TODO: Send OTP via SMS
        // Pushsms.send_otp(trimmedMob, finalOtp);

        return res.json({
          status: 'success',
          msg: 'Mobile number already exists',
          data: data
        });
      } else {
        // New user
        // TODO: Send OTP via SMS
        // Pushsms.send_otp(trimmedMob, finalOtp);

        return res.json({
          status: 'success',
          msg: 'New User',
          data: data
        });
      }
    } catch (err) {
      console.error('Login error:', err);
      res.status(500).json({
        status: 'error',
        msg: 'Server error',
        data: err.message
      });
    }
  }

  // User registration
  static async usersRegister(req, res) {
    try {
      console.log('📝 [usersRegister] Request received');
      console.log('   Content-Type:', req.headers['content-type'] || req.headers['Content-Type']);
      console.log('   Body type:', typeof req.body);
      console.log('   Body is Buffer:', Buffer.isBuffer(req.body));
      console.log('   Body is string:', typeof req.body === 'string');
      console.log('   Body keys:', req.body && typeof req.body === 'object' ? Object.keys(req.body) : 'not an object');
      console.log('   Body value (first 200 chars):', typeof req.body === 'string' ? req.body.substring(0, 200) : JSON.stringify(req.body).substring(0, 200));
      console.log('   File:', req.file ? `Yes (${req.file.originalname})` : 'No');
      
      // If body is a string or Buffer, multer hasn't parsed it yet - this shouldn't happen
      if (typeof req.body === 'string' || Buffer.isBuffer(req.body)) {
        console.error('❌ [usersRegister] Body is still string/Buffer - multer did not parse multipart data!');
        console.error('   This means multer middleware did not run or failed silently');
        return res.status(400).json({
          status: 'error',
          msg: 'Failed to parse form data. Please ensure Content-Type is multipart/form-data',
          data: ''
        });
      }
      
      const {
        language, usertype, shop_type, name, email, place, address,
        location, state, mob_number, pincode, lat_log, place_id
      } = req.body || {};

      console.log('📝 [usersRegister] Parsed fields:');
      console.log('   language:', language);
      console.log('   usertype:', usertype);
      console.log('   shop_type:', shop_type);
      console.log('   name:', name);
      console.log('   email:', email);
      console.log('   place:', place);
      console.log('   address:', address);
      console.log('   location:', location);
      console.log('   state:', state);
      console.log('   mob_number:', mob_number);
      console.log('   pincode:', pincode);
      console.log('   lat_log:', lat_log);
      console.log('   place_id:', place_id);

      // Validate required fields
      // Note: address is optional for customer (C) registration, required for shop (S)
      if (!mob_number || !email || !name || !usertype || !language) {
        console.log('❌ [usersRegister] Missing required fields');
        return res.status(200).json({
          status: 'error',
          msg: 'empty param',
          data: ''
        });
      }
      
      // Address is required for shop registration, optional for customer
      if (usertype === 'S' && !address) {
        console.log('❌ [usersRegister] Address required for shop registration');
        return res.status(200).json({
          status: 'error',
          msg: 'Address is required for shop registration',
          data: ''
        });
      }
      
      // Clean location field - remove "City not selected" placeholder
      const cleanLocation = (location && location !== 'City not selected') ? location : '';

      // Check if email or mobile already exists
      console.log('🔍 Checking if user exists...');
      console.log('   Email:', email);
      console.log('   Mobile:', mob_number);
      console.log('   Mobile type:', typeof mob_number);
      
      const emailExists = await User.emailExists(email);
      const mobileExists = await User.mobileExists(mob_number);
      
      console.log('   Email exists:', emailExists);
      console.log('   Mobile exists:', mobileExists);

      if (emailExists || mobileExists) {
        console.log('⚠️  User already exists, returning existing user data');
        
        // Find the existing user
        let existingUser = null;
        if (emailExists) {
          existingUser = await User.findByEmail(email);
        } else if (mobileExists) {
          const users = await User.findAllByMobile(mob_number);
          existingUser = users && users.length > 0 ? users[0] : null;
        }
        
        if (existingUser) {
          const Shop = require('../models/Shop');
          const Customer = require('../models/Customer');
          
          const userData = {};
          
          if (existingUser.user_type === 'S') {
            // Get shop data
            const shop = await Shop.findByUserId(existingUser.id);
            if (shop) {
              userData.data = shop;
              // Use S3 URL helper - handles both S3 URLs and local paths
              userData.data.profile_photo = await getImageUrl(shop.profile_photo, 'profile');
              userData.user = 'shop';
            } else {
              // Return user data even if shop doesn't exist yet
              userData.data = {
                user_id: existingUser.id,
                email: existingUser.email,
                shopname: existingUser.name,
                contact: existingUser.mob_num,
                profile_photo: ''
              };
              userData.user = 'shop';
            }
          } else {
            // Get customer data
            const customer = await Customer.findByUserId(existingUser.id);
            if (customer) {
              userData.data = customer;
              // Use S3 URL helper - handles both S3 URLs and local paths
              userData.data.profile_photo = await getImageUrl(customer.profile_photo, 'profile');
              userData.user = 'customer';
            } else {
              // Return user data even if customer doesn't exist yet
              userData.data = {
                user_id: existingUser.id,
                email: existingUser.email,
                name: existingUser.name,
                mob_num: existingUser.mob_num,
                profile_photo: ''
              };
              userData.user = 'customer';
            }
          }
          
          console.log('✅ Returning existing user data:', { user_type: existingUser.user_type, user_id: existingUser.id });
          
          return res.status(200).json({
            status: 'success',
            msg: 'User already exists',
            data: userData
          });
        } else {
          // Shouldn't happen, but handle gracefully
          console.log('❌ User exists check passed but user not found');
          return res.status(200).json({
            status: 'error',
            msg: emailExists ? 'Email already exists' : 'Mobile number already exists',
            data: ''
          });
        }
      }
      
      console.log('✅ User does not exist, proceeding with registration');

      // Handle profile photo upload to S3
      let profilePhoto = '';
      if (req.file) {
        try {
          const s3Result = await uploadFileToS3(req.file, 'profile');
          profilePhoto = s3Result.s3Url; // Store S3 URL instead of filename
        } catch (err) {
          console.error('Error uploading profile photo to S3:', err);
          // Continue without photo if upload fails
        }
      }

      // Create user
      const user = await User.create(name, email, mob_number, usertype);

      // Set package for shop users
      if (usertype === 'S') {
        await Package.setPackage(user.id);
      }

      const userData = {};

      if (usertype === 'S') {
        // Create shop
        const shopData = {
          user_id: user.id,
          email: email,
          shopname: name,
          contact: mob_number,
          address: address,
          location: cleanLocation,
          state: state || '',
          place: place || '',
          language: language,
          profile_photo: profilePhoto,
          shop_type: shop_type || '',
          pincode: pincode || '',
          lat_log: lat_log || '',
          place_id: place_id || ''
        };

        // Check for duplicate shops with the same contact number (excluding current user)
        if (shopData.contact) {
          const existingShops = await Shop.findByContact(shopData.contact, user.id);
          if (existingShops.length > 0) {
            const errorMsg = `A shop with contact number ${shopData.contact} already exists. Please use your existing shop account or contact support.`;
            console.error(`❌ [usersRegister] Duplicate shop detected:`, {
              contact: shopData.contact,
              existingShops: existingShops.map(s => ({ id: s.id, user_id: s.user_id, shopname: s.shopname }))
            });
            return res.status(400).json({
              success: false,
              message: errorMsg
            });
          }
        }

        const shop = await Shop.create(shopData);
        const shopDetails = await Shop.findById(shop.id);

        if (shopDetails) {
          userData.data = shopDetails;
          // Use S3 URL helper - handles both S3 URLs and local paths
          userData.data.profile_photo = await getImageUrl(shopDetails.profile_photo, 'profile');
        }
        userData.user = 'shop';
      } else {
        // Create customer
        const customerData = {
          user_id: user.id,
          email: email,
          name: name,
          contact: mob_number,
          address: address || '',
          location: cleanLocation,
          state: state || '',
          place: place || '',
          language: language,
          profile_photo: profilePhoto,
          pincode: pincode || '',
          lat_log: lat_log || '',
          place_id: place_id || ''
        };
        
        console.log('📝 [usersRegister] Creating customer with data:', customerData);

        const customer = await Customer.create(customerData);
        const customerDetails = await Customer.findById(customer.id);

        if (customerDetails) {
          userData.data = customerDetails;
          // Use S3 URL helper - handles both S3 URLs and local paths
          userData.data.profile_photo = await getImageUrl(customerDetails.profile_photo, 'profile');
        }
        userData.user = 'customer';
      }

      // Invalidate keyword search cache for the new user's name (if it exists)
      try {
        if (name) {
          await RedisCache.delete(RedisCache.listKey('keyword_search', { table: 'users', name }));
          // Also invalidate for shops/customers tables if applicable
          if (usertype === 'S') {
            await RedisCache.delete(RedisCache.listKey('keyword_search', { table: 'shops', name }));
          } else {
            await RedisCache.delete(RedisCache.listKey('keyword_search', { table: 'customer', name }));
          }
        }
      } catch (redisErr) {
        console.error('Redis cache invalidation error:', redisErr);
        // Continue even if Redis fails
      }

      return res.json({
        status: 'success',
        msg: 'User Add Successfully',
        data: userData
      });
    } catch (err) {
      console.error('Registration error:', err);
      
      // Log failed job (DynamoDB doesn't have failed_jobs table - log to console/file instead)
      try {
        console.error('Failed job:', {
          connection: 'users_register',
          queue: 'default',
          payload: req.body,
          exception: err.message,
          timestamp: new Date().toISOString()
        });
        // TODO: If you need to store failed jobs, create a FailedJob model and table
      } catch (logErr) {
        console.error('Failed to log failed job:', logErr);
      }

      res.status(500).json({
        status: 'error',
        msg: 'Server Error',
        data: err.message
      });
    }
  }

  // Mobile verification
  static async userMobVerification(req, res) {
    try {
      const { user_id, status } = req.body;

      if (!user_id || !status) {
        return res.status(201).json({
          status: 'error',
          msg: 'empty param',
          data: ''
        });
      }

      // Update user mobile verification status using User model
      await User.updateProfile(user_id, { mob_verified_status: status });

      // Invalidate user cache after mobile verification update
      try {
        await RedisCache.delete(RedisCache.userKey(user_id, 'profile'));
        await RedisCache.delete(RedisCache.userKey(user_id));
      } catch (redisErr) {
        console.error('Redis cache invalidation error:', redisErr);
        // Continue even if Redis fails
      }

      res.json({
        status: 'success',
        msg: 'Verified Successfully',
        data: ''
      });
    } catch (err) {
      res.status(201).json({
        status: 'error',
        msg: 'User Not Found',
        data: ''
      });
    }
  }

  // Register user (legacy route - uses JWT)
  static async register(req, res) {
    try {
      const { name, email, password } = req.body;

      if (!name || !email || !password) {
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

      // Create user with password
      const user = await User.create(name, email, null, 'C', password);

      // Generate JWT token
      const jwt = require('jsonwebtoken');
      const jwtSecret = process.env.JWT_SECRET || 'your-secret-key';
      const expiresIn = process.env.JWT_EXPIRES_IN || '24h';
      
      const token = jwt.sign(
        { id: user.id, email: user.email },
        jwtSecret,
        { expiresIn }
      );

      res.status(201).json({
        status: 'success',
        msg: 'User registered successfully',
        token: token,
        data: user
      });
    } catch (err) {
      console.error('Register error:', err);
      res.status(201).json({
        status: 'error',
        msg: 'Failed to register user',
        data: ''
      });
    }
  }

  // Login user (legacy route - uses JWT)
  static async login(req, res) {
    try {
      const { email, password } = req.body;

      if (!email || !password) {
        return res.status(201).json({
          status: 'error',
          msg: 'empty param',
          data: ''
        });
      }

      const user = await User.findByEmail(email);
      if (!user) {
        return res.status(201).json({
          status: 'error',
          msg: 'Invalid credentials',
          data: ''
        });
      }

      // Verify password
      const bcrypt = require('bcryptjs');
      const isValidPassword = await bcrypt.compare(password, user.password);
      if (!isValidPassword) {
        return res.status(201).json({
          status: 'error',
          msg: 'Invalid credentials',
          data: ''
        });
      }

      // Generate JWT token
      const jwt = require('jsonwebtoken');
      const jwtSecret = process.env.JWT_SECRET || 'your-secret-key';
      const expiresIn = process.env.JWT_EXPIRES_IN || '24h';
      
      const token = jwt.sign(
        { id: user.id, email: user.email },
        jwtSecret,
        { expiresIn }
      );

      res.json({
        status: 'success',
        msg: 'Login successful',
        token: token,
        data: user
      });
    } catch (err) {
      console.error('Login error:', err);
      res.status(201).json({
        status: 'error',
        msg: 'Failed to login',
        data: ''
      });
    }
  }

  // Get profile (legacy route - uses JWT)
  static async getProfile(req, res) {
    try {
      // User is attached to req by authenticateToken middleware
      const userId = req.user.id;

      const user = await User.findById(userId);
      if (!user) {
        return res.status(201).json({
          status: 'error',
          msg: 'User not found',
          data: ''
        });
      }

      res.json({
        status: 'success',
        msg: 'Profile retrieved',
        data: user
      });
    } catch (err) {
      console.error('Get profile error:', err);
      res.status(201).json({
        status: 'error',
        msg: 'Failed to fetch profile',
        data: ''
      });
    }
  }
}

module.exports = AuthController;
