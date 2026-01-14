require('dotenv').config();
const User = require('../models/User');

/**
 * Find user information by phone number
 * Usage: node scripts/find-user-by-phone.js [phone_number]
 * Example: node scripts/find-user-by-phone.js 9074135121
 */

async function findUserByPhone() {
  const args = process.argv.slice(2);
  const phoneNumber = args[0] || '9074135121';

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🔍 Finding User by Phone Number');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  console.log(`📱 Phone Number: ${phoneNumber}\n`);

  try {
    // Find all users with this phone number
    const users = await User.findAllByMobile(phoneNumber);
    
    if (!users || users.length === 0) {
      console.log('❌ No users found with phone number:', phoneNumber);
      process.exit(1);
    }

    console.log(`✅ Found ${users.length} user(s) with phone number ${phoneNumber}\n`);
    
    users.forEach((user, index) => {
      console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
      console.log(`User #${index + 1}`);
      console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
      console.log(`   User ID: ${user.id}`);
      console.log(`   Name: ${user.name || 'N/A'}`);
      console.log(`   Email: ${user.email || 'N/A'}`);
      console.log(`   Phone: ${user.mob_num || 'N/A'}`);
      console.log(`   User Type: ${user.user_type || 'N/A'}`);
      console.log(`   App Type: ${user.app_type || 'N/A'}`);
      console.log(`   App Version: ${user.app_version || 'N/A'}`);
      console.log(`   Del Status: ${user.del_status || 'N/A'}`);
      console.log(`   Created At: ${user.created_at || 'N/A'}`);
      console.log(`   Updated At: ${user.updated_at || 'N/A'}`);
      console.log('');
    });

    // Summary
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📊 Summary');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    
    const userTypes = users.map(u => u.user_type || 'N/A');
    const uniqueUserTypes = [...new Set(userTypes)];
    
    console.log(`   Total Users: ${users.length}`);
    console.log(`   User Types: ${uniqueUserTypes.join(', ')}`);
    console.log(`   Active Users: ${users.filter(u => !u.del_status || u.del_status !== 2).length}`);
    console.log(`   Deleted Users: ${users.filter(u => u.del_status === 2).length}`);
    
    // If there's a specific user type requested, show it
    if (args[1]) {
      const requestedType = args[1].toUpperCase();
      const matchingUsers = users.filter(u => u.user_type === requestedType);
      if (matchingUsers.length > 0) {
        console.log(`\n   Users with type '${requestedType}': ${matchingUsers.length}`);
        matchingUsers.forEach(u => {
          console.log(`     - ID: ${u.id}, Name: ${u.name || 'N/A'}, App Type: ${u.app_type || 'N/A'}`);
        });
      }
    }
    
    console.log('\n✅ Search completed!\n');
    
  } catch (error) {
    console.error('\n❌ Error finding user:', error.message);
    console.error('Stack:', error.stack);
    process.exit(1);
  }
}

findUserByPhone();


