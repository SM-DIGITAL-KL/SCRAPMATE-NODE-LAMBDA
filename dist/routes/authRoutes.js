"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const authController_1 = __importDefault(require("../controllers/authController"));
const authMiddleware_1 = require("../middleware/authMiddleware");
const router = express_1.default.Router();
// POST /auth/register - Register a new user
router.post('/register', authController_1.default.register);
// POST /auth/login - Login user
router.post('/login', authController_1.default.login);
// GET /auth/profile - Get current user profile (protected)
router.get('/profile', authMiddleware_1.authenticateToken, authController_1.default.getProfile);
exports.default = router;
//# sourceMappingURL=authRoutes.js.map