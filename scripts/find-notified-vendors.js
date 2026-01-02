/**
 * Script to find mobile numbers that were notified for a bulk scrap purchase request
 * Usage: node scripts/find-notified-vendors.js <buyerPhoneNumber> or <buyerId>
 */

require('dotenv').config();
const { getDynamoDBClient } = require('../config/dynamodb');
const { ScanCommand } = require('@aws-sdk/lib-dynamodb');
const User = require('../models/User');
const Shop = require('../models/Shop');

async function findUserByPhone(phoneNumber) {
  try {
    const client = getDynamoDBClient();
    let allUsers = [];
    let lastKey = null;

    // Try different phone number formats
    const phoneVariants = [
      phoneNumber,
      phoneNumber.toString(),
      `+91${phoneNumber}`,
      `91${phoneNumber}`,
      phoneNumber.replace(/^\+91/, ''),
      phoneNumber.replace(/^91/, '')
    ];

    // Scan all users and filter by phone number
    do {
      const params = {
        TableName: 'users'
      };

      if (lastKey) {
        params.ExclusiveStartKey = lastKey;
      }

      const command = new ScanCommand(params);
      const response = await client.send(command);

      if (response.Items) {
        allUsers.push(...response.Items);
      }

      lastKey = response.LastEvaluatedKey;
    } while (lastKey);

    // Filter by phone number variants
    for (const phone of phoneVariants) {
      const user = allUsers.find(u => u.mob_num === phone);
      if (user) {
        return user;
      }
    }

    return null;
  } catch (error) {
    console.error('Error finding user:', error);
    return null;
  }
}

