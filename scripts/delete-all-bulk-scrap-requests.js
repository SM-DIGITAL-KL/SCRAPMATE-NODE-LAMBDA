/**
 * Script to delete all bulk scrap requests from the database
 * Usage: node scripts/delete-all-bulk-scrap-requests.js
 */

require('dotenv').config();
const { getDynamoDBClient } = require('../config/dynamodb');
const { ScanCommand, DeleteCommand } = require('@aws-sdk/lib-dynamodb');

async function deleteAllBulkScrapRequests() {
  try {
    const client = getDynamoDBClient();
    const TABLE_NAME = 'bulk_scrap_requests';
    const { ListTablesCommand } = require('@aws-sdk/client-dynamodb');
    
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🗑️  DELETING ALL BULK SCRAP REQUESTS');
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
        console.log(`   If the table exists in production, make sure you're connected to the correct AWS account/region.`);
        process.exit(0);
      }
    } catch (listError) {
      console.warn(`⚠️  Could not check if table exists: ${listError.message}`);
      console.log(`   Proceeding with deletion attempt...\n`);
    }

    let deletedCount = 0;
    let lastKey = null;

    do {
      // Scan all items
      const scanParams = {
        TableName: TABLE_NAME
      };

      if (lastKey) {
        scanParams.ExclusiveStartKey = lastKey;
      }

      const scanCommand = new ScanCommand(scanParams);
      const scanResponse = await client.send(scanCommand);

      if (scanResponse.Items && scanResponse.Items.length > 0) {
        console.log(`📦 Found ${scanResponse.Items.length} bulk scrap request(s) to delete...`);

        // Delete each item
        for (const item of scanResponse.Items) {
          const deleteParams = {
            TableName: TABLE_NAME,
            Key: {
              id: item.id
            }
          };

          const deleteCommand = new DeleteCommand(deleteParams);
          await client.send(deleteCommand);
          
          deletedCount++;
          console.log(`   ✅ Deleted request ID: ${item.id} (Buyer: ${item.buyer_id || 'N/A'})`);
        }
      }

      lastKey = scanResponse.LastEvaluatedKey;
    } while (lastKey);

    console.log(`\n✅ Successfully deleted ${deletedCount} bulk scrap request(s)\n`);
  } catch (error) {
    if (error.name === 'ResourceNotFoundException') {
      console.error(`\n❌ Table 'bulk_scrap_requests' does not exist in the database.`);
      console.error(`   This could mean:`);
      console.error(`   1. The table hasn't been created yet`);
      console.error(`   2. You're connected to the wrong database/region`);
      console.error(`   3. The table exists in a different AWS account`);
      console.error(`\n   If you need to delete from production, ensure you're connected to the correct AWS credentials.`);
    } else {
      console.error('❌ Error deleting bulk scrap requests:', error.message);
      console.error('   Full error:', error);
    }
    process.exit(1);
  }
}

deleteAllBulkScrapRequests();

