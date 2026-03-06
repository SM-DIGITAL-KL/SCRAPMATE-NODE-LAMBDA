/**
 * Script to fix user app_type and user_type for 8056744395
 * The user is currently customer_app/C but should be vendor_app/R
 * 
 * Run: node scripts/fix-user-app-type-8056744395.js
 */

require('dotenv').config();
const User = require('../models/User');
const Shop = require('../models/Shop');
const RedisCache = require('../utils/redisCache');

const MOBILE = '8056744395';

async function main() {
  console.log('\n' + '='.repeat(70));
  console.log(`  FIXING USER: ${MOBILE}`);
  console.log('='.repeat(70) + '\n');

  // Find user
  const allUsers = await User.getAll();
  const user = allUsers.find(u => String(u.mob_num) === MOBILE);
  
  if (!user) {
    console.log('❌ User not found');
    process.exit(1);
  }

  console.log('👤 Current User Data:');
  console.log(`   ID: ${user.id}`);
  console.log(`   Name: ${user.name}`);
  console.log(`   Current app_type: ${user.app_type}`);
  console.log(`   Current user_type: ${user.user_type}`);
  console.log('');

  // Check if shop exists
  const allShops = await Shop.getAll();
  const userShops = allShops.filter(s => s.user_id === user.id);
  
  console.log(`🏪 Found ${userShops.length} shop(s):`);
  userShops.forEach(s => {
    console.log(`   - Shop ${s.id}: type=${s.shop_type}, name=${s.shopname}`);
  });
  console.log('');

  // Check if user has B2C shop
  const b2cShop = userShops.find(s => s.shop_type === 3);
  
  if (!b2cShop) {
    console.log('❌ No B2C shop found for this user');
    process.exit(1);
  }

  // Fix user data
  console.log('🔄 Updating user data...\n');
  
  // Use updateProfile method - it handles updated_at automatically
  await User.updateProfile(user.id, {
    app_type: 'vendor_app',
    user_type: 'R'
  });

  console.log('✅ User updated:');
  console.log(`   app_type: customer_app → vendor_app`);
  console.log(`   user_type: C → R`);
  console.log('');

  // Clear all caches
  console.log('🔄 Clearing caches...');
  const cacheKeys = [
    RedisCache.userKey(user.id, 'profile'),
    `v2_profile_${user.id}`,
    `profile_${user.id}`,
    `user_${user.id}_profile`,
    `v2_api_profile_${user.id}`,
    `user:mobile:${MOBILE}`,
    `shop:by_user:${user.id}`,
    `shop:all_by_user:${user.id}`
  ];
  
  for (const key of cacheKeys) {
    try {
      await RedisCache.delete(key);
      console.log(`   ✅ ${key}`);
    } catch (e) {
      console.log(`   ⚠️  ${key}`);
    }
  }

  console.log('\n' + '='.repeat(70));
  console.log('  FIX COMPLETE');
  console.log('='.repeat(70));
  console.log('\n✅ User can now accept orders!');
  console.log('   Ask user to:');
  console.log('   1. Kill and reopen the app');
  console.log('   2. Or log out and log back in');
  console.log('');
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
