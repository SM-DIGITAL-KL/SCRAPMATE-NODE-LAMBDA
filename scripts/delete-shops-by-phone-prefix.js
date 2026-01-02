const User = require('../models/User');
const Shop = require('../models/Shop');
const { getDynamoDBClient } = require('../config/dynamodb');
const { ScanCommand } = require('@aws-sdk/client-dynamodb');
const { unmarshall } = require('@aws-sdk/util-dynamodb');

async function deleteShopsByPhonePrefix() {
  try {
    const phonePrefix = '907413512';
    console.log(`🔍 Finding users with phone numbers starting with ${phonePrefix}...\n`);
    
    // Scan all users and filter by phone prefix
    const client = getDynamoDBClient();
    const allUsers = [];
    let lastKey = null;
    
    do {
      const params = {
        TableName: 'users'
      };
      
      if (lastKey) {
        params.ExclusiveStartKey = lastKey;
      }
      
      const command = new ScanCommand(params);
      const response = await client.send(command);
      
      if (response.Items) {
        const users = response.Items.map(item => unmarshall(item));
        // Filter users whose phone number starts with the prefix
        const filteredUsers = users.filter(user => {
          const phone = String(user.mob_num || '');
          return phone.startsWith(phonePrefix);
        });
        allUsers.push(...filteredUsers);
      }
      
      lastKey = response.LastEvaluatedKey;
    } while (lastKey);
    
    console.log(`✅ Found ${allUsers.length} user(s) with phone numbers starting with ${phonePrefix}:\n`);
    allUsers.forEach(u => {
      console.log(`  - User ID: ${u.id} | Phone: ${u.mob_num} | Name: ${u.name || 'N/A'}`);
    });
    
    if (allUsers.length === 0) {
      console.log('\n⚠️  No users found. Exiting.');
      return;
    }
    
    console.log('\n🔍 Finding shops for these users...\n');
    const allShops = [];
    const userIds = allUsers.map(u => u.id);
    
    for (const userId of userIds) {
      try {
        const shops = await Shop.findAllByUserId(userId);
        allShops.push(...shops);
      } catch (err) {
        console.error(`  ⚠️  Error finding shops for user ${userId}:`, err.message);
      }
    }
    
    console.log(`✅ Found ${allShops.length} shop(s) to delete:\n`);
    allShops.forEach(s => {
      console.log(`  - Shop ID: ${s.id} | Name: ${s.shopname || 'N/A'} | User ID: ${s.user_id} | Type: ${s.shop_type}`);
    });
    
    if (allShops.length === 0) {
      console.log('\n⚠️  No shops found to delete. Exiting.');
      return;
    }
    
    console.log(`\n⚠️  WARNING: About to delete ${allShops.length} shop(s)!`);
    console.log('Press Ctrl+C to cancel, or wait 3 seconds to continue...\n');
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    console.log('🗑️  Deleting shops...\n');
    let deletedCount = 0;
    let errorCount = 0;
    
    for (const shop of allShops) {
      try {
        // Set del_status to 2 (deleted) instead of actually deleting
        await Shop.update(shop.id, { del_status: 2 });
        console.log(`  ✅ Deleted shop ${shop.id} (${shop.shopname || 'N/A'})`);
        deletedCount++;
      } catch (err) {
        console.error(`  ❌ Error deleting shop ${shop.id}:`, err.message);
        errorCount++;
      }
    }
    
    console.log(`\n✅ Deletion complete!`);
    console.log(`   - Deleted: ${deletedCount}`);
    console.log(`   - Errors: ${errorCount}`);
    console.log(`   - Total: ${allShops.length}`);
    
  } catch (error) {
    console.error('❌ Error:', error);
  }
}

deleteShopsByPhonePrefix();

