require('dotenv').config();
const { getDynamoDBClient } = require('../config/dynamodb');
const { ScanCommand, DeleteCommand, BatchWriteCommand } = require('@aws-sdk/lib-dynamodb');
const redis = require('../config/redis');

/**
 * Script to permanently delete all v2 B2B, B2C, and SR vendors and their shops
 * 
 * This script will:
 * 1. Find all v2 users with user_type 'S' (B2B), 'R' (B2C), or 'SR' (both)
 * 2. Find all shops associated with these users
 * 3. Delete shops first (to avoid foreign key issues)
 * 4. Delete users
 * 5. Clear Redis cache for deleted users
 * 
 * WARNING: This is a PERMANENT deletion and cannot be undone!
 * 
 * Usage: node scripts/delete-all-v2-vendors-shops.js [--dry-run] [--confirm]
 *   --dry-run: Show what would be deleted without actually deleting
 *   --confirm: Required flag to actually perform deletion
 */

const args = process.argv.slice(2);
const isDryRun = args.includes('--dry-run');
const isConfirmed = args.includes('--confirm');

if (!isDryRun && !isConfirmed) {
  console.error('\n❌ ERROR: This script requires --confirm flag to perform deletion!');
  console.error('   Usage: node scripts/delete-all-v2-vendors-shops.js --confirm');
  console.error('   Or use --dry-run to see what would be deleted without deleting\n');
  process.exit(1);
}

