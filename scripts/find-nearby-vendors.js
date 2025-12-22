/**
 * Find nearby scrap vendors (B2B and B2C) for a given phone number
 * 
 * Usage:
 *   node scripts/find-nearby-vendors.js <phone_number> [radius_km]
 * 
 * Example:
 *   node scripts/find-nearby-vendors.js 9074135121 15
 */

require('dotenv').config();
const { getDynamoDBClient } = require('../config/dynamodb');
const { ScanCommand } = require('@aws-sdk/lib-dynamodb');
const User = require('../models/User');
const Address = require('../models/Address');
const Shop = require('../models/Shop');

// Haversine formula to calculate distance between two coordinates
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

async function getUserLocation(phoneNumber) {
  try {
    // Find user by phone number
    const user = await User.findByMobile(phoneNumber);
    if (!user) {
      console.log(`❌ User not found for phone number: ${phoneNumber}`);
      return null;
    }

    console.log(`✅ Found user: ID=${user.id}, Name=${user.name}, Type=${user.user_type}`);

    // Try to get address with location
    if (user.id) {
      const addresses = await Address.findByCustomerId(user.id);
      if (addresses && addresses.length > 0) {
        // Find address with lat_log
        const addressWithLocation = addresses.find(addr => 
          (addr.lat_log && addr.lat_log.includes(',')) || 
          (addr.latitude && addr.longitude)
        );

        if (addressWithLocation) {
          let lat, lng;
          if (addressWithLocation.lat_log) {
            [lat, lng] = addressWithLocation.lat_log.split(',').map(Number);
          } else if (addressWithLocation.latitude && addressWithLocation.longitude) {
            lat = parseFloat(addressWithLocation.latitude);
            lng = parseFloat(addressWithLocation.longitude);
          }

          if (lat && lng && !isNaN(lat) && !isNaN(lng)) {
            console.log(`✅ Found user location from address: ${lat}, ${lng}`);
            return { lat, lng, user };
          }
        }
      }
    }

    console.log(`⚠️  No location found for user ${user.id}. Please provide lat/long manually.`);
    return { lat: null, lng: null, user };
  } catch (error) {
    console.error('❌ Error getting user location:', error);
    return null;
  }
}

async function findVendors(userLat, userLng, radiusKm) {
  try {
    const client = getDynamoDBClient();
    const vendors = [];
    let lastKey = null;

    // Get all shops (vendors)
    console.log('🔍 Scanning shops for vendors...');
    do {
      const params = {
        TableName: 'shops',
        FilterExpression: 'del_status = :status',
        ExpressionAttributeValues: {
          ':status': 1
        }
      };
      
      if (lastKey) {
        params.ExclusiveStartKey = lastKey;
      }
      
      const command = new ScanCommand(params);
      const response = await client.send(command);
      
      if (response.Items) {
        vendors.push(...response.Items);
      }
      
      lastKey = response.LastEvaluatedKey;
    } while (lastKey);

    console.log(`✅ Found ${vendors.length} total shops`);

    // Filter vendors by type and calculate distances
    const nearbyVendors = [];
    
    for (const shop of vendors) {
      // Determine vendor type (handle both string and number types)
      const shopType = typeof shop.shop_type === 'string' ? parseInt(shop.shop_type) : shop.shop_type;
      let vendorType = 'Unknown';
      if (shopType === 1 || shopType === 4) {
        vendorType = 'B2B'; // Industrial or Wholesaler
      } else if (shopType === 2 || shopType === 3) {
        vendorType = 'B2C'; // Retailer
      }

      // Get location
      if (!shop.lat_log) continue;
      
      const [shopLat, shopLng] = shop.lat_log.split(',').map(Number);
      if (!shopLat || !shopLng || isNaN(shopLat) || isNaN(shopLng)) continue;

      // Calculate distance
      const distance = calculateDistance(userLat, userLng, shopLat, shopLng);
      
      if (distance <= radiusKm) {
        nearbyVendors.push({
          shop_id: shop.id,
          shop_name: shop.shopname || 'N/A',
          contact: shop.contact || 'N/A',
          address: shop.address || 'N/A',
          vendor_type: vendorType,
          shop_type: shopType,
          lat_log: shop.lat_log,
          latitude: shopLat,
          longitude: shopLng,
          distance_km: parseFloat(distance.toFixed(2)),
          user_id: shop.user_id || null
        });
      }
    }

    // Sort by distance
    nearbyVendors.sort((a, b) => a.distance_km - b.distance_km);

    return nearbyVendors;
  } catch (error) {
    console.error('❌ Error finding vendors:', error);
    throw error;
  }
}

