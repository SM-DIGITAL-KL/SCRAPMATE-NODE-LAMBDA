/**
 * Script to count v1 users in the database
 * Usage: node scripts/count-v1-users.js
 */

require('dotenv').config();
const { getDynamoDBClient } = require('../config/dynamodb');
const { ScanCommand } = require('@aws-sdk/lib-dynamodb');
const { getTableName, getEnvironment } = require('../utils/dynamodbTableNames');

async function countV1Users() {
  try {
    const environment = getEnvironment();
    const USER_TABLE = getTableName('users');
    
    console.log('\n📊 Counting v1 Users in Database');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`   Environment: ${environment}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    
    const client = getDynamoDBClient();
    let lastKey = null;
    const allUsers = [];
    
    console.log('🔍 Scanning all users...');
    
    do {
      const params = {
        TableName: USER_TABLE,
        FilterExpression: '(attribute_not_exists(del_status) OR del_status <> :deleted)',
        ExpressionAttributeValues: {
          ':deleted': 2
        }
      };
      
      if (lastKey) {
        params.ExclusiveStartKey = lastKey;
      }
      
      const command = new ScanCommand(params);
      const response = await client.send(command);
      
      if (response.Items) {
        allUsers.push(...response.Items);
      }
      
      lastKey = response.LastEvaluatedKey;
    } while (lastKey);
    
    console.log(`✅ Found ${allUsers.length} total active user(s)\n`);
    
    // Categorize users
    const v1Users = [];
    const v2Users = [];
    const unknownUsers = [];
    
    // Breakdown by app_type
    const vendorAppUsers = [];
    const customerAppUsers = [];
    const noAppTypeUsers = [];
    
    // Breakdown by user_type
    const userTypeBreakdown = {};
    
    for (const user of allUsers) {
      // Categorize by app_version
      if (!user.app_version || user.app_version === 'v1') {
        v1Users.push(user);
      } else if (user.app_version === 'v2') {
        v2Users.push(user);
      } else {
        unknownUsers.push(user);
      }
      
      // Categorize by app_type
      if (user.app_type === 'vendor_app') {
        vendorAppUsers.push(user);
      } else if (user.app_type === 'customer_app') {
        customerAppUsers.push(user);
      } else {
        noAppTypeUsers.push(user);
      }
      
      // Count by user_type
      const userType = user.user_type || 'N/A';
      userTypeBreakdown[userType] = (userTypeBreakdown[userType] || 0) + 1;
    }
    
    // v1 users breakdown
    const v1VendorApp = v1Users.filter(u => u.app_type === 'vendor_app').length;
    const v1CustomerApp = v1Users.filter(u => u.app_type === 'customer_app').length;
    const v1NoAppType = v1Users.filter(u => !u.app_type).length;
    
    const v1WithFcmToken = v1Users.filter(u => u.fcm_token).length;
    const v1WithoutFcmToken = v1Users.length - v1WithFcmToken;
    
    // v1 user type breakdown
    const v1UserTypeBreakdown = {};
    v1Users.forEach(user => {
      const userType = user.user_type || 'N/A';
      v1UserTypeBreakdown[userType] = (v1UserTypeBreakdown[userType] || 0) + 1;
    });
    
    // Print results
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📊 OVERALL STATISTICS');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`Total Active Users: ${allUsers.length}`);
    console.log(`   - v1 Users: ${v1Users.length}`);
    console.log(`   - v2 Users: ${v2Users.length}`);
    if (unknownUsers.length > 0) {
      console.log(`   - Unknown Version: ${unknownUsers.length}`);
    }
    console.log('');
    
    console.log('📱 App Type Breakdown:');
    console.log(`   - vendor_app: ${vendorAppUsers.length}`);
    console.log(`   - customer_app: ${customerAppUsers.length}`);
    console.log(`   - No app_type: ${noAppTypeUsers.length}`);
    console.log('');
    
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📊 v1 USERS DETAILED BREAKDOWN');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`Total v1 Users: ${v1Users.length}`);
    console.log('');
    console.log('App Type Breakdown:');
    console.log(`   - vendor_app: ${v1VendorApp}`);
    console.log(`   - customer_app: ${v1CustomerApp}`);
    console.log(`   - No app_type: ${v1NoAppType}`);
    console.log('');
    console.log('FCM Token Status:');
    console.log(`   - With FCM Token: ${v1WithFcmToken}`);
    console.log(`   - Without FCM Token: ${v1WithoutFcmToken}`);
    console.log('');
    console.log('User Type Breakdown:');
    Object.entries(v1UserTypeBreakdown)
      .sort((a, b) => b[1] - a[1])
      .forEach(([type, count]) => {
        console.log(`   - Type ${type}: ${count}`);
      });
    console.log('');
    
    // v1 vendor_app users with target user types
    const targetUserTypes = ['N', 'S', 'R', 'SR', 'C'];
    const v1VendorAppTarget = v1Users.filter(u => 
      u.app_type === 'vendor_app' && 
      targetUserTypes.includes(u.user_type)
    );
    const v1VendorAppTargetWithFcm = v1VendorAppTarget.filter(u => u.fcm_token).length;
    
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🎯 v1 VENDOR_APP USERS (Target Types: N, S, R, SR, C)');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`Total: ${v1VendorAppTarget.length}`);
    console.log(`With FCM Token: ${v1VendorAppTargetWithFcm}`);
    console.log(`Without FCM Token: ${v1VendorAppTarget.length - v1VendorAppTargetWithFcm}`);
    console.log('');
    
    // Breakdown by user type for v1 vendor_app target users
    const v1VendorAppTargetTypeBreakdown = {};
    v1VendorAppTarget.forEach(user => {
      const userType = user.user_type || 'N/A';
      v1VendorAppTargetTypeBreakdown[userType] = (v1VendorAppTargetTypeBreakdown[userType] || 0) + 1;
    });
    
    console.log('User Type Breakdown:');
    Object.entries(v1VendorAppTargetTypeBreakdown)
      .sort((a, b) => b[1] - a[1])
      .forEach(([type, count]) => {
        console.log(`   - Type ${type}: ${count}`);
      });
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    
  } catch (error) {
    console.error('\n❌ Error occurred:');
    console.error(`   Error: ${error.message}`);
    if (error.stack) {
      console.error(`   Stack: ${error.stack}`);
    }
    process.exit(1);
  }
}

// Run the script
countV1Users()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Script failed:', error);
    process.exit(1);
  });












