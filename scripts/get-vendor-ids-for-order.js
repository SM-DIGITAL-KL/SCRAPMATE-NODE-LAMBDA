require('dotenv').config();
const Order = require('../models/Order');
const Shop = require('../models/Shop');
const User = require('../models/User');
const { getDynamoDBClient } = require('../config/dynamodb');
const { ScanCommand } = require('@aws-sdk/lib-dynamodb');

const ORDER_NUMBER = process.argv[2] || '106881213';

async function getVendorIdsForOrder() {
  try {
    console.log('\n🔍 Finding Vendor IDs for Order');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    console.log(`Order Number: ${ORDER_NUMBER}\n`);

    // Try multiple search strategies
    let orders = [];
    
    // Strategy 1: Try as string
    console.log('🔎 Searching as string...');
    orders = await Order.findByOrderNo(ORDER_NUMBER);
    
    // Strategy 2: Try as number
    if (orders.length === 0 && !isNaN(ORDER_NUMBER)) {
      console.log('🔎 Searching as number...');
      orders = await Order.findByOrderNo(parseInt(ORDER_NUMBER));
    }
    
    // Strategy 3: Try with ORD prefix
    if (orders.length === 0) {
      console.log('🔎 Searching with ORD prefix...');
      orders = await Order.findByOrderNo(`ORD${ORDER_NUMBER}`);
    }
    
    // Strategy 4: Direct DynamoDB scan with both string and number
    if (orders.length === 0) {
      console.log('🔎 Searching directly in DynamoDB (string and number)...');
      const client = getDynamoDBClient();
      const orderNum = parseInt(ORDER_NUMBER);
      
      const command = new ScanCommand({
        TableName: 'orders',
        FilterExpression: 'order_number = :orderNoNum OR order_number = :orderNoStr OR order_no = :orderNoStr OR order_no = :orderNoNum',
        ExpressionAttributeValues: {
          ':orderNoNum': orderNum,
          ':orderNoStr': ORDER_NUMBER
        }
      });
      
      const response = await client.send(command);
      orders = response.Items || [];
    }
    
    if (!orders || orders.length === 0) {
      console.error(`❌ Order not found: ${ORDER_NUMBER}`);
      console.log('\n💡 Tips:');
      console.log('   - Check if the order number is correct');
      console.log('   - The order might be stored with a different format (e.g., ORD106881213)');
      console.log('   - The order might not exist in the database');
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
    console.log(`   Shop ID: ${order.shop_id || 'Not assigned'}`);
    console.log(`   Status: ${order.status}`);
    console.log(`   Date: ${order.date || order.created_at || 'N/A'}`);
    if (order.accepted_at) {
      console.log(`   Accepted At: ${order.accepted_at}`);
    }
    console.log('');

    // Find who accepted the order
    if (order.shop_id) {
      console.log('🔍 Finding who accepted this order...');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
      
      try {
        const shop = await Shop.findById(order.shop_id);
        if (shop) {
          console.log('✅ Shop found:');
          console.log(`   Shop ID: ${shop.id}`);
          console.log(`   Shop Name: ${shop.shopname || 'N/A'}`);
          console.log(`   Owner Name: ${shop.ownername || 'N/A'}`);
          console.log(`   Contact: ${shop.contact || 'N/A'}`);
          console.log(`   Vendor User ID: ${shop.user_id || 'N/A'}`);
          console.log('');
          
          if (shop.user_id) {
            const vendorUser = await User.findById(shop.user_id);
            if (vendorUser) {
              console.log('✅ Vendor who accepted the order:');
              console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
              console.log(`   User ID: ${vendorUser.id}`);
              console.log(`   Name: ${vendorUser.name || 'N/A'}`);
              console.log(`   Phone: ${vendorUser.mob_num || 'N/A'}`);
              console.log(`   User Type: ${vendorUser.user_type || 'N/A'}`);
              console.log(`   App Type: ${vendorUser.app_type || 'N/A'}`);
              console.log('');
            } else {
              console.log('⚠️  Vendor user not found for user_id:', shop.user_id);
            }
          }
        } else {
          console.log('⚠️  Shop not found for shop_id:', order.shop_id);
        }
      } catch (error) {
        console.error('❌ Error finding shop/vendor:', error.message);
      }
    } else {
      console.log('ℹ️  Order has no shop_id - it has not been accepted yet.');
      console.log('');
    }

    // Extract vendor IDs
    let vendorIds = null;
    
    if (order.notified_vendor_ids) {
      try {
        // Parse if it's a JSON string, otherwise use as-is
        if (typeof order.notified_vendor_ids === 'string') {
          vendorIds = JSON.parse(order.notified_vendor_ids);
        } else {
          vendorIds = order.notified_vendor_ids;
        }
        
        // Ensure it's an array
        if (!Array.isArray(vendorIds)) {
          console.warn(`⚠️  notified_vendor_ids is not an array. Type: ${typeof vendorIds}`);
          console.warn(`   Value: ${JSON.stringify(vendorIds)}`);
          vendorIds = [vendorIds];
        }
      } catch (parseErr) {
        console.error('❌ Error parsing notified_vendor_ids:', parseErr.message);
        console.error(`   Raw value: ${order.notified_vendor_ids}`);
        console.error(`   Type: ${typeof order.notified_vendor_ids}`);
        return;
      }
    } else {
      console.log('⚠️  No vendor IDs found for this order.');
      console.log('   The order does not have a notified_vendor_ids field.');
      console.log('   This means no vendors were notified about this order.');
      return;
    }

    // Display vendor IDs
    console.log('📋 Vendor IDs saved in database:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    if (vendorIds.length === 0) {
      console.log('   (Empty array - no vendors were notified)');
    } else {
      vendorIds.forEach((vendorId, index) => {
        console.log(`   ${index + 1}. Vendor ID: ${vendorId}`);
      });
      console.log('');
      console.log(`   Total: ${vendorIds.length} vendor(s)`);
      console.log('');
      console.log('   JSON format:');
      console.log(`   ${JSON.stringify(vendorIds, null, 2)}`);
    }
    
    console.log('\n✅ Done!\n');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run the script
getVendorIdsForOrder();

