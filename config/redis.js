require('dotenv').config();
// Load environment variables from aws.txt (includes REDIS_URL, REDIS_TOKEN, etc.)
const { loadEnvFromFile } = require('../utils/loadEnv');
loadEnvFromFile();

const { Redis } = require('@upstash/redis');

const redisUrl = process.env.REDIS_URL || process.env.UPSTASH_REDIS_REST_URL || '';
const redisToken = process.env.REDIS_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || '';

// Create a mock Redis client that handles missing credentials gracefully
const createMockRedis = () => ({
  get: async () => null,
  set: async () => false,
  del: async () => false,
  scan: async () => ['0', []],
});

// Only initialize Redis if credentials are provided
let redis = null;

if (redisUrl && redisToken) {
  try {
    redis = new Redis({
      url: redisUrl,
      token: redisToken,
    });
    console.log('✅ Redis client initialized successfully');
  } catch (err) {
    console.error('❌ Failed to initialize Redis client:', err.message);
    console.warn('⚠️  Falling back to mock Redis client. Redis caching will be disabled.');
    redis = createMockRedis();
  }
} else {
  console.warn('⚠️  Redis credentials not found. Redis caching will be disabled.');
  console.warn('   Set REDIS_URL and REDIS_TOKEN (or UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN) in aws.txt or .env');
  redis = createMockRedis();
}

module.exports = redis;

