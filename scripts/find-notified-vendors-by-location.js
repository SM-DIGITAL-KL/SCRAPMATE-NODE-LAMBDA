/**
 * Script to find mobile numbers that were notified for a bulk scrap purchase request
 * Based on request location and preferred distance
 * Usage: node scripts/find-notified-vendors-by-location.js <latitude> <longitude> [preferredDistance] [buyerId]
 */

require('dotenv').config();
const { getDynamoDBClient } = require('../config/dynamodb');
const { ScanCommand } = require('@aws-sdk/lib-dynamodb');
const User = require('../models/User');
const Shop = require('../models/Shop');

function calculateDistance(lat1, lon1, lat2, lon2) {
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

async function findNearbyShopsForRequest(lat, lng, radius, buyerId = null) {
  try {
    console.log(`\n🔍 Finding shops within ${radius}km of location (${lat}, ${lng})...`);

    // Get buyer's shop IDs to exclude if buyerId provided
    const buyerShopIds = new Set();
    const buyerUserIds = new Set();
    
    if (buyerId) {
      try {
        const buyerShops = await Shop.findAllByUserId(buyerId);
        buyerShops.forEach(s => {
          if (s.id) {
            buyerShopIds.add(String(s.id));
            buyerShopIds.add(Number(s.id));
            if (!isNaN(s.id)) {
              buyerShopIds.add(parseInt(s.id));
            }
          }
        });
        buyerUserIds.add(String(buyerId));
        buyerUserIds.add(Number(buyerId));
        if (!isNaN(buyerId)) {
          buyerUserIds.add(parseInt(buyerId));
        }
        console.log(`   Excluding buyer's ${buyerShops.length} shop(s)`);
      } catch (err) {
        console.warn(`   Could not fetch buyer shops: ${err.message}`);
      }
    }

    // Find all vendor_app users with types R, S, SR
    const client = getDynamoDBClient();
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

    // Build quick lookup for users by ID
    const usersById = new Map();
    for (const user of allUsers) {
      usersById.set(String(user.id), user);
      if (!isNaN(user.id)) {
        usersById.set(String(parseInt(user.id)), user);
      }
    }

    // Batch fetch all shops for all vendor users (faster than N x findByUserId)
    const userIds = allUsers.map(u => u.id);
    const allVendorShops = await Shop.findByUserIds(userIds);

    // Debug: Count shops with/without location
    let shopsWithLocation = 0;
    let shopsWithoutLocation = 0;
    let totalShopsChecked = 0;

    // Find shops within radius
    const nearbyShops = [];

    for (const shop of allVendorShops) {
      totalShopsChecked++;
      if (!shop || shop.del_status === 2 || !shop.lat_log) {
        shopsWithoutLocation++;
        continue;
      }

      const user = usersById.get(String(shop.user_id));
      if (!user) {
        continue;
      }

      shopsWithLocation++;
      const [shopLat, shopLng] = shop.lat_log.split(',').map(Number);
      if (isNaN(shopLat) || isNaN(shopLng)) {
        shopsWithoutLocation++;
        continue;
      }

      const distance = calculateDistance(lat, lng, shopLat, shopLng);
      const withinRadius = distance <= radius;

      // Check if this is buyer's shop
      const shopIdStr = String(shop.id || '');
      const shopIdNum = Number(shop.id);
      const isBuyerShop = buyerShopIds.has(shopIdStr) || buyerShopIds.has(shopIdNum) ||
                         buyerUserIds.has(String(user.id)) || buyerUserIds.has(Number(user.id));

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
          within_radius: withinRadius,
          location: shop.lat_log
        });
      }
    }

    console.log(`   Shops checked: ${totalShopsChecked}, With location: ${shopsWithLocation}, Without location: ${shopsWithoutLocation}`);

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
  
  if (args.length < 2) {
    console.log('Usage: node scripts/find-notified-vendors-by-location.js <latitude> <longitude> [preferredDistance] [buyerId]');
    console.log('\nExample: node scripts/find-notified-vendors-by-location.js 9.127992 76.767018 50 1766760918011');
    process.exit(1);
  }

  const lat = parseFloat(args[0]);
  const lng = parseFloat(args[1]);
  const radius = args[2] ? parseFloat(args[2]) : 50;
  const buyerId = args[3] ? parseInt(args[3]) : null;

  if (isNaN(lat) || isNaN(lng)) {
    console.log('❌ Invalid latitude or longitude');
    process.exit(1);
  }

  if (isNaN(radius) || radius <= 0) {
    console.log('❌ Invalid preferred distance (must be > 0)');
    process.exit(1);
  }

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📦 BULK SCRAP REQUEST LOCATION');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`Latitude: ${lat}`);
  console.log(`Longitude: ${lng}`);
  console.log(`Preferred Distance: ${radius} km`);
  if (buyerId) {
    console.log(`Buyer ID: ${buyerId} (will exclude buyer's shops)`);
  }

  // Find nearby shops that should have been notified
  const notifiedShops = await findNearbyShopsForRequest(lat, lng, radius, buyerId);

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📱 NOTIFIED VENDORS (Mobile Numbers)');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  
  // Filter to show only within radius
  const withinRadiusShops = notifiedShops.filter(s => s.within_radius);
  const outsideRadiusShops = notifiedShops.filter(s => !s.within_radius);
  
  if (withinRadiusShops.length === 0) {
    console.log(`❌ No vendors found within ${radius}km`);
    if (notifiedShops.length > 0) {
      console.log(`\n⚠️  Found ${notifiedShops.length} vendor(s) but all are outside ${radius}km radius:`);
      outsideRadiusShops.slice(0, 5).forEach((shop, index) => {
        const dist = typeof shop.distance === 'number' ? shop.distance.toFixed(2) : 'N/A';
        console.log(`   ${index + 1}. ${shop.user_name} (${shop.mob_num}) - ${dist}km away`);
      });
      if (outsideRadiusShops.length > 5) {
        console.log(`   ... and ${outsideRadiusShops.length - 5} more`);
      }
    }
  } else {
    const notifiedShops = withinRadiusShops;
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
                    console.log(`   📏 Distance: ${shop.distance.toFixed(2)} km ${shop.within_radius ? '✅' : '❌ (outside radius)'}`);
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
    
    // Also show with FCM tokens
    const withFCM = notifiedShops.filter(s => s.fcm_token === 'Yes');
    const withoutFCM = notifiedShops.filter(s => s.fcm_token === 'No');
    
    console.log(`\n📊 FCM Token Status:`);
    console.log(`   With FCM Token: ${withFCM.length}`);
    console.log(`   Without FCM Token: ${withoutFCM.length}`);
    
    if (withoutFCM.length > 0) {
      console.log(`\n⚠️  Vendors without FCM tokens (won't receive notifications):`);
      withoutFCM.forEach(s => {
        console.log(`   - ${s.user_name} (${s.mob_num})`);
      });
    }
  }

  console.log('\n✅ Check complete!\n');
}

main().catch(error => {
  console.error('❌ Error:', error);
  process.exit(1);
});
