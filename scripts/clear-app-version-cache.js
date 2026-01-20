require('dotenv').config();
const RedisCache = require('../utils/redisCache');

async function clearAppVersionCache() {
  try {
    console.log('\n🗑️  Clearing App Version Cache');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    
    // Clear all related caches
    try {
      await RedisCache.invalidateTableCache('admin_profile');
      console.log('✅ Cleared admin_profile table cache');
      
      await RedisCache.delete(RedisCache.adminKey('app_version'));
      console.log('✅ Cleared app_version cache');
      
      await RedisCache.delete(RedisCache.adminKey('site_profile'));
      console.log('✅ Cleared site_profile cache');
      
      console.log('\n✅ All caches cleared successfully!');
      console.log('   The app will now fetch the latest version from the database.\n');
    } catch (cacheError) {
      console.error('❌ Error clearing cache:', cacheError.message);
      console.error(cacheError.stack);
      process.exit(1);
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run the script
clearAppVersionCache();
