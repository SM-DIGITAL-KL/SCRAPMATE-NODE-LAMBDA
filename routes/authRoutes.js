const express = require('express');
const router = express.Router();
const AuthController = require('../controllers/authController');
const { authenticateToken } = require('../middleware/authMiddleware');

// POST /auth/register - Register a new user
router.post('/register', AuthController.register);

// POST /auth/login - Login user
router.post('/login', AuthController.login);

// GET /auth/profile - Get current user profile (protected)
router.get('/profile', authenticateToken, AuthController.getProfile);

module.exports = router;

