"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const userController_1 = __importDefault(require("../controllers/userController"));
const router = express_1.default.Router();
// GET /customers/check/:name - Check user by name
router.get('/check/:name', userController_1.default.checkUserByName);
exports.default = router;
//# sourceMappingURL=customerRoutes.js.map