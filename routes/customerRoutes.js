const express = require('express');
const router = express.Router();
const UserController = require('../controllers/userController');

// GET /customers/check/:name - Check user by name
router.get('/check/:name', UserController.checkUserByName);

module.exports = router;

