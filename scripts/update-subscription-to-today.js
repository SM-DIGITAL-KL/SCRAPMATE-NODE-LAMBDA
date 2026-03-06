/**
 * Script to update subscription validity to today for phone number 9074135121
 */

require('dotenv').config();
const User = require('../models/User');
const Invoice = require('../models/Invoice');
const Shop = require('../models/Shop');

const MOBILE = '9074135121';

async function updateSubscriptionToToday() {
  try {
    console.log(`\n🔄 Updating subscription validity to today for ${MOBILE}...\n`);

    // Find user by mobile
    const user = await User.findByMobile(MOBILE);
    if (!user) {
      console.error(`❌ User not found with mobile: ${MOBILE}`);
      process.exit(1);
    }

    console.log(`✅ Found user: ${user.name} (ID: ${user.id})`);

    // Get today's date
    const today = new Date();
    const fromDate = today.toISOString().split('T')[0]; // 2026-02-07
    
    // Calculate one month from today
    const toDate = new Date(today);
    toDate.setMonth(toDate.getMonth() + 1);
    const toDateStr = toDate.toISOString().split('T')[0]; // 2026-03-07
    
    const subscriptionEndsAt = toDate.toISOString();

    console.log(`\n📅 New Subscription Period:`);
    console.log(`   From: ${fromDate}`);
    console.log(`   To: ${toDateStr}`);

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
      from_date: fromDate,
      to_date: toDateStr,
      pay_details: JSON.stringify({
        ...JSON.parse(latestInvoice.pay_details || '{}'),
        updated_at: new Date().toISOString(),
        updated_to_today: true
      })
    });

    console.log(`   ✅ Updated to: ${fromDate} to ${toDateStr}`);

    // Find and update B2C shops
    const allShops = await Shop.getAll();
    const userShops = allShops.filter(s => s.user_id === user.id && s.shop_type === 3);
    const contactShops = allShops.filter(s => 
      s.shop_type === 3 && 
      (s.contact === MOBILE || s.contact_number === MOBILE)
    );
    
    const allB2CShops = [...userShops, ...contactShops];
    const uniqueShops = [...new Map(allB2CShops.map(s => [s.id, s])).values()];

    console.log(`\n🏪 Updating ${uniqueShops.length} B2C shop(s):`);
    
    for (const shop of uniqueShops) {
      await Shop.update(shop.id, {
        is_subscribed: true,
        subscription_ends_at: subscriptionEndsAt,
        is_subscription_ends: false,
        subscribed_duration: 'month',
        user_id: user.id
      });
      console.log(`   ✅ ${shop.shopname || shop.name}: ${fromDate} to ${toDateStr}`);
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
    console.log(`✅ SUBSCRIPTION UPDATED TO TODAY!`);
    console.log(`${'='.repeat(60)}`);
    console.log(`\n📱 Mobile: ${MOBILE}`);
    console.log(`👤 User: ${user.name} (ID: ${user.id})`);
    console.log(`📝 Invoice: ${latestInvoice.id}`);
    console.log(`📅 Valid From: ${fromDate} (TODAY)`);
    console.log(`📅 Valid Until: ${toDateStr}`);
    console.log(`🏪 Shops Updated: ${uniqueShops.length}`);
    console.log(`\n📱 Refresh the app to see updated subscription\n`);

    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    console.error('Stack:', error.stack);
    process.exit(1);
  }
}

updateSubscriptionToToday();
