require('dotenv').config();
const { getDynamoDBClient } = require('../config/dynamodb');
const { ScanCommand, BatchWriteCommand, GetCommand } = require('@aws-sdk/lib-dynamodb');
const User = require('../models/User');

/**
 * Delete all v1 app orders from database, keeping v2 orders
 * 
 * V1 orders are identified by:
 * - Orders from customers with app_version != 'v2' or missing app_version
 * - Orders from customers with app_type != 'customer_app'
 * - Orders where customer_id doesn't exist in users table
 * 
 * V2 orders are identified by:
 * - Orders from customers with app_version = 'v2' AND app_type = 'customer_app'
 * 
 * Usage: 
 *   node scripts/delete-v1-orders.js [--dry-run] [--confirm]
 * 
 * Options:
 *   --dry-run    : Show what would be deleted without actually deleting
 *   --confirm    : Skip confirmation prompt (use with caution)
 */

const TABLE_NAME = 'orders';
const BATCH_SIZE = 25; // DynamoDB batch write limit
const SCAN_BATCH_SIZE = 100;

let dryRun = false;
let confirmed = false;

// Parse command line arguments
process.argv.forEach(arg => {
  if (arg === '--dry-run') {
    dryRun = true;
    console.log('🔍 DRY RUN MODE - No orders will be deleted\n');
  }
  if (arg === '--confirm') {
    confirmed = true;
  }
});

/**
 * Check if a customer is v2
 */
async function isV2Customer(customerId) {
  if (!customerId) {
    return false; // No customer = v1
  }

  try {
    const customer = await User.findById(customerId);
    
    if (!customer) {
      return false; // Customer doesn't exist = v1
    }

    // V2 customer must have app_version = 'v2' AND app_type = 'customer_app'
    const isV2 = customer.app_version === 'v2' && customer.app_type === 'customer_app';
    
    return isV2;
  } catch (error) {
    console.error(`❌ Error checking customer ${customerId}:`, error.message);
    return false; // Error = treat as v1 to be safe
  }
}

/**
 * Delete orders in batches
 */
async function deleteOrdersBatch(ordersToDelete) {
  if (ordersToDelete.length === 0) {
    return { deleted: 0, failed: 0 };
  }

  const client = getDynamoDBClient();
  let deleted = 0;
  let failed = 0;

  // Process in batches of 25 (DynamoDB limit)
  for (let i = 0; i < ordersToDelete.length; i += BATCH_SIZE) {
    const batch = ordersToDelete.slice(i, i + BATCH_SIZE);
    
    const deleteRequests = batch.map(order => ({
      DeleteRequest: {
        Key: {
          id: order.id
        }
      }
    }));

    if (dryRun) {
      console.log(`   [DRY RUN] Would delete batch ${Math.floor(i / BATCH_SIZE) + 1}: ${batch.length} orders`);
      deleted += batch.length;
    } else {
      try {
        const command = new BatchWriteCommand({
          RequestItems: {
            [TABLE_NAME]: deleteRequests
          }
        });

        const response = await client.send(command);
        
        // Check for unprocessed items
        if (response.UnprocessedItems && Object.keys(response.UnprocessedItems).length > 0) {
          console.warn(`   ⚠️  Some items were unprocessed, retrying...`);
          // Retry unprocessed items
          await new Promise(resolve => setTimeout(resolve, 1000));
          const retryCommand = new BatchWriteCommand({
            RequestItems: response.UnprocessedItems
          });
          await client.send(retryCommand);
        }

        deleted += batch.length;
      } catch (error) {
        console.error(`   ❌ Error deleting batch:`, error.message);
        failed += batch.length;
      }
    }
  }

  return { deleted, failed };
}

/**
 * Main function
 */
async function main() {
  console.log('🗑️  Delete V1 App Orders Script');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  if (!dryRun && !confirmed) {
    console.log('⚠️  WARNING: This will permanently delete all v1 app orders!');
    console.log('   V2 orders will be preserved.\n');
    console.log('   To proceed, run with --confirm flag:');
    console.log('   node scripts/delete-v1-orders.js --confirm\n');
    console.log('   Or use --dry-run to see what would be deleted:');
    console.log('   node scripts/delete-v1-orders.js --dry-run\n');
    process.exit(0);
  }

  const client = getDynamoDBClient();
  let totalScanned = 0;
  let v1Orders = [];
  let v2Orders = [];
  let ordersWithoutCustomer = [];
  let lastEvaluatedKey = null;

  console.log('📊 Scanning orders table...\n');

  // Scan all orders
  do {
    try {
      const scanParams = {
        TableName: TABLE_NAME,
        Limit: SCAN_BATCH_SIZE
      };

      if (lastEvaluatedKey) {
        scanParams.ExclusiveStartKey = lastEvaluatedKey;
      }

      const command = new ScanCommand(scanParams);
      const response = await client.send(command);
      
      const orders = response.Items || [];
      totalScanned += orders.length;

      console.log(`   Scanned ${totalScanned} orders...`);

      // Check each order
      for (const order of orders) {
        if (!order.customer_id) {
          ordersWithoutCustomer.push(order);
          continue;
        }

        const isV2 = await isV2Customer(order.customer_id);
        
        if (isV2) {
          v2Orders.push(order);
        } else {
          v1Orders.push(order);
        }
      }

      lastEvaluatedKey = response.LastEvaluatedKey;
    } catch (error) {
      console.error('❌ Error scanning orders:', error);
      process.exit(1);
    }
  } while (lastEvaluatedKey);

  console.log('\n📋 Summary:');
  console.log(`   Total orders scanned: ${totalScanned}`);
  console.log(`   V2 orders (will be kept): ${v2Orders.length}`);
  console.log(`   V1 orders (will be deleted): ${v1Orders.length}`);
  console.log(`   Orders without customer_id (will be deleted): ${ordersWithoutCustomer.length}`);
  console.log(`   Total to delete: ${v1Orders.length + ordersWithoutCustomer.length}\n`);

  if (v1Orders.length === 0 && ordersWithoutCustomer.length === 0) {
    console.log('✅ No v1 orders found. Nothing to delete.');
    process.exit(0);
  }

  // Show sample of orders to be deleted
  if (v1Orders.length > 0) {
    console.log('📝 Sample V1 orders to be deleted:');
    v1Orders.slice(0, 5).forEach((order, idx) => {
      console.log(`   ${idx + 1}. Order ID: ${order.id}, Order No: ${order.order_no || 'N/A'}, Customer ID: ${order.customer_id || 'N/A'}`);
    });
    if (v1Orders.length > 5) {
      console.log(`   ... and ${v1Orders.length - 5} more`);
    }
    console.log('');
  }

  // Delete orders
  const allOrdersToDelete = [...v1Orders, ...ordersWithoutCustomer];
  
  console.log(`🗑️  ${dryRun ? '[DRY RUN] Would delete' : 'Deleting'} ${allOrdersToDelete.length} orders...\n`);

  const result = await deleteOrdersBatch(allOrdersToDelete);

  console.log('\n✅ Deletion Summary:');
  console.log(`   Successfully ${dryRun ? 'would delete' : 'deleted'}: ${result.deleted}`);
  if (result.failed > 0) {
    console.log(`   Failed: ${result.failed}`);
  }
  console.log(`   V2 orders preserved: ${v2Orders.length}\n`);

  if (dryRun) {
    console.log('💡 This was a dry run. To actually delete, run:');
    console.log('   node scripts/delete-v1-orders.js --confirm\n');
  } else {
    console.log('✅ Deletion completed!\n');
  }
}

// Run the script
main().catch(error => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});
