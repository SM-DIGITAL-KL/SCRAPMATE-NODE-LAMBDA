require('dotenv').config();
const { getDynamoDBClient } = require('../config/dynamodb');
const { ScanCommand, DeleteCommand } = require('@aws-sdk/lib-dynamodb');

const User = require('../models/User');
const Customer = require('../models/Customer');
const Order = require('../models/Order');
const Address = require('../models/Address');

/**
 * Permanently delete all v2 customer_app users and their related data
 * WARNING: This is a destructive operation that cannot be undone!
 */
async function deleteAllV2CustomerAppUsers() {
  try {
    const client = getDynamoDBClient();
    
    console.log('\n' + '='.repeat(80));
    console.log('🗑️  DELETE ALL V2 CUSTOMER_APP USERS');
    console.log('='.repeat(80));
    console.log('⚠️  WARNING: This will PERMANENTLY delete all v2 customer_app users!');
    console.log('⚠️  This action CANNOT be undone!\n');
    
    let totalFoundUsers = 0;
    let totalDeletedUsers = 0;
    let totalDeletedCustomers = 0;
    let totalErrors = 0;
    let totalRelatedOrders = 0;
    let totalRelatedAddresses = 0;

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
        console.log(`   Found ${response.Items.length} users in this batch (Total: ${totalFoundUsers})`);
      }
      
      lastKey = response.LastEvaluatedKey;
    } while (lastKey);
    
    if (v2CustomerAppUsers.length === 0) {
      console.log('✅ No v2 customer_app users found in the database.\n');
      return { 
        foundUsers: 0,
        deletedUsers: 0, 
        deletedCustomers: 0, 
        relatedOrders: 0,
        relatedAddresses: 0,
        errors: 0 
      };
    }
    
    console.log(`\n✅ Found ${v2CustomerAppUsers.length} v2 customer_app user(s) total.\n`);
    
    // Show summary of users to be deleted
    console.log('📊 Users to be deleted:');
    v2CustomerAppUsers.slice(0, 10).forEach((user, index) => {
      console.log(`   ${index + 1}. ID: ${user.id}, Name: ${user.name || 'N/A'}, Phone: ${user.mob_num || 'N/A'}`);
    });
    if (v2CustomerAppUsers.length > 10) {
      console.log(`   ... and ${v2CustomerAppUsers.length - 10} more users`);
    }
    console.log('');

    // ========== STEP 2: CHECK FOR RELATED DATA (ORDERS, ADDRESSES) ==========
    console.log('\n📋 Step 2: Checking for related data (orders, addresses)...\n');
    
    for (const user of v2CustomerAppUsers) {
      try {
        // First get customer record to find customer_id
        const customer = await Customer.findByUserId(user.id);
        
        if (customer) {
          // Check for orders using customer_id
          const orders = await Order.findByCustomerId(customer.id);
          if (orders && orders.length > 0) {
            totalRelatedOrders += orders.length;
            console.log(`   ⚠️  User ${user.id} (Customer ${customer.id}) has ${orders.length} order(s) - Orders will NOT be deleted (business records)`);
          }
          
          // Check for addresses using customer_id
          const addresses = await Address.findByCustomerId(customer.id);
          if (addresses && addresses.length > 0) {
            totalRelatedAddresses += addresses.length;
            console.log(`   ⚠️  User ${user.id} (Customer ${customer.id}) has ${addresses.length} address(es) - Addresses will NOT be deleted`);
          }
        }
      } catch (error) {
        // Ignore errors in checking related data
        console.error(`   ⚠️  Error checking related data for user ${user.id}:`, error.message);
      }
    }

    // ========== STEP 3: FIND AND DELETE CUSTOMER RECORDS ==========
    console.log('\n📋 Step 3: Finding and deleting customer records...\n');
    
    for (const user of v2CustomerAppUsers) {
      try {
        const customer = await Customer.findByUserId(user.id);
        
        if (customer) {
          console.log(`   🗑️  Deleting customer record for user ${user.id} (Customer ID: ${customer.id})`);
          
          await Customer.delete(customer.id);
          console.log(`      ✅ Deleted customer ${customer.id}\n`);
          totalDeletedCustomers++;
        }
      } catch (error) {
        console.error(`   ❌ Error processing customer for user ${user.id}:`, error.message);
        totalErrors++;
      }
    }
    
    if (totalRelatedOrders > 0 || totalRelatedAddresses > 0) {
      console.log(`\n   ⚠️  WARNING: Found ${totalRelatedOrders} order(s) and ${totalRelatedAddresses} address(es) related to these users.`);
      console.log(`   These will remain in the database but will be orphaned (no user reference).\n`);
    }

    // ========== STEP 4: DELETE USERS ==========
    console.log('\n📋 Step 4: Permanently deleting v2 customer_app users...\n');
    
    for (const user of v2CustomerAppUsers) {
      try {
        const deleteUserCommand = new DeleteCommand({
          TableName: 'users',
          Key: { id: user.id }
        });
        
        await client.send(deleteUserCommand);
        console.log(`✅ Deleted user ${user.id} (${user.name || 'N/A'}, Phone: ${user.mob_num || 'N/A'})`);
        totalDeletedUsers++;
      } catch (error) {
        console.error(`❌ Error deleting user ${user.id}:`, error.message);
        totalErrors++;
      }
    }

    // ========== SUMMARY ==========
    console.log('\n' + '='.repeat(80));
    console.log('📊 DELETION SUMMARY:');
    console.log('='.repeat(80));
    console.log(`   Users Found: ${totalFoundUsers}`);
    console.log(`   Users Deleted: ${totalDeletedUsers}`);
    console.log(`   Customer Records Deleted: ${totalDeletedCustomers}`);
    console.log(`   Related Orders (not deleted): ${totalRelatedOrders}`);
    console.log(`   Related Addresses (not deleted): ${totalRelatedAddresses}`);
    console.log(`   Errors: ${totalErrors}`);
    console.log('='.repeat(80) + '\n');

    if (totalErrors > 0) {
      console.log('⚠️  Some errors occurred during deletion. Please review the logs above.\n');
    } else {
      console.log('✅ All v2 customer_app users have been permanently deleted.\n');
    }

    return { 
      foundUsers: totalFoundUsers,
      deletedUsers: totalDeletedUsers, 
      deletedCustomers: totalDeletedCustomers,
      relatedOrders: totalRelatedOrders,
      relatedAddresses: totalRelatedAddresses,
      errors: totalErrors 
    };
  } catch (error) {
    console.error('❌ Fatal error deleting v2 customer_app users:', error);
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

console.log('\n⚠️  WARNING: This script will PERMANENTLY DELETE ALL v2 customer_app users!');
console.log('⚠️  This action CANNOT be undone!\n');

rl.question('Type "DELETE ALL V2 CUSTOMER APP USERS" to confirm: ', (answer) => {
  if (answer === 'DELETE ALL V2 CUSTOMER APP USERS') {
    rl.close();
    deleteAllV2CustomerAppUsers()
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

