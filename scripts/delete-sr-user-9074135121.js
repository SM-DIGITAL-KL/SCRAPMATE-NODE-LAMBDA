const User = require('../models/User');
const Shop = require('../models/Shop');

async function deleteSRUser() {
  try {
    const userId = 1766673683469; // SR user ID for phone 9074135121
    
    console.log(`🔍 Finding SR user ID: ${userId}...\n`);
    
    // Get user details
    const user = await User.findById(userId);
    
    if (!user) {
      console.log(`❌ User ${userId} not found.`);
      return;
    }
    
    console.log(`✅ Found user:`);
    console.log(`   User ID: ${user.id}`);
    console.log(`   Name: ${user.name || 'N/A'}`);
    console.log(`   Phone: ${user.mob_num}`);
    console.log(`   User Type: ${user.user_type}`);
    console.log(`   Email: ${user.email || 'N/A'}\n`);
    
    // Find all shops for this user
    console.log(`🔍 Finding shops for user ${userId}...\n`);
    const shops = await Shop.findAllByUserId(userId);
    
    console.log(`✅ Found ${shops.length} shop(s):\n`);
    shops.forEach(s => {
      console.log(`   - Shop ID: ${s.id} | Name: ${s.shopname || 'N/A'} | Type: ${s.shop_type} | Del Status: ${s.del_status || 1}`);
    });
    
    // Delete all shops (set del_status = 2)
    if (shops.length > 0) {
      console.log(`\n🗑️  Deleting ${shops.length} shop(s)...\n`);
      let deletedCount = 0;
      let alreadyDeletedCount = 0;
      
      for (const shop of shops) {
        try {
          if (shop.del_status === 2) {
            console.log(`   ⚠️  Shop ${shop.id} already deleted (del_status = 2)`);
            alreadyDeletedCount++;
          } else {
            await Shop.update(shop.id, { del_status: 2 });
            console.log(`   ✅ Deleted shop ${shop.id} (${shop.shopname || 'N/A'})`);
            deletedCount++;
          }
        } catch (err) {
          console.error(`   ❌ Error deleting shop ${shop.id}:`, err.message);
        }
      }
      
      console.log(`\n   Shop deletion summary:`);
      console.log(`   - Deleted: ${deletedCount}`);
      console.log(`   - Already deleted: ${alreadyDeletedCount}`);
      console.log(`   - Total: ${shops.length}`);
    }
    
    // Delete the user (set del_status = 2)
    console.log(`\n🗑️  Deleting user ${userId}...\n`);
    try {
      const { getDynamoDBClient } = require('../config/dynamodb');
      const { UpdateCommand } = require('@aws-sdk/lib-dynamodb');
      const client = getDynamoDBClient();
      
      const command = new UpdateCommand({
        TableName: 'users',
        Key: { id: userId },
        UpdateExpression: 'SET del_status = :status, updated_at = :updated',
        ExpressionAttributeValues: {
          ':status': 2,
          ':updated': new Date().toISOString()
        }
      });
      
      await client.send(command);
      console.log(`   ✅ Deleted user ${userId} (${user.name || 'N/A'})`);
    } catch (err) {
      console.error(`   ❌ Error deleting user ${userId}:`, err.message);
    }
    
    console.log(`\n✅ Deletion complete!`);
    
  } catch (error) {
    console.error('❌ Error:', error);
  }
}

deleteSRUser();

