#!/usr/bin/env node

require('dotenv').config();
const redis = require('../config/redis');
const RedisCache = require('../utils/redisCache');

/**
 * Clear all Redis caches across the entire project
 * This includes:
 * - All Redis keys (using FLUSHALL)
 * - All cache types (admin, user, shop, order, product, category, deliveryboy, customer, notification, dashboard, list)
 * WARNING: This will delete ALL cached data!
 */
async function clearAllRedisCache() {
  try {
    console.log('\n' + '='.repeat(80));
    console.log('🗑️  CLEAR ALL REDIS CACHE');
    console.log('='.repeat(80));
    console.log('⚠️  WARNING: This will PERMANENTLY delete ALL cached data in Redis!');
    console.log('⚠️  This action CANNOT be undone!\n');
    
    // Check if Redis is available
    if (!redis) {
      console.log('❌ Redis client is not available. Cannot clear cache.');
      return {
        success: false,
        message: 'Redis client not available',
        method: 'none'
      };
    }
    
    // Check if redis is a mock client
    const getFuncStr = redis.get ? redis.get.toString() : '';
    const isMockClient = getFuncStr.includes('async () => null') || getFuncStr.includes('async() => null');
    
    if (isMockClient) {
      console.log('⚠️  Redis client is a mock. Cache clearing will not work.');
      return {
        success: false,
        message: 'Redis client is a mock - cache clearing disabled',
        method: 'none'
      };
    }
    
    console.log('📋 Step 1: Checking Redis connection...\n');
    
    // Test Redis connection
    try {
      const testKey = 'cache_clear_test_' + Date.now();
      await redis.set(testKey, 'test', { ex: 10 });
      const testValue = await redis.get(testKey);
      await redis.del(testKey);
      
      if (testValue === 'test') {
        console.log('✅ Redis connection is working.\n');
      } else {
        console.log('⚠️  Redis connection test returned unexpected value.\n');
      }
    } catch (testError) {
      console.error('❌ Redis connection test failed:', testError.message);
      return {
        success: false,
        message: `Redis connection test failed: ${testError.message}`,
        method: 'none'
      };
    }
    
    console.log('📋 Step 2: Getting current Redis database size...\n');
    
    // Get current database size
    let dbSize = 0;
    try {
      dbSize = await redis.dbsize();
      console.log(`   Current Redis database size: ${dbSize} key(s)\n`);
    } catch (dbsizeError) {
      console.warn(`   ⚠️  Could not get database size: ${dbsizeError.message}`);
      console.log('   Proceeding with cache clear anyway...\n');
    }
    
    console.log('📋 Step 3: Clearing all Redis cache using FLUSHALL...\n');
    
    // Method 1: Try FLUSHALL (clears all keys in all databases)
    let flushAllResult = null;
    try {
      console.log('   Attempting FLUSHALL (clears all keys in all databases)...');
      flushAllResult = await redis.flushall();
      console.log(`   ✅ FLUSHALL completed: ${flushAllResult}\n`);
    } catch (flushAllError) {
      console.error(`   ❌ FLUSHALL failed: ${flushAllError.message}`);
      console.log('   Trying alternative method...\n');
      
      // Method 2: Try FLUSHDB (clears only current database)
      try {
        console.log('   Attempting FLUSHDB (clears all keys in current database)...');
        const flushDbResult = await redis.flushdb();
        console.log(`   ✅ FLUSHDB completed: ${flushDbResult}\n`);
        flushAllResult = flushDbResult;
      } catch (flushDbError) {
        console.error(`   ❌ FLUSHDB also failed: ${flushDbError.message}`);
        console.log(`   Trying pattern-based deletion...\n`);
        
        // Method 3: Pattern-based deletion (fallback)
        try {
          console.log('   Attempting pattern-based deletion (scanning and deleting keys)...');
          const prefixes = [
            'admin:',
            'user:',
            'shop:',
            'order:',
            'product:',
            'category:',
            'deliveryboy:',
            'customer:',
            'notification:',
            'dashboard:',
            'list:'
          ];
          
          let totalDeleted = 0;
          for (const prefix of prefixes) {
            try {
              // Use SCAN to find keys matching the pattern
              let cursor = '0';
              let deletedCount = 0;
              
              do {
                const scanResult = await redis.scan(cursor, { match: `${prefix}*`, count: 100 });
                cursor = scanResult[0];
                const keys = scanResult[1];
                
                if (keys && keys.length > 0) {
                  // Delete keys in batches
                  for (const key of keys) {
                    try {
                      await redis.del(key);
                      deletedCount++;
                    } catch (delError) {
                      console.warn(`      ⚠️  Failed to delete key ${key}: ${delError.message}`);
                    }
                  }
                }
              } while (cursor !== '0');
              
              if (deletedCount > 0) {
                console.log(`      ✅ Deleted ${deletedCount} key(s) with prefix "${prefix}"`);
                totalDeleted += deletedCount;
              }
            } catch (prefixError) {
              console.warn(`      ⚠️  Error processing prefix "${prefix}": ${prefixError.message}`);
            }
          }
          
          if (totalDeleted > 0) {
            console.log(`\n   ✅ Pattern-based deletion completed: ${totalDeleted} key(s) deleted\n`);
            flushAllResult = `Pattern-based: ${totalDeleted} keys deleted`;
          } else {
            console.log(`\n   ℹ️  No keys found to delete with specified patterns\n`);
            flushAllResult = 'Pattern-based: No keys found';
          }
        } catch (patternError) {
          console.error(`   ❌ Pattern-based deletion failed: ${patternError.message}`);
          throw new Error('All cache clearing methods failed');
        }
      }
    }
    
    console.log('📋 Step 4: Verifying cache clear...\n');
    
    // Verify cache is cleared
    let newDbSize = 0;
    try {
      newDbSize = await redis.dbsize();
      const deletedCount = dbSize > 0 ? dbSize - newDbSize : 0;
      console.log(`   Database size after clear: ${newDbSize} key(s)`);
      if (dbSize > 0) {
        console.log(`   Keys deleted: ${deletedCount}`);
      }
      console.log('');
    } catch (verifyError) {
      console.warn(`   ⚠️  Could not verify database size: ${verifyError.message}\n`);
    }
    
    // ========== SUMMARY ==========
    console.log('='.repeat(80));
    console.log('📊 CACHE CLEAR SUMMARY:');
    console.log('='.repeat(80));
    console.log(`   Method Used: ${flushAllResult ? 'FLUSHALL/FLUSHDB/Pattern-based' : 'None'}`);
    console.log(`   Database Size Before: ${dbSize} key(s)`);
    console.log(`   Database Size After: ${newDbSize} key(s)`);
    if (dbSize > 0) {
      console.log(`   Keys Deleted: ${dbSize - newDbSize} key(s)`);
    }
    console.log('='.repeat(80) + '\n');
    
    if (newDbSize === 0 || (dbSize > 0 && newDbSize < dbSize)) {
      console.log('✅ All Redis caches have been cleared successfully.\n');
    } else {
      console.log('⚠️  Cache clear completed, but some keys may still exist.\n');
    }
    
    return {
      success: true,
      message: 'Redis cache cleared successfully',
      method: flushAllResult ? 'FLUSHALL/FLUSHDB/Pattern-based' : 'None',
      dbSizeBefore: dbSize,
      dbSizeAfter: newDbSize,
      keysDeleted: dbSize > 0 ? dbSize - newDbSize : 0
    };
  } catch (error) {
    console.error('❌ Fatal error clearing Redis cache:', error);
    throw error;
  }
}

