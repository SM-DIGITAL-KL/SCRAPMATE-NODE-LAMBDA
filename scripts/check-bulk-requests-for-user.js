/**
 * Script to check bulk scrap requests visible to a specific user
 * Usage: node scripts/check-bulk-requests-for-user.js <phoneNumber>
 * 
 * Example: node scripts/check-bulk-requests-for-user.js 9074135122
 */

require('dotenv').config();
const User = require('../models/User');
const Shop = require('../models/Shop');
const BulkScrapRequest = require('../models/BulkScrapRequest');

async function findUserByPhone(phoneNumber) {
  try {
    const { getDynamoDBClient } = require('../config/dynamodb');
    const { ScanCommand } = require('@aws-sdk/lib-dynamodb');
    const client = getDynamoDBClient();
    
    const phoneFormats = [
      String(phoneNumber),
      parseInt(phoneNumber),
      phoneNumber
    ];
    
    for (const phoneFormat of phoneFormats) {
      let scanKey = null;
      let foundUsers = [];
      
      do {
        const scanParams = {
          TableName: 'users',
          FilterExpression: 'mob_num = :mobNum',
          ExpressionAttributeValues: {
            ':mobNum': phoneFormat
          }
        };
        
        if (scanKey) {
          scanParams.ExclusiveStartKey = scanKey;
        }
        
        const scanCommand = new ScanCommand(scanParams);
        const response = await client.send(scanCommand);
        
        if (response.Items) {
          foundUsers.push(...response.Items);
        }
        scanKey = response.LastEvaluatedKey;
      } while (scanKey);
      
      if (foundUsers.length > 0) {
        return foundUsers[0];
      }
    }

    return null;
  } catch (error) {
    console.error('Error finding user:', error);
    return null;
  }
}

async function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    console.log('Usage: node scripts/check-bulk-requests-for-user.js <phoneNumber>');
    console.log('\nExample: node scripts/check-bulk-requests-for-user.js 9074135122');
    process.exit(1);
  }

  const phoneNumber = args[0];

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🔍 FINDING USER');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`Phone Number: ${phoneNumber}\n`);

  const user = await findUserByPhone(phoneNumber);

  if (!user) {
    console.log(`❌ User not found for phone number: ${phoneNumber}`);
    process.exit(1);
  }

  console.log(`✅ Found user:`);
  console.log(`   Name: ${user.name || user.company_name || `User_${user.id}`}`);
  console.log(`   User ID: ${user.id}`);
  console.log(`   User Type: ${user.user_type || 'N/A'}`);
  console.log(`   App Type: ${user.app_type || 'N/A'}`);
  console.log(`   Del Status: ${user.del_status || 'N/A'}`);

  // Get user's shop location
  const shops = await Shop.findAllByUserId(user.id);
  if (shops.length === 0) {
    console.log(`\n❌ User has no shops. Cannot check bulk requests without location.`);
    process.exit(1);
  }

  // Find shop with location
  let shopWithLocation = null;
  for (const shop of shops) {
    if (shop.lat_log) {
      shopWithLocation = shop;
      break;
    }
  }

  if (!shopWithLocation) {
    console.log(`\n❌ User's shops have no location data (lat_log). Cannot check bulk requests.`);
    process.exit(1);
  }

  const [lat, lng] = shopWithLocation.lat_log.split(',').map(Number);
  console.log(`\n✅ Using shop location:`);
  console.log(`   Shop ID: ${shopWithLocation.id}`);
  console.log(`   Shop Name: ${shopWithLocation.shopname || shopWithLocation.name || 'N/A'}`);
  console.log(`   Shop Type: ${shopWithLocation.shop_type || 'N/A'}`);
  console.log(`   Location: ${shopWithLocation.lat_log}`);
  console.log(`   Latitude: ${lat}`);
  console.log(`   Longitude: ${lng}`);

  // Determine user type for query
  const userType = user.user_type || 'R';
  console.log(`\n📋 User Type for query: ${userType}`);

  // Get bulk scrap requests for this user
  console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log('📦 CHECKING BULK SCRAP REQUESTS');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  try {
    const requests = await BulkScrapRequest.findForUser(user.id, lat, lng, userType);
    
    console.log(`✅ Found ${requests.length} bulk scrap request(s) visible to this user\n`);

    if (requests.length === 0) {
      console.log('   No bulk scrap requests found within range.');
      console.log('   This could mean:');
      console.log('   1. No active bulk scrap requests exist');
      console.log('   2. All requests are outside your preferred distance range');
      console.log('   3. The bulk_scrap_requests table does not exist yet');
    } else {
      requests.forEach((request, index) => {
        console.log(`\n📦 Request ${index + 1}:`);
        console.log(`   Request ID: ${request.id}`);
        console.log(`   Buyer: ${request.buyer_name || `User_${request.buyer_id}`} (ID: ${request.buyer_id})`);
        console.log(`   Buyer Mobile: ${request.buyer_mob_num || 'N/A'}`);
        console.log(`   Quantity: ${request.quantity} kg`);
        console.log(`   Preferred Price: ₹${request.preferred_price || 'N/A'}/kg`);
        console.log(`   Preferred Distance: ${request.preferred_distance || 50} km`);
        console.log(`   Distance from you: ${request.distance_km?.toFixed(2) || 'N/A'} km`);
        console.log(`   Scrap Type: ${request.scrap_type || 'N/A'}`);
        if (request.subcategories && request.subcategories.length > 0) {
          console.log(`   Subcategories:`);
          request.subcategories.forEach((sub, idx) => {
            console.log(`      ${idx + 1}. ${sub.subcategory_name} - ${sub.preferred_quantity} kg @ ₹${sub.preferred_price}/kg`);
          });
        }
        console.log(`   Location: ${request.location || 'N/A'}`);
        console.log(`   When Needed: ${request.when_needed || 'N/A'}`);
        console.log(`   Additional Notes: ${request.additional_notes || 'N/A'}`);
        console.log(`   Documents: ${request.documents?.length || 0} document(s)`);
        console.log(`   Status: ${request.status || 'active'}`);
        console.log(`   Created At: ${request.created_at || 'N/A'}`);
        if (request.accepted_vendors && request.accepted_vendors.length > 0) {
          console.log(`   Accepted by: ${request.accepted_vendors.length} vendor(s)`);
        }
        if (request.rejected_vendors && request.rejected_vendors.length > 0) {
          console.log(`   Rejected by: ${request.rejected_vendors.length} vendor(s)`);
        }
      });
    }

    console.log('\n✅ Check complete!\n');
  } catch (error) {
    if (error.name === 'ResourceNotFoundException' || error.__type === 'com.amazonaws.dynamodb.v20120810#ResourceNotFoundException') {
      console.log(`\n⚠️  Table "bulk_scrap_requests" does not exist yet.`);
      console.log(`   No bulk scrap requests can be found until the table is created.`);
      console.log(`   The table will be created automatically when the first bulk request is made.`);
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

