const Customer = require('../models/Customer');
const Shop = require('../models/Shop');
const User = require('../models/User');

async function findCustomerNearbyShops(phoneNumber) {
  try {
    console.log(`🔍 Finding customer with phone number: ${phoneNumber}\n`);
    
    // Find user with this phone number
    const user = await User.findByMobile(phoneNumber);
    
    if (!user) {
      console.log(`❌ No user found with phone number ${phoneNumber}`);
      return;
    }
    
    // Check if user is customer type (user_type 'C')
    if (user.user_type !== 'C') {
      console.log(`❌ User found but is not a customer (user_type 'C')`);
      console.log(`   User ID: ${user.id}`);
      console.log(`   User Type: ${user.user_type}`);
      console.log(`   Name: ${user.name || 'N/A'}`);
      return;
    }
    
    const customerUser = user;
    
    console.log(`✅ Found customer user:`);
    console.log(`   User ID: ${customerUser.id}`);
    console.log(`   Name: ${customerUser.name || 'N/A'}`);
    console.log(`   Phone: ${customerUser.mob_num}`);
    console.log(`   User Type: ${customerUser.user_type}\n`);
    
    // Find customer record
    const customer = await Customer.findByUserId(customerUser.id);
    
    if (!customer) {
      console.log(`❌ Customer record not found for user ID ${customerUser.id}`);
      return;
    }
    
    console.log(`✅ Customer Record Found:`);
    console.log(`   Customer ID: ${customer.id}`);
    console.log(`   Name: ${customer.name || 'N/A'}`);
    console.log(`   Address: ${customer.address || 'N/A'}`);
    console.log(`   Location: ${customer.location || 'N/A'}`);
    console.log(`   Lat/Long: ${customer.lat_log || 'N/A'}\n`);
    
    if (!customer.lat_log) {
      console.log(`⚠️  Customer location not set. Cannot find nearby shops without location data.`);
      return;
    }
    
    // Parse location
    const [lat, lng] = customer.lat_log.split(',').map(Number);
    if (isNaN(lat) || isNaN(lng)) {
      console.error(`❌ Invalid location format: ${customer.lat_log}`);
      console.log(`   Expected format: "latitude,longitude"`);
      return;
    }
    
    console.log(`📍 Customer Location: ${lat}, ${lng}`);
    console.log(`🔍 Searching for shops within 15km radius...\n`);
    
    // Find nearby shops
    const searchRadius = 15; // km
    const nearbyShops = await Shop.getShopsByLocation(lat, lng, searchRadius);
    
    console.log(`✅ Found ${nearbyShops.length} shop(s) within ${searchRadius}km\n`);
    
    if (nearbyShops.length === 0) {
      console.log('⚠️  No shops found nearby.');
      return;
    }
    
    // Filter for active B2C shops (shop_type 1, 2, or 3) and del_status = 1
    const b2cShops = nearbyShops.filter(shop => {
      const shopType = typeof shop.shop_type === 'string' ? parseInt(shop.shop_type) : shop.shop_type;
      const delStatus = typeof shop.del_status === 'string' ? parseInt(shop.del_status) : shop.del_status;
      return (shopType === 1 || shopType === 2 || shopType === 3) && delStatus === 1;
    });
    
    console.log(`📊 Active B2C Shops (shop_type 1, 2, or 3): ${b2cShops.length}\n`);
    
    if (b2cShops.length === 0) {
      console.log('⚠️  No active B2C shops found nearby.');
      return;
    }
    
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
  console.log('Usage: node find-customer-nearby-shops.js <phone_number>');
  console.log('Example: node find-customer-nearby-shops.js 9074135121');
  process.exit(1);
}

findCustomerNearbyShops(phoneNumber);

