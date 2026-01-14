/**
 * Script to check which database (dev or production) is currently connected
 * 
 * Usage: node scripts/check-database-connection.js
 */

require('dotenv').config();
const { getDynamoDBClient } = require('../config/dynamodb');
const { GetCommand } = require('@aws-sdk/lib-dynamodb');

async function checkDatabaseConnection() {
  try {
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🔍 Checking Database Connection');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('');
    
    // Get AWS configuration
    const awsAccessKeyId = process.env.AWS_ACCESS_KEY_ID || '';
    const awsSecretAccessKey = process.env.AWS_SECRET_ACCESS_KEY || '';
    const awsRegion = process.env.AWS_REGION || '';
    
    console.log('📋 AWS Configuration:');
    console.log(`   Region: ${awsRegion || 'NOT SET'}`);
    console.log(`   Access Key ID: ${awsAccessKeyId ? awsAccessKeyId.substring(0, 10) + '...' : 'NOT SET'}`);
    console.log(`   Secret Access Key: ${awsSecretAccessKey ? '***SET***' : 'NOT SET'}`);
    console.log('');
    
    // Get DynamoDB client
    const client = getDynamoDBClient();
    
    // Check if client has endpoint (local DynamoDB)
    const clientConfig = client.config || {};
    let endpoint = clientConfig.endpoint || null;
    
    // Check if endpoint is actually set to a local URL (not just the default resolver)
    const isLocalEndpoint = endpoint && typeof endpoint === 'string' && (
      endpoint.includes('localhost') || 
      endpoint.includes('127.0.0.1') || 
      endpoint.includes('dynamodb-local')
    );
    
    console.log('🔌 DynamoDB Client Configuration:');
    if (isLocalEndpoint) {
      console.log(`   Endpoint: ${endpoint}`);
      console.log(`   ⚠️  LOCAL DynamoDB detected`);
    } else {
      console.log(`   Endpoint: AWS DynamoDB (default)`);
      console.log(`   ✅ PRODUCTION DynamoDB`);
    }
    console.log('');
    
    // Try to query a table to verify connection and get record count
    console.log('📊 Testing Database Connection...');
    console.log('');
    
    // Test connection by querying users table
    try {
      const testCommand = new GetCommand({
        TableName: 'users',
        Key: { id: 1 } // Try to get a non-existent record (won't error, just returns empty)
      });
      
      const startTime = Date.now();
      const response = await client.send(testCommand);
      const responseTime = Date.now() - startTime;
      
      console.log(`✅ Database connection successful!`);
      console.log(`   Response time: ${responseTime}ms`);
      console.log('');
      
      // Try to get actual data to determine if it's dev or prod
      // Get count of users with user_type 'R' as a test
      const { ScanCommand } = require('@aws-sdk/lib-dynamodb');
      const countCommand = new ScanCommand({
        TableName: 'users',
        FilterExpression: 'user_type = :userType',
        ExpressionAttributeValues: {
          ':userType': 'R'
        },
        Select: 'COUNT',
        Limit: 1 // Just to get a quick count estimate
      });
      
      const countStartTime = Date.now();
      const countResponse = await client.send(countCommand);
      const countResponseTime = Date.now() - countStartTime;
      
      console.log('📊 Database Query Test:');
      console.log(`   Users table accessible: ✅`);
      console.log(`   Query response time: ${countResponseTime}ms`);
      console.log('');
      
      // Based on our previous check, production has 42 R users
      // If we get similar count, it's likely production
      // If we get very few or 0, it might be dev
      // Get actual R users count to verify if it's production (we know production has 42)
      const fullCountCommand = new ScanCommand({
        TableName: 'users',
        FilterExpression: 'user_type = :userType',
        ExpressionAttributeValues: {
          ':userType': 'R'
        },
        Select: 'COUNT'
      });
      
      const fullCountResponse = await client.send(fullCountCommand);
      const rUsersCount = fullCountResponse.Count || 0;
      
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('🎯 Database Identification');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      
      if (isLocalEndpoint) {
        console.log('⚠️  LOCAL/DEV DynamoDB');
        console.log('   This is a local development database');
        console.log(`   Endpoint: ${endpoint}`);
      } else {
        console.log('✅ PRODUCTION DynamoDB');
        console.log('   This is the production AWS DynamoDB');
        console.log(`   Region: ${awsRegion}`);
        console.log(`   Access Key ID: ${awsAccessKeyId ? awsAccessKeyId.substring(0, 10) + '...' : 'N/A'}`);
        console.log(`   Verification: Found ${rUsersCount} users with user_type 'R'`);
        if (rUsersCount === 42) {
          console.log('   ✅ Matches known production count (42 R users)');
        }
      }
      
      // Additional check: Look at environment variables that might indicate dev/prod
      const nodeEnv = process.env.NODE_ENV || process.env.APP_ENV || '';
      if (nodeEnv) {
        console.log(`   Environment: ${nodeEnv}`);
      }
      
      console.log('');
      console.log('💡 Tip:');
      console.log('   - If endpoint is set to http://localhost:8000 or similar, it\'s LOCAL/DEV');
      console.log('   - If no endpoint is set and region is ap-south-1, it\'s likely PRODUCTION');
      console.log('   - Check aws.txt or .env files for AWS credentials source');
      
    } catch (queryErr) {
      console.error('❌ Database query failed:', queryErr.message);
      console.error('   This might indicate:');
      console.error('   1. Database connection issue');
      console.error('   2. Table does not exist');
      console.error('   3. Insufficient permissions');
      console.error('');
      console.error('   Error details:', queryErr);
    }
    
    console.log('');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
  } catch (error) {
    console.error('❌ Error:', error);
    console.error('   Message:', error.message);
    console.error('   Stack:', error.stack);
    process.exit(1);
  }
}

checkDatabaseConnection();

