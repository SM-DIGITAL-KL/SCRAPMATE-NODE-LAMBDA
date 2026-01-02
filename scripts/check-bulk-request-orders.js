/**
 * Script to check for orders with bulk_request_id field
 * Usage: node scripts/check-bulk-request-orders.js
 */

require('dotenv').config();
const { getDynamoDBClient } = require('../config/dynamodb');
const { ScanCommand } = require('@aws-sdk/lib-dynamodb');

async function checkBulkRequestOrders() {
  try {
    const client = getDynamoDBClient();
    const TABLE_NAME = 'orders';
    
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🔍 CHECKING FOR BULK REQUEST ORDERS');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    let allOrders = [];
    let lastKey = null;

    do {
      const scanParams = {
        TableName: TABLE_NAME
      };

      if (lastKey) {
        scanParams.ExclusiveStartKey = lastKey;
      }

      const scanCommand = new ScanCommand(scanParams);
      const scanResponse = await client.send(scanCommand);

      if (scanResponse.Items && scanResponse.Items.length > 0) {
        allOrders.push(...scanResponse.Items);
      }

      lastKey = scanResponse.LastEvaluatedKey;
    } while (lastKey);

    console.log(`📊 Total orders scanned: ${allOrders.length}\n`);

    // Filter orders with bulk_request_id
    const bulkRequestOrders = allOrders.filter(item => {
      return item.bulk_request_id !== null && item.bulk_request_id !== undefined;
    });

    console.log(`📦 Orders with bulk_request_id: ${bulkRequestOrders.length}\n`);

    if (bulkRequestOrders.length > 0) {
      console.log('📋 Bulk Request Orders:');
      bulkRequestOrders.forEach((order, index) => {
        const statusLabel = order.status === 2 ? 'Accepted (2)' : 
                           order.status === 3 ? 'Pickup Started (3)' : 
                           order.status === 4 ? 'Arrived (4)' : 
                           order.status === 5 ? 'Completed (5)' : 
                           `Status ${order.status}`;
        
        console.log(`\n${index + 1}. Order ID: ${order.id}`);
        console.log(`   Order Number: ${order.order_number || order.order_no || 'N/A'}`);
        console.log(`   Status: ${statusLabel}`);
        console.log(`   Bulk Request ID: ${order.bulk_request_id}`);
        console.log(`   Customer ID: ${order.customer_id || 'N/A'}`);
        console.log(`   Shop ID: ${order.shop_id || 'N/A'}`);
      });

      // Group by status
      const byStatus = {
        2: bulkRequestOrders.filter(o => o.status === 2),
        3: bulkRequestOrders.filter(o => o.status === 3),
        4: bulkRequestOrders.filter(o => o.status === 4),
        5: bulkRequestOrders.filter(o => o.status === 5),
        other: bulkRequestOrders.filter(o => ![2, 3, 4, 5].includes(o.status))
      };

      console.log('\n📊 Summary by Status:');
      console.log(`   Accepted (2): ${byStatus[2].length}`);
      console.log(`   Pickup Started (3): ${byStatus[3].length}`);
      console.log(`   Arrived (4): ${byStatus[4].length}`);
      console.log(`   Completed (5): ${byStatus[5].length}`);
      console.log(`   Other: ${byStatus.other.length}`);
      console.log(`\n   Active Pickups (2,3,4): ${byStatus[2].length + byStatus[3].length + byStatus[4].length}`);
    } else {
      console.log('ℹ️  No orders found with bulk_request_id field.');
      console.log('   This means either:');
      console.log('   1. No bulk request orders have been created yet');
      console.log('   2. The bulk_request_id field is not set on existing orders');
    }

    console.log('\n');
  } catch (error) {
    console.error('❌ Error checking bulk request orders:', error.message);
    console.error('   Full error:', error);
    process.exit(1);
  }
}

checkBulkRequestOrders();

