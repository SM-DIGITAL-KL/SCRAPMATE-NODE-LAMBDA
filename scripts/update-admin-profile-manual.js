#!/usr/bin/env node
/**
 * Script to manually update admin_profile table in DynamoDB with third-party API credentials
 * Usage: node scripts/update-admin-profile-manual.js
 * 
 * You can also pass credentials as environment variables:
 * APP_GOOGLE_API_KEY=your_key SMS_API_KEY=your_key FCM_SERVER_KEY=your_key node scripts/update-admin-profile-manual.js
 */

require('dotenv').config();
const { loadEnvFromFile } = require('../utils/loadEnv');
loadEnvFromFile();

const { getDynamoDBClient } = require('../config/dynamodb');
const { GetCommand, PutCommand, UpdateCommand } = require('@aws-sdk/lib-dynamodb');
const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(query) {
  return new Promise(resolve => rl.question(query, resolve));
}

async function updateAdminProfileCredentials() {
  try {
    console.log('🔍 Checking admin_profile in DynamoDB...');
    const client = getDynamoDBClient();

    // Get API keys from environment variables or prompt user
    let googleApiKey = process.env.APP_GOOGLE_API_KEY || '';
    let smsApiKey = process.env.SMS_API_KEY || '';
    let fcmServerKey = process.env.FCM_SERVER_KEY || '';

    // If not in environment, prompt user
    if (!googleApiKey) {
      googleApiKey = await question('Enter Google API Key (or press Enter to skip): ');
    }
    if (!smsApiKey) {
      smsApiKey = await question('Enter SMS API Key (or press Enter to skip): ');
    }
    if (!fcmServerKey) {
      fcmServerKey = await question('Enter FCM Server Key (or press Enter to skip): ');
    }

    console.log('\n📋 Credentials to update:');
    console.log(`   Google API Key: ${googleApiKey ? googleApiKey.substring(0, 10) + '...' : 'NOT SET'}`);
    console.log(`   SMS API Key: ${smsApiKey ? 'SET' : 'NOT SET'}`);
    console.log(`   FCM Server Key: ${fcmServerKey ? 'SET' : 'NOT SET'}`);

    // Check if admin_profile exists
    const getCommand = new GetCommand({
      TableName: 'admin_profile',
      Key: { id: 1 }
    });
    
    const response = await client.send(getCommand);

    if (response.Item) {
      console.log('\n✅ admin_profile found in DynamoDB');
      console.log('📋 Current fields:', Object.keys(response.Item));
      
      // Update existing item
      const updateExpressions = [];
      const expressionAttributeNames = {};
      const expressionAttributeValues = {};

      if (googleApiKey) {
        updateExpressions.push('#google_api_key = :google_api_key');
        expressionAttributeNames['#google_api_key'] = 'google_api_key';
        expressionAttributeValues[':google_api_key'] = googleApiKey;
      }
      
      if (smsApiKey) {
        updateExpressions.push('#sms_api_key = :sms_api_key');
        expressionAttributeNames['#sms_api_key'] = 'sms_api_key';
        expressionAttributeValues[':sms_api_key'] = smsApiKey;
      }
      
      if (fcmServerKey) {
        updateExpressions.push('#fcm_server_key = :fcm_server_key');
        expressionAttributeNames['#fcm_server_key'] = 'fcm_server_key';
        expressionAttributeValues[':fcm_server_key'] = fcmServerKey;
      }

      if (updateExpressions.length > 0) {
        updateExpressions.push('#updated_at = :updated_at');
        expressionAttributeNames['#updated_at'] = 'updated_at';
        expressionAttributeValues[':updated_at'] = new Date().toISOString();

        const updateCommand = new UpdateCommand({
          TableName: 'admin_profile',
          Key: { id: 1 },
          UpdateExpression: `SET ${updateExpressions.join(', ')}`,
          ExpressionAttributeNames: expressionAttributeNames,
          ExpressionAttributeValues: expressionAttributeValues,
          ReturnValues: 'ALL_NEW'
        });

        const updateResponse = await client.send(updateCommand);
        console.log('\n✅ Successfully updated admin_profile with credentials');
        console.log('📋 Updated fields:', Object.keys(updateResponse.Attributes).filter(k => k.includes('api') || k.includes('key')));
      } else {
        console.log('\n⚠️  No credentials provided to update');
      }
    } else {
      console.log('\n⚠️  admin_profile not found in DynamoDB');
      console.log('📝 Creating new admin_profile entry...');
      
      // Create new admin_profile item
      const newItem = {
        id: 1,
        name: 'SCRAPMATE',
        contact: 0,
        email: 'nil@nil.in',
        address: 'nil',
        location: 'nil',
        appVersion: '1.2.41',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      // Add API keys if available
      if (googleApiKey) newItem.google_api_key = googleApiKey;
      if (smsApiKey) newItem.sms_api_key = smsApiKey;
      if (fcmServerKey) newItem.fcm_server_key = fcmServerKey;

      const putCommand = new PutCommand({
        TableName: 'admin_profile',
        Item: newItem
      });

      await client.send(putCommand);
      console.log('✅ Created new admin_profile with credentials');
    }

    // Verify the update
    console.log('\n🔍 Verifying update...');
    const verifyResponse = await client.send(getCommand);
    if (verifyResponse.Item) {
      console.log('✅ Verification successful');
      console.log('📋 Available credential fields:');
      if (verifyResponse.Item.google_api_key) {
        console.log(`   ✅ google_api_key: ${verifyResponse.Item.google_api_key.substring(0, 10)}...`);
      } else {
        console.log(`   ❌ google_api_key: NOT SET`);
      }
      if (verifyResponse.Item.sms_api_key) {
        console.log(`   ✅ sms_api_key: SET`);
      } else {
        console.log(`   ❌ sms_api_key: NOT SET`);
      }
      if (verifyResponse.Item.fcm_server_key) {
        console.log(`   ✅ fcm_server_key: SET`);
      } else {
        console.log(`   ❌ fcm_server_key: NOT SET`);
      }
    }

    rl.close();
  } catch (err) {
    console.error('❌ Error updating admin_profile:', err);
    rl.close();
    process.exit(1);
  }
}

// Run the script
updateAdminProfileCredentials()
  .then(() => {
    console.log('\n✅ Script completed successfully');
    process.exit(0);
  })
  .catch((err) => {
    console.error('❌ Script failed:', err);
    process.exit(1);
  });


