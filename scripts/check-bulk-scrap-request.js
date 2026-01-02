/**
 * Script to check bulk scrap request details and notified vendors
 * Usage: node scripts/check-bulk-scrap-request.js <requestId>
 * Or: node scripts/check-bulk-scrap-request.js <buyerId> (to find latest request by buyer)
 */

require('dotenv').config();
const { getDynamoDBClient } = require('../config/dynamodb');
const { GetCommand, ScanCommand } = require('@aws-sdk/lib-dynamodb');
const User = require('../models/User');
const Shop = require('../models/Shop');

const TABLE_NAME = 'bulk_scrap_requests';

async function findUserByPhone(phoneNumber) {
  try {
    const client = getDynamoDBClient();
    const { ScanCommand } = require('@aws-sdk/lib-dynamodb');
    
    // Try different phone number formats
    const phoneVariants = [
      phoneNumber,
      phoneNumber.toString(),
      `+91${phoneNumber}`,
      `91${phoneNumber}`,
      phoneNumber.replace(/^\+91/, ''),
      phoneNumber.replace(/^91/, '')
    ];

    for (const phone of phoneVariants) {
      const command = new ScanCommand({
        TableName: 'users',
        FilterExpression: 'mob_num = :phone',
        ExpressionAttributeValues: {
          ':phone': phone
        }
      });

      const response = await client.send(command);
      if (response.Items && response.Items.length > 0) {
        return response.Items[0];
      }
    }

    return null;
  } catch (error) {
    console.error('Error finding user:', error);
    return null;
  }
}

async function getBulkScrapRequest(requestId) {
  try {
    const client = getDynamoDBClient();
    const command = new GetCommand({
      TableName: TABLE_NAME,
      Key: { id: requestId }
    });

    const response = await client.send(command);
    return response.Item || null;
  } catch (error) {
    console.error('Error getting bulk scrap request:', error);
    return null;
  }
}

async function findLatestRequestByBuyer(buyerId) {
  try {
    const client = getDynamoDBClient();
    const command = new ScanCommand({
      TableName: TABLE_NAME,
      FilterExpression: 'buyer_id = :buyer_id',
      ExpressionAttributeValues: {
        ':buyer_id': parseInt(buyerId)
      }
    });

    const response = await client.send(command);
    if (response.Items && response.Items.length > 0) {
      // Sort by created_at descending
      response.Items.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
      return response.Items[0];
    }
    return null;
  } catch (error) {
    console.error('Error finding request by buyer:', error);
    return null;
  }
}

async function checkUserShops(userId) {
  try {
    const shops = await Shop.findAllByUserId(userId);
    return shops || [];
  } catch (error) {
    console.error('Error finding user shops:', error);
    return [];
  }
}

async function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // Earth's radius in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

