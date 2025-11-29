#!/usr/bin/env node
/**
 * Script to test login functionality and debug issues
 */

require('dotenv').config();
const { loadEnvFromFile } = require('../utils/loadEnv');
loadEnvFromFile();

const User = require('../models/User');
const bcrypt = require('bcryptjs');
const { getDynamoDBClient } = require('../config/dynamodb');
const { GetCommand, ScanCommand } = require('@aws-sdk/lib-dynamodb');

const ADMIN_EMAIL = 'scrap@admin.in';
const ADMIN_PASSWORD = '123';

async function testLogin() {
  try {
    console.log('🧪 Testing login functionality...\n');

    // Step 1: Check if user exists by email
    console.log('1️⃣ Searching for user by email:', ADMIN_EMAIL);
    const user = await User.findByEmail(ADMIN_EMAIL);
    
    if (!user) {
      console.log('❌ User not found by email!');
      console.log('\n🔍 Checking all users in DynamoDB...');
      
      const client = getDynamoDBClient();
      const scanCommand = new ScanCommand({
        TableName: 'users',
        Limit: 10
      });
      
      const response = await client.send(scanCommand);
      console.log(`\n   Found ${response.Items?.length || 0} users in table:`);
      
      if (response.Items && response.Items.length > 0) {
        response.Items.forEach(u => {
          console.log(`   - ID: ${u.id}, Email: ${u.email}, Name: ${u.name}, Type: ${u.user_type}`);
        });
      } else {
        console.log('   ⚠️  No users found in DynamoDB!');
      }
      
      return;
    }

    console.log('✅ User found:', {
      id: user.id,
      email: user.email,
      name: user.name,
      user_type: user.user_type
    });

    // Step 2: Check user_type
    console.log(`\n2️⃣ Checking user_type: ${user.user_type}`);
    if (user.user_type !== 'A' && user.user_type !== 'U') {
      console.log(`❌ User type '${user.user_type}' is not allowed for admin login!`);
      console.log('   Allowed types: "A" (Admin) or "U" (User)');
      return;
    }
    console.log('✅ User type is allowed');

    // Step 3: Get full user with password
    console.log('\n3️⃣ Retrieving full user data with password...');
    const client = getDynamoDBClient();
    const getCommand = new GetCommand({
      TableName: 'users',
      Key: { id: user.id }
    });
    
    const fullUserResponse = await client.send(getCommand);
    const fullUser = fullUserResponse.Item;

    if (!fullUser) {
      console.log('❌ Full user data not found!');
      return;
    }

    console.log('✅ Full user data retrieved');
    console.log('   Has password:', !!fullUser.password);

    if (!fullUser.password) {
      console.log('❌ User has no password set!');
      return;
    }

    // Step 4: Verify password
    console.log(`\n4️⃣ Verifying password for: ${ADMIN_EMAIL}`);
    console.log('   Password hash:', fullUser.password.substring(0, 30) + '...');
    
    const isValidPassword = await bcrypt.compare(ADMIN_PASSWORD, fullUser.password);
    
    if (!isValidPassword) {
      console.log('❌ Password verification failed!');
      console.log('\n🔍 Debugging password hash...');
      console.log('   Hash format:', fullUser.password.substring(0, 7));
      console.log('   Hash length:', fullUser.password.length);
      
      // Try to verify with different possible passwords
      const testPasswords = ['123', '123 ', ' 123', ' 123 ', ADMIN_PASSWORD];
      console.log('\n   Testing different password variations:');
      for (const testPwd of testPasswords) {
        const result = await bcrypt.compare(testPwd, fullUser.password);
        console.log(`   "${testPwd}": ${result ? '✅ MATCH' : '❌'}`);
      }
      
      return;
    }

    console.log('✅ Password verified successfully!');
    
    // Step 5: Final summary
    console.log('\n✅ Login test passed!');
    console.log('\n📋 Summary:');
    console.log(`   Email: ${fullUser.email}`);
    console.log(`   Name: ${fullUser.name}`);
    console.log(`   ID: ${fullUser.id}`);
    console.log(`   User Type: ${fullUser.user_type}`);
    console.log(`   Password: Verified ✅`);
    
  } catch (error) {
    console.error('\n❌ Error during login test:', error.message);
    console.error('Stack:', error.stack);
    
    if (error.name === 'ResourceNotFoundException') {
      console.error('\n⚠️  DynamoDB table "users" does not exist!');
      console.error('   Please create the table first.');
    } else if (error.name === 'UnrecognizedClientException' || error.name === 'InvalidSignatureException') {
      console.error('\n⚠️  AWS credentials issue!');
      console.error('   Please check your AWS credentials in aws.txt or environment variables.');
    }
  }
}

// Run the test
testLogin().then(() => {
  console.log('\n✅ Test completed!');
  process.exit(0);
}).catch((error) => {
  console.error('\n❌ Test failed:', error);
  process.exit(1);
});

