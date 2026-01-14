/**
 * Script to send FCM push notification to Flutter app users (no app_type)
 * Finds users with no app_type who are customers and sends B2C joining notification
 * Usage: node scripts/send-flutter-app-notification.js
 */

require('dotenv').config();
const { getDynamoDBClient } = require('../config/dynamodb');
const { ScanCommand } = require('@aws-sdk/lib-dynamodb');
const { sendFlutterNotification } = require('../utils/fcmNotification');
const { getTableName, getEnvironment } = require('../utils/dynamodbTableNames');

// English notification message
const title = 'Join as B2C';
const body = 'Join as B2C to get customer orders and pick from house. New Scrapmate Partner app is available, download to start collecting scraps';

async function sendNotificationsToFlutterAppUsers() {
  try {
    const environment = getEnvironment();
    const USER_TABLE = getTableName('users');
    
    console.log('\n📨 Sending Push Notification to Flutter App Users (No app_type)');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`   Environment: ${environment}`);
    console.log(`   Title: ${title}`);
    console.log(`   Body: ${body}`);
    console.log(`   Target: Users with no app_type, user_type = 'C' (Customers)`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    
    // Find all users with no app_type who are customers
    console.log('🔍 Finding Flutter app users (no app_type, user_type = C)...');
    const client = getDynamoDBClient();
    let lastKey = null;
    const matchingUsers = [];
    
    do {
      const params = {
        TableName: USER_TABLE,
        FilterExpression: 'user_type = :typeC AND (attribute_not_exists(del_status) OR del_status <> :deleted) AND attribute_exists(fcm_token)',
        ExpressionAttributeValues: {
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
        // Filter for users with no app_type (Flutter app users)
        const flutterUsers = response.Items.filter(user => {
          // Flutter app users: no app_type field
          return !user.app_type;
        });
        matchingUsers.push(...flutterUsers);
      }
      
      lastKey = response.LastEvaluatedKey;
    } while (lastKey);
    
    console.log(`✅ Found ${matchingUsers.length} matching Flutter app user(s) (no app_type, user_type = C)\n`);
    
    if (matchingUsers.length === 0) {
      console.log('❌ No matching users found');
      return;
    }
    
    // Statistics
    const withFcmToken = matchingUsers.filter(u => u.fcm_token).length;
    const withoutFcmToken = matchingUsers.length - withFcmToken;
    
    console.log('📊 User Statistics:');
    console.log(`   Total Found: ${matchingUsers.length}`);
    console.log(`   With FCM Token: ${withFcmToken}`);
    console.log(`   Without FCM Token: ${withoutFcmToken}`);
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
    
    const totalUsers = matchingUsers.length;
    let processedCount = 0;
    
    for (const user of matchingUsers) {
      stats.total++;
      processedCount++;
      
      // Show progress every 100 users
      if (processedCount % 100 === 0 || processedCount === totalUsers) {
        console.log(`\n📊 Progress: ${processedCount}/${totalUsers} users processed (${Math.round(processedCount/totalUsers*100)}%)`);
        console.log(`   ✅ Success: ${stats.success} | ❌ Failed: ${stats.failed} | ⚠️  No Token: ${stats.noToken}\n`);
      }
      
      if (!user.fcm_token) {
        stats.noToken++;
        continue;
      }
      
      try {
        const notificationResult = await sendFlutterNotification(
          user.fcm_token,
          title,
          body,
          {
            type: 'general',
            timestamp: new Date().toISOString(),
            user_id: user.id.toString(),
            phone_number: user.mob_num?.toString() || '',
            app_type: 'flutter_app',
            language: 'english'
          }
        );
        
        if (notificationResult && notificationResult.success) {
          // Only log every 50th success to reduce noise
          if (stats.success % 50 === 0) {
            console.log(`✅ Progress: ${stats.success} notifications sent successfully...`);
          }
          stats.success++;
        } else {
          // Handle failed notifications (invalid tokens, etc.) - don't log as error, just count
          const errorType = notificationResult?.error || 'unknown';
          if (errorType === 'invalid_credentials') {
            // Critical error - credentials are invalid, stop the script
            console.error('\n❌ CRITICAL ERROR: Firebase credentials are invalid or revoked!');
            console.error('   Please check the Firebase service account key file');
            console.error('   The script cannot continue with invalid credentials.');
            console.error(`\n   Processed ${processedCount} users before stopping.`);
            console.error(`   Success: ${stats.success} | Failed: ${stats.failed} | No Token: ${stats.noToken}`);
            process.exit(1);
          } else if (errorType === 'invalid_token' || errorType === 'senderid_mismatch') {
            // These are expected errors, just count them
            stats.failed++;
          } else {
            // Only log unexpected errors
            if (stats.failed % 100 === 0) {
              console.log(`⚠️  Progress: ${stats.failed} failed notifications (invalid tokens, etc.)...`);
            }
            stats.failed++;
          }
        }
      } catch (error) {
        // This should rarely happen now since sendFlutterNotification handles errors internally
        console.log(`❌ User ${user.id} (${user.name || 'N/A'}) - Unexpected error: ${error.message}`);
        stats.failed++;
      }
      
      // Small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    
    // Summary
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📊 SUMMARY');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`Flutter App Users (No app_type, user_type = C):`);
    console.log(`   Total Found: ${matchingUsers.length}`);
    console.log(`   With FCM Token: ${withFcmToken}`);
    console.log(`   Without FCM Token: ${withoutFcmToken}`);
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
sendNotificationsToFlutterAppUsers()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Script failed:', error);
    process.exit(1);
  });

