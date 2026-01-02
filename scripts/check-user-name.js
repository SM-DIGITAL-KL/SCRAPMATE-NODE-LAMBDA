/**
 * Script to check the name field for a specific user_id in DynamoDB
 * Usage: node scripts/check-user-name.js <user_id>
 * Example: node scripts/check-user-name.js 9074135121
 */

const User = require('../models/User');
const Shop = require('../models/Shop');

const userId = process.argv[2];

if (!userId) {
  console.error('❌ Please provide a user_id');
  console.log('Usage: node scripts/check-user-name.js <user_id>');
  process.exit(1);
}

async function checkUserName() {
  try {
    console.log(`🔍 Checking user data for user_id: ${userId}`);
    
    // Get user from DynamoDB
    const user = await User.findById(parseInt(userId));
    
    if (!user) {
      console.log(`❌ User with id ${userId} not found in DynamoDB`);
      return;
    }
    
    console.log('\n📋 User Data:');
    console.log('─'.repeat(50));
    console.log(`ID: ${user.id}`);
    console.log(`Name: ${user.name || '(empty)'}`);
    console.log(`Email: ${user.email || '(empty)'}`);
    console.log(`Mobile: ${user.mob_num || '(empty)'}`);
    console.log(`User Type: ${user.user_type || '(empty)'}`);
    console.log(`App Type: ${user.app_type || '(empty)'}`);
    console.log(`App Version: ${user.app_version || '(empty)'}`);
    
    // Check if user has a shop (for R, S, SR users)
    if (user.user_type === 'R' || user.user_type === 'S' || user.user_type === 'SR') {
      console.log('\n🏪 Checking Shop Data:');
      console.log('─'.repeat(50));
      
      const shop = await Shop.findByUserId(parseInt(userId));
      
      if (shop) {
        console.log(`Shop ID: ${shop.id}`);
        console.log(`Shop Name: ${shop.shopname || '(empty)'}`);
        console.log(`Owner Name: ${shop.ownername || '(empty)'}`);
        console.log(`Company Name: ${shop.company_name || '(empty)'}`);
        console.log(`Contact Person Name: ${shop.contact_person_name || '(empty)'}`);
        console.log(`Shop Type: ${shop.shop_type || '(empty)'}`);
      } else {
        console.log('❌ No shop found for this user');
      }
    }
    
    console.log('\n✅ Check complete');
    
  } catch (error) {
    console.error('❌ Error checking user:', error);
    process.exit(1);
  }
}

checkUserName();


