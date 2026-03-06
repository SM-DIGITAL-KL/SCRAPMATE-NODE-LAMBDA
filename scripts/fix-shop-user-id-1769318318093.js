require('dotenv').config();
const Shop = require('../models/Shop');
const RedisCache = require('../utils/redisCache');

const USER_ID = 1769318318093;
const SHOP_ID = 1769318555639;
const WRONG_USER_ID = 2499;
const MOBILE = '9388324307';

async function main() {
  console.log('\n' + '='.repeat(70));
  console.log('  FIXING SHOP for User_9388324307');
  console.log('='.repeat(70) + '\n');

  await Shop.update(SHOP_ID, { 
    user_id: USER_ID,
    contact: MOBILE
  });
  console.log('✅ Shop updated:');
  console.log('   user_id:', WRONG_USER_ID, '→', USER_ID);
  console.log('   contact: "" →', MOBILE);

  // Clear caches
  console.log('\n🔄 Clearing caches...');
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
    'shop:all_by_user:' + WRONG_USER_ID,
    RedisCache.listKey('paid_subscriptions')
  ];
  
  for (const key of keys) {
    try { await RedisCache.delete(key); console.log('   ✅', key); } catch (e) {}
  }

  console.log('\n✅ Done! Refresh admin panel to see the shop.');
}

main().catch(console.error);
