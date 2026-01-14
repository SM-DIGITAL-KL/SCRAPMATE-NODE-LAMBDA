/**
 * Script to send FCM push notification to all v2 vendor_app and customer_app users
 * with specific user types (N, S, R, SR, C)
 * Usage: node scripts/send-vendor-notification.js [title] [body]
 * Example: node scripts/send-vendor-notification.js "Test Title" "Test message"
 */

require('dotenv').config();
const { getDynamoDBClient } = require('../config/dynamodb');
const { ScanCommand } = require('@aws-sdk/lib-dynamodb');
const { sendVendorNotification, sendCustomerNotification } = require('../utils/fcmNotification');
const { getTableName, getEnvironment } = require('../utils/dynamodbTableNames');

const title = process.argv[2] || '📱 Notification from Scrapmate';
const body = process.argv[3] || `You have a new notification. Sent at ${new Date().toLocaleString()}`;

// Target user types
const targetUserTypes = ['N', 'S', 'R', 'SR', 'C'];
const targetAppTypes = ['vendor_app', 'customer_app'];

async function sendNotificationsToAllUsers() {
  try {
    const environment = getEnvironment();
    const USER_TABLE = getTableName('users');
    
    console.log('\n📨 Sending Push Notification to All v2 Users');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`   Environment: ${environment}`);
    console.log(`   Title: ${title}`);
    console.log(`   Body: ${body}`);
    console.log(`   Target App Types: ${targetAppTypes.join(', ')}`);
    console.log(`   Target User Types: ${targetUserTypes.join(', ')}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    
    // Find all matching users
    console.log('🔍 Finding all matching users...');
    const client = getDynamoDBClient();
    let lastKey = null;
    const allUsers = [];
    
    do {
      const params = {
        TableName: USER_TABLE,
        FilterExpression: '(app_type = :vendorApp OR app_type = :customerApp) AND (user_type = :typeN OR user_type = :typeS OR user_type = :typeR OR user_type = :typeSR OR user_type = :typeC) AND (attribute_not_exists(del_status) OR del_status <> :deleted) AND attribute_exists(fcm_token)',
        ExpressionAttributeValues: {
          ':vendorApp': 'vendor_app',
          ':customerApp': 'customer_app',
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
        // Filter for v2 users (app_version = 'v2' or app_version doesn't exist but app_type exists)
        const v2Users = response.Items.filter(user => {
          // Include if app_version is 'v2' or if app_version doesn't exist but app_type exists (legacy v2 users)
          return user.app_version === 'v2' || (!user.app_version && user.app_type);
        });
        allUsers.push(...v2Users);
      }
      
      lastKey = response.LastEvaluatedKey;
    } while (lastKey);
    
    if (allUsers.length === 0) {
      console.error('❌ No matching users found');
      return;
    }
    
    console.log(`✅ Found ${allUsers.length} matching user(s):\n`);
    
    // Group by app type
    const vendorUsers = allUsers.filter(u => u.app_type === 'vendor_app');
    const customerUsers = allUsers.filter(u => u.app_type === 'customer_app');
    
    console.log(`   Vendor App Users: ${vendorUsers.length}`);
    console.log(`   Customer App Users: ${customerUsers.length}\n`);
    
    // Statistics
    const stats = {
      vendor: { total: 0, success: 0, failed: 0, noToken: 0 },
      customer: { total: 0, success: 0, failed: 0, noToken: 0 }
    };
    
    // Send notifications to vendor app users
    if (vendorUsers.length > 0) {
      console.log('📤 Sending notifications to vendor app users...');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
      
      for (const user of vendorUsers) {
        stats.vendor.total++;
        
        if (!user.fcm_token) {
          console.log(`⚠️  User ${user.id} (${user.name || 'N/A'}) - No FCM token`);
          stats.vendor.noToken++;
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
              app_type: 'vendor_app'
            }
          );
          
          if (notificationResult.success) {
            console.log(`✅ Vendor User ${user.id} (${user.name || 'N/A'}, Type: ${user.user_type}) - Notification sent`);
            stats.vendor.success++;
          } else {
            console.log(`❌ Vendor User ${user.id} (${user.name || 'N/A'}) - Failed: ${notificationResult.error || notificationResult.message}`);
            stats.vendor.failed++;
          }
        } catch (error) {
          console.log(`❌ Vendor User ${user.id} (${user.name || 'N/A'}) - Error: ${error.message}`);
          stats.vendor.failed++;
        }
        
        // Small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 50));
      }
    }
    
    // Send notifications to customer app users
    if (customerUsers.length > 0) {
      console.log('\n📤 Sending notifications to customer app users...');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
      
      for (const user of customerUsers) {
        stats.customer.total++;
        
        if (!user.fcm_token) {
          console.log(`⚠️  User ${user.id} (${user.name || 'N/A'}) - No FCM token`);
          stats.customer.noToken++;
          continue;
        }
        
        try {
          const notificationResult = await sendCustomerNotification(
            user.fcm_token,
            title,
            body,
            {
              type: 'general',
              timestamp: new Date().toISOString(),
              user_id: user.id.toString(),
              phone_number: user.mob_num?.toString() || '',
              app_type: 'customer_app'
            }
          );
          
          if (notificationResult.success) {
            console.log(`✅ Customer User ${user.id} (${user.name || 'N/A'}, Type: ${user.user_type}) - Notification sent`);
            stats.customer.success++;
          } else {
            console.log(`❌ Customer User ${user.id} (${user.name || 'N/A'}) - Failed: ${notificationResult.error || notificationResult.message}`);
            stats.customer.failed++;
          }
        } catch (error) {
          console.log(`❌ Customer User ${user.id} (${user.name || 'N/A'}) - Error: ${error.message}`);
          stats.customer.failed++;
        }
        
        // Small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 50));
      }
    }
    
    // Summary
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📊 SUMMARY');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`Vendor App Users:`);
    console.log(`   Total: ${stats.vendor.total}`);
    console.log(`   ✅ Success: ${stats.vendor.success}`);
    console.log(`   ❌ Failed: ${stats.vendor.failed}`);
    console.log(`   ⚠️  No Token: ${stats.vendor.noToken}`);
    console.log(`\nCustomer App Users:`);
    console.log(`   Total: ${stats.customer.total}`);
    console.log(`   ✅ Success: ${stats.customer.success}`);
    console.log(`   ❌ Failed: ${stats.customer.failed}`);
    console.log(`   ⚠️  No Token: ${stats.customer.noToken}`);
    console.log(`\nOverall:`);
    console.log(`   Total Users: ${allUsers.length}`);
    console.log(`   ✅ Total Success: ${stats.vendor.success + stats.customer.success}`);
    console.log(`   ❌ Total Failed: ${stats.vendor.failed + stats.customer.failed}`);
    console.log(`   ⚠️  Total No Token: ${stats.vendor.noToken + stats.customer.noToken}`);
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
sendNotificationsToAllUsers()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Script failed:', error);
    process.exit(1);
  });

