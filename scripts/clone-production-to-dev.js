#!/usr/bin/env node

/**
 * Clone Production DynamoDB Tables to Development
 * 
 * This script copies all data from production DynamoDB tables to development tables.
 * Development tables are prefixed with 'dev_' (e.g., 'users' -> 'dev_users').
 * 
 * WARNING: This will overwrite existing data in development tables!
 * 
 * Usage:
 *   NODE_ENV=prod node scripts/clone-production-to-dev.js
 *   or
 *   ENVIRONMENT=prod node scripts/clone-production-to-dev.js
 */

require('dotenv').config();
const { getDynamoDBClient } = require('../config/dynamodb');
const { getTableName, getAllTableNames } = require('../utils/dynamodbTableNames');
const { 
  ScanCommand, 
  PutCommand, 
  BatchWriteCommand
} = require('@aws-sdk/lib-dynamodb');
const { 
  DescribeTableCommand,
  CreateTableCommand,
  DynamoDBClient: DynamoDBClientBase 
} = require('@aws-sdk/client-dynamodb');

// Get base DynamoDB client (not document client) for table operations
function getBaseDynamoDBClient() {
  const isLambda = !!process.env.AWS_LAMBDA_FUNCTION_NAME;
  const region = process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || 'ap-south-1';
  
  const clientConfig = { region };
  
  if (!isLambda) {
    const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
    const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
    
    if (!accessKeyId || !secretAccessKey) {
      throw new Error('AWS credentials not found');
    }
    
    clientConfig.credentials = { accessKeyId, secretAccessKey };
  }
  
  return new DynamoDBClientBase(clientConfig);
}

// List of all tables to clone
const TABLES_TO_CLONE = [
  'users',
  'shops',
  'orders',
  'products',
  'product_category',
  'customer',
  'delivery_boy',
  'admin_profile',
  'bulk_scrap_requests',
  'bulk_sell_requests',
  'pending_bulk_buy_orders',
  'subscription_packages',
  'invoice',
  'order_location_history',
  'subcategory',
  'category_img_keywords',
  'addresses',
  'packages',
  'call_logs',
  'user_admins',
  'shop_images',
  'per_pages',
  'order_rating',
  'notifications'
];

/**
 * Check if a table exists
 */
async function tableExists(client, tableName) {
  try {
    if (!client || !tableName) {
      return false;
    }
    const result = await client.send(new DescribeTableCommand({ TableName: tableName }));
    return result && result.Table && result.Table.TableStatus === 'ACTIVE';
  } catch (error) {
    if (error.name === 'ResourceNotFoundException' || error.__type === 'com.amazonaws.dynamodb.v20120810#ResourceNotFoundException') {
      return false;
    }
    throw error;
  }
}

/**
 * Get table schema from production table
 */
async function getTableSchema(client, tableName) {
  try {
    const response = await client.send(new DescribeTableCommand({ TableName: tableName }));
    return response.Table;
  } catch (error) {
    if (error.name === 'ResourceNotFoundException') {
      return null;
    }
    throw error;
  }
}

/**
 * Create development table based on production table schema
 */
