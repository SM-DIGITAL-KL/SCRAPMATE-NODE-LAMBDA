/**
 * Script to query DynamoDB for a user by email
 * Usage: node scripts/query-user-by-email.js <email>
 */

require('dotenv').config();
const { getDynamoDBClient } = require('../config/dynamodb');
const { ScanCommand } = require('@aws-sdk/lib-dynamodb');

const TABLE_NAME = 'users';

async function findUserByEmail(email) {
  try {
    const client = getDynamoDBClient();
    
    console.log(`\n🔍 Searching for user with email: ${email}\n`);
    
    // Scan with filter for email
    const params = {
      TableName: TABLE_NAME,
      FilterExpression: 'email = :email',
      ExpressionAttributeValues: {
        ':email': email
      }
    };
    
    const command = new ScanCommand(params);
    const response = await client.send(command);
    
    if (response.Items && response.Items.length > 0) {
      console.log(`✅ Found ${response.Items.length} user(s) with email: ${email}\n`);
      
      response.Items.forEach((user, index) => {
        console.log(`User ${index + 1}:`);
        console.log('─'.repeat(50));
        console.log(`ID: ${user.id}`);
        console.log(`Name: ${user.name || 'N/A'}`);
        console.log(`Email: ${user.email || 'N/A'}`);
        console.log(`Phone: ${user.mob_num || 'N/A'}`);
        console.log(`User Type: ${user.user_type || 'N/A'}`);
        console.log(`App Type: ${user.app_type || 'N/A'}`);
        console.log(`App Version: ${user.app_version || 'N/A'}`);
        console.log(`Del Status: ${user.del_status || 'N/A'}`);
        console.log(`Created At: ${user.created_at || 'N/A'}`);
        console.log(`Updated At: ${user.updated_at || 'N/A'}`);
        console.log('─'.repeat(50));
        console.log('');
      });
      
      // Return the first user (or all users)
      return response.Items;
    } else {
      console.log('❌ No user found with email:', email);
      return null;
    }
  } catch (error) {
    console.error('❌ Error querying DynamoDB:', error);
    throw error;
  }
}

// Get email from command line argument
const email = process.argv[2] || 'mrshishijo@gmail.com';

if (!email) {
  console.error('❌ Please provide an email as an argument');
  console.log('Usage: node scripts/query-user-by-email.js <email>');
  process.exit(1);
}

// Run the query
findUserByEmail(email)
  .then((users) => {
    if (users && users.length > 0) {
      console.log(`\n✅ Found ${users.length} user(s) with email: ${email}\n`);
      process.exit(0);
    } else {
      process.exit(1);
    }
  })
  .catch((error) => {
    console.error('Script failed:', error);
    process.exit(1);
  });

