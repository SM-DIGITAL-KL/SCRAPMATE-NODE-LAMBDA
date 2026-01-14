const express = require('express');
const router = express.Router();
const { apiKeyCheck } = require('../middleware/apiKeyMiddleware');
const ShopTypeController = require('../controllers/shopTypeController');
const V2AuthController = require('../controllers/v2AuthController');
const V2ProfileController = require('../controllers/v2ProfileController');
const V2B2BSignupController = require('../controllers/v2B2BSignupController');
const V2SubscriptionPackageController = require('../controllers/v2SubscriptionPackageController');
const V2CategoryController = require('../controllers/v2CategoryController');
const V2RecyclingController = require('../controllers/v2RecyclingController');
const V2EarningsController = require('../controllers/v2EarningsController');
const V2OrderController = require('../controllers/v2OrderController');
const V2NotificationController = require('../controllers/v2NotificationController');
const V2BulkScrapController = require('../controllers/v2BulkScrapController');
const V2BulkSellController = require('../controllers/v2BulkSellController');
const V2FoodWasteController = require('../controllers/v2FoodWasteController');
const V2InstamojoOrderController = require('../controllers/v2InstamojoOrderController');
const V2BulkMessageController = require('../controllers/v2BulkMessageController');
const SubcategoryController = require('../controllers/subcategoryController');
const UtilityController = require('../controllers/utilityController');
const SitePanelController = require('../controllers/sitePanelController');
let V2AddressController;
try {
  V2AddressController = require('../controllers/v2AddressController');
  console.log('✅ V2AddressController loaded successfully');
} catch (error) {
  console.error('❌ Failed to load V2AddressController:', error);
  console.error('   Error stack:', error.stack);
  // Create a dummy controller to prevent app crash
  V2AddressController = {
    saveAddress: (req, res) => {
      console.error('V2AddressController not loaded - this should not happen');
      return res.status(500).json({
        status: 'error',
        msg: 'Address controller not available. Check server logs.'
      });
    },
    getCustomerAddresses: (req, res) => {
      return res.status(500).json({
        status: 'error',
        msg: 'Address controller not available. Check server logs.'
      });
    },
    updateAddress: (req, res) => {
      return res.status(500).json({
        status: 'error',
        msg: 'Address controller not available. Check server logs.'
      });
    },
    deleteAddress: (req, res) => {
      return res.status(500).json({
        status: 'error',
        msg: 'Address controller not available. Check server logs.'
      });
    }
  };
}
const { profileUpload, documentUpload, orderImageUpload } = require('../utils/fileUpload');
const multer = require('multer');
const path = require('path');

// ==================== PAYU PAYMENT ROUTES MIDDLEWARE (RUNS FIRST) ====================
// This middleware MUST run before route matching to catch PayU endpoints
// PayU routes are accessed via WebView and cannot send custom headers
router.use((req, res, next) => {
  const path = req.path || '';
  const originalUrl = req.originalUrl || req.url || '';
  const baseUrl = req.baseUrl || '';
  const pathLower = path.toLowerCase();
  const originalUrlLower = originalUrl.toLowerCase();
  const fullPath = (baseUrl + path).toLowerCase();
  const fullOriginalUrl = originalUrl.toLowerCase();
  
  // Check if this is a PayU endpoint or Instamojo redirect endpoint
  const isPayUEndpoint = 
    pathLower.includes('payu') || 
    originalUrlLower.includes('payu') ||
    fullPath.includes('payu') ||
    fullOriginalUrl.includes('payu') ||
    path === '/payu-form' ||
    path === '/payu-success' ||
    path === '/payu-failure' ||
    path.startsWith('/payu-') ||
    originalUrl.includes('/payu-');
  
  // Instamojo redirect endpoint (called by Instamojo servers, no API key)
  // Check in path, originalUrl, and full paths (with and without /v2 prefix)
  const isInstamojoRedirect = 
    path === '/instamojo/payment-redirect' ||
    path === '/v2/instamojo/payment-redirect' ||
    (pathLower.includes('instamojo') && pathLower.includes('payment-redirect')) ||
    (originalUrlLower.includes('instamojo') && originalUrlLower.includes('payment-redirect')) ||
    (fullPath.includes('instamojo') && fullPath.includes('payment-redirect')) ||
    (fullOriginalUrl.includes('instamojo') && fullOriginalUrl.includes('payment-redirect'));
  
  if (isPayUEndpoint || isInstamojoRedirect) {
    console.log('✅✅✅ Public endpoint detected (PayU or Instamojo redirect) - will skip API key check');
    console.log('   Path:', path);
    console.log('   OriginalUrl:', originalUrl);
    console.log('   FullPath:', fullPath);
    console.log('   isInstamojoRedirect:', isInstamojoRedirect);
    // Mark request to skip API key check
    req.skipApiKeyCheck = true;
  }
  
  next();
});

// ==================== PAYU PAYMENT ROUTES (NO API KEY REQUIRED) ====================
// These routes are accessed via WebView and cannot send custom headers
// MUST be defined BEFORE the API key middleware

/**
 * GET /api/v2/payu-form
 * Serves the PayU payment form HTML
 * NOTE: This route is public and does not require API key
 */
router.get('/payu-form', (req, res, next) => {
  console.log('✅ PayU form route matched - no API key required');
  return UtilityController.getPayUForm(req, res, next);
});

/**
 * GET/POST /api/v2/payu-success
 * Handles successful PayU payments
 * NOTE: This route is public and does not require API key
 */
