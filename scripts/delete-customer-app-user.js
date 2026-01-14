/**
 * Script to permanently delete a customer_app user with specific phone number and user type
 * Usage: node scripts/delete-customer-app-user.js <phone_number> <user_type>
 * Example: node scripts/delete-customer-app-user.js 9074135121 C
 */

require('dotenv').config();
const User = require('../models/User');
const Customer = require('../models/Customer');
const Address = require('../models/Address');
const { getDynamoDBClient } = require('../config/dynamodb');
const { DeleteCommand, ScanCommand } = require('@aws-sdk/lib-dynamodb');
const readline = require('readline');

const PHONE_NUMBER = process.argv[2];
const USER_TYPE = process.argv[3] || 'C';
const SKIP_CONFIRM = process.argv[4] === '--yes' || process.argv[4] === '-y';

if (!PHONE_NUMBER) {
  console.error('❌ Please provide a phone number');
  console.log('Usage: node scripts/delete-customer-app-user.js <phone_number> [user_type] [--yes]');
  process.exit(1);
}

let rl = null;

function askQuestion(query) {
  if (SKIP_CONFIRM) {
    return Promise.resolve('yes');
  }
  
  if (!rl) {
    rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
  }
  
  return new Promise(resolve => {
    rl.question(query, (answer) => {
      resolve(answer);
    });
  });
}

