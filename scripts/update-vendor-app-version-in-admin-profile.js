/**
 * Script to update vendor_app_version in admin_profile table
 * 
 * Usage: node scripts/update-vendor-app-version-in-admin-profile.js [version]
 * Example: node scripts/update-vendor-app-version-in-admin-profile.js 1.19.0
 */

require('dotenv').config();
const { getDynamoDBClient } = require('../config/dynamodb');
const { GetCommand, PutCommand, UpdateCommand } = require('@aws-sdk/lib-dynamodb');

const newVersion = process.argv[2] || '1.19.0';

async function updateVendorAppVersionInAdminProfile() {
  try {
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🔄 Updating Vendor App Version in admin_profile');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`New Version: ${newVersion}`);
    console.log('');
    
    const client = getDynamoDBClient();
    
    // Check if admin_profile exists
    const getCommand = new GetCommand({
      TableName: 'admin_profile',
      Key: { id: 1 }
    });
    
    const response = await client.send(getCommand);
    
    if (response.Item) {
      const currentVendorVersion = response.Item.vendor_app_version || response.Item.appVersion || response.Item.app_version || 'N/A';
      const currentCustomerVersion = response.Item.customer_app_version || 'N/A';
      
      console.log('📋 Current admin_profile values:');
      console.log(`   vendor_app_version: ${currentVendorVersion}`);
      console.log(`   customer_app_version: ${currentCustomerVersion}`);
      console.log(`   appVersion (legacy): ${response.Item.appVersion || 'N/A'}`);
      console.log(`   app_version (legacy): ${response.Item.app_version || 'N/A'}`);
      console.log('');
      
      if (currentVendorVersion === newVersion) {
        console.log(`✅ vendor_app_version is already at ${newVersion}`);
        console.log('   No update needed');
        process.exit(0);
      }
      
      console.log(`🔄 Updating vendor_app_version: ${currentVendorVersion} → ${newVersion}`);
      
      // Update existing item - update vendor_app_version and legacy fields
      const updateCommand = new UpdateCommand({
        TableName: 'admin_profile',
        Key: { id: 1 },
        UpdateExpression: 'SET vendor_app_version = :version, appVersion = :version, app_version = :version, #updated_at = :updated_at',
        ExpressionAttributeNames: {
          '#updated_at': 'updated_at'
        },
        ExpressionAttributeValues: {
          ':version': newVersion,
          ':updated_at': new Date().toISOString()
        }
      });
      
      await client.send(updateCommand);
      console.log(`✅ Successfully updated vendor_app_version to: ${newVersion}`);
      
    } else {
      // Create new admin_profile item if it doesn't exist
      console.log('📝 Admin profile does not exist, creating new one...');
      const newItem = {
        id: 1,
        name: 'SCRAPMATE',
        contact: 0,
        email: 'nil@nil.in',
        address: 'nil',
        location: 'nil',
        vendor_app_version: newVersion,
        customer_app_version: '1.0.0', // Default customer app version
        appVersion: newVersion,
        app_version: newVersion,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
      
      const putCommand = new PutCommand({
        TableName: 'admin_profile',
        Item: newItem
      });
      
      await client.send(putCommand);
      console.log(`✅ Successfully created admin profile with vendor_app_version: ${newVersion}`);
    }
    
    // Verify the update
    console.log('\n🔍 Verifying update...');
    const verifyCommand = new GetCommand({
      TableName: 'admin_profile',
      Key: { id: 1 }
    });
    
    const verifyResponse = await client.send(verifyCommand);
    
    if (verifyResponse.Item) {
      const vendorVersion = verifyResponse.Item.vendor_app_version || verifyResponse.Item.appVersion || verifyResponse.Item.app_version;
      const customerVersion = verifyResponse.Item.customer_app_version || 'N/A';
      
      console.log(`   vendor_app_version: ${vendorVersion}`);
      console.log(`   customer_app_version: ${customerVersion}`);
      console.log(`   appVersion (legacy): ${verifyResponse.Item.appVersion || 'N/A'}`);
      console.log(`   app_version (legacy): ${verifyResponse.Item.app_version || 'N/A'}`);
      
      if (vendorVersion === newVersion) {
        console.log('✅ Version update verified successfully!');
      } else {
        console.log(`⚠️  Warning: Version mismatch. Expected ${newVersion}, got ${vendorVersion}`);
      }
    } else {
      console.log('❌ Could not verify update - admin_profile not found');
    }
    
    console.log('');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
  } catch (error) {
    console.error('❌ Error:', error);
    console.error('   Message:', error.message);
    console.error('   Stack:', error.stack);
    process.exit(1);
  }
}

updateVendorAppVersionInAdminProfile();

