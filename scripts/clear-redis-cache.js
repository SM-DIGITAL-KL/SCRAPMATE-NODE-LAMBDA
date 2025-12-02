#!/usr/bin/env node

/**
 * Script to clear all Redis cache
 * Supports both standard Redis and Upstash Redis (REST API)
 * 
 * Usage:
 *   node scripts/clear-redis-cache.js
 *   or
 *   ./scripts/clear-redis-cache.js
 */

require('dotenv').config();
const { loadEnvFromFile } = require('../utils/loadEnv');
loadEnvFromFile();

const { Redis } = require('@upstash/redis');

const redisUrl = process.env.REDIS_URL || process.env.UPSTASH_REDIS_REST_URL || '';
const redisToken = process.env.REDIS_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || '';

if (!redisUrl || !redisToken) {
    console.error('❌ Redis credentials not found.');
    console.error('   Please set REDIS_URL and REDIS_TOKEN (or UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN) in aws.txt or .env');
    process.exit(1);
}

const redis = new Redis({
    url: redisUrl,
    token: redisToken,
});

async function clearAllCache() {
    try {
        console.log('🔍 Scanning for all cache keys...');
        
        let cursor = '0';
        let totalDeleted = 0;
        const batchSize = 100;
        let iteration = 0;
        
        do {
            iteration++;
            console.log(`\n📊 Scan iteration ${iteration}...`);
            
            // Use SCAN to find all keys
            const result = await redis.scan(cursor, { match: '*', count: batchSize });
            cursor = result[0];
            const keys = result[1] || [];
            
            if (keys && keys.length > 0) {
                console.log(`📝 Found ${keys.length} keys in this batch`);
                
                // Delete keys in batches (Upstash supports batch delete)
                for (let i = 0; i < keys.length; i += batchSize) {
                    const batch = keys.slice(i, i + batchSize);
                    if (batch.length > 0) {
                        try {
                            // Delete multiple keys at once
                            const deleteResult = await redis.del(...batch);
                            totalDeleted += batch.length;
                            console.log(`✅ Deleted ${batch.length} keys (Total: ${totalDeleted})`);
                        } catch (deleteErr) {
                            console.error(`❌ Error deleting batch:`, deleteErr);
                            // Try deleting one by one as fallback
                            for (const key of batch) {
                                try {
                                    await redis.del(key);
                                    totalDeleted++;
                                    console.log(`✅ Deleted key: ${key} (Total: ${totalDeleted})`);
                                } catch (keyErr) {
                                    console.error(`❌ Failed to delete key ${key}:`, keyErr.message);
                                }
                            }
                        }
                    }
                }
            } else {
                console.log('📝 No keys found in this batch');
            }
            
            // Safety check to prevent infinite loops
            if (iteration > 1000) {
                console.warn('⚠️  Maximum iterations reached. Stopping scan.');
                break;
            }
            
        } while (cursor !== '0');
        
        console.log(`\n✅ Successfully cleared ${totalDeleted} cache keys`);
        return totalDeleted;
    } catch (err) {
        console.error('❌ Error clearing cache:', err);
        throw err;
    }
}

// Main execution
console.log('🚀 Starting Redis cache cleanup...\n');
clearAllCache()
    .then((count) => {
        console.log(`\n✅ Cache cleanup completed! Total keys deleted: ${count}`);
        process.exit(0);
    })
    .catch((err) => {
        console.error('\n❌ Cache cleanup failed:', err);
        process.exit(1);
    });


