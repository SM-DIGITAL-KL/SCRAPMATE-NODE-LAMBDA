/**
 * Script to send FCM push notification to all customer_app users
 * Usage: 
 *   node scripts/send-notification-to-all-customers.js
 *   TEST_MOBILE=9074135121 node scripts/send-notification-to-all-customers.js  (test mode)
 */

require('dotenv').config();
const { getDynamoDBClient } = require('../config/dynamodb');
const { ScanCommand } = require('@aws-sdk/lib-dynamodb');
const { sendCustomerNotification } = require('../utils/fcmNotification');
const { getTableName, getEnvironment } = require('../utils/dynamodbTableNames');

// Notification message
const notification = {
  title: 'Recycle and Earn with Scrapmate',
  body: 'Scrapmate pickups are active in your area today. Check live scrap prices and schedule a hassle-free doorstep pickup.'
};

async function sendNotificationsToAllCustomers() {
  try {
    const environment = getEnvironment();
    const USER_TABLE = getTableName('users');
    
    // Check for test mode: TEST_MOBILE env var or first command-line arg
    const TEST_MOBILE = process.env.TEST_MOBILE || (process.argv[2] && /^[0-9]+$/.test(process.argv[2]) ? process.argv[2] : null);
    const isTestMode = !!TEST_MOBILE;
    
    if (isTestMode) {
      console.log(`\n🧪 TEST MODE ENABLED - Mobile: ${TEST_MOBILE}`);
    }
    
    console.log('\n📨 Push Notification: All Customer App Users');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`   Environment: ${environment}`);
    if (isTestMode) {
      console.log(`   🧪 TEST MODE: Sending to mobile ${TEST_MOBILE} only`);
    }
    console.log(`   Target: app_type = customer_app`);
    console.log('\n📝 Notification Message:');
    console.log(`   Title: ${notification.title}`);
    console.log(`   Body: ${notification.body}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    
    // Find all customer_app users
    const client = getDynamoDBClient();
    let matchingUsers = [];
    
    if (isTestMode) {
      // Test mode: Find user by mobile number
      console.log(`🔍 TEST MODE: Finding customer_app user with mobile ${TEST_MOBILE}...`);
      const mobileNum = parseInt(TEST_MOBILE);
      let lastKey = null;
      let rawUsers = [];
      
      do {
        const params = {
          TableName: USER_TABLE,
          FilterExpression: 'mob_num = :mobile AND app_type = :appType AND (attribute_not_exists(del_status) OR del_status <> :deleted)',
          ExpressionAttributeValues: {
            ':mobile': mobileNum,
            ':appType': 'customer_app',
            ':deleted': 2
          }
        };
        
        if (lastKey) {
          params.ExclusiveStartKey = lastKey;
        }
        
        const command = new ScanCommand(params);
        const response = await client.send(command);
        
        if (response.Items) {
          rawUsers.push(...response.Items);
        }
        
        lastKey = response.LastEvaluatedKey;
      } while (lastKey);
      
      console.log(`   Found ${rawUsers.length} customer_app user(s) with mobile ${TEST_MOBILE}`);
      matchingUsers = rawUsers;
    } else {
      // Normal mode: Find all customer_app users
      console.log('🔍 Finding all customer_app users...');
      let lastKey = null;
      
      do {
        const params = {
          TableName: USER_TABLE,
          FilterExpression: 'app_type = :appType AND (attribute_not_exists(del_status) OR del_status <> :deleted)',
          ExpressionAttributeValues: {
            ':appType': 'customer_app',
            ':deleted': 2
          }
        };
        
        if (lastKey) {
          params.ExclusiveStartKey = lastKey;
        }
        
        const command = new ScanCommand(params);
        const response = await client.send(command);
        
        if (response.Items) {
          matchingUsers.push(...response.Items);
        }
        
        lastKey = response.LastEvaluatedKey;
      } while (lastKey);
      
      console.log(`   Found ${matchingUsers.length} customer_app user(s)`);
    }
    
    if (matchingUsers.length === 0) {
      console.log('❌ No customer_app users found.');
      return;
    }
    
    // Display list of users
    console.log('\n📋 List of Customer App Users:');
    matchingUsers.forEach((user, index) => {
      console.log(`   ${index + 1}. ID: ${user.id} | Name: ${user.name || 'N/A'} | Mobile: ${user.mob_num || 'N/A'} | FCM: ${user.fcm_token ? 'Yes' : 'No'}`);
    });
    console.log('');
    
    // Send notifications
    console.log('📤 Sending notifications...');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    
    const stats = {
      total: 0,
      success: 0,
      failed: 0,
      noToken: 0
    };
    
    for (const user of matchingUsers) {
      if (!user.fcm_token) {
        console.log(`⚠️  User ${user.id} (${user.name || 'N/A'}, Mobile: ${user.mob_num || 'N/A'}) - No FCM token`);
        stats.noToken++;
        continue;
      }
      
      stats.total++;
      
      try {
        const notificationResult = await sendCustomerNotification(
          user.fcm_token,
          notification.title,
          notification.body,
          {
            type: 'general',
            timestamp: new Date().toISOString(),
            user_id: user.id.toString(),
            phone_number: user.mob_num?.toString() || '',
            app_type: 'customer_app'
          }
        );
        
        if (notificationResult.success) {
          console.log(`✅ User ${user.id} (${user.name || 'N/A'}, Mobile: ${user.mob_num || 'N/A'}) - Notification sent`);
          stats.success++;
        } else {
          console.log(`❌ User ${user.id} (${user.name || 'N/A'}) - Failed: ${notificationResult.error || notificationResult.message}`);
          stats.failed++;
        }
      } catch (error) {
        console.log(`❌ User ${user.id} (${user.name || 'N/A'}) - Error: ${error.message}`);
        stats.failed++;
      }
      
      // Small delay between notifications to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    
    // Summary
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📊 SUMMARY');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`Customer App Users:`);
    console.log(`   Total Found: ${matchingUsers.length}`);
    console.log(`\nNotifications:`);
    console.log(`   Total Sent: ${stats.total}`);
    console.log(`   ✅ Success: ${stats.success}`);
    console.log(`   ❌ Failed: ${stats.failed}`);
    console.log(`   ⚠️  No Token: ${stats.noToken}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    
  } catch (error) {
    console.error('\n❌ Error occurred:');
    console.error(`   Error: ${error.message}`);
    if (error.stack) {
      console.error(`   Stack: ${error.stack}`);
    }
    process.exit(1);
  }
}

// Run the script
sendNotificationsToAllCustomers()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Script failed:', error);
    process.exit(1);
  });
