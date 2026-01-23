/**
 * Create Global Secondary Index (GSI) on mob_num for users table
 * This GSI will enable efficient Query operations instead of expensive Scans
 * 
 * Usage: node scripts/create-users-mob-num-gsi.js
 * 
 * Note: This script requires AWS credentials and appropriate permissions
 */

require('dotenv').config();
const { loadEnvFromFile } = require('../utils/loadEnv');
loadEnvFromFile();

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { UpdateTableCommand, DescribeTableCommand } = require('@aws-sdk/client-dynamodb');

const TABLE_NAME = 'users';
const GSI_NAME = 'mob_num-index';

async function createGSI() {
  try {
    const client = new DynamoDBClient({
      region: process.env.AWS_REGION || 'ap-south-1',
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
      }
    });

    console.log('\n🔍 Checking if GSI already exists...\n');

    // First, check if table exists and get current structure
    try {
      const describeCommand = new DescribeTableCommand({
        TableName: TABLE_NAME
      });

      const tableDescription = await client.send(describeCommand);
      const existingGSIs = tableDescription.Table.GlobalSecondaryIndexes || [];

      // Check if GSI already exists
      const gsiExists = existingGSIs.some(gsi => gsi.IndexName === GSI_NAME);
      
      if (gsiExists) {
        console.log(`✅ GSI '${GSI_NAME}' already exists on table '${TABLE_NAME}'`);
        console.log('   No action needed.\n');
        return;
      }

      console.log(`📋 Current table structure:`);
      console.log(`   Table Name: ${TABLE_NAME}`);
      console.log(`   Existing GSIs: ${existingGSIs.length}`);
      existingGSIs.forEach(gsi => {
        console.log(`     - ${gsi.IndexName}`);
      });
      console.log('');

      console.log(`🔄 Creating GSI '${GSI_NAME}' on '${TABLE_NAME}'...\n`);

      // Create the GSI
      const updateCommand = new UpdateTableCommand({
        TableName: TABLE_NAME,
        AttributeDefinitions: [
          {
            AttributeName: 'mob_num',
            AttributeType: 'N' // Number (since mob_num is stored as number)
          }
        ],
        GlobalSecondaryIndexUpdates: [
          {
            Create: {
              IndexName: GSI_NAME,
              KeySchema: [
                {
                  AttributeName: 'mob_num',
                  KeyType: 'HASH' // Partition key
                }
              ],
              Projection: {
                ProjectionType: 'ALL' // Include all attributes
              },
              ProvisionedThroughput: {
                ReadCapacityUnits: 5,
                WriteCapacityUnits: 5
              }
            }
          }
        ]
      });

      console.log('⏳ Creating GSI (this may take a few minutes)...\n');
      const response = await client.send(updateCommand);

      console.log('✅ GSI creation initiated successfully!');
      console.log(`\n📊 GSI Details:`);
      console.log(`   Index Name: ${GSI_NAME}`);
      console.log(`   Partition Key: mob_num (Number)`);
      console.log(`   Projection: ALL`);
      console.log(`   Read Capacity: 5 RCU`);
      console.log(`   Write Capacity: 5 WCU`);
      console.log(`\n⏳ Status: ${response.TableDescription.TableStatus}`);
      console.log(`   Note: GSI creation is asynchronous. It may take a few minutes to become ACTIVE.`);
      console.log(`   You can check status with: aws dynamodb describe-table --table-name ${TABLE_NAME}`);
      console.log('\n✅ Done!\n');

    } catch (describeErr) {
      if (describeErr.name === 'ResourceNotFoundException') {
        console.error(`❌ Table '${TABLE_NAME}' does not exist`);
        console.error('   Please create the table first before adding GSI.\n');
        process.exit(1);
      } else if (describeErr.name === 'ValidationException' && describeErr.message?.includes('already exists')) {
        console.log(`✅ GSI '${GSI_NAME}' already exists`);
      } else {
        throw describeErr;
      }
    }

  } catch (error) {
    console.error('❌ Error creating GSI:', error.message);
    if (error.name === 'ValidationException') {
      console.error('\n💡 Common issues:');
      console.error('   1. GSI might already exist');
      console.error('   2. Attribute type mismatch (mob_num must be Number)');
      console.error('   3. Table might be in CREATING or UPDATING state');
      console.error('\n   Try running: aws dynamodb describe-table --table-name users');
    }
    console.error('\n   Error details:', error);
    process.exit(1);
  }
}

createGSI();
