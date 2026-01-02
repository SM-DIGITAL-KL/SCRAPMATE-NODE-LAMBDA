const express = require('express');
const router = express.Router();
const multer = require('multer');
const { apiKeyCheck } = require('../middleware/apiKeyMiddleware');
const {
  profileUpload: profileUploadMulter,
  shopImageUpload: shopImageUploadMulter,
  deliveryBoyUpload: deliveryBoyUploadMulter,
  categoryImageUpload: categoryImageUploadMulter,
  orderImageUpload: orderImageUploadMulter
} = require('../utils/fileUpload');
const path = require('path');

// Controllers
const AuthController = require('../controllers/authController');
const ShopController = require('../controllers/shopController');
const ProductController = require('../controllers/productController');
const OrderController = require('../controllers/orderController');
const DeliveryBoyController = require('../controllers/deliveryBoyController');
const UserController = require('../controllers/userController');
const NotificationController = require('../controllers/notificationController');
const UtilityController = require('../controllers/utilityController');
const TestController = require('../controllers/testController');
const WebLoginController = require('../controllers/webLoginController');
const SubcategoryController = require('../controllers/subcategoryController');
const CategoryController = require('../controllers/categoryController');

// Configure multer for different upload paths
const profileUpload = profileUploadMulter.single('profile_photo');
const shopImageUpload = shopImageUploadMulter.single('shop_img');
const categoryImageUpload = categoryImageUploadMulter.single('cat_img');
const deliveryBoyUpload = deliveryBoyUploadMulter.fields([
  { name: 'profile_img', maxCount: 1 },
  { name: 'licence_img_front', maxCount: 1 },
  { name: 'licence_img_back', maxCount: 1 }
]);

// Public route (no API key required)
router.get('/', AuthController.index);

// ==================== REQUEST LOGGING MIDDLEWARE ====================
// Log all incoming requests to track which endpoints are being called
router.use((req, res, next) => {
  const timestamp = new Date().toISOString();
  const method = req.method;
  const path = req.path || req.url;
  const fullUrl = req.originalUrl || req.url;

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`📥 [${timestamp}] ${method} ${fullUrl}`);
  console.log(`   Path: ${path}`);
  console.log(`   Query:`, req.query);
  console.log(`   Params:`, req.params);
  console.log(`   Headers:`, {
    'content-type': req.headers['content-type'] || req.headers['Content-Type'],
    'api-key': req.headers['api-key'] ? '***' : 'missing',
    'user-agent': req.headers['user-agent']?.substring(0, 50)
  });

  // Log body (but limit size for large payloads)
  if (req.body) {
    const bodyStr = JSON.stringify(req.body);
    if (bodyStr.length > 500) {
      console.log(`   Body: ${bodyStr.substring(0, 500)}... (truncated, ${bodyStr.length} chars)`);
    } else {
      console.log(`   Body:`, req.body);
    }
  } else {
    console.log(`   Body: (empty or not parsed)`);
  }

  // Log file upload info
  if (req.file) {
    console.log(`   File: ${req.file.originalname} (${req.file.size} bytes, ${req.file.mimetype})`);
  }
  if (req.files) {
    console.log(`   Files:`, Object.keys(req.files).map(key => `${key}: ${req.files[key].length || 1} file(s)`));
  }

  // Capture original json method to log response
  const originalJson = res.json.bind(res);
  res.json = function (body) {
    const statusCode = res.statusCode;
    console.log(`📤 [${timestamp}] ${method} ${fullUrl} → ${statusCode}`);
    if (body && typeof body === 'object') {
      const responseStr = JSON.stringify(body);
      if (responseStr.length > 500) {
        console.log(`   Response: ${responseStr.substring(0, 500)}... (truncated)`);
      } else {
        console.log(`   Response:`, body);
      }
    }
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    return originalJson(body);
  };

  // Capture original send method
  const originalSend = res.send.bind(res);
  res.send = function (body) {
    const statusCode = res.statusCode;
    console.log(`📤 [${timestamp}] ${method} ${fullUrl} → ${statusCode}`);
    if (typeof body === 'string' && body.length > 500) {
      console.log(`   Response: ${body.substring(0, 500)}... (truncated)`);
    } else {
      console.log(`   Response:`, body);
    }
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    return originalSend(body);
  };

  // Log errors
  const originalStatus = res.status.bind(res);
  res.status = function (code) {
    if (code >= 400) {
      console.log(`⚠️  [${timestamp}] ${method} ${fullUrl} → ERROR ${code}`);
    }
    return originalStatus(code);
  };

  next();
});