async function main() {
  const phoneNumber = process.argv[2] || '9074135121';
  const radiusKm = parseFloat(process.argv[3]) || 15;
  const manualLat = process.argv[4];
  const manualLng = process.argv[5];

  console.log('\n🔍 Finding Nearby Scrap Vendors');
  console.log('================================');
  console.log(`Phone Number: ${phoneNumber}`);
  console.log(`Search Radius: ${radiusKm} km`);
  console.log('');

  let userLat, userLng, user;

  if (manualLat && manualLng) {
    userLat = parseFloat(manualLat);
    userLng = parseFloat(manualLng);
    console.log(`📍 Using manual location: ${userLat}, ${userLng}`);
    
    // Still get user info
    const userData = await User.findByMobile(phoneNumber);
    user = userData;
  } else {
    const locationData = await getUserLocation(phoneNumber);
    if (!locationData) {
      console.error('❌ Could not get user location. Please provide lat/lng manually:');
      console.error(`   node scripts/find-nearby-vendors.js ${phoneNumber} ${radiusKm} <latitude> <longitude>`);
      process.exit(1);
    }

    if (!locationData.lat || !locationData.lng) {
      console.error('❌ User has no location. Please provide lat/lng manually:');
      console.error(`   node scripts/find-nearby-vendors.js ${phoneNumber} ${radiusKm} <latitude> <longitude>`);
      process.exit(1);
    }

    userLat = locationData.lat;
    userLng = locationData.lng;
    user = locationData.user;
  }

  console.log(`\n📍 User Location: ${userLat}, ${userLng}`);
  console.log('');

  // Find nearby vendors
  const vendors = await findVendors(userLat, userLng, radiusKm);

  console.log(`\n✅ Found ${vendors.length} nearby vendor(s) within ${radiusKm} km:\n`);

  if (vendors.length === 0) {
    console.log('No vendors found in the specified radius.');
    return;
  }

  // Group by type
  const b2bVendors = vendors.filter(v => v.vendor_type === 'B2B');
  const b2cVendors = vendors.filter(v => v.vendor_type === 'B2C');

  console.log('📊 Summary:');
  console.log(`   B2B Vendors: ${b2bVendors.length}`);
  console.log(`   B2C Vendors: ${b2cVendors.length}`);
  console.log('');

  // Display B2B vendors
  if (b2bVendors.length > 0) {
    console.log('🏭 B2B Vendors (Industrial/Wholesaler):');
    console.log('─'.repeat(80));
    b2bVendors.forEach((vendor, index) => {
      console.log(`${index + 1}. ${vendor.shop_name}`);
      console.log(`   Shop ID: ${vendor.shop_id}`);
      console.log(`   Contact: ${vendor.contact}`);
      console.log(`   Address: ${vendor.address}`);
      console.log(`   Location: ${vendor.lat_log}`);
      console.log(`   Distance: ${vendor.distance_km} km`);
      console.log(`   Shop Type: ${vendor.shop_type} (${vendor.shop_type === 1 ? 'Industrial' : 'Wholesaler'})`);
      if (vendor.user_id) console.log(`   User ID: ${vendor.user_id}`);
      console.log('');
    });
  }

  // Display B2C vendors
  if (b2cVendors.length > 0) {
    console.log('🏪 B2C Vendors (Retailer):');
    console.log('─'.repeat(80));
    b2cVendors.forEach((vendor, index) => {
      console.log(`${index + 1}. ${vendor.shop_name}`);
      console.log(`   Shop ID: ${vendor.shop_id}`);
      console.log(`   Contact: ${vendor.contact}`);
      console.log(`   Address: ${vendor.address}`);
      console.log(`   Location: ${vendor.lat_log}`);
      console.log(`   Distance: ${vendor.distance_km} km`);
      console.log(`   Shop Type: ${vendor.shop_type} (${vendor.shop_type === 2 ? 'Retailer/Door Step Buyer' : 'Retailer B2C'})`);
      if (vendor.user_id) console.log(`   User ID: ${vendor.user_id}`);
      console.log('');
    });
  }

  // JSON output
  console.log('\n📋 JSON Output:');
  console.log(JSON.stringify({
    user: {
      id: user?.id,
      name: user?.name,
      phone: phoneNumber,
      location: { lat: userLat, lng: userLng }
    },
    search_radius_km: radiusKm,
    total_vendors: vendors.length,
    b2b_count: b2bVendors.length,
    b2c_count: b2cVendors.length,
    vendors: vendors
  }, null, 2));
}

// Run the script
main().catch(error => {
  console.error('❌ Script error:', error);
  process.exit(1);
});

