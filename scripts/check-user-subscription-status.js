/**
 * Script to check subscription status for any user by mobile number
 * Usage: node scripts/check-user-subscription-status.js <mobile_number>
 * 
 * Example: node scripts/check-user-subscription-status.js 8056744395
 */

require('dotenv').config();
const User = require('../models/User');
const Shop = require('../models/Shop');
const Invoice = require('../models/Invoice');

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
  const mobileNumber = process.argv[2];
  
  if (!mobileNumber) {
    console.log('\nUsage: node check-user-subscription-status.js <mobile_number>');
    console.log('Example: node check-user-subscription-status.js 8056744395\n');
    process.exit(1);
  }

  console.log('\n' + '='.repeat(70));
  console.log(`  SUBSCRIPTION STATUS CHECK: ${mobileNumber}`);
  console.log('='.repeat(70) + '\n');

  try {
    // Step 1: Find user
    const user = await findUserByMobile(mobileNumber);
    
    if (!user) {
      console.log(`❌ User not found with mobile: ${mobileNumber}\n`);
      process.exit(1);
    }

    console.log('👤 USER INFORMATION:');
    console.log(`   ID: ${user.id}`);
    console.log(`   Name: ${user.name || 'N/A'}`);
    console.log(`   User Type: ${user.user_type || 'N/A'}`);
    console.log(`   Mobile: ${user.mob_num || user.phone || user.mobile || 'N/A'}`);
    console.log(`   App Type: ${user.app_type || 'N/A'}`);
    console.log(`   App Version: ${user.app_version || 'N/A'}`);
    console.log('');

    // Step 2: Find B2C shops for this user
    const allShops = await Shop.getAll();
    const userShops = allShops.filter(s => 
      s.user_id === user.id && s.shop_type === 3
    );
    const contactShops = allShops.filter(s => 
      s.shop_type === 3 && 
      (String(s.contact) === mobileNumber || s.contact_number === mobileNumber)
    );
    
    const allB2CShops = [...userShops, ...contactShops];
    const uniqueShops = [...new Map(allB2CShops.map(s => [s.id, s])).values()];

    console.log(`🏪 B2C SHOPS (${uniqueShops.length} found):\n`);

    // Step 3: Check each shop's subscription status
    for (const shop of uniqueShops) {
      console.log('─'.repeat(70));
      console.log(`Shop ID: ${shop.id}`);
      console.log(`Name: ${shop.shopname || 'N/A'}`);
      console.log(`Type: ${shop.shop_type} (${shop.shop_type === 3 ? 'B2C' : 'Other'})`);
      console.log(`Contact: ${shop.contact || shop.contact_number || 'N/A'}`);
      console.log('');
      
      console.log('SUBSCRIPTION FIELDS:');
      console.log(`   is_subscribed: ${shop.is_subscribed} (${typeof shop.is_subscribed})`);
      console.log(`   is_subscription_ends: ${shop.is_subscription_ends} (${typeof shop.is_subscription_ends})`);
      console.log(`   subscription_ends_at: ${shop.subscription_ends_at || 'N/A'}`);
      console.log(`   subscribed_duration: ${shop.subscribed_duration || 'N/A'}`);
      console.log('');
      
      // Check if subscription is valid
      const now = new Date();
      const endsAt = shop.subscription_ends_at ? new Date(shop.subscription_ends_at) : null;
      const isExpired = endsAt && endsAt < now;
      const isExplicitlySubscribed = shop.is_subscribed === true;
      const isEnded = shop.is_subscription_ends === true;
      
      console.log('VALIDATION:');
      console.log(`   Current Time: ${now.toISOString()}`);
      console.log(`   Expires At: ${endsAt ? endsAt.toISOString() : 'N/A'}`);
      console.log(`   Explicitly Subscribed: ${isExplicitlySubscribed ? '✅ YES' : '❌ NO'}`);
      console.log(`   Subscription Ended Flag: ${isEnded ? '❌ ENDED' : '✅ NOT ENDED'}`);
      console.log(`   Expired by Date: ${isExpired ? '❌ EXPIRED' : '✅ NOT EXPIRED'}`);
      console.log('');
      
      const canAcceptOrders = isExplicitlySubscribed && !isEnded && !isExpired;
      console.log(`RESULT: ${canAcceptOrders ? '✅ CAN ACCEPT ORDERS' : '❌ CANNOT ACCEPT ORDERS'}`);
      
      if (!canAcceptOrders) {
        console.log('\nISSUES:');
        if (!isExplicitlySubscribed) {
          console.log('   ❌ is_subscribed is not explicitly true');
        }
        if (isEnded) {
          console.log('   ❌ is_subscription_ends is true');
        }
        if (isExpired) {
          console.log('   ❌ subscription_ends_at has passed');
        }
      }
      console.log('');
    }

    // Step 4: Check invoices
    console.log('─'.repeat(70));
    console.log('📝 INVOICES:\n');
    const invoices = await Invoice.findByUserId(user.id);
    const paidInvoices = invoices.filter(inv => 
      inv.type === 'Paid' || inv.type === 'paid'
    );
    
    if (paidInvoices.length === 0) {
      console.log('   No paid invoices found');
    } else {
      console.log(`   Found ${paidInvoices.length} paid invoice(s):\n`);
      paidInvoices.forEach((inv, idx) => {
        console.log(`   ${idx + 1}. Invoice ID: ${inv.id}`);
        console.log(`      Transaction ID: ${inv.payment_moj_id || 'N/A'}`);
        console.log(`      From: ${inv.from_date || 'N/A'}`);
        console.log(`      To: ${inv.to_date || 'N/A'}`);
        console.log(`      Amount: ₹${inv.amount || inv.price || 'N/A'}`);
        console.log(`      Status: ${inv.approval_status || 'pending'}`);
        console.log('');
      });
    }

    console.log('='.repeat(70));
    console.log('  CHECK COMPLETE');
    console.log('='.repeat(70) + '\n');

    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

main();
