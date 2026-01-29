/**
 * Diagnostic script to check why dashboard counts are showing 0
 * Checks:
 * 1. GSI existence and queries
 * 2. Direct user counts for 'R' type
 * 3. Customer app orders count
 * 4. Cache values
 */

require('dotenv').config();
const { getDynamoDBClient } = require('../config/dynamodb');
const { QueryCommand, ScanCommand } = require('@aws-sdk/lib-dynamodb');
const RedisCache = require('../utils/redisCache');
const User = require('../models/User');
const Order = require('../models/Order');

async function diagnoseDashboardCounts() {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🔍 Dashboard Counts Diagnostic');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const client = getDynamoDBClient();

  // 1. Check 'R' user count using GSI
  console.log('1️⃣  Checking Recycler (R) user count...');
  try {
    console.log('   📊 Attempting GSI query: user_type-app_type-index');
    let lastKey = null;
    let gsiCount = 0;
    try {
      do {
        const queryCommand = new QueryCommand({
          TableName: 'users',
          IndexName: 'user_type-app_type-index',
          KeyConditionExpression: 'user_type = :userType AND app_type = :appType',
          FilterExpression: 'app_version = :appVersion AND (attribute_not_exists(del_status) OR del_status <> :deleted)',
          ExpressionAttributeValues: {
            ':userType': 'R',
            ':appType': 'vendor_app',
            ':appVersion': 'v2',
            ':deleted': 2
          },
          Select: 'COUNT'
        });
        
        if (lastKey) {
          queryCommand.input.ExclusiveStartKey = lastKey;
        }
        
        const response = await client.send(queryCommand);
        gsiCount += response.Count || 0;
        lastKey = response.LastEvaluatedKey;
        console.log(`   ✅ GSI query page: ${response.Count || 0} users (total so far: ${gsiCount})`);
      } while (lastKey);
      console.log(`   ✅ GSI Total R users: ${gsiCount}\n`);
    } catch (gsiError) {
      console.log(`   ❌ GSI query failed: ${gsiError.message}`);
      console.log(`   ⚠️  Falling back to Scan...\n`);
      
      // Fallback to Scan
      lastKey = null;
      let scanCount = 0;
      do {
        const params = {
          TableName: 'users',
          FilterExpression: 'user_type = :userType AND app_version = :appVersion AND app_type = :appType AND (attribute_not_exists(del_status) OR del_status <> :deleted)',
          ExpressionAttributeValues: {
            ':userType': 'R',
            ':appVersion': 'v2',
            ':appType': 'vendor_app',
            ':deleted': 2
          },
          Select: 'COUNT'
        };
        if (lastKey) params.ExclusiveStartKey = lastKey;
        const command = new ScanCommand(params);
        const response = await client.send(command);
        scanCount += response.Count || 0;
        lastKey = response.LastEvaluatedKey;
        console.log(`   📊 Scan page: ${response.Count || 0} users (total so far: ${scanCount})`);
      } while (lastKey);
      console.log(`   ✅ Scan Total R users: ${scanCount}\n`);
    }
  } catch (err) {
    console.error(`   ❌ Error checking R users:`, err.message);
  }

  // 2. Check using User model method
  console.log('2️⃣  Checking using User.countByUserTypeV2("R")...');
  try {
    const count = await User.countByUserTypeV2('R');
    console.log(`   ✅ User.countByUserTypeV2("R") = ${count}\n`);
  } catch (err) {
    console.error(`   ❌ Error:`, err.message);
    console.error(`   Stack:`, err.stack);
  }

  // 3. Check cache for R users
  console.log('3️⃣  Checking cache for R users...');
  try {
    const cacheKey = `user:count_v2:R:vendor_app`;
    const cached = await RedisCache.get(cacheKey);
    console.log(`   Cache key: ${cacheKey}`);
    console.log(`   Cached value: ${cached} (type: ${typeof cached})\n`);
  } catch (err) {
    console.error(`   ❌ Cache error:`, err.message);
  }

  // 4. Check customer app orders
  console.log('4️⃣  Checking customer app orders count...');
  try {
    console.log('   📊 Attempting to count customer app orders...');
    const count = await Order.countCustomerAppOrdersV2();
    console.log(`   ✅ Order.countCustomerAppOrdersV2() = ${count}\n`);
  } catch (err) {
    console.error(`   ❌ Error:`, err.message);
    console.error(`   Stack:`, err.stack);
  }

  // 5. Check if app_version-app_type-index GSI exists for users
  console.log('5️⃣  Checking app_version-app_type-index GSI for users...');
  try {
    let lastKey = null;
    let count = 0;
    do {
      const queryCommand = new QueryCommand({
        TableName: 'users',
        IndexName: 'app_version-app_type-index',
        KeyConditionExpression: 'app_version = :appVersion AND app_type = :appType',
        FilterExpression: '(attribute_not_exists(del_status) OR del_status <> :deleted)',
        ExpressionAttributeValues: {
          ':appVersion': 'v2',
          ':appType': 'customer_app',
          ':deleted': 2
        },
        Select: 'COUNT'
      });
      
      if (lastKey) {
        queryCommand.input.ExclusiveStartKey = lastKey;
      }
      
      const response = await client.send(queryCommand);
      count += response.Count || 0;
      lastKey = response.LastEvaluatedKey;
      console.log(`   ✅ GSI query page: ${response.Count || 0} users (total so far: ${count})`);
    } while (lastKey);
    console.log(`   ✅ Total v2 customer_app users: ${count}\n`);
  } catch (gsiError) {
    console.log(`   ❌ GSI app_version-app_type-index not available: ${gsiError.message}\n`);
  }

  // 6. Sample a few R users to verify they exist
  console.log('6️⃣  Sampling R users (first 5)...');
  try {
    let lastKey = null;
    const sampleUsers = [];
    do {
      const params = {
        TableName: 'users',
        FilterExpression: 'user_type = :userType AND app_version = :appVersion AND app_type = :appType AND (attribute_not_exists(del_status) OR del_status <> :deleted)',
        ExpressionAttributeValues: {
          ':userType': 'R',
          ':appVersion': 'v2',
          ':appType': 'vendor_app',
          ':deleted': 2
        },
        Limit: 5
      };
      if (lastKey) params.ExclusiveStartKey = lastKey;
      const command = new ScanCommand(params);
      const response = await client.send(command);
      if (response.Items) {
        sampleUsers.push(...response.Items);
      }
      lastKey = response.LastEvaluatedKey;
      if (sampleUsers.length >= 5) break;
    } while (lastKey && sampleUsers.length < 5);

    if (sampleUsers.length > 0) {
      console.log(`   ✅ Found ${sampleUsers.length} R users:`);
      sampleUsers.forEach((user, idx) => {
        console.log(`      ${idx + 1}. ID: ${user.id}, Name: ${user.name || 'N/A'}, Mobile: ${user.mob_num || 'N/A'}, Created: ${user.created_at || 'N/A'}`);
      });
    } else {
      console.log(`   ⚠️  No R users found in database`);
    }
    console.log();
  } catch (err) {
    console.error(`   ❌ Error sampling R users:`, err.message);
  }

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('✅ Diagnostic complete');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
}

// Run diagnostic
diagnoseDashboardCounts().catch(err => {
  console.error('❌ Fatal error:', err);
  process.exit(1);
});
