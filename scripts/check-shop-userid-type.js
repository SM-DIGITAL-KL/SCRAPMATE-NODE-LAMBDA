/**
 * Script to check shop user_id type
 * Usage: node scripts/check-shop-userid-type.js <shop_id>
 */

const Shop = require('../models/Shop');
const { getDynamoDBClient } = require('../config/dynamodb');
const { GetCommand, ScanCommand } = require('@aws-sdk/lib-dynamodb');

const shopId = process.argv[2];

if (!shopId) {
  console.error('❌ Please provide a shop ID');
  console.log('Usage: node scripts/check-shop-userid-type.js <shop_id>');
  process.exit(1);
}

async function checkShopUserIdType() {
  try {
    const sid = parseInt(shopId);
    console.log(`🔍 Checking shop ${sid} user_id type\n`);
    
    // Get shop by ID
    const shop = await Shop.findById(sid);
    
    if (shop) {
      console.log('✅ Shop Found:');
      console.log(`   Shop ID: ${shop.id} (type: ${typeof shop.id})`);
      console.log(`   User ID: ${shop.user_id} (type: ${typeof shop.user_id})`);
      console.log(`   Shop Type: ${shop.shop_type}`);
      console.log(`   Del Status: ${shop.del_status || 1}`);
      
      // Try querying with different user_id types
      const userId = shop.user_id;
      console.log(`\n🔍 Testing queries with user_id: ${userId}`);
      
      // Test as number
      if (typeof userId === 'number') {
        console.log(`\n1️⃣ Querying with number: ${userId}`);
        const shopsNum = await Shop.findAllByUserId(userId);
        console.log(`   Found: ${shopsNum.length} shop(s)`);
      }
      
      // Test as string
      if (typeof userId === 'string') {
        console.log(`\n2️⃣ Querying with string: "${userId}"`);
        const shopsStr = await Shop.findAllByUserId(userId);
        console.log(`   Found: ${shopsStr.length} shop(s)`);
      }
      
      // Test with parsed number if it's a string
      if (typeof userId === 'string' && !isNaN(userId)) {
        const parsedUserId = parseInt(userId);
        console.log(`\n3️⃣ Querying with parsed number: ${parsedUserId}`);
        const shopsParsed = await Shop.findAllByUserId(parsedUserId);
        console.log(`   Found: ${shopsParsed.length} shop(s)`);
      }
      
      // Direct DynamoDB query to see raw data
      console.log(`\n4️⃣ Direct DynamoDB GetCommand (raw data):`);
      const client = getDynamoDBClient();
      const command = new GetCommand({
        TableName: 'shops',
        Key: { id: sid }
      });
      const response = await client.send(command);
      if (response.Item) {
        console.log(`   Raw user_id: ${response.Item.user_id} (type: ${typeof response.Item.user_id})`);
        console.log(`   Raw user_id value: ${JSON.stringify(response.Item.user_id)}`);
      }
      
    } else {
      console.log(`❌ Shop with ID ${sid} not found`);
    }
    
    console.log('\n✅ Check complete');
    
  } catch (error) {
    console.error('❌ Error checking shop:', error);
    process.exit(1);
  }
}

checkShopUserIdType();

