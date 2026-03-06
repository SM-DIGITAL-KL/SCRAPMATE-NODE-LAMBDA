/**
 * Script to fix B2C subscription for phone number 9074135121
 * Deletes incorrect invoices and creates a proper 1-month B2C plan
 * 
 * Usage: node scripts/fix-b2c-subscription.js
 */

require('dotenv').config();
const User = require('../models/User');
const Invoice = require('../models/Invoice');
const SubscriptionPackage = require('../models/SubscriptionPackage');
const Shop = require('../models/Shop');

const MOBILE_NUMBER = '9074135121';
const INVOICE_IDS_TO_DELETE = [1770476295950, 1770476352352]; // The two incorrect invoices

async function fixB2CSubscription() {
  try {
    console.log(`\n🔧 Fixing B2C subscription for ${MOBILE_NUMBER}...\n`);

    // Step 1: Find the B2C shop
    const allShops = await Shop.getAll();
    const b2cShops = allShops.filter(s => 
      s.shop_type === 3 && 
      (s.contact === MOBILE_NUMBER || s.contact_number === MOBILE_NUMBER)
    );

    if (b2cShops.length === 0) {
      console.error(`❌ No B2C shop found for ${MOBILE_NUMBER}`);
      process.exit(1);
    }

    const b2cShop = b2cShops[0];
    console.log(`✅ Found B2C Shop: ${b2cShop.shopname || b2cShop.name} (ID: ${b2cShop.id})`);
    console.log(`   Current User ID: ${b2cShop.user_id}`);

    // Step 2: Delete the incorrect invoices
    console.log(`\n🗑️  Deleting incorrect invoices...`);
    for (const invoiceId of INVOICE_IDS_TO_DELETE) {
      try {
        const invoice = await Invoice.findById(invoiceId);
        if (invoice) {
          await Invoice.delete(invoiceId);
          console.log(`   ✅ Deleted invoice ${invoiceId}`);
        } else {
          console.log(`   ⚠️  Invoice ${invoiceId} not found (may already be deleted)`);
        }
      } catch (err) {
        console.log(`   ⚠️  Error deleting invoice ${invoiceId}: ${err.message}`);
      }
    }

    // Step 3: Find B2C Monthly Plan package
    const allPackages = await SubscriptionPackage.getAll();
    const b2cPackage = allPackages.find(p => 
      p.duration === 'month' && 
      (p.userType === 'b2c' || p.name?.toLowerCase().includes('b2c')) &&
      p.isActive !== false
    );

    if (!b2cPackage) {
      console.error(`❌ No B2C Monthly Plan package found`);
      process.exit(1);
    }

    console.log(`\n📦 Using B2C Package: ${b2cPackage.name}`);

    // Step 4: Create proper 1-month subscription dates
    const fromDate = '2026-02-07';
    const toDate = '2026-03-07';
    const subscriptionEndsAt = '2026-03-07T23:59:59.999Z';

    console.log(`\n📅 Subscription Period:`);
    console.log(`   From: ${fromDate}`);
    console.log(`   To: ${toDate}`);

    // Step 5: Create invoice for the B2C shop's user
    const newInvoice = await Invoice.create({
      user_id: b2cShop.user_id,
      package_id: b2cPackage.id,
      from_date: fromDate,
      to_date: toDate,
      name: b2cPackage.name,
      displayname: b2cPackage.name,
      type: 'Paid',
      price: b2cPackage.price || 0,
      duration: b2cPackage.duration,
      payment_moj_id: null,
      payment_req_id: null,
      pay_details: JSON.stringify({ 
        source: 'admin_script_b2c_fixed',
        created_at: new Date().toISOString(),
        shop_id: b2cShop.id,
        mobile_number: MOBILE_NUMBER,
        shop_name: b2cShop.shopname || b2cShop.name
      }),
      approval_status: 'approved',
      approval_notes: 'B2C Monthly Plan - Fixed'
    });

    console.log(`\n✅ Created new invoice: ${newInvoice.id}`);

    // Step 6: Update B2C shop subscription status
    await Shop.update(b2cShop.id, {
      is_subscribed: true,
      subscription_ends_at: subscriptionEndsAt,
      is_subscription_ends: false,
      subscribed_duration: 'month'
    });
    console.log(`✅ Updated B2C shop subscription status`);

    // Step 7: Update all B2C shops for this phone number
    for (const shop of b2cShops) {
      await Shop.update(shop.id, {
        is_subscribed: true,
        subscription_ends_at: subscriptionEndsAt,
        is_subscription_ends: false,
        subscribed_duration: 'month'
      });
      console.log(`✅ Updated B2C shop: ${shop.shopname || shop.name} (${shop.id})`);
    }

    // Step 8: Invalidate caches
    try {
      const RedisCache = require('../utils/redisCache');
      const cacheKeys = [
        `v2_profile_${b2cShop.user_id}`,
        `profile_${b2cShop.user_id}`,
        `user_${b2cShop.user_id}_profile`,
        `v2_api_profile_${b2cShop.user_id}`,
        `shop:${b2cShop.id}`,
        `shop:by_user:${b2cShop.user_id}`,
        `shop:all_by_user:${b2cShop.user_id}`
      ];
      
      for (const key of cacheKeys) {
        try {
          await RedisCache.delete(key);
          console.log(`✅ Invalidated cache: ${key}`);
        } catch (err) {
          // Continue
        }
      }
    } catch (cacheError) {
      console.error('⚠️  Cache error:', cacheError.message);
    }

    // Summary
    console.log(`\n${'='.repeat(60)}`);
    console.log(`✅ B2C SUBSCRIPTION FIXED SUCCESSFULLY!`);
    console.log(`${'='.repeat(60)}`);
    console.log(`\n📱 Mobile Number: ${MOBILE_NUMBER}`);
    console.log(`🏪 B2C Shop: ${b2cShop.shopname || b2cShop.name}`);
    console.log(`🏪 Shop ID: ${b2cShop.id}`);
    console.log(`📝 Invoice ID: ${newInvoice.id}`);
    console.log(`📦 Package: ${b2cPackage.name}`);
    console.log(`📅 Valid From: ${fromDate}`);
    console.log(`📅 Valid Until: ${toDate}`);
    console.log(`✅ Status: APPROVED`);
    console.log(`\n💰 Price: ₹${b2cPackage.price || 0}`);
    
    console.log(`\n📱 Next steps for the vendor:`);
    console.log(`   1. Close and reopen the vendor app`);
    console.log(`   2. Go to Subscription screen`);
    console.log(`   3. Should see: "${b2cPackage.name}"`);
    console.log(`   4. Valid: ${fromDate} to ${toDate}\n`);

    process.exit(0);
  } catch (error) {
    console.error('❌ Error fixing subscription:', error);
    console.error('Stack:', error.stack);
    process.exit(1);
  }
}

fixB2CSubscription();
