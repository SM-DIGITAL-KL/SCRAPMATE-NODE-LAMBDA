require('dotenv').config();
const { getDynamoDBClient } = require('../config/dynamodb');
const { GetCommand, DeleteCommand } = require('@aws-sdk/lib-dynamodb');

// Order IDs to delete
const orderIds = [
  '1767969502194',
  '1767969178581',
  '1767968773119'
];

async function deleteOrder(orderId) {
  try {
    const client = getDynamoDBClient();
    const oid = typeof orderId === 'string' && !isNaN(orderId) ? parseInt(orderId) : orderId;

    // First, get the order to show details
    const getCommand = new GetCommand({
      TableName: 'orders',
      Key: { id: oid }
    });

    const response = await client.send(getCommand);
    if (!response.Item) {
      console.log(`❌ Order not found for ID: ${orderId}`);
      return { success: false, orderId, reason: 'not_found' };
    }

    const order = response.Item;
    console.log(`\n📋 Found order:`);
    console.log(`   Order ID: ${order.id}`);
    console.log(`   Order Number: ${order.order_number || order.order_no || 'N/A'}`);
    console.log(`   Customer ID: ${order.customer_id || 'N/A'}`);
    console.log(`   Shop ID: ${order.shop_id || 'N/A'}`);
    console.log(`   Status: ${order.status || 'N/A'}`);

    // Delete the order
    const deleteCommand = new DeleteCommand({
      TableName: 'orders',
      Key: { id: oid }
    });

    await client.send(deleteCommand);
    console.log(`✅ Order ${orderId} deleted successfully!`);
    
    return { success: true, orderId, orderNumber: order.order_number || order.order_no };
  } catch (error) {
    console.error(`❌ Error deleting order ${orderId}:`, error.message);
    return { success: false, orderId, reason: error.message };
  }
}

async function deleteAllOrders() {
  console.log('🗑️  Deleting orders in batch...\n');
  console.log(`📝 Orders to delete: ${orderIds.length}\n`);
  console.log('='.repeat(60));

  const results = [];

  for (const orderId of orderIds) {
    const result = await deleteOrder(orderId);
    results.push(result);
    console.log('='.repeat(60));
  }

  // Summary
  console.log('\n📊 Deletion Summary:');
  console.log('='.repeat(60));
  const successful = results.filter(r => r.success);
  const failed = results.filter(r => !r.success);

  console.log(`✅ Successfully deleted: ${successful.length} order(s)`);
  successful.forEach(r => {
    console.log(`   - Order ID: ${r.orderId}, Order Number: ${r.orderNumber || 'N/A'}`);
  });

  if (failed.length > 0) {
    console.log(`\n❌ Failed to delete: ${failed.length} order(s)`);
    failed.forEach(r => {
      console.log(`   - Order ID: ${r.orderId}, Reason: ${r.reason}`);
    });
  }

  console.log('='.repeat(60));
  console.log('\n✅ Batch deletion completed!');
}

deleteAllOrders()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  });




