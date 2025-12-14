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

// Validate Redis URL - must be a valid HTTPS URL and not a placeholder
const isValidRedisUrl = (url) => {
  if (!url || typeof url !== 'string') return false;
  
  // Check for common placeholder values
  const placeholders = [
    'your-redis-url-here',
    'your-redis-url',
    'redis-url-here',
    'placeholder',
    'example.com',
    'localhost',
  ];
  
  const isPlaceholder = placeholders.some(placeholder => 
    url.toLowerCase().includes(placeholder.toLowerCase())
  );
  
  if (isPlaceholder) return false;
  
  // Must start with https://
  if (!url.startsWith('https://')) return false;
  
  // Basic URL validation
  try {
    const urlObj = new URL(url);
    return urlObj.protocol === 'https:';
  } catch {
    return false;
  }
};

// Only initialize Redis if credentials are provided and valid
let redis = null;

if (redisUrl && redisToken && isValidRedisUrl(redisUrl)) {
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
  if (redisUrl && !isValidRedisUrl(redisUrl)) {
    console.warn('⚠️  Redis URL is invalid or placeholder value. Redis caching will be disabled.');
    console.warn(`   Current REDIS_URL: "${redisUrl}"`);
    console.warn('   Please set a valid HTTPS Redis URL in aws.txt or .env');
  } else if (!redisUrl || !redisToken) {
  console.warn('⚠️  Redis credentials not found. Redis caching will be disabled.');
  console.warn('   Set REDIS_URL and REDIS_TOKEN (or UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN) in aws.txt or .env');
  }
  redis = createMockRedis();
}

module.exports = redis;

