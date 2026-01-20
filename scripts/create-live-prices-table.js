/**
 * Script to create the live_prices DynamoDB table
 * 
 * Usage: node scripts/create-live-prices-table.js
 */

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { CreateTableCommand } = require('@aws-sdk/client-dynamodb');
const { getDynamoDBClient } = require('../config/dynamodb');

// Get the base DynamoDB client (not the document client)
function getBaseDynamoDBClient() {
  const { DynamoDBClient: BaseClient } = require('@aws-sdk/client-dynamodb');
  const fs = require('fs');
  const path = require('path');
  
  // Load AWS credentials from aws.txt if it exists
  const possiblePaths = [
    path.join(__dirname, '..', 'aws.txt'),
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
    const content = fs.readFileSync(awsTxtPath, 'utf-8');
    const lines = content.split('\n');

    lines.forEach((line) => {
      line = line.trim();
      if (!line || line.startsWith('#')) return;
      
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

  const region = process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || 'ap-south-1';
  const isLambda = !!process.env.AWS_LAMBDA_FUNCTION_NAME;

  const clientConfig = { region };

  if (!isLambda) {
    const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
    const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;

    if (!accessKeyId || !secretAccessKey) {
      throw new Error('❌ AWS credentials not found. Please ensure AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY are set in aws.txt or environment variables.');
    }

    clientConfig.credentials = {
      accessKeyId: accessKeyId,
      secretAccessKey: secretAccessKey,
    };
  }

  return new BaseClient(clientConfig);
}

async function createLivePricesTable() {
  try {
    console.log('🔄 Creating live_prices table...');
    
    const client = getBaseDynamoDBClient();
    const tableName = 'live_prices';

    const params = {
      TableName: tableName,
      AttributeDefinitions: [
        {
          AttributeName: 'id',
          AttributeType: 'N' // Number
        }
      ],
      KeySchema: [
        {
          AttributeName: 'id',
          KeyType: 'HASH' // Partition key
        }
      ],
      BillingMode: 'PAY_PER_REQUEST' // On-demand pricing
    };

    const command = new CreateTableCommand(params);
    const response = await client.send(command);

    console.log('✅ Table created successfully!');
    console.log('   Table Name:', response.TableDescription.TableName);
    console.log('   Table Status:', response.TableDescription.TableStatus);
    console.log('   Table ARN:', response.TableDescription.TableArn);
    console.log('\n⏳ Waiting for table to become active...');

    // Wait for table to be active
    let tableStatus = response.TableDescription.TableStatus;
    let attempts = 0;
    const maxAttempts = 30; // 30 seconds max wait

    while (tableStatus !== 'ACTIVE' && attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second
      
      const { DescribeTableCommand } = require('@aws-sdk/client-dynamodb');
      const describeCommand = new DescribeTableCommand({ TableName: tableName });
      const describeResponse = await client.send(describeCommand);
      tableStatus = describeResponse.Table.TableStatus;
      attempts++;
      
      if (attempts % 5 === 0) {
        console.log(`   Still waiting... (${attempts}s)`);
      }
    }

    if (tableStatus === 'ACTIVE') {
      console.log('✅ Table is now ACTIVE and ready to use!');
      console.log('\n📝 You can now sync live prices from the admin panel.');
    } else {
      console.log(`⚠️  Table status: ${tableStatus} (may still be creating)`);
    }

    process.exit(0);
  } catch (error) {
    if (error.name === 'ResourceInUseException') {
      console.log('ℹ️  Table already exists. No action needed.');
      process.exit(0);
    } else {
      console.error('❌ Error creating table:', error.message);
      console.error('   Error code:', error.name);
      process.exit(1);
    }
  }
}

// Run the script
createLivePricesTable();
