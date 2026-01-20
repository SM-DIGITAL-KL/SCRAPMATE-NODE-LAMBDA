require('dotenv').config();
const { getDynamoDBClient } = require('../config/dynamodb');
const { GetCommand, PutCommand, UpdateCommand } = require('@aws-sdk/lib-dynamodb');
const RedisCache = require('../utils/redisCache');

const NEW_VERSION = process.argv[2] || '1.21.0';

async function updateVendorAppVersion() {
  try {
    console.log('\n🔧 Updating Vendor App Version');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    console.log(`New Version: ${NEW_VERSION}\n`);

    const client = getDynamoDBClient();
    
    // Check if admin_profile exists
    const getCommand = new GetCommand({
      TableName: 'admin_profile',
      Key: { id: 1 }
    });
    
    const response = await client.send(getCommand);
    
    if (response.Item) {
      // Get current version
      const currentVersion = response.Item.vendor_app_version || 
                            response.Item.appVersion || 
                            response.Item.app_version || 
                            'Not set';
      
      console.log(`Current Version: ${currentVersion}`);
      console.log(`Updating to: ${NEW_VERSION}\n`);
      
      // Update existing item
      const updateCommand = new UpdateCommand({
        TableName: 'admin_profile',
        Key: { id: 1 },
        UpdateExpression: 'SET vendor_app_version = :version, appVersion = :version, app_version = :version, #updated_at = :updated_at',
        ExpressionAttributeNames: {
          '#updated_at': 'updated_at'
        },
        ExpressionAttributeValues: {
          ':version': NEW_VERSION,
          ':updated_at': new Date().toISOString()
        },
        ReturnValues: 'ALL_NEW'
      });
      
      const updateResponse = await client.send(updateCommand);
      console.log('✅ Successfully updated vendor app version!');
      console.log('\n📋 Updated admin_profile:');
      console.log(`   vendor_app_version: ${updateResponse.Attributes.vendor_app_version}`);
      console.log(`   appVersion: ${updateResponse.Attributes.appVersion}`);
      console.log(`   app_version: ${updateResponse.Attributes.app_version}`);
      console.log(`   updated_at: ${updateResponse.Attributes.updated_at}`);
    } else {
      // Create new admin_profile item if it doesn't exist
      console.log('⚠️  admin_profile not found. Creating new entry...\n');
      
      const newItem = {
        id: 1,
        name: 'SCRAPMATE',
        contact: 0,
        email: 'nil@nil.in',
        address: 'nil',
        location: 'nil',
        vendor_app_version: NEW_VERSION,
        appVersion: NEW_VERSION,
        app_version: NEW_VERSION,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
      
      const putCommand = new PutCommand({
        TableName: 'admin_profile',
        Item: newItem
      });
      
      await client.send(putCommand);
      console.log('✅ Successfully created admin_profile with vendor app version!');
      console.log('\n📋 Created admin_profile:');
      console.log(`   vendor_app_version: ${newItem.vendor_app_version}`);
      console.log(`   appVersion: ${newItem.appVersion}`);
      console.log(`   app_version: ${newItem.app_version}`);
    }
    
    // Clear Redis cache to ensure new version is immediately available
    console.log('\n🗑️  Clearing Redis cache...');
    try {
      await RedisCache.invalidateTableCache('admin_profile');
      await RedisCache.delete(RedisCache.adminKey('app_version'));
      await RedisCache.delete(RedisCache.adminKey('site_profile'));
      console.log('✅ Redis cache cleared successfully');
    } catch (cacheError) {
      console.warn('⚠️  Warning: Could not clear Redis cache:', cacheError.message);
      console.warn('   The new version will be available after cache expires (30 days)');
    }
    
    console.log('\n✅ Done!\n');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run the script
updateVendorAppVersion();
