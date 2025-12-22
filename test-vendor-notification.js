/**
 * Test Script for FCM Notification to Vendor App
 * Tests sending push notification to vendor app user with phone number 9074135121
 */

require('dotenv').config();
const User = require('./models/User');
const { sendNotification } = require('./utils/fcmNotification');

const PHONE_NUMBER = '9074135121';

async function testVendorNotification() {
  console.log('\n🧪 Testing FCM Notification for Vendor App');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`📱 Target Phone: ${PHONE_NUMBER}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  try {
    // Find vendor app user - need to scan all users with this phone number
    console.log('🔍 Finding vendor app user...');
    const { getDynamoDBClient } = require('./config/dynamodb');
    const { ScanCommand } = require('@aws-sdk/lib-dynamodb');
    
    const client = getDynamoDBClient();
    const scanCommand = new ScanCommand({
      TableName: 'users',
      FilterExpression: 'mob_num = :phone',
      ExpressionAttributeValues: {
        ':phone': parseInt(PHONE_NUMBER)
      }
    });

    const result = await client.send(scanCommand);
    const users = result.Items || [];
    
    // Find vendor_app user
    const user = users.find(u => u.app_type === 'vendor_app');
    
    if (!user) {
      console.error('❌ Vendor app user not found for phone number:', PHONE_NUMBER);
      console.log(`   Found ${users.length} user(s) with this phone number:`);
      users.forEach(u => {
        console.log(`     - ID: ${u.id}, App: ${u.app_type}, Type: ${u.user_type}`);
      });
      return;
    }

    console.log('✅ Vendor app user found:');
    console.log(`   User ID: ${user.id}`);
    console.log(`   Name: ${user.name || 'N/A'}`);
    console.log(`   Email: ${user.email || 'N/A'}`);
    console.log(`   User Type: ${user.user_type || 'N/A'}`);
    console.log(`   App Type: ${user.app_type || 'N/A'}`);
    console.log(`   Has FCM Token: ${!!user.fcm_token}`);
    
    if (user.fcm_token) {
      const tokenPreview = user.fcm_token.length > 50 
        ? user.fcm_token.substring(0, 50) + '...' 
        : user.fcm_token;
      console.log(`   FCM Token Preview: ${tokenPreview}`);
      console.log(`   Token Length: ${user.fcm_token.length} characters`);
    } else {
      console.error('❌ User does not have an FCM token registered');
      console.error('   The user needs to log in to the vendor app first to register their FCM token.');
      return;
    }

    console.log('\n📤 Sending test notification...');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    // Send notification
    const notificationResult = await sendNotification(
      user.fcm_token,
      '🧪 Test Notification - Vendor App',
      `Hello ${user.name || 'User'}! This is a test push notification from the vendor app. Sent at ${new Date().toLocaleString()}`,
      {
        type: 'test',
        timestamp: new Date().toISOString(),
        test_id: `vendor-test-${Date.now()}`,
        user_id: user.id.toString(),
        app_type: 'vendor_app'
      }
    );

    if (notificationResult.success) {
      console.log('✅ Notification sent successfully!');
      console.log(`   Message ID: ${notificationResult.messageId}`);
      console.log(`   Token: ${notificationResult.token.substring(0, 30)}...`);
      console.log('\n🎉 SUCCESS: Push notification should appear on the vendor app device!');
    } else {
      console.error('❌ Notification failed:');
      console.error(`   Error: ${notificationResult.error}`);
      console.error(`   Message: ${notificationResult.message}`);
    }

  } catch (error) {
    console.error('\n❌ Error occurred:');
    console.error(`   Error: ${error.message}`);
    if (error.stack) {
      console.error(`   Stack: ${error.stack}`);
    }
  }

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📝 Notes:');
  console.log('   - Make sure the vendor app is running on the device');
  console.log('   - The app should be in foreground or background (not force-closed)');
  console.log('   - Check the device for the notification');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
}

// Run the test
testVendorNotification().catch(console.error);

