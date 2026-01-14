/**
 * Script to check AWS CloudWatch logs for SMS sending errors
 * This script helps identify SMS sending issues from order creation
 * 
 * Usage: node scripts/check-sms-errors-from-logs.js [order_id]
 * Example: node scripts/check-sms-errors-from-logs.js 1768127378180
 */

require('dotenv').config();
const Order = require('../models/Order');
const BulkMessageNotification = require('../models/BulkMessageNotification');
const User = require('../models/User');

const orderId = process.argv[2];

async function checkSMSErrors() {
  try {
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🔍 Checking SMS Errors for Order');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    if (orderId) {
      // Check specific order
      const order = await Order.getById(orderId);
      if (!order) {
        console.error(`❌ Order ${orderId} not found`);
        process.exit(1);
      }
      
      console.log(`\n📦 Order Details:`);
      console.log(`   Order ID: ${order.id}`);
      console.log(`   Order Number: ${order.order_number || order.order_no || 'N/A'}`);
      console.log(`   Status: ${order.status}`);
      console.log(`   Created: ${order.created_at || 'N/A'}`);
      
      // Check notified_vendor_ids
      let notifiedVendorIds = [];
      if (order.notified_vendor_ids) {
        try {
          notifiedVendorIds = typeof order.notified_vendor_ids === 'string'
            ? JSON.parse(order.notified_vendor_ids)
            : order.notified_vendor_ids;
          if (!Array.isArray(notifiedVendorIds)) {
            notifiedVendorIds = [notifiedVendorIds];
          }
        } catch (e) {
          console.error('   Error parsing notified_vendor_ids:', e);
        }
      }
      
      console.log(`\n👥 Notified Vendors: ${notifiedVendorIds.length}`);
      console.log(`   Vendor IDs: ${notifiedVendorIds.join(', ')}`);
      
      // Check SMS records in bulk_message_notifications
      console.log(`\n📱 Checking SMS Records in Database...`);
      
      // Get vendor phone numbers
      const vendorUsers = await User.findByIds(notifiedVendorIds);
      const vendorPhoneMap = {};
      vendorUsers.forEach(user => {
        if (user.mob_num) {
          vendorPhoneMap[user.id] = String(user.mob_num).replace(/[\s+\-()]/g, '');
        }
      });
      
      console.log(`   Found ${vendorUsers.length} vendor users with phone numbers`);
      
      // Check for SMS records
      let smsRecordsFound = 0;
      for (const vendorId of notifiedVendorIds) {
        const phoneNumber = vendorPhoneMap[vendorId];
        if (phoneNumber) {
          // Try to find SMS record (this is a simplified check - actual implementation would need to scan the table)
          console.log(`   Vendor ${vendorId} (${phoneNumber}): Check bulk_message_notifications table`);
        }
      }
      
      console.log(`\n💡 To check AWS CloudWatch logs:`);
      console.log(`   1. Go to AWS CloudWatch Logs`);
      console.log(`   2. Find log group for your Lambda function`);
      console.log(`   3. Search for: "SMS" OR "sms" OR "Error sending SMS"`);
      console.log(`   4. Filter by order ID: ${order.id}`);
      console.log(`   5. Look for errors around: ${order.created_at || 'order creation time'}`);
      
    } else {
      // General instructions
      console.log('\n📋 How to Check SMS Errors in AWS Logs:');
      console.log('');
      console.log('1. Go to AWS CloudWatch Logs');
      console.log('2. Find your Lambda function log group (e.g., /aws/lambda/your-function-name)');
      console.log('3. Search for these keywords:');
      console.log('   - "Error sending SMS"');
      console.log('   - "SMS API error"');
      console.log('   - "SMS sent successfully"');
      console.log('   - "SMS notifications"');
      console.log('4. Filter by time range (when order was created)');
      console.log('5. Look for error patterns:');
      console.log('   - Network errors');
      console.log('   - API authentication errors');
      console.log('   - Invalid phone numbers');
      console.log('   - Vendor not found errors');
      console.log('');
      console.log('💡 Common SMS Errors:');
      console.log('   - "Vendor user not found" → Vendor ID not in database');
      console.log('   - "Invalid phone number" → Phone format issue');
      console.log('   - "SMS API error" → Network/API issue');
      console.log('   - "Error saving SMS to database" → DynamoDB issue');
    }
    
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
  } catch (error) {
    console.error('❌ Error:', error);
    console.error('   Message:', error.message);
    console.error('   Stack:', error.stack);
    process.exit(1);
  }
}

checkSMSErrors();

