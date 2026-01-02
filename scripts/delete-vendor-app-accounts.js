require('dotenv').config();
const { getDynamoDBClient } = require('../config/dynamodb');
const { ScanCommand, DeleteCommand } = require('@aws-sdk/lib-dynamodb');

const User = require('../models/User');
const Shop = require('../models/Shop');

async function deleteVendorAppAccounts(phoneNumber) {
  try {
    const client = getDynamoDBClient();
    
    // Convert phone number to number (as stored in DynamoDB)
    const phoneValue = typeof phoneNumber === 'string' && !isNaN(phoneNumber) 
      ? parseInt(phoneNumber) 
      : phoneNumber;
    
    console.log(`\n🗑️  Deleting vendor_app accounts for phone number: ${phoneNumber} (${phoneValue})\n`);
    console.log('⚠️  WARNING: This will permanently delete vendor_app users and their associated shops!');
    console.log('');
    
    let totalDeletedUsers = 0;
    let totalDeletedShops = 0;
    let totalErrors = 0;

    // ========== FIND VENDOR APP USERS ==========
    console.log('📋 Step 1: Finding vendor_app users with this phone number...\n');
    const vendorAppUsers = [];
    let lastKey = null;
    
    do {
      const params = {
        TableName: 'users',
        FilterExpression: 'mob_num = :mobile AND app_type = :appType',
        ExpressionAttributeValues: {
          ':mobile': phoneValue,
          ':appType': 'vendor_app'
        }
      };
      
      if (lastKey) {
        params.ExclusiveStartKey = lastKey;
      }
      
      const command = new ScanCommand(params);
      const response = await client.send(command);
      
      if (response.Items && response.Items.length > 0) {
        vendorAppUsers.push(...response.Items);
      }
      
      lastKey = response.LastEvaluatedKey;
    } while (lastKey);
    
    if (vendorAppUsers.length === 0) {
      console.log('ℹ️  No vendor_app users found with this phone number.\n');
      return { deletedUsers: 0, deletedShops: 0, errors: 0 };
    }
    
    console.log(`✅ Found ${vendorAppUsers.length} vendor_app user(s):\n`);
    vendorAppUsers.forEach((user, index) => {
      console.log(`User ${index + 1}:`);
      console.log(`  ID: ${user.id}`);
      console.log(`  Name: ${user.name || 'N/A'}`);
      console.log(`  App Type: ${user.app_type || 'N/A'}`);
      console.log(`  User Type: ${user.user_type || 'N/A'}`);
      console.log('');
    });

    // ========== DELETE SHOPS FOR EACH USER ==========
    console.log('\n📋 Step 2: Finding and deleting shops for these users...\n');
    
    for (const user of vendorAppUsers) {
      try {
        // Find shop by user_id
        const shop = await Shop.findByUserId(user.id);
        
        if (shop) {
          console.log(`   🏪 Found shop for user ${user.id}:`);
          console.log(`      Shop ID: ${shop.id}`);
          console.log(`      Shop Name: ${shop.shopname || 'N/A'}`);
          console.log(`      Contact: ${shop.contact || 'N/A'}`);
          
          // Delete the shop
          const deleteShopCommand = new DeleteCommand({
            TableName: 'shops',
            Key: { id: shop.id }
          });
          
          await client.send(deleteShopCommand);
          console.log(`      ✅ Deleted shop ${shop.id}\n`);
          totalDeletedShops++;
        } else {
          console.log(`   ℹ️  No shop found for user ${user.id}\n`);
        }
      } catch (error) {
        console.error(`   ❌ Error processing shop for user ${user.id}:`, error.message);
        totalErrors++;
      }
    }

    // ========== DELETE USERS ==========
    console.log('\n📋 Step 3: Deleting vendor_app users...\n');
    
    for (const user of vendorAppUsers) {
      try {
        const deleteUserCommand = new DeleteCommand({
          TableName: 'users',
          Key: { id: user.id }
        });
        
        await client.send(deleteUserCommand);
        console.log(`✅ Deleted user ${user.id} (${user.name || 'N/A'}, ${user.app_type || 'N/A'})`);
        totalDeletedUsers++;
      } catch (error) {
        console.error(`❌ Error deleting user ${user.id}:`, error.message);
        totalErrors++;
      }
    }

    // ========== SUMMARY ==========
    console.log('\n' + '='.repeat(60));
    console.log('📊 Summary:');
    console.log(`   Users Deleted: ${totalDeletedUsers}`);
    console.log(`   Shops Deleted: ${totalDeletedShops}`);
    console.log(`   Errors: ${totalErrors}`);
    console.log('='.repeat(60) + '\n');

    return { 
      deletedUsers: totalDeletedUsers, 
      deletedShops: totalDeletedShops, 
      errors: totalErrors 
    };
  } catch (error) {
    console.error('❌ Error deleting vendor_app accounts:', error);
    throw error;
  }
}

// Run the script
const phoneNumber = process.argv[2] || '9074135121';

deleteVendorAppAccounts(phoneNumber)
  .then(result => {
    console.log('✅ Script completed successfully');
    process.exit(0);
  })
  .catch(error => {
    console.error('❌ Script failed:', error);
    process.exit(1);
  });

