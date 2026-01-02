const User = require('../models/User');
const Shop = require('../models/Shop');
const Customer = require('../models/Customer');

async function findNearbyShops(phoneNumber) {
  try {
    console.log(`🔍 Searching for user/customer with phone number: ${phoneNumber}\n`);
    
    // Try to find user
    const users = await User.findByMobile(phoneNumber);
    let customerLocation = null;
    let customerName = null;
    
    if (users && users.length > 0) {
      console.log(`✅ Found ${users.length} user(s) with phone ${phoneNumber}:\n`);
      users.forEach(u => {
        console.log(`  - User ID: ${u.id} | Name: ${u.name || 'N/A'} | Type: ${u.user_type || 'N/A'}`);
      });
      
      // Try to find customer record for location
      for (const user of users) {
        try {
          const customer = await Customer.findByUserId(user.id);
          if (customer && customer.lat_log) {
            customerLocation = customer.lat_log;
            customerName = customer.name || user.name;
            console.log(`\n📍 Found customer location: ${customerLocation}`);
            break;
          }
        } catch (err) {
          // Continue searching
        }
      }
    } else {
      console.log(`❌ No user found with phone number ${phoneNumber}`);
      console.log(`\n💡 Please provide the customer's location (latitude, longitude) to find nearby shops.`);
      return;
    }
    
    if (!customerLocation) {
      console.log(`\n⚠️  Customer location not found. Cannot find nearby shops without location data.`);
      console.log(`💡 Please provide the customer's location (latitude, longitude) to find nearby shops.`);
      return;
    }
    
    // Parse location
    const [lat, lng] = customerLocation.split(',').map(Number);
    if (isNaN(lat) || isNaN(lng)) {
      console.error(`❌ Invalid location format: ${customerLocation}`);
      console.log(`   Expected format: "latitude,longitude"`);
      return;
    }
    
    console.log(`\n📍 Customer Location: ${lat}, ${lng}`);
    console.log(`🔍 Searching for shops within 15km radius...\n`);
    
    // Find nearby shops
    const searchRadius = 15; // km
    const nearbyShops = await Shop.getShopsByLocation(lat, lng, searchRadius);
    
    console.log(`✅ Found ${nearbyShops.length} shop(s) within ${searchRadius}km\n`);
    
    if (nearbyShops.length === 0) {
      console.log('⚠️  No shops found nearby.');
      return;
    }
    
    // Filter for B2C shops (shop_type 1, 2, or 3) and active shops (del_status = 1)
    const b2cShops = nearbyShops.filter(shop => {
      const shopType = typeof shop.shop_type === 'string' ? parseInt(shop.shop_type) : shop.shop_type;
      const delStatus = typeof shop.del_status === 'string' ? parseInt(shop.del_status) : shop.del_status;
      return (shopType === 1 || shopType === 2 || shopType === 3) && delStatus === 1;
    });
    
    console.log(`📊 Active B2C Shops (shop_type 1, 2, or 3): ${b2cShops.length}\n`);
    
    // Get top 10 nearest shops
    const topShops = b2cShops.slice(0, 10);
    
    console.log(`🏪 Top ${topShops.length} Nearest Shops:\n`);
    topShops.forEach((shop, index) => {
      console.log(`${index + 1}. Shop ID: ${shop.id}`);
      console.log(`   Shop Name: ${shop.shopname || 'N/A'}`);
      console.log(`   Shop Type: ${shop.shop_type} ${shop.shop_type === 1 ? '(Regular)' : shop.shop_type === 2 ? '(Retailer/Door Step Buyer)' : shop.shop_type === 3 ? '(Retailer B2C)' : ''}`);
      console.log(`   Address: ${shop.address || 'N/A'}`);
      console.log(`   Location: ${shop.location || 'N/A'}`);
      console.log(`   Lat/Long: ${shop.lat_log || 'N/A'}`);
      console.log(`   Distance: ${shop.distance ? shop.distance.toFixed(2) + ' km' : 'N/A'}`);
      console.log(`   Contact: ${shop.contact || 'N/A'}`);
      console.log(`   Approval Status: ${shop.approval_status || 'N/A'}`);
      console.log('');
    });
    
  } catch (error) {
    console.error('❌ Error:', error);
  }
}

// Get phone number from command line argument
const phoneNumber = process.argv[2];

if (!phoneNumber) {
  console.log('Usage: node find-nearby-shops-by-phone.js <phone_number>');
  console.log('Example: node find-nearby-shops-by-phone.js 907135121');
  process.exit(1);
}

findNearbyShops(phoneNumber);

