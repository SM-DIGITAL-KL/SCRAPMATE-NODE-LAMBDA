"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const database_1 = __importDefault(require("../config/database"));
const redis_1 = __importDefault(require("../config/redis"));
class User {
    // Create a new user
    static async create(name, email) {
        return new Promise((resolve, reject) => {
            const query = 'INSERT INTO users (name, email) VALUES (?, ?)';
            database_1.default.query(query, [name, email], async (err, result) => {
                if (err) {
                    return reject(err);
                }
                const user = { id: result.insertId, name, email };
                // Cache user in Redis
                try {
                    await redis_1.default.set(`user:${result.insertId}`, JSON.stringify(user));
                }
                catch (redisErr) {
                    console.error('Redis cache error:', redisErr);
                    // Continue even if Redis fails
                }
                resolve(user);
            });
        });
    }
    // Get user by ID (checks Redis first, then MySQL)
    static async findById(id) {
        // Check Redis first
        try {
            const cachedUser = await redis_1.default.get(`user:${id}`);
            if (cachedUser) {
                console.log(`⚡ Redis cache hit user:${id}`);
                const parsedUser = typeof cachedUser === 'string' ? JSON.parse(cachedUser) : cachedUser;
                return parsedUser;
            }
        }
        catch (redisErr) {
            console.error('Redis get error:', redisErr);
            // Continue to MySQL if Redis fails
        }
        // If not found in Redis, check MySQL
        return new Promise((resolve, reject) => {
            const query = 'SELECT * FROM users WHERE id = ?';
            database_1.default.query(query, [id], async (err, results) => {
                if (err) {
                    return reject(err);
                }
                if (results.length === 0) {
                    return resolve(null);
                }
                const user = results[0];
                // Store in Redis cache
                try {
                    await redis_1.default.set(`user:${id}`, user);
                }
                catch (redisErr) {
                    console.error('Redis cache error:', redisErr);
                    // Continue even if Redis fails
                }
                resolve(user);
            });
        });
    }
    // Find user by email
    static async findByEmail(email) {
        return new Promise((resolve, reject) => {
            const query = 'SELECT * FROM users WHERE email = ?';
            database_1.default.query(query, [email], (err, results) => {
                if (err) {
                    return reject(err);
                }
                if (results.length > 0) {
                    resolve(results[0]);
                }
                else {
                    resolve(null);
                }
            });
        });
    }
    // Find user by name (for customer table)
    static async findByName(name) {
        return new Promise((resolve, reject) => {
            const query = 'SELECT * FROM customer WHERE name = ?';
            database_1.default.query(query, [name], (err, results) => {
                if (err) {
                    return reject(err);
                }
                if (results.length > 0) {
                    resolve(results[0]);
                }
                else {
                    resolve(null);
                }
            });
        });
    }
}
exports.default = User;
//# sourceMappingURL=User.js.map