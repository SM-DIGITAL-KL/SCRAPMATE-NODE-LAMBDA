/**
 * Script to delete all orders-related cache from Redis for all customer_app users
 * Usage: node scripts/clear-all-customer-app-orders-cache.js
 * 
 * This script:
 * 1. Finds all users with app_type = 'customer_app'
 * 2. For each user, finds their Customer record to get customer_id
 * 3. Deletes all order-related cache keys for those customers:
 *    - customer_orders
 *    - customer_recent_orders
 *    - customer_pending_orders
 *    - customer dashboard cache
 *    - V2 API caches (active_pickup, recycling_stats, earnings, etc.)
 */

require('dotenv').config();
const { getDynamoDBClient } = require('../config/dynamodb');
const { ScanCommand } = require('@aws-sdk/lib-dynamodb');
const RedisCache = require('../utils/redisCache');
const User = require('../models/User');
const Customer = require('../models/Customer');
const { getTableName, getEnvironment } = require('../utils/dynamodbTableNames');

const USER_TABLE = getTableName('users');

async function clearAllCustomerAppOrdersCache() {
  try {
    const environment = getEnvironment();
    console.log('🟢 Starting to clear all customer_app orders cache...');
    console.log(`   Environment: ${environment}`);
    console.log(`   User table: ${USER_TABLE}\n`);
    
    // Step 1: Find all customer_app users
    console.log('📋 Step 1: Finding all customer_app users...');
    const client = getDynamoDBClient();
    let lastKey = null;
    const customerAppUsers = [];
    
    do {
      const params = {
        TableName: USER_TABLE,
        FilterExpression: 'app_type = :appType',
        ExpressionAttributeValues: {
          ':appType': 'customer_app'
        }
      };
      
      if (lastKey) {
        params.ExclusiveStartKey = lastKey;
      }
      
      const command = new ScanCommand(params);
      const response = await client.send(command);
      
      if (response.Items) {
        // Filter out deleted users
        const activeUsers = response.Items.filter(user => 
          !user.del_status || user.del_status !== 2
        );
        customerAppUsers.push(...activeUsers);
      }
      
      lastKey = response.LastEvaluatedKey;
    } while (lastKey);
    
    console.log(`✅ Found ${customerAppUsers.length} customer_app users\n`);
    
    if (customerAppUsers.length === 0) {
      console.log('ℹ️  No customer_app users found. Exiting.');
      return;
    }
    
    // Step 2: Get customer_id for each user
    console.log('📋 Step 2: Finding customer_id for each user...');
    const customerIdMap = new Map(); // user_id -> customer_id
    let customersFound = 0;
    let customersNotFound = 0;
    
    for (const user of customerAppUsers) {
      try {
        const customer = await Customer.findByUserId(user.id);
        if (customer && customer.id) {
          customerIdMap.set(user.id, customer.id);
          customersFound++;
        } else {
          // Some customer_app users might not have a Customer record yet
          // Use user.id as fallback for cache keys
          customerIdMap.set(user.id, user.id);
          customersNotFound++;
        }
      } catch (err) {
        console.error(`   ⚠️  Error finding customer for user ${user.id}:`, err.message);
        // Use user.id as fallback
        customerIdMap.set(user.id, user.id);
        customersNotFound++;
      }
    }
    
    console.log(`✅ Found customer_id for ${customersFound} users`);
    if (customersNotFound > 0) {
      console.log(`   ⚠️  ${customersNotFound} users without Customer record (using user.id as fallback)\n`);
    } else {
      console.log('');
    }
    
    // Step 3: Delete all order-related cache for each customer
    console.log('🗑️  Step 3: Deleting order-related cache for all customers...\n');
    let totalDeleted = 0;
    let totalErrors = 0;
    const cacheKeysDeleted = new Set();
    
    for (const [userId, customerId] of customerIdMap.entries()) {
      try {
        const customerIdNum = typeof customerId === 'string' && !isNaN(customerId) 
          ? parseInt(customerId) 
          : customerId;
        
        // List of all order-related cache keys to delete
        const cacheKeys = [
          // Customer orders cache
          RedisCache.listKey('customer_orders', { customer_id: customerIdNum }),
          RedisCache.listKey('customer_recent_orders', { customer_id: customerIdNum }),
          RedisCache.listKey('customer_pending_orders', { customer_id: customerIdNum }),
          
          // Customer dashboard cache
          RedisCache.dashboardKey('customer', customerIdNum),
          
          // V2 API caches
          RedisCache.userKey(customerIdNum, 'active_pickup_all'),
          RedisCache.userKey(customerIdNum, 'active_pickup_customer'),
          RedisCache.userKey(customerIdNum, 'recycling_stats_customer'),
          RedisCache.userKey(customerIdNum, 'earnings_monthly_customer_6'),
          RedisCache.userKey(customerIdNum, 'earnings_monthly_customer_12'),
          
          // Available pickup requests cache
          RedisCache.listKey('available_pickup_requests', { user_id: userId, user_type: 'C' }),
        ];
        
        // Delete all cache keys
        for (const cacheKey of cacheKeys) {
          try {
            const deleted = await RedisCache.delete(cacheKey);
            if (deleted) {
              cacheKeysDeleted.add(cacheKey);
              totalDeleted++;
            }
          } catch (err) {
            console.error(`   ⚠️  Error deleting cache key ${cacheKey}:`, err.message);
            totalErrors++;
          }
        }
        
        // Also try to delete any order-specific caches (we'll scan for order:* keys if needed)
        // For now, we'll focus on the customer-specific caches
        
      } catch (err) {
        console.error(`   ❌ Error processing user ${userId} (customer_id: ${customerIdMap.get(userId)}):`, err.message);
        totalErrors++;
      }
    }
    
    // Summary
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📊 SUMMARY');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`   Customer app users found: ${customerAppUsers.length}`);
    console.log(`   Customers with records: ${customersFound}`);
    console.log(`   Users without Customer records: ${customersNotFound}`);
    console.log(`   Cache keys deleted: ${totalDeleted}`);
    console.log(`   Unique cache keys: ${cacheKeysDeleted.size}`);
    console.log(`   Errors encountered: ${totalErrors}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    
    if (totalErrors > 0) {
      console.log('⚠️  Some errors occurred during cache deletion. Please review the logs above.');
    } else {
      console.log('✅ All customer_app orders cache cleared successfully!');
    }
    
  } catch (error) {
    console.error('❌ Error clearing customer_app orders cache:', error);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run the script
clearAllCustomerAppOrdersCache()
  .then(() => {
    console.log('🎉 Script completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Script failed:', error);
    process.exit(1);
  });












