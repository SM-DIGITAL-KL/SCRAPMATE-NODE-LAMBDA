/**
 * Script to create a bulk buy request for a user
 * Usage: node scripts/create-bulk-buy-request.js <phoneNumber>
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
    
    // Try different phone number formats
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
    console.log('Usage: node scripts/create-bulk-buy-request.js <phoneNumber>');
    console.log('\nExample: node scripts/create-bulk-buy-request.js 9074135125');
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
  console.log(`   Phone: ${user.mob_num || 'N/A'}`);

  // Check if user is B2B (S or SR)
  if (user.user_type !== 'S' && user.user_type !== 'SR') {
    console.log(`\n❌ User must be B2B type (S or SR) to create bulk buy requests. Current type: ${user.user_type}`);
    process.exit(1);
  }

  // Get user's shop location
  const shops = await Shop.findAllByUserId(user.id);
  if (shops.length === 0) {
    console.log(`\n❌ User has no shops. Cannot create bulk buy request without location.`);
    process.exit(1);
  }

  // Use first shop with location
  let shopWithLocation = null;
  for (const shop of shops) {
    if (shop.lat_log) {
      shopWithLocation = shop;
      break;
    }
  }

  if (!shopWithLocation) {
    console.log(`\n❌ User's shops have no location data (lat_log). Cannot create bulk buy request.`);
    process.exit(1);
  }

  const [lat, lng] = shopWithLocation.lat_log.split(',').map(Number);
  console.log(`\n✅ Using shop location:`);
  console.log(`   Shop ID: ${shopWithLocation.id}`);
  console.log(`   Shop Name: ${shopWithLocation.shopname || shopWithLocation.name || 'N/A'}`);
  console.log(`   Location: ${shopWithLocation.lat_log}`);
  console.log(`   Latitude: ${lat}`);
  console.log(`   Longitude: ${lng}`);

  // Create bulk buy request with sample data
  const requestData = {
    buyer_id: user.id,
    buyer_name: user.name || user.company_name || `User_${user.id}`,
    latitude: lat,
    longitude: lng,
    scrap_type: 'Mixed Scrap',
    subcategories: JSON.stringify([
      {
        subcategory_id: 1,
        subcategory_name: 'Engine Parts',
        preferred_quantity: 500, // kg
        preferred_price: 50 // per kg
      },
      {
        subcategory_id: 2,
        subcategory_name: 'Tyre (Old)',
        preferred_quantity: 300, // kg
        preferred_price: 30 // per kg
      }
    ]),
    quantity: 800, // total in kg
    preferred_price: 40, // average per kg
    preferred_distance: 50, // km
    location: shopWithLocation.address || 'Location from shop',
    additional_notes: 'Bulk buy request created via script',
    documents: null,
    status: 'active'
  };

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📦 CREATING BULK BUY REQUEST');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`Quantity: ${requestData.quantity} kg`);
  console.log(`Preferred Price: ₹${requestData.preferred_price}/kg`);
  console.log(`Preferred Distance: ${requestData.preferred_distance} km`);
  console.log(`Scrap Type: ${requestData.scrap_type}`);
  console.log(`Subcategories: 2 items`);

  try {
    const request = await BulkScrapRequest.create(requestData);
    console.log(`\n✅ Bulk buy request created successfully!`);
    console.log(`   Request ID: ${request.id}`);
    console.log(`   Created At: ${request.created_at}`);
    console.log(`\n📝 Note: This only creates the request in the database.`);
    console.log(`   To send notifications, you need to call the API endpoint:`);
    console.log(`   POST /api/v2/bulk-scrap/purchase`);
    console.log(`   with the same data.\n`);
  } catch (error) {
    console.error(`\n❌ Error creating bulk buy request:`, error.message);
    console.error(`   Full error:`, error);
    process.exit(1);
  }
}

main().catch(error => {
  console.error('❌ Error:', error);
  process.exit(1);
});

