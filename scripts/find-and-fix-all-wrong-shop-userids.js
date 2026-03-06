/**
 * Script to find and fix ALL shops with wrong user_id
 * Finds shops where user_id=2499 but should be linked to actual user by contact
 * 
 * Run: node scripts/find-and-fix-all-wrong-shop-userids.js
 */

require('dotenv').config();
const User = require('../models/User');
const Shop = require('../models/Shop');
const RedisCache = require('../utils/redisCache');

const WRONG_USER_ID = 2499;

async function main() {
  console.log('\n' + '='.repeat(80));
  console.log('  FINDING AND FIXING ALL SHOPS WITH WRONG user_id');
  console.log('  Looking for shops with user_id=' + WRONG_USER_ID);
  console.log('='.repeat(80) + '\n');

  // Get all users and shops
  const allUsers = await User.getAll();
  const allShops = await Shop.getAll();
  
  console.log('📊 Total users:', allUsers.length);
  console.log('📊 Total shops:', allShops.length);
  console.log('');

  // Find shops with wrong user_id
  const wrongShops = allShops.filter(s => s.user_id === WRONG_USER_ID);
  
  console.log(`🔍 Found ${wrongShops.length} shop(s) with user_id=${WRONG_USER_ID}:\n`);
  
  if (wrongShops.length === 0) {
    console.log('✅ No shops with wrong user_id found!');
    process.exit(0);
  }

  // Display all wrong shops
  wrongShops.forEach((shop, idx) => {
    console.log(`${idx + 1}. Shop ID: ${shop.id}`);
    console.log(`   Name: ${shop.shopname || 'N/A'}`);
    console.log(`   Contact: ${shop.contact || 'N/A'}`);
    console.log(`   Current user_id: ${shop.user_id} ❌`);
    console.log('');
  });

  // Try to match shops to users by contact
  const fixes = [];
  const unmatched = [];

  for (const shop of wrongShops) {
    const shopContact = String(shop.contact || '');
    
    // Find user by mobile matching shop contact
    const matchingUser = allUsers.find(u => {
      const userMobile = String(u.mob_num || '');
      return userMobile === shopContact && shopContact !== '';
    });

    if (matchingUser) {
      fixes.push({
        shop: shop,
        user: matchingUser,
        oldUserId: WRONG_USER_ID,
        newUserId: matchingUser.id
      });
    } else {
      unmatched.push(shop);
    }
  }

  console.log('='.repeat(80));
  console.log(`  MATCHING RESULTS: ${fixes.length} can be fixed, ${unmatched.length} unmatched`);
  console.log('='.repeat(80) + '\n');

  // Show fixes
  if (fixes.length > 0) {
    console.log('✅ SHOPS THAT CAN BE FIXED:\n');
    fixes.forEach((f, idx) => {
      console.log(`${idx + 1}. Shop: ${f.shop.shopname} (${f.shop.id})`);
      console.log(`   Contact: ${f.shop.contact}`);
      console.log(`   → User: ${f.user.name} (${f.newUserId})`);
      console.log('');
    });
  }

  // Show unmatched
  if (unmatched.length > 0) {
    console.log('⚠️  SHOPS THAT CANNOT BE MATCHED (no user with matching contact):\n');
    unmatched.forEach((shop, idx) => {
      console.log(`${idx + 1}. Shop ID: ${shop.id}`);
      console.log(`   Name: ${shop.shopname || 'N/A'}`);
      console.log(`   Contact: ${shop.contact || 'N/A'}`);
      console.log('');
    });
  }

  // Fix all matched shops
  if (fixes.length > 0) {
    console.log('='.repeat(80));
    console.log('  FIXING SHOPS...');
    console.log('='.repeat(80) + '\n');

    const fixedUserIds = new Set();
    
    for (const fix of fixes) {
      try {
        await Shop.update(fix.shop.id, { user_id: fix.newUserId });
        console.log(`✅ Fixed shop ${fix.shop.id}:`);
        console.log(`   user_id: ${fix.oldUserId} → ${fix.newUserId}`);
        console.log(`   Shop: ${fix.shop.shopname}`);
        console.log(`   User: ${fix.user.name}`);
        console.log('');
        fixedUserIds.add(fix.newUserId);
        fixedUserIds.add(fix.oldUserId);
      } catch (err) {
        console.error(`❌ Failed to fix shop ${fix.shop.id}:`, err.message);
      }
    }

    // Clear all caches
    console.log('🔄 Clearing caches...\n');
    const cacheKeys = [
      RedisCache.listKey('paid_subscriptions')
    ];
    
    // Add cache keys for all affected users
    for (const userId of fixedUserIds) {
      cacheKeys.push(
        RedisCache.userKey(userId, 'profile'),
        `v2_profile_${userId}`,
        `profile_${userId}`,
        `user_${userId}_profile`,
        `v2_api_profile_${userId}`,
        `shop:by_user:${userId}`,
        `shop:all_by_user:${userId}`
      );
    }
    
    for (const key of cacheKeys) {
      try {
        await RedisCache.delete(key);
        console.log('   ✅', key);
      } catch (e) {}
    }

    console.log('\n' + '='.repeat(80));
    console.log(`  FIXED ${fixes.length} SHOP(S)`);
    console.log('='.repeat(80));
  }

  console.log('\n✅ Done!');
  if (fixes.length > 0) {
    console.log('   Refresh admin panel to see all updated shops.');
  }
  if (unmatched.length > 0) {
    console.log(`   ${unmatched.length} shop(s) could not be matched - manual review needed.`);
  }
  console.log('');
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
