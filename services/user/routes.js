const express = require('express');
const router = express.Router();
const { apiKeyCheck } = require('../../middleware/apiKeyMiddleware');
const { profileUpload: profileUploadMulter, documentUpload: documentUploadMulter } = require('../../utils/fileUpload');
const UserController = require('../../controllers/userController');
const V2ProfileController = require('../../controllers/v2ProfileController');
const V2SubscriptionPackageController = require('../../controllers/v2SubscriptionPackageController');

const profileUpload = profileUploadMulter.single('profile_photo');
const v2ProfileUpload = profileUploadMulter;
const v2DocumentUpload = documentUploadMulter;

// Request logging middleware for user service
router.use((req, res, next) => {
  const timestamp = new Date().toISOString();
  console.log(`\n👤 [USER SERVICE] ${req.method} ${req.path || req.url} [${timestamp}]`);
  console.log(`   Query:`, req.query);
  console.log(`   Params:`, req.params);
  console.log(`   Body keys:`, req.body ? Object.keys(req.body) : 'no body');
  if (req.file) {
    console.log(`   File: ${req.file.originalname} (${req.file.size} bytes)`);
  }
  next();
});

router.use(apiKeyCheck);

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

// ==================== V2 MOBILE PROFILE ROUTES ====================
/**
 * GET /api/v2/profile/:userId
 * Get user profile with completion percentage
 */
router.get('/v2/profile/:userId', V2ProfileController.getProfile);

/**
 * PUT /api/v2/profile/:userId
 * Update user profile
 */
router.put('/v2/profile/:userId', V2ProfileController.updateProfile);

/**
 * PUT /api/v2/profile/:userId/delivery-mode
 * Update delivery mode for delivery boy
 */
router.put('/v2/profile/:userId/delivery-mode', V2ProfileController.updateDeliveryMode);

/**
 * PUT /api/v2/profile/:userId/online-status
 * Update online/offline status for delivery boy
 */
router.put('/v2/profile/:userId/online-status', V2ProfileController.updateOnlineStatus);

/**
 * POST /api/v2/profile/:userId/image
 * Upload profile image
 */
router.post('/v2/profile/:userId/image', v2ProfileUpload.single('image'), V2ProfileController.uploadProfileImage);

/**
 * POST /api/v2/profile/:userId/aadhar
 * Upload Aadhar card
 */
router.post('/v2/profile/:userId/aadhar', v2DocumentUpload.single('file'), V2ProfileController.uploadAadharCard);

/**
 * POST /api/v2/profile/:userId/driving-license
 * Upload driving license
 */
router.post('/v2/profile/:userId/driving-license', v2DocumentUpload.single('file'), V2ProfileController.uploadDrivingLicense);

// ==================== V2 MOBILE SUBSCRIPTION PACKAGES ROUTES ====================
/**
 * GET /api/v2/subscription-packages?userType=b2b|b2c
 * Get subscription packages for a specific user type
 */
router.get('/v2/subscription-packages', V2SubscriptionPackageController.getSubscriptionPackages);

module.exports = router;

