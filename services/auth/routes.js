/**
 * Auth Service Routes
 * Authentication, login, and user registration endpoints
 */

const express = require('express');
const router = express.Router();
const multer = require('multer');
const { apiKeyCheck } = require('../../middleware/apiKeyMiddleware');
const { profileUpload: profileUploadMulter } = require('../../utils/fileUpload');

// Controllers
const AuthController = require('../../controllers/authController');
const WebLoginController = require('../../controllers/webLoginController');
const V2AuthController = require('../../controllers/v2AuthController');

const profileUpload = profileUploadMulter.single('profile_photo');

// Request logging middleware for auth service
router.use((req, res, next) => {
  const timestamp = new Date().toISOString();
  console.log(`\n🔐 [AUTH SERVICE] ${req.method} ${req.path || req.url} [${timestamp}]`);
  console.log(`   Query:`, req.query);
  console.log(`   Params:`, req.params);
  console.log(`   Body keys:`, req.body ? Object.keys(req.body) : 'no body');
  if (req.file) {
    console.log(`   File: ${req.file.originalname} (${req.file.size} bytes)`);
  }
  next();
});

// Public route (no API key required)
router.get('/', AuthController.index);

// All routes below require API key
router.use(apiKeyCheck);

// ==================== AUTHENTICATION ROUTES ====================
router.get('/login_app/:mob', AuthController.loginApp);
router.post('/login_app', AuthController.loginAppPost); // POST version for Flutter app
router.post('/login', AuthController.login);
router.post('/dologin', WebLoginController.doLogin);
// Handle multer errors gracefully for users_register
router.post('/users_register', (req, res, next) => {
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
    next();
  });
}, AuthController.usersRegister);
router.post('/user_mob_verification', AuthController.userMobVerification);

// ==================== V2 MOBILE AUTH ROUTES ====================
/**
 * POST /api/v2/auth/login
 * Login with phone number - returns OTP
 * Body: { phoneNumber: string }
 */
router.post('/v2/auth/login', V2AuthController.login);

/**
 * POST /api/v2/auth/verify-otp
 * Verify OTP and complete login
 * Body: { phoneNumber: string, otp: string, joinType?: 'b2b' | 'b2c' | 'delivery' }
 */
router.post('/v2/auth/verify-otp', V2AuthController.verifyOtp);

module.exports = router;