router.get('/payu-success', (req, res, next) => {
  console.log('✅ PayU success route matched - no API key required');
  return UtilityController.payUSuccess(req, res, next);
});
router.post('/payu-success', (req, res, next) => {
  console.log('✅ PayU success route matched (POST) - no API key required');
  return UtilityController.payUSuccess(req, res, next);
});

/**
 * GET/POST /api/v2/payu-failure
 * Handles failed PayU payments
 * NOTE: This route is public and does not require API key
 */
router.get('/payu-failure', (req, res, next) => {
  console.log('✅ PayU failure route matched - no API key required');
  return UtilityController.payUFailure(req, res, next);
});
router.post('/payu-failure', (req, res, next) => {
  console.log('✅ PayU failure route matched (POST) - no API key required');
  return UtilityController.payUFailure(req, res, next);
});

// ==================== API KEY MIDDLEWARE ====================
// All other v2 routes require API key
// NOTE: PayU routes are defined above and marked with req.skipApiKeyCheck
router.use((req, res, next) => {
  // Check if this request should skip API key check (set by early middleware)
  if (req.skipApiKeyCheck) {
    console.log('✅✅✅✅✅ Public endpoint - SKIPPING API key check (marked by early middleware) ✅✅✅✅✅');
    return next(); // Skip API key check for public routes
  }
  
  // Also check path directly as fallback
  const path = req.path || '';
  const originalUrl = req.originalUrl || req.url || '';
  const pathLower = path.toLowerCase();
  const originalUrlLower = originalUrl.toLowerCase();
  
  const isPayUEndpoint = 
    pathLower.includes('payu') || 
    originalUrlLower.includes('payu') ||
    path === '/payu-form' ||
    path === '/payu-success' ||
    path === '/payu-failure' ||
    path.startsWith('/payu-') ||
    originalUrl.includes('/payu-');
  
  // Instamojo redirect endpoint (called by Instamojo servers, no API key)
  // Check multiple variations of the path (with and without /v2 prefix)
  const isInstamojoRedirect = 
    path === '/instamojo/payment-redirect' ||
    path === '/v2/instamojo/payment-redirect' ||
    (pathLower.includes('instamojo') && pathLower.includes('payment-redirect')) ||
    (originalUrlLower.includes('instamojo') && originalUrlLower.includes('payment-redirect'));
  
  if (isPayUEndpoint || isInstamojoRedirect) {
    console.log('✅✅✅✅✅ Public endpoint (PayU or Instamojo redirect) detected - SKIPPING API key check ✅✅✅✅✅');
    console.log('   Path:', path);
    console.log('   OriginalUrl:', originalUrl);
    console.log('   isInstamojoRedirect:', isInstamojoRedirect);
    return next(); // Skip API key check for public routes
  }
  
  // Apply API key check for all other routes
  console.log('🔑 Non-PayU route - applying API key check for:', path);
  return apiKeyCheck(req, res, next);
});

// ==================== AUTH ROUTES ====================
/**
 * POST /api/v2/auth/login
 * Login with phone number - returns OTP
 * Body: { phoneNumber: string }
 */
router.post('/auth/login', V2AuthController.login);

/**
 * POST /api/v2/auth/verify-otp
 * Verify OTP and complete login
 * Body: { phoneNumber: string, otp: string, joinType?: 'b2b' | 'b2c' | 'delivery' }
 */
router.post('/auth/verify-otp', V2AuthController.verifyOtp);

// ==================== SHOP TYPE ROUTES ====================
/**
 * GET /api/v2/shop-types
 * Get all available shop types
 */
router.get('/shop-types', ShopTypeController.getShopTypes);

// ==================== DASHBOARD MANAGEMENT ROUTES ====================
/**
 * GET /api/v2/user/dashboards/:userId
 * Get user's allowed dashboards based on shop type
 */
router.get('/user/dashboards/:userId', ShopTypeController.getUserDashboards);

/**
 * POST /api/v2/user/validate-dashboard
 * Validate if user can access a specific dashboard
 * Body: { userId, dashboardType }
 */
router.post('/user/validate-dashboard', ShopTypeController.validateDashboard);

/**
 * POST /api/v2/user/switch-dashboard
 * Switch user's current dashboard (B2B <-> B2C)
 * Body: { userId, targetDashboard }
 */
router.post('/user/switch-dashboard', ShopTypeController.switchDashboard);

// ==================== PROFILE ROUTES ====================
/**
 * GET /api/v2/profile/:userId
 * Get user profile with completion percentage
 */
router.get('/profile/:userId', V2ProfileController.getProfile);

/**
 * PUT /api/v2/profile/:userId
 * Update user profile
 * Body: { name?, email?, shop?: { shopname?, ownername?, address?, contact? }, delivery?: { name?, address?, contact? } }
 */
router.put('/profile/:userId', V2ProfileController.updateProfile);

/**
 * PUT /api/v2/profile/:userId/delivery-mode
 * Update delivery mode for delivery boy
 * Body: { delivery_mode: 'deliver' | 'deliverPicking' | 'picker' }
 */
router.put('/profile/:userId/delivery-mode', V2ProfileController.updateDeliveryMode);

/**
 * POST /api/v2/profile/:userId/upgrade-to-sr
 * Upgrade user_type from 'S' to 'SR' and create R shop when switching to B2C mode
 * Only works if user is approved by admin panel
 */
router.post('/profile/:userId/upgrade-to-sr', V2ProfileController.upgradeToSR);

/**
 * PUT /api/v2/profile/:userId/online-status
 * Update online/offline status for delivery boy
 * Body: { is_online: boolean }
 */
router.put('/profile/:userId/online-status', V2ProfileController.updateOnlineStatus);

/**
 * POST /api/v2/profile/:userId/image
 * Upload profile image (compressed to 50KB and uploaded to S3)
 * Body: multipart/form-data with 'image' field
 */
