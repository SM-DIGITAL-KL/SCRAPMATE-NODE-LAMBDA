/**
 * Script to send FCM push notification to Tamil Nadu vendors (v1 and v2)
 * Finds vendors in Tamil Nadu region and sends Tamil notification about B2C and new app
 * Usage: node scripts/send-tamilnadu-vendor-notification.js
 */

require('dotenv').config();
const { getDynamoDBClient } = require('../config/dynamodb');
const { ScanCommand } = require('@aws-sdk/lib-dynamodb');
const { sendVendorNotification } = require('../utils/fcmNotification');
const { getTableName, getEnvironment } = require('../utils/dynamodbTableNames');

// Tamil notification message
const title = 'B2C இணைந்து கொள்ளுங்கள்';
const body = 'வாடிக்கையாளர் ஆர்டர்களைப் பெறவும் வீட்டிலிருந்து எடுக்கவும் B2C இணைந்து கொள்ளுங்கள். புதிய Scrapmate Partner ஆப் கிடைக்கிறது, ஸ்கிராப் சேகரிக்கத் தொடங்க பதிவிறக்கவும்';

// Target user types
const targetUserTypes = ['N', 'S', 'R', 'SR', 'C'];
// Tamil Nadu state variations (case-insensitive matching)
const tamilNaduVariations = ['Tamil Nadu', 'Tamilnadu', 'TAMIL NADU', 'TAMILNADU', 'tamil nadu', 'tamilnadu'];

async function sendNotificationsToTamilNaduVendors() {
  try {
    const environment = getEnvironment();
    const USER_TABLE = getTableName('users');
    const SHOP_TABLE = getTableName('shops');
    
    console.log('\n📨 Sending Push Notification to Tamil Nadu Vendors');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`   Environment: ${environment}`);
    console.log(`   Title: ${title}`);
    console.log(`   Body: ${body}`);
    console.log(`   Target User Types: ${targetUserTypes.join(', ')}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    
    // Step 1: Find all shops in Tamil Nadu
    console.log('🔍 Step 1: Finding shops in Tamil Nadu...');
    const client = getDynamoDBClient();
    let lastKey = null;
    const tamilNaduShops = [];
    
    do {
      const params = {
        TableName: SHOP_TABLE,
        FilterExpression: '(attribute_not_exists(del_status) OR del_status <> :deleted)',
        ExpressionAttributeValues: {
          ':deleted': 2
        }
      };
      
      if (lastKey) {
        params.ExclusiveStartKey = lastKey;
      }
      
      const command = new ScanCommand(params);
      const response = await client.send(command);
      
      if (response.Items) {
        // Filter shops by Tamil Nadu state (case-insensitive)
        const tnShops = response.Items.filter(shop => {
          const shopState = (shop.state || '').trim();
          return tamilNaduVariations.some(variation => 
            shopState.toLowerCase() === variation.toLowerCase()
          );
        });
        tamilNaduShops.push(...tnShops);
      }
      
      lastKey = response.LastEvaluatedKey;
    } while (lastKey);
    
    console.log(`✅ Found ${tamilNaduShops.length} shop(s) in Tamil Nadu\n`);
    
    if (tamilNaduShops.length === 0) {
      console.log('❌ No shops found in Tamil Nadu');
      return;
    }
    
    // Step 2: Get unique user IDs from Tamil Nadu shops
    const userIds = [...new Set(tamilNaduShops.map(shop => shop.user_id).filter(Boolean))];
    console.log(`📋 Found ${userIds.length} unique user(s) with shops in Tamil Nadu\n`);
    
    // Step 3: Find v1 and v2 vendor_app users matching the criteria
    console.log('🔍 Step 2: Finding matching vendor_app users (v1 and v2)...');
    const matchingUsers = [];
    const v1Users = [];
    const v2Users = [];
    
    for (const userId of userIds) {
      try {
        const userParams = {
          TableName: USER_TABLE,
          FilterExpression: 'id = :userId AND app_type = :vendorApp AND (user_type = :typeN OR user_type = :typeS OR user_type = :typeR OR user_type = :typeSR OR user_type = :typeC) AND (attribute_not_exists(del_status) OR del_status <> :deleted) AND attribute_exists(fcm_token)',
          ExpressionAttributeValues: {
            ':userId': typeof userId === 'string' && !isNaN(userId) ? parseInt(userId) : userId,
            ':vendorApp': 'vendor_app',
            ':typeN': 'N',
            ':typeS': 'S',
            ':typeR': 'R',
            ':typeSR': 'SR',
            ':typeC': 'C',
            ':deleted': 2
          }
        };
        
        const userCommand = new ScanCommand(userParams);
        const userResponse = await client.send(userCommand);
        
        if (userResponse.Items && userResponse.Items.length > 0) {
          const user = userResponse.Items[0];
          // Include both v1 and v2 users
          // v2: app_version = 'v2'
          // v1: app_version = 'v1' or app_version doesn't exist (legacy users)
          if (user.app_version === 'v2') {
            // v2 user
            matchingUsers.push(user);
            v2Users.push(user);
          } else {
            // v1 user (app_version = 'v1' or no app_version)
            matchingUsers.push(user);
            v1Users.push(user);
          }
        }
      } catch (userErr) {
        console.error(`⚠️  Error fetching user ${userId}:`, userErr.message);
      }
    }
    
    console.log(`✅ Found ${matchingUsers.length} matching vendor_app user(s)`);
    console.log(`   - v1 users: ${v1Users.length}`);
    console.log(`   - v2 users: ${v2Users.length}\n`);
    
    if (matchingUsers.length === 0) {
      console.log('❌ No matching users found');
      return;
    }
    
    // Step 4: Send notifications
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
            language: 'tamil'
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
    console.log(`Tamil Nadu Vendors:`);
    console.log(`   Total Shops: ${tamilNaduShops.length}`);
    console.log(`   Unique Users: ${userIds.length}`);
    console.log(`   Matching Vendor Users: ${matchingUsers.length}`);
    console.log(`   - v1 users: ${v1Users.length}`);
    console.log(`   - v2 users: ${v2Users.length}`);
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
sendNotificationsToTamilNaduVendors()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Script failed:', error);
    process.exit(1);
  });

