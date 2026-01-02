/**
 * Script to check all shops (including deleted) for a user ID
 * Usage: node scripts/check-shops-by-user-id.js <user_id>
 */

const { getDynamoDBClient } = require('../config/dynamodb');
const { ScanCommand } = require('@aws-sdk/lib-dynamodb');

const userId = parseInt(process.argv[2]);

if (!userId) {
  console.error('❌ Please provide a user ID');
  process.exit(1);
}

async function checkShops() {
  try {
    const client = getDynamoDBClient();
    
    let lastKey = null;
    const allShops = [];
    
    do {
      const params = {
        TableName: 'shops',
        FilterExpression: 'user_id = :userId',
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
        allShops.push(...response.Items);
      }
      
      lastKey = response.LastEvaluatedKey;
    } while (lastKey);
    
    console.log(`\n✅ Found ${allShops.length} shop(s) for user ${userId}:\n`);
    
    allShops.forEach((shop, index) => {
      console.log(`Shop ${index + 1}:`);
      console.log(`  ID: ${shop.id}`);
      console.log(`  Shop Type: ${shop.shop_type} (${shop.shop_type === 1 ? 'Industrial/B2B' : shop.shop_type === 3 ? 'Retailer/B2C' : shop.shop_type === 4 ? 'Wholesaler/B2B' : 'Unknown'})`);
      console.log(`  Shop Name: ${shop.shopname || '(empty)'}`);
      console.log(`  Company Name: ${shop.company_name || '(empty)'}`);
      console.log(`  Del Status: ${shop.del_status || 1}`);
      console.log(`  User ID: ${shop.user_id}`);
      console.log('');
    });
    
    if (allShops.length === 0) {
      console.log('❌ No shops found for this user (including deleted shops)');
    }
    
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

checkShops();
