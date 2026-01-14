/**
 * Extended script to find all orders for a given phone number
 * Searches by both customer_id and user_id
 * Usage: node scripts/find-orders-by-phone-extended.js <phone_number>
 * Example: node scripts/find-orders-by-phone-extended.js 7356468251
 */

require('dotenv').config();
const User = require('../models/User');
const Customer = require('../models/Customer');
const { getDynamoDBClient } = require('../config/dynamodb');
const { ScanCommand } = require('@aws-sdk/lib-dynamodb');
const { getTableName, getEnvironment } = require('../utils/dynamodbTableNames');

const phoneNumber = process.argv[2];
const ORDER_TABLE = getTableName('orders');

if (!phoneNumber) {
  console.error('❌ Please provide a phone number');
  console.log('Usage: node scripts/find-orders-by-phone-extended.js <phone_number>');
  console.log('Example: node scripts/find-orders-by-phone-extended.js 7356468251');
  process.exit(1);
}

async function findOrdersByPhoneExtended() {
  try {
    const environment = getEnvironment();
    console.log('🔍 Finding orders for phone number:', phoneNumber);
    console.log(`   Environment: ${environment}\n`);
    
    // Step 1: Find user(s) with this phone number
    console.log('📋 Step 1: Finding user(s) with this phone number...');
    const user = await User.findByMobile(phoneNumber);
    
    if (!user) {
      console.log(`❌ No user found with phone number ${phoneNumber}`);
      return;
    }
    
    console.log(`✅ Found user:`);
    console.log(`   User ID: ${user.id}`);
    console.log(`   Name: ${user.name || 'N/A'}`);
    console.log(`   User Type: ${user.user_type || 'N/A'}`);
    console.log(`   App Type: ${user.app_type || 'N/A'}`);
    console.log(`   App Version: ${user.app_version || 'N/A'}\n`);
    
    // Step 2: Find customer record to get customer_id
    console.log('📋 Step 2: Finding customer record...');
    const customer = await Customer.findByUserId(user.id);
    
    const customerId = customer ? customer.id : user.id;
    const userId = user.id;
    
    if (customer) {
      console.log(`✅ Found customer record:`);
      console.log(`   Customer ID: ${customer.id}`);
      console.log(`   Name: ${customer.name || 'N/A'}`);
      console.log(`   Contact: ${customer.contact || 'N/A'}`);
      console.log(`   Address: ${customer.address || 'N/A'}\n`);
    } else {
      console.log(`⚠️  No customer record found for user_id ${user.id}`);
      console.log(`   Will search orders using user_id as customer_id\n`);
    }
    
    // Step 3: Find all orders for this customer/user
    console.log('📋 Step 3: Finding orders...');
    console.log(`   Searching for customer_id: ${customerId}`);
    console.log(`   Searching for user_id: ${userId}\n`);
    
    const client = getDynamoDBClient();
    let lastKey = null;
    const allOrders = [];
    
    // Search for orders with customer_id
    do {
      const params = {
        TableName: ORDER_TABLE,
        FilterExpression: 'customer_id = :customerId',
        ExpressionAttributeValues: {
          ':customerId': customerId
        }
      };
      
      if (lastKey) {
        params.ExclusiveStartKey = lastKey;
      }
      
      const command = new ScanCommand(params);
      const response = await client.send(command);
      
      if (response.Items) {
        allOrders.push(...response.Items);
      }
      
      lastKey = response.LastEvaluatedKey;
    } while (lastKey);
    
    // Also search for orders with user_id (in case some orders use user_id instead)
    lastKey = null;
    do {
      const params = {
        TableName: ORDER_TABLE,
        FilterExpression: 'customer_id = :userId',
        ExpressionAttributeValues: {
          ':userId': userId
        }
      };
      
      if (lastKey) {
        params.ExclusiveStartKey = lastKey;
      }
      
      const command = new ScanCommand(params);
      const response = await client.send(command);
      
      if (response.Items) {
        // Only add if not already in allOrders (avoid duplicates)
        response.Items.forEach(order => {
          if (!allOrders.find(o => o.id === order.id)) {
            allOrders.push(order);
          }
        });
      }
      
      lastKey = response.LastEvaluatedKey;
    } while (lastKey);
    
    // Sort by id descending (newest first)
    allOrders.sort((a, b) => (b.id || 0) - (a.id || 0));
    
    if (allOrders.length === 0) {
      console.log(`❌ No orders found for customer_id ${customerId} or user_id ${userId}`);
      return;
    }
    
    console.log(`✅ Found ${allOrders.length} order(s)\n`);
    
    // Display orders summary
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📦 ORDERS SUMMARY');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`   Total Orders: ${allOrders.length}\n`);
    
    // Group by status
    const statusCounts = {};
    allOrders.forEach(order => {
      const status = order.status || 'unknown';
      statusCounts[status] = (statusCounts[status] || 0) + 1;
    });
    
    console.log('   Orders by Status:');
    Object.entries(statusCounts).forEach(([status, count]) => {
      console.log(`     ${status}: ${count}`);
    });
    console.log('');
    
    // Display order details
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📋 ORDER DETAILS');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    
    allOrders.forEach((order, index) => {
      console.log(`${index + 1}. Order #${order.order_no || order.order_number || order.id}`);
      console.log(`   Order ID: ${order.id}`);
      console.log(`   Status: ${order.status || 'N/A'}`);
      console.log(`   Customer ID: ${order.customer_id || 'N/A'}`);
      console.log(`   Shop ID: ${order.shop_id || 'N/A'}`);
      console.log(`   Price: ${order.price || order.total_price || 'N/A'}`);
      console.log(`   Weight: ${order.weight || order.estim_weight || 'N/A'}`);
      console.log(`   Created: ${order.created_at ? new Date(order.created_at).toLocaleString() : 'N/A'}`);
      console.log(`   Updated: ${order.updated_at ? new Date(order.updated_at).toLocaleString() : 'N/A'}`);
      if (order.customerdetails) {
        console.log(`   Address: ${order.customerdetails}`);
      }
      if (order.lat_log) {
        console.log(`   Location: ${order.lat_log}`);
      }
      console.log('');
    });
    
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('✅ Search completed');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    
  } catch (error) {
    console.error('❌ Error finding orders:', error);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run the script
findOrdersByPhoneExtended()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Script failed:', error);
    process.exit(1);
  });












