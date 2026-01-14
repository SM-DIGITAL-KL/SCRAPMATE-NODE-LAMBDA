/**
 * Script to clear all Redis cache
 * 
 * Usage: node scripts/clear-all-redis-cache.js
 */

require('dotenv').config();
const redis = require('../config/redis');

async function clearAllRedisCache() {
  try {
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🗑️  Clearing All Redis Cache');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('');
    
    if (!redis) {
      console.error('❌ Redis client not available');
      process.exit(1);
    }
    
    // Check if redis client has flushAll or flushdb method
    let cleared = false;
    let keysDeleted = 0;
    
    try {
      // Try FLUSHDB first (clears current database only)
      if (typeof redis.flushDb === 'function') {
        console.log('🔄 Attempting to clear current database (FLUSHDB)...');
        await redis.flushDb();
        cleared = true;
        console.log('✅ Current database cleared successfully');
      } else if (typeof redis.flushdb === 'function') {
        console.log('🔄 Attempting to clear current database (flushdb)...');
        await redis.flushdb();
        cleared = true;
        console.log('✅ Current database cleared successfully');
      } else if (typeof redis.sendCommand === 'function') {
        // Try using sendCommand for FLUSHDB
        console.log('🔄 Attempting to clear current database via sendCommand...');
        await redis.sendCommand(['FLUSHDB']);
        cleared = true;
        console.log('✅ Current database cleared successfully');
      }
    } catch (err) {
      console.warn('⚠️  FLUSHDB not available, trying alternative method...');
      console.warn(`   Error: ${err.message}`);
    }
    
    // If FLUSHDB didn't work, try FLUSHALL
    if (!cleared) {
      try {
        if (typeof redis.flushAll === 'function') {
          console.log('🔄 Attempting to clear all databases (FLUSHALL)...');
          await redis.flushAll();
          cleared = true;
          console.log('✅ All databases cleared successfully');
        } else if (typeof redis.flushall === 'function') {
          console.log('🔄 Attempting to clear all databases (flushall)...');
          await redis.flushall();
          cleared = true;
          console.log('✅ All databases cleared successfully');
        } else if (typeof redis.sendCommand === 'function') {
          console.log('🔄 Attempting to clear all databases via sendCommand...');
          await redis.sendCommand(['FLUSHALL']);
          cleared = true;
          console.log('✅ All databases cleared successfully');
        }
      } catch (err) {
        console.warn('⚠️  FLUSHALL not available, trying SCAN + DELETE...');
        console.warn(`   Error: ${err.message}`);
      }
    }
    
    // If both FLUSHDB and FLUSHALL didn't work, try SCAN + DELETE
    if (!cleared) {
      try {
        console.log('🔄 Attempting to clear cache using SCAN + DELETE...');
        console.log('   ⚠️  This may take a while for large caches...');
        
        let cursor = '0';
        let totalScanned = 0;
        let totalDeleted = 0;
        
        do {
          // Try to get keys using SCAN
          let keys = [];
          
          if (typeof redis.scan === 'function') {
            const result = await redis.scan(cursor, { match: '*', count: 1000 });
            cursor = result.cursor;
            keys = result.keys || [];
          } else if (typeof redis.sendCommand === 'function') {
            // Try using sendCommand for SCAN
            const result = await redis.sendCommand(['SCAN', cursor, 'MATCH', '*', 'COUNT', '1000']);
            cursor = result[0];
            keys = result[1] || [];
          } else {
            console.error('❌ SCAN command not available in Redis client');
            break;
          }
          
          if (keys && keys.length > 0) {
            totalScanned += keys.length;
            console.log(`   Scanned ${keys.length} keys (total: ${totalScanned})...`);
            
            // Delete keys in batches
            if (typeof redis.del === 'function') {
              const deleted = await redis.del(...keys);
              totalDeleted += deleted || keys.length;
            } else if (typeof redis.sendCommand === 'function') {
              // Delete keys one by one
              for (const key of keys) {
                await redis.sendCommand(['DEL', key]);
                totalDeleted++;
              }
            }
          }
          
          // Break if cursor is '0' (scan complete)
          if (cursor === '0' || cursor === 0) {
            break;
          }
        } while (true);
        
        keysDeleted = totalDeleted;
        cleared = true;
        console.log(`✅ Cleared ${totalDeleted} keys using SCAN + DELETE`);
      } catch (err) {
        console.error('❌ Error clearing cache with SCAN + DELETE:', err.message);
        console.error('   Stack:', err.stack);
      }
    }
    
    console.log('');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📊 Summary');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    if (cleared) {
      console.log('✅ Redis cache cleared successfully');
      if (keysDeleted > 0) {
        console.log(`   Keys deleted: ${keysDeleted}`);
      } else {
        console.log('   All cache keys cleared (using FLUSHDB/FLUSHALL)');
      }
    } else {
      console.log('❌ Failed to clear Redis cache');
      console.log('   Redis client may not support FLUSHDB/FLUSHALL/SCAN commands');
      console.log('   This might be an Upstash Redis instance with restricted commands');
    }
    
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
  } catch (error) {
    console.error('❌ Error:', error);
    console.error('   Message:', error.message);
    console.error('   Stack:', error.stack);
    process.exit(1);
  }
}

clearAllRedisCache();