async function deleteAllV2VendorsAndShops() {
  try {
    const client = getDynamoDBClient();
    
    console.log('\n' + '='.repeat(80));
    console.log('🗑️  DELETE ALL V2 B2B, B2C, AND SR VENDORS AND SHOPS');
    console.log('='.repeat(80));
    
    if (isDryRun) {
      console.log('\n⚠️  DRY RUN MODE - No data will be deleted\n');
    } else {
      console.log('\n⚠️  WARNING: This will PERMANENTLY delete all v2 vendors and shops!');
      console.log('   This action CANNOT be undone!\n');
    }
    
    let totalV2Users = 0;
    let totalV2Shops = 0;
    let deletedUsers = 0;
    let deletedShops = 0;
    let errors = 0;
    const v2Users = [];
    const v2Shops = [];
    const userIdsToDelete = new Set();
    
    // ========== STEP 1: FIND ALL V2 VENDOR USERS ==========
    console.log('📋 Step 1: Finding all v2 vendor users (B2B, B2C, SR)...\n');
    
    let userLastKey = null;
    do {
      const userParams = {
        TableName: 'users',
        FilterExpression: 'app_version = :v2 AND (user_type = :typeS OR user_type = :typeR OR user_type = :typeSR)',
        ExpressionAttributeValues: {
          ':v2': 'v2',
          ':typeS': 'S',
          ':typeR': 'R',
          ':typeSR': 'SR'
        }
      };
      
      if (userLastKey) {
        userParams.ExclusiveStartKey = userLastKey;
      }
      
      const userCommand = new ScanCommand(userParams);
      const userResponse = await client.send(userCommand);
      
      if (userResponse.Items && userResponse.Items.length > 0) {
        v2Users.push(...userResponse.Items);
        userResponse.Items.forEach(user => {
          userIdsToDelete.add(user.id);
        });
      }
      
      userLastKey = userResponse.LastEvaluatedKey;
    } while (userLastKey);
    
    totalV2Users = v2Users.length;
    console.log(`✅ Found ${totalV2Users} v2 vendor user(s):\n`);
    
    if (totalV2Users > 0) {
      v2Users.forEach((user, index) => {
        console.log(`   User ${index + 1}:`);
        console.log(`      ID: ${user.id}`);
        console.log(`      Name: ${user.name || 'N/A'}`);
        console.log(`      Email: ${user.email || 'N/A'}`);
        console.log(`      Phone: ${user.mob_num || 'N/A'}`);
        console.log(`      User Type: ${user.user_type || 'N/A'}`);
        console.log(`      App Type: ${user.app_type || 'N/A'}`);
        console.log(`      App Version: ${user.app_version || 'N/A'}`);
        console.log('');
      });
    } else {
      console.log('   ℹ️  No v2 vendor users found.\n');
    }
    
    // ========== STEP 2: FIND ALL SHOPS FOR V2 USERS ==========
    console.log('\n📋 Step 2: Finding all shops for v2 vendor users...\n');
    
    let shopLastKey = null;
    do {
      const shopParams = {
        TableName: 'shops'
      };
      
      if (shopLastKey) {
        shopParams.ExclusiveStartKey = shopLastKey;
      }
      
      const shopCommand = new ScanCommand(shopParams);
      const shopResponse = await client.send(shopCommand);
      
      if (shopResponse.Items && shopResponse.Items.length > 0) {
        shopResponse.Items.forEach(shop => {
          // Check if shop belongs to a v2 vendor user
          const shopUserId = shop.user_id;
          if (shopUserId && userIdsToDelete.has(shopUserId)) {
            v2Shops.push(shop);
          }
        });
      }
      
      shopLastKey = shopResponse.LastEvaluatedKey;
    } while (shopLastKey);
    
    totalV2Shops = v2Shops.length;
    console.log(`✅ Found ${totalV2Shops} shop(s) for v2 vendor users:\n`);
    
    if (totalV2Shops > 0) {
      v2Shops.forEach((shop, index) => {
        console.log(`   Shop ${index + 1}:`);
        console.log(`      Shop ID: ${shop.id}`);
        console.log(`      User ID: ${shop.user_id || 'N/A'}`);
        console.log(`      Shop Name: ${shop.shopname || 'N/A'}`);
        console.log(`      Shop Type: ${shop.shop_type || 'N/A'}`);
        console.log(`      Contact: ${shop.contact || 'N/A'}`);
        console.log('');
      });
    } else {
      console.log('   ℹ️  No shops found for v2 vendor users.\n');
    }
    
    // ========== SUMMARY BEFORE DELETION ==========
    console.log('\n' + '='.repeat(80));
    console.log('📊 SUMMARY - Records to be deleted:');
    console.log(`   V2 Vendor Users: ${totalV2Users}`);
    console.log(`   V2 Shops: ${totalV2Shops}`);
    console.log('='.repeat(80) + '\n');
    
    if (isDryRun) {
      console.log('✅ DRY RUN COMPLETE - No data was deleted');
      console.log('   Run with --confirm to actually delete these records\n');
      return;
    }
    
    // ========== STEP 3: DELETE SHOPS FIRST ==========
    console.log('\n📋 Step 3: Deleting shops...\n');
    
    for (const shop of v2Shops) {
      try {
        if (!isDryRun) {
          const deleteShopCommand = new DeleteCommand({
            TableName: 'shops',
            Key: { id: shop.id }
          });
          
          await client.send(deleteShopCommand);
        }
        
        console.log(`   ✅ Deleted shop ${shop.id} (${shop.shopname || 'N/A'})`);
        deletedShops++;
      } catch (error) {
        console.error(`   ❌ Error deleting shop ${shop.id}:`, error.message);
        errors++;
      }
    }
    
    // ========== STEP 4: DELETE USERS ==========
    console.log('\n📋 Step 4: Deleting v2 vendor users...\n');
    
    for (const user of v2Users) {
      try {
        if (!isDryRun) {
          const deleteUserCommand = new DeleteCommand({
            TableName: 'users',
            Key: { id: user.id }
          });
          
          await client.send(deleteUserCommand);
          
          // Clear Redis cache for this user
          try {
            await redis.del(`user:${user.id}`);
            await redis.del(`profile:${user.id}`);
          } catch (redisErr) {
            console.log(`   ⚠️  Redis cache clear warning for user ${user.id}:`, redisErr.message);
          }
        }
        
        console.log(`   ✅ Deleted user ${user.id} (${user.name || 'N/A'}, ${user.user_type || 'N/A'})`);
        deletedUsers++;
      } catch (error) {
        console.error(`   ❌ Error deleting user ${user.id}:`, error.message);
        errors++;
      }
    }
    
    // ========== FINAL SUMMARY ==========
    console.log('\n' + '='.repeat(80));
    console.log('📊 FINAL SUMMARY:');
    console.log(`   Users Deleted: ${deletedUsers} / ${totalV2Users}`);
    console.log(`   Shops Deleted: ${deletedShops} / ${totalV2Shops}`);
    console.log(`   Errors: ${errors}`);
    console.log('='.repeat(80) + '\n');
    
    if (errors === 0) {
      console.log('✅ All v2 vendors and shops deleted successfully!\n');
    } else {
      console.log(`⚠️  Deletion completed with ${errors} error(s)\n`);
    }
    
    return {
      totalUsers: totalV2Users,
      totalShops: totalV2Shops,
      deletedUsers,
      deletedShops,
      errors
    };
  } catch (error) {
    console.error('\n❌ Error deleting v2 vendors and shops:', error);
    throw error;
  }
}

// Run the script
deleteAllV2VendorsAndShops()
  .then(result => {
    console.log('✅ Script completed');
    process.exit(0);
  })
  .catch(error => {
    console.error('❌ Script failed:', error);
    process.exit(1);
  });

