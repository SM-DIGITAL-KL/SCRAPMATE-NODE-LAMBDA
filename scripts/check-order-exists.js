/**
 * Script to thoroughly check if an order exists by order number
 * Usage: node scripts/check-order-exists.js <order_number>
 */

const Order = require('../models/Order');
const { getDynamoDBClient } = require('../config/dynamodb');
const { ScanCommand } = require('@aws-sdk/lib-dynamodb');

const orderNumber = process.argv[2];

if (!orderNumber) {
  console.error('❌ Please provide an order number');
  process.exit(1);
}

async function checkOrderExists() {
  try {
    console.log(`\n🔍 Thoroughly searching for order number: ${orderNumber}\n`);
    
    const client = getDynamoDBClient();
    const orderNum = parseInt(orderNumber);
    
    // Try multiple search methods
    console.log('Method 1: Searching by order_number (numeric)...');
    let scanCommand = new ScanCommand({
      TableName: 'orders',
      FilterExpression: 'order_number = :orderNum',
      ExpressionAttributeValues: {
        ':orderNum': orderNum
      }
    });
    
    let response = await client.send(scanCommand);
    let orders = response.Items || [];
    
    if (orders.length === 0) {
      console.log('   Not found. Trying order_no...');
      scanCommand = new ScanCommand({
        TableName: 'orders',
        FilterExpression: 'order_no = :orderNum',
        ExpressionAttributeValues: {
          ':orderNum': orderNum
        }
      });
      response = await client.send(scanCommand);
      orders = response.Items || [];
    }
    
    if (orders.length === 0) {
      console.log('   Not found. Trying order_no as string...');
      scanCommand = new ScanCommand({
        TableName: 'orders',
        FilterExpression: 'order_no = :orderNumStr',
        ExpressionAttributeValues: {
          ':orderNumStr': String(orderNumber)
        }
      });
      response = await client.send(scanCommand);
      orders = response.Items || [];
    }
    
    if (orders.length === 0) {
      console.log('   Not found. Trying order_number as string...');
      scanCommand = new ScanCommand({
        TableName: 'orders',
        FilterExpression: 'order_number = :orderNumStr',
        ExpressionAttributeValues: {
          ':orderNumStr': String(orderNumber)
        }
      });
      response = await client.send(scanCommand);
      orders = response.Items || [];
    }
    
    if (orders.length === 0) {
      console.log('   Not found. Scanning all orders (this may take a while)...');
      
      // Last resort: scan all and filter
      let lastKey = null;
      const allOrders = [];
      
      do {
        const params = {
          TableName: 'orders'
        };
        if (lastKey) {
          params.ExclusiveStartKey = lastKey;
        }
        
        scanCommand = new ScanCommand(params);
        response = await client.send(scanCommand);
        
        if (response.Items) {
          const matching = response.Items.filter(o => 
            o.order_number === orderNum || 
            o.order_no === orderNum ||
            String(o.order_number) === String(orderNumber) ||
            String(o.order_no) === String(orderNumber)
          );
          allOrders.push(...matching);
        }
        
        lastKey = response.LastEvaluatedKey;
        
        if (allOrders.length > 0) {
          console.log(`   Found ${allOrders.length} matching order(s) in scan...`);
          break;
        }
      } while (lastKey);
      
      orders = allOrders;
    }
    
    if (orders.length === 0) {
      console.log(`\n❌ Order number ${orderNumber} does NOT exist in the database`);
      console.log(`   The order has been successfully deleted or never existed.\n`);
      return;
    }
    
    console.log(`\n✅ Found ${orders.length} order(s) with order number: ${orderNumber}\n`);
    
    for (const order of orders) {
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('📦 Order Details:');
      console.log(`   Order ID: ${order.id}`);
      console.log(`   Order Number: ${order.order_number || order.order_no || 'N/A'}`);
      console.log(`   Customer ID: ${order.customer_id || 'N/A'}`);
      console.log(`   Shop ID: ${order.shop_id || 'N/A'}`);
      console.log(`   Status: ${order.status || 'N/A'}`);
      console.log(`   Estimated Price: ₹${order.estim_price || 0}`);
      console.log(`   Date: ${order.date || order.created_at || 'N/A'}`);
      console.log('');
    }
    
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

checkOrderExists();

 * Script to thoroughly check if an order exists by order number
 * Usage: node scripts/check-order-exists.js <order_number>
 */

const Order = require('../models/Order');
const { getDynamoDBClient } = require('../config/dynamodb');
const { ScanCommand } = require('@aws-sdk/lib-dynamodb');

const orderNumber = process.argv[2];

if (!orderNumber) {
  console.error('❌ Please provide an order number');
  process.exit(1);
}

async function checkOrderExists() {
  try {
    console.log(`\n🔍 Thoroughly searching for order number: ${orderNumber}\n`);
    
    const client = getDynamoDBClient();
    const orderNum = parseInt(orderNumber);
    
    // Try multiple search methods
    console.log('Method 1: Searching by order_number (numeric)...');
    let scanCommand = new ScanCommand({
      TableName: 'orders',
      FilterExpression: 'order_number = :orderNum',
      ExpressionAttributeValues: {
        ':orderNum': orderNum
      }
    });
    
    let response = await client.send(scanCommand);
    let orders = response.Items || [];
    
    if (orders.length === 0) {
      console.log('   Not found. Trying order_no...');
      scanCommand = new ScanCommand({
        TableName: 'orders',
        FilterExpression: 'order_no = :orderNum',
        ExpressionAttributeValues: {
          ':orderNum': orderNum
        }
      });
      response = await client.send(scanCommand);
      orders = response.Items || [];
    }
    
    if (orders.length === 0) {
      console.log('   Not found. Trying order_no as string...');
      scanCommand = new ScanCommand({
        TableName: 'orders',
        FilterExpression: 'order_no = :orderNumStr',
        ExpressionAttributeValues: {
          ':orderNumStr': String(orderNumber)
        }
      });
      response = await client.send(scanCommand);
      orders = response.Items || [];
    }
    
    if (orders.length === 0) {
      console.log('   Not found. Trying order_number as string...');
      scanCommand = new ScanCommand({
        TableName: 'orders',
        FilterExpression: 'order_number = :orderNumStr',
        ExpressionAttributeValues: {
          ':orderNumStr': String(orderNumber)
        }
      });
      response = await client.send(scanCommand);
      orders = response.Items || [];
    }
    
    if (orders.length === 0) {
      console.log('   Not found. Scanning all orders (this may take a while)...');
      
      // Last resort: scan all and filter
      let lastKey = null;
      const allOrders = [];
      
      do {
        const params = {
          TableName: 'orders'
        };
        if (lastKey) {
          params.ExclusiveStartKey = lastKey;
        }
        
        scanCommand = new ScanCommand(params);
        response = await client.send(scanCommand);
        
        if (response.Items) {
          const matching = response.Items.filter(o => 
            o.order_number === orderNum || 
            o.order_no === orderNum ||
            String(o.order_number) === String(orderNumber) ||
            String(o.order_no) === String(orderNumber)
          );
          allOrders.push(...matching);
        }
        
        lastKey = response.LastEvaluatedKey;
        
        if (allOrders.length > 0) {
          console.log(`   Found ${allOrders.length} matching order(s) in scan...`);
          break;
        }
      } while (lastKey);
      
      orders = allOrders;
    }
    
    if (orders.length === 0) {
      console.log(`\n❌ Order number ${orderNumber} does NOT exist in the database`);
      console.log(`   The order has been successfully deleted or never existed.\n`);
      return;
    }
    
    console.log(`\n✅ Found ${orders.length} order(s) with order number: ${orderNumber}\n`);
    
    for (const order of orders) {
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('📦 Order Details:');
      console.log(`   Order ID: ${order.id}`);
      console.log(`   Order Number: ${order.order_number || order.order_no || 'N/A'}`);
      console.log(`   Customer ID: ${order.customer_id || 'N/A'}`);
      console.log(`   Shop ID: ${order.shop_id || 'N/A'}`);
      console.log(`   Status: ${order.status || 'N/A'}`);
      console.log(`   Estimated Price: ₹${order.estim_price || 0}`);
      console.log(`   Date: ${order.date || order.created_at || 'N/A'}`);
      console.log('');
    }
    
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

checkOrderExists();


