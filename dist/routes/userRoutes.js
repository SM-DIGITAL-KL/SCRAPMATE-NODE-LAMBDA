"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const userController_1 = __importDefault(require("../controllers/userController"));
const authMiddleware_1 = require("../middleware/authMiddleware");
const router = express_1.default.Router();
// POST /users - Create a new user (public, or use /auth/register instead)
router.post('/', userController_1.default.createUser);
// GET /users/:id - Get user by ID (protected with JWT)
router.get('/:id', authMiddleware_1.authenticateToken, userController_1.default.getUserById);
exports.default = router;
//# sourceMappingURL=userRoutes.js.map