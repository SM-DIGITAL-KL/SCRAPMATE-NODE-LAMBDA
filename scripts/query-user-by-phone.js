/**
 * Script to query DynamoDB for a user by phone number
 * Usage: node scripts/query-user-by-phone.js <phone_number>
 */

require('dotenv').config();
const { getDynamoDBClient } = require('../config/dynamodb');
const { ScanCommand } = require('@aws-sdk/lib-dynamodb');

const TABLE_NAME = 'users';

async function findUserByPhone(phoneNumber) {
  try {
    const client = getDynamoDBClient();
    
    // Convert phone number to number (as stored in DynamoDB)
    const mobileValue = typeof phoneNumber === 'string' && !isNaN(phoneNumber) 
      ? parseInt(phoneNumber) 
      : phoneNumber;
    
    console.log(`\n🔍 Searching for user with phone number: ${phoneNumber} (${mobileValue})\n`);
    
    // Scan with filter
    const params = {
      TableName: TABLE_NAME,
      FilterExpression: 'mob_num = :mobile',
      ExpressionAttributeValues: {
        ':mobile': mobileValue
      }
    };
    
    const command = new ScanCommand(params);
    const response = await client.send(command);
    
    if (response.Items && response.Items.length > 0) {
      const user = response.Items[0];
      console.log('✅ User found!\n');
      console.log('User Details:');
      console.log('─'.repeat(50));
      console.log(`ID: ${user.id}`);
      console.log(`Name: ${user.name || 'N/A'}`);
      console.log(`Email: ${user.email || 'N/A'}`);
      console.log(`Phone: ${user.mob_num}`);
      console.log(`User Type: ${user.user_type || 'N/A'}`);
      console.log(`App Type: ${user.app_type || 'N/A'}`);
      console.log(`App Version: ${user.app_version || 'N/A'}`);
      console.log(`Del Status: ${user.del_status || 'N/A'}`);
      console.log(`Created At: ${user.created_at || 'N/A'}`);
      console.log(`Updated At: ${user.updated_at || 'N/A'}`);
      console.log('─'.repeat(50));
      console.log(`\n📋 User Type: ${user.user_type || 'N/A'}\n`);
      
      // Return the user type
      return user.user_type;
    } else {
      console.log('❌ No user found with phone number:', phoneNumber);
      return null;
    }
  } catch (error) {
    console.error('❌ Error querying DynamoDB:', error);
    throw error;
  }
}

// Get phone number from command line argument
const phoneNumber = process.argv[2] || '9074135121';

if (!phoneNumber) {
  console.error('❌ Please provide a phone number as an argument');
  console.log('Usage: node scripts/query-user-by-phone.js <phone_number>');
  process.exit(1);
}

// Run the query
findUserByPhone(phoneNumber)
  .then((userType) => {
    if (userType) {
      console.log(`\n✅ User Type for ${phoneNumber}: ${userType}\n`);
      process.exit(0);
    } else {
      process.exit(1);
    }
  })
  .catch((error) => {
    console.error('Script failed:', error);
    process.exit(1);
  });

