/**
 * Script to delete all users by phone number
 * Usage: node scripts/delete-user-by-phone.js <phone_number>
 * WARNING: This will delete ALL users with the given phone number!
 */

const User = require('../models/User');
const { getDynamoDBClient } = require('../config/dynamodb');
const { DeleteCommand } = require('@aws-sdk/lib-dynamodb');

async function deleteUsersByPhone(phoneNumber) {
  try {
    console.log(`\n🗑️  Deleting all users with phone number: ${phoneNumber}\n`);
    
    // Clean phone number
    const cleanedPhone = phoneNumber.replace(/\D/g, '');
    
    if (cleanedPhone.length !== 10) {
      console.error('❌ Invalid phone number. Please enter a valid 10-digit phone number.');
      return;
    }
    
    // Find all users with this phone number
    const allUsers = await User.findAllByMobile(cleanedPhone);
    
    if (!allUsers || allUsers.length === 0) {
      console.log('❌ No users found with this phone number.');
      return;
    }
    
    console.log(`⚠️  Found ${allUsers.length} user(s) to delete:\n`);
    
    allUsers.forEach((user, index) => {
      console.log(`${index + 1}. ID: ${user.id}, Type: ${user.user_type}, App: ${user.app_type || 'none'}, Name: ${user.name}`);
    });
    
    console.log('\n🗑️  Deleting users...\n');
    
    const client = getDynamoDBClient();
    let deletedCount = 0;
    
    for (const user of allUsers) {
      try {
        const command = new DeleteCommand({
          TableName: 'users',
          Key: { id: user.id }
        });
        
        await client.send(command);
        console.log(`✅ Deleted user ID: ${user.id} (Type: ${user.user_type})`);
        deletedCount++;
      } catch (error) {
        console.error(`❌ Error deleting user ID ${user.id}:`, error.message);
      }
    }
    
    console.log(`\n✅ Successfully deleted ${deletedCount} out of ${allUsers.length} user(s).\n`);
    
  } catch (error) {
    console.error('❌ Error deleting users:', error);
    throw error;
  }
}

// Get phone number from command line arguments
const phoneNumber = process.argv[2];

if (!phoneNumber) {
  console.error('❌ Please provide a phone number as an argument.');
  console.log('Usage: node scripts/delete-user-by-phone.js <phone_number>');
  console.log('Example: node scripts/delete-user-by-phone.js 9074135121');
  console.log('\n⚠️  WARNING: This will delete ALL users with the given phone number!');
  process.exit(1);
}

// Run the deletion
deleteUsersByPhone(phoneNumber)
  .then(() => {
    console.log('✅ Deletion completed.');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Error:', error);
    process.exit(1);
  });

