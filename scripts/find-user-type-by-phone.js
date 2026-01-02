/**
 * Script to find user_type of a user with vendor_app by phone number
 * Usage: node scripts/find-user-type-by-phone.js <phone_number>
 * Example: node scripts/find-user-type-by-phone.js 9074135121
 */

require('dotenv').config();
const User = require('../models/User');
const { getDynamoDBClient } = require('../config/dynamodb');
const { ScanCommand } = require('@aws-sdk/lib-dynamodb');

const phoneNumber = process.argv[2] || '9074135121';

if (!phoneNumber) {
  console.error('❌ Please provide a phone number');
  console.log('Usage: node scripts/find-user-type-by-phone.js <phone_number>');
  process.exit(1);
}

async function findUserType() {
  try {
    console.log(`🔍 Searching for user with phone: ${phoneNumber} and app_type: vendor_app\n`);
    
    const client = getDynamoDBClient();
    const mobileValue = parseInt(phoneNumber);
    
    let lastKey = null;
    const allUsers = [];
    
    // Scan for all users with this phone number and vendor_app
    do {
      const params = {
        TableName: 'users',
        FilterExpression: 'mob_num = :mobile AND app_type = :appType AND (attribute_not_exists(del_status) OR del_status <> :deleted)',
        ExpressionAttributeValues: {
          ':mobile': mobileValue,
          ':appType': 'vendor_app',
          ':deleted': 2
        }
      };
      
      if (lastKey) {
        params.ExclusiveStartKey = lastKey;
      }
      
      const command = new ScanCommand(params);
      const response = await client.send(command);
      
      if (response.Items && response.Items.length > 0) {
        allUsers.push(...response.Items);
      }
      
      lastKey = response.LastEvaluatedKey;
    } while (lastKey);
    
    if (allUsers.length === 0) {
      console.log(`❌ No vendor_app users found with phone number ${phoneNumber}`);
      console.log('\n💡 Trying to find any users with this phone number...\n');
      
      // Try without app_type filter
      lastKey = null;
      do {
        const params = {
          TableName: 'users',
          FilterExpression: 'mob_num = :mobile AND (attribute_not_exists(del_status) OR del_status <> :deleted)',
          ExpressionAttributeValues: {
            ':mobile': mobileValue,
            ':deleted': 2
          }
        };
        
        if (lastKey) {
          params.ExclusiveStartKey = lastKey;
        }
        
        const command = new ScanCommand(params);
        const response = await client.send(command);
        
        if (response.Items && response.Items.length > 0) {
          allUsers.push(...response.Items);
        }
        
        lastKey = response.LastEvaluatedKey;
      } while (lastKey);
      
      if (allUsers.length === 0) {
        console.log(`❌ No users found with phone number ${phoneNumber}`);
        return;
      }
      
      console.log(`⚠️  Found ${allUsers.length} user(s) with phone ${phoneNumber}, but none with app_type='vendor_app':\n`);
      allUsers.forEach((user, index) => {
        console.log(`User ${index + 1}:`);
        console.log(`  ID: ${user.id}`);
        console.log(`  Name: ${user.name || 'N/A'}`);
        console.log(`  user_type: ${user.user_type || 'N/A'}`);
        console.log(`  app_type: ${user.app_type || 'N/A'}`);
        console.log(`  app_version: ${user.app_version || 'N/A'}`);
        console.log(`  del_status: ${user.del_status || 'N/A'}`);
        console.log('');
      });
      return;
    }
    
    console.log(`✅ Found ${allUsers.length} vendor_app user(s) with phone number ${phoneNumber}\n`);
    
    allUsers.forEach((user, index) => {
      console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
      console.log(`User ${index + 1}:`);
      console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
      console.log(`  ID: ${user.id}`);
      console.log(`  Name: ${user.name || 'N/A'}`);
      console.log(`  Email: ${user.email || 'N/A'}`);
      console.log(`  Phone: ${user.mob_num || 'N/A'}`);
      console.log(`  user_type: ${user.user_type || 'N/A'} ⭐`);
      console.log(`  app_type: ${user.app_type || 'N/A'}`);
      console.log(`  app_version: ${user.app_version || 'v1'}`);
      console.log(`  del_status: ${user.del_status || 1}`);
      console.log(`  Created: ${user.created_at || 'N/A'}`);
      console.log(`  Updated: ${user.updated_at || 'N/A'}`);
      console.log('');
    });
    
    // Summary
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📊 SUMMARY:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    const vendorAppUsers = allUsers.filter(u => u.app_type === 'vendor_app');
    if (vendorAppUsers.length > 0) {
      console.log(`\n✅ User Type(s) for vendor_app users with phone ${phoneNumber}:`);
      vendorAppUsers.forEach(user => {
        console.log(`   • User ID ${user.id}: user_type = "${user.user_type}"`);
      });
    } else {
      console.log(`\n❌ No vendor_app users found with phone ${phoneNumber}`);
    }
    console.log('');
    
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

findUserType();