async function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    console.log('Usage: node scripts/check-bulk-scrap-request.js <requestId>');
    console.log('   Or: node scripts/check-bulk-scrap-request.js <buyerPhoneNumber>');
    process.exit(1);
  }

  const input = args[0];
  let request = null;

  // Try to parse as request ID first
  if (!isNaN(input) && input.length > 10) {
    // Looks like a request ID (timestamp-based)
    request = await getBulkScrapRequest(input);
  }

  // If not found, try to find by buyer phone number
  if (!request) {
    const user = await findUserByPhone(input);
    if (user) {
      console.log(`\n✅ Found user: ${user.name || `User_${user.id}`} (ID: ${user.id}, Type: ${user.user_type})`);
      request = await findLatestRequestByBuyer(user.id);
    } else {
      // Try as buyer ID directly
      request = await findLatestRequestByBuyer(input);
    }
  }

  if (!request) {
    console.log(`\n❌ Bulk scrap request not found for: ${input}`);
    process.exit(1);
  }

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📦 BULK SCRAP REQUEST DETAILS');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`Request ID: ${request.id}`);
  console.log(`Buyer ID: ${request.buyer_id}`);
  console.log(`Status: ${request.status || 'active'}`);
  console.log(`Created At: ${request.created_at}`);
  console.log(`Location: ${request.location || 'N/A'}`);
  console.log(`Latitude: ${request.latitude}`);
  console.log(`Longitude: ${request.longitude}`);
  console.log(`Preferred Distance: ${request.preferred_distance || 50} km`);
  console.log(`Quantity: ${request.quantity} kg`);
  console.log(`Scrap Type: ${request.scrap_type || 'N/A'}`);

  // Get buyer details
  const buyer = await User.findById(request.buyer_id);
  if (buyer) {
    console.log(`\n👤 BUYER DETAILS:`);
    console.log(`   Name: ${buyer.name || buyer.company_name || `User_${buyer.id}`}`);
    console.log(`   Phone: ${buyer.mob_num || 'N/A'}`);
    console.log(`   User Type: ${buyer.user_type || 'N/A'}`);
    console.log(`   App Type: ${buyer.app_type || 'N/A'}`);
    console.log(`   FCM Token: ${buyer.fcm_token ? 'Yes' : 'No'}`);
    
    // Get buyer's shops
    const buyerShops = await checkUserShops(request.buyer_id);
    console.log(`   Shops: ${buyerShops.length}`);
    buyerShops.forEach((shop, idx) => {
      console.log(`     ${idx + 1}. Shop ID: ${shop.id}, Type: ${shop.shop_type || 'N/A'}, Location: ${shop.lat_log || 'N/A'}`);
    });
  }

  // Parse subcategories
  let subcategories = request.subcategories;
  if (typeof subcategories === 'string') {
    try {
      subcategories = JSON.parse(subcategories);
    } catch (e) {
      subcategories = null;
    }
  }
  if (subcategories && Array.isArray(subcategories)) {
    console.log(`\n📋 SUBCATEGORIES (${subcategories.length}):`);
    subcategories.forEach((sub, idx) => {
      console.log(`   ${idx + 1}. ${sub.subcategory_name || sub.name || 'N/A'} - ${sub.preferred_quantity || 'N/A'} kg @ ₹${sub.preferred_price || 'N/A'}/kg`);
    });
  }

  // Check for user 9074135121
  console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log('🔍 CHECKING USER 9074135121');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  
  const targetUser = await findUserByPhone('9074135121');
  if (!targetUser) {
    console.log('❌ User 9074135121 not found in database');
    process.exit(1);
  }

  console.log(`✅ Found user: ${targetUser.name || `User_${targetUser.id}`}`);
  console.log(`   User ID: ${targetUser.id}`);
  console.log(`   User Type: ${targetUser.user_type || 'N/A'}`);
  console.log(`   App Type: ${targetUser.app_type || 'N/A'}`);
  console.log(`   Del Status: ${targetUser.del_status || 'N/A'}`);
  console.log(`   FCM Token: ${targetUser.fcm_token ? 'Yes (present)' : 'No (missing)'}`);

  // Get user's shops
  const userShops = await checkUserShops(targetUser.id);
  console.log(`\n🏪 USER'S SHOPS (${userShops.length}):`);
  
  if (userShops.length === 0) {
    console.log('   ❌ User has no shops');
  } else {
    userShops.forEach((shop, idx) => {
      console.log(`\n   ${idx + 1}. Shop ID: ${shop.id}`);
      console.log(`      Shop Type: ${shop.shop_type || 'N/A'}`);
      console.log(`      Del Status: ${shop.del_status || 'N/A'}`);
      console.log(`      Location: ${shop.lat_log || 'N/A'}`);
      
      if (shop.lat_log) {
        const [shopLat, shopLng] = shop.lat_log.split(',').map(Number);
        if (!isNaN(shopLat) && !isNaN(shopLng)) {
          const distance = calculateDistance(
            request.latitude,
            request.longitude,
            shopLat,
            shopLng
          );
          const preferredDistance = request.preferred_distance || 50;
          const isWithinRange = distance <= preferredDistance;
          
          console.log(`      Distance from request: ${distance.toFixed(2)} km`);
          console.log(`      Preferred distance: ${preferredDistance} km`);
          console.log(`      Within range: ${isWithinRange ? '✅ YES' : '❌ NO'}`);
          
          // Check if this shop should be notified
          const isB2BShop = shop.shop_type === '1' || targetUser.user_type === 'S' || targetUser.user_type === 'SR';
          const isB2CShop = (shop.shop_type === '2' || shop.shop_type === '3') || targetUser.user_type === 'R' || targetUser.user_type === 'SR';
          const isBuyerShop = shop.user_id === request.buyer_id;
          
          console.log(`      Shop Type Check:`);
          console.log(`         - B2B (S): ${isB2BShop ? '✅' : '❌'}`);
          console.log(`         - B2C (R): ${isB2CShop ? '✅' : '❌'}`);
          console.log(`         - Is Buyer's Shop: ${isBuyerShop ? '✅ YES (excluded)' : '❌ NO'}`);
          
          if (isWithinRange && (isB2BShop || isB2CShop) && !isBuyerShop) {
            console.log(`      ⚠️  This shop SHOULD have been notified!`);
          } else if (isBuyerShop) {
            console.log(`      ℹ️  This is the buyer's own shop - correctly excluded`);
          } else if (!isWithinRange) {
            console.log(`      ℹ️  Shop is outside preferred distance`);
          } else {
            console.log(`      ℹ️  Shop type doesn't match notification criteria`);
          }
        } else {
          console.log(`      ⚠️  Invalid location data`);
        }
      } else {
        console.log(`      ⚠️  No location data (lat_log missing)`);
      }
    });
  }

  // Check accepted/rejected vendors
  let acceptedVendors = [];
  let rejectedVendors = [];
  
  if (request.accepted_vendors) {
    try {
      acceptedVendors = typeof request.accepted_vendors === 'string'
        ? JSON.parse(request.accepted_vendors)
        : request.accepted_vendors;
    } catch (e) {
      console.warn('Could not parse accepted_vendors');
    }
  }
  
  if (request.rejected_vendors) {
    try {
      rejectedVendors = typeof request.rejected_vendors === 'string'
        ? JSON.parse(request.rejected_vendors)
        : request.rejected_vendors;
    } catch (e) {
      console.warn('Could not parse rejected_vendors');
    }
  }

  console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log('📊 REQUEST STATUS');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`Accepted Vendors: ${acceptedVendors.length}`);
  if (acceptedVendors.length > 0) {
    acceptedVendors.forEach((v, idx) => {
      console.log(`   ${idx + 1}. User ID: ${v.user_id}, Type: ${v.user_type}, Shop ID: ${v.shop_id || 'N/A'}`);
    });
  }
  console.log(`Rejected Vendors: ${rejectedVendors.length}`);
  if (rejectedVendors.length > 0) {
    rejectedVendors.forEach((v, idx) => {
      console.log(`   ${idx + 1}. User ID: ${v.user_id}, Type: ${v.user_type}, Reason: ${v.rejection_reason || 'N/A'}`);
    });
  }

  console.log('\n✅ Check complete!\n');
}

main().catch(error => {
  console.error('❌ Error:', error);
  process.exit(1);
});


