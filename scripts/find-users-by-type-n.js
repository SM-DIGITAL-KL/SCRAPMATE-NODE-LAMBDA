/**
 * Script to find all users with user_type 'N' from the database
 * Usage: node scripts/find-users-by-type-n.js
 */

require('dotenv').config();
const { getDynamoDBClient } = require('../config/dynamodb');
const { ScanCommand } = require('@aws-sdk/lib-dynamodb');
const { getTableName, getEnvironment } = require('../utils/dynamodbTableNames');

async function findUsersByTypeN() {
  try {
    const environment = getEnvironment();
    const USER_TABLE = getTableName('users');
    
    console.log('\n🔍 Finding all users with user_type = "N"');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`   Environment: ${environment}`);
    console.log(`   Table: ${USER_TABLE}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    
    const client = getDynamoDBClient();
    let lastKey = null;
    const users = [];
    
    do {
      const params = {
        TableName: USER_TABLE,
        FilterExpression: 'user_type = :typeN AND (attribute_not_exists(del_status) OR del_status <> :deleted)',
        ExpressionAttributeValues: {
          ':typeN': 'N',
          ':deleted': 2
        }
      };
      
      if (lastKey) {
        params.ExclusiveStartKey = lastKey;
      }
      
      const command = new ScanCommand(params);
      const response = await client.send(command);
      
      if (response.Items) {
        users.push(...response.Items);
      }
      
      lastKey = response.LastEvaluatedKey;
    } while (lastKey);
    
    console.log(`✅ Found ${users.length} user(s) with user_type = 'N'\n`);
    
    if (users.length === 0) {
      console.log('❌ No users found with user_type = "N"');
      return;
    }
    
    // Display list of users
    console.log('📋 List of Users (user_type = "N"):');
    console.log('━'.repeat(100));
    
    users.forEach((user, index) => {
      console.log(`\n${index + 1}. User ID: ${user.id}`);
      console.log(`   Name: ${user.name || 'N/A'}`);
      console.log(`   Email: ${user.email || 'N/A'}`);
      console.log(`   Mobile: ${user.mob_num || 'N/A'}`);
      console.log(`   User Type: ${user.user_type || 'N/A'}`);
      console.log(`   App Type: ${user.app_type || 'N/A'}`);
      console.log(`   App Version: ${user.app_version || 'N/A'}`);
      console.log(`   Del Status: ${user.del_status || 'N/A'}`);
      console.log(`   Created At: ${user.created_at || 'N/A'}`);
      console.log(`   Updated At: ${user.updated_at || 'N/A'}`);
      console.log(`   Has FCM Token: ${user.fcm_token ? 'Yes' : 'No'}`);
    });
    
    // Statistics
    console.log('\n' + '━'.repeat(100));
    console.log('📊 Statistics:');
    console.log('━'.repeat(100));
    
    // Count by app_type
    const appTypeStats = {};
    users.forEach(user => {
      const appType = user.app_type || 'N/A';
      appTypeStats[appType] = (appTypeStats[appType] || 0) + 1;
    });
    
    console.log('\nBy App Type:');
    Object.entries(appTypeStats).forEach(([appType, count]) => {
      console.log(`   ${appType}: ${count}`);
    });
    
    // Count by app_version
    const appVersionStats = {};
    users.forEach(user => {
      const appVersion = user.app_version || 'v1';
      appVersionStats[appVersion] = (appVersionStats[appVersion] || 0) + 1;
    });
    
    console.log('\nBy App Version:');
    Object.entries(appVersionStats).forEach(([appVersion, count]) => {
      console.log(`   ${appVersion}: ${count}`);
    });
    
    // Count with FCM tokens
    const withFcmToken = users.filter(user => user.fcm_token).length;
    const withoutFcmToken = users.length - withFcmToken;
    
    console.log('\nFCM Token Status:');
    console.log(`   With FCM Token: ${withFcmToken}`);
    console.log(`   Without FCM Token: ${withoutFcmToken}`);
    
    // Count by del_status
    const delStatusStats = {};
    users.forEach(user => {
      const delStatus = user.del_status || '1';
      delStatusStats[delStatus] = (delStatusStats[delStatus] || 0) + 1;
    });
    
    console.log('\nBy Del Status:');
    Object.entries(delStatusStats).forEach(([delStatus, count]) => {
      console.log(`   ${delStatus}: ${count}`);
    });
    
    console.log('\n' + '━'.repeat(100));
    console.log(`\n✅ Total users with user_type = 'N': ${users.length}\n`);
    
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Error occurred:');
    console.error(`   Error: ${error.message}`);
    if (error.stack) {
      console.error(`   Stack: ${error.stack}`);
    }
    process.exit(1);
  }
}

findUsersByTypeN();











