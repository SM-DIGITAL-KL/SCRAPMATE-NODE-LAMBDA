/**
 * Script to check FCM token status for a user by phone number
 * Usage: node scripts/check-fcm-token.js <phone_number>
 */

require('dotenv').config();
const { getDynamoDBClient } = require('../config/dynamodb');
const { ScanCommand } = require('@aws-sdk/lib-dynamodb');

const TABLE_NAME = 'users';

async function checkFcmToken(phoneNumber) {
  try {
    const client = getDynamoDBClient();
    
    // Convert phone number to number (as stored in DynamoDB)
    const mobileValue = typeof phoneNumber === 'string' && !isNaN(phoneNumber) 
      ? parseInt(phoneNumber) 
      : phoneNumber;
    
    console.log(`\n🔍 Checking FCM token for phone number: ${phoneNumber} (${mobileValue})\n`);
    
    // Scan with filter for customer_app users
    const params = {
      TableName: TABLE_NAME,
      FilterExpression: 'mob_num = :mobile AND (attribute_not_exists(del_status) OR del_status <> :deleted)',
      ExpressionAttributeValues: {
        ':mobile': mobileValue,
        ':deleted': 2
      }
    };
    
    const command = new ScanCommand(params);
    const response = await client.send(command);
    
    if (response.Items && response.Items.length > 0) {
      // Filter for customer_app users
      const customerAppUsers = response.Items.filter(u => u.app_type === 'customer_app');
      
      if (customerAppUsers.length === 0) {
        console.log('❌ No customer_app user found with this phone number');
        console.log(`\n📋 Found ${response.Items.length} user(s) with this phone number:`);
        response.Items.forEach((user, index) => {
          console.log(`\n   User ${index + 1}:`);
          console.log(`   - ID: ${user.id}`);
          console.log(`   - Name: ${user.name || 'N/A'}`);
          console.log(`   - App Type: ${user.app_type || 'N/A'}`);
          console.log(`   - User Type: ${user.user_type || 'N/A'}`);
        });
        return null;
      }
      
      const user = customerAppUsers[0];
      console.log('✅ Customer App User found!\n');
      console.log('─'.repeat(60));
      console.log('User Details:');
      console.log('─'.repeat(60));
      console.log(`ID: ${user.id}`);
      console.log(`Name: ${user.name || 'N/A'}`);
      console.log(`Email: ${user.email || 'N/A'}`);
      console.log(`Phone: ${user.mob_num}`);
      console.log(`User Type: ${user.user_type || 'N/A'}`);
      console.log(`App Type: ${user.app_type || 'N/A'}`);
      console.log(`App Version: ${user.app_version || 'N/A'}`);
      console.log(`Del Status: ${user.del_status || 'N/A'}`);
      console.log('─'.repeat(60));
      console.log('\n📱 FCM Token Status:');
      console.log('─'.repeat(60));
      
      if (user.fcm_token) {
        const tokenPreview = user.fcm_token.length > 50 
          ? user.fcm_token.substring(0, 50) + '...' 
          : user.fcm_token;
        console.log(`✅ FCM Token: ${tokenPreview}`);
        console.log(`   Token Length: ${user.fcm_token.length} characters`);
        
        if (user.fcm_token_time) {
          const tokenTime = new Date(user.fcm_token_time * 1000);
          const now = new Date();
          const diffMs = now - tokenTime;
          const diffMins = Math.floor(diffMs / 60000);
          const diffHours = Math.floor(diffMs / 3600000);
          const diffDays = Math.floor(diffMs / 86400000);
          
          console.log(`   Last Updated: ${tokenTime.toLocaleString()}`);
          
          if (diffDays > 0) {
            console.log(`   Age: ${diffDays} day(s) ago`);
          } else if (diffHours > 0) {
            console.log(`   Age: ${diffHours} hour(s) ago`);
          } else {
            console.log(`   Age: ${diffMins} minute(s) ago`);
          }
        } else {
          console.log(`   ⚠️  fcm_token_time not set`);
        }
      } else {
        console.log(`❌ No FCM Token registered`);
        console.log(`\n💡 To register FCM token:`);
        console.log(`   1. Log in to the mobile app with this phone number`);
        console.log(`   2. The FCM token will be automatically stored during login`);
        console.log(`   3. Or manually call: POST /api/fcm_token_store`);
      }
      
      console.log('─'.repeat(60));
      
      return {
        hasToken: !!user.fcm_token,
        userId: user.id,
        token: user.fcm_token,
        tokenTime: user.fcm_token_time
      };
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
  console.log('Usage: node scripts/check-fcm-token.js <phone_number>');
  process.exit(1);
}

// Run the check
checkFcmToken(phoneNumber)
  .then((result) => {
    if (result) {
      console.log(`\n📊 Summary:`);
      console.log(`   User ID: ${result.userId}`);
      console.log(`   Has FCM Token: ${result.hasToken ? '✅ Yes' : '❌ No'}`);
      if (result.hasToken) {
        console.log(`   Token Status: ✅ Ready for notifications`);
      } else {
        console.log(`   Token Status: ⚠️  User needs to log in to register token`);
      }
      console.log('');
      process.exit(result.hasToken ? 0 : 1);
    } else {
      process.exit(1);
    }
  })
  .catch((error) => {
    console.error('Script failed:', error);
    process.exit(1);
  });

