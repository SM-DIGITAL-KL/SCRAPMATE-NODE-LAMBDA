/**
 * Check bulk sell requests by seller ID
 * Usage: node scripts/check-bulk-sell-by-seller.js [seller_id]
 * Example: node scripts/check-bulk-sell-by-seller.js 1770518875103
 */

require('dotenv').config();
const { getDynamoDBClient } = require('../config/dynamodb');
const { ScanCommand } = require('@aws-sdk/lib-dynamodb');

async function main() {
  const args = process.argv.slice(2);
  const SELLER_ID = args[0] ? parseInt(args[0]) : 1770518875103;
  const PHONE_NUMBER = args[1] || '7373471937';
  const SELLER_NAME = args[2] || 'Yasmin metals';
  
  const client = getDynamoDBClient();
  const TABLE_NAME = 'bulk_sell_requests';

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📦 CHECKING BULK SELL REQUESTS FOR VENDOR');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  console.log(`📱 Phone: ${PHONE_NUMBER}`);
  console.log(`👤 Seller ID: ${SELLER_ID}`);
  console.log(`🏪 Name: ${SELLER_NAME}\n`);

  try {
    let allRequests = [];
    let lastKey = null;

    do {
      const scanParams = {
        TableName: TABLE_NAME,
        FilterExpression: 'seller_id = :seller_id',
        ExpressionAttributeValues: {
          ':seller_id': SELLER_ID
        }
      };
      
      if (lastKey) {
        scanParams.ExclusiveStartKey = lastKey;
      }
      
      const scanCommand = new ScanCommand(scanParams);
      const response = await client.send(scanCommand);
      
      if (response.Items) {
        allRequests.push(...response.Items);
      }
      
      lastKey = response.LastEvaluatedKey;
    } while (lastKey);

    console.log(`✅ Found ${allRequests.length} bulk sell request(s) for this vendor\n`);

    if (allRequests.length === 0) {
      console.log('   No bulk sell requests found for this vendor.');
    } else {
      allRequests.forEach((request, index) => {
        console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
        console.log(`📦 Request #${index + 1}`);
        console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
        console.log(`   Request ID: ${request.id}`);
        console.log(`   Seller ID: ${request.seller_id}`);
        console.log(`   Seller Name: ${request.seller_name || 'N/A'}`);
        console.log(`   Location: ${request.latitude}, ${request.longitude}`);
        console.log(`   Address: ${request.location || 'N/A'}`);
        console.log(`   Preferred Distance: ${request.preferred_distance || 50} km`);
        console.log(`   Scrap Type: ${request.scrap_type || 'N/A'}`);
        console.log(`   Quantity: ${request.quantity || 'N/A'} kg`);
        console.log(`   Asking Price: ₹${request.asking_price || 'N/A'}/kg`);
        console.log(`   When Available: ${request.when_available || 'N/A'}`);
        console.log(`   Additional Notes: ${request.additional_notes || 'N/A'}`);
        console.log(`   Status: ${request.status || 'active'}`);
        console.log(`   Created At: ${request.created_at || 'N/A'}`);
        console.log(`   Updated At: ${request.updated_at || 'N/A'}`);
        
        // Parse subcategories if stored as string
        let subcategories = [];
        if (request.subcategories) {
          try {
            subcategories = typeof request.subcategories === 'string' 
              ? JSON.parse(request.subcategories) 
              : request.subcategories;
          } catch (e) {
            console.log(`   ⚠️  Could not parse subcategories: ${e.message}`);
          }
        }
        
        if (subcategories.length > 0) {
          console.log(`   Subcategories:`);
          subcategories.forEach((sub, idx) => {
            console.log(`      ${idx + 1}. ${sub.subcategory_name || sub.name || 'N/A'} - Qty: ${sub.quantity || 'N/A'} kg`);
          });
        }
        
        // Parse accepted buyers
        let acceptedBuyers = [];
        if (request.accepted_buyers) {
          try {
            acceptedBuyers = typeof request.accepted_buyers === 'string'
              ? JSON.parse(request.accepted_buyers)
              : request.accepted_buyers;
          } catch (e) {
            // Ignore parse errors
          }
        }
        
        // Parse rejected buyers
        let rejectedBuyers = [];
        if (request.rejected_buyers) {
          try {
            rejectedBuyers = typeof request.rejected_buyers === 'string'
              ? JSON.parse(request.rejected_buyers)
              : request.rejected_buyers;
          } catch (e) {
            // Ignore parse errors
          }
        }
        
        console.log(`   Accepted by: ${acceptedBuyers.length} buyer(s)`);
        if (acceptedBuyers.length > 0) {
          acceptedBuyers.forEach((buyer, idx) => {
            console.log(`      ${idx + 1}. Buyer ID: ${buyer.user_id}, Committed: ${buyer.committed_quantity || 'N/A'} kg`);
          });
        }
        console.log(`   Rejected by: ${rejectedBuyers.length} buyer(s)`);
        
        // Calculate total committed quantity
        let totalCommitted = 0;
        acceptedBuyers.forEach(b => {
          totalCommitted += parseFloat(b.committed_quantity || 0);
        });
        console.log(`   Total Committed Quantity: ${totalCommitted} kg`);
      });
    }

    console.log('\n✅ Check complete!\n');
  } catch (error) {
    if (error.name === 'ResourceNotFoundException' || error.__type === 'com.amazonaws.dynamodb.v20120810#ResourceNotFoundException') {
      console.log(`\n⚠️  Table "bulk_sell_requests" does not exist yet.`);
      console.log(`   No bulk sell requests have been created yet.\n`);
    } else {
      console.error(`\n❌ Error checking bulk sell requests:`, error.message);
      console.error('   Full error:', error);
    }
  }
}

main().catch(error => {
  console.error('❌ Error:', error);
  process.exit(1);
});
