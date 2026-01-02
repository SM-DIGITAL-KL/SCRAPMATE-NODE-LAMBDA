/**
 * Script to invalidate the app version cache in Redis
 * This should be run after updating the app version in the database
 */

require('dotenv').config();
const RedisCache = require('../utils/redisCache');

async function invalidateCache() {
  try {
    console.log('🟢 Invalidating app version cache...');
    
    // Invalidate the cache keys
    try {
      await RedisCache.delete(RedisCache.adminKey('app_version'));
      console.log('✅ Deleted app_version cache');
    } catch (err) {
      console.error('❌ Error deleting app_version cache:', err);
    }
    
    try {
      await RedisCache.invalidateTableCache('admin_profile');
      console.log('✅ Invalidated admin_profile table cache');
    } catch (err) {
      console.error('❌ Error invalidating admin_profile cache:', err);
    }
    
    console.log('✅ Cache invalidation completed!');
  } catch (error) {
    console.error('❌ Error invalidating cache:', error);
    process.exit(1);
  }
}

invalidateCache()
  .then(() => {
    console.log('🎉 Cache invalidation script completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Script failed:', error);
    process.exit(1);
  });

