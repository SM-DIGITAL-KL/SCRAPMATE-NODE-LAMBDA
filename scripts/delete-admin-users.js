#!/usr/bin/env node

/**
 * Script to delete specific admin users from mono.scrapmate.co.in
 * Users to delete:
 * 1. Sujithra - sujithra@user.in - 7994177754
 * 2. test22 - test@admin.in - 11112221
 * 
 * Usage: node scripts/delete-admin-users.js [--dry-run] [--confirm]
 */

require('dotenv').config();
const { getDynamoDBClient } = require('../config/dynamodb');
const { ScanCommand, DeleteCommand } = require('@aws-sdk/lib-dynamodb');
const Shop = require('../models/Shop');
const UserAdmin = require('../models/UserAdmin');
const RedisCache = require('../utils/redisCache');

const client = getDynamoDBClient();

// Users to delete
const USERS_TO_DELETE = [
  {
    name: 'Sujithra',
    email: 'sujithra@user.in',
    phone: '7994177754'
  },
  {
    name: 'test22',
    email: 'test@admin.in',
    phone: '11112221'
  }
];

const args = process.argv.slice(2);
const isDryRun = args.includes('--dry-run');
const isConfirmed = args.includes('--confirm');

async function deleteAdminUsers() {
  try {
    console.log('\n' + '='.repeat(80));
    console.log('🗑️  DELETE ADMIN USERS');
    console.log('='.repeat(80));
    
    if (isDryRun) {
      console.log('\n⚠️  DRY RUN MODE - No data will be deleted\n');
    } else if (!isConfirmed) {
      console.error('\n❌ ERROR: This script requires --confirm flag to perform deletion!');
      console.error('   Usage: node scripts/delete-admin-users.js --confirm');
      console.error('   Or use --dry-run to see what would be deleted without deleting\n');
      process.exit(1);
    } else {
      console.log('\n⚠️  WARNING: This will PERMANENTLY delete the specified users and their shops!');
      console.log('   This action CANNOT be undone!\n');
    }
    
    const usersToDelete = [];
    const userAdminsToDelete = [];
    const shopsToDelete = [];
    let deletedUsers = 0;
    let deletedUserAdmins = 0;
    let deletedShops = 0;
    let errors = 0;
    
    // Find users in user_admins table first (admin panel users)
    console.log('📋 Finding admin users in user_admins table...\n');
    
    for (const targetUser of USERS_TO_DELETE) {
      console.log(`🔍 Searching for: ${targetUser.name} (${targetUser.email}, ${targetUser.phone})...`);
      
      let foundUserAdmins = [];
      
      // Search in user_admins table by email
      if (targetUser.email) {
        try {
          const emailCommand = new ScanCommand({
            TableName: 'user_admins',
            FilterExpression: 'email = :email',
            ExpressionAttributeValues: {
              ':email': targetUser.email
            }
          });
          
          const emailResponse = await client.send(emailCommand);
          if (emailResponse.Items && emailResponse.Items.length > 0) {
            foundUserAdmins.push(...emailResponse.Items);
            console.log(`   ✅ Found ${emailResponse.Items.length} admin user(s) by email in user_admins`);
          }
        } catch (error) {
          console.log(`   ⚠️  Error searching user_admins by email: ${error.message}`);
        }
      }
      
      // Search in user_admins table by phone
      if (targetUser.phone) {
        try {
          const phoneNum = typeof targetUser.phone === 'string' && !isNaN(targetUser.phone) 
            ? parseInt(targetUser.phone) 
            : targetUser.phone;
          
          const phoneCommand = new ScanCommand({
            TableName: 'user_admins',
            FilterExpression: 'phone = :phone',
            ExpressionAttributeValues: {
              ':phone': phoneNum
            }
          });
          
          const phoneResponse = await client.send(phoneCommand);
          if (phoneResponse.Items && phoneResponse.Items.length > 0) {
            phoneResponse.Items.forEach(admin => {
              // Avoid duplicates
              if (!foundUserAdmins.find(a => a.id === admin.id)) {
                foundUserAdmins.push(admin);
              }
            });
            console.log(`   ✅ Found ${phoneResponse.Items.length} admin user(s) by phone in user_admins`);
          }
        } catch (error) {
          console.log(`   ⚠️  Error searching user_admins by phone: ${error.message}`);
        }
      }
      
      // Search in user_admins table by name
      if (foundUserAdmins.length === 0 && targetUser.name) {
        try {
          const nameCommand = new ScanCommand({
            TableName: 'user_admins',
            FilterExpression: 'contains(#name, :name)',
            ExpressionAttributeNames: {
              '#name': 'name'
            },
            ExpressionAttributeValues: {
              ':name': targetUser.name
            }
          });
          
          const nameResponse = await client.send(nameCommand);
          if (nameResponse.Items && nameResponse.Items.length > 0) {
            // Filter to exact match
            const exactMatches = nameResponse.Items.filter(a => 
              a.name && a.name.toLowerCase().trim() === targetUser.name.toLowerCase().trim()
            );
            if (exactMatches.length > 0) {
              foundUserAdmins.push(...exactMatches);
              console.log(`   ✅ Found ${exactMatches.length} admin user(s) by name in user_admins`);
            }
          }
        } catch (error) {
          console.log(`   ⚠️  Error searching user_admins by name: ${error.message}`);
        }
      }
      
      // For each found user_admin, find the corresponding user in users table
      for (const userAdmin of foundUserAdmins) {
        if (!userAdminsToDelete.find(a => a.id === userAdmin.id)) {
          userAdminsToDelete.push(userAdmin);
          console.log(`   📋 Admin user to delete:`);
          console.log(`      Admin ID: ${userAdmin.id}`);
          console.log(`      Name: ${userAdmin.name || 'N/A'}`);
          console.log(`      Email: ${userAdmin.email || 'N/A'}`);
          console.log(`      Phone: ${userAdmin.phone || 'N/A'}`);
          console.log(`      User ID: ${userAdmin.user_id || 'N/A'}`);
          console.log('');
          
          // Find the corresponding user in users table
          if (userAdmin.user_id) {
            try {
              const { GetCommand } = require('@aws-sdk/lib-dynamodb');
              const getUserCommand = new GetCommand({
                TableName: 'users',
                Key: { id: Number(userAdmin.user_id) }
              });
              
              const userResponse = await client.send(getUserCommand);
              if (userResponse.Item) {
                const user = userResponse.Item;
                if (!usersToDelete.find(u => u.id === user.id)) {
                  usersToDelete.push(user);
                  console.log(`   📋 Corresponding user found in users table:`);
                  console.log(`      User ID: ${user.id}`);
                  console.log(`      Name: ${user.name || 'N/A'}`);
                  console.log(`      Email: ${user.email || 'N/A'}`);
                  console.log(`      Phone: ${user.mob_num || 'N/A'}`);
                  console.log('');
                }
              }
            } catch (error) {
              console.log(`   ⚠️  Error finding user ${userAdmin.user_id} in users table: ${error.message}`);
            }
          }
        }
      }
      
      // Also search directly in users table (in case user exists but not in user_admins)
      if (foundUserAdmins.length === 0) {
        console.log(`   🔍 Also searching in users table...`);
        let foundUsers = [];
        
        // Try to find by email
        if (targetUser.email) {
          try {
            const emailCommand = new ScanCommand({
              TableName: 'users',
              FilterExpression: 'email = :email',
              ExpressionAttributeValues: {
                ':email': targetUser.email
              }
            });
            
            const emailResponse = await client.send(emailCommand);
            if (emailResponse.Items && emailResponse.Items.length > 0) {
              foundUsers.push(...emailResponse.Items);
              console.log(`   ✅ Found ${emailResponse.Items.length} user(s) by email in users`);
            }
          } catch (error) {
            console.log(`   ⚠️  Error searching users by email: ${error.message}`);
          }
        }
        
        // Try to find by phone
        if (targetUser.phone) {
          try {
            const phoneNum = typeof targetUser.phone === 'string' && !isNaN(targetUser.phone) 
              ? parseInt(targetUser.phone) 
              : targetUser.phone;
            
            const phoneCommand = new ScanCommand({
              TableName: 'users',
              FilterExpression: 'mob_num = :phone',
              ExpressionAttributeValues: {
                ':phone': phoneNum
              }
            });
            
            const phoneResponse = await client.send(phoneCommand);
            if (phoneResponse.Items && phoneResponse.Items.length > 0) {
              phoneResponse.Items.forEach(user => {
                // Avoid duplicates
                if (!foundUsers.find(u => u.id === user.id)) {
                  foundUsers.push(user);
                }
              });
              console.log(`   ✅ Found ${phoneResponse.Items.length} user(s) by phone in users`);
            }
          } catch (error) {
            console.log(`   ⚠️  Error searching users by phone: ${error.message}`);
          }
        }
        
        if (foundUsers.length > 0) {
          foundUsers.forEach(user => {
            // Avoid duplicates
            if (!usersToDelete.find(u => u.id === user.id)) {
              usersToDelete.push(user);
              console.log(`   📋 User to delete from users table:`);
              console.log(`      ID: ${user.id}`);
              console.log(`      Name: ${user.name || 'N/A'}`);
              console.log(`      Email: ${user.email || 'N/A'}`);
              console.log(`      Phone: ${user.mob_num || 'N/A'}`);
              console.log(`      User Type: ${user.user_type || 'N/A'}`);
              console.log(`      App Type: ${user.app_type || 'N/A'}`);
              console.log('');
            }
          });
        } else {
          console.log(`   ⚠️  No user found matching: ${targetUser.name} (${targetUser.email}, ${targetUser.phone})\n`);
        }
      }
    }
    
    if (usersToDelete.length === 0 && userAdminsToDelete.length === 0) {
      console.log('\n❌ No users found to delete.\n');
      return;
    }
    
    // Find shops for these users
    console.log(`\n📋 Finding shops for ${usersToDelete.length} user(s)...\n`);
    
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
    
    // Summary before deletion
    console.log('\n' + '='.repeat(80));
    console.log('📊 SUMMARY - Records to be deleted:');
    console.log(`   Admin Users (user_admins): ${userAdminsToDelete.length}`);
    console.log(`   Users (users): ${usersToDelete.length}`);
    console.log(`   Shops: ${shopsToDelete.length}`);
    console.log('='.repeat(80) + '\n');
    
    if (isDryRun) {
      console.log('✅ DRY RUN COMPLETE - No data was deleted');
      console.log('   Run with --confirm to actually delete these records\n');
      return;
    }
    
    // Delete shops first
    console.log('\n📋 Deleting shops...\n');
    
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
    
    // Delete users from users table
    console.log('\n📋 Deleting users from users table...\n');
    
    for (const user of usersToDelete) {
      try {
        const deleteUserCommand = new DeleteCommand({
          TableName: 'users',
          Key: { id: user.id }
        });
        
        await client.send(deleteUserCommand);
        
        // Clear Redis cache
        try {
          await RedisCache.delete(RedisCache.userKey(String(user.id), 'profile'));
          await RedisCache.delete(RedisCache.userKey(String(user.id)));
          await RedisCache.invalidateTableCache('users');
        } catch (redisErr) {
          console.log(`   ⚠️  Redis cache clear warning: ${redisErr.message}`);
        }
        
        console.log(`   ✅ Deleted user ${user.id} (${user.name || 'N/A'}, ${user.email || 'N/A'}, ${user.mob_num || 'N/A'})`);
        deletedUsers++;
      } catch (error) {
        console.error(`   ❌ Error deleting user ${user.id}:`, error.message);
        errors++;
      }
    }
    
    // Delete admin users from user_admins table
    console.log('\n📋 Deleting admin users from user_admins table...\n');
    
    for (const userAdmin of userAdminsToDelete) {
      try {
        const deleteAdminCommand = new DeleteCommand({
          TableName: 'user_admins',
          Key: { id: userAdmin.id }
        });
        
        await client.send(deleteAdminCommand);
        
        // Clear Redis cache
        try {
          await RedisCache.invalidateTableCache('user_admins');
          await RedisCache.delete(RedisCache.adminKey('user', userAdmin.id));
          await RedisCache.delete(RedisCache.adminKey('users'));
          await RedisCache.delete(RedisCache.adminKey('view_users'));
        } catch (redisErr) {
          console.log(`   ⚠️  Redis cache clear warning: ${redisErr.message}`);
        }
        
        console.log(`   ✅ Deleted admin user ${userAdmin.id} (${userAdmin.name || 'N/A'}, ${userAdmin.email || 'N/A'}, ${userAdmin.phone || 'N/A'})`);
        deletedUserAdmins++;
      } catch (error) {
        console.error(`   ❌ Error deleting admin user ${userAdmin.id}:`, error.message);
        errors++;
      }
    }
    
    // Final summary
    console.log('\n' + '='.repeat(80));
    console.log('📊 FINAL SUMMARY:');
    console.log(`   Admin Users Deleted (user_admins): ${deletedUserAdmins} / ${userAdminsToDelete.length}`);
    console.log(`   Users Deleted (users): ${deletedUsers} / ${usersToDelete.length}`);
    console.log(`   Shops Deleted: ${deletedShops} / ${shopsToDelete.length}`);
    console.log(`   Errors: ${errors}`);
    console.log('='.repeat(80) + '\n');
    
    if (errors === 0) {
      console.log('✅ All specified users and shops deleted successfully!\n');
    } else {
      console.log(`⚠️  Deletion completed with ${errors} error(s)\n`);
    }
    
  } catch (error) {
    console.error('\n❌ Error deleting users:', error);
    throw error;
  }
}

// Run the script
deleteAdminUsers()
  .then(() => {
    console.log('✅ Script completed');
    process.exit(0);
  })
  .catch(error => {
    console.error('❌ Script failed:', error);
    process.exit(1);
  });
