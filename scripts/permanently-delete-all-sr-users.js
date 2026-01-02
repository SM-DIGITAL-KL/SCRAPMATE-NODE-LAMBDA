const User = require('../models/User');
const Shop = require('../models/Shop');
const { getDynamoDBClient } = require('../config/dynamodb');
const { ScanCommand } = require('@aws-sdk/client-dynamodb');
const { DeleteCommand } = require('@aws-sdk/lib-dynamodb');
const { unmarshall } = require('@aws-sdk/util-dynamodb');

async function permanentlyDeleteAllSRUsers() {
  try {
    console.log('🔍 Finding all users with user_type "SR"...\n');
    
    // Find all SR users
    const client = getDynamoDBClient();
    const srUsers = [];
    let lastKey = null;
    
    do {
      const params = {
        TableName: 'users',
        FilterExpression: 'user_type = :userType',
        ExpressionAttributeValues: {
          ':userType': { S: 'SR' }
        }
      };
      
      if (lastKey) {
        params.ExclusiveStartKey = lastKey;
      }
      
      const command = new ScanCommand(params);
      const response = await client.send(command);
      
      if (response.Items) {
        const users = response.Items.map(item => unmarshall(item));
        srUsers.push(...users);
      }
      
      lastKey = response.LastEvaluatedKey;
    } while (lastKey);
    
    console.log(`✅ Found ${srUsers.length} SR user(s):\n`);
    srUsers.forEach(u => {
      console.log(`  - User ID: ${u.id} | Phone: ${u.mob_num} | Name: ${u.name || 'N/A'}`);
    });
    
    if (srUsers.length === 0) {
      console.log('\n⚠️  No SR users found. Exiting.');
      return;
    }
    
    console.log('\n🔍 Finding shops for these SR users...\n');
    const allShops = [];
    const userIds = srUsers.map(u => u.id);
    
    for (const userId of userIds) {
      try {
        const shops = await Shop.findAllByUserId(userId);
        allShops.push(...shops.map(s => ({ ...s, user_id: userId })));
      } catch (err) {
        console.error(`  ⚠️  Error finding shops for user ${userId}:`, err.message);
      }
    }
    
    console.log(`✅ Found ${allShops.length} shop(s) to delete:\n`);
    allShops.forEach(s => {
      console.log(`  - Shop ID: ${s.id} | Name: ${s.shopname || 'N/A'} | User ID: ${s.user_id} | Type: ${s.shop_type}`);
    });
    
    console.log(`\n⚠️  WARNING: About to PERMANENTLY DELETE:`);
    console.log(`   - ${allShops.length} shop(s) from ${srUsers.length} SR user(s)`);
    console.log(`   - ${srUsers.length} SR user(s)`);
    console.log(`\n   This action CANNOT be undone!`);
    console.log('   Press Ctrl+C to cancel, or wait 5 seconds to continue...\n');
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    // Permanently delete all shops
    if (allShops.length > 0) {
      console.log(`🗑️  Permanently deleting ${allShops.length} shop(s)...\n`);
      let deletedCount = 0;
      let errorCount = 0;
      
      for (const shop of allShops) {
        try {
          const command = new DeleteCommand({
            TableName: 'shops',
            Key: { id: shop.id }
          });
          
          await client.send(command);
          console.log(`   ✅ Permanently deleted shop ${shop.id} (${shop.shopname || 'N/A'}) - User: ${shop.user_id}`);
          deletedCount++;
        } catch (err) {
          console.error(`   ❌ Error deleting shop ${shop.id}:`, err.message);
          errorCount++;
        }
      }
      
      console.log(`\n   Shop deletion summary:`);
      console.log(`   - Permanently deleted: ${deletedCount}`);
      console.log(`   - Errors: ${errorCount}`);
      console.log(`   - Total: ${allShops.length}`);
    }
    
    // Permanently delete all SR users
    console.log(`\n🗑️  Permanently deleting ${srUsers.length} SR user(s)...\n`);
    let userDeletedCount = 0;
    let userErrorCount = 0;
    
    for (const user of srUsers) {
      try {
        const command = new DeleteCommand({
          TableName: 'users',
          Key: { id: user.id }
        });
        
        await client.send(command);
        console.log(`   ✅ Permanently deleted user ${user.id} (${user.name || 'N/A'}) - Phone: ${user.mob_num}`);
        userDeletedCount++;
      } catch (err) {
        console.error(`   ❌ Error deleting user ${user.id}:`, err.message);
        userErrorCount++;
      }
    }
    
    console.log(`\n   User deletion summary:`);
    console.log(`   - Permanently deleted: ${userDeletedCount}`);
    console.log(`   - Errors: ${userErrorCount}`);
    console.log(`   - Total: ${srUsers.length}`);
    
    console.log(`\n✅ Permanent deletion complete!`);
    console.log(`   ⚠️  All records have been permanently removed from the database.`);
    console.log(`   - Shops deleted: ${allShops.length}`);
    console.log(`   - Users deleted: ${srUsers.length}`);
    
  } catch (error) {
    console.error('❌ Error:', error);
  }
}

permanentlyDeleteAllSRUsers();