async function createDevTable(baseClient, prodTableName, devTableName) {
  try {
    console.log(`\n📋 Creating development table: ${devTableName}...`);
    
    const tableSchema = await getTableSchema(baseClient, prodTableName);
    if (!tableSchema) {
      console.log(`   ⚠️  Production table "${prodTableName}" does not exist. Skipping...`);
      return false;
    }
    
    // Check if dev table already exists
    const exists = await tableExists(baseClient, devTableName);
    if (exists) {
      console.log(`   ✅ Development table "${devTableName}" already exists.`);
      return true;
    }
    
    // Determine billing mode
    const billingMode = tableSchema.BillingModeSummary?.BillingMode || 
                       tableSchema.BillingMode || 
                       (tableSchema.ProvisionedThroughput ? 'PROVISIONED' : 'PAY_PER_REQUEST');
    
    // Create table definition
    const tableDefinition = {
      TableName: devTableName,
      AttributeDefinitions: tableSchema.AttributeDefinitions,
      KeySchema: tableSchema.KeySchema,
      BillingMode: billingMode,
    };
    
    // Add ProvisionedThroughput ONLY if billing mode is PROVISIONED
    if (billingMode === 'PROVISIONED' && tableSchema.ProvisionedThroughput) {
      tableDefinition.ProvisionedThroughput = {
        ReadCapacityUnits: Math.max(1, tableSchema.ProvisionedThroughput.ReadCapacityUnits || 5),
        WriteCapacityUnits: Math.max(1, tableSchema.ProvisionedThroughput.WriteCapacityUnits || 5)
      };
    }
    
    // Add Global Secondary Indexes if they exist
    if (tableSchema.GlobalSecondaryIndexes && tableSchema.GlobalSecondaryIndexes.length > 0) {
      tableDefinition.GlobalSecondaryIndexes = tableSchema.GlobalSecondaryIndexes.map(gsi => {
        const gsiDef = {
          IndexName: gsi.IndexName,
          KeySchema: gsi.KeySchema,
          Projection: gsi.Projection,
        };
        
        // Only add ProvisionedThroughput if billing mode is PROVISIONED
        // and the GSI has valid throughput values
        if (billingMode === 'PROVISIONED') {
          if (gsi.ProvisionedThroughput) {
            const readUnits = gsi.ProvisionedThroughput.ReadCapacityUnits || 5;
            const writeUnits = gsi.ProvisionedThroughput.WriteCapacityUnits || 5;
            
            // Ensure minimum values (DynamoDB requires at least 1)
            if (readUnits > 0 && writeUnits > 0) {
              gsiDef.ProvisionedThroughput = {
                ReadCapacityUnits: Math.max(1, readUnits),
                WriteCapacityUnits: Math.max(1, writeUnits)
              };
            } else {
              // If GSI has 0 or invalid values, use defaults
              gsiDef.ProvisionedThroughput = {
                ReadCapacityUnits: 5,
                WriteCapacityUnits: 5
              };
            }
          } else {
            // No throughput specified, use defaults
            gsiDef.ProvisionedThroughput = {
              ReadCapacityUnits: 5,
              WriteCapacityUnits: 5
            };
          }
        }
        // If PAY_PER_REQUEST, don't include ProvisionedThroughput at all
        
        return gsiDef;
      });
    }
    
    await baseClient.send(new CreateTableCommand(tableDefinition));
    console.log(`   ✅ Created development table: ${devTableName}`);
    
    // Wait for table to be active
    console.log(`   ⏳ Waiting for table to become active...`);
    let isActive = false;
    let attempts = 0;
    while (!isActive && attempts < 30) {
      await new Promise(resolve => setTimeout(resolve, 2000));
      const table = await getTableSchema(baseClient, devTableName);
      if (table && table.TableStatus === 'ACTIVE') {
        isActive = true;
      }
      attempts++;
    }
    
    if (isActive) {
      console.log(`   ✅ Table "${devTableName}" is now active.`);
      return true;
    } else {
      console.log(`   ⚠️  Table "${devTableName}" creation is taking longer than expected.`);
      return true; // Continue anyway
    }
  } catch (error) {
    console.error(`   ❌ Error creating table "${devTableName}":`, error.message);
    return false;
  }
}

/**
 * Clone data from production to development table
 */
async function cloneTableData(docClient, baseClient, prodTableName, devTableName) {
  try {
    console.log(`\n📦 Cloning data from "${prodTableName}" to "${devTableName}"...`);
    
    // Check if production table exists
    let prodExists;
    try {
      prodExists = await tableExists(baseClient, prodTableName);
    } catch (existsError) {
      console.error(`   ❌ Error checking if table exists:`, existsError.message);
      return { scanned: 0, copied: 0, errors: 0 };
    }
    
    if (!prodExists) {
      console.log(`   ⚠️  Production table "${prodTableName}" does not exist. Skipping...`);
      return { scanned: 0, copied: 0, errors: 0 };
    }
    
    // Check if dev table exists
    const devExists = await tableExists(baseClient, devTableName);
    if (!devExists) {
      console.log(`   ⚠️  Development table "${devTableName}" does not exist. Creating it first...`);
      const created = await createDevTable(baseClient, prodTableName, devTableName);
      if (!created) {
        return { scanned: 0, copied: 0, errors: 0 };
      }
    }
    
    let scanned = 0;
    let copied = 0;
    let errors = 0;
    let lastEvaluatedKey = null;
    const batchSize = 25; // DynamoDB batch write limit
    
    try {
      do {
        // Scan production table
        const scanParams = {
          TableName: prodTableName
        };
        
        // Only add ExclusiveStartKey if lastEvaluatedKey is not null/undefined
        if (lastEvaluatedKey) {
          scanParams.ExclusiveStartKey = lastEvaluatedKey;
        }
        
        let scanResult;
        try {
          scanResult = await docClient.send(new ScanCommand(scanParams));
        } catch (scanError) {
          console.error(`   ❌ Error scanning table "${prodTableName}":`, scanError.message);
          throw scanError;
        }
        
        // Check if scanResult is valid
        if (!scanResult || typeof scanResult !== 'object') {
          console.error(`   ❌ Scan returned invalid result for table "${prodTableName}"`);
          break;
        }
        
        const items = Array.isArray(scanResult.Items) ? scanResult.Items : [];
        scanned += items.length;
      
      if (items.length === 0) {
        break;
      }
      
      // Write items to development table in batches
      for (let i = 0; i < items.length; i += batchSize) {
        const batch = items.slice(i, i + batchSize);
        
        // Filter out any null/undefined items
        const validBatch = batch.filter(item => item && typeof item === 'object');
        
        if (validBatch.length === 0) {
          console.warn(`   ⚠️  Skipping batch with no valid items`);
          continue;
        }
        
        const writeRequests = validBatch.map(item => ({
          PutRequest: {
            Item: item
          }
        }));
        
        try {
          await docClient.send(new BatchWriteCommand({
            RequestItems: {
              [devTableName]: writeRequests
            }
          }));
          copied += validBatch.length;
          process.stdout.write(`   ✅ Copied ${copied} items...\r`);
        } catch (batchError) {
          console.error(`\n   ❌ Error copying batch:`, batchError.message);
          errors += validBatch.length;
          
          // Try individual writes if batch fails
          for (const item of validBatch) {
            if (!item || typeof item !== 'object') {
              continue;
            }
            try {
              await docClient.send(new PutCommand({
                TableName: devTableName,
                Item: item
              }));
              copied++;
              errors--;
            } catch (itemError) {
              const itemErrorMessage = itemError && itemError.message ? itemError.message : String(itemError);
              console.error(`   ❌ Error copying item:`, itemErrorMessage);
            }
          }
        }
      }
      
        // Update lastEvaluatedKey for pagination
        lastEvaluatedKey = scanResult.LastEvaluatedKey || null;
      } while (lastEvaluatedKey);
    } catch (scanError) {
      console.error(`   ❌ Fatal error during scan:`, scanError.message);
      throw scanError;
    }
    
    console.log(`\n   ✅ Completed: Scanned ${scanned} items, copied ${copied} items, ${errors} errors`);
    return { scanned, copied, errors };
  } catch (error) {
    const errorMessage = error && error.message ? error.message : String(error);
    const errorStack = error && error.stack ? error.stack : 'No stack trace';
    console.error(`   ❌ Error cloning table "${prodTableName}":`, errorMessage);
    console.error(`   Stack:`, errorStack);
    return { scanned: 0, copied: 0, errors: 1 };
  }
}

