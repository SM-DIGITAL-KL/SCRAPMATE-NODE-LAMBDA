/**
 * Script to delete all orders for a customer_app user by phone number
 * Usage: node scripts/delete-customer-orders-by-phone.js <phone_number>
 * Example: node scripts/delete-customer-orders-by-phone.js 9074135121
 * 
 * WARNING: This will permanently delete all orders for the customer_app user!
 */

const User = require('../models/User');
const Order = require('../models/Order');
const { getDynamoDBClient } = require('../config/dynamodb');
const { ScanCommand, DeleteCommand } = require('@aws-sdk/lib-dynamodb');

const phoneNumber = process.argv[2];

if (!phoneNumber) {
  console.error('❌ Please provide a phone number');
  console.log('Usage: node scripts/delete-customer-orders-by-phone.js <phone_number>');
  process.exit(1);
}

async function deleteCustomerOrders() {
  try {
    console.log(`\n⚠️  WARNING: This will DELETE ALL ORDERS for customer_app user with phone: ${phoneNumber}\n`);
    
    // Find customer app user
    const client = getDynamoDBClient();
    const { ScanCommand: UserScanCommand } = require('@aws-sdk/lib-dynamodb');
    
    let lastKey = null;
    const allUsers = [];
    
    do {
      const params = {
        TableName: 'users',
        FilterExpression: 'mob_num = :mobile AND (attribute_not_exists(del_status) OR del_status <> :deleted)',
        ExpressionAttributeValues: {
          ':mobile': parseInt(phoneNumber),
          ':deleted': 2
        }
      };
      
      if (lastKey) {
        params.ExclusiveStartKey = lastKey;
      }
      
      const command = new UserScanCommand(params);
      const response = await client.send(command);
      
      if (response.Items && response.Items.length > 0) {
        allUsers.push(...response.Items);
      }
      
      lastKey = response.LastEvaluatedKey;
    } while (lastKey);
    
    if (allUsers.length === 0) {
      console.log(`❌ No users found with phone number ${phoneNumber}`);
      return;
    }
    
    // Find ONLY customer_app users with user_type 'C'
    const customerUsers = allUsers.filter(u => 
      u.app_type === 'customer_app' && 
      u.user_type === 'C' &&
      (u.del_status !== 2 || !u.del_status)
    );
    
    if (customerUsers.length === 0) {
      console.log(`❌ No customer_app users (user_type 'C') found with phone number ${phoneNumber}`);
      console.log(`   Found ${allUsers.length} user(s), but none are customer_app users.`);
      return;
    }
    
    const customerUser = customerUsers.sort((a, b) => {
      const dateA = new Date(a.updated_at || a.created_at || 0);
      const dateB = new Date(b.updated_at || b.created_at || 0);
      return dateB - dateA;
    })[0];
    
    console.log('✅ Customer User Found:');
    console.log(`   User ID: ${customerUser.id}`);
    console.log(`   Name: ${customerUser.name || 'N/A'}`);
    console.log(`   Phone: ${customerUser.mob_num || 'N/A'}`);
    console.log(`   User Type: ${customerUser.user_type || 'N/A'}`);
    console.log(`   App Type: ${customerUser.app_type || 'N/A'}`);
    console.log('');
    
    // Find all orders for this customer
    const customerId = customerUser.id;
    console.log(`🔍 Finding orders for customer_id: ${customerId}...\n`);
    
    const orders = await Order.findByCustomerId(customerId);
    
    if (!orders || orders.length === 0) {
      console.log(`✅ No orders found for customer ID ${customerId} - nothing to delete`);
      return;
    }
    
    console.log(`⚠️  Found ${orders.length} order(s) to delete\n`);
    console.log('Orders to be deleted:');
    orders.slice(0, 10).forEach((order, index) => {
      console.log(`   ${index + 1}. Order #${order.order_number || order.order_no || order.id} - Status: ${order.status}`);
    });
    if (orders.length > 10) {
      console.log(`   ... and ${orders.length - 10} more orders`);
    }
    console.log('');
    
    // Delete orders
    console.log('🗑️  Deleting orders...\n');
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
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📊 Deletion Summary');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`   Total Orders Found: ${orders.length}`);
    console.log(`   Successfully Deleted: ${deletedCount}`);
    console.log(`   Errors: ${errorCount}`);
    console.log('');
    
    if (deletedCount > 0) {
      console.log(`✅ Successfully deleted ${deletedCount} order(s) for customer ID ${customerId}`);
    }
    
    if (errorCount > 0) {
      console.log(`⚠️  ${errorCount} order(s) could not be deleted due to errors`);
    }
    
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

deleteCustomerOrders();

 * Script to delete all orders for a customer_app user by phone number
 * Usage: node scripts/delete-customer-orders-by-phone.js <phone_number>
 * Example: node scripts/delete-customer-orders-by-phone.js 9074135121
 * 
 * WARNING: This will permanently delete all orders for the customer_app user!
 */

const User = require('../models/User');
const Order = require('../models/Order');
const { getDynamoDBClient } = require('../config/dynamodb');
const { ScanCommand, DeleteCommand } = require('@aws-sdk/lib-dynamodb');

const phoneNumber = process.argv[2];

if (!phoneNumber) {
  console.error('❌ Please provide a phone number');
  console.log('Usage: node scripts/delete-customer-orders-by-phone.js <phone_number>');
  process.exit(1);
}

async function deleteCustomerOrders() {
  try {
    console.log(`\n⚠️  WARNING: This will DELETE ALL ORDERS for customer_app user with phone: ${phoneNumber}\n`);
    
    // Find customer app user
    const client = getDynamoDBClient();
    const { ScanCommand: UserScanCommand } = require('@aws-sdk/lib-dynamodb');
    
    let lastKey = null;
    const allUsers = [];
    
    do {
      const params = {
        TableName: 'users',
        FilterExpression: 'mob_num = :mobile AND (attribute_not_exists(del_status) OR del_status <> :deleted)',
        ExpressionAttributeValues: {
          ':mobile': parseInt(phoneNumber),
          ':deleted': 2
        }
      };
      
      if (lastKey) {
        params.ExclusiveStartKey = lastKey;
      }
      
      const command = new UserScanCommand(params);
      const response = await client.send(command);
      
      if (response.Items && response.Items.length > 0) {
        allUsers.push(...response.Items);
      }
      
      lastKey = response.LastEvaluatedKey;
    } while (lastKey);
    
    if (allUsers.length === 0) {
      console.log(`❌ No users found with phone number ${phoneNumber}`);
      return;
    }
    
    // Find ONLY customer_app users with user_type 'C'
    const customerUsers = allUsers.filter(u => 
      u.app_type === 'customer_app' && 
      u.user_type === 'C' &&
      (u.del_status !== 2 || !u.del_status)
    );
    
    if (customerUsers.length === 0) {
      console.log(`❌ No customer_app users (user_type 'C') found with phone number ${phoneNumber}`);
      console.log(`   Found ${allUsers.length} user(s), but none are customer_app users.`);
      return;
    }
    
    const customerUser = customerUsers.sort((a, b) => {
      const dateA = new Date(a.updated_at || a.created_at || 0);
      const dateB = new Date(b.updated_at || b.created_at || 0);
      return dateB - dateA;
    })[0];
    
    console.log('✅ Customer User Found:');
    console.log(`   User ID: ${customerUser.id}`);
    console.log(`   Name: ${customerUser.name || 'N/A'}`);
    console.log(`   Phone: ${customerUser.mob_num || 'N/A'}`);
    console.log(`   User Type: ${customerUser.user_type || 'N/A'}`);
    console.log(`   App Type: ${customerUser.app_type || 'N/A'}`);
    console.log('');
    
    // Find all orders for this customer
    const customerId = customerUser.id;
    console.log(`🔍 Finding orders for customer_id: ${customerId}...\n`);
    
    const orders = await Order.findByCustomerId(customerId);
    
    if (!orders || orders.length === 0) {
      console.log(`✅ No orders found for customer ID ${customerId} - nothing to delete`);
      return;
    }
    
    console.log(`⚠️  Found ${orders.length} order(s) to delete\n`);
    console.log('Orders to be deleted:');
    orders.slice(0, 10).forEach((order, index) => {
      console.log(`   ${index + 1}. Order #${order.order_number || order.order_no || order.id} - Status: ${order.status}`);
    });
    if (orders.length > 10) {
      console.log(`   ... and ${orders.length - 10} more orders`);
    }
    console.log('');
    
    // Delete orders
    console.log('🗑️  Deleting orders...\n');
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
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📊 Deletion Summary');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`   Total Orders Found: ${orders.length}`);
    console.log(`   Successfully Deleted: ${deletedCount}`);
    console.log(`   Errors: ${errorCount}`);
    console.log('');
    
    if (deletedCount > 0) {
      console.log(`✅ Successfully deleted ${deletedCount} order(s) for customer ID ${customerId}`);
    }
    
    if (errorCount > 0) {
      console.log(`⚠️  ${errorCount} order(s) could not be deleted due to errors`);
    }
    
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

deleteCustomerOrders();




