/**
 * Script to send FCM push notification to vendor_app v2 users:
 * - user_type 'N': all (no approval filter)
 * - user_type 'R': only approval_status rejected or pending (user or shop)
 * Sends notifications in English, Tamil, and Hindi.
 * Message: "Confused about how to join? Start by joining as B2C using only your Aadhaar card. You can upgrade to B2B anytime later."
 * Usage: node scripts/send-notification-to-type-n-users.js
 */

require('dotenv').config();
const { getDynamoDBClient } = require('../config/dynamodb');
const { ScanCommand } = require('@aws-sdk/lib-dynamodb');
const { sendVendorNotification } = require('../utils/fcmNotification');
const { getTableName, getEnvironment } = require('../utils/dynamodbTableNames');
const Shop = require('../models/Shop');

function isRejectedOrPending(status) {
  if (!status || typeof status !== 'string') return false;
  const s = status.toLowerCase();
  return s === 'rejected' || s === 'pending';
}

// Notification messages in three languages
const notifications = {
  english: {
    title: 'Join as B2C',
    body: 'Confused about how to join? Start by joining as B2C using only your Aadhaar card. You can upgrade to B2B anytime later. Finish and see the tender updates, live market prices, and our successful vendors’ testimonials coming soon.'
  },
  tamil: {
    title: 'B2C ஆக சேரவும்',
    body: 'எப்படி சேருவது என்று குழப்பமா? உங்கள் ஆதார் அட்டையை மட்டும் பயன்படுத்தி B2C ஆக சேரத் தொடங்குங்கள். நீங்கள் எப்போது வேண்டுமானாலும் B2B க்கு மேம்படுத்தலாம். முடித்து டெண்டர் அப்டேட்கள், நேரடி சந்தை விலைகள் மற்றும் எங்கள் வெற்றிகரமான விற்பனையாளர்களின் அனுபவங்கள் (விரைவில்) பார்க்கவும்.'
  },
  hindi: {
    title: 'B2C के रूप में शामिल हों',
    body: 'कैसे शामिल हों इसके बारे में भ्रमित हैं? केवल अपने आधार कार्ड का उपयोग करके B2C के रूप में शामिल होना शुरू करें। आप कभी भी बाद में B2B में अपग्रेड कर सकते हैं। पूरा करें और टेंडर अपडेट, लाइव मार्केट कीमतें और हमारे सफल विक्रेताओं की प्रशंसाएँ (जल्द आ रही हैं) देखें।'
  }
};


async function sendNotificationsToTypeNUsers() {
  try {
    const environment = getEnvironment();
    const USER_TABLE = getTableName('users');
    
    console.log('\n📨 Push Notification: vendor_app v2 — N (all) + R (rejected/pending only)');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`   Environment: ${environment}`);
    console.log(`   Languages: English, Tamil, Hindi`);
    console.log(`   Target: app_type = vendor_app, app_version = v2`);
    console.log(`   user_type 'N': all | user_type 'R': approval_status rejected OR pending only`);
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
    
    // Find vendor_app v2 users with user_type 'N' or 'R'
    console.log('🔍 Finding vendor_app v2 users with user_type IN ("N", "R")...');
    const client = getDynamoDBClient();
    let lastKey = null;
    const rawUsers = [];
    
    do {
      const params = {
        TableName: USER_TABLE,
        FilterExpression: 'app_type = :appType AND app_version = :appVersion AND (user_type = :typeN OR user_type = :typeR) AND (attribute_not_exists(del_status) OR del_status <> :deleted)',
        ExpressionAttributeValues: {
          ':appType': 'vendor_app',
          ':appVersion': 'v2',
          ':typeN': 'N',
          ':typeR': 'R',
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
    
    console.log(`   Raw count (vendor_app v2, user_type N or R): ${rawUsers.length}`);
    
    // N: include all. R: include only if approval_status rejected or pending (user or shop)
    const matchingUsers = [];
    let nCount = 0;
    let rCount = 0;
    for (const user of rawUsers) {
      const isN = user.user_type === 'N';
      if (isN) {
        matchingUsers.push(user);
        nCount++;
        continue;
      }
      // R: check approval
      let approvalStatus = user.approval_status;
      try {
        const shop = await Shop.findByUserId(user.id);
        if (shop && shop.approval_status) {
          approvalStatus = shop.approval_status;
        }
      } catch (_) {
        /* use user approval_status */
      }
      if (isRejectedOrPending(approvalStatus)) {
        matchingUsers.push(user);
        rCount++;
      }
    }
    
    console.log(`✅ Found ${matchingUsers.length} user(s): N=${nCount}, R (rejected/pending)=${rCount}\n`);
    
    if (matchingUsers.length === 0) {
      console.log('❌ No users found: vendor_app v2, (N all) or (R rejected/pending).');
      return;
    }
    
    // Display list of users
    console.log('📋 List of Users (vendor_app v2: N all, R rejected/pending):');
    matchingUsers.forEach((user, index) => {
      console.log(`   ${index + 1}. ID: ${user.id} | Type: ${user.user_type} | Name: ${user.name || 'N/A'} | Mobile: ${user.mob_num || 'N/A'} | FCM: ${user.fcm_token ? 'Yes' : 'No'}`);
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
              user_type: user.user_type || 'N'
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
    console.log(`Users (vendor_app v2: N all, R rejected/pending):`);
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
sendNotificationsToTypeNUsers()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Script failed:', error);
    process.exit(1);
  });

