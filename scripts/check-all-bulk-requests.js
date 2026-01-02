/**
 * Script to check all bulk scrap requests in the database
 * Usage: node scripts/check-all-bulk-requests.js
 */

require('dotenv').config();
const { getDynamoDBClient } = require('../config/dynamodb');
const { ScanCommand } = require('@aws-sdk/lib-dynamodb');

async function main() {
  const client = getDynamoDBClient();
  const TABLE_NAME = 'bulk_scrap_requests';

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📦 CHECKING ALL BULK SCRAP REQUESTS');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  try {
    let allRequests = [];
    let lastKey = null;

    do {
      const scanParams = {
        TableName: TABLE_NAME
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

    console.log(`✅ Found ${allRequests.length} bulk scrap request(s) in database\n`);

    if (allRequests.length === 0) {
      console.log('   No bulk scrap requests found in the database.');
      console.log('   This means no requests have been created yet.\n');
    } else {
      allRequests.forEach((request, index) => {
        console.log(`\n📦 Request ${index + 1}:`);
        console.log(`   Request ID: ${request.id}`);
        console.log(`   Buyer ID: ${request.buyer_id}`);
        console.log(`   Buyer Name: ${request.buyer_name || 'N/A'}`);
        console.log(`   Location: ${request.latitude}, ${request.longitude}`);
        console.log(`   Preferred Distance: ${request.preferred_distance || 50} km`);
        console.log(`   Quantity: ${request.quantity || 'N/A'} kg`);
        console.log(`   Preferred Price: ₹${request.preferred_price || 'N/A'}/kg`);
        console.log(`   Scrap Type: ${request.scrap_type || 'N/A'}`);
        console.log(`   Status: ${request.status || 'active'}`);
        console.log(`   Created At: ${request.created_at || 'N/A'}`);
        
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
            console.log(`      ${idx + 1}. ${sub.subcategory_name || sub.name || 'N/A'} - ${sub.preferred_quantity || 'N/A'} kg @ ₹${sub.preferred_price || 'N/A'}/kg`);
          });
        }
        
        // Parse accepted/rejected vendors
        let acceptedVendors = [];
        if (request.accepted_vendors) {
          try {
            acceptedVendors = typeof request.accepted_vendors === 'string'
              ? JSON.parse(request.accepted_vendors)
              : request.accepted_vendors;
          } catch (e) {
            // Ignore parse errors
          }
        }
        
        let rejectedVendors = [];
        if (request.rejected_vendors) {
          try {
            rejectedVendors = typeof request.rejected_vendors === 'string'
              ? JSON.parse(request.rejected_vendors)
              : request.rejected_vendors;
          } catch (e) {
            // Ignore parse errors
          }
        }
        
        console.log(`   Accepted by: ${acceptedVendors.length} vendor(s)`);
        console.log(`   Rejected by: ${rejectedVendors.length} vendor(s)`);
      });
    }

    console.log('\n✅ Check complete!\n');
  } catch (error) {
    if (error.name === 'ResourceNotFoundException' || error.__type === 'com.amazonaws.dynamodb.v20120810#ResourceNotFoundException') {
      console.log(`\n⚠️  Table "bulk_scrap_requests" does not exist yet.`);
      console.log(`   The table will be created automatically when the first bulk request is made.`);
      console.log(`   Currently, there are no bulk scrap requests in the database.\n`);
    } else {
      console.error(`\n❌ Error checking bulk requests:`, error.message);
      console.error(`   Full error:`, error);
    }
  }
}

main().catch(error => {
  console.error('❌ Error:', error);
  process.exit(1);
});

