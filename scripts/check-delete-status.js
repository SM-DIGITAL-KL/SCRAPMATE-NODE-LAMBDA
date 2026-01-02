/**
 * Script to check delete status for a phone number
 * Usage: node scripts/check-delete-status.js <phone_number>
 */

require('dotenv').config();
const User = require('../models/User');
const Customer = require('../models/Customer');
const Shop = require('../models/Shop');

const PHONE_NUMBER = process.argv[2] || '9074135121';

async function checkDeleteStatus() {
  try {
    console.log('\n🔍 Checking Delete Status');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    console.log(`Phone Number: ${PHONE_NUMBER}\n`);

    // Find all users with this phone number
    const allUsers = await User.findAllByMobile(PHONE_NUMBER);
    
    if (!allUsers || allUsers.length === 0) {
      console.log(`❌ No users found with phone number: ${PHONE_NUMBER}`);
      return;
    }

    console.log(`📋 Found ${allUsers.length} user account(s):\n`);
    
    for (let i = 0; i < allUsers.length; i++) {
      const user = allUsers[i];
      console.log(`${i + 1}. User Account:`);
      console.log(`   User ID: ${user.id}`);
      console.log(`   Name: ${user.name || 'N/A'}`);
      console.log(`   Email: ${user.email || 'N/A'}`);
      console.log(`   Phone: ${user.mob_num || 'N/A'}`);
      console.log(`   User Type: ${user.user_type || 'N/A'}`);
      console.log(`   App Type: ${user.app_type || 'N/A'}`);
      console.log(`   Del Status: ${user.del_status !== undefined ? user.del_status : 'Not set (Active)'}`);
      console.log(`   Status: ${user.del_status === 2 ? '❌ DELETED' : user.del_status === 1 ? '⚠️  SOFT DELETED' : '✅ ACTIVE'}`);
      console.log(`   Created At: ${user.created_at || 'N/A'}`);
      console.log(`   Updated At: ${user.updated_at || 'N/A'}`);
      console.log('');

      // Check for associated customer record
      if (user.app_type === 'customer_app' || user.user_type === 'C') {
        const customer = await Customer.findByUserId(user.id);
        if (customer) {
          console.log(`   📋 Customer Record:`);
          console.log(`      Customer ID: ${customer.id}`);
          console.log(`      Name: ${customer.name || 'N/A'}`);
          console.log(`      Contact: ${customer.contact || 'N/A'}`);
          console.log(`      Address: ${customer.address || 'N/A'}`);
          console.log(`      Location: ${customer.location || 'N/A'}`);
          console.log(`      Lat/Long: ${customer.lat_log || 'N/A'}`);
          console.log(`      Created At: ${customer.created_at || 'N/A'}`);
          console.log(`      Updated At: ${customer.updated_at || 'N/A'}`);
          console.log('');
        } else {
          console.log(`   📋 Customer Record: Not found`);
          console.log('');
        }
      }

      // Check for associated shop record
      if (user.app_type === 'vendor_app' || ['R', 'S', 'SR'].includes(user.user_type)) {
        const shop = await Shop.findByUserId(user.id);
        if (shop) {
          console.log(`   🏪 Shop Record:`);
          console.log(`      Shop ID: ${shop.id}`);
          console.log(`      Shop Name: ${shop.shopname || 'N/A'}`);
          console.log(`      Owner Name: ${shop.ownername || 'N/A'}`);
          console.log(`      Shop Type: ${shop.shop_type || 'N/A'}`);
          console.log(`      Contact: ${shop.contact || 'N/A'}`);
          console.log(`      Address: ${shop.address || 'N/A'}`);
          console.log(`      Location: ${shop.lat_log || 'N/A'}`);
          console.log(`      Del Status: ${shop.del_status !== undefined ? shop.del_status : 'Not set (Active)'}`);
          console.log(`      Status: ${shop.del_status === 2 ? '❌ DELETED' : shop.del_status === 1 ? '⚠️  SOFT DELETED' : '✅ ACTIVE'}`);
          console.log(`      Created At: ${shop.created_at || 'N/A'}`);
          console.log(`      Updated At: ${shop.updated_at || 'N/A'}`);
          console.log('');
        } else {
          console.log(`   🏪 Shop Record: Not found`);
          console.log('');
        }
      }
    }

    // Summary
    console.log('📊 Summary:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    const activeUsers = allUsers.filter(u => u.del_status !== 2);
    const deletedUsers = allUsers.filter(u => u.del_status === 2);
    
    console.log(`   Total Accounts: ${allUsers.length}`);
    console.log(`   ✅ Active Accounts: ${activeUsers.length}`);
    console.log(`   ❌ Deleted Accounts: ${deletedUsers.length}`);
    
    if (activeUsers.length > 0) {
      console.log('\n   Active Accounts:');
      activeUsers.forEach(u => {
        console.log(`      - ${u.name || 'N/A'} (ID: ${u.id}, Type: ${u.user_type}, App: ${u.app_type || 'N/A'})`);
      });
    }
    
    if (deletedUsers.length > 0) {
      console.log('\n   Deleted Accounts:');
      deletedUsers.forEach(u => {
        console.log(`      - ${u.name || 'N/A'} (ID: ${u.id}, Type: ${u.user_type}, App: ${u.app_type || 'N/A'})`);
      });
    }
    
    console.log('\n✅ Done!\n');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

checkDeleteStatus();


