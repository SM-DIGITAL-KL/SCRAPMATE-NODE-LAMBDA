require('dotenv').config();
const { getDynamoDBClient } = require('../config/dynamodb');
const { GetCommand, DeleteCommand, ScanCommand } = require('@aws-sdk/lib-dynamodb');
const Shop = require('../models/Shop');
const redis = require('../config/redis');

/**
 * Script to delete specific users by ID or phone number
 * 
 * Usage: node scripts/delete-specific-users.js [--dry-run] [--confirm] [--ids=id1,id2,...] [--phones=phone1,phone2,...]
 * 
 * Examples:
 *   node scripts/delete-specific-users.js --ids=8056744365,8056744395,9952849504,9497508398 --confirm
 *   node scripts/delete-specific-users.js --phones=8056744365,8056744395,9497508398 --confirm
 *   node scripts/delete-specific-users.js --ids=8056744365 --dry-run
 */

const args = process.argv.slice(2);
const isDryRun = args.includes('--dry-run');
const isConfirmed = args.includes('--confirm');

// Parse IDs
const idsArg = args.find(arg => arg.startsWith('--ids='));
const ids = idsArg ? idsArg.split('=')[1].split(',').map(id => id.trim()).filter(id => id) : [];

// Parse phone numbers
const phonesArg = args.find(arg => arg.startsWith('--phones='));
const phones = phonesArg ? phonesArg.split('=')[1].split(',').map(phone => phone.trim()).filter(phone => phone) : [];

if (ids.length === 0 && phones.length === 0) {
  console.error('\n❌ ERROR: Please provide user IDs or phone numbers!');
  console.error('   Usage: node scripts/delete-specific-users.js --ids=id1,id2,... --confirm');
  console.error('   Or:    node scripts/delete-specific-users.js --phones=phone1,phone2,... --confirm');
  console.error('   Use --dry-run to preview without deleting\n');
  process.exit(1);
}

if (!isDryRun && !isConfirmed) {
  console.error('\n❌ ERROR: This script requires --confirm flag to perform deletion!');
  console.error('   Usage: node scripts/delete-specific-users.js --ids=id1,id2,... --confirm');
  console.error('   Or use --dry-run to see what would be deleted without deleting\n');
  process.exit(1);
}

