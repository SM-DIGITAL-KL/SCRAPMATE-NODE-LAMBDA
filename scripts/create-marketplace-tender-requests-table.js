/**
 * Script to create marketplace_tender_requests DynamoDB table
 * Usage: node scripts/create-marketplace-tender-requests-table.js
 */

require('dotenv').config();
const { getDynamoDBClient } = require('../config/dynamodb');
const { getTableName } = require('../utils/dynamodbTableNames');
const { CreateTableCommand, DescribeTableCommand } = require('@aws-sdk/client-dynamodb');

const TABLE_NAME = getTableName('marketplace_tender_requests');

async function main() {
  const client = getDynamoDBClient();

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📦 CREATING MARKETPLACE TENDER REQUESTS TABLE');
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
      { AttributeName: 'requested_state_normalized', AttributeType: 'S' },
      { AttributeName: 'created_at', AttributeType: 'S' },
    ],
    GlobalSecondaryIndexes: [
      {
        IndexName: 'user_id-index',
        KeySchema: [{ AttributeName: 'user_id', KeyType: 'HASH' }],
        Projection: { ProjectionType: 'ALL' },
      },
      {
        IndexName: 'requested_state_normalized-created_at-index',
        KeySchema: [
          { AttributeName: 'requested_state_normalized', KeyType: 'HASH' },
          { AttributeName: 'created_at', KeyType: 'RANGE' },
        ],
        Projection: { ProjectionType: 'ALL' },
      },
    ],
    BillingMode: 'PAY_PER_REQUEST',
  });

  try {
    console.log(`Creating table "${TABLE_NAME}" with GSIs...`);
    await client.send(createCommand);
    console.log(`✅ Table "${TABLE_NAME}" created successfully.`);
    console.log('   Table and GSIs will become ACTIVE shortly.\n');
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

