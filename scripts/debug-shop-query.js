/**
 * Script to debug shop query issues
 * Usage: node scripts/debug-shop-query.js <user_id>
 */

const Shop = require('../models/Shop');
const { getDynamoDBClient } = require('../config/dynamodb');
const { ScanCommand } = require('@aws-sdk/lib-dynamodb');

const userId = process.argv[2];

if (!userId) {
  console.error('❌ Please provide a user ID');
  console.log('Usage: node scripts/debug-shop-query.js <user_id>');
  process.exit(1);
}

async function debugShopQuery() {
  try {
    const uid = parseInt(userId);
    console.log(`🔍 Debugging shop query for user_id: ${uid} (type: ${typeof uid})\n`);
    
    // Test findAllByUserId
    console.log('1️⃣ Testing Shop.findAllByUserId:');
    const allShops = await Shop.findAllByUserId(uid);
    console.log(`   Result: ${allShops.length} shop(s) found`);
    allShops.forEach((shop, idx) => {
      console.log(`   Shop ${idx + 1}: ID=${shop.id}, user_id=${shop.user_id} (type: ${typeof shop.user_id}), shop_type=${shop.shop_type}, del_status=${shop.del_status || 1}`);
    });
    
    // Test findByUserId
    console.log('\n2️⃣ Testing Shop.findByUserId:');
    const singleShop = await Shop.findByUserId(uid);
    console.log(`   Result: ${singleShop ? `Found shop ID=${singleShop.id}` : 'No shop found'}`);
    if (singleShop) {
      console.log(`   Shop: ID=${singleShop.id}, user_id=${singleShop.user_id} (type: ${typeof singleShop.user_id}), shop_type=${singleShop.shop_type}`);
    }
    
    // Direct DynamoDB scan
    console.log('\n3️⃣ Direct DynamoDB scan (all shops for user_id):');
    const client = getDynamoDBClient();
    let lastKey = null;
    const directShops = [];
    
    do {
      const params = {
        TableName: 'shops',
        FilterExpression: 'user_id = :userId',
        ExpressionAttributeValues: {
          ':userId': uid
        }
      };
      
      if (lastKey) {
        params.ExclusiveStartKey = lastKey;
      }
      
      const command = new ScanCommand(params);
      const response = await client.send(command);
      
      if (response.Items && response.Items.length > 0) {
        directShops.push(...response.Items);
      }
      
      lastKey = response.LastEvaluatedKey;
    } while (lastKey);
    
    console.log(`   Result: ${directShops.length} shop(s) found`);
    directShops.forEach((shop, idx) => {
      console.log(`   Shop ${idx + 1}: ID=${shop.id}, user_id=${shop.user_id} (type: ${typeof shop.user_id}), shop_type=${shop.shop_type}, del_status=${shop.del_status || 1}`);
    });
    
    // Test with string user_id
    console.log('\n4️⃣ Testing with string user_id:');
    const stringUid = String(uid);
    const shopsString = await Shop.findAllByUserId(stringUid);
    console.log(`   Result: ${shopsString.length} shop(s) found with string user_id`);
    
    // Test with number user_id
    console.log('\n5️⃣ Testing with number user_id:');
    const shopsNumber = await Shop.findAllByUserId(uid);
    console.log(`   Result: ${shopsNumber.length} shop(s) found with number user_id`);
    
    console.log('\n✅ Debug complete');
    
  } catch (error) {
    console.error('❌ Error debugging shop query:', error);
    process.exit(1);
  }
}

debugShopQuery();

