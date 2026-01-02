/**
 * Script to update vendor app (partner app) version in DynamoDB admin_profile table
 * Usage: node scripts/update-vendor-app-version.js [version]
 * Example: node scripts/update-vendor-app-version.js 1.0.8
 */

require('dotenv').config();
const { getDynamoDBClient } = require('../config/dynamodb');
const { GetCommand, PutCommand, UpdateCommand } = require('@aws-sdk/lib-dynamodb');

const VERSION = process.argv[2] || '1.0.8';
const TABLE_NAME = 'admin_profile';

async function updateVendorAppVersion() {
  try {
    console.log('🟢 Starting vendor app version update...');
    console.log(`   Target version: ${VERSION}`);
    
    const client = getDynamoDBClient();
    
    // Check if admin_profile exists
    const getCommand = new GetCommand({
      TableName: TABLE_NAME,
      Key: { id: 1 }
    });
    
    const response = await client.send(getCommand);
    
    if (response.Item) {
      // Update existing item
      console.log('📝 Admin profile exists, updating version...');
      const updateCommand = new UpdateCommand({
        TableName: TABLE_NAME,
        Key: { id: 1 },
        UpdateExpression: 'SET vendor_app_version = :version, appVersion = :version, app_version = :version, #updated_at = :updated_at',
        ExpressionAttributeNames: {
          '#updated_at': 'updated_at'
        },
        ExpressionAttributeValues: {
          ':version': VERSION,
          ':updated_at': new Date().toISOString()
        }
      });
      
      await client.send(updateCommand);
      console.log(`✅ Successfully updated vendor app version to: ${VERSION}`);
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
        vendor_app_version: VERSION,
        appVersion: VERSION,
        app_version: VERSION,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
      
      const putCommand = new PutCommand({
        TableName: TABLE_NAME,
        Item: newItem
      });
      
      await client.send(putCommand);
      console.log(`✅ Successfully created admin profile with vendor app version: ${VERSION}`);
    }
    
    // Verify the update
    const verifyCommand = new GetCommand({
      TableName: TABLE_NAME,
      Key: { id: 1 }
    });
    
    const verifyResponse = await client.send(verifyCommand);
    if (verifyResponse.Item) {
      const storedVersion = verifyResponse.Item.vendor_app_version || verifyResponse.Item.appVersion || verifyResponse.Item.app_version;
      console.log(`🔍 Verification: Stored vendor app version is now: ${storedVersion}`);
      
      if (storedVersion === VERSION) {
        console.log('✅ Version update verified successfully!');
      } else {
        console.warn(`⚠️ Warning: Stored version (${storedVersion}) does not match target version (${VERSION})`);
      }
    }
    
    console.log('✅ Vendor app version update completed!');
  } catch (error) {
    console.error('❌ Error updating vendor app version:', error);
    process.exit(1);
  }
}

// Run the script
updateVendorAppVersion()
  .then(() => {
    console.log('🎉 Script completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Script failed:', error);
    process.exit(1);
  });

