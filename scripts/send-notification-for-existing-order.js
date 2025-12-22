/**
 * Send FCM notification for an existing order that didn't receive notification
 */

require('dotenv').config();
const path = require('path');
const { getDynamoDBClient } = require('../config/dynamodb');
const { ScanCommand } = require('@aws-sdk/lib-dynamodb');
const Shop = require('../models/Shop');
const User = require('../models/User');
const { sendVendorNotification } = require('../utils/fcmNotification');

const ORDER_NUMBER = process.argv[2] || '106881113';

async function sendNotificationForOrder() {
  try {
    console.log('\n📤 Sending FCM Notification for Existing Order');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    console.log(`Order Number: ${ORDER_NUMBER}\n`);

    const client = getDynamoDBClient();
    
    // Find the order
    const orderScanCommand = new ScanCommand({
      TableName: 'orders',
      FilterExpression: 'order_number = :orderNo',
      ExpressionAttributeValues: {
        ':orderNo': parseInt(ORDER_NUMBER)
      }
    });

    const orderResult = await client.send(orderScanCommand);
    const order = orderResult.Items?.[0];

    if (!order) {
      console.error('❌ Order not found:', ORDER_NUMBER);
      return;
    }

    console.log('✅ Order found:');
    console.log(`   Order ID: ${order.id}`);
    console.log(`   Order Number: ${order.order_number}`);
    console.log(`   Date: ${order.date}`);
    console.log(`   Status: ${order.status}`);
    console.log(`   Customer ID: ${order.customer_id}`);
    console.log(`   Shop ID: ${order.shop_id || 'Not assigned'}`);
    console.log('');

    // Check if order is assigned to a shop
    if (!order.shop_id) {
      console.error('❌ Order is not assigned to any shop. Cannot send notification.');
      return;
    }

    // Get shop details
    const shop = await Shop.findById(order.shop_id);
    if (!shop) {
      console.error('❌ Shop not found for shop_id:', order.shop_id);
      return;
    }

    console.log('✅ Shop found:');
    console.log(`   Shop ID: ${shop.id}`);
    console.log(`   Shop Name: ${shop.shopname || 'N/A'}`);
    console.log(`   User ID: ${shop.user_id || 'N/A'}`);
    console.log('');

    if (!shop.user_id) {
      console.error('❌ Shop has no user_id. Cannot find vendor user.');
      return;
    }

    // Get vendor user
    const vendorUser = await User.findById(shop.user_id);
    if (!vendorUser) {
      console.error('❌ Vendor user not found for user_id:', shop.user_id);
      return;
    }

    console.log('✅ Vendor user found:');
    console.log(`   User ID: ${vendorUser.id}`);
    console.log(`   Name: ${vendorUser.name || 'N/A'}`);
    console.log(`   Has FCM Token: ${!!vendorUser.fcm_token}`);
    console.log('');

    if (!vendorUser.fcm_token) {
      console.error('❌ Vendor user has no FCM token. Cannot send notification.');
      console.error('   The vendor needs to log in to the vendor app to register their FCM token.');
      return;
    }

    // Parse order details for notification
    let orderDetailsText = 'New pickup request';
    try {
      const orderDetailsObj = typeof order.orderdetails === 'string' 
        ? JSON.parse(order.orderdetails) 
        : order.orderdetails;
      
      if (orderDetailsObj && Array.isArray(orderDetailsObj) && orderDetailsObj.length > 0) {
        const materialCount = orderDetailsObj.length;
        const totalQty = orderDetailsObj.reduce((sum, item) => {
          const qty = parseFloat(item.quantity || item.qty || 0);
          return sum + qty;
        }, 0);
        orderDetailsText = `${materialCount} material(s), ${totalQty} kg`;
      }
    } catch (parseErr) {
      console.warn('⚠️  Could not parse order details for notification:', parseErr.message);
    }

    // Create notification
    const notificationTitle = `📦 New Pickup Request #${order.order_number}`;
    const addressPreview = order.customerdetails || order.address
      ? ((order.customerdetails || order.address).length > 50 
          ? (order.customerdetails || order.address).substring(0, 50) + '...' 
          : (order.customerdetails || order.address))
      : 'Address not provided';
    const notificationBody = `${orderDetailsText} | Weight: ${order.estim_weight || 0} kg | Price: ₹${order.estim_price || 0} | ${addressPreview}`;
    
    console.log('📤 Sending FCM notification...');
    console.log(`   Title: ${notificationTitle}`);
    console.log(`   Body: ${notificationBody}`);
    console.log('');

    // Send notification to vendor
    const notificationResult = await sendVendorNotification(
      vendorUser.fcm_token,
      notificationTitle,
      notificationBody,
      {
        type: 'new_order',
        order_id: order.id.toString(),
        order_number: order.order_number.toString(),
        shop_id: shop.id.toString(),
        customer_id: order.customer_id.toString(),
        status: order.status.toString(),
        timestamp: new Date().toISOString()
      }
    );
    
    if (notificationResult.success) {
      console.log('✅ FCM notification sent successfully!');
      console.log(`   Message ID: ${notificationResult.messageId}`);
      console.log(`   Vendor: ${vendorUser.name} (User ID: ${vendorUser.id})`);
      console.log(`   Shop: ${shop.shopname || 'N/A'} (Shop ID: ${shop.id})`);
      console.log(`   Order: #${order.order_number}`);
    } else {
      console.error('❌ Notification failed:', notificationResult.error);
      console.error(`   Message: ${notificationResult.message}`);
    }

    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  } catch (error) {
    console.error('\n❌ Error:', error);
    console.error('   Stack:', error.stack);
  }
}

// Run the script
sendNotificationForOrder().catch(console.error);

