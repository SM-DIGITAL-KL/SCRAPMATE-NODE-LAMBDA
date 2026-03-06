require('dotenv').config();
const Shop = require('../models/Shop');
const RedisCache = require('../utils/redisCache');

const CORRECT_USER_ID = 421;  // jk - the one in admin panel
const WRONG_USER_ID = 1768141276078;  // Shabaz Khan
const SHOP_ID = 75;
const MOBILE = '7975780314';

async function main() {
  console.log('\n🔍 Fixing shop for jk (User ID 421)\n');
  
  console.log('Issue: Shop 75 is linked to user ' + WRONG_USER_ID);
  console.log('       Should be linked to user ' + CORRECT_USER_ID);
  console.log('');

  await Shop.update(SHOP_ID, { user_id: CORRECT_USER_ID });

  console.log('✅ Shop fixed:');
  console.log('   user_id: ' + WRONG_USER_ID + ' → ' + CORRECT_USER_ID);

  // Clear caches for BOTH users
  const keys = [
    RedisCache.userKey(CORRECT_USER_ID, 'profile'),
    'v2_profile_' + CORRECT_USER_ID,
    'profile_' + CORRECT_USER_ID,
    'user_' + CORRECT_USER_ID + '_profile',
    'v2_api_profile_' + CORRECT_USER_ID,
    RedisCache.userKey(WRONG_USER_ID, 'profile'),
    'v2_profile_' + WRONG_USER_ID,
    'profile_' + WRONG_USER_ID,
    'user_' + WRONG_USER_ID + '_profile',
    'v2_api_profile_' + WRONG_USER_ID,
    'user:mobile:' + MOBILE,
    'shop:by_user:' + CORRECT_USER_ID,
    'shop:all_by_user:' + CORRECT_USER_ID,
    'shop:by_user:' + WRONG_USER_ID,
    'shop:all_by_user:' + WRONG_USER_ID
  ];
  
  for (const key of keys) {
    try { await RedisCache.delete(key); console.log('✅', key); } catch (e) {}
  }

  console.log('\n✅ Done! Refresh admin panel to see shop for jk.');
}

main().catch(console.error);
