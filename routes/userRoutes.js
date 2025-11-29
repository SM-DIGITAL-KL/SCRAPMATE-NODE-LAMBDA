const express = require('express');
const router = express.Router();
const UserController = require('../controllers/userController');
const { authenticateToken } = require('../middleware/authMiddleware');

// POST /users - Create a new user (public, or use /auth/register instead)
router.post('/', UserController.createUser);

// GET /users/:id - Get user by ID (protected with JWT)
router.get('/:id', authenticateToken, UserController.getUserById);

module.exports = router;

