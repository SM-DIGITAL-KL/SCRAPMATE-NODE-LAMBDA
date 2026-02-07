/**
 * Script to record a missing Instamojo payment in the system
 * This creates an invoice record for a payment that was successful at Instamojo
 * but was not recorded in the database (e.g., due to app closure or network issues)
 * 
 * Usage: node scripts/recordMissingInstamojoPayment.js <mobile_number> <payment_moj_id> <amount> [package_id]
 * Example: node scripts/recordMissingInstamojoPayment.js 9962743082 MOJO6201Q05Q81099178 587.64
 */

require('dotenv').config();
const User = require('../models/User');
const Invoice = require('../models/Invoice');
const SubscriptionPackage = require('../models/SubscriptionPackage');
const Shop = require('../models/Shop');
const RedisCache = require('../utils/redisCache');

async function recordMissingInstamojoPayment(mobileNumber, paymentMojId, amount, packageId = null) {
  try {
    console.log(`\n🔄 Recording missing Instamojo payment for mobile ${mobileNumber}...\n`);
    console.log('='.repeat(70));

    // Validate inputs
    if (!mobileNumber || !paymentMojId || !amount) {
      console.error('❌ Missing required parameters');
      console.log('Usage: node scripts/recordMissingInstamojoPayment.js <mobile_number> <payment_moj_id> <amount> [package_id]');
      console.log('Example: node scripts/recordMissingInstamojoPayment.js 9962743082 MOJO6201Q05Q81099178 587.64');
      process.exit(1);
    }

    // Check if payment already exists
    console.log('🔍 Checking if payment already exists...');
    const allInvoices = await Invoice.getAll();
    const existingInvoice = allInvoices.find(inv => 
      inv.payment_moj_id && String(inv.payment_moj_id) === String(paymentMojId)
    );
    
    if (existingInvoice) {
      console.log(`⚠️  Payment with ID ${paymentMojId} already exists!`);
      console.log(`   Invoice ID: ${existingInvoice.id}`);
      console.log(`   User ID: ${existingInvoice.user_id}`);
      console.log(`   Status: ${existingInvoice.approval_status || 'pending'}`);
      console.log(`   Type: ${existingInvoice.type || 'N/A'}`);
      
      // If type is not 'Paid', update it
      if (existingInvoice.type !== 'Paid' && existingInvoice.type !== 'paid') {
        console.log('\n📝 Updating invoice type to "Paid"...');
        await Invoice.update(existingInvoice.id, { type: 'Paid' });
        console.log('✅ Invoice type updated to "Paid"');
        
        // Clear cache
        await RedisCache.delete(RedisCache.listKey('paid_subscriptions'));
        console.log('🗑️  Cache cleared');
      }
      
      console.log('\n✅ Payment already recorded. No action needed.');
      process.exit(0);
    }

    // Find user by mobile number
    console.log('\n🔍 Finding user by mobile number...');
    const user = await User.findByMobile(mobileNumber);
    if (!user) {
      console.error(`❌ User not found with mobile number: ${mobileNumber}`);
      process.exit(1);
    }

    console.log(`✅ Found user:`);
    console.log(`   ID: ${user.id}`);
    console.log(`   Name: ${user.name || 'N/A'}`);
    console.log(`   Type: ${user.user_type || 'N/A'}`);
    console.log(`   Email: ${user.email || 'N/A'}`);

    // Find appropriate package
    let packageData;
    if (packageId) {
      packageData = await SubscriptionPackage.getById(packageId);
    } else {
      // Find package matching the amount
      console.log(`\n🔍 Finding package for amount ₹${amount}...`);
      const allPackages = await SubscriptionPackage.getAll();
      
      // Try to find exact match first
      packageData = allPackages.find(p => 
        parseFloat(p.price) === parseFloat(amount) && 
        p.isActive !== false
      );
      
      // If no exact match, find closest monthly package
      if (!packageData) {
        packageData = allPackages.find(p => 
          p.duration === 'month' && 
          (p.userType === 'b2c' || p.userType === 'b2b' || !p.userType) &&
          p.isActive !== false
        );
      }
    }

    if (!packageData) {
      console.error(`❌ No suitable package found for amount ₹${amount}`);
      console.log('Please specify a package_id as the 4th argument');
      process.exit(1);
    }

    console.log(`✅ Using package:`);
    console.log(`   ID: ${packageData.id}`);
    console.log(`   Name: ${packageData.name}`);
    console.log(`   Price: ₹${packageData.price}`);
    console.log(`   Duration: ${packageData.duration}`);

    // Check existing invoices for this user
    console.log('\n🔍 Checking existing subscriptions...');
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
      fromDate = latestActiveInvoice.to_date;
      console.log(`📅 Extending from existing subscription end: ${fromDate}`);
    } else {
      console.log(`📅 Starting new subscription from: ${fromDate}`);
    }

    const toDate = new Date(fromDate);
    if (packageData.duration === 'month') {
      toDate.setMonth(toDate.getMonth() + 1);
    } else if (packageData.duration === 'year') {
      toDate.setFullYear(toDate.getFullYear() + 1);
    } else {
      // Default to 30 days
      toDate.setDate(toDate.getDate() + 30);
    }
    
    const toDateStr = toDate.toISOString().split('T')[0];
    const subscriptionEndsAt = toDate.toISOString();

    console.log(`📅 Subscription period: ${fromDate} to ${toDateStr}`);

    // Create invoice with all Instamojo payment details
    console.log('\n📝 Creating invoice record...');
    const newInvoice = await Invoice.create({
      user_id: user.id,
      package_id: packageData.id,
      from_date: fromDate,
      to_date: toDateStr,
      name: packageData.name,
      displayname: packageData.name,
      type: 'Paid',  // IMPORTANT: Must be 'Paid' to show in paidSubscriptions
      price: amount,
      duration: packageData.duration,
      payment_moj_id: paymentMojId,
      payment_req_id: null,
      pay_details: JSON.stringify({
        source: 'instamojo_manual_record',
        payment_id: paymentMojId,
        amount: amount,
        paymentMethod: 'Instamojo',
        timestamp: new Date().toISOString(),
        recorded_at: new Date().toISOString(),
        notes: 'Payment was successful at Instamojo but not recorded in database - manually recorded via script'
      }),
      approval_status: 'pending',  // Admin needs to approve this
      approval_notes: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    });

    console.log(`✅ Invoice created successfully:`);
    console.log(`   Invoice ID: ${newInvoice.id}`);
    console.log(`   Type: ${newInvoice.type}`);
    console.log(`   Payment ID: ${newInvoice.payment_moj_id}`);
    console.log(`   Status: ${newInvoice.approval_status}`);

    // Update shop subscription
    console.log('\n📝 Updating shop subscription...');
    try {
      const allShops = await Shop.findAllByUserId(user.id);
      if (allShops && allShops.length > 0) {
        const isB2CPackage = packageData.userType === 'b2c' || packageData.name?.toLowerCase().includes('b2c');
        const isB2BPackage = packageData.userType === 'b2b' || packageData.name?.toLowerCase().includes('b2b');
        
        let shopsToUpdate = [];
        if (isB2CPackage) {
          shopsToUpdate = allShops.filter(s => s.shop_type === 3);
        } else if (isB2BPackage) {
          shopsToUpdate = allShops.filter(s => s.shop_type === 1 || s.shop_type === 4);
        } else {
          shopsToUpdate = allShops;
        }
        
        for (const shop of shopsToUpdate) {
          await Shop.update(shop.id, {
            is_subscribed: true,
            subscription_ends_at: subscriptionEndsAt,
            is_subscription_ends: false,
            subscribed_duration: packageData.duration || 'month'
          });
          console.log(`✅ Updated shop ${shop.id} (${shop.shopname || 'N/A'})`);
        }
      } else {
        console.log(`⚠️  No shops found for user ${user.id}`);
      }
    } catch (shopError) {
      console.error('⚠️  Error updating shop:', shopError.message);
    }

    // Clear cache
    console.log('\n🗑️  Clearing caches...');
    try {
      await RedisCache.delete(RedisCache.listKey('paid_subscriptions'));
      await RedisCache.delete(RedisCache.listKey('subscribers_list'));
      await RedisCache.invalidateTableCache('invoice');
      console.log('✅ Caches cleared');
    } catch (cacheError) {
      console.error('⚠️  Error clearing cache:', cacheError.message);
    }

    // Summary
    console.log('\n' + '='.repeat(70));
    console.log('✅ MISSING PAYMENT RECORDED SUCCESSFULLY!');
    console.log('='.repeat(70));
    console.log(`\n📋 Summary:`);
    console.log(`   User: ${user.name || 'N/A'} (${mobileNumber})`);
    console.log(`   User ID: ${user.id}`);
    console.log(`   Payment ID: ${paymentMojId}`);
    console.log(`   Amount: ₹${amount}`);
    console.log(`   Invoice ID: ${newInvoice.id}`);
    console.log(`   Package: ${packageData.name}`);
    console.log(`   Period: ${fromDate} to ${toDateStr}`);
    console.log(`   Status: PENDING APPROVAL`);
    console.log(`\n⚠️  IMPORTANT: The subscription is created with "pending" approval status.`);
    console.log(`   An admin must approve it at: https://mono.scrapmate.co.in/paidSubscriptions`);
    console.log(`\n📱 The user should see this in their app after admin approval.`);
    console.log('='.repeat(70) + '\n');

    process.exit(0);
  } catch (error) {
    console.error('\n❌ Error recording payment:', error);
    console.error('   Stack:', error.stack);
    process.exit(1);
  }
}

// Get command line arguments
const mobileNumber = process.argv[2];
const paymentMojId = process.argv[3];
const amount = process.argv[4];
const packageId = process.argv[5] || null;

if (!mobileNumber || !paymentMojId || !amount) {
  console.error('\n❌ Usage: node scripts/recordMissingInstamojoPayment.js <mobile_number> <payment_moj_id> <amount> [package_id]');
  console.error('Example: node scripts/recordMissingInstamojoPayment.js 9962743082 MOJO6201Q05Q81099178 587.64');
  console.error('\nArguments:');
  console.error('  mobile_number  - User\'s registered mobile number');
  console.error('  payment_moj_id - Instamojo Payment ID (e.g., MOJO6201Q05Q81099178)');
  console.error('  amount         - Payment amount (e.g., 587.64)');
  console.error('  package_id     - (Optional) Specific package ID to use');
  process.exit(1);
}

recordMissingInstamojoPayment(mobileNumber, paymentMojId, amount, packageId);
