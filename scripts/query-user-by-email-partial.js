/**
 * Script to query DynamoDB for users by email (case-insensitive partial match)
 * Usage: node scripts/query-user-by-email-partial.js <email>
 */

require('dotenv').config();
const { getDynamoDBClient } = require('../config/dynamodb');
const { ScanCommand } = require('@aws-sdk/lib-dynamodb');

const TABLE_NAME = 'users';

async function findUserByEmailPartial(email) {
  try {
    const client = getDynamoDBClient();
    
    const emailLower = email.toLowerCase();
    console.log(`\n🔍 Searching for users with email containing: ${email} (case-insensitive)\n`);
    
    // Scan all users and filter in memory (DynamoDB doesn't support case-insensitive search easily)
    const params = {
      TableName: TABLE_NAME,
    };
    
    let allUsers = [];
    let lastKey = null;
    let scanCount = 0;
    
    do {
      scanCount++;
      if (lastKey) {
        params.ExclusiveStartKey = lastKey;
      }
      
      const command = new ScanCommand(params);
      const response = await client.send(command);
      
      if (response.Items) {
        allUsers = allUsers.concat(response.Items);
      }
      
      lastKey = response.LastEvaluatedKey;
      console.log(`   Scanned batch ${scanCount}, found ${response.Items?.length || 0} items...`);
    } while (lastKey);
    
    console.log(`\n   Total users scanned: ${allUsers.length}\n`);
    
    // Filter users by email (case-insensitive)
    const matchingUsers = allUsers.filter(user => {
      if (!user.email) return false;
      return user.email.toLowerCase().includes(emailLower);
    });
    
    if (matchingUsers.length > 0) {
      console.log(`✅ Found ${matchingUsers.length} user(s) with email containing "${email}":\n`);
      
      matchingUsers.forEach((user, index) => {
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
      
      return matchingUsers;
    } else {
      console.log(`❌ No user found with email containing: ${email}`);
      
      // Also check for exact matches with different cases
      const exactMatches = allUsers.filter(user => {
        if (!user.email) return false;
        return user.email.toLowerCase() === emailLower;
      });
      
      if (exactMatches.length === 0) {
        console.log('\n💡 Tip: Checking for users with similar emails...');
        const similarEmails = allUsers
          .filter(user => user.email && user.email.includes('shishijo'))
          .map(user => user.email)
          .filter((email, index, self) => self.indexOf(email) === index)
          .slice(0, 10);
        
        if (similarEmails.length > 0) {
          console.log('\n   Found similar emails:');
          similarEmails.forEach(e => console.log(`   - ${e}`));
        }
      }
      
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
  console.log('Usage: node scripts/query-user-by-email-partial.js <email>');
  process.exit(1);
}

// Run the query
findUserByEmailPartial(email)
  .then((users) => {
    if (users && users.length > 0) {
      console.log(`\n✅ Summary: Found ${users.length} user(s)\n`);
      process.exit(0);
    } else {
      process.exit(1);
    }
  })
  .catch((error) => {
    console.error('Script failed:', error);
    process.exit(1);
  });

