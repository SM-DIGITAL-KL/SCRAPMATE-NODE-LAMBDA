/**
 * Script to delete all active pickups (orders) related to bulk requests from the database
 * Usage: node scripts/delete-all-bulk-request-orders.js
 */

require('dotenv').config();
const { getDynamoDBClient } = require('../config/dynamodb');
const { ScanCommand, DeleteCommand } = require('@aws-sdk/lib-dynamodb');

async function deleteAllBulkRequestOrders() {
  try {
    const client = getDynamoDBClient();
    const TABLE_NAME = 'orders';
    const { ListTablesCommand } = require('@aws-sdk/client-dynamodb');
    
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🗑️  DELETING ALL ACTIVE PICKUPS FROM BULK REQUESTS');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    // Check if table exists
    try {
      const listTablesCommand = new ListTablesCommand({});
      const listResponse = await client.send(listTablesCommand);
      const tableExists = listResponse.TableNames && listResponse.TableNames.includes(TABLE_NAME);
      
      if (!tableExists) {
        console.log(`⚠️  Table '${TABLE_NAME}' does not exist in the database.`);
        console.log(`   Available tables: ${listResponse.TableNames?.join(', ') || 'None'}`);
        console.log(`\n   The table might not have been created yet, or you might need to connect to a different database.`);
        process.exit(0);
      }
    } catch (listError) {
      console.warn(`⚠️  Could not check if table exists: ${listError.message}`);
      console.log(`   Proceeding with deletion attempt...\n`);
    }

    let deletedCount = 0;
    let scannedCount = 0;
    let lastKey = null;

    do {
      // Scan all orders
      const scanParams = {
        TableName: TABLE_NAME
      };

      if (lastKey) {
        scanParams.ExclusiveStartKey = lastKey;
      }

      const scanCommand = new ScanCommand(scanParams);
      const scanResponse = await client.send(scanCommand);

      if (scanResponse.Items && scanResponse.Items.length > 0) {
        scannedCount += scanResponse.Items.length;
        
        // Filter orders that:
        // 1. Have bulk_request_id field (not null/undefined)
        // 2. Are in active pickup status (status 2 = accepted, 3 = pickup started, 4 = arrived)
        const bulkRequestOrders = scanResponse.Items.filter(item => {
          const hasBulkRequestId = item.bulk_request_id !== null && item.bulk_request_id !== undefined;
          const isActivePickup = item.status === 2 || item.status === 3 || item.status === 4;
          return hasBulkRequestId && isActivePickup;
        });

        if (bulkRequestOrders.length > 0) {
          console.log(`📦 Found ${bulkRequestOrders.length} active bulk request order(s) to delete...`);

          // Delete each order
          for (const order of bulkRequestOrders) {
            const deleteParams = {
              TableName: TABLE_NAME,
              Key: {
                id: order.id
              }
            };

            const deleteCommand = new DeleteCommand(deleteParams);
            await client.send(deleteCommand);
            
            deletedCount++;
            const statusLabel = order.status === 2 ? 'Accepted' : order.status === 3 ? 'Pickup Started' : order.status === 4 ? 'Arrived' : `Status ${order.status}`;
            console.log(`   ✅ Deleted order ID: ${order.id} (Order #: ${order.order_number || order.order_no || 'N/A'}, Status: ${statusLabel}, Bulk Request ID: ${order.bulk_request_id})`);
          }
        }
      }

      lastKey = scanResponse.LastEvaluatedKey;
    } while (lastKey);

    console.log(`\n✅ Successfully deleted ${deletedCount} active bulk request order(s)`);
    console.log(`   Total orders scanned: ${scannedCount}\n`);
  } catch (error) {
    if (error.name === 'ResourceNotFoundException') {
      console.error(`\n❌ Table 'orders' does not exist in the database.`);
      console.error(`   This could mean:`);
      console.error(`   1. The table hasn't been created yet`);
      console.error(`   2. You're connected to the wrong database/region`);
      console.error(`   3. The table exists in a different AWS account`);
      console.error(`\n   If you need to delete from production, ensure you're connected to the correct AWS credentials.`);
    } else {
      console.error('❌ Error deleting bulk request orders:', error.message);
      console.error('   Full error:', error);
    }
    process.exit(1);
  }
}

deleteAllBulkRequestOrders();

