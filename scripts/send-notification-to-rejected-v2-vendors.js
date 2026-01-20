require('dotenv').config();
const User = require('../models/User');
const Shop = require('../models/Shop');
const { sendVendorNotification } = require('../utils/fcmNotification');
const { getDynamoDBClient } = require('../config/dynamodb');
const { ScanCommand } = require('@aws-sdk/lib-dynamodb');

const NOTIFICATION_TITLE = 'Complete Your Profile';
const NOTIFICATION_MESSAGE = 'Your address and Aadhaar card details are missing. Customers from your locality are awaiting pickup. Your data is secure with us. Join with one of 1000+ vendors across India.';

async function sendNotificationToRejectedV2Vendors() {
  try {
    console.log('\n🔔 Sending Push Notifications to V2 Rejected Vendors');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    
    const client = getDynamoDBClient();
    const rejectedVendors = [];
    let lastKey = null;
    let scannedCount = 0;
    
    // Step 1: Find all v2 vendor_app users (R, S, SR, D types) with FCM tokens
    console.log('📋 Step 1: Finding v2 vendor_app users with rejected approval_status...');
    
    do {
      const params = {
        TableName: 'users',
        FilterExpression: 'app_version = :appVersion AND app_type = :appType AND user_type IN (:typeR, :typeS, :typeSR, :typeD) AND attribute_exists(fcm_token)',
        ExpressionAttributeValues: {
          ':appVersion': 'v2',
          ':appType': 'vendor_app',
          ':typeR': 'R',
          ':typeS': 'S',
          ':typeSR': 'SR',
          ':typeD': 'D'
        }
      };
      
      if (lastKey) {
        params.ExclusiveStartKey = lastKey;
      }
      
      const command = new ScanCommand(params);
      const response = await client.send(command);
      
      if (response.Items) {
        scannedCount += response.Items.length;
        console.log(`   Scanned ${scannedCount} users so far...`);
        
        for (const user of response.Items) {
          // Check if user has FCM token
          if (!user.fcm_token) {
            continue;
          }
          
          // Step 2: Check if user or shop has rejected approval_status
          try {
            let approvalStatus = user.approval_status;
            let shop = null;
            
            // Try to get shop to check shop approval_status
            try {
              shop = await Shop.findByUserId(user.id);
              if (shop && shop.approval_status) {
                approvalStatus = shop.approval_status;
              }
            } catch (shopErr) {
              // Shop not found or error - use user approval_status
            }
            
            // Check if rejected
            if (approvalStatus === 'rejected' || approvalStatus === 'Rejected' || approvalStatus === 'REJECTED') {
              rejectedVendors.push({
                user_id: user.id,
                name: user.name || 'N/A',
                mobile: user.mob_num || user.mobile || 'N/A',
                email: user.email || 'N/A',
                user_type: user.user_type,
                fcm_token: user.fcm_token,
                shop_id: shop?.id || null,
                shop_name: shop?.shopname || shop?.shop_name || 'N/A',
                approval_status: approvalStatus
              });
            }
          } catch (err) {
            console.error(`   Error checking user ${user.id}:`, err.message);
          }
        }
      }
      
      lastKey = response.LastEvaluatedKey;
    } while (lastKey);
    
    console.log(`✅ Found ${rejectedVendors.length} rejected v2 vendors with FCM tokens\n`);
    
    if (rejectedVendors.length === 0) {
      console.log('ℹ️  No rejected vendors found with FCM tokens.');
      return;
    }
    
    // Display summary
    console.log('📊 Summary:');
    console.log(`   Total rejected vendors: ${rejectedVendors.length}`);
    console.log('');
    
    // Step 3: Send notifications
    console.log('📤 Step 2: Sending push notifications...\n');
    
    let successCount = 0;
    let failureCount = 0;
    const results = [];
    
    for (let i = 0; i < rejectedVendors.length; i++) {
      const vendor = rejectedVendors[i];
      console.log(`[${i + 1}/${rejectedVendors.length}] Sending to: ${vendor.name} (ID: ${vendor.user_id}, Type: ${vendor.user_type})`);
      
      try {
        const result = await sendVendorNotification(
          vendor.fcm_token,
          NOTIFICATION_TITLE,
          NOTIFICATION_MESSAGE,
          {
            type: 'profile_completion_reminder',
            user_id: vendor.user_id.toString(),
            message: 'complete_profile'
          }
        );
        
        if (result.success) {
          successCount++;
          console.log(`   ✅ Notification sent successfully`);
          results.push({
            user_id: vendor.user_id,
            name: vendor.name,
            status: 'success',
            message_id: result.messageId
          });
        } else {
          failureCount++;
          console.log(`   ❌ Failed: ${result.error || 'Unknown error'}`);
          results.push({
            user_id: vendor.user_id,
            name: vendor.name,
            status: 'failed',
            error: result.error || 'Unknown error'
          });
        }
      } catch (err) {
        failureCount++;
        console.error(`   ❌ Error: ${err.message}`);
        results.push({
          user_id: vendor.user_id,
          name: vendor.name,
          status: 'error',
          error: err.message
        });
      }
      
      // Add small delay to avoid rate limiting
      if (i < rejectedVendors.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
    
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📊 Final Results:');
    console.log(`   ✅ Success: ${successCount}`);
    console.log(`   ❌ Failed: ${failureCount}`);
    console.log(`   📊 Total: ${rejectedVendors.length}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    
    // Save results to a summary
    console.log('📋 Detailed Results:');
    results.forEach((result, idx) => {
      const vendor = rejectedVendors[idx];
      console.log(`   ${idx + 1}. ${vendor.name} (ID: ${vendor.user_id}) - ${result.status.toUpperCase()}`);
      if (result.error) {
        console.log(`      Error: ${result.error}`);
      }
    });
    
    console.log('\n✅ Done!\n');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run the script
sendNotificationToRejectedV2Vendors();
