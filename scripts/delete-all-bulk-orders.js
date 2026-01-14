require('dotenv').config();
const { getDynamoDBClient } = require('../config/dynamodb');
const { ScanCommand, DeleteCommand } = require('@aws-sdk/lib-dynamodb');

/**
 * Permanently delete all bulk buy and bulk sell orders from the database
 * This includes:
 * - bulk_scrap_requests (bulk buy requests)
 * - bulk_sell_requests (bulk sell requests)
 * - pending_bulk_buy_orders (pending bulk buy orders)
 * WARNING: This is a destructive operation that cannot be undone!
 */
async function deleteAllBulkOrders() {
  try {
    const client = getDynamoDBClient();
    
    console.log('\n' + '='.repeat(80));
    console.log('🗑️  DELETE ALL BULK BUY AND BULK SELL ORDERS');
    console.log('='.repeat(80));
    console.log('⚠️  WARNING: This will PERMANENTLY delete all bulk orders from:');
    console.log('   - bulk_scrap_requests (bulk buy requests)');
    console.log('   - bulk_sell_requests (bulk sell requests)');
    console.log('   - pending_bulk_buy_orders (pending bulk buy orders)');
    console.log('⚠️  This action CANNOT be undone!\n');
    
    const tables = [
      { name: 'bulk_scrap_requests', description: 'Bulk Buy Requests' },
      { name: 'bulk_sell_requests', description: 'Bulk Sell Requests' },
      { name: 'pending_bulk_buy_orders', description: 'Pending Bulk Buy Orders' }
    ];
    
    const results = {};
    
    // Process each table
    for (const table of tables) {
      console.log(`\n📋 Processing ${table.description} (${table.name})...\n`);
      
      let totalFound = 0;
      let totalDeleted = 0;
      let totalErrors = 0;
      const itemsToDelete = [];
      let lastKey = null;
      
      // ========== STEP 1: FIND ALL ITEMS ==========
      console.log(`   Step 1: Finding all items in ${table.name}...`);
      
      do {
        const params = {
          TableName: table.name
        };
        
        if (lastKey) {
          params.ExclusiveStartKey = lastKey;
        }
        
        try {
          const command = new ScanCommand(params);
          const response = await client.send(command);
          
          if (response.Items && response.Items.length > 0) {
            itemsToDelete.push(...response.Items);
            totalFound += response.Items.length;
            console.log(`      Found ${response.Items.length} items in this batch (Total: ${totalFound})`);
          }
          
          lastKey = response.LastEvaluatedKey;
        } catch (error) {
          if (error.name === 'ResourceNotFoundException' || error.__type === 'com.amazonaws.dynamodb.v20120810#ResourceNotFoundException') {
            console.log(`      ⚠️  Table "${table.name}" does not exist. Skipping...`);
            break;
          } else {
            console.error(`      ❌ Error scanning ${table.name}:`, error.message);
            totalErrors++;
            break;
          }
        }
      } while (lastKey);
      
      if (itemsToDelete.length === 0) {
        console.log(`   ✅ No items found in ${table.name}. Nothing to delete.\n`);
        results[table.name] = {
          found: 0,
          deleted: 0,
          errors: totalErrors
        };
        continue;
      }
      
      console.log(`   ✅ Found ${itemsToDelete.length} item(s) total.\n`);
      
      // Show sample items
      if (itemsToDelete.length > 0) {
        console.log(`   📊 Sample items to be deleted (first 5):`);
        itemsToDelete.slice(0, 5).forEach((item, index) => {
          const id = item.id || item.request_id || 'N/A';
          const status = item.status || 'N/A';
          console.log(`      ${index + 1}. ID: ${id}, Status: ${status}`);
        });
        if (itemsToDelete.length > 5) {
          console.log(`      ... and ${itemsToDelete.length - 5} more items`);
        }
        console.log('');
      }
      
      // ========== STEP 2: DELETE ITEMS ==========
      console.log(`   Step 2: Permanently deleting items from ${table.name}...\n`);
      
      for (const item of itemsToDelete) {
        try {
          // Determine the key field (usually 'id')
          const keyField = item.id !== undefined ? 'id' : 
                          item.request_id !== undefined ? 'request_id' : 
                          'id';
          const keyValue = item[keyField];
          
          if (!keyValue) {
            console.error(`      ❌ Item missing key field ${keyField}, skipping:`, item);
            totalErrors++;
            continue;
          }
          
          const deleteCommand = new DeleteCommand({
            TableName: table.name,
            Key: { [keyField]: keyValue }
          });
          
          await client.send(deleteCommand);
          console.log(`      ✅ Deleted item ${keyValue} from ${table.name}`);
          totalDeleted++;
        } catch (error) {
          console.error(`      ❌ Error deleting item from ${table.name}:`, error.message);
          totalErrors++;
        }
      }
      
      results[table.name] = {
        found: totalFound,
        deleted: totalDeleted,
        errors: totalErrors
      };
      
      console.log(`\n   ✅ Completed ${table.description}:`);
      console.log(`      Found: ${totalFound}`);
      console.log(`      Deleted: ${totalDeleted}`);
      console.log(`      Errors: ${totalErrors}\n`);
    }

    // ========== SUMMARY ==========
    console.log('\n' + '='.repeat(80));
    console.log('📊 DELETION SUMMARY:');
    console.log('='.repeat(80));
    
    let grandTotalFound = 0;
    let grandTotalDeleted = 0;
    let grandTotalErrors = 0;
    
    tables.forEach(table => {
      const result = results[table.name] || { found: 0, deleted: 0, errors: 0 };
      console.log(`\n   ${table.description} (${table.name}):`);
      console.log(`      Found: ${result.found}`);
      console.log(`      Deleted: ${result.deleted}`);
      console.log(`      Errors: ${result.errors}`);
      
      grandTotalFound += result.found;
      grandTotalDeleted += result.deleted;
      grandTotalErrors += result.errors;
    });
    
    console.log('\n' + '='.repeat(80));
    console.log('   GRAND TOTALS:');
    console.log(`      Total Found: ${grandTotalFound}`);
    console.log(`      Total Deleted: ${grandTotalDeleted}`);
    console.log(`      Total Errors: ${grandTotalErrors}`);
    console.log('='.repeat(80) + '\n');

    if (grandTotalErrors > 0) {
      console.log('⚠️  Some errors occurred during deletion. Please review the logs above.\n');
    } else {
      console.log('✅ All bulk buy and bulk sell orders have been permanently deleted.\n');
    }

    return { 
      results,
      totals: {
        found: grandTotalFound,
        deleted: grandTotalDeleted,
        errors: grandTotalErrors
      }
    };
  } catch (error) {
    console.error('❌ Fatal error deleting bulk orders:', error);
    throw error;
  }
}

// Run the script
// Add confirmation prompt for safety
const readline = require('readline');
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

console.log('\n⚠️  WARNING: This script will PERMANENTLY DELETE ALL bulk buy and bulk sell orders!');
console.log('⚠️  This includes:');
console.log('   - All bulk_scrap_requests (bulk buy requests)');
console.log('   - All bulk_sell_requests (bulk sell requests)');
console.log('   - All pending_bulk_buy_orders (pending bulk buy orders)');
console.log('⚠️  This action CANNOT be undone!\n');

rl.question('Type "DELETE ALL BULK ORDERS" to confirm: ', (answer) => {
  if (answer === 'DELETE ALL BULK ORDERS') {
    rl.close();
    deleteAllBulkOrders()
      .then(result => {
        console.log('✅ Script completed successfully');
        process.exit(0);
      })
      .catch(error => {
        console.error('❌ Script failed:', error);
        process.exit(1);
      });
  } else {
    console.log('❌ Confirmation text does not match. Aborting deletion.');
    rl.close();
    process.exit(0);
  }
});



