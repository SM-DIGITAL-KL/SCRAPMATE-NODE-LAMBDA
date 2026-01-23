/**
 * Script to delete a bulk sell request from DynamoDB
 * Usage: node scripts/delete-bulk-sell-request.js <requestId>
 */

const { getDynamoDBClient } = require('../config/dynamodb');
const { DeleteCommand, GetCommand } = require('@aws-sdk/lib-dynamodb');

const TABLE_NAME = 'bulk_sell_requests';

async function deleteBulkSellRequest(requestId) {
  try {
    console.log(`\n🗑️  Deleting bulk sell request ID: ${requestId}\n`);

    const client = getDynamoDBClient();
    const rid = typeof requestId === 'string' && !isNaN(requestId) ? parseInt(requestId) : requestId;

    // First, find the request to get details
    const getCommand = new GetCommand({
      TableName: TABLE_NAME,
      Key: { id: rid }
    });

    const response = await client.send(getCommand);
    if (!response.Item) {
      console.log(`❌ Bulk sell request not found for ID: ${requestId}`);
      return null;
    }

    const request = response.Item;
    console.log(`✅ Found bulk sell request:`);
    console.log(`   Request ID: ${request.id}`);
    console.log(`   Seller ID: ${request.seller_id}`);
    console.log(`   Quantity: ${request.quantity || 'N/A'} kg`);
    console.log(`   Asking Price: ${request.asking_price ? `₹${request.asking_price}` : 'N/A'}`);
    console.log(`   Status: ${request.status || 'N/A'}`);
    console.log(`   Location: ${request.location || 'N/A'}`);
    console.log(`   Created At: ${request.created_at || 'N/A'}\n`);

    // Confirm deletion
    console.log(`⚠️  Proceeding to delete this bulk sell request...\n`);

    // Delete the request
    const deleteCommand = new DeleteCommand({
      TableName: TABLE_NAME,
      Key: { id: rid }
    });

    await client.send(deleteCommand);
    console.log(`✅ Bulk sell request deleted successfully!`);
    console.log(`   Deleted Request ID: ${request.id}`);
    console.log(`   Deleted Seller ID: ${request.seller_id}\n`);

    return request;
  } catch (error) {
    console.error('❌ Error deleting bulk sell request:', error);
    throw error;
  }
}

const requestId = process.argv[2];

if (!requestId) {
  console.error('❌ Error: Request ID is required');
  console.log('Usage: node scripts/delete-bulk-sell-request.js <requestId>');
  process.exit(1);
}

deleteBulkSellRequest(requestId)
  .then(() => {
    console.log('✅ Script completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Script failed:', error);
    process.exit(1);
  });