// Error logging middleware
router.use((err, req, res, next) => {
  const timestamp = new Date().toISOString();
  console.error('\n❌ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.error(`❌ [${timestamp}] ERROR in ${req.method} ${req.path || req.url}`);
  console.error(`   Error:`, err.message);
  console.error(`   Stack:`, err.stack);
  console.error(`   Body:`, req.body);
  console.error(`   Params:`, req.params);
  console.error(`   Query:`, req.query);
  console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  next(err);
});

// All routes below require API key
router.use(apiKeyCheck);

// ==================== AUTHENTICATION ROUTES ====================
router.get('/login_app/:mob', AuthController.loginApp);
router.post('/login_app', AuthController.loginAppPost); // POST version for Flutter app
router.post('/login', AuthController.login);
router.post('/dologin', WebLoginController.doLogin);
// Handle multer errors gracefully for users_register
router.post('/users_register', (req, res, next) => {
  // Log before multer processes
  console.log('📎 [users_register] Before multer:');
  console.log('   Content-Type:', req.headers['content-type'] || req.headers['Content-Type']);
  console.log('   Body type:', typeof req.body);
  console.log('   Body is Buffer:', Buffer.isBuffer(req.body));
  console.log('   Body length:', req.body ? (typeof req.body === 'string' ? req.body.length : 'not string') : 'no body');

  profileUpload(req, res, (err) => {
    if (err) {
      // Handle multer errors gracefully
      if (err.message === 'Unexpected end of form' || err.code === 'LIMIT_UNEXPECTED_FILE') {
        console.warn('⚠️  [users_register] Multer error (non-critical):', err.message);
        // Continue without file - registration can proceed without profile photo
        req.file = null;
        return next();
      }
      // For other multer errors, return a user-friendly error
      if (err instanceof multer.MulterError) {
        console.error('❌ [users_register] Multer error:', err.message);
        return res.status(400).json({
          status: 'error',
          msg: err.code === 'LIMIT_FILE_SIZE' ? 'File too large (max 10MB)' : 'File upload error',
          data: ''
        });
      }
      // For other errors, pass to error handler
      return next(err);
    }

    // Log after multer processes
    console.log('📎 [users_register] After multer:');
    console.log('   Body type:', typeof req.body);
    console.log('   Body keys:', req.body && typeof req.body === 'object' ? Object.keys(req.body) : 'not an object');
    console.log('   File:', req.file ? `Yes (${req.file.originalname})` : 'No');

    next();
  });
}, AuthController.usersRegister);
router.post('/user_mob_verification', AuthController.userMobVerification);

// ==================== SHOP ROUTES ====================
router.post('/shop_image_upload', shopImageUpload, ShopController.shopImageUpload);
router.get('/shop_image_delete/:id', ShopController.shopImageDelete);
router.get('/shop_image_list/:id', ShopController.shopImageList);
router.get('/shop_cat_list/:id', ShopController.shopCatList);
router.get('/shop_item_list/:shop_id/:cat_id', ProductController.shopItemList);
router.get('/shop_orders/:shop_id', ShopController.shopOrders);
router.get('/shop_orders/:shop_id/:status', ShopController.shopOrders);
router.get('/shop_orders/:shop_id/:status/:offset', ShopController.shopOrders);
router.get('/shop_dash_counts/:id', ShopController.shopDashCounts);
router.get('/shopReviews/:shop_id', ShopController.shopReviews);
router.post('/shops_list_for_sale', ShopController.shopsListForSale);
router.post('/shop_ads_type_edit', ShopController.shopAdsTypeEdit);

// ==================== PRODUCT/CATEGORY ROUTES ====================
router.post('/shop_cat_create', ProductController.shopCatCreate);
router.post('/shop_cat_edit', categoryImageUpload, ProductController.shopCatEdit);
router.get('/shop_cat_delete/:id', ProductController.shopCatDelete);
router.get('/all_pro_category', ProductController.allProCategory);
router.get('/category_img_list', ProductController.categoryImgList);

// Create category (POST)
router.post('/category_img_keywords', (req, res, next) => {
  const timestamp = new Date().toISOString();

  console.log(`\n${'='.repeat(80)}`);
  console.log(`🔌 [POST API] Create Category from Admin Panel`);
  console.log(`${'='.repeat(80)}`);
  console.log(`   Timestamp: ${timestamp}`);
  console.log(`   Endpoint: POST /category_img_keywords`);

  categoryImageUploadMulter.single('category_image')(req, res, (err) => {
    if (err) {
      console.error(`❌ [MULTER ERROR] File upload processing failed!`);
      if (err.message === 'Unexpected end of form' || err.code === 'LIMIT_UNEXPECTED_FILE' || err.message === 'Only image files are allowed!') {
        req.file = null;
        return next();
      }
      if (err instanceof multer.MulterError) {
        return res.status(400).json({
          status: 'error',
          msg: err.code === 'LIMIT_FILE_SIZE' ? 'File too large (max 10MB)' : 'File upload error: ' + err.message,
          data: null
        });
      }
      return next(err);
    }
    next();
  });
}, CategoryController.createCategory);

router.put('/category_img_keywords/:id', (req, res, next) => {
  const timestamp = new Date().toISOString();
  const categoryId = req.params.id;

  console.log(`\n${'='.repeat(80)}`);
  console.log(`🔌 [PUT API] Image Upload from Admin Panel`);
  console.log(`${'='.repeat(80)}`);
  console.log(`   Timestamp: ${timestamp}`);
  console.log(`   Endpoint: PUT /category_img_keywords/:id`);
  console.log(`   Category ID: ${categoryId}`);
  console.log(`   Request URL: ${req.originalUrl || req.url}`);
  console.log(`   Request Method: ${req.method}`);
  console.log(`   Request IP: ${req.ip || req.connection.remoteAddress || 'N/A'}`);

  // Log all headers
  console.log(`\n📋 [REQUEST HEADERS]`);
  console.log(`   Content-Type: ${req.headers['content-type'] || 'not set'}`);
  console.log(`   Content-Length: ${req.headers['content-length'] || 'not set'}`);
  console.log(`   User-Agent: ${req.headers['user-agent'] ? req.headers['user-agent'].substring(0, 80) + '...' : 'N/A'}`);
  console.log(`   API-Key: ${req.headers['api-key'] ? req.headers['api-key'].substring(0, 10) + '...' : 'not set'}`);
  console.log(`   Accept: ${req.headers['accept'] || 'not set'}`);

  // Log query parameters
  if (Object.keys(req.query).length > 0) {
    console.log(`\n🔍 [QUERY PARAMETERS]`);
    Object.keys(req.query).forEach(key => {
      console.log(`   ${key}: ${req.query[key]}`);
    });
  }

  // Log request body (before multer processes it)
  console.log(`\n📦 [REQUEST BODY - BEFORE MULTER]`);
  if (req.body && Object.keys(req.body).length > 0) {
    Object.keys(req.body).forEach(key => {
      const value = req.body[key];
      if (typeof value === 'string' && value.length > 100) {
        console.log(`   ${key}: ${value.substring(0, 100)}... (${value.length} chars)`);
      } else {
        console.log(`   ${key}: ${value || 'empty'}`);
      }
    });
  } else {
    console.log(`   (No body data yet - multer will process it)`);
  }

  console.log(`\n🔄 [MULTER PROCESSING] Starting file upload processing...`);
  console.log(`   Field name expected: category_image`);
  console.log(`   Processing multipart/form-data...`);

  categoryImageUploadMulter.single('category_image')(req, res, (err) => {
    if (err) {
      console.error(`\n${'='.repeat(80)}`);
      console.error(`❌ [MULTER ERROR] File upload processing failed!`);
      console.error(`${'='.repeat(80)}`);
      console.error(`   Category ID: ${categoryId}`);
      console.error(`   Timestamp: ${new Date().toISOString()}`);
      console.error(`   Error Type: ${err.name || 'Unknown'}`);
      console.error(`   Error Code: ${err.code || 'N/A'}`);
      console.error(`   Error Message: ${err.message || 'N/A'}`);
      console.error(`   Error Stack:`, err.stack);

      // Handle multer errors gracefully - allow request to proceed without file
      if (err.message === 'Unexpected end of form' || err.code === 'LIMIT_UNEXPECTED_FILE' || err.message === 'Only image files are allowed!') {
        console.warn(`\n   ⚠️  [NON-CRITICAL ERROR] Continuing without file...`);
        console.warn(`      This error is not critical - request will proceed`);
        console.warn(`      Category can still be updated with URL only`);
        // Continue without file - update can proceed with URL only
        req.file = null;
        return next();
      }
      // For other multer errors, return a user-friendly error
      if (err instanceof multer.MulterError) {
        console.error(`\n   ❌ [CRITICAL MULTER ERROR] Returning 400 status...`);
        console.error(`      Error Code: ${err.code}`);
        if (err.code === 'LIMIT_FILE_SIZE') {
          console.error(`      Issue: File size exceeds 10MB limit`);
        }
        return res.status(400).json({
          status: 'error',
          msg: err.code === 'LIMIT_FILE_SIZE' ? 'File too large (max 10MB)' : 'File upload error: ' + err.message,
          data: null
        });
      }
      // For other errors, pass to error handler
      return next(err);
    }

    // Log request body AFTER multer processing
    console.log(`\n📦 [REQUEST BODY - AFTER MULTER]`);
    if (req.body && Object.keys(req.body).length > 0) {
      Object.keys(req.body).forEach(key => {
        const value = req.body[key];
        if (typeof value === 'string' && value.length > 100) {
          console.log(`   ${key}: ${value.substring(0, 100)}... (${value.length} chars)`);
        } else {
          console.log(`   ${key}: ${value || 'empty'}`);
        }
      });
    } else {
      console.log(`   (No body data)`);
    }

    // Log successful file processing
    if (req.file) {
      console.log(`\n${'='.repeat(80)}`);
      console.log(`✅ [MULTER SUCCESS] File received and processed successfully!`);
      console.log(`${'='.repeat(80)}`);
      console.log(`   Category ID: ${categoryId}`);
      console.log(`   Field name: category_image`);
      console.log(`   File name: ${req.file.originalname}`);
      console.log(`   File size: ${req.file.size} bytes (${(req.file.size / 1024 / 1024).toFixed(2)} MB)`);
      console.log(`   MIME type: ${req.file.mimetype}`);
      console.log(`   Encoding: ${req.file.encoding || 'N/A'}`);
      console.log(`   Has buffer: ${!!req.file.buffer}`);
      console.log(`   Buffer size: ${req.file.buffer ? req.file.buffer.length : 0} bytes`);
      console.log(`   Buffer type: ${req.file.buffer ? req.file.buffer.constructor.name : 'N/A'}`);

      // Additional file validation info
      if (req.file.buffer) {
        const bufferSizeMB = (req.file.buffer.length / 1024 / 1024).toFixed(2);
        console.log(`   Buffer size (MB): ${bufferSizeMB} MB`);
      }

      console.log(`\n   ✅ File is ready for S3 upload`);
      console.log(`   → Passing to CategoryController.updateCategory()\n`);
    } else {
      console.log(`\n${'='.repeat(80)}`);
      console.log(`📝 [MULTER] No file in request`);
      console.log(`${'='.repeat(80)}`);
      console.log(`   Category ID: ${categoryId}`);
      console.log(`   File field: category_image`);
      console.log(`   File received: NO`);
      console.log(`   Will check for URL in request body...`);
      console.log(`   → Passing to CategoryController.updateCategory()\n`);
    }

    console.log(`🚀 [NEXT] Calling CategoryController.updateCategory() now...\n`);

    next();
  });
}, CategoryController.updateCategory);

// Add POST alias for category update (better for multipart/form-data)
router.post('/category_img_keywords/:id', (req, res, next) => {
  const timestamp = new Date().toISOString();
  const categoryId = req.params.id;

  console.log(`\n${'='.repeat(80)}`);
  console.log(`🔌 [POST API] Image Upload from Admin Panel (POST Alias)`);
  console.log(`${'='.repeat(80)}`);
  console.log(`   Timestamp: ${timestamp}`);
  console.log(`   Endpoint: POST /category_img_keywords/:id`);
  console.log(`   Category ID: ${categoryId}`);

  categoryImageUploadMulter.single('category_image')(req, res, (err) => {
    if (err) {
      console.error(`❌ [MULTER ERROR] File upload processing failed!`);
      // Handle multer errors gracefully
      if (err.message === 'Unexpected end of form' || err.code === 'LIMIT_UNEXPECTED_FILE' || err.message === 'Only image files are allowed!') {
        req.file = null;
        return next();
      }
      if (err instanceof multer.MulterError) {
        return res.status(400).json({
          status: 'error',
          msg: err.code === 'LIMIT_FILE_SIZE' ? 'File too large (max 10MB)' : 'File upload error: ' + err.message,
          data: null
        });
      }
      return next(err);
    }
    next();
  });
}, CategoryController.updateCategory);

router.delete('/category_img_keywords/:id', (req, res, next) => {
  const { id } = req.params;
  console.log(`\n🗑️  [DELETE CATEGORY] Request received`);
  console.log(`   Endpoint: DELETE /category_img_keywords/:id`);
  console.log(`   Category ID: ${id}`);
  console.log(`   → Passing to CategoryController.deleteCategory()\n`);
  next();
}, CategoryController.deleteCategory);

router.post('/shop_item_create', ProductController.shopItemCreate);
router.post('/shop_item_edit/:id', ProductController.shopItemEdit);
router.get('/shop_item_delete/:id', ProductController.shopItemDelete);
router.post('/items_list_for_sale', ProductController.itemsListForSale);

// ==================== SUBCATEGORY ROUTES ====================
router.get('/subcategories', SubcategoryController.getAllSubcategories);
router.get('/subcategories/grouped', SubcategoryController.getSubcategoriesGrouped);
router.get('/subcategories/main_category/:mainCategoryId', SubcategoryController.getSubcategoriesByMainCategory);
router.post('/subcategories', (req, res, next) => {
  categoryImageUploadMulter.single('subcategory_image')(req, res, (err) => {
    if (err) {
      // Handle multer errors gracefully - allow request to proceed without file
      if (err.message === 'Unexpected end of form' || err.code === 'LIMIT_UNEXPECTED_FILE' || err.message === 'Only image files are allowed!') {
        console.warn('⚠️  [subcategories] Multer error (non-critical):', err.message);
        // Continue without file - create can proceed without image
        req.file = null;
        return next();
      }
      // For other multer errors, return a user-friendly error
      if (err instanceof multer.MulterError) {
        console.error('❌ [subcategories] Multer error:', err.message);
        return res.status(400).json({
          status: 'error',
          msg: err.code === 'LIMIT_FILE_SIZE' ? 'File too large (max 10MB)' : 'File upload error: ' + err.message,
          data: null
        });
      }
      // For other errors, pass to error handler
      return next(err);
    }
    next();
  });
}, SubcategoryController.createSubcategory);
router.put('/subcategories/:id', (req, res, next) => {
  categoryImageUploadMulter.single('subcategory_image')(req, res, (err) => {
    if (err) {
      // Handle multer errors gracefully - allow request to proceed without file
      if (err.message === 'Unexpected end of form' || err.code === 'LIMIT_UNEXPECTED_FILE' || err.message === 'Only image files are allowed!') {
        console.warn('⚠️  [subcategories] Multer error (non-critical):', err.message);
        // Continue without file - update can proceed with URL only
        req.file = null;
        return next();
      }
      // For other multer errors, return a user-friendly error
      if (err instanceof multer.MulterError) {
        console.error('❌ [subcategories] Multer error:', err.message);
        return res.status(400).json({
          status: 'error',
          msg: err.code === 'LIMIT_FILE_SIZE' ? 'File too large (max 10MB)' : 'File upload error: ' + err.message,
          data: null
        });
      }
      // For other errors, pass to error handler
      return next(err);
    }
    next();
  });
}, SubcategoryController.updateSubcategory);

// Add POST alias for subcategory update (better for multipart/form-data)
router.post('/subcategories/:id', (req, res, next) => {
  categoryImageUploadMulter.single('subcategory_image')(req, res, (err) => {
    if (err) {
      // Handle multer errors gracefully - allow request to proceed without file
      if (err.message === 'Unexpected end of form' || err.code === 'LIMIT_UNEXPECTED_FILE' || err.message === 'Only image files are allowed!') {
        console.warn('⚠️  [subcategories] Multer error (non-critical):', err.message);
        // Continue without file - update can proceed with URL only
        req.file = null;
        return next();
      }
      // For other multer errors, return a user-friendly error
      if (err instanceof multer.MulterError) {
        console.error('❌ [subcategories] Multer error:', err.message);
        return res.status(400).json({
          status: 'error',
          msg: err.code === 'LIMIT_FILE_SIZE' ? 'File too large (max 10MB)' : 'File upload error: ' + err.message,
          data: null
        });
      }
      // For other errors, pass to error handler
      return next(err);
    }
    next();
  });
}, SubcategoryController.updateSubcategory);
router.delete('/subcategories/:id', SubcategoryController.deleteSubcategory);

// ==================== DELIVERY BOY ROUTES ====================
router.post('/delv_boy_add', deliveryBoyUpload, DeliveryBoyController.delvBoyAdd);
router.get('/delivery_boy_list/:id', DeliveryBoyController.deliveryBoyList);
router.post('/delivery_boy_edit', deliveryBoyUpload, DeliveryBoyController.deliveryBoyEdit);
router.get('/delv_boy_delete/:deliveryBoyID/:shop_id', DeliveryBoyController.delvBoyDelete);
router.get('/delv_orders/:delv_boy_id', DeliveryBoyController.delvOrders);
router.get('/delv_completed_orders/:delv_boy_id', DeliveryBoyController.delvCompletedOrders);
router.get('/delv_boy_dash_counts/:id', DeliveryBoyController.delvBoyDashCounts);

// ==================== ORDER ROUTES ====================
router.get('/order_details/:order_no', OrderController.orderDetails);
router.get('/customer_orders/:customer_id', OrderController.customerOrders);
router.get('/customer_pending_orders/:customer_id', OrderController.customerPendingOrders);
router.post('/cust_order_placeing', orderImageUploadMulter.fields([
  { name: 'image1', maxCount: 1 },
  { name: 'image2', maxCount: 1 },
  { name: 'image3', maxCount: 1 },
  { name: 'image4', maxCount: 1 },
  { name: 'image5', maxCount: 1 },
  { name: 'image6', maxCount: 1 }
]), OrderController.custOrderPlacing);
router.post('/order_status_change', OrderController.orderStatusChange);
router.post('/custOrderRating', OrderController.custOrderRating);

// ==================== USER ROUTES ====================
router.get('/users_profile_view/:id', UserController.usersProfileView);
router.get('/get_user_by_name/:name', UserController.getUserByName);
router.post('/user_profile_pic_edit', profileUpload, UserController.userProfilePicEdit);
router.post('/userProEdit', UserController.userProEdit);
router.post('/profile_update', UserController.userProEdit); // Alias for Flutter app
router.get('/cust_dash_counts/:id', UserController.custDashCounts);
router.post('/cust_ads_type_edit', UserController.custAdsTypeEdit);
router.post('/fcm_token_store', UserController.fcmTokenStore);
router.get('/fcmTokenClear/:userid', UserController.fcmTokenClear);

// ==================== NOTIFICATION ROUTES ====================
router.get('/noti_by_id/:id', NotificationController.notiById);
router.get('/noti_by_id/:id/:offset', NotificationController.notiById);
router.post('/notif_read', NotificationController.notifRead);

// ==================== UTILITY ROUTES ====================
router.post('/get_table', UtilityController.getTable);
router.post('/get_table_condition', UtilityController.getTableCondition);
router.get('/count_row/:table_name', UtilityController.countRow);
router.get('/keyword_search/:table/:name', UtilityController.keywordSearch);
router.get('/get_user_by_id/:user_id/:table', UtilityController.getUserById);
router.get('/get_all_tables', UtilityController.getAllTables);
router.post('/savecallLog', UtilityController.savecallLog);
router.post('/savecallLogCust', UtilityController.savecallLogCust);
router.post('/searchShopCallLogSave', UtilityController.searchShopCallLogSave);
router.get('/stateAllow', UtilityController.stateAllow);
router.get('/packagesSub', UtilityController.packagesSub);
router.post('/saveUserPackages', UtilityController.saveUserPackages);
router.post('/paymentHistory', UtilityController.paymentHistory);
router.post('/generatePayUHash', UtilityController.generatePayUHash);
router.get('/thirdPartyCredentials', UtilityController.thirdPartyCredentials);
router.get('/versionCheck/:version', UtilityController.versionCheck);
router.get('/smstesting', UtilityController.smstesting);
router.post('/PermanentDelete', UtilityController.permanentDelete);
router.post('/failedJobs', UtilityController.failedJobs);
router.post('/clear_redis_cache', UtilityController.clearRedisCache);
router.get('/metrics', UtilityController.getMetrics);

// ==================== TEST ROUTES ====================
router.post('/test1', TestController.test1);
router.post('/testformap', TestController.testformap);

module.exports = router;

