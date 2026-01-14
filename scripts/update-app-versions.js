/**
 * Script to update both vendor app and user app versions in DynamoDB admin_profile table
 * Usage: node scripts/update-app-versions.js [vendorVersion] [customerVersion]
 * Example: node scripts/update-app-versions.js 1.14.0 1.4.0
 * 
 * This script updates:
 * - vendor_app_version (for vendor/partner app)
 * - customer_app_version (for customer/user app)
 * - appVersion (legacy field - uses vendor version)
 * - app_version (legacy field - uses vendor version)
 */

require('dotenv').config();
const { getDynamoDBClient } = require('../config/dynamodb');
const { GetCommand, PutCommand, UpdateCommand } = require('@aws-sdk/lib-dynamodb');
const { getTableName, getEnvironment } = require('../utils/dynamodbTableNames');

const VENDOR_VERSION = process.argv[2] || '1.14.0';
const CUSTOMER_VERSION = process.argv[3] || '1.4.0';
const TABLE_NAME = getTableName('admin_profile');

async function updateAppVersions() {
  try {
    const environment = getEnvironment();
    console.log('🟢 Starting app versions update...');
    console.log(`   Environment: ${environment}`);
    console.log(`   Table: ${TABLE_NAME}`);
    console.log(`   Vendor app version: ${VENDOR_VERSION}`);
    console.log(`   Customer app version: ${CUSTOMER_VERSION}`);
    console.log(`   Updating: vendor_app_version and customer_app_version\n`);
    
    const client = getDynamoDBClient();
    
    // Check if admin_profile exists
    const getCommand = new GetCommand({
      TableName: TABLE_NAME,
      Key: { id: 1 }
    });
    
    const response = await client.send(getCommand);
    
    if (response.Item) {
      // Update existing item
      console.log('📝 Admin profile exists, updating versions...');
      console.log(`   Current vendor_app_version: ${response.Item.vendor_app_version || 'not set'}`);
      console.log(`   Current customer_app_version: ${response.Item.customer_app_version || 'not set'}\n`);
      
      const updateCommand = new UpdateCommand({
        TableName: TABLE_NAME,
        Key: { id: 1 },
        UpdateExpression: 'SET vendor_app_version = :vendorVersion, customer_app_version = :customerVersion, appVersion = :vendorVersion, app_version = :vendorVersion, #updated_at = :updated_at',
        ExpressionAttributeNames: {
          '#updated_at': 'updated_at'
        },
        ExpressionAttributeValues: {
          ':vendorVersion': VENDOR_VERSION,
          ':customerVersion': CUSTOMER_VERSION,
          ':updated_at': new Date().toISOString()
        }
      });
      
      await client.send(updateCommand);
      console.log(`✅ Successfully updated vendor app version to: ${VENDOR_VERSION}`);
      console.log(`✅ Successfully updated customer app version to: ${CUSTOMER_VERSION}`);
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
        vendor_app_version: VENDOR_VERSION,
        customer_app_version: CUSTOMER_VERSION,
        appVersion: VENDOR_VERSION,
        app_version: VENDOR_VERSION,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
      
      const putCommand = new PutCommand({
        TableName: TABLE_NAME,
        Item: newItem
      });
      
      await client.send(putCommand);
      console.log(`✅ Successfully created admin profile with vendor app version: ${VENDOR_VERSION}`);
      console.log(`✅ Successfully created admin profile with customer app version: ${CUSTOMER_VERSION}`);
    }
    
    // Verify the update
    console.log('\n🔍 Verifying update...');
    const verifyCommand = new GetCommand({
      TableName: TABLE_NAME,
      Key: { id: 1 }
    });
    
    const verifyResponse = await client.send(verifyCommand);
    if (verifyResponse.Item) {
      const vendorVersion = verifyResponse.Item.vendor_app_version || verifyResponse.Item.appVersion || verifyResponse.Item.app_version;
      const customerVersion = verifyResponse.Item.customer_app_version || verifyResponse.Item.appVersion || verifyResponse.Item.app_version;
      
      console.log(`   Vendor app version: ${vendorVersion}`);
      console.log(`   Customer app version: ${customerVersion}`);
      
      if (vendorVersion === VENDOR_VERSION && customerVersion === CUSTOMER_VERSION) {
        console.log('✅ Version updates verified successfully!');
      } else {
        console.warn(`⚠️ Warning: Some versions don't match target versions`);
        if (vendorVersion !== VENDOR_VERSION) {
          console.warn(`   Vendor version mismatch: ${vendorVersion} !== ${VENDOR_VERSION}`);
        }
        if (customerVersion !== CUSTOMER_VERSION) {
          console.warn(`   Customer version mismatch: ${customerVersion} !== ${CUSTOMER_VERSION}`);
        }
      }
    }
    
    console.log('\n✅ App versions update completed!');
  } catch (error) {
    console.error('❌ Error updating app versions:', error);
    process.exit(1);
  }
}

// Run the script
updateAppVersions()
  .then(() => {
    console.log('🎉 Script completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Script failed:', error);
    process.exit(1);
  });

