/**
 * Script to delete a specific order by order number
 * Usage: node scripts/delete-order-by-number.js <order_number>
 * Example: node scripts/delete-order-by-number.js 106881249
 */

const Order = require('../models/Order');
const { getDynamoDBClient } = require('../config/dynamodb');
const { GetCommand, DeleteCommand, ScanCommand } = require('@aws-sdk/lib-dynamodb');

const orderNumber = process.argv[2];

if (!orderNumber) {
  console.error('❌ Please provide an order number');
  console.log('Usage: node scripts/delete-order-by-number.js <order_number>');
  process.exit(1);
}

async function deleteOrderByNumber() {
  try {
    console.log(`\n🔍 Looking for order number: ${orderNumber}\n`);
    
    const client = getDynamoDBClient();
    const orderNum = parseInt(orderNumber);
    
    // Try to find order by order_number or order_no
    const orders = await Order.findByOrderNo(orderNum);
    
    if (!orders || orders.length === 0) {
      console.log(`❌ No order found with order number: ${orderNumber}`);
      console.log(`   Trying alternative search methods...\n`);
      
      // Try scanning for order_number as string
      const scanCommand = new ScanCommand({
        TableName: 'orders',
        FilterExpression: 'order_number = :orderNum OR order_no = :orderNum OR order_number = :orderNumStr',
        ExpressionAttributeValues: {
          ':orderNum': orderNum,
          ':orderNumStr': String(orderNumber)
        }
      });
      
      const scanResponse = await client.send(scanCommand);
      if (scanResponse.Items && scanResponse.Items.length > 0) {
        orders.push(...scanResponse.Items);
      }
    }
    
    if (!orders || orders.length === 0) {
      console.log(`❌ Order number ${orderNumber} not found in database`);
      return;
    }
    
    console.log(`✅ Found ${orders.length} order(s) with order number: ${orderNumber}\n`);
    
    for (const order of orders) {
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('📦 Order Details:');
      console.log(`   Order ID: ${order.id}`);
      console.log(`   Order Number: ${order.order_number || order.order_no || 'N/A'}`);
      console.log(`   Customer ID: ${order.customer_id || 'N/A'}`);
      console.log(`   Shop ID: ${order.shop_id || 'N/A'}`);
      console.log(`   Status: ${order.status || 'N/A'}`);
      console.log(`   Estimated Price: ₹${order.estim_price || 0}`);
      console.log(`   Estimated Weight: ${order.estim_weight || 0} kg`);
      console.log(`   Date: ${order.date || order.created_at || 'N/A'}`);
      console.log('');
      
      console.log('🗑️  Deleting order...\n');
      
      try {
        const deleteCommand = new DeleteCommand({
          TableName: 'orders',
          Key: { id: order.id }
        });
        
        await client.send(deleteCommand);
        console.log(`✅ Order deleted successfully!`);
        console.log(`   Deleted Order ID: ${order.id}`);
        console.log(`   Deleted Order Number: ${order.order_number || order.order_no || orderNumber}`);
        console.log('');
      } catch (error) {
        console.error(`❌ Error deleting order ${order.id}:`, error.message);
        console.log('');
      }
    }
    
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

deleteOrderByNumber();




