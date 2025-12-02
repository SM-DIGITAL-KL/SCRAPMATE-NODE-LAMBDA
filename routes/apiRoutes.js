const express = require('express');
const router = express.Router();
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
  res.json = function(body) {
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
  res.send = function(body) {
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
  res.status = function(code) {
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
router.post('/users_register', profileUpload, AuthController.usersRegister);
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
router.post('/shop_item_create', ProductController.shopItemCreate);
router.post('/shop_item_edit/:id', ProductController.shopItemEdit);
router.get('/shop_item_delete/:id', ProductController.shopItemDelete);
router.post('/items_list_for_sale', ProductController.itemsListForSale);

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

