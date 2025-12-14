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
const { profileUpload, documentUpload, orderImageUpload } = require('../utils/fileUpload');

// All v2 routes require API key
router.use(apiKeyCheck);

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
 * Get categories with their subcategories grouped
 * Query params: userType (optional) - 'b2b', 'b2c', or 'all' (default: 'all')
 */
router.get('/categories/with-subcategories', V2CategoryController.getCategoriesWithSubcategories);

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
router.post('/orders/pickup-request', orderImageUpload.fields([
  { name: 'image1', maxCount: 1 },
  { name: 'image2', maxCount: 1 },
  { name: 'image3', maxCount: 1 },
  { name: 'image4', maxCount: 1 },
  { name: 'image5', maxCount: 1 },
  { name: 'image6', maxCount: 1 }
]), V2OrderController.placePickupRequest);

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
 * GET /api/v2/orders/active-pickup/:userId
 * Get active pickup order for a user (R, S, SR, D)
 * Query params: ?user_type=R|S|SR|D (required)
 * 
 * Returns:
 * - Active pickup order data formatted for Active Pickup section UI
 * - Includes location, scrap description, pickup time, images
 */
router.get('/orders/active-pickup/:userId', V2OrderController.getActivePickup);

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

module.exports = router;

