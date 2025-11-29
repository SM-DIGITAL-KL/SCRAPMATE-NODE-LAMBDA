const express = require('express');
const router = express.Router();
const { apiKeyCheck } = require('../middleware/apiKeyMiddleware');
const ShopTypeController = require('../controllers/shopTypeController');
const V2AuthController = require('../controllers/v2AuthController');
const V2ProfileController = require('../controllers/v2ProfileController');
const V2B2BSignupController = require('../controllers/v2B2BSignupController');
const V2SubscriptionPackageController = require('../controllers/v2SubscriptionPackageController');
const { profileUpload, documentUpload } = require('../utils/fileUpload');

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

module.exports = router;

