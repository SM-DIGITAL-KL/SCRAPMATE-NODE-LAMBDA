/**
 * Script to count users with user_type 'R' from production database
 * 
 * Usage: node scripts/count-r-users-production.js
 */

require('dotenv').config();
const User = require('../models/User');
const { getDynamoDBClient } = require('../config/dynamodb');
const { ScanCommand } = require('@aws-sdk/lib-dynamodb');

async function countRUsers() {
  try {
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🔍 Counting Users with user_type "R"');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('');
    
    // Method 1: Use the User model's countByUserType method
    console.log('📊 Method 1: Using User.countByUserType("R")...');
    try {
      const count = await User.countByUserType('R');
      console.log(`✅ Total users with user_type 'R': ${count}`);
      console.log('');
    } catch (err) {
      console.error('❌ Error using User.countByUserType:', err.message);
      console.log('');
    }
    
    // Method 2: Direct DynamoDB scan for more details
    console.log('📊 Method 2: Direct DynamoDB scan for detailed breakdown...');
    const client = getDynamoDBClient();
    
    let totalRUsers = 0;
    let rUsersWithAppType = {
      vendor_app: 0,
      customer_app: 0,
      no_app_type: 0
    };
    let rUsersByAppVersion = {
      v1: 0,
      v2: 0,
      other: 0,
      no_version: 0
    };
    let rUsersByDelStatus = {
      active: 0,
      deleted: 0,
      unknown: 0
    };
    
    let lastKey = null;
    let scannedCount = 0;
    
    do {
      const params = {
        TableName: 'users',
        FilterExpression: 'user_type = :userType',
        ExpressionAttributeValues: {
          ':userType': 'R'
        }
      };
      if (lastKey) params.ExclusiveStartKey = lastKey;
      
      const command = new ScanCommand(params);
      const response = await client.send(command);
      
      if (response.Items) {
        scannedCount += response.Items.length;
        totalRUsers += response.Items.length;
        
        response.Items.forEach(user => {
          // Count by app_type
          if (user.app_type === 'vendor_app') {
            rUsersWithAppType.vendor_app++;
          } else if (user.app_type === 'customer_app') {
            rUsersWithAppType.customer_app++;
          } else {
            rUsersWithAppType.no_app_type++;
          }
          
          // Count by app_version
          if (user.app_version === 'v1') {
            rUsersByAppVersion.v1++;
          } else if (user.app_version === 'v2') {
            rUsersByAppVersion.v2++;
          } else if (user.app_version) {
            rUsersByAppVersion.other++;
          } else {
            rUsersByAppVersion.no_version++;
          }
          
          // Count by del_status
          if (!user.del_status || user.del_status === 0 || user.del_status === 1) {
            rUsersByDelStatus.active++;
          } else if (user.del_status === 2) {
            rUsersByDelStatus.deleted++;
          } else {
            rUsersByDelStatus.unknown++;
          }
        });
      }
      
      lastKey = response.LastEvaluatedKey;
      if (lastKey) {
        console.log(`   Scanned ${scannedCount} users so far...`);
      }
    } while (lastKey);
    
    console.log('');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📊 Detailed Breakdown');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`Total users with user_type 'R': ${totalRUsers}`);
    console.log('');
    
    console.log('📱 By App Type:');
    console.log(`   vendor_app: ${rUsersWithAppType.vendor_app}`);
    console.log(`   customer_app: ${rUsersWithAppType.customer_app}`);
    console.log(`   no app_type: ${rUsersWithAppType.no_app_type}`);
    console.log('');
    
    console.log('🔢 By App Version:');
    console.log(`   v1: ${rUsersByAppVersion.v1}`);
    console.log(`   v2: ${rUsersByAppVersion.v2}`);
    console.log(`   other: ${rUsersByAppVersion.other}`);
    console.log(`   no version: ${rUsersByAppVersion.no_version}`);
    console.log('');
    
    console.log('🗑️  By Deletion Status:');
    console.log(`   Active (not deleted): ${rUsersByDelStatus.active}`);
    console.log(`   Deleted: ${rUsersByDelStatus.deleted}`);
    console.log(`   Unknown: ${rUsersByDelStatus.unknown}`);
    console.log('');
    
    // Count active R users (not deleted)
    const activeRUsers = rUsersByDelStatus.active;
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('✅ Summary');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`Total R users: ${totalRUsers}`);
    console.log(`Active R users (not deleted): ${activeRUsers}`);
    console.log(`Deleted R users: ${rUsersByDelStatus.deleted}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
  } catch (error) {
    console.error('❌ Error:', error);
    console.error('   Message:', error.message);
    console.error('   Stack:', error.stack);
    process.exit(1);
  }
}

countRUsers();

