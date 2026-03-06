/**
 * Script to update subscription to expire today for phone number 9074135121
 * Sets both from_date and to_date to today (same day expiry)
 */

require('dotenv').config();
const User = require('../models/User');
const Invoice = require('../models/Invoice');
const Shop = require('../models/Shop');

const MOBILE = '9074135121';

async function updateSubscriptionExpireToday() {
  try {
    console.log(`\n🔄 Updating subscription to expire today for ${MOBILE}...\n`);

    // Find user by mobile
    const user = await User.findByMobile(MOBILE);
    if (!user) {
      console.error(`❌ User not found with mobile: ${MOBILE}`);
      process.exit(1);
    }

    console.log(`✅ Found user: ${user.name} (ID: ${user.id})`);

    // Get today's date
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0]; // 2026-02-07
    
    // Set subscription to expire at end of today
    const endOfToday = new Date(today);
    endOfToday.setHours(23, 59, 59, 999);
    const subscriptionEndsAt = endOfToday.toISOString();

    console.log(`\n📅 Subscription will expire TODAY:`);
    console.log(`   From: ${todayStr}`);
    console.log(`   To: ${todayStr} (Expires at end of day)`);

    // Find user's invoices
    const invoices = await Invoice.findByUserId(user.id);
    
    if (invoices.length === 0) {
      console.log(`⚠️  No invoices found for this user`);
      process.exit(1);
    }

    console.log(`\n📝 Found ${invoices.length} invoice(s)`);

    // Update the most recent invoice
    const latestInvoice = invoices[0];
    console.log(`\n📝 Updating Invoice ${latestInvoice.id}:`);
    console.log(`   Old From: ${latestInvoice.from_date}`);
    console.log(`   Old To: ${latestInvoice.to_date}`);

    await Invoice.update(latestInvoice.id, {
      from_date: todayStr,
      to_date: todayStr,
      pay_details: JSON.stringify({
        ...JSON.parse(latestInvoice.pay_details || '{}'),
        updated_at: new Date().toISOString(),
        expires_today: true
      })
    });

    console.log(`   ✅ Updated to: ${todayStr} to ${todayStr} (EXPIRES TODAY)`);

    // Find and update B2C shops - set as expired
    const allShops = await Shop.getAll();
    const userShops = allShops.filter(s => s.user_id === user.id && s.shop_type === 3);
    const contactShops = allShops.filter(s => 
      s.shop_type === 3 && 
      (s.contact === MOBILE || s.contact_number === MOBILE)
    );
    
    const allB2CShops = [...userShops, ...contactShops];
    const uniqueShops = [...new Map(allB2CShops.map(s => [s.id, s])).values()];

    console.log(`\n🏪 Updating ${uniqueShops.length} B2C shop(s) to expire today:`);
    
    for (const shop of uniqueShops) {
      await Shop.update(shop.id, {
        is_subscribed: true,
        subscription_ends_at: subscriptionEndsAt,
        is_subscription_ends: false, // Will be true after today
        subscribed_duration: 'day',
        user_id: user.id
      });
      console.log(`   ✅ ${shop.shopname || shop.name}: Expires ${todayStr}`);
    }

    // Invalidate caches
    try {
      const RedisCache = require('../utils/redisCache');
      const cacheKeys = [
        `v2_profile_${user.id}`,
        `profile_${user.id}`,
        `user_${user.id}_profile`,
        `v2_api_profile_${user.id}`,
        `user:mobile:${MOBILE}`
      ];
      
      for (const key of cacheKeys) {
        try {
          await RedisCache.delete(key);
        } catch (err) {
          // Continue
        }
      }
      console.log(`\n✅ Cache invalidated`);
    } catch (cacheError) {
      // Ignore
    }

    // Summary
    console.log(`\n${'='.repeat(60)}`);
    console.log(`✅ SUBSCRIPTION SET TO EXPIRE TODAY!`);
    console.log(`${'='.repeat(60)}`);
    console.log(`\n📱 Mobile: ${MOBILE}`);
    console.log(`👤 User: ${user.name} (ID: ${user.id})`);
    console.log(`📝 Invoice: ${latestInvoice.id}`);
    console.log(`📅 Valid From: ${todayStr}`);
    console.log(`📅 Expires: ${todayStr} (END OF DAY)`);
    console.log(`⚠️  Status: Will expire today at 23:59:59`);
    console.log(`🏪 Shops Updated: ${uniqueShops.length}`);
    console.log(`\n📱 Subscription valid for TODAY only\n`);

    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    console.error('Stack:', error.stack);
    process.exit(1);
  }
}

updateSubscriptionExpireToday();