router.post('/profile/:userId/image', profileUpload.single('image'), V2ProfileController.uploadProfileImage);

/**
 * POST /api/v2/profile/:userId/aadhar
 * Upload Aadhar card (PDF only, uploaded to S3)
 * Body: multipart/form-data with 'file' field
 */
router.post('/profile/:userId/aadhar', documentUpload.single('file'), V2ProfileController.uploadAadharCard);

/**
 * POST /api/v2/profile/:userId/driving-license
 * Upload driving license (PDF only, uploaded to S3)
 * Body: multipart/form-data with 'file' field
 */
router.post('/profile/:userId/driving-license', documentUpload.single('file'), V2ProfileController.uploadDrivingLicense);

/**
 * PUT /api/v2/profile/:userId/complete-delivery-signup
 * Manually complete delivery signup and update user_type to 'D'
 * This is a fallback endpoint if the regular updateProfile doesn't update user_type
 */
router.put('/profile/:userId/complete-delivery-signup', V2ProfileController.completeDeliverySignup);

/**
 * DELETE /api/v2/profile/:userId
 * Delete user account (soft delete)
 */
router.delete('/profile/:userId', V2ProfileController.deleteAccount);

// ==================== B2B SIGNUP ROUTES ====================
/**
 * POST /api/v2/b2b-signup/:userId/document
 * Upload B2B signup document
 * Body: multipart/form-data with 'file' field and 'documentType' field ('business-license', 'gst-certificate', 'address-proof', 'kyc-owner')
 */
router.post('/b2b-signup/:userId/document', documentUpload.single('file'), V2B2BSignupController.uploadDocument);

/**
 * POST /api/v2/b2b-signup/:userId
 * Submit B2B business signup data
 * Body: { companyName, gstNumber, panNumber, businessAddress, contactPersonName, contactNumber, contactEmail, businessLicenseUrl, gstCertificateUrl, addressProofUrl, kycOwnerUrl }
 */
router.post('/b2b-signup/:userId', V2B2BSignupController.submitSignup);

// ==================== SUBSCRIPTION PACKAGES ROUTES ====================
/**
 * GET /api/v2/subscription-packages?userType=b2b|b2c
 * Get subscription packages for a specific user type
 * Query params: userType (required) - 'b2b' or 'b2c'
 */
router.get('/subscription-packages', V2SubscriptionPackageController.getSubscriptionPackages);

/**
 * POST /api/v2/subscription-packages/save
 * Save user subscription package after payment
 * Body: { user_id, package_id, payment_moj_id, payment_req_id, pay_details }
 */
router.post('/subscription-packages/save', V2SubscriptionPackageController.saveUserSubscription);

/**
 * POST /api/v2/subscription-packages/check-expiry
 * Check if subscription has expired and update is_subscribed status
 * Body: { user_id: string }
 */
router.post('/subscription-packages/check-expiry', V2SubscriptionPackageController.checkSubscriptionExpiry);

// ==================== INSTAMOJO PAYMENT ROUTES (WebView) ====================
/**
 * POST /api/v2/instamojo/create-payment-request
 * Create Instamojo payment request (for WebView integration)
 * Body: {
 *   purpose: string,
 *   amount: string | number,
 *   buyer_name: string,
 *   email: string,
 *   phone: string,
 *   redirect_url: string,
 *   webhook_url?: string,
 *   send_email?: boolean,
 *   send_sms?: boolean,
 *   allow_repeated_payments?: boolean
 * }
 * 
 * Returns: {
 *   status: 'success',
 *   data: {
 *     payment_request_id: string,
 *     longurl: string, // Use this in WebView
 *     ...other payment request fields
 *   }
 * }
 */
router.post('/instamojo/create-payment-request', V2InstamojoOrderController.createPaymentRequest);

/**
 * GET /api/v2/instamojo/payment-request/:paymentRequestId
 * Get Instamojo payment request details including payment status
 * 
 * Returns: {
 *   status: 'success',
 *   data: {
 *     payment_request: {...},
 *     payments: [...]
 *   }
 * }
 */
router.get('/instamojo/payment-request/:paymentRequestId', V2InstamojoOrderController.getPaymentRequestDetails);

/**
 * GET /api/v2/instamojo/payment-redirect
 * Handle Instamojo payment redirect (public endpoint, no API key required)
 * This is called by Instamojo servers after payment completion
 * Query params: payment_id, payment_request_id, payment_status
 * 
 * Note: The WebView will detect this redirect and extract payment details
 */
router.get('/instamojo/payment-redirect', V2InstamojoOrderController.handlePaymentRedirect);

// ==================== GENERAL CATEGORY ROUTES ====================
/**
 * GET /api/v2/categories?userType=b2b|b2c|all
 * Get all categories with B2B/B2C availability information
 * Query params: userType (optional) - 'b2b', 'b2c', or 'all' (default: 'all')
 */
router.get('/categories', V2CategoryController.getCategories);

/**
 * GET /api/v2/subcategories?categoryId=1&userType=b2b|b2c|all
 * Get all subcategories with B2B/B2C availability information
 * Query params: 
 *   - categoryId (optional) - filter by main category ID
 *   - userType (optional) - 'b2b', 'b2c', or 'all' (default: 'all')
 */
router.get('/subcategories', V2CategoryController.getSubcategories);

/**
 * GET /api/v2/categories/with-subcategories?userType=b2b|b2c|all
 * Get all categories with their subcategories grouped (single API call, no pagination)
 * Query params: userType (optional) - 'b2b', 'b2c', or 'all' (default: 'all')
 */
