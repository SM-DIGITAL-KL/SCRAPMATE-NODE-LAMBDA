require('dotenv').config();
const Order = require('../models/Order');
const { getDynamoDBClient } = require('../config/dynamodb');
const { DeleteCommand } = require('@aws-sdk/lib-dynamodb');

async function deleteOrder(orderId) {
  try {
    console.log(`\n🗑️  Deleting order ID: ${orderId}\n`);

    // First, find the order to get details
    const { GetCommand } = require('@aws-sdk/lib-dynamodb');
    const client = getDynamoDBClient();
    const oid = typeof orderId === 'string' && !isNaN(orderId) ? parseInt(orderId) : orderId;

    const getCommand = new GetCommand({
      TableName: 'orders',
      Key: { id: oid }
    });

    const response = await client.send(getCommand);
    if (!response.Item) {
      console.log(`❌ Order not found for ID: ${orderId}`);
      return null;
    }

    const order = response.Item;
    console.log(`✅ Found order:`);
    console.log(`   Order ID: ${order.id}`);
    console.log(`   Order Number: ${order.order_number}`);
    console.log(`   Customer ID: ${order.customer_id}`);
    console.log(`   Shop ID: ${order.shop_id || 'N/A'}`);
    console.log(`   Status: ${order.status}`);
    console.log(`   Address: ${order.address || 'N/A'}`);
    console.log(`   Estimated Weight: ${order.estim_weight || 0} kg`);
    console.log(`   Estimated Price: ₹${order.estim_price || 0}\n`);

    // Confirm deletion
    console.log(`⚠️  Proceeding to delete this order...\n`);

    // Delete the order
    const deleteCommand = new DeleteCommand({
      TableName: 'orders',
      Key: { id: oid }
    });

    await client.send(deleteCommand);
    console.log(`✅ Order deleted successfully!`);
    console.log(`   Deleted Order ID: ${order.id}`);
    console.log(`   Deleted Order Number: ${order.order_number}\n`);

    return order;
  } catch (error) {
    console.error('❌ Error deleting order:', error);
    throw error;
  }
}

const orderId = process.argv[2];

if (!orderId) {
  console.error('Usage: node scripts/delete-order.js <order_id>');
  process.exit(1);
}

deleteOrder(orderId)
  .then((result) => {
    if (result) {
      console.log('✅ Order deletion completed successfully');
      process.exit(0);
    } else {
      process.exit(1);
    }
  })
  .catch((error) => {
    console.error('Error:', error);
    process.exit(1);
  });

