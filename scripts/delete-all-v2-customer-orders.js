require('dotenv').config();
const { getDynamoDBClient } = require('../config/dynamodb');
const { ScanCommand, DeleteCommand } = require('@aws-sdk/lib-dynamodb');

const User = require('../models/User');
const Order = require('../models/Order');

/**
 * Permanently delete all v2 customer orders from the database
 * WARNING: This is a destructive operation that cannot be undone!
 */
async function deleteAllV2CustomerOrders() {
  try {
    const client = getDynamoDBClient();
    
    console.log('\n' + '='.repeat(80));
    console.log('🗑️  DELETE ALL V2 CUSTOMER ORDERS');
    console.log('='.repeat(80));
    console.log('⚠️  WARNING: This will PERMANENTLY delete all orders from v2 customer_app users!');
    console.log('⚠️  This action CANNOT be undone!\n');
    
    let totalFoundUsers = 0;
    let totalFoundOrders = 0;
    let totalDeletedOrders = 0;
    let totalErrors = 0;

    // ========== STEP 1: FIND ALL V2 CUSTOMER_APP USERS ==========
    console.log('📋 Step 1: Finding all v2 customer_app users...\n');
    const v2CustomerAppUsers = [];
    let lastKey = null;
    
    do {
      const params = {
        TableName: 'users',
        FilterExpression: 'app_type = :appType AND app_version = :appVersion',
        ExpressionAttributeValues: {
          ':appType': 'customer_app',
          ':appVersion': 'v2'
        }
      };
      
      if (lastKey) {
        params.ExclusiveStartKey = lastKey;
      }
      
      const command = new ScanCommand(params);
      const response = await client.send(command);
      
      if (response.Items && response.Items.length > 0) {
        v2CustomerAppUsers.push(...response.Items);
        totalFoundUsers += response.Items.length;
        console.log(`   Found ${response.Items.length} v2 customer_app users in this batch (Total: ${totalFoundUsers})`);
      }
      
      lastKey = response.LastEvaluatedKey;
    } while (lastKey);
    
    if (v2CustomerAppUsers.length === 0) {
      console.log('✅ No v2 customer_app users found. No orders to delete.\n');
      return { 
        foundUsers: 0,
        foundOrders: 0,
        deletedOrders: 0,
        errors: 0 
      };
    }
    
    console.log(`\n✅ Found ${v2CustomerAppUsers.length} v2 customer_app user(s).\n`);
    
    // Extract customer IDs
    const customerIds = v2CustomerAppUsers.map(user => user.id);
    console.log(`📋 Customer IDs to check for orders: ${customerIds.length} customers\n`);

    // ========== STEP 2: FIND ALL ORDERS FOR THESE CUSTOMERS ==========
    console.log('📋 Step 2: Finding all orders for v2 customer_app users...\n');
    const ordersToDelete = [];
    
    // Process in batches to avoid memory issues
    const batchSize = 50;
    for (let i = 0; i < customerIds.length; i += batchSize) {
      const batch = customerIds.slice(i, i + batchSize);
      console.log(`   Checking orders for customers ${i + 1}-${Math.min(i + batchSize, customerIds.length)}...`);
      
      for (const customerId of batch) {
        try {
          const orders = await Order.findByCustomerId(customerId);
          if (orders && orders.length > 0) {
            ordersToDelete.push(...orders);
            console.log(`      Customer ${customerId}: Found ${orders.length} order(s)`);
          }
        } catch (error) {
          console.error(`      ❌ Error finding orders for customer ${customerId}:`, error.message);
          totalErrors++;
        }
      }
    }
    
    totalFoundOrders = ordersToDelete.length;
    
    if (ordersToDelete.length === 0) {
      console.log('\n✅ No orders found for v2 customer_app users. Nothing to delete.\n');
      return { 
        foundUsers: totalFoundUsers,
        foundOrders: 0,
        deletedOrders: 0,
        errors: totalErrors 
      };
    }
    
    console.log(`\n✅ Found ${ordersToDelete.length} order(s) total for v2 customer_app users.\n`);
    
    // Group orders by status for reporting
    const ordersByStatus = {};
    ordersToDelete.forEach(order => {
      const status = order.status || 'unknown';
      ordersByStatus[status] = (ordersByStatus[status] || 0) + 1;
    });
    
    console.log('📊 Orders by status:');
    Object.keys(ordersByStatus).forEach(status => {
      console.log(`   Status ${status}: ${ordersByStatus[status]} order(s)`);
    });
    console.log('');
    
    // Show sample orders
    console.log('📊 Sample orders to be deleted (first 10):');
    ordersToDelete.slice(0, 10).forEach((order, index) => {
      console.log(`   ${index + 1}. Order ID: ${order.id}, Order #: ${order.order_number || order.order_no || 'N/A'}, Customer: ${order.customer_id}, Status: ${order.status || 'N/A'}`);
    });
    if (ordersToDelete.length > 10) {
      console.log(`   ... and ${ordersToDelete.length - 10} more orders`);
    }
    console.log('');

    // ========== STEP 3: DELETE ORDERS ==========
    console.log('📋 Step 3: Permanently deleting v2 customer orders...\n');
    
    for (const order of ordersToDelete) {
      try {
        const deleteOrderCommand = new DeleteCommand({
          TableName: 'orders',
          Key: { id: order.id }
        });
        
        await client.send(deleteOrderCommand);
        console.log(`✅ Deleted order ${order.id} (Order #: ${order.order_number || order.order_no || 'N/A'}, Customer: ${order.customer_id})`);
        totalDeletedOrders++;
      } catch (error) {
        console.error(`❌ Error deleting order ${order.id}:`, error.message);
        totalErrors++;
      }
    }

    // ========== SUMMARY ==========
    console.log('\n' + '='.repeat(80));
    console.log('📊 DELETION SUMMARY:');
    console.log('='.repeat(80));
    console.log(`   V2 Customer App Users Found: ${totalFoundUsers}`);
    console.log(`   Orders Found: ${totalFoundOrders}`);
    console.log(`   Orders Deleted: ${totalDeletedOrders}`);
    console.log(`   Errors: ${totalErrors}`);
    console.log('\n   Orders by Status:');
    Object.keys(ordersByStatus).forEach(status => {
      console.log(`      Status ${status}: ${ordersByStatus[status]} order(s)`);
    });
    console.log('='.repeat(80) + '\n');

    if (totalErrors > 0) {
      console.log('⚠️  Some errors occurred during deletion. Please review the logs above.\n');
    } else {
      console.log('✅ All v2 customer orders have been permanently deleted.\n');
    }

    return { 
      foundUsers: totalFoundUsers,
      foundOrders: totalFoundOrders,
      deletedOrders: totalDeletedOrders,
      errors: totalErrors 
    };
  } catch (error) {
    console.error('❌ Fatal error deleting v2 customer orders:', error);
    throw error;
  }
}

// Run the script
// Add confirmation prompt for safety
const readline = require('readline');
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

console.log('\n⚠️  WARNING: This script will PERMANENTLY DELETE ALL orders from v2 customer_app users!');
console.log('⚠️  This action CANNOT be undone!\n');

rl.question('Type "DELETE ALL V2 CUSTOMER ORDERS" to confirm: ', (answer) => {
  if (answer === 'DELETE ALL V2 CUSTOMER ORDERS') {
    rl.close();
    deleteAllV2CustomerOrders()
      .then(result => {
        console.log('✅ Script completed successfully');
        process.exit(0);
      })
      .catch(error => {
        console.error('❌ Script failed:', error);
        process.exit(1);
      });
  } else {
    console.log('❌ Confirmation text does not match. Aborting deletion.');
    rl.close();
    process.exit(0);
  }
});

