/**
 * Script to find SMS errors for a specific order
 * Checks the order's notified vendors and looks for SMS-related issues
 * 
 * Usage: node scripts/find-sms-errors-in-order.js [order_id]
 * Example: node scripts/find-sms-errors-in-order.js 1768127378180
 */

require('dotenv').config();
const Order = require('../models/Order');
const User = require('../models/User');
const BulkMessageNotification = require('../models/BulkMessageNotification');

const orderId = process.argv[2];

if (!orderId) {
  console.error('❌ Please provide an order ID');
  console.error('   Usage: node scripts/find-sms-errors-in-order.js [order_id]');
  process.exit(1);
}

async function findSMSErrors() {
  try {
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🔍 Finding SMS Errors for Order');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`Order ID: ${orderId}`);
    console.log('');
    
    // Get order
    const order = await Order.getById(orderId);
    if (!order) {
      console.error(`❌ Order ${orderId} not found`);
      process.exit(1);
    }
    
    console.log(`✅ Order found:`);
    console.log(`   Order Number: ${order.order_number || order.order_no || 'N/A'}`);
    console.log(`   Status: ${order.status}`);
    console.log(`   Created: ${order.created_at || 'N/A'}`);
    console.log(`   Amount: ₹${order.estim_price || order.estimated_price || 0}`);
    console.log('');
    
    // Get notified vendor IDs
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
    
    console.log(`👥 Notified Vendors: ${notifiedVendorIds.length}`);
    if (notifiedVendorIds.length === 0) {
      console.log('   ⚠️  No vendors were notified about this order');
      console.log('   This means SMS would not have been sent');
      process.exit(0);
    }
    
    console.log(`   Vendor IDs: ${notifiedVendorIds.join(', ')}`);
    console.log('');
    
    // Get vendor details
    console.log(`📱 Checking Vendor Details for SMS...`);
    const vendorUsers = await User.findByIds(notifiedVendorIds);
    console.log(`   Found ${vendorUsers.length} vendor users`);
    console.log('');
    
    // Check each vendor
    const issues = [];
    const phoneNumber = '9074135121';
    const targetVendor = vendorUsers.find(v => {
      const mobNum = String(v.mob_num || '').replace(/[\s+\-()]/g, '');
      return mobNum === phoneNumber || mobNum.endsWith(phoneNumber) || phoneNumber.endsWith(mobNum);
    });
    
    if (targetVendor) {
      console.log(`✅ Found vendor with phone ${phoneNumber}:`);
      console.log(`   User ID: ${targetVendor.id}`);
      console.log(`   Name: ${targetVendor.name || 'N/A'}`);
      console.log(`   Phone: ${targetVendor.mob_num || 'N/A'}`);
      console.log(`   User Type: ${targetVendor.user_type || 'N/A'}`);
      console.log(`   App Type: ${targetVendor.app_type || 'N/A'}`);
      
      const isInNotifiedList = notifiedVendorIds.includes(targetVendor.id) || 
                               notifiedVendorIds.includes(String(targetVendor.id)) ||
                               notifiedVendorIds.includes(Number(targetVendor.id));
      
      if (!isInNotifiedList) {
        console.log(`   ⚠️  WARNING: This vendor is NOT in notified_vendor_ids!`);
        issues.push(`Vendor ${targetVendor.id} (${phoneNumber}) is not in notified_vendor_ids`);
      } else {
        console.log(`   ✅ Vendor is in notified_vendor_ids`);
      }
    } else {
      console.log(`❌ Vendor with phone ${phoneNumber} NOT found in notified vendors`);
      console.log(`   This vendor may not have been notified about this order`);
      issues.push(`Vendor with phone ${phoneNumber} not found in notified vendors`);
    }
    
    console.log('');
    console.log(`📋 All Notified Vendors:`);
    vendorUsers.forEach((vendor, index) => {
      const mobNum = vendor.mob_num ? String(vendor.mob_num).replace(/[\s+\-()]/g, '') : 'N/A';
      const isTarget = mobNum === phoneNumber || mobNum.endsWith(phoneNumber);
      console.log(`   ${index + 1}. User ID: ${vendor.id}, Name: ${vendor.name || 'N/A'}, Phone: ${mobNum}${isTarget ? ' ⭐ (TARGET)' : ''}`);
    });
    
    console.log('');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('💡 To check AWS CloudWatch logs for SMS errors:');
    console.log('');
    console.log('1. Go to AWS CloudWatch Logs');
    console.log('2. Find your Lambda function log group');
    console.log('3. Search for these patterns:');
    console.log(`   - "Error sending SMS"`);
    console.log(`   - "SMS API error"`);
    console.log(`   - "SMS sent successfully"`);
    console.log(`   - "Processing SMS for vendor user_id: ${targetVendor?.id || 'N/A'}"`);
    console.log(`   - "Sending SMS to ${phoneNumber}"`);
    console.log('4. Filter by time range around order creation:');
    console.log(`   ${order.created_at || 'Order creation time'}`);
    console.log('');
    console.log('5. Look for these specific error messages:');
    console.log('   - "Vendor user not found"');
    console.log('   - "Invalid phone number"');
    console.log('   - "SMS API error"');
    console.log('   - "Error saving SMS to database"');
    console.log('   - Network/connection errors');
    console.log('');
    
    if (issues.length > 0) {
      console.log('⚠️  Issues Found:');
      issues.forEach(issue => console.log(`   - ${issue}`));
      console.log('');
    }
    
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
  } catch (error) {
    console.error('❌ Error:', error);
    console.error('   Message:', error.message);
    console.error('   Stack:', error.stack);
    process.exit(1);
  }
}

findSMSErrors();

