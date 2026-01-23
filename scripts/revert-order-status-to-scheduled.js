/**
 * Revert order status from Accepted back to Scheduled
 * Usage: node scripts/revert-order-status-to-scheduled.js <order_number>
 * Example: node scripts/revert-order-status-to-scheduled.js ORD106881321
 */

require('dotenv').config();
const { loadEnvFromFile } = require('../utils/loadEnv');
loadEnvFromFile();

const Order = require('../models/Order');

async function revertOrderStatus() {
  try {
    const orderNumber = process.argv[2];
    
    if (!orderNumber) {
      console.error('❌ Please provide an order number');
      console.log('Usage: node scripts/revert-order-status-to-scheduled.js <order_number>');
      console.log('Example: node scripts/revert-order-status-to-scheduled.js ORD106881321');
      process.exit(1);
    }
    
    // Extract numeric part from order number (e.g., ORD106881321 -> 106881321)
    const orderNo = orderNumber.toString().replace(/^ORD/i, '');
    const orderNoNum = parseInt(orderNo);
    
    if (isNaN(orderNoNum)) {
      console.error(`❌ Invalid order number: ${orderNumber}`);
      process.exit(1);
    }
    
    console.log(`🔍 Finding order: ${orderNumber} (numeric: ${orderNoNum})...\n`);
    
    // Find order by order number
    const orders = await Order.findByOrderNo(orderNoNum);
    if (!orders || orders.length === 0) {
      console.error(`❌ Order ${orderNumber} not found`);
      process.exit(1);
    }
    
    const order = orders[0];
    console.log(`✅ Order found:`);
    console.log(`   Order ID: ${order.id}`);
    console.log(`   Order Number: ${order.order_number || order.order_no || 'N/A'}`);
    console.log(`   Current Status: ${order.status} ${order.status === 1 ? '(Scheduled)' : order.status === 2 ? '(Accepted)' : order.status === 3 ? '(Processing)' : order.status === 4 ? '(Completed)' : order.status === 5 ? '(Declined)' : '(Unknown)'}`);
    console.log(`   Shop ID: ${order.shop_id || 'N/A'}`);
    console.log(`   Delivery Boy ID: ${order.delv_id || order.delv_boy_id || 'N/A'}`);
    console.log(`   Customer ID: ${order.customer_id || 'N/A'}`);
    console.log(`   Amount: ₹${order.estim_price || order.amount || 'N/A'}`);
    console.log('');
    
    // Check if order is already in Scheduled status
    if (order.status === 1) {
      console.log('ℹ️  Order is already in Scheduled status (status = 1)');
      process.exit(0);
    }
    
    // Confirm before reverting
    console.log(`⚠️  This will revert the order status from ${order.status} (${order.status === 2 ? 'Accepted' : 'Other'}) to 1 (Scheduled)`);
    console.log(`   This will also clear shop_id and delv_id if they exist.`);
    console.log('');
    
    // Update order status to 1 (Scheduled)
    console.log('🔄 Updating order status to Scheduled (1)...');
    
    const { getDynamoDBClient } = require('../config/dynamodb');
    const { UpdateCommand } = require('@aws-sdk/lib-dynamodb');
    const client = getDynamoDBClient();
    
    const updateExpression = 'SET #status = :status, updated_at = :updatedAt';
    const expressionAttributeNames = { '#status': 'status' };
    const expressionAttributeValues = {
      ':status': 1, // Scheduled
      ':updatedAt': new Date().toISOString()
    };
    
    // Optionally clear shop_id and delv_id to make it unassigned
    // Uncomment the lines below if you want to clear shop_id and delv_id
    // updateExpression += ', shop_id = :nullShop, delv_id = :nullDelv, delv_boy_id = :nullDelv';
    // expressionAttributeValues[':nullShop'] = null;
    // expressionAttributeValues[':nullDelv'] = null;
    
    const command = new UpdateCommand({
      TableName: 'orders',
      Key: { id: order.id },
      UpdateExpression: updateExpression,
      ExpressionAttributeNames: expressionAttributeNames,
      ExpressionAttributeValues: expressionAttributeValues
    });
    
    await client.send(command);
    
    console.log('✅ Order status updated successfully!');
    console.log('');
    console.log('📋 Updated Order Details:');
    console.log(`   Order ID: ${order.id}`);
    console.log(`   Order Number: ${order.order_number || order.order_no || 'N/A'}`);
    console.log(`   New Status: 1 (Scheduled)`);
    console.log(`   Updated At: ${new Date().toISOString()}`);
    console.log('');
    console.log('✅ Done!');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

revertOrderStatus();