// Run the script
// Add confirmation prompt for safety
const readline = require('readline');
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

console.log('\n⚠️  WARNING: This script will PERMANENTLY DELETE ALL cached data in Redis!');
console.log('⚠️  This includes:');
console.log('   - All admin caches');
console.log('   - All user caches');
console.log('   - All shop caches');
console.log('   - All order caches');
console.log('   - All product caches');
console.log('   - All category caches');
console.log('   - All delivery boy caches');
console.log('   - All customer caches');
console.log('   - All notification caches');
console.log('   - All dashboard caches');
console.log('   - All list caches');
console.log('⚠️  This action CANNOT be undone!\n');

rl.question('Type "CLEAR ALL REDIS CACHE" to confirm: ', (answer) => {
  if (answer === 'CLEAR ALL REDIS CACHE') {
    rl.close();
    clearAllRedisCache()
      .then(result => {
        if (result.success) {
          console.log('✅ Script completed successfully');
        } else {
          console.log(`⚠️  Script completed with warnings: ${result.message}`);
        }
        process.exit(0);
      })
      .catch(error => {
        console.error('❌ Script failed:', error);
        process.exit(1);
      });
  } else {
    console.log('❌ Confirmation text does not match. Aborting cache clear.');
    rl.close();
    process.exit(0);
  }
});

