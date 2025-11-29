#!/usr/bin/env node
/**
 * Script to ensure admin user exists in DynamoDB
 * This will check if scrap@admin.in exists and create/update it if needed
 */

require('dotenv').config();
const { loadEnvFromFile } = require('../utils/loadEnv');
loadEnvFromFile();

const User = require('../models/User');
const bcrypt = require('bcryptjs');
const { getDynamoDBClient } = require('../config/dynamodb');
const { GetCommand, PutCommand, ScanCommand } = require('@aws-sdk/lib-dynamodb');

const ADMIN_EMAIL = 'scrap@admin.in';
const ADMIN_PASSWORD = '123';
const ADMIN_NAME = 'super';
const ADMIN_USER_TYPE = 'A';
const ADMIN_ID = 1;

async function ensureAdminUser() {
  try {
    console.log('🔍 Checking for admin user in DynamoDB...');
    const client = getDynamoDBClient();

    // First, try to find user by email
    console.log(`\n1️⃣ Searching for user with email: ${ADMIN_EMAIL}`);
    let user = await User.findByEmail(ADMIN_EMAIL);
    
    if (user) {
      console.log('✅ User found by email:', {
        id: user.id,
        email: user.email,
        name: user.name,
        user_type: user.user_type
      });

      // Check if password exists and is correct
      const getCommand = new GetCommand({
        TableName: 'users',
        Key: { id: user.id }
      });
      
      const fullUserResponse = await client.send(getCommand);
      const fullUser = fullUserResponse.Item;

      if (fullUser && fullUser.password) {
        console.log('\n2️⃣ Verifying password...');
        const isValidPassword = await bcrypt.compare(ADMIN_PASSWORD, fullUser.password);
        
        if (isValidPassword) {
          console.log('✅ Password is correct!');
          
          // Check user_type
          if (fullUser.user_type !== 'A' && fullUser.user_type !== 'U') {
            console.log(`⚠️  Warning: User type is '${fullUser.user_type}' but should be 'A' or 'U' for admin login`);
            console.log('   Updating user_type to "A"...');
            
            const { UpdateCommand } = require('@aws-sdk/lib-dynamodb');
            const updateCommand = new UpdateCommand({
              TableName: 'users',
              Key: { id: user.id },
              UpdateExpression: 'SET user_type = :type, updated_at = :updated',
              ExpressionAttributeValues: {
                ':type': 'A',
                ':updated': new Date().toISOString()
              }
            });
            await client.send(updateCommand);
            console.log('✅ User type updated to "A"');
          } else {
            console.log('✅ User type is correct');
          }
          
          console.log('\n✅ Admin user exists and password is correct!');
          return;
        } else {
          console.log('❌ Password verification failed');
          console.log('   Updating password...');
        }
      } else {
        console.log('⚠️  User exists but has no password');
        console.log('   Adding password...');
      }

      // Update existing user with correct password
      const hashedPassword = await bcrypt.hash(ADMIN_PASSWORD, 10);
      const { UpdateCommand } = require('@aws-sdk/lib-dynamodb');
      const updateCommand = new UpdateCommand({
        TableName: 'users',
        Key: { id: user.id },
        UpdateExpression: 'SET password = :password, user_type = :type, updated_at = :updated',
        ExpressionAttributeValues: {
          ':password': hashedPassword,
          ':type': ADMIN_USER_TYPE,
          ':updated': new Date().toISOString()
        }
      });
      await client.send(updateCommand);
      console.log('✅ User password and type updated!');
      
    } else {
      console.log('❌ User not found by email');
      console.log(`\n2️⃣ Checking if user with ID ${ADMIN_ID} exists...`);
      
      // Check if user with ID exists
      const getCommand = new GetCommand({
        TableName: 'users',
        Key: { id: ADMIN_ID }
      });
      
      const existingUserResponse = await client.send(getCommand);
      if (existingUserResponse.Item) {
        console.log('⚠️  User with ID exists but email mismatch');
        console.log('   Existing user:', existingUserResponse.Item);
        
        // Update the existing user
        const hashedPassword = await bcrypt.hash(ADMIN_PASSWORD, 10);
        const { UpdateCommand } = require('@aws-sdk/lib-dynamodb');
        const updateCommand = new UpdateCommand({
          TableName: 'users',
          Key: { id: ADMIN_ID },
          UpdateExpression: 'SET email = :email, name = :name, user_type = :type, password = :password, updated_at = :updated',
          ExpressionAttributeValues: {
            ':email': ADMIN_EMAIL,
            ':name': ADMIN_NAME,
            ':type': ADMIN_USER_TYPE,
            ':password': hashedPassword,
            ':updated': new Date().toISOString()
          }
        });
        await client.send(updateCommand);
        console.log('✅ User updated with correct email and password!');
      } else {
        console.log(`\n3️⃣ Creating new admin user...`);
        
        // Create new user
        const hashedPassword = await bcrypt.hash(ADMIN_PASSWORD, 10);
        const newUser = {
          id: ADMIN_ID,
          email: ADMIN_EMAIL,
          name: ADMIN_NAME,
          user_type: ADMIN_USER_TYPE,
          mob_num: 123,
          password: hashedPassword,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        };

        const putCommand = new PutCommand({
          TableName: 'users',
          Item: newUser
        });
        
        await client.send(putCommand);
        console.log('✅ Admin user created successfully!');
        console.log('   User details:', {
          id: newUser.id,
          email: newUser.email,
          name: newUser.name,
          user_type: newUser.user_type
        });
      }
    }

    // Verify the user can be found and logged in
    console.log('\n4️⃣ Verifying login...');
    const verifyUser = await User.findByEmail(ADMIN_EMAIL);
    if (!verifyUser) {
      throw new Error('User not found after creation!');
    }

    const verifyFullUser = await client.send(new GetCommand({
      TableName: 'users',
      Key: { id: verifyUser.id }
    }));

    const passwordMatch = await bcrypt.compare(ADMIN_PASSWORD, verifyFullUser.Item.password);
    if (!passwordMatch) {
      throw new Error('Password verification failed after creation!');
    }

    console.log('✅ Login verification successful!');
    console.log('\n📋 Summary:');
    console.log(`   Email: ${ADMIN_EMAIL}`);
    console.log(`   Password: ${ADMIN_PASSWORD}`);
    console.log(`   User Type: ${verifyFullUser.Item.user_type}`);
    console.log(`   ID: ${verifyFullUser.Item.id}`);

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    console.error('Stack:', error.stack);
    process.exit(1);
  }
}

// Run the script
ensureAdminUser().then(() => {
  console.log('\n✅ Script completed successfully!');
  process.exit(0);
}).catch((error) => {
  console.error('\n❌ Script failed:', error);
  process.exit(1);
});

