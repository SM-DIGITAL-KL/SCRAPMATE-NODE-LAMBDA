require('dotenv').config();
const User = require('../models/User');
const RedisCache = require('../utils/redisCache');

const USER_ID = 3144;
const MOBILE = '9095009600';

async function main() {
  console.log('\n🔍 Fixing user: Grace motors (' + MOBILE + ')\n');

  const user = await User.findById(USER_ID);
  console.log('Current:');
  console.log('  app_type:', user.app_type || '(missing)');
  console.log('  user_type:', user.user_type);
  console.log('');

  await User.updateProfile(USER_ID, {
    app_type: 'vendor_app',
    user_type: 'R'
  });

  console.log('✅ Updated to:');
  console.log('  app_type: vendor_app');
  console.log('  user_type: R');

  // Clear caches
  const keys = [
    RedisCache.userKey(USER_ID, 'profile'),
    'v2_profile_' + USER_ID,
    'profile_' + USER_ID,
    'user_' + USER_ID + '_profile',
    'v2_api_profile_' + USER_ID,
    'user:mobile:' + MOBILE,
    'shop:by_user:' + USER_ID,
    'shop:all_by_user:' + USER_ID
  ];
  
  for (const key of keys) {
    try { await RedisCache.delete(key); console.log('✅', key); } catch (e) {}
  }

  console.log('\n✅ Done! Refresh admin panel.');
}

main().catch(console.error);
