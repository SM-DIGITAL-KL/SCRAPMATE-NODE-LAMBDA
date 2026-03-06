require('dotenv').config();
const Shop = require('../models/Shop');
const RedisCache = require('../utils/redisCache');

const USER_ID = 1770518875103;
const SHOP_ID = 1770519255677;
const WRONG_USER_ID = 2499;
const MOBILE = '7373471937';

async function main() {
  console.log('\n' + '='.repeat(70));
  console.log('  FIXING SHOP USER ID for Yasmin metals (7373471937)');
  console.log('='.repeat(70) + '\n');

  await Shop.update(SHOP_ID, { user_id: USER_ID });
  console.log('✅ Shop user_id updated:', WRONG_USER_ID, '→', USER_ID);

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
