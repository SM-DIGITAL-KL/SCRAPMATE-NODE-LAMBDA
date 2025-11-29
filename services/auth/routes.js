/**
 * Auth Service Routes
 * Authentication, login, and user registration endpoints
 */

const express = require('express');
const router = express.Router();
const { apiKeyCheck } = require('../../middleware/apiKeyMiddleware');
const { profileUpload: profileUploadMulter } = require('../../utils/fileUpload');

// Controllers
const AuthController = require('../../controllers/authController');
const WebLoginController = require('../../controllers/webLoginController');
const V2AuthController = require('../../controllers/v2AuthController');

const profileUpload = profileUploadMulter.single('profile_photo');

// Public route (no API key required)
router.get('/', AuthController.index);

// All routes below require API key
router.use(apiKeyCheck);

// ==================== AUTHENTICATION ROUTES ====================
router.get('/login_app/:mob', AuthController.loginApp);
router.post('/login_app', AuthController.loginAppPost); // POST version for Flutter app
router.post('/login', AuthController.login);
router.post('/dologin', WebLoginController.doLogin);
router.post('/users_register', profileUpload, AuthController.usersRegister);
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