/**
 * Main function
 */
async function cloneProductionToDev() {
  try {
    console.log('\n' + '='.repeat(80));
    console.log('🔄 CLONE PRODUCTION DYNAMODB TO DEVELOPMENT');
    console.log('='.repeat(80));
    console.log('⚠️  WARNING: This will overwrite existing data in development tables!');
    console.log('⚠️  Make sure you have set NODE_ENV=prod or ENVIRONMENT=prod\n');
    
    // Force production environment for source
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'prod';
    
    const docClient = getDynamoDBClient();
    const baseClient = getBaseDynamoDBClient();
    
    console.log('📋 Step 1: Checking production tables...\n');
    
    const results = {};
    let totalScanned = 0;
    let totalCopied = 0;
    let totalErrors = 0;
    
    for (const tableName of TABLES_TO_CLONE) {
      const prodTableName = getTableName(tableName, 'prod');
      const devTableName = getTableName(tableName, 'dev');
      
      console.log(`\n${'='.repeat(80)}`);
      console.log(`📊 Processing: ${tableName}`);
      console.log(`   Production: ${prodTableName}`);
      console.log(`   Development: ${devTableName}`);
      console.log('='.repeat(80));
      
      const result = await cloneTableData(docClient, baseClient, prodTableName, devTableName);
      results[tableName] = result;
      totalScanned += result.scanned;
      totalCopied += result.copied;
      totalErrors += result.errors;
    }
    
    // Restore original environment
    process.env.NODE_ENV = originalEnv;
    
    // Summary
    console.log('\n' + '='.repeat(80));
    console.log('📊 CLONE SUMMARY');
    console.log('='.repeat(80));
    console.log(`   Total Tables Processed: ${TABLES_TO_CLONE.length}`);
    console.log(`   Total Items Scanned: ${totalScanned}`);
    console.log(`   Total Items Copied: ${totalCopied}`);
    console.log(`   Total Errors: ${totalErrors}`);
    console.log('='.repeat(80));
    
    console.log('\n📋 Per-Table Results:');
    for (const [table, result] of Object.entries(results)) {
      console.log(`   ${table}: ${result.copied} items copied (${result.errors} errors)`);
    }
    
    console.log('\n✅ Clone operation completed!\n');
    
  } catch (error) {
    console.error('\n❌ Fatal error:', error);
    process.exit(1);
  }
}

// Run the script
if (require.main === module) {
  cloneProductionToDev()
    .then(() => process.exit(0))
    .catch(error => {
      console.error('❌ Script failed:', error);
      process.exit(1);
    });
}

module.exports = { cloneProductionToDev };

