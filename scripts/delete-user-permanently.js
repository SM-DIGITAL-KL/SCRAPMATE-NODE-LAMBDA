/**
 * Script to permanently delete a user and all associated data from database
 * Usage: node scripts/delete-user-permanently.js <phone_number>
 */

require('dotenv').config();
const User = require('../models/User');
const Shop = require('../models/Shop');
const { getDynamoDBClient } = require('../config/dynamodb');
const { DeleteCommand, ScanCommand } = require('@aws-sdk/lib-dynamodb');

const phoneNumber = process.argv[2];

if (!phoneNumber) {
  console.error('❌ Please provide a phone number');
  console.log('Usage: node scripts/delete-user-permanently.js <phone_number>');
  process.exit(1);
}

async function deleteUserPermanently() {
  try {
    // Initialize DynamoDB client
    const client = getDynamoDBClient();
    console.log('✅ DynamoDB client initialized\n');

    console.log(`🔍 Finding user with phone: ${phoneNumber}\n`);

    // Find user by phone number
    let user = null;
    let scanKey = null;
    const phoneFormats = [String(phoneNumber), parseInt(phoneNumber), phoneNumber];
    
    for (const phoneFormat of phoneFormats) {
      scanKey = null;
      do {
        const scanParams = {
          TableName: 'users',
          FilterExpression: 'mob_num = :mobNum',
          ExpressionAttributeValues: {
            ':mobNum': phoneFormat
          }
        };
        
        if (scanKey) {
          scanParams.ExclusiveStartKey = scanKey;
        }
        
        const scanCommand = new ScanCommand(scanParams);
        const response = await client.send(scanCommand);
        
        if (response.Items && response.Items.length > 0) {
          user = response.Items[0];
          break;
        }
        scanKey = response.LastEvaluatedKey;
      } while (scanKey);
      
      if (user) break;
    }

    if (!user) {
      console.error(`❌ User with phone ${phoneNumber} not found`);
      process.exit(1);
    }

    const { password: _, ...userWithoutPassword } = user;
    user = userWithoutPassword;

    console.log(`✅ Found user:`);
    console.log(`   - ID: ${user.id}`);
    console.log(`   - Name: ${user.name || 'N/A'}`);
    console.log(`   - Mobile: ${user.mob_num || 'N/A'}`);
    console.log(`   - Type: ${user.user_type || 'N/A'}`);
    console.log(`   - App Type: ${user.app_type || 'N/A'}\n`);

    // Confirm deletion
    console.log(`⚠️  WARNING: This will permanently delete:`);
    console.log(`   - User record (ID: ${user.id})`);
    console.log(`   - All associated shops`);
    console.log(`   - All associated orders`);
    console.log(`   - All associated data\n`);

    // Find all shops for this user
    console.log(`🔍 Finding all shops for user ${user.id}...`);
    let shops = [];
    scanKey = null;
    
    do {
      const scanParams = {
        TableName: 'shops',
        FilterExpression: 'user_id = :userId',
        ExpressionAttributeValues: {
          ':userId': user.id
        }
      };
      
      if (scanKey) {
        scanParams.ExclusiveStartKey = scanKey;
      }
      
      const scanCommand = new ScanCommand(scanParams);
      const response = await client.send(scanCommand);
      
      if (response.Items) {
        shops.push(...response.Items);
      }
      scanKey = response.LastEvaluatedKey;
    } while (scanKey);

    console.log(`   Found ${shops.length} shop(s):`);
    shops.forEach((shop, idx) => {
      console.log(`   ${idx + 1}. Shop ID: ${shop.id}, Name: ${shop.name || shop.shopname || 'N/A'}, Type: ${shop.shop_type || 'N/A'}`);
    });
    console.log('');

    // Find all orders for this user's shops
    console.log(`🔍 Finding all orders for user's shops...`);
    let orders = [];
    const shopIds = shops.map(s => s.id);
    
    if (shopIds.length > 0) {
      // DynamoDB doesn't support IN operator, so we need to use OR conditions
      const shopIdConditions = shopIds.map((_, idx) => `shop_id = :shopId${idx}`).join(' OR ');
      const expressionAttributeValues = {};
      shopIds.forEach((shopId, idx) => {
        expressionAttributeValues[`:shopId${idx}`] = shopId;
      });
      
      scanKey = null;
      do {
        const scanParams = {
          TableName: 'orders',
          FilterExpression: shopIdConditions,
          ExpressionAttributeValues: expressionAttributeValues
        };
        
        if (scanKey) {
          scanParams.ExclusiveStartKey = scanKey;
        }
        
        const scanCommand = new ScanCommand(scanParams);
        const response = await client.send(scanCommand);
        
        if (response.Items) {
          orders.push(...response.Items);
        }
        scanKey = response.LastEvaluatedKey;
      } while (scanKey);
    }

    console.log(`   Found ${orders.length} order(s)\n`);

    // Delete orders first
    if (orders.length > 0) {
      console.log(`🗑️  Deleting ${orders.length} order(s)...`);
      for (const order of orders) {
        try {
          const deleteCommand = new DeleteCommand({
            TableName: 'orders',
            Key: { id: order.id }
          });
          await client.send(deleteCommand);
          console.log(`   ✅ Deleted order: ${order.order_number || order.id}`);
        } catch (err) {
          console.error(`   ❌ Error deleting order ${order.id}:`, err.message);
        }
      }
      console.log('');
    }

    // Delete shops
    if (shops.length > 0) {
      console.log(`🗑️  Deleting ${shops.length} shop(s)...`);
      for (const shop of shops) {
        try {
          const deleteCommand = new DeleteCommand({
            TableName: 'shops',
            Key: { id: shop.id }
          });
          await client.send(deleteCommand);
          console.log(`   ✅ Deleted shop: ${shop.id} (${shop.name || shop.shopname || 'N/A'})`);
        } catch (err) {
          console.error(`   ❌ Error deleting shop ${shop.id}:`, err.message);
        }
      }
      console.log('');
    }

    // Delete user
    console.log(`🗑️  Deleting user ${user.id}...`);
    try {
      const deleteCommand = new DeleteCommand({
        TableName: 'users',
        Key: { id: user.id }
      });
      await client.send(deleteCommand);
      console.log(`   ✅ Deleted user: ${user.id} (${user.name || 'N/A'})\n`);
    } catch (err) {
      console.error(`   ❌ Error deleting user ${user.id}:`, err.message);
      process.exit(1);
    }

    console.log(`✅ User ${phoneNumber} and all associated data have been permanently deleted from the database.\n`);

    console.log(`📊 Summary:`);
    console.log(`   - User deleted: 1`);
    console.log(`   - Shops deleted: ${shops.length}`);
    console.log(`   - Orders deleted: ${orders.length}\n`);

  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

// Run the script
deleteUserPermanently();

