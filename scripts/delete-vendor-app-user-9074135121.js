#!/usr/bin/env node

/**
 * Script to permanently delete vendor_app user with phone number 9074135121
 * Usage: node scripts/delete-vendor-app-user-9074135121.js [env] [--yes]
 * Example: node scripts/delete-vendor-app-user-9074135121.js prod
 * Example: node scripts/delete-vendor-app-user-9074135121.js prod --yes
 */

require('dotenv').config();
const { getDynamoDBClient } = require('../config/dynamodb');
const { ScanCommand, DeleteCommand } = require('@aws-sdk/lib-dynamodb');
const { getTableName } = require('../utils/dynamodbTableNames');
const readline = require('readline');

const PHONE_NUMBER = '9074135121';
const args = process.argv.slice(2);
const env = args.find(arg => !arg.startsWith('--')) || process.env.NODE_ENV || 'prod';
const SKIP_CONFIRM = args.includes('--yes') || args.includes('-y');

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

async function deleteVendorAppUser() {
  try {
    process.env.NODE_ENV = env;
    const client = getDynamoDBClient();
    const usersTableName = getTableName('users');
    const shopsTableName = getTableName('shops');
    
    console.log(`\n🗑️  Deleting vendor_app user with phone: ${PHONE_NUMBER}`);
    console.log(`   Environment: ${env}`);
    console.log(`   Users Table: ${usersTableName}`);
    console.log(`   Shops Table: ${shopsTableName}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    
    const mobileValue = parseInt(PHONE_NUMBER);
    
    // Find all users with this phone number
    let lastKey = null;
    const allUsers = [];
    
    console.log('📋 Step 1: Finding users with phone number...\n');
    do {
      const params = {
        TableName: usersTableName,
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
    
    // Find the vendor_app user
    const vendorUser = allUsers.find(u => 
      u.app_type === 'vendor_app' &&
      (u.del_status === undefined || u.del_status === null || u.del_status !== 2)
    );
    
    if (!vendorUser) {
      console.log(`❌ No active vendor_app user found with phone ${PHONE_NUMBER}`);
      console.log(`   Available users:`);
      allUsers.forEach(u => {
        console.log(`   - User ID: ${u.id}, Type: ${u.user_type}, App: ${u.app_type || 'N/A'}, Del Status: ${u.del_status || 'N/A'}`);
      });
      return;
    }
    
    console.log('✅ Found vendor_app user to delete:');
    console.log(`   User ID: ${vendorUser.id}`);
    console.log(`   Name: ${vendorUser.name || 'N/A'}`);
    console.log(`   Email: ${vendorUser.email || 'N/A'}`);
    console.log(`   Phone: ${vendorUser.mob_num || 'N/A'}`);
    console.log(`   User Type: ${vendorUser.user_type}`);
    console.log(`   App Type: ${vendorUser.app_type}`);
    console.log('');
    
    // Check for associated shops
    console.log('📋 Step 2: Finding associated shops...\n');
    let shops = [];
    try {
      let shopLastKey = null;
      do {
        const shopParams = {
          TableName: shopsTableName,
          FilterExpression: 'user_id = :userId',
          ExpressionAttributeValues: {
            ':userId': vendorUser.id
          }
        };
        
        if (shopLastKey) {
          shopParams.ExclusiveStartKey = shopLastKey;
        }
        
        const shopCommand = new ScanCommand(shopParams);
        const shopResponse = await client.send(shopCommand);
        
        if (shopResponse.Items && shopResponse.Items.length > 0) {
          shops.push(...shopResponse.Items);
        }
        
        shopLastKey = shopResponse.LastEvaluatedKey;
      } while (shopLastKey);
      
      if (shops.length > 0) {
        console.log(`⚠️  Found ${shops.length} associated shop(s):`);
        shops.forEach((shop, index) => {
          console.log(`   Shop ${index + 1}:`);
          console.log(`   - ID: ${shop.id}`);
          console.log(`   - Name: ${shop.shopname || 'N/A'}`);
          console.log(`   - Type: ${shop.shop_type || 'N/A'}`);
          console.log(`   - Contact: ${shop.contact || 'N/A'}`);
          console.log('');
        });
      } else {
        console.log('ℹ️  No shops found for this user\n');
      }
    } catch (err) {
      console.log('ℹ️  Error checking shops:', err.message);
    }
    
    // Check for orders
    console.log('📋 Step 3: Checking for associated orders...\n');
    let orders = [];
    try {
      const ordersTableName = getTableName('orders');
      let orderLastKey = null;
      do {
        const orderParams = {
          TableName: ordersTableName,
          FilterExpression: 'shop_id = :shopId',
          ExpressionAttributeValues: {
            ':shopId': shops.length > 0 ? shops[0].id : vendorUser.id
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
        console.log(`   Order IDs: ${orders.slice(0, 10).map(o => o.id).join(', ')}${orders.length > 10 ? ` ... and ${orders.length - 10} more` : ''}`);
        console.log('');
      } else {
        console.log('ℹ️  No orders found for this user\n');
      }
    } catch (err) {
      console.log('ℹ️  Error checking orders:', err.message);
    }
    
    // Confirm deletion
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('⚠️  WARNING: This will PERMANENTLY DELETE the following:');
    console.log(`   - User record (ID: ${vendorUser.id})`);
    if (shops.length > 0) {
      console.log(`   - ${shops.length} shop record(s)`);
    }
    console.log(`   - Orders will NOT be deleted (they will remain in database)`);
    console.log('');
    console.log('   This action CANNOT be undone!\n');
    
    const answer = await askQuestion('Are you sure you want to proceed? (yes/no): ');
    
    if (answer.toLowerCase() !== 'yes') {
      console.log('❌ Deletion cancelled.');
      if (rl) rl.close();
      return;
    }
    
    console.log('\n🗑️  Starting deletion process...\n');
    
    // Delete shops
    if (shops.length > 0) {
      console.log(`🗑️  Deleting ${shops.length} shop(s)...`);
      for (const shop of shops) {
        try {
          const deleteShopCommand = new DeleteCommand({
            TableName: shopsTableName,
            Key: { id: shop.id }
          });
          await client.send(deleteShopCommand);
          console.log(`   ✅ Deleted shop ID: ${shop.id} (${shop.shopname || 'N/A'})`);
        } catch (err) {
          console.error(`   ❌ Error deleting shop ${shop.id}:`, err.message);
        }
      }
      console.log('');
    }
    
    // Delete user record
    console.log('🗑️  Deleting user record...');
    const deleteUserCommand = new DeleteCommand({
      TableName: usersTableName,
      Key: {
        id: vendorUser.id
      }
    });
    
    await client.send(deleteUserCommand);
    console.log(`✅ User deleted successfully!`);
    console.log(`   Deleted User ID: ${vendorUser.id}`);
    console.log(`   Deleted Name: ${vendorUser.name || 'N/A'}`);
    console.log(`   Deleted Phone: ${vendorUser.mob_num || 'N/A'}`);
    console.log('');
    
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('✅ Deletion process completed!');
    console.log(`   - User: ${vendorUser.id} (DELETED)`);
    if (shops.length > 0) {
      console.log(`   - Shops: ${shops.length} (DELETED)`);
    }
    if (orders.length > 0) {
      console.log(`   - Orders: ${orders.length} (NOT DELETED - remain in database)`);
    }
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    
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
deleteVendorAppUser()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Script failed:', error);
    process.exit(1);
  });

