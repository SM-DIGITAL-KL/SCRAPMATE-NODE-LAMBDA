/**
 * Script to find shop type of a user by phone number
 * Usage: node scripts/find-user-shop-type.js <phone_number>
 * Example: node scripts/find-user-shop-type.js 9074135121
 */

require('dotenv').config();
const User = require('../models/User');
const Customer = require('../models/Customer');
const Shop = require('../models/Shop');

const phoneNumber = process.argv[2];

if (!phoneNumber) {
  console.error('❌ Please provide a phone number as the first argument.');
  console.log('Usage: node scripts/find-user-shop-type.js <phone_number>');
  process.exit(1);
}

async function findUserShopType() {
  try {
    console.log('\n🔍 Finding User Shop Type');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    console.log(`📞 Phone Number: ${phoneNumber}\n`);

    // 1. Find user by phone number
    console.log('Step 1: Finding user...');
    const users = await User.findAllByMobile(phoneNumber);

    if (!users || users.length === 0) {
      console.error(`❌ No user found with phone number: ${phoneNumber}`);
      return;
    }

    console.log(`✅ Found ${users.length} user(s) with phone number ${phoneNumber}\n`);

    // Process each user
    for (const user of users) {
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log(`👤 User Details:`);
      console.log(`   User ID: ${user.id}`);
      console.log(`   Name: ${user.name || 'N/A'}`);
      console.log(`   Phone: ${user.mob_num || 'N/A'}`);
      console.log(`   Email: ${user.email || 'N/A'}`);
      console.log(`   User Type: ${user.user_type || 'N/A'}`);
      console.log(`   App Type: ${user.app_type || 'N/A'}`);
      console.log(`   Del Status: ${user.del_status || 'N/A'}`);
      console.log('');

      // 2. Check if user is a vendor (has shop)
      if (user.user_type === 'R' || user.user_type === 'V' || user.app_type === 'vendor_app') {
        console.log('Step 2: Checking for shop data...');
        try {
          const shop = await Shop.findByUserId(user.id);
          
          if (shop) {
            console.log('✅ Shop Found:');
            console.log(`   Shop ID: ${shop.id}`);
            console.log(`   Shop Name: ${shop.shopname || 'N/A'}`);
            console.log(`   Owner Name: ${shop.ownername || 'N/A'}`);
            console.log(`   Shop Type: ${shop.shop_type || 'N/A'}`);
            console.log(`   Contact: ${shop.contact || 'N/A'}`);
            console.log(`   Address: ${shop.address || 'N/A'}`);
            console.log('');
            
            if (shop.shop_type) {
              console.log(`✅ Shop Type: ${shop.shop_type}`);
            } else {
              console.log('⚠️  Shop Type not set for this shop');
            }
          } else {
            console.log('⚠️  No shop record found for this user');
          }
        } catch (shopErr) {
          console.error('❌ Error finding shop:', shopErr.message);
        }
      } else if (user.user_type === 'C' || user.app_type === 'customer_app') {
        console.log('ℹ️  This is a customer user, not a vendor.');
        console.log('   Customer users do not have shop types.');
        
        // Check customer record
        try {
          const customer = await Customer.findByUserId(user.id);
          if (customer) {
            console.log(`   Customer ID: ${customer.id}`);
            console.log(`   Customer Name: ${customer.name || 'N/A'}`);
          }
        } catch (err) {
          console.log('   (No customer record found)');
        }
      } else if (user.user_type === 'D' || user.app_type === 'delivery_app') {
        console.log('ℹ️  This is a delivery user, not a vendor.');
        console.log('   Delivery users do not have shop types.');
      } else {
        console.log(`ℹ️  User type "${user.user_type}" (app_type: "${user.app_type}") - shop type not applicable`);
      }
      console.log('');
    }

    console.log('✅ Check completed!\n');

  } catch (error) {
    console.error('❌ Error finding user shop type:', error);
    console.error('   Error stack:', error.stack);
    process.exit(1);
  }
}

// Run the script
findUserShopType();

