/**
 * Script to send FCM push notification to all v1 vendor_app users
 * Finds all v1 users and sends English notification about B2C and new app
 * Usage: node scripts/send-v1-users-notification.js
 */

require('dotenv').config();
const { getDynamoDBClient } = require('../config/dynamodb');
const { ScanCommand } = require('@aws-sdk/lib-dynamodb');
const { sendVendorNotification } = require('../utils/fcmNotification');
const { getTableName, getEnvironment } = require('../utils/dynamodbTableNames');

// English notification message
const title = 'Join as B2C';
const body = 'Join as B2C to get customer orders and pick from house. New Scrapmate Partner app is available, download to start collecting scraps';

// Target user types
const targetUserTypes = ['N', 'S', 'R', 'SR', 'C'];

async function sendNotificationsToV1Users() {
  try {
    const environment = getEnvironment();
    const USER_TABLE = getTableName('users');
    
    console.log('\n📨 Sending Push Notification to All v1 Users');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`   Environment: ${environment}`);
    console.log(`   Title: ${title}`);
    console.log(`   Body: ${body}`);
    console.log(`   Target User Types: ${targetUserTypes.join(', ')}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    
    // Find all v1 vendor_app users matching the criteria
    console.log('🔍 Finding all v1 vendor_app users...');
    const client = getDynamoDBClient();
    let lastKey = null;
    const matchingUsers = [];
    
    do {
      const params = {
        TableName: USER_TABLE,
        FilterExpression: 'app_type = :vendorApp AND (user_type = :typeN OR user_type = :typeS OR user_type = :typeR OR user_type = :typeSR OR user_type = :typeC) AND (attribute_not_exists(del_status) OR del_status <> :deleted) AND attribute_exists(fcm_token)',
        ExpressionAttributeValues: {
          ':vendorApp': 'vendor_app',
          ':typeN': 'N',
          ':typeS': 'S',
          ':typeR': 'R',
          ':typeSR': 'SR',
          ':typeC': 'C',
          ':deleted': 2
        }
      };
      
      if (lastKey) {
        params.ExclusiveStartKey = lastKey;
      }
      
      const command = new ScanCommand(params);
      const response = await client.send(command);
      
      if (response.Items) {
        // Filter for v1 users: app_version = 'v1' or app_version doesn't exist
        const v1Users = response.Items.filter(user => {
          // v1 users: app_version = 'v1' or app_version doesn't exist
          return !user.app_version || user.app_version === 'v1';
        });
        matchingUsers.push(...v1Users);
      }
      
      lastKey = response.LastEvaluatedKey;
    } while (lastKey);
    
    console.log(`✅ Found ${matchingUsers.length} matching v1 vendor_app user(s)\n`);
    
    if (matchingUsers.length === 0) {
      console.log('❌ No matching users found');
      return;
    }
    
    // Group by user type for statistics
    const userTypeStats = {};
    targetUserTypes.forEach(type => {
      userTypeStats[type] = matchingUsers.filter(u => u.user_type === type).length;
    });
    
    console.log('📊 User Type Breakdown:');
    Object.entries(userTypeStats).forEach(([type, count]) => {
      if (count > 0) {
        console.log(`   - Type ${type}: ${count} user(s)`);
      }
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
      stats.total++;
      
      if (!user.fcm_token) {
        console.log(`⚠️  User ${user.id} (${user.name || 'N/A'}) - No FCM token`);
        stats.noToken++;
        continue;
      }
      
      try {
        const notificationResult = await sendVendorNotification(
          user.fcm_token,
          title,
          body,
          {
            type: 'general',
            timestamp: new Date().toISOString(),
            user_id: user.id.toString(),
            phone_number: user.mob_num?.toString() || '',
            app_type: 'vendor_app',
            language: 'english'
          }
        );
        
        if (notificationResult.success) {
          console.log(`✅ User ${user.id} (${user.name || 'N/A'}, Type: ${user.user_type}) - Notification sent`);
          stats.success++;
        } else {
          console.log(`❌ User ${user.id} (${user.name || 'N/A'}) - Failed: ${notificationResult.error || notificationResult.message}`);
          stats.failed++;
        }
      } catch (error) {
        console.log(`❌ User ${user.id} (${user.name || 'N/A'}) - Error: ${error.message}`);
        stats.failed++;
      }
      
      // Small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    
    // Summary
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📊 SUMMARY');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`v1 Vendor App Users:`);
    console.log(`   Total Found: ${matchingUsers.length}`);
    console.log(`\nUser Type Breakdown:`);
    Object.entries(userTypeStats).forEach(([type, count]) => {
      if (count > 0) {
        console.log(`   - Type ${type}: ${count}`);
      }
    });
    console.log(`\nNotifications:`);
    console.log(`   Total: ${stats.total}`);
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
sendNotificationsToV1Users()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Script failed:', error);
    process.exit(1);
  });












