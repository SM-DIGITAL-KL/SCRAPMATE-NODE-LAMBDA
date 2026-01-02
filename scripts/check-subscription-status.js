/**
 * Script to check subscription status for a user by phone number
 * Usage: node scripts/check-subscription-status.js <phone_number>
 * Example: node scripts/check-subscription-status.js 9074135121
 */

require('dotenv').config();
const User = require('../models/User');
const Shop = require('../models/Shop');
const Invoice = require('../models/Invoice');

const phoneNumber = process.argv[2];

if (!phoneNumber) {
  console.error('❌ Please provide a phone number');
  console.log('Usage: node scripts/check-subscription-status.js <phone_number>');
  process.exit(1);
}

async function checkSubscriptionStatus() {
  try {
    console.log(`\n🔍 Checking subscription status for phone number: ${phoneNumber}\n`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    
    // Find all users with this phone number
    const allUsers = await User.findAllByMobile(phoneNumber);
    
    if (!allUsers || allUsers.length === 0) {
      console.log(`❌ No users found with phone number: ${phoneNumber}`);
      return;
    }

    console.log(`📋 Found ${allUsers.length} user account(s):\n`);
    
    for (let i = 0; i < allUsers.length; i++) {
      const user = allUsers[i];
      console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
      console.log(`\n👤 User ${i + 1}:`);
      console.log(`   ID: ${user.id}`);
      console.log(`   Name: ${user.name || 'N/A'}`);
      console.log(`   Phone: ${user.mob_num}`);
      console.log(`   User Type: ${user.user_type || 'N/A'}`);
      console.log(`   App Type: ${user.app_type || 'N/A'}`);
      console.log(`   Email: ${user.email || 'N/A'}`);
      
      // Find shops for this user
      const shops = await Shop.findAllByUserId(user.id);
      console.log(`\n🏪 Shops (${shops.length}):`);
      
      if (shops.length === 0) {
        console.log('   No shops found');
      } else {
        for (const shop of shops) {
          console.log(`\n   Shop ID: ${shop.id}`);
          console.log(`   Shop Name: ${shop.shopname || 'N/A'}`);
          console.log(`   Shop Type: ${shop.shop_type} (${shop.shop_type === 1 ? 'B2B' : shop.shop_type === 3 ? 'B2C' : 'Other'})`);
          console.log(`   Is Subscribed: ${shop.is_subscribed ? '✅ YES' : '❌ NO'}`);
          console.log(`   Subscription Ends At: ${shop.subscription_ends_at || 'N/A'}`);
          console.log(`   Is Subscription Ends: ${shop.is_subscription_ends ? 'YES' : 'NO'}`);
          console.log(`   Subscribed Duration: ${shop.subscribed_duration || 'N/A'}`);
          
          // Check subscription end date
          if (shop.subscription_ends_at) {
            const endDate = new Date(shop.subscription_ends_at);
            const now = new Date();
            const isExpired = endDate < now;
            console.log(`   Status: ${isExpired ? '⚠️ EXPIRED' : '✅ ACTIVE'}`);
          }
        }
      }
      
      // Find invoices for this user
      const allInvoices = await Invoice.getAll();
      const userInvoices = allInvoices.filter(inv => 
        inv.user_id === user.id && inv.type === 'Paid'
      );
      
      console.log(`\n💰 Paid Invoices (${userInvoices.length}):`);
      
      if (userInvoices.length === 0) {
        console.log('   No paid invoices found');
      } else {
        // Sort by created_at descending
        userInvoices.sort((a, b) => {
          const dateA = new Date(a.created_at || 0);
          const dateB = new Date(b.created_at || 0);
          return dateB - dateA;
        });
        
        for (const invoice of userInvoices) {
          console.log(`\n   Invoice ID: ${invoice.id}`);
          console.log(`   Package ID: ${invoice.package_id || 'N/A'}`);
          console.log(`   Package Name: ${invoice.name || invoice.displayname || 'N/A'}`);
          console.log(`   Price: ₹${invoice.price || 0}`);
          console.log(`   Duration: ${invoice.duration || 'N/A'}`);
          console.log(`   Approval Status: ${invoice.approval_status || 'pending'}`);
          console.log(`   From Date: ${invoice.from_date || 'N/A'}`);
          console.log(`   To Date: ${invoice.to_date || 'N/A'}`);
          console.log(`   Payment ID: ${invoice.payment_moj_id || 'N/A'}`);
          console.log(`   Created At: ${invoice.created_at || 'N/A'}`);
          console.log(`   Approved At: ${invoice.approved_at || 'N/A'}`);
        }
        
        // Get latest approved invoice
        const approvedInvoice = userInvoices.find(inv => inv.approval_status === 'approved');
        if (approvedInvoice) {
          console.log(`\n✅ Latest Approved Subscription:`);
          console.log(`   Package: ${approvedInvoice.name || approvedInvoice.package_id || 'N/A'}`);
          console.log(`   Valid From: ${approvedInvoice.from_date || 'N/A'}`);
          console.log(`   Valid Until: ${approvedInvoice.to_date || 'N/A'}`);
          
          if (approvedInvoice.to_date) {
            const endDate = new Date(approvedInvoice.to_date);
            const now = new Date();
            const isExpired = endDate < now;
            console.log(`   Status: ${isExpired ? '⚠️ EXPIRED' : '✅ ACTIVE'}`);
          }
        }
      }
    }
    
    console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);
  } catch (error) {
    console.error('❌ Error checking subscription status:', error);
    console.error('   Error stack:', error.stack);
    process.exit(1);
  }
}

checkSubscriptionStatus();




