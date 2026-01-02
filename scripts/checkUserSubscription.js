/**
 * Script to check user subscription status
 * Usage: node scripts/checkUserSubscription.js <userId>
 */

const Invoice = require('../models/Invoice');
const Shop = require('../models/Shop');
const User = require('../models/User');

async function checkUserSubscription(userId) {
  try {
    console.log(`\n🔍 Checking subscription for User ID: ${userId}\n`);
    console.log('━'.repeat(60));

    // Get user info
    const user = await User.findById(userId);
    if (!user) {
      console.log(`❌ User ${userId} not found`);
      return;
    }

    console.log(`\n👤 User Information:`);
    console.log(`   Name: ${user.name || 'N/A'}`);
    console.log(`   Phone: ${user.phone || 'N/A'}`);
    console.log(`   Email: ${user.email || 'N/A'}`);
    console.log(`   User Type: ${user.user_type || 'N/A'}`);
    console.log(`   App Type: ${user.app_type || 'N/A'}`);

    // Get all invoices
    const invoices = await Invoice.findByUserId(userId);
    console.log(`\n📋 Invoices (${invoices.length} total):`);
    console.log('━'.repeat(60));

    if (invoices.length === 0) {
      console.log('   No invoices found');
    } else {
      invoices.forEach((inv, index) => {
        console.log(`\n   Invoice #${index + 1}:`);
        console.log(`   ├─ ID: ${inv.id}`);
        console.log(`   ├─ Package: ${inv.name || inv.displayname || 'N/A'}`);
        console.log(`   ├─ Type: ${inv.type || 'N/A'}`);
        console.log(`   ├─ Price: ₹${inv.price || '0'}`);
        console.log(`   ├─ Duration: ${inv.duration || 'N/A'} days`);
        console.log(`   ├─ From Date: ${inv.from_date || 'N/A'}`);
        console.log(`   ├─ To Date: ${inv.to_date || 'N/A'}`);
        console.log(`   ├─ Approval Status: ${inv.approval_status || 'N/A'}`);
        console.log(`   ├─ Approval Notes: ${inv.approval_notes || 'N/A'}`);
        console.log(`   ├─ Payment MOJ ID: ${inv.payment_moj_id || 'N/A'}`);
        console.log(`   ├─ Payment Req ID: ${inv.payment_req_id || 'N/A'}`);
        console.log(`   └─ Created At: ${inv.created_at || 'N/A'}`);
      });
    }

    // Get shops
    const shops = await Shop.findAllByUserId(userId);
    console.log(`\n🏪 Shops (${shops.length} total):`);
    console.log('━'.repeat(60));

    if (shops.length === 0) {
      console.log('   No shops found');
    } else {
      shops.forEach((shop, index) => {
        console.log(`\n   Shop #${index + 1}:`);
        console.log(`   ├─ ID: ${shop.id}`);
        console.log(`   ├─ Shop Name: ${shop.shopname || 'N/A'}`);
        console.log(`   ├─ Shop Type: ${shop.shop_type || 'N/A'} ${shop.shop_type === 1 ? '(B2B)' : shop.shop_type === 3 ? '(B2C)' : shop.shop_type === 4 ? '(Wholesaler)' : ''}`);
        console.log(`   ├─ Is Subscribed: ${shop.is_subscribed !== undefined ? shop.is_subscribed : 'undefined'}`);
        console.log(`   ├─ Subscription Ends At: ${shop.subscription_ends_at || 'N/A'}`);
        console.log(`   ├─ Is Subscription Ends: ${shop.is_subscription_ends !== undefined ? shop.is_subscription_ends : 'undefined'}`);
        console.log(`   ├─ Subscribed Duration: ${shop.subscribed_duration || 'N/A'}`);
        console.log(`   └─ Approval Status: ${shop.approval_status || 'N/A'}`);
      });
    }

    // Summary
    console.log(`\n📊 Subscription Summary:`);
    console.log('━'.repeat(60));

    const b2cShop = shops.find(s => s.shop_type === 3);
    const b2bShop = shops.find(s => s.shop_type === 1 || s.shop_type === 4);

    if (b2cShop) {
      const isSubscribed = b2cShop.is_subscribed === true;
      const subscriptionEndsAt = b2cShop.subscription_ends_at;
      const approvedInvoice = invoices.find(inv => inv.approval_status === 'approved' && inv.type === 'Paid');
      const pendingInvoice = invoices.find(inv => inv.approval_status === 'pending' && inv.type === 'Paid');
      const rejectedInvoice = invoices
        .filter(inv => inv.approval_status === 'rejected' && inv.type === 'Paid')
        .sort((a, b) => (b.id || 0) - (a.id || 0))[0];

      console.log(`\n   B2C Shop Status:`);
      console.log(`   ├─ Is Subscribed: ${isSubscribed ? '✅ YES' : '❌ NO'}`);
      console.log(`   ├─ Subscription Ends At: ${subscriptionEndsAt || 'N/A'}`);
      
      if (approvedInvoice) {
        console.log(`   ├─ Approved Invoice: ✅ Yes (ID: ${approvedInvoice.id}, Package: ${approvedInvoice.name || 'N/A'})`);
      } else {
        console.log(`   ├─ Approved Invoice: ❌ No`);
      }

      if (pendingInvoice) {
        console.log(`   ├─ Pending Invoice: ⏳ Yes (ID: ${pendingInvoice.id}, Package: ${pendingInvoice.name || 'N/A'})`);
      } else {
        console.log(`   ├─ Pending Invoice: ❌ No`);
      }

      if (rejectedInvoice) {
        console.log(`   ├─ Last Rejected Invoice: ❌ Yes (ID: ${rejectedInvoice.id})`);
        console.log(`   └─ Rejection Reason: ${rejectedInvoice.approval_notes || 'No reason provided'}`);
      } else {
        console.log(`   └─ Last Rejected Invoice: ❌ No`);
      }
    }

    if (b2bShop) {
      console.log(`\n   B2B Shop Status:`);
      console.log(`   └─ Approval Status: ${b2bShop.approval_status || 'N/A'}`);
    }

    console.log('\n' + '━'.repeat(60) + '\n');

  } catch (error) {
    console.error('❌ Error checking subscription:', error);
    throw error;
  }
}

// Get userId from command line arguments
const userId = process.argv[2];

if (!userId) {
  console.error('❌ Please provide a user ID');
  console.log('Usage: node scripts/checkUserSubscription.js <userId>');
  process.exit(1);
}

checkUserSubscription(parseInt(userId))
  .then(() => {
    console.log('✅ Check completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Script failed:', error);
    process.exit(1);
  });



