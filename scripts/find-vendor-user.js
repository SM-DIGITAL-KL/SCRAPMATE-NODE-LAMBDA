require('dotenv').config();
const { getDynamoDBClient } = require('../config/dynamodb');
const { ScanCommand } = require('@aws-sdk/lib-dynamodb');

async function findVendorUser(phoneNumber) {
  try {
    const client = getDynamoDBClient();
    const command = new ScanCommand({
      TableName: 'users',
      FilterExpression: 'mob_num = :phone',
      ExpressionAttributeValues: {
        ':phone': parseInt(phoneNumber)
      }
    });

    const result = await client.send(command);
    
    console.log(`\n🔍 All users with phone ${phoneNumber}:\n`);
    
    if (!result.Items || result.Items.length === 0) {
      console.log('❌ No users found');
      return null;
    }

    let vendorUser = null;
    
    result.Items.forEach((u, index) => {
      console.log(`User ${index + 1}:`);
      console.log(`  ID: ${u.id}`);
      console.log(`  App Type: ${u.app_type || 'N/A'}`);
      console.log(`  User Type: ${u.user_type || 'N/A'}`);
      console.log(`  Name: ${u.name || 'N/A'}`);
      console.log(`  Has FCM Token: ${!!u.fcm_token}`);
      if (u.fcm_token) {
        console.log(`  FCM Token Preview: ${u.fcm_token.substring(0, 50)}...`);
      }
      console.log('');
      
      if (u.app_type === 'vendor_app') {
        vendorUser = u;
      }
    });

    if (vendorUser) {
      console.log('✅ Found vendor_app user!');
      return vendorUser;
    } else {
      console.log('⚠️  No vendor_app user found for this phone number');
      return null;
    }
  } catch (error) {
    console.error('❌ Error:', error);
    return null;
  }
}

const phoneNumber = process.argv[2] || '9074135121';
findVendorUser(phoneNumber);