router.get('/categories/with-subcategories', V2CategoryController.getCategoriesWithSubcategories);

/**
 * GET /api/v2/categories/incremental-updates?userType=b2b|b2c|all&lastUpdatedOn=ISO_TIMESTAMP
 * Get incremental updates for categories and subcategories since lastUpdatedOn
 * Query params:
 *   - userType (optional) - 'b2b', 'b2c', or 'all' (default: 'all')
 *   - lastUpdatedOn (optional) - ISO timestamp string, if not provided returns all
 */
router.get('/categories/incremental-updates', V2CategoryController.getIncrementalUpdates);

/**
 * POST /api/v2/subcategories/request
 * Request a new subcategory (for B2C users)
 * Body: { main_category_id: number, subcategory_name: string, default_price?: string, price_unit?: string }
 * Requires user authentication
 */
router.post('/subcategories/request', SubcategoryController.requestSubcategory);

/**
 * GET /api/v2/subcategories/pending
 * Get all pending subcategory requests (for admin)
 * Requires admin authentication
 */
router.get('/subcategories/pending', SubcategoryController.getPendingRequests);

/**
 * POST /api/v2/subcategories/:id/approve
 * Approve or reject a subcategory request (for admin)
 * Body: { action: 'approve' | 'reject', approval_notes?: string }
 * Requires admin authentication
 */
router.post('/subcategories/:id/approve', SubcategoryController.approveRejectSubcategory);

/**
 * GET /api/v2/subcategories/user/:userId/requests
 * Get all subcategory requests by a specific user (for B2C users to see their requests)
 * Returns requests with all statuses: pending, approved, rejected
 */
router.get('/subcategories/user/:userId/requests', SubcategoryController.getUserSubcategoryRequests);

/**
 * POST /api/v2/categories/refresh-image
 * Refresh image URL for a category or subcategory (generates fresh presigned URL)
 * Body: { categoryId?: number, subcategoryId?: number }
 */
router.post('/categories/refresh-image', V2CategoryController.refreshImage);

/**
 * PUT /api/v2/profile/:userId/categories
 * Update user's operating categories
 * Body: { categoryIds: number[] }
 */
router.put('/profile/:userId/categories', V2ProfileController.updateUserCategories);

/**
 * GET /api/v2/profile/:userId/categories
 * Get user's operating categories
 */
router.get('/profile/:userId/categories', V2ProfileController.getUserCategories);

/**
 * DELETE /api/v2/profile/:userId/categories/:categoryId
 * Remove a category and all its subcategories from user's operating categories/subcategories
 */
router.delete('/profile/:userId/categories/:categoryId', V2ProfileController.removeUserCategory);

/**
 * PUT /api/v2/profile/:userId/subcategories
 * Update user's operating subcategories with custom prices
 * Body: { subcategories: [{ subcategoryId: number, customPrice: string, priceUnit: string }] }
 */
router.put('/profile/:userId/subcategories', V2ProfileController.updateUserSubcategories);

/**
 * DELETE /api/v2/profile/:userId/subcategories
 * Remove specific subcategories from user's operating subcategories
 * Body: { subcategoryIds: [number] }
 */
router.delete('/profile/:userId/subcategories', V2ProfileController.removeUserSubcategories);

/**
 * GET /api/v2/profile/:userId/subcategories
 * Get user's operating subcategories with custom prices
 */
router.get('/profile/:userId/subcategories', V2ProfileController.getUserSubcategories);

// ==================== RECYCLING STATISTICS ROUTES ====================
/**
 * GET /api/v2/recycling/stats/:userId
 * Get recycling statistics (recycled count, carbon offset) for a user
 * Query params: ?type=customer|shop|delivery
 * 
 * Returns:
 * - total_recycled_weight_kg: Total weight recycled in kg
 * - total_carbon_offset_kg: Total carbon offset in kg CO2
 * - total_orders_completed: Number of completed orders
 * - category_breakdown: Breakdown by category with weights and carbon offsets
 * - trees_equivalent: Equivalent trees saved
 * - cars_off_road_days: Equivalent days cars off the road
 */
router.get('/recycling/stats/:userId', V2RecyclingController.getRecyclingStats);

/**
 * GET /api/v2/recycling/vendor-stats/:userId
 * Get recycling statistics for B2C vendors based on completed orders (status 5)
 * This endpoint uses actual_weight from orderdetails if available
 * 
 * Returns:
 * - total_recycled_weight_kg: Total weight recycled in kg (from actual_weight)
 * - total_carbon_offset_kg: Total carbon offset in kg CO2
 * - total_orders_completed: Number of completed orders (status 5)
 * - category_breakdown: Breakdown by category with weights and carbon offsets
 * - trees_equivalent: Equivalent trees saved
 * - cars_off_road_days: Equivalent days cars off the road
 */
router.get('/recycling/vendor-stats/:userId', V2RecyclingController.getVendorRecyclingStats);

// ==================== EARNINGS ROUTES ====================
/**
 * GET /api/v2/earnings/monthly-breakdown/:userId
 * Get monthly earnings breakdown for last 6 months
 * Query params: ?type=customer|shop|delivery&months=6
 * 
 * Returns:
 * - monthlyBreakdown: Array of monthly data with month, monthName, year, earnings, orderCount
 * - totalEarnings: Total earnings for the period
 * - totalOrders: Total orders for the period
 * - currency: Currency code (INR for customer/shop, USD for delivery)
 * - period: Description of the period (e.g., "Last 6 months")
 */
router.get('/earnings/monthly-breakdown/:userId', V2EarningsController.getMonthlyBreakdown);

