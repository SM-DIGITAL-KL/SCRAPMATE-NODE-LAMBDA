/**
 * Script to send FCM push notification to all v2 door buyers (user_type 'D' and app_version 'v2')
 * Sends notifications in English, Tamil, and Hindi
 * Message: "You will receive customer orders only after registering as B2C. Doorstep Buyers receive only forwarded large B2C or B2B orders. To receive customer orders, please delete your current account and join as B2C."
 * Usage: node scripts/send-v2-door-buyers-notification.js
 */

require('dotenv').config();
const { getDynamoDBClient } = require('../config/dynamodb');
const { ScanCommand } = require('@aws-sdk/lib-dynamodb');
const { sendVendorNotification } = require('../utils/fcmNotification');
const { getTableName, getEnvironment } = require('../utils/dynamodbTableNames');

// Notification messages in three languages
const notifications = {
  english: {
    title: 'Important: Register as B2C',
    body: 'You will receive customer orders only after registering as B2C. Doorstep Buyers receive only forwarded large B2C or B2B orders. To receive customer orders, please delete your current account and join as B2C.'
  },
  tamil: {
    title: 'முக்கியம்: B2C ஆக பதிவு செய்யுங்கள்',
    body: 'B2C ஆக பதிவு செய்த பிறகே நீங்கள் வாடிக்கையாளர் ஆர்டர்களைப் பெறுவீர்கள். வீட்டுவாசலில் வாங்குபவர்கள் பெரிய B2C அல்லது B2B ஆர்டர்களை மட்டுமே பெறுவார்கள். வாடிக்கையாளர் ஆர்டர்களைப் பெற, தயவுசெய்து உங்கள் தற்போதைய கணக்கை நீக்கி B2C ஆக சேரவும்.'
  },
  hindi: {
    title: 'महत्वपूर्ण: B2C के रूप में पंजीकरण करें',
    body: 'B2C के रूप में पंजीकरण करने के बाद ही आपको ग्राहक ऑर्डर प्राप्त होंगे। दरवाजे पर खरीदार केवल बड़े B2C या B2B ऑर्डर प्राप्त करते हैं। ग्राहक ऑर्डर प्राप्त करने के लिए, कृपया अपना वर्तमान खाता हटाएं और B2C के रूप में शामिल हों।'
  }
};

async function sendNotificationsToV2DoorBuyers() {
  try {
    const environment = getEnvironment();
    const USER_TABLE = getTableName('users');
    
    console.log('\n📨 Sending Push Notification to All v2 Door Buyers');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`   Environment: ${environment}`);
    console.log(`   Languages: English, Tamil, Hindi`);
    console.log(`   Target: user_type = 'D' AND app_version = 'v2'`);
    console.log('\n📝 Notification Messages:');
    console.log('   English:');
    console.log(`      Title: ${notifications.english.title}`);
    console.log(`      Body: ${notifications.english.body}`);
    console.log('   Tamil:');
    console.log(`      Title: ${notifications.tamil.title}`);
    console.log(`      Body: ${notifications.tamil.body}`);
    console.log('   Hindi:');
    console.log(`      Title: ${notifications.hindi.title}`);
    console.log(`      Body: ${notifications.hindi.body}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    
    // Find all v2 door buyers (user_type 'D' and app_version 'v2')
    console.log('🔍 Finding all v2 door buyers...');
    const client = getDynamoDBClient();
    let lastKey = null;
    const matchingUsers = [];
    
    do {
      const params = {
        TableName: USER_TABLE,
        FilterExpression: 'user_type = :typeD AND app_version = :v2 AND (attribute_not_exists(del_status) OR del_status <> :deleted)',
        ExpressionAttributeValues: {
          ':typeD': 'D',
          ':v2': 'v2',
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
    
    console.log(`✅ Found ${matchingUsers.length} v2 door buyer(s)\n`);
    
    if (matchingUsers.length === 0) {
      console.log('❌ No v2 door buyers found');
      return;
    }
    
    // Display list of users
    console.log('📋 List of v2 Door Buyers:');
    matchingUsers.forEach((user, index) => {
      console.log(`   ${index + 1}. ID: ${user.id} | Name: ${user.name || 'N/A'} | Mobile: ${user.mob_num || 'N/A'} | FCM Token: ${user.fcm_token ? 'Yes' : 'No'}`);
    });
    console.log('');
    
    // Send notifications
    console.log('📤 Sending notifications...');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    
    const stats = {
      total: 0,
      success: { english: 0, tamil: 0, hindi: 0 },
      failed: { english: 0, tamil: 0, hindi: 0 },
      noToken: 0
    };
    
    for (const user of matchingUsers) {
      if (!user.fcm_token) {
        console.log(`⚠️  User ${user.id} (${user.name || 'N/A'}, Mobile: ${user.mob_num || 'N/A'}) - No FCM token`);
        stats.noToken++;
        continue;
      }
      
      // Send notifications in all three languages
      const languages = [
        { key: 'english', name: 'English' },
        { key: 'tamil', name: 'Tamil' },
        { key: 'hindi', name: 'Hindi' }
      ];
      
      for (const lang of languages) {
        stats.total++;
        
        try {
          const notificationResult = await sendVendorNotification(
            user.fcm_token,
            notifications[lang.key].title,
            notifications[lang.key].body,
            {
              type: 'general',
              timestamp: new Date().toISOString(),
              user_id: user.id.toString(),
              phone_number: user.mob_num?.toString() || '',
              app_type: user.app_type || 'vendor_app',
              language: lang.key,
              user_type: 'D'
            }
          );
          
          if (notificationResult.success) {
            console.log(`✅ User ${user.id} (${user.name || 'N/A'}, Mobile: ${user.mob_num || 'N/A'}) - ${lang.name} notification sent`);
            stats.success[lang.key]++;
          } else {
            console.log(`❌ User ${user.id} (${user.name || 'N/A'}) - ${lang.name} failed: ${notificationResult.error || notificationResult.message}`);
            stats.failed[lang.key]++;
          }
        } catch (error) {
          console.log(`❌ User ${user.id} (${user.name || 'N/A'}) - ${lang.name} error: ${error.message}`);
          stats.failed[lang.key]++;
        }
        
        // Small delay between notifications to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 50));
      }
      
      // Additional delay between users
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    // Summary
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📊 SUMMARY');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`v2 Door Buyers:`);
    console.log(`   Total Found: ${matchingUsers.length}`);
    console.log(`\nNotifications (per language):`);
    console.log(`   Total Sent: ${stats.total}`);
    console.log(`\n   English:`);
    console.log(`      ✅ Success: ${stats.success.english}`);
    console.log(`      ❌ Failed: ${stats.failed.english}`);
    console.log(`   Tamil:`);
    console.log(`      ✅ Success: ${stats.success.tamil}`);
    console.log(`      ❌ Failed: ${stats.failed.tamil}`);
    console.log(`   Hindi:`);
    console.log(`      ✅ Success: ${stats.success.hindi}`);
    console.log(`      ❌ Failed: ${stats.failed.hindi}`);
    console.log(`\n   ⚠️  No Token: ${stats.noToken}`);
    const totalSuccess = stats.success.english + stats.success.tamil + stats.success.hindi;
    const totalFailed = stats.failed.english + stats.failed.tamil + stats.failed.hindi;
    console.log(`\n   Overall:`);
    console.log(`      ✅ Total Success: ${totalSuccess}`);
    console.log(`      ❌ Total Failed: ${totalFailed}`);
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
sendNotificationsToV2DoorBuyers()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Script failed:', error);
    process.exit(1);
  });

