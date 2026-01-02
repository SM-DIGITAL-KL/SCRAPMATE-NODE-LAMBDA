require('dotenv').config();
const { getDynamoDBClient } = require('../config/dynamodb');
const { ScanCommand, DeleteCommand } = require('@aws-sdk/lib-dynamodb');

const User = require('../models/User');
const Shop = require('../models/Shop');
const Order = require('../models/Order');

/**
 * Permanently delete all v2 users with user types 'R', 'D', 'S', 'SR'
 * WARNING: This is a destructive operation that cannot be undone!
 */
async function deleteAllV2VendorUsers() {
  try {
    const client = getDynamoDBClient();
    
    const targetUserTypes = ['R', 'D', 'S', 'SR'];
    
    console.log('\n' + '='.repeat(80));
    console.log('🗑️  DELETE ALL V2 VENDOR USERS (R, D, S, SR)');
    console.log('='.repeat(80));
    console.log('⚠️  WARNING: This will PERMANENTLY delete all v2 users with types: R, D, S, SR!');
    console.log('⚠️  This action CANNOT be undone!\n');
    
    let totalFoundUsers = 0;
    let totalDeletedUsers = 0;
    let totalDeletedShops = 0;
    let totalErrors = 0;
    let totalRelatedOrders = 0;

    // ========== STEP 1: FIND ALL V2 VENDOR USERS ==========
    console.log('📋 Step 1: Finding all v2 users with types R, D, S, SR...\n');
    const v2VendorUsers = [];
    let lastKey = null;
    
    do {
      const params = {
        TableName: 'users',
        FilterExpression: 'app_version = :appVersion AND (user_type = :typeR OR user_type = :typeD OR user_type = :typeS OR user_type = :typeSR)',
        ExpressionAttributeValues: {
          ':appVersion': 'v2',
          ':typeR': 'R',
          ':typeD': 'D',
          ':typeS': 'S',
          ':typeSR': 'SR'
        }
      };
      
      if (lastKey) {
        params.ExclusiveStartKey = lastKey;
      }
      
      const command = new ScanCommand(params);
      const response = await client.send(command);
      
      if (response.Items && response.Items.length > 0) {
        v2VendorUsers.push(...response.Items);
        totalFoundUsers += response.Items.length;
        console.log(`   Found ${response.Items.length} users in this batch (Total: ${totalFoundUsers})`);
      }
      
      lastKey = response.LastEvaluatedKey;
    } while (lastKey);
    
    if (v2VendorUsers.length === 0) {
      console.log('✅ No v2 vendor users (R, D, S, SR) found in the database.\n');
      return { 
        foundUsers: 0,
        deletedUsers: 0, 
        deletedShops: 0,
        relatedOrders: 0,
        errors: 0 
      };
    }
    
    console.log(`\n✅ Found ${v2VendorUsers.length} v2 vendor user(s) total.\n`);
    
    // Group by user type
    const usersByType = {
      'R': v2VendorUsers.filter(u => u.user_type === 'R'),
      'D': v2VendorUsers.filter(u => u.user_type === 'D'),
      'S': v2VendorUsers.filter(u => u.user_type === 'S'),
      'SR': v2VendorUsers.filter(u => u.user_type === 'SR')
    };
    
    console.log('📊 Users by type:');
    Object.keys(usersByType).forEach(type => {
      if (usersByType[type].length > 0) {
        console.log(`   ${type}: ${usersByType[type].length} user(s)`);
      }
    });
    console.log('');
    
    // Show summary of users to be deleted
    console.log('📊 Sample users to be deleted (first 10):');
    v2VendorUsers.slice(0, 10).forEach((user, index) => {
      console.log(`   ${index + 1}. ID: ${user.id}, Name: ${user.name || 'N/A'}, Type: ${user.user_type}, Phone: ${user.mob_num || 'N/A'}`);
    });
    if (v2VendorUsers.length > 10) {
      console.log(`   ... and ${v2VendorUsers.length - 10} more users`);
    }
    console.log('');

    // ========== STEP 2: CHECK FOR RELATED DATA (ORDERS) ==========
    console.log('\n📋 Step 2: Checking for related data (orders)...\n');
    
    for (const user of v2VendorUsers) {
      try {
        // Check for orders where user is the vendor (shop_id matches user's shop)
        const shop = await Shop.findByUserId(user.id);
        if (shop) {
          // Note: Orders are typically linked by shop_id, not user_id directly
          // We'll just log that shops exist, orders will remain as business records
          console.log(`   ⚠️  User ${user.id} (Type: ${user.user_type}) has shop ${shop.id} - Orders linked to this shop will NOT be deleted (business records)`);
        }
      } catch (error) {
        // Ignore errors in checking related data
        console.error(`   ⚠️  Error checking related data for user ${user.id}:`, error.message);
      }
    }
    
    if (totalRelatedOrders > 0) {
      console.log(`\n   ⚠️  WARNING: Found ${totalRelatedOrders} order(s) related to these users.`);
      console.log(`   These will remain in the database but will be orphaned (no user/shop reference).\n`);
    }

    // ========== STEP 3: FIND AND DELETE SHOPS ==========
    console.log('\n📋 Step 3: Finding and deleting shops for these users...\n');
    
    for (const user of v2VendorUsers) {
      try {
        const shop = await Shop.findByUserId(user.id);
        
        if (shop) {
          console.log(`   🗑️  Deleting shop for user ${user.id} (Type: ${user.user_type}, Shop ID: ${shop.id})`);
          
          const deleteShopCommand = new DeleteCommand({
            TableName: 'shops',
            Key: { id: shop.id }
          });
          
          await client.send(deleteShopCommand);
          console.log(`      ✅ Deleted shop ${shop.id} (${shop.shopname || 'N/A'})\n`);
          totalDeletedShops++;
        }
      } catch (error) {
        console.error(`   ❌ Error processing shop for user ${user.id}:`, error.message);
        totalErrors++;
      }
    }

    // ========== STEP 4: DELETE USERS ==========
    console.log('\n📋 Step 4: Permanently deleting v2 vendor users...\n');
    
    for (const user of v2VendorUsers) {
      try {
        const deleteUserCommand = new DeleteCommand({
          TableName: 'users',
          Key: { id: user.id }
        });
        
        await client.send(deleteUserCommand);
        console.log(`✅ Deleted user ${user.id} (Type: ${user.user_type}, Name: ${user.name || 'N/A'}, Phone: ${user.mob_num || 'N/A'})`);
        totalDeletedUsers++;
      } catch (error) {
        console.error(`❌ Error deleting user ${user.id}:`, error.message);
        totalErrors++;
      }
    }

    // ========== SUMMARY ==========
    console.log('\n' + '='.repeat(80));
    console.log('📊 DELETION SUMMARY:');
    console.log('='.repeat(80));
    console.log(`   Users Found: ${totalFoundUsers}`);
    console.log(`   Users Deleted: ${totalDeletedUsers}`);
    console.log(`   Shops Deleted: ${totalDeletedShops}`);
    console.log(`   Related Orders (not deleted): ${totalRelatedOrders}`);
    console.log(`   Errors: ${totalErrors}`);
    console.log('\n   Breakdown by User Type:');
    Object.keys(usersByType).forEach(type => {
      if (usersByType[type].length > 0) {
        console.log(`      ${type}: ${usersByType[type].length} user(s)`);
      }
    });
    console.log('='.repeat(80) + '\n');

    if (totalErrors > 0) {
      console.log('⚠️  Some errors occurred during deletion. Please review the logs above.\n');
    } else {
      console.log('✅ All v2 vendor users (R, D, S, SR) have been permanently deleted.\n');
    }

    return { 
      foundUsers: totalFoundUsers,
      deletedUsers: totalDeletedUsers, 
      deletedShops: totalDeletedShops,
      relatedOrders: totalRelatedOrders,
      errors: totalErrors 
    };
  } catch (error) {
    console.error('❌ Fatal error deleting v2 vendor users:', error);
    throw error;
  }
}

// Run the script
// Add confirmation prompt for safety
const readline = require('readline');
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

console.log('\n⚠️  WARNING: This script will PERMANENTLY DELETE ALL v2 users with types R, D, S, SR!');
console.log('⚠️  This action CANNOT be undone!\n');

rl.question('Type "DELETE ALL V2 VENDOR USERS R D S SR" to confirm: ', (answer) => {
  if (answer === 'DELETE ALL V2 VENDOR USERS R D S SR') {
    rl.close();
    deleteAllV2VendorUsers()
      .then(result => {
        console.log('✅ Script completed successfully');
        process.exit(0);
      })
      .catch(error => {
        console.error('❌ Script failed:', error);
        process.exit(1);
      });
  } else {
    console.log('❌ Confirmation text does not match. Aborting deletion.');
    rl.close();
    process.exit(0);
  }
});

