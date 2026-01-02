require('dotenv').config();
const Customer = require('../models/Customer');
const Shop = require('../models/Shop');

const PHONE_NUMBER = process.argv[2] || '9074135121';

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
  return R * c; // Distance in km
}

async function findNearbyVendors() {
  try {
    console.log('\n🔍 Finding Nearby Vendors for Customer');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    console.log(`Phone Number: ${PHONE_NUMBER}\n`);

    // Find user by phone number
    const User = require('../models/User');
    const users = await User.findAllByMobile(PHONE_NUMBER);
    if (!users || users.length === 0) {
      console.error(`❌ No user found with phone number: ${PHONE_NUMBER}`);
      return;
    }

    // Find customer app user (type 'C' or customer_app)
    const customerUser = users.find(u => 
      (u.app_type === 'customer_app' || (!u.app_type && u.user_type === 'C')) &&
      (u.del_status !== 2 || !u.del_status)
    );

    if (!customerUser) {
      console.error(`❌ No customer app user found with phone number: ${PHONE_NUMBER}`);
      console.log(`   Found ${users.length} user(s) with this phone number, but none are customer app users.`);
      console.log(`   User types found: ${users.map(u => `${u.user_type} (${u.app_type || 'no app_type'})`).join(', ')}`);
      return;
    }

    console.log('✅ Customer User Found:');
    console.log(`   User ID: ${customerUser.id}`);
    console.log(`   Name: ${customerUser.name || 'N/A'}`);
    console.log(`   Phone: ${customerUser.mob_num || 'N/A'}`);
    console.log(`   User Type: ${customerUser.user_type || 'N/A'}`);
    console.log(`   App Type: ${customerUser.app_type || 'N/A'}`);
    console.log('');

    // Find customer record
    const customer = await Customer.findByUserId(customerUser.id);
    if (!customer) {
      console.error(`❌ No customer record found for user_id: ${customerUser.id}`);
      console.log('   Customer location is required to find nearby vendors.');
      return;
    }

    console.log('✅ Customer Record Found:');
    console.log(`   Customer ID: ${customer.id}`);
    console.log(`   Name: ${customer.name || 'N/A'}`);
    console.log(`   Contact: ${customer.contact || 'N/A'}`);
    console.log(`   Address: ${customer.address || 'N/A'}`);
    console.log(`   Location: ${customer.location || 'N/A'}`);
    console.log(`   Lat/Long: ${customer.lat_log || 'N/A'}`);
    console.log('');

    // Check if customer has location
    if (!customer.lat_log) {
      console.error('❌ Customer does not have location (lat_log) set.');
      console.log('   Cannot find nearby vendors without location data.');
      return;
    }

    // Parse location
    const [lat, lng] = customer.lat_log.split(',').map(Number);
    if (isNaN(lat) || isNaN(lng)) {
      console.error(`❌ Invalid location format: ${customer.lat_log}`);
      console.log('   Expected format: "latitude,longitude"');
      return;
    }

    console.log(`📍 Customer Location: ${lat}, ${lng}`);
    console.log('');

    // Find nearby shops (within 15km radius, same as order placement logic)
    const searchRadius = 15; // km
    console.log(`🔍 Searching for vendors within ${searchRadius}km radius...`);
    const nearbyShops = await Shop.getShopsByLocation(lat, lng, searchRadius);
    
    console.log(`✅ Found ${nearbyShops.length} vendor shop(s) within ${searchRadius}km\n`);

    if (nearbyShops.length === 0) {
      console.log('⚠️  No vendors found nearby.');
      return;
    }

    // Filter for B2C vendors (shop_type 2 = Retailer/Door Step Buyer, shop_type 3 = Retailer B2C)
    // Also include shop_type 1 (Regular Shop) as they might also accept orders
    const b2cShops = nearbyShops.filter(shop => {
      const shopType = typeof shop.shop_type === 'string' ? parseInt(shop.shop_type) : shop.shop_type;
      // Include shop_type 1 (Regular), 2 (Retailer/Door Step Buyer), 3 (Retailer B2C)
      return shopType === 1 || shopType === 2 || shopType === 3;
    });

    console.log(`📊 B2C Vendors (shop_type 1, 2, or 3): ${b2cShops.length}`);
    console.log('');

    // Get top 5 nearest vendors (same logic as order placement)
    const top5Shops = b2cShops.slice(0, 5);

    // Get vendor user details for each shop
    const vendorDetails = await Promise.all(
      top5Shops.map(async (shop) => {
        let vendorUser = null;
        if (shop.user_id) {
          vendorUser = await User.findById(shop.user_id);
        }
        return { shop, vendorUser };
      })
    );

    console.log('📋 Top 5 Nearby Vendors:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    vendorDetails.forEach(({ shop, vendorUser }, index) => {
      const [shopLat, shopLng] = shop.lat_log ? shop.lat_log.split(',').map(Number) : [null, null];
      const distance = shopLat && shopLng ? calculateDistance(lat, lng, shopLat, shopLng) : null;

      console.log(`${index + 1}. Shop: ${shop.shopname || 'N/A'}`);
      console.log(`   Shop ID: ${shop.id}`);
      console.log(`   Shop Type: ${shop.shop_type || 'N/A'} ${shop.shop_type === 1 ? '(Regular)' : shop.shop_type === 2 ? '(Retailer/Door Step Buyer)' : shop.shop_type === 3 ? '(Retailer B2C)' : ''}`);
      console.log(`   Owner: ${shop.ownername || 'N/A'}`);
      console.log(`   Contact: ${shop.contact || 'N/A'}`);
      console.log(`   Address: ${shop.address || 'N/A'}`);
      if (shopLat && shopLng) {
        console.log(`   Location: ${shopLat}, ${shopLng}`);
        if (distance !== null) {
          console.log(`   Distance: ${distance.toFixed(2)} km`);
        }
      }
      if (vendorUser) {
        console.log(`   Vendor User ID: ${vendorUser.id}`);
        console.log(`   Vendor Name: ${vendorUser.name || 'N/A'}`);
        console.log(`   Vendor Phone: ${vendorUser.mob_num || 'N/A'}`);
        console.log(`   Vendor Type: ${vendorUser.user_type || 'N/A'}`);
      } else {
        console.log(`   ⚠️  No vendor user found for shop user_id: ${shop.user_id || 'N/A'}`);
      }
      console.log('');
    });

    // Summary
    console.log('📊 Summary:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`   Total vendors within ${searchRadius}km: ${nearbyShops.length}`);
    console.log(`   B2C vendors (shop_type 1, 2, 3): ${b2cShops.length}`);
    console.log(`   Top 5 nearest vendors shown above`);
    console.log('');

    // Show vendor IDs that would be notified (same as order placement)
    const notifiedVendorIds = vendorDetails
      .filter(({ vendorUser }) => vendorUser && vendorUser.id)
      .map(({ vendorUser }) => vendorUser.id);

    if (notifiedVendorIds.length > 0) {
      console.log('🔔 Vendor User IDs that would be notified:');
      console.log(`   ${JSON.stringify(notifiedVendorIds, null, 2)}`);
      console.log('');
    }

    console.log('✅ Done!\n');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

findNearbyVendors();

