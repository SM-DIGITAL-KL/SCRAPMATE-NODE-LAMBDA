require('dotenv').config();
const Order = require('../models/Order');

async function fixOrderNumber(orderId, newOrderNumber) {
  try {
    console.log(`\n🔧 Fixing order number for order ID: ${orderId}\n`);

    // Find order by ID
    const orders = await Order.findByOrderNo(orderId);
    if (orders.length === 0) {
      // Try finding by ID directly
      const { getDynamoDBClient } = require('../config/dynamodb');
      const { GetCommand } = require('@aws-sdk/lib-dynamodb');
      const client = getDynamoDBClient();
      const oid = typeof orderId === 'string' && !isNaN(orderId) ? parseInt(orderId) : orderId;
      
      const command = new GetCommand({
        TableName: 'orders',
        Key: { id: oid }
      });
      
      const response = await client.send(command);
      if (!response.Item) {
        console.log(`❌ Order not found for ID: ${orderId}`);
        return null;
      }
      
      const order = response.Item;
      console.log(`✅ Found order:`);
      console.log(`   Current Order Number: ${order.order_number}`);
      console.log(`   Order ID: ${order.id}`);
      
      // Get last valid order number if newOrderNumber not provided
      if (!newOrderNumber) {
        const lastOrderNumber = await Order.getLastOrderNumber();
        if (lastOrderNumber && !isNaN(lastOrderNumber)) {
          const lastNum = typeof lastOrderNumber === 'string' ? parseInt(lastOrderNumber) : lastOrderNumber;
          if (lastNum >= 10000 && lastNum < 999999999) {
            newOrderNumber = lastNum + 1;
          } else {
            newOrderNumber = 10000;
          }
        } else {
          newOrderNumber = 10000;
        }
      }
      
      console.log(`   New Order Number: ${newOrderNumber}\n`);
      
      // Update order number
      const { UpdateCommand } = require('@aws-sdk/lib-dynamodb');
      const updateCommand = new UpdateCommand({
        TableName: 'orders',
        Key: { id: oid },
        UpdateExpression: 'SET order_number = :orderNumber, order_no = :orderNo, updated_at = :updated',
        ExpressionAttributeValues: {
          ':orderNumber': newOrderNumber,
          ':orderNo': `ORD${newOrderNumber}`,
          ':updated': new Date().toISOString()
        },
        ReturnValues: 'ALL_NEW'
      });
      
      const updateResponse = await client.send(updateCommand);
      console.log(`✅ Order number updated successfully!`);
      console.log(`   New Order Number: ${updateResponse.Attributes.order_number}`);
      console.log(`   New Order No: ${updateResponse.Attributes.order_no}\n`);
      
      return updateResponse.Attributes;
    }
  } catch (error) {
    console.error('❌ Error fixing order number:', error);
    throw error;
  }
}

// Get order ID and optional new order number from command line arguments
const orderId = process.argv[2];
const newOrderNumber = process.argv[3] ? parseInt(process.argv[3]) : null;

if (!orderId) {
  console.error('Usage: node scripts/fix-order-number.js <order_id> [new_order_number]');
  console.error('   If new_order_number is not provided, it will be auto-generated');
  process.exit(1);
}

fixOrderNumber(orderId, newOrderNumber)
  .then((result) => {
    if (result) {
      process.exit(0);
    } else {
      process.exit(1);
    }
  })
  .catch((error) => {
    console.error('Error:', error);
    process.exit(1);
  });