// ==================== ORDER/PICKUP REQUEST ROUTES ====================
/**
 * POST /api/v2/orders/pickup-request
 * Place a pickup request order from user app (user type 'U')
 * Body: multipart/form-data
 *   - customer_id: number
 *   - orderdetails: JSON string
 *   - customerdetails: string (address)
 *   - latitude: number
 *   - longitude: number
 *   - estim_weight: number
 *   - estim_price: number
 *   - preferred_pickup_time?: string
 *   - image1-6: File (optional)
 * 
 * Returns:
 * - order_number: Order number
 * - order_id: Order ID
 * - status: Order status (1 = pending)
 */
// Multer error handler wrapper
const handleMulterErrors = (multerMiddleware) => {
  return (req, res, next) => {
    multerMiddleware(req, res, (err) => {
      if (err) {
        console.error('❌ [Multer Error]', err.message);
        console.error('   Error code:', err.code);
        console.error('   Error field:', err.field);
        return res.status(400).json({
          status: 'error',
          msg: err.message || 'File upload error',
          data: null
        });
      }
      next();
    });
  };
};

router.post('/orders/pickup-request', handleMulterErrors(orderImageUpload.fields([
  { name: 'image1', maxCount: 1 },
  { name: 'image2', maxCount: 1 },
  { name: 'image3', maxCount: 1 },
  { name: 'image4', maxCount: 1 },
  { name: 'image5', maxCount: 1 },
  { name: 'image6', maxCount: 1 }
])), V2OrderController.placePickupRequest);

/**
 * GET /api/v2/orders/pickup-requests/available
 * Get available pickup requests that can be accepted by R, S, SR, or D users
 * Query params: 
 *   - user_id: number (required)
 *   - user_type: 'R'|'S'|'SR'|'D' (required)
 *   - latitude: number (optional, for distance filtering)
 *   - longitude: number (optional, for distance filtering)
 *   - radius: number (optional, default: 10km)
 * 
 * Returns:
 * - Array of available pickup requests with location, scrap description, estimated weight/price
 */
router.get('/orders/pickup-requests/available', V2OrderController.getAvailablePickupRequests);

/**
 * POST /api/v2/orders/pickup-request/:orderId/accept
 * Accept a pickup request (R, S, SR, or D users)
 * Body: { user_id: number, user_type: 'R'|'S'|'SR'|'D' }
 * 
 * Returns:
 * - order_id: Order ID
 * - order_number: Order number
 * - status: Order status (3 = pickup assigned)
 */
router.post('/orders/pickup-request/:orderId/accept', V2OrderController.acceptPickupRequest);

/**
 * POST /api/v2/orders/pickup-request/:orderId/cancel
 * Cancel/decline a pickup request (vendor declines the order)
 * Body: { 
 *   user_id: number, 
 *   user_type: 'R'|'S'|'SR'|'D',
 *   cancellation_reason: string (required)
 * }
 */
router.post('/orders/pickup-request/:orderId/cancel', V2OrderController.cancelPickupRequest);

/**
 * GET /api/v2/orders/active-pickup/:userId
 * Get active pickup order for a user (R, S, SR, D)
 * Query params: ?user_type=R|S|SR|D (required)
 * 
 * Returns:
 * - Active pickup order data formatted for Active Pickup section UI
 * - Includes location, scrap description, pickup time, images
 */
router.get('/orders/active-pickup/:userId', V2OrderController.getActivePickup);

/**
 * GET /api/v2/orders/active-pickups/:userId
 * Get all active pickup orders for a user (R, S, SR, D)
 * Query params: ?user_type=R|S|SR|D (required)
 * 
 * Returns:
 * - Array of all active pickup orders (status 2, 3, 4)
 * - Includes status labels, timestamps, and full order details
 */
router.get('/orders/active-pickups/:userId', V2OrderController.getAllActivePickups);
router.get('/orders/completed-pickups/:userId', V2OrderController.getCompletedPickups);

/**
 * POST /api/v2/orders/pickup-request/:orderId/start-pickup
 * Start pickup (vendor clicks "Myself Pickup")
 * Body: { user_id: number, user_type: 'R'|'S'|'SR'|'D' }
 * 
 * Returns:
 * - order_id: Order ID
 * - order_number: Order number
 * - status: Order status (4 = pickup started)
 */
router.post('/orders/pickup-request/:orderId/start-pickup', V2OrderController.startPickup);

/**
 * POST /api/v2/orders/pickup-request/:orderId/arrived-location
 * Mark order as arrived at location (status 4)
 * Body: { user_id: number, user_type: 'R'|'S'|'SR'|'D' }
 * 
 * Returns:
 * - order_id: Order ID
 * - order_number: Order number
 * - status: Order status (4 = Arrived Location)
 */
router.post('/orders/pickup-request/:orderId/arrived-location', V2OrderController.arrivedLocation);

/**
 * POST /api/v2/orders/pickup-request/:orderId/complete-pickup
 * Mark order as pickup completed (status 5)
 * Body: { user_id: number, user_type: 'R'|'S'|'SR'|'D' }
 * 
 * Returns:
 * - order_id: Order ID
 * - order_number: Order number
 * - status: Order status (5 = Pickup Completed)
 */
router.post('/orders/pickup-request/:orderId/complete-pickup', V2OrderController.completePickup);

// ==================== LOCATION TRACKING ROUTES ====================
// Note: Location routes are handled by location-service microservice
// These routes are kept here for reference and can be used if deploying as monolithic
// For microservice deployment, routes are in services/location/routes.js

const LocationController = require('../services/location/locationController');

/**
 * POST /api/v2/location/update
 * Update current location of pickup vendor (R, S, D, SR)
 * Body: {
 *   user_id: number,
 *   user_type: 'R' | 'S' | 'D' | 'SR',
 *   latitude: number,
 *   longitude: number,
 *   order_id?: number (optional)
 * }
 */
