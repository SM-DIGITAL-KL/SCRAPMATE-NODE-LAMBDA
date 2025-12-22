/**
 * Create a mock order for customer 9074135121 to test vendor FCM notification
 */

require('dotenv').config();
const User = require('../models/User');
const Shop = require('../models/Shop');
const Order = require('../models/Order');
const { sendVendorNotification } = require('../utils/fcmNotification');

const CUSTOMER_PHONE = '9074135121';

async function createMockOrder() {
  try {
    console.log('\n🧪 Creating Mock Order for FCM Test');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    // Find customer app user
    const { getDynamoDBClient } = require('../config/dynamodb');
    const { ScanCommand } = require('@aws-sdk/lib-dynamodb');
    
    const client = getDynamoDBClient();
    const userScanCommand = new ScanCommand({
      TableName: 'users',
      FilterExpression: 'mob_num = :phone AND app_type = :appType',
      ExpressionAttributeValues: {
        ':phone': parseInt(CUSTOMER_PHONE),
        ':appType': 'customer_app'
      }
    });

    const userResult = await client.send(userScanCommand);
    const customerUser = userResult.Items?.find(u => u.app_type === 'customer_app');

    if (!customerUser) {
      console.error('❌ Customer app user not found for phone:', CUSTOMER_PHONE);
      return;
    }

    console.log('✅ Customer found:');
    console.log(`   User ID: ${customerUser.id}`);
    console.log(`   Name: ${customerUser.name || 'N/A'}`);
    console.log('');

    // Find a vendor shop (preferably B2C with FCM token)
    console.log('🔍 Finding vendor shop...');
    const vendorUserScanCommand = new ScanCommand({
      TableName: 'users',
      FilterExpression: 'app_type = :appType AND user_type IN (:type1, :type2)',
      ExpressionAttributeValues: {
        ':appType': 'vendor_app',
        ':type1': 'R', // Retailer/B2C
        ':type2': 'S'  // Shop/B2B
      }
    });

    const vendorUserResult = await client.send(vendorUserScanCommand);
    const vendorsWithFCM = vendorUserResult.Items?.filter(v => v.fcm_token) || [];
    
    if (vendorsWithFCM.length === 0) {
      console.error('❌ No vendors with FCM tokens found');
      return;
    }

    // Get the first vendor with FCM token
    const vendorUser = vendorsWithFCM[0];
    console.log('✅ Vendor found:');
    console.log(`   User ID: ${vendorUser.id}`);
    console.log(`   Name: ${vendorUser.name || 'N/A'}`);
    console.log(`   User Type: ${vendorUser.user_type}`);
    console.log(`   Has FCM Token: ✅`);
    console.log('');

    // Find shop for this vendor
    const shop = await Shop.findByUserId(vendorUser.id);
    if (!shop) {
      console.error('❌ Shop not found for vendor user ID:', vendorUser.id);
      return;
    }

    console.log('✅ Shop found:');
    console.log(`   Shop ID: ${shop.id}`);
    console.log(`   Shop Name: ${shop.shopname || 'N/A'}`);
    console.log('');

    // Get last order number
    const lastOrderNumber = await Order.getLastOrderNumber();
    let orderNumber = 10000;
    if (lastOrderNumber && !isNaN(lastOrderNumber)) {
      const lastNum = typeof lastOrderNumber === 'string' ? parseInt(lastOrderNumber) : lastOrderNumber;
      if (lastNum >= 10000 && lastNum < 999999999) {
        orderNumber = lastNum + 1;
      }
    }

    // Create mock order data
    const mockOrderDetails = [
      {
        material_name: 'Plastic Bottles',
        quantity: 5,
        unit: 'kg',
        price: 20
      },
      {
        material_name: 'Cardboard',
        quantity: 3,
        unit: 'kg',
        price: 15
      }
    ];

    const orderData = {
      order_number: orderNumber,
      customer_id: parseInt(customerUser.id),
      shop_id: parseInt(shop.id),
      orderdetails: JSON.stringify(mockOrderDetails),
      customerdetails: 'Kerala, 691558, Test Address for FCM Notification',
      shopdetails: `${shop.shopname || 'Test Shop'}, ${shop.address || 'Test Address'}, Contact: ${shop.contact || 'N/A'}`,
      del_type: 'pickup',
      estim_weight: 8, // 5 + 3 kg
      estim_price: 35, // 20 + 15
      status: 2, // Assigned (to trigger notification)
      address: 'Kerala, 691558, Test Address for FCM Notification',
      lat_log: '9.128073333333333,76.76712833333333',
      date: new Date().toISOString().split('T')[0],
      preferred_pickup_time: null
    };

    console.log('📦 Creating mock order...');
    console.log(`   Order Number: ${orderNumber}`);
    console.log(`   Customer ID: ${orderData.customer_id}`);
    console.log(`   Shop ID: ${orderData.shop_id}`);
    console.log(`   Status: ${orderData.status} (Assigned)`);
    console.log('');

    // Create the order
    const order = await Order.create(orderData);
    console.log('✅ Order created successfully!');
    console.log(`   Order ID: ${order.id}`);
    console.log('');

    // Now send notification to vendor (simulating the controller logic)
    console.log('📤 Sending FCM notification to vendor...');
    
    try {
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

      // Create concise notification
      const notificationTitle = `📦 New Pickup Request #${order.order_number}`;
      const addressPreview = order.customerdetails 
        ? (order.customerdetails.length > 50 
            ? order.customerdetails.substring(0, 50) + '...' 
            : order.customerdetails)
        : 'Address not provided';
      const notificationBody = `${orderDetailsText} | Weight: ${order.estim_weight || 0} kg | Price: ₹${order.estim_price || 0} | ${addressPreview}`;
      
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
          customer_id: customerUser.id.toString(),
          status: '2', // assigned
          timestamp: new Date().toISOString()
        }
      );
      
      if (notificationResult.success) {
        console.log('✅ FCM notification sent successfully!');
        console.log(`   Message ID: ${notificationResult.messageId}`);
        console.log(`   Vendor: ${vendorUser.name} (User ID: ${vendorUser.id})`);
        console.log(`   Shop: ${shop.shopname || 'N/A'} (Shop ID: ${shop.id})`);
      } else {
        console.error('❌ Notification failed:', notificationResult.error);
      }
    } catch (notifError) {
      console.error('❌ Error sending notification:', notifError);
      console.error('   Order was still created successfully');
    }

    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📋 Order Summary:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`Order ID: ${order.id}`);
    console.log(`Order Number: ${order.order_number}`);
    console.log(`Date: ${order.date}`);
    console.log(`Status: ${order.status} (Assigned)`);
    console.log(`Customer: ${customerUser.name} (ID: ${customerUser.id})`);
    console.log(`Vendor: ${vendorUser.name} (ID: ${vendorUser.id})`);
    console.log(`Shop: ${shop.shopname} (ID: ${shop.id})`);
    console.log(`Estimated Weight: ${order.estim_weight} kg`);
    console.log(`Estimated Price: ₹${order.estim_price}`);
    console.log(`Address: ${order.address}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    console.log('✅ Mock order created and notification sent!');
    console.log('   Check the vendor app to see if the notification was received.\n');

  } catch (error) {
    console.error('\n❌ Error:', error);
    console.error('   Stack:', error.stack);
  }
}

// Run the script
createMockOrder().catch(console.error);