async function findLatestBulkScrapRequest(buyerId) {
  try {
    const client = getDynamoDBClient();
    let allRequests = [];
    let lastKey = null;

    do {
      const params = {
        TableName: 'bulk_scrap_requests',
        FilterExpression: 'buyer_id = :buyer_id',
        ExpressionAttributeValues: {
          ':buyer_id': parseInt(buyerId)
        }
      };

      if (lastKey) {
        params.ExclusiveStartKey = lastKey;
      }

      const command = new ScanCommand(params);
      const response = await client.send(command);

      if (response.Items) {
        allRequests.push(...response.Items);
      }

      lastKey = response.LastEvaluatedKey;
    } while (lastKey);

    if (allRequests.length > 0) {
      // Sort by created_at descending
      allRequests.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
      return allRequests[0];
    }
    return null;
  } catch (error) {
    console.error('Error finding bulk scrap request:', error);
    return null;
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

async function findNearbyShopsForRequest(request) {
  try {
    const client = getDynamoDBClient();
    const lat = request.latitude;
    const lng = request.longitude;
    const radius = request.preferred_distance || 50;
    
    console.log(`\n🔍 Finding shops within ${radius}km of request location (${lat}, ${lng})...`);

    // Find all vendor_app users with types R, S, SR
    const allUsers = [];
    let lastKey = null;

    do {
      const params = {
        TableName: 'users',
        FilterExpression: 'app_type = :appType AND (user_type = :typeR OR user_type = :typeS OR user_type = :typeSR) AND (attribute_not_exists(del_status) OR del_status <> :deleted)',
        ExpressionAttributeValues: {
          ':appType': 'vendor_app',
          ':typeR': 'R',
          ':typeS': 'S',
          ':typeSR': 'SR',
          ':deleted': 2
        }
      };

      if (lastKey) {
        params.ExclusiveStartKey = lastKey;
      }

      const command = new ScanCommand(params);
      const response = await client.send(command);

      if (response.Items) {
        allUsers.push(...response.Items);
      }

      lastKey = response.LastEvaluatedKey;
    } while (lastKey);

    console.log(`   Found ${allUsers.length} vendor_app users (R, S, SR)`);

    // Get buyer's shop IDs to exclude
    const buyerShops = await Shop.findAllByUserId(request.buyer_id);
    const buyerShopIds = new Set();
    buyerShops.forEach(s => {
      if (s.id) {
        buyerShopIds.add(String(s.id));
        buyerShopIds.add(Number(s.id));
        if (!isNaN(s.id)) {
          buyerShopIds.add(parseInt(s.id));
        }
      }
    });

    // Find shops within radius
    const nearbyShops = [];
    
    for (const user of allUsers) {
      try {
        const isSRUser = user.user_type === 'SR';
        const shops = isSRUser 
          ? await Shop.findAllByUserId(user.id) 
          : [await Shop.findByUserId(user.id)].filter(s => s !== null);
        
        for (const shop of shops) {
          if (shop && shop.lat_log && shop.del_status !== 2) {
            const [shopLat, shopLng] = shop.lat_log.split(',').map(Number);
            if (!isNaN(shopLat) && !isNaN(shopLng)) {
              const distance = calculateDistance(lat, lng, shopLat, shopLng);
              
              if (distance <= radius) {
                // Check if this is buyer's shop
                const shopIdStr = String(shop.id || '');
                const shopIdNum = Number(shop.id);
                const isBuyerShop = buyerShopIds.has(shopIdStr) || buyerShopIds.has(shopIdNum);
                
                // Determine if shop should be notified based on type
                let shouldNotify = false;
                let shopCategory = '';
                
                if (user.user_type === 'S' || (user.user_type === 'SR' && shop.shop_type === 1)) {
                  shouldNotify = true;
                  shopCategory = 'B2B';
                } else if (user.user_type === 'R' || (user.user_type === 'SR' && (shop.shop_type === 2 || shop.shop_type === 3))) {
                  shouldNotify = true;
                  shopCategory = 'B2C';
                }
                
                if (shouldNotify && !isBuyerShop) {
                  nearbyShops.push({
                    user_id: user.id,
                    user_name: user.name || user.company_name || `User_${user.id}`,
                    user_type: user.user_type,
                    mob_num: user.mob_num || 'N/A',
                    fcm_token: user.fcm_token ? 'Yes' : 'No',
                    shop_id: shop.id,
                    shop_name: shop.shopname || shop.name || 'N/A',
                    shop_type: shop.shop_type || 'N/A',
                    shop_category: shopCategory,
                    distance: distance,
                    location: shop.lat_log
                  });
                }
              }
            }
          }
        }
      } catch (err) {
        console.error(`   ❌ Error processing user ${user.id}:`, err.message);
      }
    }

    // Sort by distance
    nearbyShops.sort((a, b) => a.distance - b.distance);
    
    return nearbyShops;
  } catch (error) {
    console.error('Error finding nearby shops:', error);
    return [];
  }
}

async function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    console.log('Usage: node scripts/find-notified-vendors.js <buyerPhoneNumber> or <buyerId>');
    process.exit(1);
  }

  const input = args[0];
  let buyer = null;
  let buyerId = null;

  // Try to find user by phone number
  if (!isNaN(input) && input.length === 10) {
    buyer = await findUserByPhone(input);
    if (buyer) {
      buyerId = buyer.id;
    }
  }

  // If not found, try as buyer ID
  if (!buyer && !isNaN(input) && input.length > 10) {
    buyerId = parseInt(input);
    buyer = await User.findById(buyerId);
  }

  if (!buyer || !buyerId) {
    console.log(`\n❌ Buyer not found for: ${input}`);
    process.exit(1);
  }

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('👤 BUYER INFORMATION');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`Name: ${buyer.name || buyer.company_name || `User_${buyer.id}`}`);
  console.log(`Phone: ${buyer.mob_num || 'N/A'}`);
  console.log(`User ID: ${buyer.id}`);
  console.log(`User Type: ${buyer.user_type || 'N/A'}`);

  // Find latest bulk scrap request
  const request = await findLatestBulkScrapRequest(buyerId);
  
  if (!request) {
    console.log(`\n❌ No bulk scrap request found for buyer ID: ${buyerId}`);
    process.exit(1);
  }

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📦 BULK SCRAP REQUEST');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`Request ID: ${request.id}`);
  console.log(`Created At: ${request.created_at}`);
  console.log(`Location: ${request.location || 'N/A'}`);
  console.log(`Latitude: ${request.latitude}`);
  console.log(`Longitude: ${request.longitude}`);
  console.log(`Preferred Distance: ${request.preferred_distance || 50} km`);
  console.log(`Quantity: ${request.quantity} kg`);
  console.log(`Scrap Type: ${request.scrap_type || 'N/A'}`);

  // Find nearby shops that should have been notified
  const notifiedShops = await findNearbyShopsForRequest(request);

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📱 NOTIFIED VENDORS (Mobile Numbers)');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  
  if (notifiedShops.length === 0) {
    console.log('❌ No vendors found within the preferred distance');
  } else {
    console.log(`\n✅ Found ${notifiedShops.length} vendor(s) that should have been notified:\n`);
    
    const b2bShops = notifiedShops.filter(s => s.shop_category === 'B2B');
    const b2cShops = notifiedShops.filter(s => s.shop_category === 'B2C');
    
    console.log(`📊 Summary:`);
    console.log(`   B2B Shops: ${b2bShops.length}`);
    console.log(`   B2C Shops: ${b2cShops.length}`);
    console.log(`   Total: ${notifiedShops.length}\n`);

    console.log('📋 Detailed List:\n');
    notifiedShops.forEach((shop, index) => {
      console.log(`${index + 1}. ${shop.user_name}`);
      console.log(`   📱 Mobile: ${shop.mob_num}`);
      console.log(`   👤 User ID: ${shop.user_id}`);
      console.log(`   🏪 User Type: ${shop.user_type}`);
      console.log(`   🏬 Shop ID: ${shop.shop_id}`);
      console.log(`   🏬 Shop Name: ${shop.shop_name}`);
      console.log(`   📍 Shop Type: ${shop.shop_type}`);
      console.log(`   🏷️  Category: ${shop.shop_category}`);
      console.log(`   📏 Distance: ${shop.distance.toFixed(2)} km`);
      console.log(`   📍 Location: ${shop.location}`);
      console.log(`   🔔 FCM Token: ${shop.fcm_token}`);
      console.log('');
    });

    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📱 MOBILE NUMBERS ONLY (for easy copy)');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    
    const mobileNumbers = notifiedShops
      .map(s => s.mob_num)
      .filter(m => m && m !== 'N/A')
      .join(', ');
    
    console.log(mobileNumbers || 'No mobile numbers found');
    console.log('');
  }

  console.log('✅ Check complete!\n');
}

main().catch(error => {
  console.error('❌ Error:', error);
  process.exit(1);
});

