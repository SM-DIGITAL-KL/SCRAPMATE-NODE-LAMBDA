/**
 * Script to create vendor_app user Shijo and apply B2C subscription
 * Same mobile can exist for both customer_app and vendor_app
 * User: Shijo, Email: ss@gmail.com, Mobile: 9074135121, Type: R, App: vendor_app
 */

require('dotenv').config();
const { getDynamoDBClient } = require('../config/dynamodb');
const { PutCommand, ScanCommand } = require('@aws-sdk/lib-dynamodb');
const User = require('../models/User');
const Invoice = require('../models/Invoice');
const SubscriptionPackage = require('../models/SubscriptionPackage');
const Shop = require('../models/Shop');

const USER_DATA = {
  name: 'Shijo',
  email: 'ss@gmail.com',
  mobile: '9074135121',
  mobileNum: 9074135121, // Number format for mob_num field
  user_type: 'R', // Regular/Retailer
  app_type: 'vendor_app'
};

async function createVendorUserAndSubscribe() {
  try {
    console.log(`\n🔄 Creating vendor_app user and applying B2C subscription...\n`);
    console.log('User Details:');
    console.log('  Name:', USER_DATA.name);
    console.log('  Email:', USER_DATA.email);
    console.log('  Mobile:', USER_DATA.mobile);
    console.log('  Type:', USER_DATA.user_type);
    console.log('  App Type:', USER_DATA.app_type);
    console.log('');

    const client = getDynamoDBClient();
    const now = new Date().toISOString();

    // Step 1: Check if vendor_app user already exists with this mobile
    console.log('🔍 Checking for existing vendor_app user with mobile', USER_DATA.mobile);
    
    // Scan for existing vendor_app user with this mobile
    const allUsers = await User.getAll();
    const existingVendor = allUsers.find(u => 
      u.mob_num == USER_DATA.mobileNum && 
      u.app_type === 'vendor_app'
    );
    
    if (existingVendor) {
      console.log(`⚠️  Vendor_app user already exists:`);
      console.log('  ID:', existingVendor.id);
      console.log('  Name:', existingVendor.name);
      console.log('');
      var userId = existingVendor.id;
      console.log('✅ Using existing vendor user for subscription');
    } else {
      console.log('✅ No existing vendor_app user found. Creating new...\n');
      
      // Step 2: Create new vendor_app user
      const userId = Date.now();
      const newUser = {
        id: userId,
        name: USER_DATA.name,
        email: USER_DATA.email,
        mob_num: USER_DATA.mobileNum, // Store as number for GSI
        user_type: USER_DATA.user_type,
        app_type: USER_DATA.app_type,
        del_status: '1',
        created_at: now,
        updated_at: now,
        status: 'active',
        approval_status: 'approved'
      };

      const putCommand = new PutCommand({
        TableName: 'users',
        Item: newUser
      });

      await client.send(putCommand);
      console.log(`✅ Vendor user created successfully!`);
      console.log(`   User ID: ${userId}`);
    }

    console.log('');

    // Step 3: Find B2C shops linked to this mobile
    const allShops = await Shop.getAll();
    const b2cShops = allShops.filter(s => 
      s.shop_type === 3 && 
      (s.contact === USER_DATA.mobile || s.contact_number === USER_DATA.mobile)
    );

    if (b2cShops.length === 0) {
      console.log(`⚠️  No B2C shops found for mobile ${USER_DATA.mobile}`);
      console.log(`   Creating subscription invoice only...`);
    } else {
      console.log(`✅ Found ${b2cShops.length} B2C shop(s)`);
      
      // Link shops to vendor user
      for (const shop of b2cShops) {
        await Shop.update(shop.id, {
          user_id: userId
        });
        console.log(`   Linked shop: ${shop.shopname || shop.name} (${shop.id})`);
      }
    }

    // Step 4: Find B2C Monthly Plan package
    const allPackages = await SubscriptionPackage.getAll();
    const b2cPackage = allPackages.find(p => 
      p.duration === 'month' && 
      (p.userType === 'b2c' || p.name?.toLowerCase().includes('b2c')) &&
      p.isActive !== false
    ) || allPackages.find(p => 
      p.duration === 'month' && 
      p.isActive !== false
    );

    if (!b2cPackage) {
      console.error(`❌ No monthly subscription package found`);
      process.exit(1);
    }

    console.log(`\n📦 Using Package: ${b2cPackage.name}`);

    // Step 5: Create subscription dates
    const fromDate = '2026-02-07';
    const toDate = '2026-03-07';
    const subscriptionEndsAt = '2026-03-07T23:59:59.999Z';

    console.log(`📅 Subscription Period: ${fromDate} to ${toDate}`);

    // Step 6: Create invoice
    const newInvoice = await Invoice.create({
      user_id: userId,
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
        source: 'admin_script_vendor_b2c',
        created_at: now,
        mobile_number: USER_DATA.mobile,
        user_name: USER_DATA.name
      }),
      approval_status: 'approved',
      approval_notes: 'Vendor B2C Monthly Plan'
    });

    console.log(`✅ Invoice created: ${newInvoice.id}`);

    // Step 7: Update B2C shops with subscription
    for (const shop of b2cShops) {
      await Shop.update(shop.id, {
        is_subscribed: true,
        subscription_ends_at: subscriptionEndsAt,
        is_subscription_ends: false,
        subscribed_duration: 'month',
        user_id: userId
      });
      console.log(`✅ Updated shop subscription: ${shop.shopname || shop.name}`);
    }

    // Step 8: Invalidate caches
    try {
      const RedisCache = require('../utils/redisCache');
      const cacheKeys = [
        `v2_profile_${userId}`,
        `profile_${userId}`,
        `user_${userId}_profile`,
        `v2_api_profile_${userId}`,
        `user:mobile:${USER_DATA.mobile}`
      ];
      
      for (const key of cacheKeys) {
        try {
          await RedisCache.delete(key);
        } catch (err) {
          // Continue
        }
      }
      console.log(`✅ Cache invalidated`);
    } catch (cacheError) {
      // Ignore cache errors
    }

    // Summary
    console.log(`\n${'='.repeat(60)}`);
    console.log(`✅ VENDOR USER & B2C SUBSCRIPTION COMPLETE!`);
    console.log(`${'='.repeat(60)}`);
    console.log(`\n👤 User Details:`);
    console.log(`   Name: ${USER_DATA.name}`);
    console.log(`   Email: ${USER_DATA.email}`);
    console.log(`   Mobile: ${USER_DATA.mobile}`);
    console.log(`   User ID: ${userId}`);
    console.log(`   Type: ${USER_DATA.user_type}`);
    console.log(`   App: ${USER_DATA.app_type}`);
    console.log(`\n📦 Subscription:`);
    console.log(`   Invoice ID: ${newInvoice.id}`);
    console.log(`   Package: ${b2cPackage.name}`);
    console.log(`   Valid: ${fromDate} to ${toDate}`);
    console.log(`   Price: ₹${b2cPackage.price || 0}`);
    console.log(`   Status: Approved`);
    console.log(`\n🏪 Linked Shops: ${b2cShops.length}`);
    
    b2cShops.forEach(shop => {
      console.log(`   - ${shop.shopname || shop.name} (${shop.id})`);
    });
    
    console.log(`\n📱 Next steps:`);
    console.log(`   1. Login to vendor app with mobile: ${USER_DATA.mobile}`);
    console.log(`   2. Go to Subscription screen`);
    console.log(`   3. Subscription will be active immediately\n`);

    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    console.error('Stack:', error.stack);
    process.exit(1);
  }
}

createVendorUserAndSubscribe();
