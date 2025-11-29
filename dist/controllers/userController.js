"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const User_1 = __importDefault(require("../models/User"));
class UserController {
    // Create a new user
    static async createUser(req, res) {
        try {
            const { name, email } = req.body;
            if (!name || !email) {
                res.status(400).send({ error: 'Name and email are required' });
                return;
            }
            const user = await User_1.default.create(name, email);
            res.status(201).send({ message: '✅ User added successfully', user });
        }
        catch (err) {
            console.error('❌ Error creating user:', err);
            res.status(500).send({ error: 'Database insert failed' });
        }
    }
    // Get user by ID
    static async getUserById(req, res) {
        try {
            const { id } = req.params;
            const user = await User_1.default.findById(id);
            if (!user) {
                res.status(404).send({ message: 'User not found' });
                return;
            }
            res.send(user);
        }
        catch (err) {
            console.error('❌ Error fetching user:', err);
            res.status(500).send({ error: 'Database query failed' });
        }
    }
    // Check user by name (for customer table)
    static async checkUserByName(req, res) {
        try {
            const { name } = req.params;
            const user = await User_1.default.findByName(name);
            if (user) {
                res.send({ message: 'User found', user });
            }
            else {
                res.status(404).send({ message: 'User not found' });
            }
        }
        catch (err) {
            console.error('❌ Error checking user:', err);
            res.status(500).send({ error: 'Database query failed' });
        }
    }
}
exports.default = UserController;
//# sourceMappingURL=userController.js.map