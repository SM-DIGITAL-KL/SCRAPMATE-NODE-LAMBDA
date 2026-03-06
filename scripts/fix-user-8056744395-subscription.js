/**
 * Script to check and fix subscription data for user with contact 8056744395
 * This ensures the user can accept scrap collection orders
 * 
 * Run with: node scripts/fix-user-8056744395-subscription.js
 */

require('dotenv').config();
const User = require('../models/User');
const Shop = require('../models/Shop');
const Invoice = require('../models/Invoice');
const RedisCache = require('../utils/redisCache');

const MOBILE_NUMBER = '8056744395';

async function findUserByMobile(mobile) {
  try {
    const allUsers = await User.getAll();
    const user = allUsers.find(u => 
      String(u.mob_num) === mobile || 
      u.phone === mobile ||
      u.mobile === mobile
    );
    return user;
  } catch (error) {
    console.error('Error finding user:', error);
    return null;
  }
}

async function main() {
  console.log('\n' + '='.repeat(70));
  console.log(`  CHECKING USER: ${MOBILE_NUMBER}`);
  console.log('='.repeat(70) + '\n');

  try {
    // Step 1: Find user
    const user = await findUserByMobile(MOBILE_NUMBER);
    
    if (!user) {
      console.log(`❌ User not found with mobile: ${MOBILE_NUMBER}`);
      process.exit(1);
    }

    console.log('✅ User Found:');
    console.log(`   ID: ${user.id}`);
    console.log(`   Name: ${user.name || 'N/A'}`);
    console.log(`   User Type: ${user.user_type || 'N/A'}`);
    console.log(`   Mobile: ${user.mob_num || user.phone || user.mobile || 'N/A'}`);
    console.log('');

    // Step 2: Find B2C shops for this user
    const allShops = await Shop.getAll();
    const userShops = allShops.filter(s => 
      s.user_id === user.id && s.shop_type === 3
    );
    const contactShops = allShops.filter(s => 
      s.shop_type === 3 && 
      (String(s.contact) === MOBILE_NUMBER || s.contact_number === MOBILE_NUMBER)
    );
    
    const allB2CShops = [...userShops, ...contactShops];
    const uniqueShops = [...new Map(allB2CShops.map(s => [s.id, s])).values()];

    console.log(`Found ${uniqueShops.length} B2C shop(s):\n`);

    // Step 3: Check each shop's subscription status
    for (const shop of uniqueShops) {
      console.log(`📊 Shop ID: ${shop.id}`);
      console.log(`   Name: ${shop.shopname || 'N/A'}`);
      console.log(`   Type: ${shop.shop_type} (${shop.shop_type === 3 ? 'B2C' : 'Other'})`);
      console.log(`   Current Subscription Status:`);
      console.log(`      is_subscribed: ${shop.is_subscribed} (${typeof shop.is_subscribed})`);
      console.log(`      is_subscription_ends: ${shop.is_subscription_ends} (${typeof shop.is_subscription_ends})`);
      console.log(`      subscription_ends_at: ${shop.subscription_ends_at || 'N/A'}`);
      console.log(`      subscribed_duration: ${shop.subscribed_duration || 'N/A'}`);
      
      // Check if subscription is valid
      const now = new Date();
      const endsAt = shop.subscription_ends_at ? new Date(shop.subscription_ends_at) : null;
      const isExpired = endsAt && endsAt < now;
      const isExplicitlySubscribed = shop.is_subscribed === true;
      const isEnded = shop.is_subscription_ends === true;
      
      console.log(`\n   Analysis:`);
      console.log(`      Explicitly Subscribed: ${isExplicitlySubscribed ? '✅ YES' : '❌ NO'}`);
      console.log(`      Subscription Ended Flag: ${isEnded ? '❌ YES (ended)' : '✅ NO'}`);
      console.log(`      Expired by Date: ${isExpired ? '❌ YES (expired)' : '✅ NO'}`);
      
      const canAcceptOrders = isExplicitlySubscribed && !isEnded && !isExpired;
      console.log(`      Can Accept Orders: ${canAcceptOrders ? '✅ YES' : '❌ NO'}`);
      console.log('');

      // Step 4: If subscription is not valid, fix it
      if (!canAcceptOrders) {
        console.log(`   ⚠️  Subscription needs fixing...`);
        
        // Find the latest invoice for this user
        const invoices = await Invoice.findByUserId(user.id);
        const paidInvoices = invoices.filter(inv => 
          inv.type === 'Paid' || inv.type === 'paid'
        );
        
        if (paidInvoices.length > 0) {
          const latestInvoice = paidInvoices[0];
          console.log(`   📝 Latest Invoice: ${latestInvoice.id}`);
          console.log(`      From: ${latestInvoice.from_date}`);
          console.log(`      To: ${latestInvoice.to_date}`);
          
          // Calculate new subscription end date
          const toDate = latestInvoice.to_date || '2026-02-22';
          const endDate = new Date(toDate);
          endDate.setHours(23, 59, 59, 999);
          
          // Update shop with correct subscription data
          await Shop.update(shop.id, {
            is_subscribed: true,
            subscription_ends_at: endDate.toISOString(),
            is_subscription_ends: false,
            subscribed_duration: 'month',
            user_id: user.id
          });
          
          console.log(`   ✅ Shop ${shop.id} updated with subscription data`);
          console.log(`      is_subscribed: true`);
          console.log(`      subscription_ends_at: ${endDate.toISOString()}`);
          console.log(`      is_subscription_ends: false`);
        } else {
          console.log(`   ⚠️  No paid invoices found for this user`);
          
          // Set default subscription data (15 days from now as a fallback)
          const defaultEndDate = new Date();
          defaultEndDate.setDate(defaultEndDate.getDate() + 15);
          defaultEndDate.setHours(23, 59, 59, 999);
          
          await Shop.update(shop.id, {
            is_subscribed: true,
            subscription_ends_at: defaultEndDate.toISOString(),
            is_subscription_ends: false,
            subscribed_duration: 'month',
            user_id: user.id
          });
          
          console.log(`   ✅ Shop ${shop.id} updated with DEFAULT subscription data`);
          console.log(`      (15 days from today)`);
        }
      } else {
        console.log(`   ✅ Subscription is already valid\n`);
      }
    }

    // Step 5: Clear Redis cache for this user
    console.log('\n🔄 Clearing Redis caches...');
    const cacheKeys = [
      RedisCache.userKey(user.id, 'profile'),
      `v2_profile_${user.id}`,
      `profile_${user.id}`,
      `user_${user.id}_profile`,
      `v2_api_profile_${user.id}`,
      `user:mobile:${MOBILE_NUMBER}`,
      `shop:by_user:${user.id}`,
      `shop:all_by_user:${user.id}`,
      RedisCache.listKey('paid_subscriptions')
    ];
    
    for (const key of cacheKeys) {
      try {
        await RedisCache.delete(key);
        console.log(`   ✅ Cleared: ${key}`);
      } catch (err) {
        console.log(`   ⚠️  Could not clear: ${key}`);
      }
    }

    // Step 6: Summary
    console.log('\n' + '='.repeat(70));
    console.log('  SUMMARY');
    console.log('='.repeat(70));
    console.log(`\n✅ User ${MOBILE_NUMBER} subscription check complete`);
    console.log(`   User ID: ${user.id}`);
    console.log(`   Shops Updated: ${uniqueShops.length}`);
    console.log(`   Caches Cleared: ${cacheKeys.length}`);
    console.log('\n📝 The user should now be able to accept scrap collection orders.');
    console.log('   Ask the user to:');
    console.log('   1. Pull down to refresh the dashboard');
    console.log('   2. Or kill and reopen the app');
    console.log('   3. The accept button should no longer be blurred');
    console.log('\n' + '='.repeat(70) + '\n');

    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

main();
