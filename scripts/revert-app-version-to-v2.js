/**
 * Script to revert app_version from numeric versions (like 1.19.0) back to 'v2'
 * 
 * Usage: 
 *   node scripts/revert-app-version-to-v2.js [user_id]
 *   node scripts/revert-app-version-to-v2.js all
 * 
 * Examples:
 *   node scripts/revert-app-version-to-v2.js 1767945729183  (update specific user)
 *   node scripts/revert-app-version-to-v2.js all            (update all users with numeric app_version)
 */

require('dotenv').config();
const User = require('../models/User');
const { getDynamoDBClient } = require('../config/dynamodb');
const { UpdateCommand, ScanCommand } = require('@aws-sdk/lib-dynamodb');

const userId = process.argv[2];
const targetVersion = 'v2';

if (!userId) {
  console.error('❌ Please provide a user ID or "all"');
  console.error('   Usage: node scripts/revert-app-version-to-v2.js [user_id|all]');
  process.exit(1);
}

async function revertAppVersionToV2() {
  try {
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🔄 Reverting App Version to v2');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`Target: ${userId === 'all' ? 'All users with numeric app_version' : `User ID: ${userId}`}`);
    console.log(`Target Version: ${targetVersion}`);
    console.log('');
    
    const client = getDynamoDBClient();
    let updatedCount = 0;
    let skippedCount = 0;
    let errorCount = 0;
    
    if (userId === 'all') {
      // Update all users with numeric app_version (like 1.19.0, 1.18.0, etc.)
      console.log('📦 Fetching all users with numeric app_version...');
      
      let allUsers = [];
      let lastKey = null;
      
      do {
        const params = {
          TableName: 'users',
          FilterExpression: '(attribute_not_exists(del_status) OR del_status <> :deleted)',
          ExpressionAttributeValues: {
            ':deleted': 2
          }
        };
        if (lastKey) params.ExclusiveStartKey = lastKey;
        
        const command = new ScanCommand(params);
        const response = await client.send(command);
        if (response.Items) {
          // Filter users with numeric app_version (not 'v1' or 'v2')
          const numericVersionUsers = response.Items.filter(user => {
            const appVersion = user.app_version;
            if (!appVersion) return false;
            // Check if it's a numeric version (contains digits and dots, like "1.19.0")
            return /^\d+\.\d+\.\d+/.test(appVersion) || (appVersion !== 'v1' && appVersion !== 'v2' && /^\d/.test(appVersion));
          });
          allUsers.push(...numericVersionUsers);
        }
        lastKey = response.LastEvaluatedKey;
      } while (lastKey);
      
      console.log(`✅ Found ${allUsers.length} users with numeric app_version`);
      console.log('');
      
      // Update each user
      for (const user of allUsers) {
        try {
          const currentVersion = user.app_version || 'N/A';
          
          // Skip if already at target version
          if (currentVersion === targetVersion) {
            console.log(`⏭️  Skipping ${user.id} (${user.name || 'N/A'}) - already at version ${targetVersion}`);
            skippedCount++;
            continue;
          }
          
          console.log(`🔄 Updating ${user.id} (${user.name || 'N/A'}, type: ${user.user_type || 'N/A'}): ${currentVersion} → ${targetVersion}`);
          
          const updateCommand = new UpdateCommand({
            TableName: 'users',
            Key: { id: user.id },
            UpdateExpression: 'SET app_version = :version, updated_at = :updatedAt',
            ExpressionAttributeValues: {
              ':version': targetVersion,
              ':updatedAt': new Date().toISOString()
            }
          });
          
          await client.send(updateCommand);
          updatedCount++;
          console.log(`   ✅ Updated successfully`);
        } catch (err) {
          console.error(`   ❌ Error updating ${user.id}:`, err.message);
          errorCount++;
        }
      }
    } else {
      // Update specific user
      const user = await User.findById(userId);
      
      if (!user) {
        console.error(`❌ User with ID ${userId} not found`);
        process.exit(1);
      }
      
      const currentVersion = user.app_version || 'N/A';
      
      if (currentVersion === targetVersion) {
        console.log(`✅ User ${userId} (${user.name || 'N/A'}) is already at version ${targetVersion}`);
        console.log('   No update needed');
        process.exit(0);
      }
      
      console.log(`🔄 Updating user ${userId} (${user.name || 'N/A'}): ${currentVersion} → ${targetVersion}`);
      
      try {
        const updateCommand = new UpdateCommand({
          TableName: 'users',
          Key: { id: parseInt(userId) },
          UpdateExpression: 'SET app_version = :version, updated_at = :updatedAt',
          ExpressionAttributeValues: {
            ':version': targetVersion,
            ':updatedAt': new Date().toISOString()
          }
        });
        
        await client.send(updateCommand);
        updatedCount++;
        console.log(`✅ Updated successfully`);
        
        // Verify the update
        const updatedUser = await User.findById(userId);
        console.log('');
        console.log(`✅ Verification:`);
        console.log(`   User ID: ${updatedUser.id}`);
        console.log(`   Name: ${updatedUser.name || 'N/A'}`);
        console.log(`   User Type: ${updatedUser.user_type || 'N/A'}`);
        console.log(`   App Type: ${updatedUser.app_type || 'N/A'}`);
        console.log(`   App Version: ${updatedUser.app_version || 'N/A'}`);
      } catch (err) {
        console.error(`❌ Error updating user:`, err.message);
        errorCount++;
      }
    }
    
    console.log('');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📊 Summary');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`✅ Updated: ${updatedCount}`);
    console.log(`⏭️  Skipped: ${skippedCount}`);
    console.log(`❌ Errors: ${errorCount}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
  } catch (error) {
    console.error('❌ Error:', error);
    console.error('   Message:', error.message);
    console.error('   Stack:', error.stack);
    process.exit(1);
  }
}

revertAppVersionToV2();

