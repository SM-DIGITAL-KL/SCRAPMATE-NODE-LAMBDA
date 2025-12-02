/**
 * Script to check user category/user type by phone number or name
 */

const User = require('../models/User');
require('dotenv').config();
const { loadEnvFromFile } = require('../utils/loadEnv');
loadEnvFromFile();

async function checkUserCategory(identifier) {
  try {
    console.log(`\n🔍 Checking user category for: ${identifier}\n`);
    
    // Try to find by phone number first (if it's a number)
    let user = null;
    if (/^\d+$/.test(identifier)) {
      // It's a phone number
      console.log('📞 Searching by phone number...');
      user = await User.findByMobile(identifier);
    } else {
      // It's a name - search by name (partial match)
      console.log('👤 Searching by name...');
      const users = await User.searchByName(identifier, 10);
      if (users && users.length > 0) {
        // Find exact match if possible
        user = users.find(u => u.name === identifier) || users[0];
        if (users.length > 1) {
          console.log(`⚠️  Found ${users.length} users with similar name, showing first match`);
        }
      }
    }
    
    if (!user) {
      console.log(`❌ User not found: ${identifier}`);
      return;
    }
    
    console.log('✅ User found:');
    console.log(`   ID: ${user.id}`);
    console.log(`   Name: ${user.name}`);
    console.log(`   Mobile: ${user.mob_num}`);
    console.log(`   Email: ${user.email || 'N/A'}`);
    console.log(`   User Type: ${user.user_type}`);
    console.log(`   App Type: ${user.app_type || 'N/A'}`);
    console.log(`   App Version: ${user.app_version || 'N/A'}`);
    console.log(`   Created At: ${user.created_at || 'N/A'}`);
    console.log(`   Updated At: ${user.updated_at || 'N/A'}`);
    
    // Map user type to category
    const userTypeMap = {
      'S': 'B2B (Shop Owner)',
      'R': 'B2C (Retailer)',
      'SR': 'B2B+B2C (Shop Owner + Retailer)',
      'D': 'Delivery Partner',
      'C': 'Customer App User',
      'A': 'Admin',
      'U': 'Web User'
    };
    
    const category = userTypeMap[user.user_type] || `Unknown (${user.user_type})`;
    console.log(`\n📋 Category: ${category}`);
    console.log(`\n✅ User category check completed!\n`);
    
  } catch (err) {
    console.error('❌ Error checking user category:', err);
    throw err;
  }
}

const userName = process.argv[2];

if (!userName) {
  console.error('❌ Please provide a user name as an argument.');
  console.log('Usage: node scripts/check-user-category.js <user_name>');
  console.log('Example: node scripts/check-user-category.js User_9074135121');
  process.exit(1);
}

checkUserCategory(userName)
  .then(() => {
    console.log('✅ Script completed successfully.');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Script failed:', error);
    process.exit(1);
  });

