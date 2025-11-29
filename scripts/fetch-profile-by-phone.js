/**
 * Script to fetch profile details by phone number
 * Usage: node scripts/fetch-profile-by-phone.js <phone_number>
 * Example: node scripts/fetch-profile-by-phone.js 9074135121
 */

require('dotenv').config();
const User = require('../models/User');
const Shop = require('../models/Shop');
const DeliveryBoy = require('../models/DeliveryBoy');
const Customer = require('../models/Customer');
const V2ProfileService = require('../services/user/v2ProfileService');

async function fetchProfileByPhone(phoneNumber) {
  try {
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`🔍 Fetching profile for phone: ${phoneNumber}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    // Convert phone number to number if it's a string
    const phoneNum = typeof phoneNumber === 'string' && !isNaN(phoneNumber) 
      ? parseInt(phoneNumber) 
      : phoneNumber;

    // Find user by mobile number
    console.log('📱 Step 1: Finding user by phone number...');
    const user = await User.findByMobile(phoneNum);
    
    if (!user) {
      console.log('❌ No user found with phone number:', phoneNumber);
      return null;
    }

    console.log('✅ User found:');
    console.log(`   ID: ${user.id}`);
    console.log(`   Name: ${user.name || 'N/A'}`);
    console.log(`   Email: ${user.email || 'N/A'}`);
    console.log(`   Phone: ${user.mob_num || 'N/A'}`);
    console.log(`   User Type: ${user.user_type || 'N/A'}`);
    console.log(`   App Type: ${user.app_type || 'N/A'}`);
    console.log(`   Created: ${user.created_at || 'N/A'}`);
    console.log(`   Updated: ${user.updated_at || 'N/A'}`);

    // Use V2ProfileService to get complete profile
    console.log('\n📋 Step 2: Fetching complete profile using V2ProfileService...');
    const profile = await V2ProfileService.getProfile(user.id);

    console.log('\n✅ Complete Profile Data:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(JSON.stringify(profile, null, 2));
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    // Additional details
    console.log('📊 Profile Summary:');
    console.log(`   Completion: ${profile.completion_percentage}%`);
    
    if (profile.shop) {
      console.log('\n🏪 Shop Information:');
      console.log(`   Shop ID: ${profile.shop.id || 'N/A'}`);
      console.log(`   Shop Name: ${profile.shop.shopname || 'N/A'}`);
      console.log(`   Owner Name: ${profile.shop.ownername || 'N/A'}`);
      console.log(`   Address: ${profile.shop.address || 'N/A'}`);
      console.log(`   Contact: ${profile.shop.contact || 'N/A'}`);
      console.log(`   Shop Type: ${profile.shop.shop_type || 'N/A'}`);
    }

    if (profile.delivery) {
      console.log('\n🚚 Delivery Information:');
      console.log(`   Delivery ID: ${profile.delivery.id || 'N/A'}`);
      console.log(`   Name: ${profile.delivery.name || 'N/A'}`);
      console.log(`   Address: ${profile.delivery.address || 'N/A'}`);
      console.log(`   Contact: ${profile.delivery.contact || 'N/A'}`);
    }

    if (profile.user_type === 'C') {
      console.log('\n👤 Customer Information:');
      try {
        const customer = await Customer.findByUserId(user.id);
        if (customer) {
          console.log(`   Customer ID: ${customer.id || 'N/A'}`);
          console.log(`   Address: ${customer.address || 'N/A'}`);
        } else {
          console.log('   No customer record found');
        }
      } catch (err) {
        console.log('   Error fetching customer:', err.message);
      }
    }

    // Check for all users with this phone number (in case of duplicates)
    console.log('\n🔍 Step 3: Checking for all users with this phone number...');
    try {
      const allUsers = await User.findAllByMobile(phoneNum);
      if (allUsers && allUsers.length > 1) {
        console.log(`⚠️  Found ${allUsers.length} users with phone number ${phoneNumber}:`);
        allUsers.forEach((u, index) => {
          console.log(`   ${index + 1}. ID: ${u.id}, Type: ${u.user_type}, App: ${u.app_type || 'N/A'}`);
        });
      } else {
        console.log('✅ Only one user found with this phone number');
      }
    } catch (err) {
      console.log('   Note: findAllByMobile not available or error:', err.message);
    }

    return profile;
  } catch (error) {
    console.error('\n❌ Error fetching profile:', error);
    console.error('Error stack:', error.stack);
    throw error;
  }
}

// Main execution
const phoneNumber = process.argv[2];

if (!phoneNumber) {
  console.error('❌ Error: Phone number is required');
  console.log('\nUsage: node scripts/fetch-profile-by-phone.js <phone_number>');
  console.log('Example: node scripts/fetch-profile-by-phone.js 9074135121');
  process.exit(1);
}

fetchProfileByPhone(phoneNumber)
  .then((profile) => {
    if (profile) {
      console.log('\n✅ Profile fetch completed successfully');
    } else {
      console.log('\n⚠️  No profile found');
    }
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Script failed:', error);
    process.exit(1);
  });

