/**
 * Script to list ALL users with a given phone number
 * Usage: node scripts/list-all-users-by-phone.js <phone_number>
 */

require('dotenv').config();
const { getDynamoDBClient } = require('../config/dynamodb');
const { ScanCommand } = require('@aws-sdk/lib-dynamodb');

const TABLE_NAME = 'users';

async function listAllUsersByPhone(phoneNumber) {
  try {
    const client = getDynamoDBClient();
    
    const mobileValue = typeof phoneNumber === 'string' && !isNaN(phoneNumber) 
      ? parseInt(phoneNumber) 
      : phoneNumber;
    
    console.log(`\n🔍 Searching for ALL users with phone number: ${phoneNumber} (${mobileValue})\n`);
    
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
      console.log(`✅ Found ${response.Items.length} user(s):\n`);
      
      response.Items.forEach((user, index) => {
        console.log(`User ${index + 1}:`);
        console.log('─'.repeat(60));
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
        console.log('─'.repeat(60));
        console.log('');
      });
      
      // Show which user should be used for login
      const completedUsers = response.Items.filter(u => u.user_type && u.user_type !== 'N');
      const newUsers = response.Items.filter(u => !u.user_type || u.user_type === 'N');
      
      console.log('\n📊 Summary:');
      console.log(`   Total users: ${response.Items.length}`);
      console.log(`   Completed users (not 'N'): ${completedUsers.length}`);
      console.log(`   New users ('N'): ${newUsers.length}`);
      
      if (completedUsers.length > 0) {
        console.log('\n✅ Should use completed user(s) for login:');
        completedUsers.forEach((u, i) => {
          console.log(`   ${i + 1}. ID: ${u.id}, Type: ${u.user_type}, App: ${u.app_type || 'N/A'}`);
        });
      }
      
      return response.Items;
    } else {
      console.log('❌ No users found with phone number:', phoneNumber);
      return null;
    }
  } catch (error) {
    console.error('❌ Error querying DynamoDB:', error);
    throw error;
  }
}

const phoneNumber = process.argv[2] || '9074135121';

listAllUsersByPhone(phoneNumber)
  .then((users) => {
    if (users && users.length > 0) {
      process.exit(0);
    } else {
      process.exit(1);
    }
  })
  .catch((error) => {
    console.error('Script failed:', error);
    process.exit(1);
  });

