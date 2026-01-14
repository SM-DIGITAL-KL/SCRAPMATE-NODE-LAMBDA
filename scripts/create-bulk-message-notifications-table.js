/**
 * Script to create the bulk_message_notifications DynamoDB table
 * Usage: node scripts/create-bulk-message-notifications-table.js
 */

require('dotenv').config();
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { CreateTableCommand, DescribeTableCommand } = require('@aws-sdk/client-dynamodb');
const fs = require('fs');
const path = require('path');

// Load AWS credentials from aws.txt if it exists (same logic as dynamodb.js)
function loadAwsCredentials() {
  const possiblePaths = [
    path.join(__dirname, '..', '..', 'aws.txt'),
    path.join(process.cwd(), 'aws.txt'),
    path.join(process.cwd(), '..', 'aws.txt'),
  ];

  let awsTxtPath = null;
  for (const possiblePath of possiblePaths) {
    if (fs.existsSync(possiblePath)) {
      awsTxtPath = possiblePath;
      break;
    }
  }

  if (awsTxtPath) {
    console.log(`📁 Loading AWS credentials from: ${awsTxtPath}`);
    const content = fs.readFileSync(awsTxtPath, 'utf-8');
    const lines = content.split('\n');

    lines.forEach((line) => {
      line = line.trim();
      if (!line || line.startsWith('#')) {
        return;
      }
      
      if (line.startsWith('export ')) {
        const parts = line.substring(7).split('=', 2);
        if (parts.length === 2) {
          let key = parts[0].trim();
          let value = parts[1].trim();
          if (
            (value.startsWith('"') && value.endsWith('"')) ||
            (value.startsWith("'") && value.endsWith("'"))
          ) {
            value = value.slice(1, -1);
          }
          process.env[key] = value;
        }
      }
    });
  }
}

async function main() {
  // Load credentials
  loadAwsCredentials();
  
  // Get region from environment or config
  const region = process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || 'ap-south-1';
  
  // Create client config
  const clientConfig = {
    region: region,
  };

  // Add credentials if not in Lambda
  if (!process.env.AWS_LAMBDA_FUNCTION_NAME) {
    const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
    const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;

    if (accessKeyId && secretAccessKey) {
      clientConfig.credentials = {
        accessKeyId: accessKeyId,
        secretAccessKey: secretAccessKey,
      };
    }
  }

  const client = new DynamoDBClient(clientConfig);
  
  const TABLE_NAME = 'bulk_message_notifications';

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📨 CREATING BULK MESSAGE NOTIFICATIONS TABLE');
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
          AttributeType: 'S' // String (format: phone_timestamp_index)
        },
        {
          AttributeName: 'phone_number',
          AttributeType: 'S' // String (for GSI)
        }
      ],
      BillingMode: 'PAY_PER_REQUEST', // On-demand pricing
      GlobalSecondaryIndexes: [
        {
          IndexName: 'phone-number-index',
          KeySchema: [
            {
              AttributeName: 'phone_number',
              KeyType: 'HASH'
            }
          ],
          Projection: {
            ProjectionType: 'ALL'
          }
        }
      ]
    });

    console.log(`Creating table "${TABLE_NAME}"...`);
    console.log(`   Primary Key: id (String)`);
    console.log(`   Global Secondary Index: phone-number-index on phone_number`);
    console.log(`   Billing Mode: PAY_PER_REQUEST (On-Demand)\n`);
    
    await client.send(createCommand);
    console.log(`✅ Table "${TABLE_NAME}" created successfully!`);
    console.log(`\n   Table will be ready for use in a few seconds.`);
    console.log(`   You can now save bulk message notifications.\n`);
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

