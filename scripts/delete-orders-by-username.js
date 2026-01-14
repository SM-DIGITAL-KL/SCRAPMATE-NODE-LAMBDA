/**
 * Script to delete all orders for a customer_app user by username
 * Usage: node scripts/delete-orders-by-username.js <username>
 * Example: node scripts/delete-orders-by-username.js User_9074135121
 * 
 * WARNING: This will permanently delete all orders for the customer_app user(s) with this name!
 */

const User = require('../models/User');
const Order = require('../models/Order');
const { getDynamoDBClient } = require('../config/dynamodb');
const { ScanCommand, DeleteCommand } = require('@aws-sdk/lib-dynamodb');

const userName = process.argv[2];

if (!userName) {
  console.error('❌ Please provide a username');
  console.log('Usage: node scripts/delete-orders-by-username.js <username>');
  process.exit(1);
}

async function deleteOrdersByUsername() {
  try {
    console.log(`\n⚠️  WARNING: This will DELETE ALL ORDERS for customer_app user(s) with name: ${userName}\n`);
    
    // Find users by name
    const client = getDynamoDBClient();
    
    let lastKey = null;
    const allUsers = [];
    
    do {
      const params = {
        TableName: 'users',
        FilterExpression: '#name = :name AND (attribute_not_exists(del_status) OR del_status <> :deleted)',
        ExpressionAttributeNames: {
          '#name': 'name'
        },
        ExpressionAttributeValues: {
          ':name': userName,
          ':deleted': 2
        }
      };
      
      if (lastKey) {
        params.ExclusiveStartKey = lastKey;
      }
      
      const command = new ScanCommand(params);
      const response = await client.send(command);
      
      if (response.Items && response.Items.length > 0) {
        allUsers.push(...response.Items);
      }
      
      lastKey = response.LastEvaluatedKey;
    } while (lastKey);
    
    if (allUsers.length === 0) {
      console.log(`❌ No users found with name: ${userName}`);
      return;
    }
    
    console.log(`✅ Found ${allUsers.length} user(s) with name: ${userName}\n`);
    
    // Filter for ONLY customer_app users with user_type 'C'
    const customerUsers = allUsers.filter(u => 
      u.app_type === 'customer_app' && 
      u.user_type === 'C' &&
      (u.del_status !== 2 || !u.del_status)
    );
    
    if (customerUsers.length === 0) {
      console.log(`❌ No customer_app users (user_type 'C') found with name: ${userName}`);
      console.log(`   Found ${allUsers.length} user(s), but none are customer_app users.`);
      console.log(`   User types found: ${allUsers.map(u => `${u.user_type || 'N/A'} (${u.app_type || 'no app_type'})`).join(', ')}`);
      return;
    }
    
    console.log(`✅ Found ${customerUsers.length} customer_app user(s) with name: ${userName}\n`);
    
    let totalDeleted = 0;
    let totalErrors = 0;
    
    // Process each customer user
    for (const customerUser of customerUsers) {
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('📋 Processing User:');
      console.log(`   User ID: ${customerUser.id}`);
      console.log(`   Name: ${customerUser.name || 'N/A'}`);
      console.log(`   Phone: ${customerUser.mob_num || 'N/A'}`);
      console.log(`   User Type: ${customerUser.user_type || 'N/A'}`);
      console.log(`   App Type: ${customerUser.app_type || 'N/A'}`);
      console.log('');
      
      // Find all orders for this customer
      const customerId = customerUser.id;
      console.log(`🔍 Finding orders for customer_id: ${customerId}...`);
      
      const orders = await Order.findByCustomerId(customerId);
      
      if (!orders || orders.length === 0) {
        console.log(`✅ No orders found for customer ID ${customerId} - nothing to delete\n`);
        continue;
      }
      
      console.log(`⚠️  Found ${orders.length} order(s) to delete\n`);
      
      // Delete orders
      console.log('🗑️  Deleting orders...');
      let deletedCount = 0;
      let errorCount = 0;
      
      for (const order of orders) {
        try {
          const deleteCommand = new DeleteCommand({
            TableName: 'orders',
            Key: { id: order.id }
          });
          
          await client.send(deleteCommand);
          deletedCount++;
          
          if (deletedCount % 10 === 0) {
            console.log(`   Deleted ${deletedCount}/${orders.length} orders...`);
          }
        } catch (error) {
          console.error(`   ❌ Error deleting order ${order.id}:`, error.message);
          errorCount++;
        }
      }
      
      console.log('');
      console.log(`✅ Deleted ${deletedCount} order(s) for customer ID ${customerId}`);
      if (errorCount > 0) {
        console.log(`⚠️  ${errorCount} order(s) could not be deleted due to errors`);
      }
      console.log('');
      
      totalDeleted += deletedCount;
      totalErrors += errorCount;
    }
    
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📊 Overall Deletion Summary');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`   Customer Users Processed: ${customerUsers.length}`);
    console.log(`   Total Orders Deleted: ${totalDeleted}`);
    console.log(`   Total Errors: ${totalErrors}`);
    console.log('');
    
    if (totalDeleted > 0) {
      console.log(`✅ Successfully deleted ${totalDeleted} order(s) for user name: ${userName}`);
    } else {
      console.log(`✅ No orders found to delete for user name: ${userName}`);
    }
    
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

deleteOrdersByUsername();




