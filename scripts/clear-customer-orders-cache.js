/**
 * Script to clear Redis cache for customer orders
 * Usage: node scripts/clear-customer-orders-cache.js <customer_id>
 * Example: node scripts/clear-customer-orders-cache.js 1766462849729
 */

require('dotenv').config();
const RedisCache = require('../utils/redisCache');

const customerId = process.argv[2];

if (!customerId) {
  console.error('❌ Please provide a customer ID');
  console.log('Usage: node scripts/clear-customer-orders-cache.js <customer_id>');
  console.log('Example: node scripts/clear-customer-orders-cache.js 1766462849729');
  process.exit(1);
}

async function clearCustomerOrdersCache() {
  try {
    console.log(`\n🗑️  Clearing Redis cache for customer orders (customer_id: ${customerId})\n`);
    
    const customerIdNum = parseInt(customerId);
    
    // Generate the cache key using the same method as in the codebase
    const cacheKey = RedisCache.listKey('customer_orders', { customer_id: customerIdNum });
    
    console.log(`🔑 Cache key: ${cacheKey}`);
    console.log('');
    
    // Try to get the cache first to check if it exists
    const cached = await RedisCache.get(cacheKey);
    if (cached) {
      console.log(`✅ Cache exists for key: ${cacheKey}`);
      console.log(`   Cache contains ${Array.isArray(cached) ? cached.length : 'N/A'} order(s)`);
    } else {
      console.log(`ℹ️  Cache does not exist or is empty for key: ${cacheKey}`);
    }
    
    console.log('');
    console.log('🗑️  Deleting cache...');
    
    // Delete the cache
    const deleted = await RedisCache.delete(cacheKey);
    
    if (deleted) {
      console.log(`✅ Successfully deleted cache for customer_id: ${customerId}`);
      console.log(`   Cache key: ${cacheKey}`);
    } else {
      console.log(`⚠️  Cache deletion completed (may have already been deleted or Redis unavailable)`);
    }
    
    // Verify deletion
    console.log('');
    console.log('🔍 Verifying deletion...');
    const verifyCache = await RedisCache.get(cacheKey);
    if (!verifyCache) {
      console.log(`✅ Verification: Cache successfully removed (key: ${cacheKey})`);
    } else {
      console.log(`⚠️  Verification: Cache still exists (this should not happen)`);
    }
    
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('✅ Cache clearing completed');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    
  } catch (error) {
    console.error('❌ Error clearing customer orders cache:', error);
    console.error(error.stack);
    process.exit(1);
  }
}

clearCustomerOrdersCache();

 * Script to clear Redis cache for customer orders
 * Usage: node scripts/clear-customer-orders-cache.js <customer_id>
 * Example: node scripts/clear-customer-orders-cache.js 1766462849729
 */

require('dotenv').config();
const RedisCache = require('../utils/redisCache');

const customerId = process.argv[2];

if (!customerId) {
  console.error('❌ Please provide a customer ID');
  console.log('Usage: node scripts/clear-customer-orders-cache.js <customer_id>');
  console.log('Example: node scripts/clear-customer-orders-cache.js 1766462849729');
  process.exit(1);
}

async function clearCustomerOrdersCache() {
  try {
    console.log(`\n🗑️  Clearing Redis cache for customer orders (customer_id: ${customerId})\n`);
    
    const customerIdNum = parseInt(customerId);
    
    // Generate the cache key using the same method as in the codebase
    const cacheKey = RedisCache.listKey('customer_orders', { customer_id: customerIdNum });
    
    console.log(`🔑 Cache key: ${cacheKey}`);
    console.log('');
    
    // Try to get the cache first to check if it exists
    const cached = await RedisCache.get(cacheKey);
    if (cached) {
      console.log(`✅ Cache exists for key: ${cacheKey}`);
      console.log(`   Cache contains ${Array.isArray(cached) ? cached.length : 'N/A'} order(s)`);
    } else {
      console.log(`ℹ️  Cache does not exist or is empty for key: ${cacheKey}`);
    }
    
    console.log('');
    console.log('🗑️  Deleting cache...');
    
    // Delete the cache
    const deleted = await RedisCache.delete(cacheKey);
    
    if (deleted) {
      console.log(`✅ Successfully deleted cache for customer_id: ${customerId}`);
      console.log(`   Cache key: ${cacheKey}`);
    } else {
      console.log(`⚠️  Cache deletion completed (may have already been deleted or Redis unavailable)`);
    }
    
    // Verify deletion
    console.log('');
    console.log('🔍 Verifying deletion...');
    const verifyCache = await RedisCache.get(cacheKey);
    if (!verifyCache) {
      console.log(`✅ Verification: Cache successfully removed (key: ${cacheKey})`);
    } else {
      console.log(`⚠️  Verification: Cache still exists (this should not happen)`);
    }
    
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('✅ Cache clearing completed');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    
  } catch (error) {
    console.error('❌ Error clearing customer orders cache:', error);
    console.error(error.stack);
    process.exit(1);
  }
}

clearCustomerOrdersCache();




