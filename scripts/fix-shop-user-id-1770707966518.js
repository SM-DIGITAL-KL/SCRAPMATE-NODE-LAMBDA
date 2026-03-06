require('dotenv').config();
const Shop = require('../models/Shop');
const RedisCache = require('../utils/redisCache');

const USER_ID = 1770707966518;
const SHOP_ID = 1770707971915;
const WRONG_USER_ID = 2499;
const MOBILE = '8848950262';

async function main() {
  console.log('\n' + '='.repeat(70));
  console.log('  FIXING SHOP USER ID for Nem kumar (8848950262)');
  console.log('='.repeat(70) + '\n');

  const shop = await Shop.findById(SHOP_ID);
  
  if (!shop) {
    console.log('❌ Shop not found');
    process.exit(1);
  }

  console.log('🏪 Current Shop Data:');
  console.log('   Shop ID:', shop.id);
  console.log('   Shop Name:', shop.shopname);
  console.log('   Contact:', shop.contact);
  console.log('   Current user_id:', shop.user_id, '❌ WRONG');
  console.log('   Should be user_id:', USER_ID, '✅');
  console.log('');

  console.log('🔄 Updating shop user_id...\n');
  
  await Shop.update(SHOP_ID, { user_id: USER_ID });

  console.log('✅ Shop updated!');
  console.log('');

  // Clear caches
  console.log('🔄 Clearing caches...');
  const cacheKeys = [
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
  
  for (const key of cacheKeys) {
    try {
      await RedisCache.delete(key);
      console.log('   ✅', key);
    } catch (e) {
      console.log('   ⚠️ ', key);
    }
  }

  console.log('\n' + '='.repeat(70));
  console.log('  FIX COMPLETE');
  console.log('='.repeat(70));
  console.log('\n✅ Shop is now linked to correct user!');
  console.log('   Refresh the admin panel to see the shop.');
  console.log('');
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
