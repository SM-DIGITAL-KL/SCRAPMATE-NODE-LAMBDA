/**
 * Script to add a 1-month subscription for a user by mobile number
 * Usage: node scripts/addSubscriptionByMobile.js <mobile_number> [package_id]
 * Example: node scripts/addSubscriptionByMobile.js 9074135121
 */

require('dotenv').config();
const User = require('../models/User');
const Invoice = require('../models/Invoice');
const SubscriptionPackage = require('../models/SubscriptionPackage');
const Shop = require('../models/Shop');

async function addSubscriptionByMobile(mobileNumber, packageId = null) {
  try {
    console.log(`\n🔄 Adding 1-month subscription for mobile ${mobileNumber}...\n`);

    // Find user by mobile number
    const user = await User.findByMobile(mobileNumber);
    if (!user) {
      console.error(`❌ User not found with mobile number: ${mobileNumber}`);
      process.exit(1);
    }

    console.log(`✅ Found user: ID=${user.id}, Name=${user.name || 'N/A'}, Type=${user.user_type}`);

    // Find a monthly subscription package if packageId not provided
    let packageData;
    if (packageId) {
      packageData = await SubscriptionPackage.getById(packageId);
    } else {
      // Find first available monthly package for vendors (B2C or B2B)
      const allPackages = await SubscriptionPackage.getAll();
      packageData = allPackages.find(p => 
        p.duration === 'month' && 
        (p.userType === 'b2c' || p.userType === 'b2b' || !p.userType) &&
        p.isActive !== false
      );
      
      if (!packageData) {
        console.error('❌ No monthly subscription package found. Please specify a package_id.');
        process.exit(1);
      }
    }

    if (!packageData) {
      console.error(`❌ Package not found: ${packageId}`);
      process.exit(1);
    }

    console.log(`📦 Using package: ${packageData.name} (${packageData.duration})`);

    // Check existing invoices for this user
    const userInvoices = await Invoice.findByUserId(user.id);
    
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
      // Extend from the end of existing subscription
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
      user_id: user.id,
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
        source: 'admin_script',
        created_at: new Date().toISOString()
      }),
      approval_status: 'approved', // Auto-approve for admin script
      approval_notes: 'Added via admin script'
    });

    console.log(`✅ Invoice created: ${newInvoice.id}`);

    // Update shop subscription status
    // For B2C subscriptions, only update B2C shops (shop_type: 3)
    // For B2B subscriptions, only update B2B shops (shop_type: 1 or 4)
    try {
      const allShops = await Shop.findAllByUserId(user.id);
      if (allShops && allShops.length > 0) {
        // Determine which shops to update based on package userType or shop_type
        const isB2CPackage = packageData.userType === 'b2c' || packageData.name?.toLowerCase().includes('b2c');
        const isB2BPackage = packageData.userType === 'b2b' || packageData.name?.toLowerCase().includes('b2b');
        
        let shopsToUpdate = [];
        if (isB2CPackage) {
          // Update only B2C shops (shop_type: 3)
          shopsToUpdate = allShops.filter(s => s.shop_type === 3);
          console.log(`📦 B2C package detected - updating ${shopsToUpdate.length} B2C shop(s)`);
        } else if (isB2BPackage) {
          // Update only B2B shops (shop_type: 1 or 4)
          shopsToUpdate = allShops.filter(s => s.shop_type === 1 || s.shop_type === 4);
          console.log(`📦 B2B package detected - updating ${shopsToUpdate.length} B2B shop(s)`);
        } else {
          // Default: update all shops
          shopsToUpdate = allShops;
          console.log(`📦 Generic package - updating all ${shopsToUpdate.length} shop(s)`);
        }
        
        if (shopsToUpdate.length === 0) {
          console.log(`⚠️  No matching shops found for package type (B2C: ${isB2CPackage}, B2B: ${isB2BPackage})`);
        } else {
          for (const shop of shopsToUpdate) {
            await Shop.update(shop.id, {
              is_subscribed: true,
              subscription_ends_at: subscriptionEndsAt,
              is_subscription_ends: false,
              subscribed_duration: packageData.duration || 'month'
            });
            console.log(`✅ Updated shop ${shop.id} (type: ${shop.shop_type}, name: ${shop.shopname}) subscription status`);
          }
        }
      } else {
        console.log(`⚠️  No shop found for user ${user.id}`);
      }
    } catch (shopError) {
      console.error('⚠️  Error updating shop subscription:', shopError.message);
      // Continue even if shop update fails
    }

    // Invalidate profile cache so app gets fresh data
    try {
      const RedisCache = require('../utils/redisCache');
      // Try multiple cache key patterns that might be used
      const cacheKeys = [
        `v2_profile_${user.id}`,
        `profile_${user.id}`,
        `user_${user.id}_profile`,
        `v2_api_profile_${user.id}`
      ];
      
      for (const key of cacheKeys) {
        try {
          await RedisCache.delete(key);
          console.log(`✅ Invalidated cache key: ${key}`);
        } catch (err) {
          // Continue with other keys
        }
      }
      console.log(`✅ Profile cache invalidated for user ${user.id}`);
    } catch (cacheError) {
      console.error('⚠️  Error invalidating cache:', cacheError.message);
      // Continue even if cache invalidation fails - the profile service will fetch fresh data
    }
    
    console.log(`\n📱 To see the subscription in the vendor app:`);
    console.log(`   1. Close and reopen the app, OR`);
    console.log(`   2. Pull to refresh on the profile/subscription screen`);
    console.log(`   3. The invoice will appear in the subscription list\n`);

    console.log(`\n✅ Successfully added 1-month subscription for mobile ${mobileNumber}`);
    console.log(`   User ID: ${user.id}`);
    console.log(`   User Name: ${user.name || 'N/A'}`);
    console.log(`   Invoice ID: ${newInvoice.id}`);
    console.log(`   Package: ${packageData.name}`);
    console.log(`   From: ${fromDate}`);
    console.log(`   To: ${toDateStr}`);
    console.log(`   Status: approved\n`);

    process.exit(0);
  } catch (error) {
    console.error('❌ Error adding subscription:', error);
    console.error('   Stack:', error.stack);
    process.exit(1);
  }
}

// Get command line arguments
const mobileNumber = process.argv[2];
const packageId = process.argv[3] || null;

if (!mobileNumber) {
  console.error('❌ Usage: node scripts/addSubscriptionByMobile.js <mobile_number> [package_id]');
  console.error('   Example: node scripts/addSubscriptionByMobile.js 9074135121');
  process.exit(1);
}

addSubscriptionByMobile(mobileNumber, packageId);
