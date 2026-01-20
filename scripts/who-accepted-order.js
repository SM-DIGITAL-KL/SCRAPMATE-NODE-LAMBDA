require('dotenv').config();
const Order = require('../models/Order');
const Shop = require('../models/Shop');
const User = require('../models/User');
const DeliveryBoy = require('../models/DeliveryBoy');
const { getDynamoDBClient } = require('../config/dynamodb');
const { ScanCommand } = require('@aws-sdk/lib-dynamodb');

const ORDER_NUMBER = process.argv[2] || 'ORD106881283';

async function whoAcceptedOrder() {
  try {
    console.log('\n🔍 Finding Who Accepted Order');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    console.log(`Order Number: ${ORDER_NUMBER}\n`);

    // Try multiple search strategies
    let orders = [];
    
    // Strategy 1: Try as string
    console.log('🔎 Searching as string...');
    orders = await Order.findByOrderNo(ORDER_NUMBER);
    
    // Strategy 2: Try as number (remove ORD prefix if present)
    if (orders.length === 0) {
      const orderNum = ORDER_NUMBER.replace(/^ORD/i, '');
      if (!isNaN(orderNum)) {
        console.log('🔎 Searching as number...');
        orders = await Order.findByOrderNo(parseInt(orderNum));
      }
    }
    
    // Strategy 3: Direct DynamoDB scan
    if (orders.length === 0) {
      console.log('🔎 Searching directly in DynamoDB...');
      const client = getDynamoDBClient();
      const orderNum = ORDER_NUMBER.replace(/^ORD/i, '');
      const orderNumInt = !isNaN(orderNum) ? parseInt(orderNum) : null;
      
      const command = new ScanCommand({
        TableName: 'orders',
        FilterExpression: 'order_number = :orderNoNum OR order_number = :orderNoStr OR order_no = :orderNoStr OR order_no = :orderNoNum',
        ExpressionAttributeValues: {
          ':orderNoNum': orderNumInt || ORDER_NUMBER,
          ':orderNoStr': ORDER_NUMBER
        }
      });
      
      const response = await client.send(command);
      orders = response.Items || [];
    }
    
    if (!orders || orders.length === 0) {
      console.error(`❌ Order not found: ${ORDER_NUMBER}`);
      return;
    }

    // If multiple orders found (shouldn't happen, but handle it)
    if (orders.length > 1) {
      console.log(`⚠️  Multiple orders found (${orders.length}). Using the first one.\n`);
    }

    const order = orders[0];
    
    console.log('✅ Order found:');
    console.log(`   Order ID: ${order.id}`);
    console.log(`   Order Number: ${order.order_number}`);
    console.log(`   Order No: ${order.order_no || 'N/A'}`);
    console.log(`   Customer ID: ${order.customer_id}`);
    console.log(`   Status: ${order.status} ${getStatusLabel(order.status)}`);
    console.log(`   Date: ${order.date || order.created_at || 'N/A'}`);
    if (order.accepted_at) {
      console.log(`   Accepted At: ${order.accepted_at}`);
    }
    console.log('');
    
    // Check all acceptance fields
    console.log('🔍 Checking who accepted this order...');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    
    let foundAcceptor = false;
    
    // Check shop_id (vendor acceptance)
    if (order.shop_id) {
      foundAcceptor = true;
      console.log('✅ Order accepted by VENDOR (shop_id found)');
      console.log(`   Shop ID: ${order.shop_id}`);
      
      try {
        const shop = await Shop.findById(order.shop_id);
        if (shop) {
          console.log(`   Shop Name: ${shop.shopname || 'N/A'}`);
          console.log(`   Owner Name: ${shop.ownername || 'N/A'}`);
          console.log(`   Contact: ${shop.contact || 'N/A'}`);
          console.log(`   Vendor User ID: ${shop.user_id || 'N/A'}`);
          
          if (shop.user_id) {
            const vendorUser = await User.findById(shop.user_id);
            if (vendorUser) {
              console.log('');
              console.log('👤 Vendor Details:');
              console.log(`   User ID: ${vendorUser.id}`);
              console.log(`   Name: ${vendorUser.name || 'N/A'}`);
              console.log(`   Phone: ${vendorUser.mob_num || 'N/A'}`);
              console.log(`   User Type: ${vendorUser.user_type || 'N/A'}`);
              console.log(`   App Type: ${vendorUser.app_type || 'N/A'}`);
            }
          }
        } else {
          console.log(`   ⚠️  Shop not found for shop_id: ${order.shop_id}`);
        }
      } catch (error) {
        console.error(`   ❌ Error finding shop: ${error.message}`);
      }
      console.log('');
    }
    
    // Check delv_id (delivery boy acceptance)
    if (order.delv_id || order.delv_boy_id) {
      foundAcceptor = true;
      const delvId = order.delv_id || order.delv_boy_id;
      console.log('✅ Order accepted by DELIVERY BOY (delv_id found)');
      console.log(`   Delivery Boy ID: ${delvId}`);
      
      try {
        const deliveryBoy = await DeliveryBoy.findByUserId(parseInt(delvId));
        if (deliveryBoy) {
          console.log(`   Delivery Boy Name: ${deliveryBoy.name || 'N/A'}`);
          console.log(`   Contact: ${deliveryBoy.contact || 'N/A'}`);
          console.log(`   User ID: ${deliveryBoy.user_id || delvId}`);
          
          if (deliveryBoy.user_id || delvId) {
            const userId = deliveryBoy.user_id || delvId;
            const deliveryUser = await User.findById(parseInt(userId));
            if (deliveryUser) {
              console.log('');
              console.log('👤 Delivery Boy Details:');
              console.log(`   User ID: ${deliveryUser.id}`);
              console.log(`   Name: ${deliveryUser.name || 'N/A'}`);
              console.log(`   Phone: ${deliveryUser.mob_num || 'N/A'}`);
              console.log(`   User Type: ${deliveryUser.user_type || 'N/A'}`);
              console.log(`   App Type: ${deliveryUser.app_type || 'N/A'}`);
            }
          }
        } else {
          // Try to find user directly
          const deliveryUser = await User.findById(parseInt(delvId));
          if (deliveryUser) {
            console.log('');
            console.log('👤 Delivery Boy Details (from User table):');
            console.log(`   User ID: ${deliveryUser.id}`);
            console.log(`   Name: ${deliveryUser.name || 'N/A'}`);
            console.log(`   Phone: ${deliveryUser.mob_num || 'N/A'}`);
            console.log(`   User Type: ${deliveryUser.user_type || 'N/A'}`);
            console.log(`   App Type: ${deliveryUser.app_type || 'N/A'}`);
          } else {
            console.log(`   ⚠️  Delivery boy not found for delv_id: ${delvId}`);
          }
        }
      } catch (error) {
        console.error(`   ❌ Error finding delivery boy: ${error.message}`);
      }
      console.log('');
    }
    
    if (!foundAcceptor) {
      console.log('⚠️  Order has status 2 (Accepted) but no shop_id or delv_id found.');
      console.log('   This might indicate a data inconsistency.');
      console.log('');
      console.log('📋 All order fields:');
      console.log(JSON.stringify(order, null, 2));
    }
    
    console.log('\n✅ Done!\n');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

function getStatusLabel(status) {
  const statusMap = {
    1: '(Pending)',
    2: '(Accepted)',
    3: '(Pickup Initiated)',
    4: '(Arrived Location)',
    5: '(Completed)',
    6: '(Accepted by other Partner)',
    7: '(Cancelled)'
  };
  return statusMap[status] || '';
}

// Run the script
whoAcceptedOrder();
