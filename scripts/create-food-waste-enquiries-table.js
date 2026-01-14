#!/usr/bin/env node

/**
 * Script to create the food_waste_enquiries DynamoDB table
 * Usage: node scripts/create-food-waste-enquiries-table.js [env]
 * Example: node scripts/create-food-waste-enquiries-table.js dev
 * Example: node scripts/create-food-waste-enquiries-table.js prod
 */

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { CreateTableCommand, DescribeTableCommand } = require('@aws-sdk/client-dynamodb');
const { getDynamoDBClient } = require('../config/dynamodb');
const { getTableName } = require('../utils/dynamodbTableNames');

const client = getDynamoDBClient();

async function createFoodWasteEnquiriesTable() {
  const env = process.argv[2] || process.env.NODE_ENV || 'prod';
  process.env.NODE_ENV = env;
  
  const tableName = getTableName('food_waste_enquiries');
  
  console.log(`\n🔧 Creating DynamoDB table: ${tableName}`);
  console.log(`   Environment: ${env}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  try {
    // Check if table already exists
    try {
      await client.send(new DescribeTableCommand({ TableName: tableName }));
      console.log(`✅ Table ${tableName} already exists`);
      return;
    } catch (error) {
      if (error.name !== 'ResourceNotFoundException') {
        throw error;
      }
      // Table doesn't exist, proceed with creation
    }

    // Create table
    const createTableParams = {
      TableName: tableName,
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
      BillingMode: 'PAY_PER_REQUEST', // On-demand pricing
    };

    console.log('📋 Table configuration:');
    console.log(`   Table Name: ${tableName}`);
    console.log(`   Primary Key: id (Number)`);
    console.log(`   Billing Mode: PAY_PER_REQUEST`);
    console.log('');

    const command = new CreateTableCommand(createTableParams);
    const response = await client.send(command);

    console.log(`✅ Table ${tableName} created successfully!`);
    console.log(`   Table ARN: ${response.TableDescription?.TableArn}`);
    console.log(`   Table Status: ${response.TableDescription?.TableStatus}`);
    console.log('');

  } catch (error) {
    console.error(`❌ Error creating table ${tableName}:`, error.message);
    if (error.name === 'ResourceInUseException') {
      console.log(`   Table ${tableName} already exists`);
    } else {
      console.error('   Error details:', error);
      process.exit(1);
    }
  }
}

// Run the script
createFoodWasteEnquiriesTable()
  .then(() => {
    console.log('✅ Script completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Script failed:', error);
    process.exit(1);
  });

