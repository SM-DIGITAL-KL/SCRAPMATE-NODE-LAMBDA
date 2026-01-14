/**
 * Script to find all v2 users with user_type 'N' and 'D' and their mobile numbers
 * Usage: node scripts/find-v2-users-by-type-nd.js
 */

require('dotenv').config();
const { getDynamoDBClient } = require('../config/dynamodb');
const { ScanCommand } = require('@aws-sdk/lib-dynamodb');
const { getTableName, getEnvironment } = require('../utils/dynamodbTableNames');

async function findV2UsersByTypeND() {
  try {
    const environment = getEnvironment();
    const USER_TABLE = getTableName('users');
    
    console.log('\n🔍 Finding all v2 users with user_type = "N" and "D"');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`   Environment: ${environment}`);
    console.log(`   Table: ${USER_TABLE}`);
    console.log(`   Filter: app_version = "v2" AND (user_type = "N" OR user_type = "D")`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    
    const client = getDynamoDBClient();
    let lastKey = null;
    const usersN = []; // Users with user_type = 'N'
    const usersD = []; // Users with user_type = 'D'
    
    // Scan all users and filter for v2 users with user_type 'N' or 'D'
    do {
      const params = {
        TableName: USER_TABLE,
        FilterExpression: 'app_version = :v2 AND (user_type = :typeN OR user_type = :typeD) AND (attribute_not_exists(del_status) OR del_status <> :deleted)',
        ExpressionAttributeValues: {
          ':v2': 'v2',
          ':typeN': 'N',
          ':typeD': 'D',
          ':deleted': 2
        }
      };
      
      if (lastKey) {
        params.ExclusiveStartKey = lastKey;
      }
      
      const command = new ScanCommand(params);
      const response = await client.send(command);
      
      if (response.Items) {
        response.Items.forEach(user => {
          if (user.user_type === 'N') {
            usersN.push(user);
          } else if (user.user_type === 'D') {
            usersD.push(user);
          }
        });
      }
      
      lastKey = response.LastEvaluatedKey;
    } while (lastKey);
    
    console.log(`✅ Found ${usersN.length} v2 user(s) with user_type = 'N'`);
    console.log(`✅ Found ${usersD.length} v2 user(s) with user_type = 'D'`);
    console.log(`✅ Total: ${usersN.length + usersD.length} v2 user(s)\n`);
    
    // Display users with user_type 'N'
    if (usersN.length > 0) {
      console.log('━'.repeat(100));
      console.log(`📋 Users with user_type = "N" (v2): ${usersN.length}`);
      console.log('━'.repeat(100));
      
      usersN.forEach((user, index) => {
        console.log(`\n${index + 1}. User ID: ${user.id}`);
        console.log(`   Mobile: ${user.mob_num || 'N/A'}`);
        console.log(`   Name: ${user.name || 'N/A'}`);
        console.log(`   Email: ${user.email || 'N/A'}`);
        console.log(`   App Type: ${user.app_type || 'N/A'}`);
        console.log(`   App Version: ${user.app_version || 'N/A'}`);
        console.log(`   Created At: ${user.created_at || 'N/A'}`);
      });
      
      console.log('\n📱 Mobile Numbers (user_type = "N", v2):');
      console.log('━'.repeat(100));
      const mobileNumbersN = usersN
        .map(user => user.mob_num)
        .filter(mob => mob)
        .sort((a, b) => a - b); // Sort numerically
      
      mobileNumbersN.forEach((mobile, index) => {
        console.log(`${index + 1}. ${mobile}`);
      });
      
      // Also output as comma-separated for easy copy
      console.log('\n📋 Comma-separated list (user_type = "N", v2):');
      console.log(mobileNumbersN.join(', '));
    } else {
      console.log('\n❌ No v2 users found with user_type = "N"');
    }
    
    // Display users with user_type 'D'
    if (usersD.length > 0) {
      console.log('\n' + '━'.repeat(100));
      console.log(`📋 Users with user_type = "D" (v2): ${usersD.length}`);
      console.log('━'.repeat(100));
      
      usersD.forEach((user, index) => {
        console.log(`\n${index + 1}. User ID: ${user.id}`);
        console.log(`   Mobile: ${user.mob_num || 'N/A'}`);
        console.log(`   Name: ${user.name || 'N/A'}`);
        console.log(`   Email: ${user.email || 'N/A'}`);
        console.log(`   App Type: ${user.app_type || 'N/A'}`);
        console.log(`   App Version: ${user.app_version || 'N/A'}`);
        console.log(`   Created At: ${user.created_at || 'N/A'}`);
      });
      
      console.log('\n📱 Mobile Numbers (user_type = "D", v2):');
      console.log('━'.repeat(100));
      const mobileNumbersD = usersD
        .map(user => user.mob_num)
        .filter(mob => mob)
        .sort((a, b) => a - b); // Sort numerically
      
      mobileNumbersD.forEach((mobile, index) => {
        console.log(`${index + 1}. ${mobile}`);
      });
      
      // Also output as comma-separated for easy copy
      console.log('\n📋 Comma-separated list (user_type = "D", v2):');
      console.log(mobileNumbersD.join(', '));
    } else {
      console.log('\n❌ No v2 users found with user_type = "D"');
    }
    
    // Summary Statistics
    console.log('\n' + '━'.repeat(100));
    console.log('📊 Summary Statistics:');
    console.log('━'.repeat(100));
    
    console.log(`\nTotal v2 users with user_type = 'N': ${usersN.length}`);
    console.log(`Total v2 users with user_type = 'D': ${usersD.length}`);
    console.log(`Grand Total: ${usersN.length + usersD.length}`);
    
    // Count by app_type for 'N' users
    if (usersN.length > 0) {
      const appTypeStatsN = {};
      usersN.forEach(user => {
        const appType = user.app_type || 'N/A';
        appTypeStatsN[appType] = (appTypeStatsN[appType] || 0) + 1;
      });
      
      console.log('\nBy App Type (user_type = "N"):');
      Object.entries(appTypeStatsN).forEach(([appType, count]) => {
        console.log(`   ${appType}: ${count}`);
      });
    }
    
    // Count by app_type for 'D' users
    if (usersD.length > 0) {
      const appTypeStatsD = {};
      usersD.forEach(user => {
        const appType = user.app_type || 'N/A';
        appTypeStatsD[appType] = (appTypeStatsD[appType] || 0) + 1;
      });
      
      console.log('\nBy App Type (user_type = "D"):');
      Object.entries(appTypeStatsD).forEach(([appType, count]) => {
        console.log(`   ${appType}: ${count}`);
      });
    }
    
    // FCM Token Statistics
    const withFcmTokenN = usersN.filter(user => user.fcm_token).length;
    const withFcmTokenD = usersD.filter(user => user.fcm_token).length;
    
    console.log('\nFCM Token Status:');
    console.log(`   user_type = "N": ${withFcmTokenN} with FCM token, ${usersN.length - withFcmTokenN} without`);
    console.log(`   user_type = "D": ${withFcmTokenD} with FCM token, ${usersD.length - withFcmTokenD} without`);
    
    // Output all mobile numbers combined
    const allMobileNumbers = [
      ...usersN.map(u => ({ mobile: u.mob_num, type: 'N', userId: u.id })),
      ...usersD.map(u => ({ mobile: u.mob_num, type: 'D', userId: u.id }))
    ].filter(item => item.mobile)
      .sort((a, b) => a.mobile - b.mobile);
    
    if (allMobileNumbers.length > 0) {
      console.log('\n' + '━'.repeat(100));
      console.log('📱 All Mobile Numbers (Combined, sorted):');
      console.log('━'.repeat(100));
      allMobileNumbers.forEach((item, index) => {
        console.log(`${index + 1}. ${item.mobile} (user_type: ${item.type}, user_id: ${item.userId})`);
      });
      
      console.log('\n📋 Comma-separated list (All):');
      console.log(allMobileNumbers.map(item => item.mobile).join(', '));
    }
    
    console.log('\n' + '━'.repeat(100));
    console.log(`\n✅ Script completed successfully!\n`);
    
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

findV2UsersByTypeND();



