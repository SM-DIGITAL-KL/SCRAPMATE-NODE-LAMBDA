/**
 * Script to update vendor app version in the database
 * 
 * Usage: 
 *   node scripts/update-vendor-app-version.js [vendor_id]
 *   node scripts/update-vendor-app-version.js all
 * 
 * Examples:
 *   node scripts/update-vendor-app-version.js 1767945729183  (update specific vendor)
 *   node scripts/update-vendor-app-version.js all            (update all vendor_app users)
 */

require('dotenv').config();
const User = require('../models/User');
const { getDynamoDBClient } = require('../config/dynamodb');
const { UpdateCommand, ScanCommand } = require('@aws-sdk/lib-dynamodb');

const vendorId = process.argv[2];
const newVersion = '1.19.0';

if (!vendorId) {
  console.error('❌ Please provide a vendor ID or "all"');
  console.error('   Usage: node scripts/update-vendor-app-version.js [vendor_id|all]');
  process.exit(1);
}

async function updateVendorAppVersion() {
  try {
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🔄 Updating Vendor App Version');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`Target: ${vendorId === 'all' ? 'All vendor_app users' : `Vendor ID: ${vendorId}`}`);
    console.log(`New Version: ${newVersion}`);
    console.log('');
    
    const client = getDynamoDBClient();
    let updatedCount = 0;
    let skippedCount = 0;
    let errorCount = 0;
    
    if (vendorId === 'all') {
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
            console.log(`⏭️  Skipping ${user.id} (${user.name || 'N/A'}) - already at version ${newVersion}`);
            skippedCount++;
            continue;
          }
          
          console.log(`🔄 Updating ${user.id} (${user.name || 'N/A'}): ${currentVersion} → ${newVersion}`);
          
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
      // Update specific vendor
      const vendor = await User.findById(vendorId);
      
      if (!vendor) {
        console.error(`❌ Vendor with ID ${vendorId} not found`);
        process.exit(1);
      }
      
      if (vendor.app_type !== 'vendor_app') {
        console.warn(`⚠️  Warning: User ${vendorId} is not a vendor_app user (app_type: ${vendor.app_type || 'N/A'})`);
        console.log('   Proceeding with update anyway...');
      }
      
      const currentVersion = vendor.app_version || 'N/A';
      
      if (currentVersion === newVersion) {
        console.log(`✅ Vendor ${vendorId} (${vendor.name || 'N/A'}) is already at version ${newVersion}`);
        console.log('   No update needed');
        process.exit(0);
      }
      
      console.log(`🔄 Updating vendor ${vendorId} (${vendor.name || 'N/A'}): ${currentVersion} → ${newVersion}`);
      
      try {
        const updateCommand = new UpdateCommand({
          TableName: 'users',
          Key: { id: parseInt(vendorId) },
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
        const updatedVendor = await User.findById(vendorId);
        console.log('');
        console.log(`✅ Verification:`);
        console.log(`   Vendor ID: ${updatedVendor.id}`);
        console.log(`   Name: ${updatedVendor.name || 'N/A'}`);
        console.log(`   App Type: ${updatedVendor.app_type || 'N/A'}`);
        console.log(`   App Version: ${updatedVendor.app_version || 'N/A'}`);
      } catch (err) {
        console.error(`❌ Error updating vendor:`, err.message);
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

updateVendorAppVersion();
