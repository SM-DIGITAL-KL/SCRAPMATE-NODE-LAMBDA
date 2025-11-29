/**
 * Clear Redis cache for count_row endpoint
 */

const { loadEnvFromFile } = require('../utils/loadEnv');
loadEnvFromFile();

const RedisCache = require('../utils/redisCache');

async function clearCountRowCache() {
  console.log('🧹 Clearing count_row cache...');
  
  // Clear cache for users table
  const cacheKey = RedisCache.listKey('count_row', { table_name: 'users' });
  console.log(`   Cache key: ${cacheKey}`);
  
  const deleted = await RedisCache.delete(cacheKey);
  
  if (deleted) {
    console.log('   ✅ Cache cleared for count_row/users');
  } else {
    console.log('   ⚠️  Cache key not found or already cleared');
  }
  
  // Also clear all list caches (includes count_row)
  console.log('');
  console.log('🧹 Clearing all list caches...');
  const result = await RedisCache.clearAll('list');
  console.log(`   Result: ${result.message}`);
  
  console.log('');
  console.log('✅ Cache clearing complete!');
  console.log('');
  console.log('🧪 Test the endpoint now:');
  console.log('   curl -X GET "https://9rl7rwb1fh.execute-api.ap-south-1.amazonaws.com/api/count_row/users" \\');
  console.log('     -H "api-key: zyubkfzeumeoviaqzcsrvfwdzbiwnlnn"');
}

clearCountRowCache().catch(err => {
  console.error('❌ Error:', err);
  process.exit(1);
});

