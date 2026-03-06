/**
 * Script to apply B2C subscription to a specific shop by phone number
 * This finds the B2C shop linked to the phone number and applies the subscription
 * 
 * Usage: node scripts/apply-b2c-subscription-to-shop.js <phone_number>
 * Example: node scripts/apply-b2c-subscription-to-shop.js 9074135121
 */

require('dotenv').config();
const User = require('../models/User');
const Invoice = require('../models/Invoice');
const SubscriptionPackage = require('../models/SubscriptionPackage');
const Shop = require('../models/Shop');

async function applyB2CSubscriptionToShop(mobileNumber) {
  try {
    console.log(`\n🔄 Applying B2C 1-month subscription for mobile ${mobileNumber}...\n`);

    // Find user by mobile number
    const user = await User.findByMobile(mobileNumber);
    if (!user) {
      console.error(`❌ User not found with mobile number: ${mobileNumber}`);
      process.exit(1);
    }

    console.log(`✅ Found user: ID=${user.id}, Name=${user.name || 'N/A'}, Type=${user.user_type}`);

    // Find all shops linked to this phone number (via contact)
    const allShops = await Shop.getAll();
    const userShops = allShops.filter(s => s.user_id === user.id);
    const contactShops = allShops.filter(s => s.contact_number === mobileNumber || s.contact === mobileNumber);
    
    console.log(`\n📊 Shop Analysis:`);
    console.log(`   - Shops owned by user: ${userShops.length}`);
    console.log(`   - Shops with contact ${mobileNumber}: ${contactShops.length}`);
    
    // Find B2C shops (shop_type: 3)
    const b2cShops = [...userShops, ...contactShops].filter(s => s.shop_type === 3);
    const uniqueB2CShops = [...new Map(b2cShops.map(s => [s.id, s])).values()];
    
    console.log(`   - B2C Shops found: ${uniqueB2CShops.length}`);
    
    if (uniqueB2CShops.length === 0) {
      console.error(`❌ No B2C shop found for this phone number.`);
      console.log(`\n📱 To create a B2C subscription, the user needs:`);
      console.log(`   1. A B2C shop (shop_type: 3)`);
      console.log(`   2. The shop should be linked to their user account`);
      process.exit(1);
    }

    const targetShop = uniqueB2CShops[0];
    console.log(`\n✅ Target B2C Shop:`);
    console.log(`   Shop ID: ${targetShop.id}`);
    console.log(`   Shop Name: ${targetShop.shopname || targetShop.name || 'N/A'}`);
    console.log(`   Current User ID: ${targetShop.user_id}`);
    console.log(`   Shop Type: ${targetShop.shop_type} (B2C)`);

    // Find a monthly B2C subscription package
    const allPackages = await SubscriptionPackage.getAll();
    const packageData = allPackages.find(p => 
      p.duration === 'month' && 
      (p.userType === 'b2c' || p.name?.toLowerCase().includes('b2c')) &&
      p.isActive !== false
    ) || allPackages.find(p => 
      p.duration === 'month' && 
      p.isActive !== false
    );
    
    if (!packageData) {
      console.error('❌ No monthly subscription package found.');
      process.exit(1);
    }

    console.log(`\n📦 Using package: ${packageData.name} (${packageData.duration})`);

    // Check existing invoices for the shop's user
    const shopUserId = targetShop.user_id;
    const userInvoices = await Invoice.findByUserId(shopUserId);
    
    const latestActiveInvoice = userInvoices
      .filter(inv => {
        if (!inv.to_date) return false;
        const toDate = new Date(inv.to_date);
        return toDate >= new Date();
      })
      .sort((a, b) => new Date(b.to_date) - new Date(a.to_date))[0];

    // Calculate subscription dates
    let fromDate = new Date().toISOString().split('T')[0];
    if (latestActiveInvoice && latestActiveInvoice.to_date) {
      fromDate = latestActiveInvoice.to_date;
      console.log(`📅 Extending from existing subscription end date: ${fromDate}`);
    } else {
      console.log(`📅 Starting new subscription from: ${fromDate}`);
    }

    const toDate = new Date(fromDate);
    toDate.setMonth(toDate.getMonth() + 1);
    const toDateStr = toDate.toISOString().split('T')[0];
    const subscriptionEndsAt = toDate.toISOString();

    console.log(`📅 Subscription end date: ${toDateStr}`);

    // Create invoice with approved status
    const newInvoice = await Invoice.create({
      user_id: shopUserId,
      package_id: packageData.id,
      from_date: fromDate,
      to_date: toDateStr,
      name: packageData.name,
      displayname: packageData.name,
      type: 'Paid',
      price: packageData.price || 0,
      duration: packageData.duration,
      payment_moj_id: null,
      payment_req_id: null,
      pay_details: JSON.stringify({ 
        source: 'admin_script_b2c_shop',
        created_at: new Date().toISOString(),
        shop_id: targetShop.id,
        mobile_number: mobileNumber
      }),
      approval_status: 'approved',
      approval_notes: 'B2C subscription via admin script'
    });

    console.log(`✅ Invoice created: ${newInvoice.id}`);

    // Update the B2C shop subscription status
    await Shop.update(targetShop.id, {
      is_subscribed: true,
      subscription_ends_at: subscriptionEndsAt,
      is_subscription_ends: false,
      subscribed_duration: packageData.duration || 'month',
      user_id: user.id  // Link shop to the current user if different
    });
    console.log(`✅ Updated B2C shop ${targetShop.id} subscription status`);

    // Also update any other B2C shops for this user
    for (const shop of uniqueB2CShops.filter(s => s.id !== targetShop.id)) {
      await Shop.update(shop.id, {
        is_subscribed: true,
        subscription_ends_at: subscriptionEndsAt,
        is_subscription_ends: false,
        subscribed_duration: packageData.duration || 'month'
      });
      console.log(`✅ Updated additional B2C shop ${shop.id} subscription status`);
    }

    // Invalidate profile caches
    try {
      const RedisCache = require('../utils/redisCache');
      const cacheKeys = [
        `v2_profile_${shopUserId}`,
        `profile_${shopUserId}`,
        `user_${shopUserId}_profile`,
        `v2_api_profile_${shopUserId}`,
        `v2_profile_${user.id}`,
        `profile_${user.id}`,
        `user_${user.id}_profile`,
        `v2_api_profile_${user.id}`,
        `shop:${targetShop.id}`,
        `shop:by_user:${shopUserId}`,
        `shop:all_by_user:${shopUserId}`
      ];
      
      for (const key of cacheKeys) {
        try {
          await RedisCache.delete(key);
          console.log(`✅ Invalidated cache key: ${key}`);
        } catch (err) {
          // Continue with other keys
        }
      }
    } catch (cacheError) {
      console.error('⚠️  Error invalidating cache:', cacheError.message);
    }
    
    console.log(`\n${'='.repeat(60)}`);
    console.log(`✅ B2C SUBSCRIPTION SUCCESSFUL!`);
    console.log(`${'='.repeat(60)}`);
    console.log(`\n📱 Mobile Number: ${mobileNumber}`);
    console.log(`👤 User ID: ${user.id} (${user.name || 'N/A'})`);
    console.log(`🏪 B2C Shop ID: ${targetShop.id}`);
    console.log(`📝 Invoice ID: ${newInvoice.id}`);
    console.log(`📦 Package: ${packageData.name}`);
    console.log(`📅 Valid From: ${fromDate}`);
    console.log(`📅 Valid Until: ${toDateStr}`);
    console.log(`✅ Status: APPROVED`);
    
    console.log(`\n📱 Next steps for the vendor:`);
    console.log(`   1. Close and reopen the vendor app, OR`);
    console.log(`   2. Pull to refresh on the profile/subscription screen`);
    console.log(`   3. The subscription will be active immediately\n`);

    process.exit(0);
  } catch (error) {
    console.error('❌ Error applying B2C subscription:', error);
    console.error('   Stack:', error.stack);
    process.exit(1);
  }
}

// Get command line arguments
const mobileNumber = process.argv[2];

if (!mobileNumber) {
  console.error('❌ Usage: node scripts/apply-b2c-subscription-to-shop.js <mobile_number>');
  console.error('   Example: node scripts/apply-b2c-subscription-to-shop.js 9074135121');
  process.exit(1);
}

applyB2CSubscriptionToShop(mobileNumber);