async function deleteCustomerAppUser() {
  try {
    console.log(`🔍 Searching for customer_app user with phone: ${PHONE_NUMBER}, user_type: ${USER_TYPE}\n`);
    
    const client = getDynamoDBClient();
    const mobileValue = parseInt(PHONE_NUMBER);
    
    // Find all users with this phone number
    let lastKey = null;
    const allUsers = [];
    
    do {
      const params = {
        TableName: 'users',
        FilterExpression: 'mob_num = :mobile',
        ExpressionAttributeValues: {
          ':mobile': mobileValue
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
      console.log(`❌ No users found with phone number ${PHONE_NUMBER}`);
      return;
    }
    
    console.log(`✅ Found ${allUsers.length} user(s) with phone number ${PHONE_NUMBER}:\n`);
    allUsers.forEach((user, index) => {
      console.log(`   User ${index + 1}:`);
      console.log(`   - ID: ${user.id}`);
      console.log(`   - Name: ${user.name || 'N/A'}`);
      console.log(`   - User Type: ${user.user_type || 'N/A'}`);
      console.log(`   - App Type: ${user.app_type || 'N/A'}`);
      console.log(`   - Email: ${user.email || 'N/A'}`);
      console.log(`   - Del Status: ${user.del_status || 'N/A'}`);
      console.log('');
    });
    
    // Find the specific customer_app user with user_type 'C'
    const customerUser = allUsers.find(u => 
      u.app_type === 'customer_app' && 
      u.user_type === USER_TYPE &&
      (u.del_status === undefined || u.del_status === null || u.del_status !== 2)
    );
    
    if (!customerUser) {
      console.log(`❌ No active customer_app user found with phone ${PHONE_NUMBER} and user_type ${USER_TYPE}`);
      console.log(`   Available users:`);
      allUsers.forEach(u => {
        console.log(`   - User ID: ${u.id}, Type: ${u.user_type}, App: ${u.app_type || 'N/A'}, Del Status: ${u.del_status || 'N/A'}`);
      });
      return;
    }
    
    console.log('✅ Found customer_app user to delete:');
    console.log(`   User ID: ${customerUser.id}`);
    console.log(`   Name: ${customerUser.name || 'N/A'}`);
    console.log(`   Email: ${customerUser.email || 'N/A'}`);
    console.log(`   Phone: ${customerUser.mob_num || 'N/A'}`);
    console.log(`   User Type: ${customerUser.user_type}`);
    console.log(`   App Type: ${customerUser.app_type}`);
    console.log('');
    
    // Check for associated customer record
    let customer = null;
    try {
      customer = await Customer.findByUserId(customerUser.id);
      if (customer) {
        console.log('⚠️  Found associated customer record:');
        console.log(`   Customer ID: ${customer.id}`);
        console.log(`   Name: ${customer.name || 'N/A'}`);
        console.log(`   Address: ${customer.address || 'N/A'}`);
        console.log('');
      }
    } catch (err) {
      console.log('ℹ️  No customer record found or error fetching it');
    }
    
    // Check for associated addresses
    let addresses = [];
    try {
      addresses = await Address.findByCustomerId(customerUser.id);
      if (addresses && addresses.length > 0) {
        console.log(`⚠️  Found ${addresses.length} associated address(es):`);
        addresses.forEach((addr, index) => {
          console.log(`   Address ${index + 1}:`);
          console.log(`   - ID: ${addr.id}`);
          console.log(`   - Address: ${addr.address || 'N/A'}`);
          console.log(`   - Type: ${addr.addres_type || 'N/A'}`);
          console.log('');
        });
      }
    } catch (err) {
      console.log('ℹ️  No addresses found or error fetching them');
    }
    
    // Check for orders
    let orders = [];
    try {
      let orderLastKey = null;
      do {
        const orderParams = {
          TableName: 'orders',
          FilterExpression: 'customer_id = :customerId',
          ExpressionAttributeValues: {
            ':customerId': customerUser.id
          }
        };
        
        if (orderLastKey) {
          orderParams.ExclusiveStartKey = orderLastKey;
        }
        
        const orderCommand = new ScanCommand(orderParams);
        const orderResponse = await client.send(orderCommand);
        
        if (orderResponse.Items && orderResponse.Items.length > 0) {
          orders.push(...orderResponse.Items);
        }
        
        orderLastKey = orderResponse.LastEvaluatedKey;
      } while (orderLastKey);
      
      if (orders.length > 0) {
        console.log(`⚠️  Found ${orders.length} associated order(s):`);
        console.log(`   Note: Orders will NOT be deleted. They will remain in the database.`);
        console.log(`   Order IDs: ${orders.map(o => o.id).join(', ')}`);
        console.log('');
      }
    } catch (err) {
      console.log('ℹ️  Error checking orders:', err.message);
    }
    
    // Confirm deletion
    console.log('⚠️  WARNING: This will PERMANENTLY DELETE the following:');
    console.log(`   - User record (ID: ${customerUser.id})`);
    if (customer) {
      console.log(`   - Customer record (ID: ${customer.id})`);
    }
    if (addresses.length > 0) {
      console.log(`   - ${addresses.length} address record(s)`);
    }
    console.log(`   - Orders will NOT be deleted (they will remain in database)`);
    console.log('');
    console.log('   This action CANNOT be undone!\n');
    
    const answer = await askQuestion('Are you sure you want to proceed? (yes/no): ');
    
    if (answer.toLowerCase() !== 'yes') {
      console.log('❌ Deletion cancelled.');
      rl.close();
      return;
    }
    
    console.log('\n🗑️  Starting deletion process...\n');
    
    // Delete addresses
    if (addresses.length > 0) {
      console.log(`🗑️  Deleting ${addresses.length} address(es)...`);
      for (const addr of addresses) {
        try {
          const deleteAddrCommand = new DeleteCommand({
            TableName: 'addresses',
            Key: { id: addr.id }
          });
          await client.send(deleteAddrCommand);
          console.log(`   ✅ Deleted address ID: ${addr.id}`);
        } catch (err) {
          console.error(`   ❌ Error deleting address ${addr.id}:`, err.message);
        }
      }
      console.log('');
    }
    
    // Delete customer record
    if (customer) {
      console.log('🗑️  Deleting customer record...');
      try {
        const deleteCustomerCommand = new DeleteCommand({
          TableName: 'customer',
          Key: { id: customer.id }
        });
        await client.send(deleteCustomerCommand);
        console.log(`   ✅ Deleted customer ID: ${customer.id}`);
      } catch (err) {
        console.error(`   ❌ Error deleting customer:`, err.message);
      }
      console.log('');
    }
    
    // Delete user record
    console.log('🗑️  Deleting user record...');
    const deleteUserCommand = new DeleteCommand({
      TableName: 'users',
      Key: {
        id: customerUser.id
      }
    });
    
    await client.send(deleteUserCommand);
    console.log(`✅ User deleted successfully!`);
    console.log(`   Deleted User ID: ${customerUser.id}`);
    console.log(`   Deleted Name: ${customerUser.name || 'N/A'}`);
    console.log(`   Deleted Phone: ${customerUser.mob_num || 'N/A'}`);
    console.log('');
    
    console.log('✅ Deletion process completed!');
    console.log(`   - User: ${customerUser.id} (DELETED)`);
    if (customer) {
      console.log(`   - Customer: ${customer.id} (DELETED)`);
    }
    if (addresses.length > 0) {
      console.log(`   - Addresses: ${addresses.length} (DELETED)`);
    }
    if (orders.length > 0) {
      console.log(`   - Orders: ${orders.length} (NOT DELETED - remain in database)`);
    }
    
  } catch (error) {
    console.error('❌ Error deleting user:', error);
    process.exit(1);
  } finally {
    if (rl) {
      rl.close();
    }
  }
}

// Run the script
deleteCustomerAppUser()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Script failed:', error);
    process.exit(1);
  });

