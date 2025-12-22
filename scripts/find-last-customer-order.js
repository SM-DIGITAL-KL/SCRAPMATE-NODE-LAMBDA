/**
 * Find the last order for a customer by phone number
 */

require('dotenv').config();
const { getDynamoDBClient } = require('../config/dynamodb');
const { ScanCommand } = require('@aws-sdk/lib-dynamodb');
const User = require('../models/User');
const Customer = require('../models/Customer');
const Order = require('../models/Order');

const PHONE_NUMBER = process.argv[2] || '9074135121';

async function findLastCustomerOrder() {
  try {
    console.log('\n🔍 Finding last order for customer:', PHONE_NUMBER);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    // Find customer app user
    const client = getDynamoDBClient();
    const scanCommand = new ScanCommand({
      TableName: 'users',
      FilterExpression: 'mob_num = :phone AND app_type = :appType',
      ExpressionAttributeValues: {
        ':phone': parseInt(PHONE_NUMBER),
        ':appType': 'customer_app'
      }
    });

    const userResult = await client.send(scanCommand);
    const customerUser = userResult.Items?.find(u => u.app_type === 'customer_app');

    if (!customerUser) {
      console.log('❌ Customer app user not found for phone number:', PHONE_NUMBER);
      return;
    }

    console.log('✅ Customer app user found:');
    console.log(`   User ID: ${customerUser.id}`);
    console.log(`   Name: ${customerUser.name || 'N/A'}`);
    console.log(`   Email: ${customerUser.email || 'N/A'}`);
    console.log(`   User Type: ${customerUser.user_type || 'N/A'}`);
    console.log('');

    // Find customer record
    const customer = await Customer.findByUserId(customerUser.id);
    
    if (!customer) {
      console.log('⚠️  Customer record not found for user ID:', customerUser.id);
      console.log('   Searching orders by user_id instead...\n');
    } else {
      console.log('✅ Customer record found:');
      console.log(`   Customer ID: ${customer.id}`);
      console.log(`   User ID: ${customer.user_id}`);
      console.log('');
    }

    // Note: Orders are stored with user_id as customer_id, not customer record ID
    // So we search by user_id
    const searchCustomerId = customerUser.id;

    // Find all orders for this customer
    console.log('🔍 Searching for orders...\n');
    console.log(`   Note: Orders are stored with user_id (${searchCustomerId}) as customer_id\n`);
    
    const orderScanCommand = new ScanCommand({
      TableName: 'orders',
      FilterExpression: 'customer_id = :customerId',
      ExpressionAttributeValues: {
        ':customerId': parseInt(searchCustomerId)
      }
    });

    const orderResult = await client.send(orderScanCommand);
    const orders = orderResult.Items || [];

    if (orders.length === 0) {
      console.log('❌ No orders found for this customer');
      return;
    }

    // Sort orders by date (most recent first)
    orders.sort((a, b) => {
      const dateA = a.date ? new Date(a.date).getTime() : 0;
      const dateB = b.date ? new Date(b.date).getTime() : 0;
      if (dateA !== dateB) return dateB - dateA;
      // If dates are same, sort by order_number (descending)
      const numA = parseInt(a.order_number) || 0;
      const numB = parseInt(b.order_number) || 0;
      return numB - numA;
    });

    const lastOrder = orders[0];

    console.log(`📦 Found ${orders.length} order(s). Last order details:\n`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`Order ID: ${lastOrder.id}`);
    console.log(`Order Number: ${lastOrder.order_number || 'N/A'}`);
    console.log(`Date: ${lastOrder.date || 'N/A'}`);
    console.log(`Status: ${lastOrder.status || 'N/A'} (1=Pending, 2=Assigned, 3=Accepted, 4=Completed, 5=Cancelled)`);
    console.log(`Customer ID: ${lastOrder.customer_id}`);
    console.log(`Shop ID: ${lastOrder.shop_id || 'Not assigned'}`);
    console.log(`Delivery Type: ${lastOrder.del_type || 'N/A'}`);
    console.log(`Estimated Weight: ${lastOrder.estim_weight || 0} kg`);
    console.log(`Estimated Price: ₹${lastOrder.estim_price || 0}`);
    console.log(`Address: ${lastOrder.address || lastOrder.customerdetails || 'N/A'}`);
    console.log(`Location: ${lastOrder.lat_log || 'N/A'}`);
    console.log(`Preferred Pickup Time: ${lastOrder.preferred_pickup_time || 'N/A'}`);
    
    if (lastOrder.shopdetails) {
      console.log(`Shop Details: ${lastOrder.shopdetails}`);
    }

    // Parse order details if available
    if (lastOrder.orderdetails) {
      try {
        const orderDetails = typeof lastOrder.orderdetails === 'string' 
          ? JSON.parse(lastOrder.orderdetails) 
          : lastOrder.orderdetails;
        
        if (Array.isArray(orderDetails) && orderDetails.length > 0) {
          console.log('\n📋 Order Items:');
          orderDetails.forEach((item, index) => {
            console.log(`   ${index + 1}. ${item.material_name || item.name || 'Material'}: ${item.quantity || item.qty || 0} ${item.unit || 'kg'}`);
          });
        }
      } catch (parseErr) {
        console.log(`\nOrder Details (raw): ${lastOrder.orderdetails}`);
      }
    }

    // Show images if available
    const images = [];
    for (let i = 1; i <= 6; i++) {
      const imgKey = `image${i}`;
      if (lastOrder[imgKey]) {
        images.push(lastOrder[imgKey]);
      }
    }
    if (images.length > 0) {
      console.log(`\n📷 Images: ${images.length} image(s) attached`);
      images.forEach((img, idx) => {
        console.log(`   ${idx + 1}. ${img}`);
      });
    }

    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`\n📊 Total Orders: ${orders.length}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  } catch (error) {
    console.error('\n❌ Error:', error);
    console.error('   Stack:', error.stack);
  }
}

// Run the script
findLastCustomerOrder().catch(console.error);

