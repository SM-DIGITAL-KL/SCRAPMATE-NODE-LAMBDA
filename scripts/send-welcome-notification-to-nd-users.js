/**
 * Script to send FCM push notification to all v2 vendor_app users
 * with user_type 'N' (New) and 'D' (Delivery) about B2C upgrade
 * Usage: node scripts/send-welcome-notification-to-nd-users.js
 */

require('dotenv').config();
const { getDynamoDBClient } = require('../config/dynamodb');
const { ScanCommand } = require('@aws-sdk/lib-dynamodb');
const { sendVendorNotification } = require('../utils/fcmNotification');
const { getTableName, getEnvironment } = require('../utils/dynamodbTableNames');

const title = 'வரவேற்கிறோம்! 🚀';
const body =
  'உங்கள் ஆதார் கார்டு மட்டும் பயன்படுத்தி B2C ஆக இணைந்து, வாடிக்கையாளர்களிடமிருந்து வரும் நேரடி ஆர்டர்களை உடனே பெறுங்கள்.\nஉங்கள் சேகரிப்புக்காக வாடிக்கையாளர்கள் காத்திருக்கிறார்கள்—இந்த வாய்ப்பை தவறவிடாதீர்கள்!';


async function sendWelcomeNotificationToNDUsers() {
  try {
    const environment = getEnvironment();
    const USER_TABLE = getTableName('users');
    
    console.log('\n📨 Sending Welcome Push Notification to v2 vendor_app Users (Type N & D)');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`   Environment: ${environment}`);
    console.log(`   Table: ${USER_TABLE}`);
    console.log(`   Target: app_version = "v2" AND app_type = "vendor_app" AND (user_type = "N" OR user_type = "D")`);
    console.log(`   Title: ${title}`);
    console.log(`   Body: ${body}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    
    // Find all matching users
    console.log('🔍 Finding all matching v2 vendor_app users (type N & D)...');
    const client = getDynamoDBClient();
    let lastKey = null;
    const usersN = []; // Users with user_type = 'N'
    const usersD = []; // Users with user_type = 'D'
    
    do {
      const params = {
        TableName: USER_TABLE,
        FilterExpression: 'app_version = :v2 AND app_type = :vendorApp AND (user_type = :typeN OR user_type = :typeD) AND (attribute_not_exists(del_status) OR del_status <> :deleted) AND attribute_exists(fcm_token)',
        ExpressionAttributeValues: {
          ':v2': 'v2',
          ':vendorApp': 'vendor_app',
          ':typeN': 'N',
          ':typeD': 'D',
          ':deleted': 2
        }
      };
      
      if (lastKey) {
        params.ExclusiveStartKey = lastKey;
      }
      
      const command = new ScanCommand(params);
      const response = await client.send(command);
      
      if (response.Items) {
        response.Items.forEach(user => {
          if (user.user_type === 'N') {
            usersN.push(user);
          } else if (user.user_type === 'D') {
            usersD.push(user);
          }
        });
      }
      
      lastKey = response.LastEvaluatedKey;
    } while (lastKey);
    
    const allUsers = [...usersN, ...usersD];
    
    if (allUsers.length === 0) {
      console.log('❌ No matching users found with FCM tokens');
      console.log('   Make sure users have app_version = "v2", app_type = "vendor_app", and (user_type = "N" OR user_type = "D")');
      return;
    }
    
    console.log(`✅ Found ${allUsers.length} matching user(s):`);
    console.log(`   - Type N (New users): ${usersN.length}`);
    console.log(`   - Type D (Delivery users): ${usersD.length}\n`);
    
    // Statistics
    const stats = {
      total: 0,
      success: 0,
      failed: 0,
      noToken: 0,
      byType: {
        N: { total: 0, success: 0, failed: 0, noToken: 0 },
        D: { total: 0, success: 0, failed: 0, noToken: 0 }
      }
    };
    
    // Send notifications
    console.log('📤 Sending notifications...');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    
    for (let i = 0; i < allUsers.length; i++) {
      const user = allUsers[i];
      stats.total++;
      stats.byType[user.user_type].total++;
      
      if (!user.fcm_token) {
        console.log(`⚠️  [${i + 1}/${allUsers.length}] User ${user.id} (Type: ${user.user_type}, Mobile: ${user.mob_num || 'N/A'}) - No FCM token`);
        stats.noToken++;
        stats.byType[user.user_type].noToken++;
        continue;
      }
      
      try {
        const notificationResult = await sendVendorNotification(
          user.fcm_token,
          title,
          body,
          {
            type: 'welcome_b2c_upgrade',
            timestamp: new Date().toISOString(),
            user_id: user.id.toString(),
            phone_number: user.mob_num?.toString() || '',
            app_type: 'vendor_app',
            user_type: user.user_type,
            message: 'Upgrade to B2C using Aadhaar card to start receiving direct customer orders'
          }
        );
        
        if (notificationResult.success) {
          console.log(`✅ [${i + 1}/${allUsers.length}] User ${user.id} (Type: ${user.user_type}, Mobile: ${user.mob_num || 'N/A'}, Name: ${user.name || 'N/A'}) - Notification sent`);
          stats.success++;
          stats.byType[user.user_type].success++;
        } else {
          console.log(`❌ [${i + 1}/${allUsers.length}] User ${user.id} (Type: ${user.user_type}, Mobile: ${user.mob_num || 'N/A'}) - Failed: ${notificationResult.error || notificationResult.message}`);
          stats.failed++;
          stats.byType[user.user_type].failed++;
        }
      } catch (error) {
        console.log(`❌ [${i + 1}/${allUsers.length}] User ${user.id} (Type: ${user.user_type}, Mobile: ${user.mob_num || 'N/A'}) - Error: ${error.message}`);
        stats.failed++;
        stats.byType[user.user_type].failed++;
        
        // Log specific error types
        if (error.code === 'messaging/invalid-registration-token' || 
            error.code === 'messaging/registration-token-not-registered') {
          console.log(`   ⚠️  Invalid or unregistered FCM token`);
        }
      }
      
      // Small delay to avoid rate limiting (50ms between notifications)
      if (i < allUsers.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 50));
      }
      
      // Show progress every 20 users
      if ((i + 1) % 20 === 0) {
        console.log(`\n📊 Progress: ${i + 1}/${allUsers.length} processed (${stats.success} success, ${stats.failed} failed)\n`);
      }
    }
    
    // Summary
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📊 SUMMARY');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`\nOverall Statistics:`);
    console.log(`   Total Users: ${stats.total}`);
    console.log(`   ✅ Successfully Sent: ${stats.success}`);
    console.log(`   ❌ Failed: ${stats.failed}`);
    console.log(`   ⚠️  No FCM Token: ${stats.noToken}`);
    
    console.log(`\nBy User Type:`);
    console.log(`\n   Type N (New Users):`);
    console.log(`      Total: ${stats.byType.N.total}`);
    console.log(`      ✅ Success: ${stats.byType.N.success}`);
    console.log(`      ❌ Failed: ${stats.byType.N.failed}`);
    console.log(`      ⚠️  No Token: ${stats.byType.N.noToken}`);
    
    console.log(`\n   Type D (Delivery Users):`);
    console.log(`      Total: ${stats.byType.D.total}`);
    console.log(`      ✅ Success: ${stats.byType.D.success}`);
    console.log(`      ❌ Failed: ${stats.byType.D.failed}`);
    console.log(`      ⚠️  No Token: ${stats.byType.D.noToken}`);
    
    console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);
    
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
sendWelcomeNotificationToNDUsers()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Script failed:', error);
    process.exit(1);
  });

