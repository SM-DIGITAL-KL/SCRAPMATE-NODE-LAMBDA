const User = require('../models/User');
const Shop = require('../models/Shop');
const { getDynamoDBClient } = require('../config/dynamodb');
const { DeleteCommand } = require('@aws-sdk/lib-dynamodb');

async function permanentlyDeleteSRUser() {
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
      console.log(`   - Shop ID: ${s.id} | Name: ${s.shopname || 'N/A'} | Type: ${s.shop_type}`);
    });
    
    // Permanently delete all shops
    if (shops.length > 0) {
      console.log(`\n⚠️  WARNING: About to PERMANENTLY DELETE ${shops.length} shop(s) from database!`);
      console.log('Press Ctrl+C to cancel, or wait 3 seconds to continue...\n');
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      console.log(`🗑️  Permanently deleting ${shops.length} shop(s)...\n`);
      const client = getDynamoDBClient();
      let deletedCount = 0;
      let errorCount = 0;
      
      for (const shop of shops) {
        try {
          const command = new DeleteCommand({
            TableName: 'shops',
            Key: { id: shop.id }
          });
          
          await client.send(command);
          console.log(`   ✅ Permanently deleted shop ${shop.id} (${shop.shopname || 'N/A'})`);
          deletedCount++;
        } catch (err) {
          console.error(`   ❌ Error deleting shop ${shop.id}:`, err.message);
          errorCount++;
        }
      }
      
      console.log(`\n   Shop deletion summary:`);
      console.log(`   - Permanently deleted: ${deletedCount}`);
      console.log(`   - Errors: ${errorCount}`);
      console.log(`   - Total: ${shops.length}`);
    }
    
    // Permanently delete the user
    console.log(`\n⚠️  WARNING: About to PERMANENTLY DELETE user ${userId} from database!`);
    console.log('Press Ctrl+C to cancel, or wait 3 seconds to continue...\n');
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    console.log(`🗑️  Permanently deleting user ${userId}...\n`);
    try {
      const client = getDynamoDBClient();
      const command = new DeleteCommand({
        TableName: 'users',
        Key: { id: userId }
      });
      
      await client.send(command);
      console.log(`   ✅ Permanently deleted user ${userId} (${user.name || 'N/A'})`);
    } catch (err) {
      console.error(`   ❌ Error deleting user ${userId}:`, err.message);
    }
    
    console.log(`\n✅ Permanent deletion complete!`);
    console.log(`   ⚠️  Records have been permanently removed from the database.`);
    
  } catch (error) {
    console.error('❌ Error:', error);
  }
}

permanentlyDeleteSRUser();

