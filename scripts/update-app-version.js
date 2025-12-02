/**
 * Script to update app version in admin_profile table
 * Usage: node scripts/update-app-version.js <version>
 * Example: node scripts/update-app-version.js 1.2.42
 */

const { getDynamoDBClient } = require('../config/dynamodb');
const { GetCommand, PutCommand, UpdateCommand } = require('@aws-sdk/lib-dynamodb');
const { loadEnvFromFile } = require('../utils/loadEnv');

loadEnvFromFile();
require('../config/dynamodb');

async function updateAppVersion(version) {
  try {
    console.log(`\n🔄 Updating app version to: ${version}\n`);
    
    if (!version) {
      console.error('❌ Please provide a version number.');
      console.log('Usage: node scripts/update-app-version.js <version>');
      console.log('Example: node scripts/update-app-version.js 1.2.42');
      process.exit(1);
    }
    
    const client = getDynamoDBClient();
    
    // Check if admin_profile exists
    const getCommand = new GetCommand({
      TableName: 'admin_profile',
      Key: { id: 1 }
    });
    
    const response = await client.send(getCommand);
    
    if (response.Item) {
      console.log('✅ admin_profile found in DynamoDB');
      console.log(`   Current version: ${response.Item.appVersion || response.Item.app_version || response.Item.version || 'not set'}`);
      
      // Update existing item
      const updateCommand = new UpdateCommand({
        TableName: 'admin_profile',
        Key: { id: 1 },
        UpdateExpression: 'SET appVersion = :version, app_version = :version, #updated_at = :updated_at',
        ExpressionAttributeNames: {
          '#updated_at': 'updated_at'
        },
        ExpressionAttributeValues: {
          ':version': version,
          ':updated_at': new Date().toISOString()
        },
        ReturnValues: 'ALL_NEW'
      });
      
      const updateResponse = await client.send(updateCommand);
      console.log(`\n✅ Successfully updated app version to: ${version}`);
      console.log(`   Updated fields: appVersion, app_version, updated_at`);
      
      // Verify the update
      const verifyResponse = await client.send(getCommand);
      if (verifyResponse.Item) {
        console.log(`\n🔍 Verification:`);
        console.log(`   appVersion: ${verifyResponse.Item.appVersion || 'not set'}`);
        console.log(`   app_version: ${verifyResponse.Item.app_version || 'not set'}`);
        console.log(`   version: ${verifyResponse.Item.version || 'not set'}`);
      }
    } else {
      console.log('⚠️  admin_profile not found in DynamoDB');
      console.log('📝 Creating new admin_profile entry...');
      
      // Create new admin_profile item
      const newItem = {
        id: 1,
        name: 'SCRAPMATE',
        contact: 0,
        email: 'nil@nil.in',
        address: 'nil',
        location: 'nil',
        appVersion: version,
        app_version: version,
        version: version,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
      
      const putCommand = new PutCommand({
        TableName: 'admin_profile',
        Item: newItem
      });
      
      await client.send(putCommand);
      console.log(`✅ Created new admin_profile with version: ${version}`);
    }
    
    console.log('\n✅ App version update completed!\n');
    
  } catch (error) {
    console.error('❌ Error updating app version:', error);
    process.exit(1);
  }
}

// Get version from command line arguments
const version = process.argv[2];

if (!version) {
  console.error('❌ Please provide a version number.');
  console.log('Usage: node scripts/update-app-version.js <version>');
  console.log('Example: node scripts/update-app-version.js 1.2.42');
  process.exit(1);
}

// Run the update
updateAppVersion(version)
  .then(() => {
    console.log('✅ Script completed successfully.');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Error:', error);
    process.exit(1);
  });