router.post('/location/update', LocationController.updateLocation);

/**
 * GET /api/v2/location/:userId
 * Get current location of a pickup vendor
 * Query params: ?user_type=R|S|D|SR&order_id=number (optional)
 */
router.get('/location/:userId', LocationController.getLocation);

/**
 * GET /api/v2/location/order/:orderId
 * Get location of vendor assigned to specific order
 */
router.get('/location/order/:orderId', LocationController.getLocationByOrder);

/**
 * DELETE /api/v2/location/:userId
 * Clear location cache for a vendor
 * Query params: ?user_type=R|S|D|SR&order_id=number (optional)
 */
router.delete('/location/:userId', LocationController.clearLocation);

// ==================== ADDRESS ROUTES ====================
/**
 * POST /api/v2/addresses
 * Save a new address for a customer
 * Body: {
 *   customer_id: number,
 *   address: string,
 *   addres_type: 'Work' | 'Home' | 'Other',
 *   building_no?: string,
 *   landmark?: string,
 *   lat_log?: string (format: "latitude,longitude"),
 *   latitude?: number,
 *   longitude?: number
 * }
 */
router.post('/addresses', (req, res, next) => {
  console.log('📍 POST /api/v2/addresses route hit');
  console.log('   Method:', req.method);
  console.log('   Path:', req.path);
  console.log('   Original URL:', req.originalUrl);
  console.log('   Body:', JSON.stringify(req.body, null, 2));
  console.log('   V2AddressController available:', !!V2AddressController);
  console.log('   saveAddress method available:', typeof V2AddressController?.saveAddress);
  next();
}, (req, res) => {
  console.log('📍 About to call V2AddressController.saveAddress');
  if (!V2AddressController || typeof V2AddressController.saveAddress !== 'function') {
    console.error('❌ V2AddressController.saveAddress is not a function');
    return res.status(500).json({
      status: 'error',
      msg: 'Address controller not properly loaded. Check server deployment.'
    });
  }
  return V2AddressController.saveAddress(req, res);
});

/**
 * GET /api/v2/addresses/customer/:customerId
 * Get all addresses for a customer
 */
router.get('/addresses/customer/:customerId', V2AddressController.getCustomerAddresses);

/**
 * PUT /api/v2/addresses/:addressId
 * Update an address
 * Body: {
 *   address?: string,
 *   addres_type?: 'Work' | 'Home' | 'Other',
 *   building_no?: string,
 *   landmark?: string,
 *   lat_log?: string
 * }
 */
router.put('/addresses/:addressId', V2AddressController.updateAddress);

/**
 * DELETE /api/v2/addresses/:addressId
 * Delete an address (soft delete)
 */
router.delete('/addresses/:addressId', V2AddressController.deleteAddress);

// ==================== NOTIFICATION ROUTES ====================
/**
 * POST /api/v2/notifications/send
 * Send push notification to a user by phone number or user_id
 * Body: {
 *   phone_number?: string (e.g., "9074135121"),
 *   user_id?: number,
 *   title: string,
 *   body: string,
 *   data?: object (optional, additional data payload)
 * }
 * 
 * Note: Only sends to customer_app users. Either phone_number or user_id is required.
 * 
 * Returns:
 * - status: 'success' | 'error'
 * - msg: Message
 * - data: { user_id, phone_number, messageId }
 */
router.post('/notifications/send', V2NotificationController.sendNotification);

/**
 * POST /api/v2/notifications/send-bulk
 * Send push notification to multiple users
 * Body: {
 *   user_ids?: number[],
 *   phone_numbers?: string[],
 *   title: string,
 *   body: string,
 *   data?: object (optional)
 * }
 * 
 * Note: Only sends to customer_app users. Either user_ids or phone_numbers array is required.
 * 
 * Returns:
 * - status: 'success' | 'error'
 * - msg: Message
 * - data: { totalUsers, successCount, failureCount }
 */
router.post('/notifications/send-bulk', V2NotificationController.sendBulkNotification);

// ==================== BULK SCRAP PURCHASE ROUTES ====================
/**
 * POST /api/v2/bulk-scrap/purchase
 * Create a bulk scrap purchase request and notify nearby B2B and B2C users
 * Body: {
 *   buyer_id: number (B2B user making the purchase request),
 *   latitude: number,
 *   longitude: number,
 *   scrap_type?: string,
 *   subcategory_id?: number,
 *   quantity: number (in tons),
 *   preferred_price?: number,
 *   delivery_method?: string,
 *   when_needed?: string,
 *   location?: string,
 *   additional_notes?: string
 * }
 * 
 * Returns:
 * - status: 'success' | 'error'
 * - msg: Message
 * - data: { buyer_id, buyer_name, quantity, scrap_type, location, notified_users, notifications }
 */
// Bulk scrap document upload (supports PDFs and images)
const bulkScrapDocumentUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: (req, file, cb) => {
    // Allow PDFs and images
    const allowedTypes = /pdf|jpeg|jpg|png|gif|webp/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = file.mimetype === 'application/pdf' || file.mimetype.startsWith('image/');
    
    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error('Only PDF and image files are allowed!'));
    }
  }
});

router.post('/bulk-scrap/purchase', handleMulterErrors(bulkScrapDocumentUpload.fields([
  { name: 'document1', maxCount: 1 },
  { name: 'document2', maxCount: 1 },
  { name: 'document3', maxCount: 1 },
  { name: 'document4', maxCount: 1 },
  { name: 'document5', maxCount: 1 },
  { name: 'document6', maxCount: 1 }
])), V2BulkScrapController.createBulkPurchaseRequest);

