#!/usr/bin/env node

/**
 * List DynamoDB Tables
 * 
 * Lists all DynamoDB tables in the current AWS account/region.
 * Useful for verifying which tables exist in production vs development.
 * 
 * Usage:
 *   node scripts/list-dynamodb-tables.js
 *   NODE_ENV=dev node scripts/list-dynamodb-tables.js
 */

require('dotenv').config();
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { ListTablesCommand } = require('@aws-sdk/client-dynamodb');
const { getEnvironment } = require('../utils/dynamodbTableNames');

// Load AWS credentials
function loadAwsCredentials() {
  const fs = require('fs');
  const path = require('path');
  
  const possiblePaths = [
    path.join(__dirname, '..', '..', 'aws.txt'),
    path.join(process.cwd(), 'aws.txt'),
    path.join(process.cwd(), '..', 'aws.txt'),
  ];

  for (const possiblePath of possiblePaths) {
    if (fs.existsSync(possiblePath)) {
      const content = fs.readFileSync(possiblePath, 'utf-8');
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
      break;
    }
  }
}

async function listTables() {
  try {
    loadAwsCredentials();
    
    const region = process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || 'ap-south-1';
    const isLambda = !!process.env.AWS_LAMBDA_FUNCTION_NAME;
    const environment = getEnvironment();
    
    const clientConfig = { region };
    
    if (!isLambda) {
      const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
      const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
      
      if (!accessKeyId || !secretAccessKey) {
        throw new Error('AWS credentials not found');
      }
      
      clientConfig.credentials = { accessKeyId, secretAccessKey };
    }
    
    const client = new DynamoDBClient(clientConfig);
    
    console.log('\n' + '='.repeat(80));
    console.log('📋 DYNAMODB TABLES LIST');
    console.log('='.repeat(80));
    console.log(`   Environment: ${environment}`);
    console.log(`   Region: ${region}`);
    console.log('='.repeat(80) + '\n');
    
    let lastEvaluatedTableName = null;
    const allTables = [];
    
    do {
      const command = new ListTablesCommand({
        ExclusiveStartTableName: lastEvaluatedTableName
      });
      
      const response = await client.send(command);
      if (response.TableNames) {
        allTables.push(...response.TableNames);
      }
      
      lastEvaluatedTableName = response.LastEvaluatedTableName;
    } while (lastEvaluatedTableName);
    
    // Sort tables
    allTables.sort();
    
    // Categorize tables
    const prodTables = allTables.filter(t => !t.startsWith('dev_') && !t.startsWith('test_'));
    const devTables = allTables.filter(t => t.startsWith('dev_'));
    const otherTables = allTables.filter(t => 
      !t.startsWith('dev_') && 
      !t.startsWith('test_') && 
      !prodTables.includes(t)
    );
    
    console.log(`📊 Total Tables: ${allTables.length}\n`);
    
    if (prodTables.length > 0) {
      console.log('🏭 PRODUCTION TABLES:');
      console.log('-'.repeat(80));
      prodTables.forEach(table => console.log(`   ${table}`));
      console.log('');
    }
    
    if (devTables.length > 0) {
      console.log('🔧 DEVELOPMENT TABLES:');
      console.log('-'.repeat(80));
      devTables.forEach(table => console.log(`   ${table}`));
      console.log('');
    }
    
    if (otherTables.length > 0) {
      console.log('📦 OTHER TABLES:');
      console.log('-'.repeat(80));
      otherTables.forEach(table => console.log(`   ${table}`));
      console.log('');
    }
    
    console.log('='.repeat(80));
    console.log(`✅ Found ${allTables.length} table(s) total\n`);
    
  } catch (error) {
    console.error('❌ Error listing tables:', error.message);
    process.exit(1);
  }
}

if (require.main === module) {
  listTables();
}

module.exports = { listTables };


