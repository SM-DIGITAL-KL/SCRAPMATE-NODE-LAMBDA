/**
 * Script to delete users with specific phone number and user_type
 * Usage: node scripts/delete-users-by-phone-and-type.js <phone_number> <user_type>
 */

require('dotenv').config();
const { getDynamoDBClient } = require('../config/dynamodb');
const { ScanCommand, DeleteCommand } = require('@aws-sdk/lib-dynamodb');

const TABLE_NAME = 'users';

async function deleteUsersByPhoneAndType(phoneNumber, userType) {
  try {
    const client = getDynamoDBClient();
    
    const mobileValue = typeof phoneNumber === 'string' && !isNaN(phoneNumber) 
      ? parseInt(phoneNumber) 
      : phoneNumber;
    
    console.log(`\n🔍 Searching for users with phone: ${phoneNumber} and user_type: ${userType}\n`);
    
    // First, find all matching users
    const params = {
      TableName: TABLE_NAME,
      FilterExpression: 'mob_num = :mobile AND user_type = :userType',
      ExpressionAttributeValues: {
        ':mobile': mobileValue,
        ':userType': userType
      }
    };
    
    const command = new ScanCommand(params);
    const response = await client.send(command);
    
    if (response.Items && response.Items.length > 0) {
      console.log(`✅ Found ${response.Items.length} user(s) to delete:\n`);
      
      let deletedCount = 0;
      let errorCount = 0;
      
      for (const user of response.Items) {
        try {
          console.log(`Deleting user ID: ${user.id}, Name: ${user.name || 'N/A'}, Email: ${user.email || 'N/A'}`);
          
          const deleteCommand = new DeleteCommand({
            TableName: TABLE_NAME,
            Key: {
              id: user.id
            }
          });
          
          await client.send(deleteCommand);
          console.log(`   ✅ Deleted successfully\n`);
          deletedCount++;
        } catch (error) {
          console.error(`   ❌ Error deleting user ID ${user.id}:`, error.message);
          errorCount++;
        }
      }
      
      console.log('\n📊 Summary:');
      console.log(`   Total found: ${response.Items.length}`);
      console.log(`   Deleted: ${deletedCount}`);
      console.log(`   Errors: ${errorCount}\n`);
      
      return { deleted: deletedCount, errors: errorCount };
    } else {
      console.log(`❌ No users found with phone ${phoneNumber} and user_type ${userType}`);
      return { deleted: 0, errors: 0 };
    }
  } catch (error) {
    console.error('❌ Error querying/deleting from DynamoDB:', error);
    throw error;
  }
}

const phoneNumber = process.argv[2] || '9074135121';
const userType = process.argv[3] || 'N';

if (!phoneNumber || !userType) {
  console.error('❌ Please provide phone number and user_type as arguments');
  console.log('Usage: node scripts/delete-users-by-phone-and-type.js <phone_number> <user_type>');
  process.exit(1);
}

deleteUsersByPhoneAndType(phoneNumber, userType)
  .then((result) => {
    if (result.deleted > 0) {
      console.log(`✅ Successfully deleted ${result.deleted} user(s)\n`);
      process.exit(0);
    } else {
      process.exit(1);
    }
  })
  .catch((error) => {
    console.error('Script failed:', error);
    process.exit(1);
  });

