/**
 * Script to update all vendor_app users' app_version to 1.19.0
 * 
 * Usage: 
 *   node scripts/update-vendor-app-to-1.19.0.js [user_id]
 *   node scripts/update-vendor-app-to-1.19.0.js all
 * 
 * Examples:
 *   node scripts/update-vendor-app-to-1.19.0.js 1767945729183  (update specific user)
 *   node scripts/update-vendor-app-to-1.19.0.js all            (update all vendor_app users)
 */

require('dotenv').config();
const User = require('../models/User');
const { getDynamoDBClient } = require('../config/dynamodb');
const { UpdateCommand, ScanCommand } = require('@aws-sdk/lib-dynamodb');

const userId = process.argv[2];
const newVersion = '1.19.0';

if (!userId) {
  console.error('❌ Please provide a user ID or "all"');
  console.error('   Usage: node scripts/update-vendor-app-to-1.19.0.js [user_id|all]');
  process.exit(1);
}

async function updateVendorAppTo1_19_0() {
  try {
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🔄 Updating Vendor App Version to 1.19.0');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`Target: ${userId === 'all' ? 'All vendor_app users' : `User ID: ${userId}`}`);
    console.log(`New Version: ${newVersion}`);
    console.log('');
    
    const client = getDynamoDBClient();
    let updatedCount = 0;
    let skippedCount = 0;
    let errorCount = 0;
    
    if (userId === 'all') {
      // Update all vendor_app users
      console.log('📦 Fetching all vendor_app users...');
      
      let allUsers = [];
      let lastKey = null;
      
      do {
        const params = {
          TableName: 'users',
          FilterExpression: 'app_type = :appType AND (attribute_not_exists(del_status) OR del_status <> :deleted)',
          ExpressionAttributeValues: {
            ':appType': 'vendor_app',
            ':deleted': 2
          }
        };
        if (lastKey) params.ExclusiveStartKey = lastKey;
        
        const command = new ScanCommand(params);
        const response = await client.send(command);
        if (response.Items) allUsers.push(...response.Items);
        lastKey = response.LastEvaluatedKey;
      } while (lastKey);
      
      console.log(`✅ Found ${allUsers.length} vendor_app users`);
      console.log('');
      
      // Update each user
      for (const user of allUsers) {
        try {
          const currentVersion = user.app_version || 'N/A';
          
          // Skip if already at the target version
          if (currentVersion === newVersion) {
            console.log(`⏭️  Skipping ${user.id} (${user.name || 'N/A'}, type: ${user.user_type || 'N/A'}) - already at version ${newVersion}`);
            skippedCount++;
            continue;
          }
          
          console.log(`🔄 Updating ${user.id} (${user.name || 'N/A'}, type: ${user.user_type || 'N/A'}): ${currentVersion} → ${newVersion}`);
          
          const updateCommand = new UpdateCommand({
            TableName: 'users',
            Key: { id: user.id },
            UpdateExpression: 'SET app_version = :version, updated_at = :updatedAt',
            ExpressionAttributeValues: {
              ':version': newVersion,
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
      
      if (user.app_type !== 'vendor_app') {
        console.warn(`⚠️  Warning: User ${userId} is not a vendor_app user (app_type: ${user.app_type || 'N/A'})`);
        console.log('   Proceeding with update anyway...');
      }
      
      const currentVersion = user.app_version || 'N/A';
      
      if (currentVersion === newVersion) {
        console.log(`✅ User ${userId} (${user.name || 'N/A'}) is already at version ${newVersion}`);
        console.log('   No update needed');
        process.exit(0);
      }
      
      console.log(`🔄 Updating user ${userId} (${user.name || 'N/A'}): ${currentVersion} → ${newVersion}`);
      
      try {
        const updateCommand = new UpdateCommand({
          TableName: 'users',
          Key: { id: parseInt(userId) },
          UpdateExpression: 'SET app_version = :version, updated_at = :updatedAt',
          ExpressionAttributeValues: {
            ':version': newVersion,
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

updateVendorAppTo1_19_0();

