/**
 * Delete all records (users and shops) with a specific phone number
 * Usage: node scripts/delete-by-phone-complete.js <phone_number>
 * 
 * WARNING: This will permanently delete all users and shops with the specified phone number!
 */

require('dotenv').config();
const { getDynamoDBClient } = require('../config/dynamodb');
const { ScanCommand, DeleteCommand } = require('@aws-sdk/lib-dynamodb');

async function deleteByPhone(phoneNumber) {
  try {
    const client = getDynamoDBClient();
    
    // Convert phone number to number (as stored in DynamoDB)
    const phoneValue = typeof phoneNumber === 'string' && !isNaN(phoneNumber) 
      ? parseInt(phoneNumber) 
      : phoneNumber;
    
    console.log(`\n🗑️  Deleting all records with phone number: ${phoneNumber} (${phoneValue})\n`);
    console.log('⚠️  WARNING: This will permanently delete all users and shops with this phone number!');
    console.log('');
    
    let totalDeleted = 0;
    let totalErrors = 0;

    // ========== DELETE USERS ==========
    console.log('📋 Step 1: Finding users with this phone number...\n');
    const allUsers = [];
    let lastKey = null;
    
    do {
      const params = {
        TableName: 'users',
        FilterExpression: 'mob_num = :mobile',
        ExpressionAttributeValues: {
          ':mobile': phoneValue
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
    
    if (allUsers.length > 0) {
      console.log(`✅ Found ${allUsers.length} user(s) to delete:\n`);
      allUsers.forEach((user, index) => {
        console.log(`User ${index + 1}:`);
        console.log(`  ID: ${user.id}`);
        console.log(`  Name: ${user.name || 'N/A'}`);
        console.log(`  App Type: ${user.app_type || 'N/A'}`);
        console.log(`  User Type: ${user.user_type || 'N/A'}`);
        console.log('');
      });
      
      console.log('🗑️  Deleting users...\n');
      for (const user of allUsers) {
        try {
          const deleteCommand = new DeleteCommand({
            TableName: 'users',
            Key: { id: user.id }
          });
          
          await client.send(deleteCommand);
          console.log(`✅ Deleted user ${user.id} (${user.name || 'N/A'}, ${user.app_type || 'N/A'})`);
          totalDeleted++;
        } catch (error) {
          console.error(`❌ Error deleting user ${user.id}:`, error.message);
          totalErrors++;
        }
      }
    } else {
      console.log('ℹ️  No users found with this phone number.\n');
    }

    // ========== DELETE SHOPS ==========
    console.log('\n📋 Step 2: Finding shops with this phone number...\n');
    const allShops = [];
    lastKey = null;
    
    do {
      const params = {
        TableName: 'shops',
        FilterExpression: 'contact = :phone',
        ExpressionAttributeValues: {
          ':phone': phoneValue
        }
      };
      
      if (lastKey) {
        params.ExclusiveStartKey = lastKey;
      }
      
      const command = new ScanCommand(params);
      const response = await client.send(command);
      
      if (response.Items && response.Items.length > 0) {
        allShops.push(...response.Items);
      }
      
      lastKey = response.LastEvaluatedKey;
    } while (lastKey);
    
    if (allShops.length > 0) {
      console.log(`✅ Found ${allShops.length} shop(s) to delete:\n`);
      allShops.forEach((shop, index) => {
        console.log(`Shop ${index + 1}:`);
        console.log(`  ID: ${shop.id}`);
        console.log(`  Name: ${shop.shopname || 'N/A'}`);
        console.log(`  Contact: ${shop.contact || 'N/A'}`);
        console.log(`  User ID: ${shop.user_id || 'N/A'}`);
        console.log('');
      });
      
      console.log('🗑️  Deleting shops...\n');
      for (const shop of allShops) {
        try {
          const deleteCommand = new DeleteCommand({
            TableName: 'shops',
            Key: { id: shop.id }
          });
          
          await client.send(deleteCommand);
          console.log(`✅ Deleted shop ${shop.id} (${shop.shopname || 'N/A'})`);
          totalDeleted++;
        } catch (error) {
          console.error(`❌ Error deleting shop ${shop.id}:`, error.message);
          totalErrors++;
        }
      }
    } else {
      console.log('ℹ️  No shops found with this phone number.\n');
    }

    // ========== SUMMARY ==========
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`📊 Deletion Summary:`);
    console.log(`   Users found: ${allUsers.length}`);
    console.log(`   Shops found: ${allShops.length}`);
    console.log(`   Total records deleted: ${totalDeleted}`);
    console.log(`   Errors: ${totalErrors}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    
  } catch (error) {
    console.error('❌ Error deleting records:', error);
    throw error;
  }
}

// Get phone number from command line argument
const phoneNumber = process.argv[2];

if (!phoneNumber) {
  console.error('❌ Please provide a phone number');
  console.error('Usage: node scripts/delete-by-phone-complete.js <phone_number>');
  console.error('Example: node scripts/delete-by-phone-complete.js 7736068251');
  process.exit(1);
}

// Run the deletion
deleteByPhone(phoneNumber)
  .then(() => {
    console.log('✅ Deletion process completed');
    process.exit(0);
  })
  .catch(error => {
    console.error('❌ Deletion process failed:', error);
    process.exit(1);
  });

