/**
 * Script to delete all users with a specific phone number
 * Usage: node scripts/delete-users-by-phone.js <phone_number>
 * 
 * WARNING: This will permanently delete all users with the specified phone number!
 */

require('dotenv').config();
const { getDynamoDBClient } = require('../config/dynamodb');
const { ScanCommand, DeleteCommand } = require('@aws-sdk/lib-dynamodb');

const TABLE_NAME = 'users';

async function deleteUsersByPhone(phoneNumber) {
  try {
    const client = getDynamoDBClient();
    
    // Convert phone number to number (as stored in DynamoDB)
    const mobileValue = typeof phoneNumber === 'string' && !isNaN(phoneNumber) 
      ? parseInt(phoneNumber) 
      : phoneNumber;
    
    console.log(`\n🗑️  Deleting all users with phone number: ${phoneNumber} (${mobileValue})\n`);
    console.log('⚠️  WARNING: This will permanently delete all users with this phone number!');
    console.log('');
    
    // First, find all users with this phone number
    const allUsers = [];
    let lastKey = null;
    
    do {
      const params = {
        TableName: TABLE_NAME,
        FilterExpression: 'mob_num = :mobile',
        ExpressionAttributeValues: {
          ':mobile': mobileValue
        }
      };
      
      if (lastKey) {
        params.ExclusiveStartKey = lastKey;
      }
      
      const command = new ScanCommand(params);
      const response = await client.send(command);
      
      if (response.Items && response.Items.length > 0) {
        allUsers.push(...response.Items);
      }
      
      lastKey = response.LastEvaluatedKey;
    } while (lastKey);
    
    if (allUsers.length === 0) {
      console.log('❌ No users found with phone number:', phoneNumber);
      return;
    }
    
    console.log(`📋 Found ${allUsers.length} user(s) to delete:\n`);
    allUsers.forEach((user, index) => {
      console.log(`User ${index + 1}:`);
      console.log(`  ID: ${user.id}`);
      console.log(`  Name: ${user.name || 'N/A'}`);
      console.log(`  App Type: ${user.app_type || 'N/A'}`);
      console.log(`  User Type: ${user.user_type || 'N/A'}`);
      console.log(`  Has FCM Token: ${!!user.fcm_token}`);
      console.log('');
    });
    
    // Delete all users
    console.log('🗑️  Deleting users...\n');
    let deletedCount = 0;
    let errorCount = 0;
    
    for (const user of allUsers) {
      try {
        const deleteCommand = new DeleteCommand({
          TableName: TABLE_NAME,
          Key: { id: user.id }
        });
        
        await client.send(deleteCommand);
        console.log(`✅ Deleted user ${user.id} (${user.name || 'N/A'}, ${user.app_type || 'N/A'})`);
        deletedCount++;
      } catch (error) {
        console.error(`❌ Error deleting user ${user.id}:`, error.message);
        errorCount++;
      }
    }
    
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`📊 Deletion Summary:`);
    console.log(`   Total users found: ${allUsers.length}`);
    console.log(`   Successfully deleted: ${deletedCount}`);
    console.log(`   Errors: ${errorCount}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    
  } catch (error) {
    console.error('❌ Error deleting users:', error);
    throw error;
  }
}

// Get phone number from command line argument
const phoneNumber = process.argv[2];

if (!phoneNumber) {
  console.error('❌ Please provide a phone number as an argument');
  console.log('Usage: node scripts/delete-users-by-phone.js <phone_number>');
  console.log('Example: node scripts/delete-users-by-phone.js 9074135121');
  process.exit(1);
}

// Confirm deletion
console.log('⚠️  WARNING: You are about to delete ALL users with phone number:', phoneNumber);
console.log('This action cannot be undone!');
console.log('');
console.log('To proceed, run the script again with the phone number.');
console.log('');

// Run the deletion
deleteUsersByPhone(phoneNumber)
  .then(() => {
    console.log('✅ Deletion process completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Script failed:', error);
    process.exit(1);
  });

