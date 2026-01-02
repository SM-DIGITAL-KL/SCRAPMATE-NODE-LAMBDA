/**
 * Script to create the bulk_sell_requests DynamoDB table
 * Usage: node scripts/create-bulk-sell-requests-table.js
 */

require('dotenv').config();
const { getDynamoDBClient } = require('../config/dynamodb');
const { CreateTableCommand, DescribeTableCommand } = require('@aws-sdk/client-dynamodb');

async function main() {
  const client = getDynamoDBClient();
  const TABLE_NAME = 'bulk_sell_requests';

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📦 CREATING BULK SELL REQUESTS TABLE');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  // Check if table already exists
  try {
    const describeCommand = new DescribeTableCommand({
      TableName: TABLE_NAME
    });
    await client.send(describeCommand);
    console.log(`✅ Table "${TABLE_NAME}" already exists.`);
    console.log(`   No action needed.\n`);
    return;
  } catch (error) {
    if (error.name === 'ResourceNotFoundException') {
      console.log(`ℹ️  Table "${TABLE_NAME}" does not exist. Creating it now...\n`);
    } else {
      console.error(`❌ Error checking table existence:`, error.message);
      throw error;
    }
  }

  // Create the table
  try {
    const createCommand = new CreateTableCommand({
      TableName: TABLE_NAME,
      KeySchema: [
        {
          AttributeName: 'id',
          KeyType: 'HASH' // Partition key
        }
      ],
      AttributeDefinitions: [
        {
          AttributeName: 'id',
          AttributeType: 'N' // Number
        }
      ],
      BillingMode: 'PAY_PER_REQUEST' // On-demand pricing
    });

    console.log(`Creating table "${TABLE_NAME}"...`);
    await client.send(createCommand);
    console.log(`✅ Table "${TABLE_NAME}" created successfully!`);
    console.log(`\n   Table will be ready for use in a few seconds.`);
    console.log(`   You can now create bulk sell requests.\n`);
  } catch (error) {
    console.error(`❌ Error creating table:`, error.message);
    if (error.name === 'ResourceInUseException') {
      console.log(`   The table already exists.`);
    } else {
      throw error;
    }
  }
}

main().catch(error => {
  console.error('❌ Error:', error);
  process.exit(1);
});