async function deleteSpecificUsers() {
  try {
    const client = getDynamoDBClient();
    
    console.log('\n' + '='.repeat(80));
    console.log('🗑️  DELETE SPECIFIC USERS');
    console.log('='.repeat(80));
    
    if (isDryRun) {
      console.log('\n⚠️  DRY RUN MODE - No data will be deleted\n');
    } else {
      console.log('\n⚠️  WARNING: This will PERMANENTLY delete the specified users and their shops!');
      console.log('   This action CANNOT be undone!\n');
    }
    
    const usersToDelete = [];
    const shopsToDelete = [];
    let deletedUsers = 0;
    let deletedShops = 0;
    let errors = 0;
    
    // ========== STEP 1: FIND USERS BY ID ==========
    if (ids.length > 0) {
      console.log(`📋 Step 1: Finding users by IDs: ${ids.join(', ')}...\n`);
      
      for (const userId of ids) {
        try {
          const userIdNum = typeof userId === 'string' && !isNaN(userId) ? parseInt(userId) : userId;
          
          const getCommand = new GetCommand({
            TableName: 'users',
            Key: { id: userIdNum }
          });
          
          const response = await client.send(getCommand);
          
          if (response.Item) {
            usersToDelete.push(response.Item);
            console.log(`   ✅ Found user ID ${userId}:`);
            console.log(`      Name: ${response.Item.name || 'N/A'}`);
            console.log(`      Email: ${response.Item.email || 'N/A'}`);
            console.log(`      Phone: ${response.Item.mob_num || 'N/A'}`);
            console.log(`      User Type: ${response.Item.user_type || 'N/A'}`);
            console.log(`      App Version: ${response.Item.app_version || 'N/A'}`);
            console.log('');
          } else {
            console.log(`   ⚠️  User ID ${userId} not found\n`);
          }
        } catch (error) {
          console.error(`   ❌ Error finding user ID ${userId}:`, error.message);
          errors++;
        }
      }
    }
    
    // ========== STEP 2: FIND USERS BY PHONE ==========
    if (phones.length > 0) {
      console.log(`\n📋 Step 2: Finding users by phone numbers: ${phones.join(', ')}...\n`);
      
      for (const phone of phones) {
        try {
          const phoneNum = typeof phone === 'string' && !isNaN(phone) ? parseInt(phone) : phone;
          
          // Scan for users with this phone number
          const scanCommand = new ScanCommand({
            TableName: 'users',
            FilterExpression: 'mob_num = :phone',
            ExpressionAttributeValues: {
              ':phone': phoneNum
            }
          });
          
          const response = await client.send(scanCommand);
          
          if (response.Items && response.Items.length > 0) {
            response.Items.forEach(user => {
              // Check if user is not already in the list
              if (!usersToDelete.find(u => u.id === user.id)) {
                usersToDelete.push(user);
                console.log(`   ✅ Found user with phone ${phone}:`);
                console.log(`      ID: ${user.id}`);
                console.log(`      Name: ${user.name || 'N/A'}`);
                console.log(`      Email: ${user.email || 'N/A'}`);
                console.log(`      User Type: ${user.user_type || 'N/A'}`);
                console.log(`      App Version: ${user.app_version || 'N/A'}`);
                console.log('');
              }
            });
          } else {
            console.log(`   ⚠️  No user found with phone ${phone}\n`);
          }
        } catch (error) {
          console.error(`   ❌ Error finding user with phone ${phone}:`, error.message);
          errors++;
        }
      }
    }
    
    if (usersToDelete.length === 0) {
      console.log('\n❌ No users found to delete.\n');
      return;
    }
    
    // ========== STEP 3: FIND SHOPS FOR THESE USERS ==========
    console.log(`\n📋 Step 3: Finding shops for ${usersToDelete.length} user(s)...\n`);
    
    for (const user of usersToDelete) {
      try {
        const shops = await Shop.findAllByUserId(user.id);
        
        if (shops && shops.length > 0) {
          shops.forEach(shop => {
            shopsToDelete.push(shop);
            console.log(`   🏪 Found shop for user ${user.id}:`);
            console.log(`      Shop ID: ${shop.id}`);
            console.log(`      Shop Name: ${shop.shopname || 'N/A'}`);
            console.log(`      Shop Type: ${shop.shop_type || 'N/A'}`);
            console.log(`      Contact: ${shop.contact || 'N/A'}`);
            console.log('');
          });
        } else {
          console.log(`   ℹ️  No shop found for user ${user.id}\n`);
        }
      } catch (error) {
        console.error(`   ❌ Error finding shops for user ${user.id}:`, error.message);
        errors++;
      }
    }
    
    // ========== SUMMARY BEFORE DELETION ==========
    console.log('\n' + '='.repeat(80));
    console.log('📊 SUMMARY - Records to be deleted:');
    console.log(`   Users: ${usersToDelete.length}`);
    console.log(`   Shops: ${shopsToDelete.length}`);
    console.log('='.repeat(80) + '\n');
    
    if (isDryRun) {
      console.log('✅ DRY RUN COMPLETE - No data was deleted');
      console.log('   Run with --confirm to actually delete these records\n');
      return;
    }
    
    // ========== STEP 4: DELETE SHOPS FIRST ==========
    console.log('\n📋 Step 4: Deleting shops...\n');
    
    for (const shop of shopsToDelete) {
      try {
        const deleteShopCommand = new DeleteCommand({
          TableName: 'shops',
          Key: { id: shop.id }
        });
        
        await client.send(deleteShopCommand);
        console.log(`   ✅ Deleted shop ${shop.id} (${shop.shopname || 'N/A'})`);
        deletedShops++;
      } catch (error) {
        console.error(`   ❌ Error deleting shop ${shop.id}:`, error.message);
        errors++;
      }
    }
    
    // ========== STEP 5: DELETE USERS ==========
    console.log('\n📋 Step 5: Deleting users...\n');
    
    for (const user of usersToDelete) {
      try {
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
        
        console.log(`   ✅ Deleted user ${user.id} (${user.name || 'N/A'}, Phone: ${user.mob_num || 'N/A'})`);
        deletedUsers++;
      } catch (error) {
        console.error(`   ❌ Error deleting user ${user.id}:`, error.message);
        errors++;
      }
    }
    
    // ========== FINAL SUMMARY ==========
    console.log('\n' + '='.repeat(80));
    console.log('📊 FINAL SUMMARY:');
    console.log(`   Users Deleted: ${deletedUsers} / ${usersToDelete.length}`);
    console.log(`   Shops Deleted: ${deletedShops} / ${shopsToDelete.length}`);
    console.log(`   Errors: ${errors}`);
    console.log('='.repeat(80) + '\n');
    
    if (errors === 0) {
      console.log('✅ All specified users and shops deleted successfully!\n');
    } else {
      console.log(`⚠️  Deletion completed with ${errors} error(s)\n`);
    }
    
    return {
      totalUsers: usersToDelete.length,
      totalShops: shopsToDelete.length,
      deletedUsers,
      deletedShops,
      errors
    };
  } catch (error) {
    console.error('\n❌ Error deleting users:', error);
    throw error;
  }
}

// Run the script
deleteSpecificUsers()
  .then(result => {
    console.log('✅ Script completed');
    process.exit(0);
  })
  .catch(error => {
    console.error('❌ Script failed:', error);
    process.exit(1);
  });

