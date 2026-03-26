/**
 * Script to create marketplace_post_interests DynamoDB table
 * Usage: node scripts/create-marketplace-post-interests-table.js
 */

require('dotenv').config();
const { getDynamoDBClient } = require('../config/dynamodb');
const { CreateTableCommand, DescribeTableCommand } = require('@aws-sdk/client-dynamodb');

const TABLE_NAME = 'marketplace_post_interests';

async function main() {
  const client = getDynamoDBClient();

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📦 CREATING MARKETPLACE POST INTERESTS TABLE');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  try {
    await client.send(new DescribeTableCommand({ TableName: TABLE_NAME }));
    console.log(`✅ Table "${TABLE_NAME}" already exists.`);
    console.log('   No action needed.\n');
    return;
  } catch (error) {
    if (error.name !== 'ResourceNotFoundException') {
      console.error('❌ Error checking table existence:', error.message);
      throw error;
    }
    console.log(`ℹ️  Table "${TABLE_NAME}" does not exist. Creating it now...\n`);
  }

  const createCommand = new CreateTableCommand({
    TableName: TABLE_NAME,
    KeySchema: [{ AttributeName: 'id', KeyType: 'HASH' }],
    AttributeDefinitions: [
      { AttributeName: 'id', AttributeType: 'S' },
      { AttributeName: 'user_id', AttributeType: 'N' },
    ],
    GlobalSecondaryIndexes: [
      {
        IndexName: 'user_id-index',
        KeySchema: [{ AttributeName: 'user_id', KeyType: 'HASH' }],
        Projection: { ProjectionType: 'ALL' },
      },
    ],
    BillingMode: 'PAY_PER_REQUEST',
  });

  try {
    console.log(`Creating table "${TABLE_NAME}" with GSI "user_id-index"...`);
    await client.send(createCommand);
    console.log(`✅ Table "${TABLE_NAME}" created successfully.`);
    console.log('   Table and GSI will become ACTIVE shortly.\n');
  } catch (error) {
    if (error.name === 'ResourceInUseException') {
      console.log(`✅ Table "${TABLE_NAME}" already exists.`);
      return;
    }
    console.error('❌ Error creating table:', error.message);
    throw error;
  }
}

main().catch((error) => {
  console.error('❌ Failed:', error);
  process.exit(1);
});