/**
 * GET /api/v2/bulk-scrap/requests
 * Get bulk scrap purchase requests for a user
 * Query params: user_id, latitude, longitude, user_type
 * Returns: Array of bulk scrap requests within user's location range
 */
router.get('/bulk-scrap/requests', V2BulkScrapController.getBulkScrapRequests);

/**
 * GET /api/v2/bulk-scrap/requests/accepted
 * Get bulk scrap purchase requests accepted by the current user
 * Query params: user_id, latitude, longitude, user_type
 * Returns: Array of accepted bulk scrap requests
 */
router.get('/bulk-scrap/requests/accepted', V2BulkScrapController.getAcceptedBulkScrapRequests);

// Multer configuration for bulk scrap participation images (up to 6 images)
const bulkScrapParticipationImageUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB per file
  },
  fileFilter: (req, file, cb) => {
    // Accept only image files
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'), false);
    }
  }
});

/**
 * POST /api/v2/bulk-scrap/requests/:requestId/accept
 * Accept a bulk scrap purchase request
 * Supports FormData with images (image1, image2, ..., image6)
 */
router.post('/bulk-scrap/requests/:requestId/accept', 
  handleMulterErrors(bulkScrapParticipationImageUpload.fields([
    { name: 'image1', maxCount: 1 },
    { name: 'image2', maxCount: 1 },
    { name: 'image3', maxCount: 1 },
    { name: 'image4', maxCount: 1 },
    { name: 'image5', maxCount: 1 },
    { name: 'image6', maxCount: 1 }
  ])),
  V2BulkScrapController.acceptBulkScrapRequest
);

/**
 * POST /api/v2/bulk-scrap/requests/:requestId/accept/remove-vendor
 * Remove a vendor from accepted vendors list (only buyer can do this)
 */
router.post('/bulk-scrap/requests/:requestId/accept/remove-vendor', V2BulkScrapController.removeVendorFromBulkRequest);

/**
 * GET /api/v2/bulk-scrap/requests/:requestId/orders
 * Get all orders created from a bulk scrap request (for the buyer)
 */
router.get('/bulk-scrap/requests/:requestId/orders', V2BulkScrapController.getBulkRequestOrders);

/**
 * POST /api/v2/bulk-scrap/requests/:requestId/reject
 * Reject/decline a bulk scrap purchase request
 */
router.post('/bulk-scrap/requests/:requestId/reject', V2BulkScrapController.rejectBulkScrapRequest);

/**
 * GET /api/v2/bulk-scrap/requests/by-buyer/:buyerId
 * Get bulk scrap purchase requests created by a specific buyer
 * Returns: Array of bulk scrap requests created by the buyer
 */
router.get('/bulk-scrap/requests/by-buyer/:buyerId', V2BulkScrapController.getBulkScrapRequestsByBuyer);

/**
 * POST /api/v2/bulk-scrap/requests/:requestId/start-pickup
 * Start pickup for a bulk scrap request (creates orders for each participating vendor)
 * Body: { buyer_id: number, user_type: string }
 * Returns: Array of created orders
 */
router.post('/bulk-scrap/requests/:requestId/start-pickup', V2BulkScrapController.startPickupForBulkRequest);

/**
 * POST /api/v2/bulk-scrap/requests/:requestId/update-buyer-status
 * Update buyer status for a bulk scrap request (arrived, completed)
 * Body: { buyer_id: number, buyer_status: 'arrived' | 'completed' }
 */
router.post('/bulk-scrap/requests/:requestId/update-buyer-status', V2BulkScrapController.updateBulkRequestBuyerStatus);

/**
 * POST /api/v2/bulk-scrap/pending-orders
 * Save a pending bulk buy order with payment transaction ID
 * Body: {
 *   user_id: number,
 *   transaction_id: string,
 *   payment_amount: number,
 *   subscription_plan_id: string,
 *   buyer_id: number,
 *   latitude: number,
 *   longitude: number,
 *   scrap_type?: string,
 *   subcategories?: array (JSON string if from FormData),
 *   quantity: number,
 *   preferred_price?: number,
 *   preferred_distance?: number,
 *   when_needed?: string,
 *   location?: string,
 *   additional_notes?: string,
 *   documents?: array (files)
 * }
 */
const pendingOrderDocumentUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['application/pdf', 'image/jpeg', 'image/png', 'image/jpg'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only PDF, JPEG, PNG are allowed.'), false);
    }
  }
});

router.post('/bulk-scrap/pending-orders', 
  handleMulterErrors(pendingOrderDocumentUpload.fields([
    { name: 'document1', maxCount: 1 },
    { name: 'document2', maxCount: 1 },
    { name: 'document3', maxCount: 1 },
    { name: 'document4', maxCount: 1 },
    { name: 'document5', maxCount: 1 },
    { name: 'document6', maxCount: 1 },
    { name: 'document7', maxCount: 1 },
    { name: 'document8', maxCount: 1 },
    { name: 'document9', maxCount: 1 },
    { name: 'document10', maxCount: 1 }
  ])),
  V2BulkScrapController.savePendingBulkBuyOrder
);

/**
 * GET /api/v2/bulk-scrap/pending-orders
 * Get all pending bulk buy orders for a user
 * Query: { user_id: number }
 */
router.get('/bulk-scrap/pending-orders', V2BulkScrapController.getPendingBulkBuyOrders);

// ==================== BULK SELL REQUEST ROUTES ====================
/**
 * POST /api/v2/bulk-sell/create
 * Create a bulk sell request and notify nearby 'S' type users
 */
const bulkSellDocumentUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowedTypes = /pdf|jpeg|jpg|png|gif|webp/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = file.mimetype === 'application/pdf' || file.mimetype.startsWith('image/');
    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error('Only PDF and image files are allowed!'));
    }
  }
});

router.post('/bulk-sell/create', handleMulterErrors(bulkSellDocumentUpload.fields([
  { name: 'document1', maxCount: 1 },
  { name: 'document2', maxCount: 1 },
  { name: 'document3', maxCount: 1 },
  { name: 'document4', maxCount: 1 },
  { name: 'document5', maxCount: 1 },
  { name: 'document6', maxCount: 1 }
])), V2BulkSellController.createBulkSellRequest);

/**
 * GET /api/v2/bulk-sell/requests
 * Get bulk sell requests available for the user (only 'S' type users)
 */
router.get('/bulk-sell/requests', V2BulkSellController.getBulkSellRequests);

/**
 * GET /api/v2/bulk-sell/requests/accepted
 * Get bulk sell requests accepted by the user
 */
router.get('/bulk-sell/requests/accepted', V2BulkSellController.getAcceptedBulkSellRequests);

/**
 * GET /api/v2/bulk-sell/requests/by-seller/:sellerId
 * Get all bulk sell requests created by a specific seller
 */
router.get('/bulk-sell/requests/by-seller/:sellerId', V2BulkSellController.getBulkSellRequestsBySeller);

// Multer for bulk sell acceptance images
const bulkSellAcceptanceImageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'), false);
    }
  }
});

/**
 * POST /api/v2/bulk-sell/requests/:requestId/accept
 * Accept/buy from a bulk sell request (only 'S' type users)
 */
router.post('/bulk-sell/requests/:requestId/accept', 
  handleMulterErrors(bulkSellAcceptanceImageUpload.fields([
    { name: 'image1', maxCount: 1 },
    { name: 'image2', maxCount: 1 },
    { name: 'image3', maxCount: 1 },
    { name: 'image4', maxCount: 1 },
    { name: 'image5', maxCount: 1 },
    { name: 'image6', maxCount: 1 }
  ])),
  V2BulkSellController.acceptBulkSellRequest
);

/**
 * POST /api/v2/bulk-sell/requests/:requestId/reject
 * Reject a bulk sell request
 */
router.post('/bulk-sell/requests/:requestId/reject', V2BulkSellController.rejectBulkSellRequest);

// ==================== FOOD WASTE ENQUIRY ROUTES ====================
/**
 * POST /api/v2/food-waste/enquiry
 * Submit a food waste collection enquiry
 * Body: {
 *   user_id: number,
 *   kg_per_week: string,
 *   preferred_timings: string[],
 *   address?: string,
 *   latitude?: number,
 *   longitude?: number
 * }
 * 
 * Returns:
 * - status: 'success' | 'error'
 * - msg: Message
 * - data: { enquiry_id, user_id, kg_per_week, preferred_timings, status }
 */
router.post('/food-waste/enquiry', V2FoodWasteController.submitEnquiry);

// ==================== APP VERSION ROUTE ====================
/**
 * GET /api/v2/app-version
 * Get the latest app version for mobile apps
 * Returns: { status: 'success', msg: 'App version retrieved', data: { appVersion: string } }
 */
router.get('/app-version', SitePanelController.getAppVersion);

// ==================== BULK MESSAGE NOTIFICATION ROUTES ====================
/**
 * POST /api/v2/bulk-message/notify
 * Save bulk message notification records (single or batch)
 * Body (single): {
 *   phone_number: string,
 *   business_data: { title, street, city?, state?, phone?, categoryName?, url? },
 *   message: string,
 *   status?: 'sent' | 'failed' | 'pending',
 *   language?: string
 * }
 * Body (batch): {
 *   notifications: [
 *     { phone_number, business_data, message, status?, language? },
 *     ...
 *   ]
 * }
 * 
 * Returns:
 * - status: 'success' | 'error'
 * - msg: Message
 * - data: Saved notification(s) or batch result
 */
router.post('/bulk-message/notify', V2BulkMessageController.saveNotifications);

/**
 * GET /api/v2/bulk-message/check/:phoneNumber
 * Check if a phone number has been notified
 * 
 * Returns:
 * - status: 'success' | 'error'
 * - msg: Message
 * - data: {
 *     phone_number: string,
 *     is_notified: boolean,
 *     notification_count: number,
 *     notifications: Array
 *   }
 */
router.get('/bulk-message/check/:phoneNumber', V2BulkMessageController.checkNotification);

/**
 * POST /api/v2/bulk-message/check-batch
 * Check if multiple phone numbers have been notified
 * Body: {
 *   phone_numbers: string[]
 * }
 * 
 * Returns:
 * - status: 'success' | 'error'
 * - msg: Message
 * - data: {
 *     [phone_number]: {
 *       phone_number: string,
 *       is_notified: boolean,
 *       notification_count: number,
 *       notifications: Array
 *     },
 *     ...
 *   }
 */
router.post('/bulk-message/check-batch', V2BulkMessageController.checkNotificationsBatch);

/**
 * GET /api/v2/bulk-message/notifications
 * Get all notifications with pagination
 * Query params: ?limit=100&lastKey=...
 * 
 * Returns:
 * - status: 'success' | 'error'
 * - msg: Message
 * - data: {
 *     items: Array,
 *     count: number,
 *     has_more: boolean,
 *     last_key: string | null
 *   }
 */
router.get('/bulk-message/notifications', V2BulkMessageController.getAllNotifications);

// PayU routes are now defined at the top of the file (before API key middleware)
// This ensures they are accessible without API key for WebView requests

module.exports = router;
