require('dotenv').config();
const Shop = require('../models/Shop');
const User = require('../models/User');

async function findShopDetails(shopId) {
  try {
    console.log(`\n🔍 Finding details for shop ID: ${shopId}\n`);

    // Find shop by ID
    const shop = await Shop.findById(shopId);
    
    if (!shop) {
      console.log(`❌ Shop not found for ID: ${shopId}`);
      return null;
    }

    console.log(`✅ Shop found!\n`);
    console.log(`📦 Shop Information:`);
    console.log(`   Shop ID: ${shop.id}`);
    console.log(`   Shop Name: ${shop.shopname || 'N/A'}`);
    console.log(`   Owner Name: ${shop.ownername || 'N/A'}`);
    console.log(`   Contact: ${shop.contact || 'N/A'}`);
    console.log(`   Email: ${shop.email || 'N/A'}`);
    console.log(`   Address: ${shop.address || 'N/A'}`);
    console.log(`   Shop Type: ${shop.shop_type || 'N/A'}`);
    console.log(`   Location: ${shop.lat_log || 'N/A'}`);
    console.log(`   Latitude: ${shop.latitude !== undefined ? shop.latitude : 'N/A'}`);
    console.log(`   Longitude: ${shop.longitude !== undefined ? shop.longitude : 'N/A'}`);
    console.log(`   Pincode: ${shop.pincode || 'N/A'}`);
    console.log(`   State: ${shop.state || 'N/A'}`);
    console.log(`   Place: ${shop.place || 'N/A'}`);
    console.log(`   Language: ${shop.language || 'N/A'}`);
    console.log(`   User ID: ${shop.user_id || 'N/A'}`);
    console.log(`   Created At: ${shop.created_at || 'N/A'}`);
    console.log(`   Updated At: ${shop.updated_at || 'N/A'}`);
    console.log(`\n`);

    // Find user associated with this shop
    if (shop.user_id) {
      try {
        const user = await User.findById(shop.user_id);
        if (user) {
          console.log(`👤 Associated User Information:`);
          console.log(`   User ID: ${user.id}`);
          console.log(`   Name: ${user.name || 'N/A'}`);
          console.log(`   Email: ${user.email || 'N/A'}`);
          console.log(`   Phone: ${user.mob_num || 'N/A'}`);
          console.log(`   User Type: ${user.user_type || 'N/A'}`);
          console.log(`   App Type: ${user.app_type || 'N/A'}`);
          console.log(`   App Version: ${user.app_version || 'N/A'}`);
          console.log(`   Created At: ${user.created_at || 'N/A'}`);
          console.log(`\n`);
        } else {
          console.log(`⚠️  User not found for user_id: ${shop.user_id}\n`);
        }
      } catch (userError) {
        console.log(`⚠️  Error fetching user: ${userError.message}\n`);
      }
    }

    // Determine vendor type
    const shopType = typeof shop.shop_type === 'string' ? parseInt(shop.shop_type) : shop.shop_type;
    let vendorType = 'Unknown';
    if (shopType === 1) {
      vendorType = 'B2B - Industrial';
    } else if (shopType === 2) {
      vendorType = 'B2C - Retailer/Door Step Buyer';
    } else if (shopType === 3) {
      vendorType = 'B2C - Retailer B2C';
    } else if (shopType === 4) {
      vendorType = 'B2B - Wholesaler';
    }

    console.log(`📊 Vendor Type: ${vendorType} (shop_type: ${shopType})`);

    return { shop };
  } catch (error) {
    console.error('❌ Error finding shop details:', error);
    throw error;
  }
}

// Get shop ID from command line argument
const shopId = process.argv[2];

if (!shopId) {
  console.error('Usage: node scripts/find-shop-details.js <shop_id>');
  process.exit(1);
}

findShopDetails(shopId)
  .then((result) => {
    if (result) {
      process.exit(0);
    } else {
      process.exit(1);
    }
  })
  .catch((error) => {
    console.error('Error:', error);
    process.exit(1);
  });

