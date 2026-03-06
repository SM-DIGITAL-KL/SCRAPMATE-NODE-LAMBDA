/**
 * Script to clear paid subscriptions cache
 * Run this after extending subscriptions to see updated data in admin panel
 * 
 * Usage: node scripts/clear-paid-subscriptions-cache.js
 */

require('dotenv').config();
const RedisCache = require('../utils/redisCache');

async function clearCache() {
  console.log('\n' + '='.repeat(60));
  console.log('  CLEARING PAID SUBSCRIPTIONS CACHE');
  console.log('='.repeat(60) + '\n');

  try {
    const cacheKey = RedisCache.listKey('paid_subscriptions');
    console.log(`🔑 Cache Key: ${cacheKey}`);
    
    await RedisCache.delete(cacheKey);
    console.log('✅ Paid subscriptions cache cleared successfully!');
    console.log('\n📝 The admin panel should now show fresh data.');
    console.log('   Refresh the page at: https://mono.scrapmate.co.in/paidSubscriptions');
    
  } catch (error) {
    console.error('❌ Error clearing cache:', error.message);
    process.exit(1);
  }

  console.log('\n' + '='.repeat(60));
  process.exit(0);
}

clearCache();
