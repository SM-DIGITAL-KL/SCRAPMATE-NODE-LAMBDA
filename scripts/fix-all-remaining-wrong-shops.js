/**
 * Script to find and fix ALL remaining shops with wrong user_id=2499
 * This handles both:
 * 1. Shops with user_id=2499 but matching contact to a real user
 * 2. Shops with user_id=2499 but empty/missing contact (match by shopname User_XXXX)
 * 
 * Run: node scripts/fix-all-remaining-wrong-shops.js
 */

require('dotenv').config();
const User = require('../models/User');
const Shop = require('../models/Shop');
const RedisCache = require('../utils/redisCache');

const WRONG_USER_ID = 2499;

async function main() {
  console.log('\n' + '='.repeat(80));
  console.log('  FIXING ALL REMAINING SHOPS WITH WRONG user_id=2499');
  console.log('='.repeat(80) + '\n');

  const allUsers = await User.getAll();
  const allShops = await Shop.getAll();
  
  // Find all shops with wrong user_id
  const wrongShops = allShops.filter(s => s.user_id === WRONG_USER_ID);
  
  console.log(`🔍 Found ${wrongShops.length} shop(s) with user_id=${WRONG_USER_ID}\n`);

  let fixed = 0;
  let failed = 0;
  const fixedUserIds = new Set();

  for (const shop of wrongShops) {
    const shopContact = String(shop.contact || '').trim();
    const shopName = String(shop.shopname || '').trim();
    
    // Try to find matching user
    let matchingUser = null;
    
    // Method 1: Match by contact number
    if (shopContact && shopContact.length >= 10) {
      matchingUser = allUsers.find(u => {
        const userMobile = String(u.mob_num || '').trim();
        return userMobile === shopContact;
      });
    }
    
    // Method 2: Match by shopname User_XXXXXXXX pattern
    if (!matchingUser && shopName.startsWith('User_')) {
      const mobileFromName = shopName.replace('User_', '').trim();
      if (mobileFromName.length >= 10) {
        matchingUser = allUsers.find(u => {
          const userMobile = String(u.mob_num || '').trim();
          return userMobile === mobileFromName;
        });
      }
    }
    
    // Method 3: Match by shopname without User_ prefix
    if (!matchingUser && shopName.length >= 10) {
      matchingUser = allUsers.find(u => {
        const userMobile = String(u.mob_num || '').trim();
        return userMobile === shopName;
      });
    }

    if (matchingUser) {
      try {
        const updates = { user_id: matchingUser.id };
        
        // Also fix empty contact if we can derive it
        if (!shopContact && shopName.startsWith('User_')) {
          updates.contact = shopName.replace('User_', '').trim();
        } else if (!shopContact) {
          updates.contact = String(matchingUser.mob_num || '').trim();
        }
        
        await Shop.update(shop.id, updates);
        
        console.log(`✅ Fixed: Shop ${shop.id} (${shop.shopname || 'N/A'})`);
        console.log(`   → User ${matchingUser.id} (${matchingUser.name || 'N/A'})`);
        if (updates.contact) console.log(`   → Contact: ${updates.contact}`);
        console.log('');
        
        fixed++;
        fixedUserIds.add(matchingUser.id);
        fixedUserIds.add(WRONG_USER_ID);
      } catch (err) {
        console.error(`❌ Failed to fix shop ${shop.id}:`, err.message);
        failed++;
      }
    } else {
      console.log(`⚠️  Cannot match: Shop ${shop.id} (${shop.shopname || 'N/A'}, contact: ${shopContact || 'N/A'})`);
      failed++;
    }
  }

  // Clear all caches
  if (fixed > 0) {
    console.log('🔄 Clearing caches...\n');
    
    const cacheKeys = [RedisCache.listKey('paid_subscriptions')];
    
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
      try { await RedisCache.delete(key); } catch (e) {}
    }
    console.log(`✅ Cleared ${cacheKeys.length} cache keys\n`);
  }

  console.log('='.repeat(80));
  console.log(`  RESULTS: ${fixed} fixed, ${failed} could not be matched`);
  console.log('='.repeat(80));
  console.log('\n✅ Done! Refresh admin panel to see updates.\n');
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
