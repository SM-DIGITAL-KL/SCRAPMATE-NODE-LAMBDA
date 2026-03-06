require('dotenv').config();
const Shop = require('../models/Shop');
const RedisCache = require('../utils/redisCache');

const USER_ID = 1768384708983;
const SHOP_ID = 1768385194543;
const WRONG_USER_ID = 2499;
const MOBILE = '8144224204';

async function main() {
  console.log('\n🔍 Fixing shop for User_8144224204\n');

  await Shop.update(SHOP_ID, { 
    user_id: USER_ID,
    contact: MOBILE
  });
  console.log('✅ Shop fixed:');
  console.log('   user_id:', WRONG_USER_ID, '→', USER_ID);
  console.log('   contact: "" →', MOBILE);

  // Clear caches
  const keys = [
    RedisCache.userKey(USER_ID, 'profile'),
    'v2_profile_' + USER_ID,
    'profile_' + USER_ID,
    'user_' + USER_ID + '_profile',
    'v2_api_profile_' + USER_ID,
    'user:mobile:' + MOBILE,
    'shop:by_user:' + USER_ID,
    'shop:all_by_user:' + USER_ID,
    'shop:by_user:' + WRONG_USER_ID,
    'shop:all_by_user:' + WRONG_USER_ID
  ];
  
  for (const key of keys) {
    try { await RedisCache.delete(key); console.log('✅', key); } catch (e) {}
  }

  console.log('\n✅ Done!');
}

main().catch(console.error);
