require('dotenv').config();
const User = require('../models/User');
const RedisCache = require('../utils/redisCache');

const MOBILE = '9633546527';

async function main() {
  console.log('\n🔍 Fixing user: ' + MOBILE + '\n');

  const allUsers = await User.getAll();
  const user = allUsers.find(u => String(u.mob_num) === MOBILE);
  
  if (!user) {
    console.log('❌ User not found');
    return;
  }

  console.log('Current:');
  console.log('  app_type:', user.app_type);
  console.log('  user_type:', user.user_type);
  console.log('');

  await User.updateProfile(user.id, {
    app_type: 'vendor_app',
    user_type: 'R'
  });

  console.log('✅ Updated to:');
  console.log('  app_type: vendor_app');
  console.log('  user_type: R');

  // Clear caches
  const keys = [
    RedisCache.userKey(user.id, 'profile'),
    'v2_profile_' + user.id,
    'profile_' + user.id,
    'user_' + user.id + '_profile',
    'v2_api_profile_' + user.id,
    'user:mobile:' + MOBILE,
    'shop:by_user:' + user.id,
    'shop:all_by_user:' + user.id
  ];
  
  for (const key of keys) {
    try { await RedisCache.delete(key); console.log('✅', key); } catch (e) {}
  }

  console.log('\n✅ Done!');
}

main().catch(console.error);
