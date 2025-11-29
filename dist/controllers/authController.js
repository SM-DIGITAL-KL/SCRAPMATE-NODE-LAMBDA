"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const User_1 = __importDefault(require("../models/User"));
class AuthController {
    // Register a new user
    static async register(req, res) {
        try {
            const { name, email, password } = req.body;
            if (!name || !email || !password) {
                res.status(400).json({ error: 'Name, email, and password are required' });
                return;
            }
            // Check if user already exists (you might want to add this check to User model)
            // For now, we'll just create the user
            const user = await User_1.default.create(name, email);
            const jwtSecret = process.env.JWT_SECRET;
            if (!jwtSecret) {
                res.status(500).json({ error: 'JWT secret not configured' });
                return;
            }
            // Generate JWT token
            const expiresIn = process.env.JWT_EXPIRES_IN || '24h';
            const token = jsonwebtoken_1.default.sign({ id: user.id, email: user.email }, jwtSecret, { expiresIn });
            res.status(201).json({
                message: '✅ User registered successfully',
                user: { id: user.id, name: user.name, email: user.email },
                token
            });
        }
        catch (err) {
            console.error('❌ Error registering user:', err);
            res.status(500).json({ error: 'Registration failed' });
        }
    }
    // Login user
    static async login(req, res) {
        try {
            const { email, password } = req.body;
            if (!email) {
                res.status(400).json({ error: 'Email is required' });
                return;
            }
            // Find user by email
            const user = await User_1.default.findByEmail(email);
            if (!user) {
                res.status(401).json({ error: 'Invalid email or password' });
                return;
            }
            // If password is provided, verify it (if user has password field)
            if (password && user.password) {
                const isValidPassword = await bcryptjs_1.default.compare(password, user.password);
                if (!isValidPassword) {
                    res.status(401).json({ error: 'Invalid email or password' });
                    return;
                }
            }
            // If no password field exists in user table, allow login with just email
            // This is useful for development/testing
            const jwtSecret = process.env.JWT_SECRET;
            if (!jwtSecret) {
                res.status(500).json({ error: 'JWT secret not configured' });
                return;
            }
            // Generate JWT token
            const expiresIn = process.env.JWT_EXPIRES_IN || '24h';
            const token = jsonwebtoken_1.default.sign({ id: user.id, email: user.email }, jwtSecret, { expiresIn });
            res.json({
                message: '✅ Login successful',
                user: { id: user.id, name: user.name, email: user.email },
                token
            });
        }
        catch (err) {
            console.error('❌ Error logging in:', err);
            res.status(500).json({ error: 'Login failed' });
        }
    }
    // Get current user profile (protected route)
    static async getProfile(req, res) {
        try {
            if (!req.user) {
                res.status(401).json({ error: 'Unauthorized' });
                return;
            }
            const userId = req.user.id;
            const user = await User_1.default.findById(userId);
            if (!user) {
                res.status(404).json({ error: 'User not found' });
                return;
            }
            res.json({
                user: { id: user.id, name: user.name, email: user.email }
            });
        }
        catch (err) {
            console.error('❌ Error fetching profile:', err);
            res.status(500).json({ error: 'Failed to fetch profile' });
        }
    }
}
exports.default = AuthController;
//# sourceMappingURL=authController.js.map