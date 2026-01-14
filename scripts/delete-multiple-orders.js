/**
 * Script to permanently delete multiple orders from the database
 * 
 * Usage: node scripts/delete-multiple-orders.js
 */

require('dotenv').config();
const Order = require('../models/Order');
const { getDynamoDBClient } = require('../config/dynamodb');
const { DeleteCommand, GetCommand } = require('@aws-sdk/lib-dynamodb');
const RedisCache = require('../utils/redisCache');

// Order IDs to delete
const orderIds = [
  1768133873261,  // ORD106881282
  1768133765210,  // ORD106881281
  1768133493341,  // ORD106881280
  1768132389697,  // ORD106881279
  1768132102343,  // ORD106881278
  1768131748296   // ORD106881277
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
      console.log(`❌ Order not found: ${orderId}`);
      return { success: false, orderId, reason: 'not_found' };
    }

    const order = response.Item;
    console.log(`\n📦 Order found:`);
    console.log(`   Order ID: ${order.id}`);
    console.log(`   Order Number: ${order.order_number || order.order_no || 'N/A'}`);
    console.log(`   Customer ID: ${order.customer_id || 'N/A'}`);
    console.log(`   Status: ${order.status || 'N/A'}`);
    console.log(`   Amount: ₹${order.estim_price || order.estimated_price || 0}`);

    // Delete the order
    const deleteCommand = new DeleteCommand({
      TableName: 'orders',
      Key: { id: oid }
    });

    await client.send(deleteCommand);
    
    // Clear Redis cache for this order
    try {
      if (order.order_number || order.order_no) {
        await RedisCache.delete(RedisCache.orderKey(order.order_number || order.order_no));
      }
      await RedisCache.delete(RedisCache.orderKey(order.id));
      console.log(`   ✅ Redis cache cleared`);
    } catch (redisErr) {
      console.log(`   ⚠️  Redis cache clear failed (non-critical):`, redisErr.message);
    }

    console.log(`   ✅ Order deleted successfully!`);
    return { success: true, orderId, orderNumber: order.order_number || order.order_no };
  } catch (error) {
    console.error(`❌ Error deleting order ${orderId}:`, error.message);
    return { success: false, orderId, reason: error.message };
  }
}

async function deleteAllOrders() {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🗑️  Deleting Multiple Orders');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`\n📋 Orders to delete: ${orderIds.length}`);
  orderIds.forEach((id, index) => {
    console.log(`   ${index + 1}. Order ID: ${id}`);
  });
  console.log('');

  const results = [];
  for (const orderId of orderIds) {
    const result = await deleteOrder(orderId);
    results.push(result);
    // Small delay between deletions
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📊 Deletion Summary');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  
  const successful = results.filter(r => r.success);
  const failed = results.filter(r => !r.success);

  console.log(`\n✅ Successfully deleted: ${successful.length}/${orderIds.length}`);
  successful.forEach(r => {
    console.log(`   - Order ID: ${r.orderId}, Order Number: ${r.orderNumber || 'N/A'}`);
  });

  if (failed.length > 0) {
    console.log(`\n❌ Failed to delete: ${failed.length}/${orderIds.length}`);
    failed.forEach(r => {
      console.log(`   - Order ID: ${r.orderId}, Reason: ${r.reason}`);
    });
  }

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('✅ Deletion process completed');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
}

deleteAllOrders()
  .then(() => {
    console.log('✅ Script completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Script failed:', error);
    process.exit(1);
  });

