const Shop = require('../models/Shop');
const User = require('../models/User');

async function getShopPhoneNumbers() {
  try {
    const customerLat = 9.1283849;
    const customerLng = 76.7666546;
    const searchRadius = 15;
    
    console.log('📍 Customer Location:', customerLat + ',' + customerLng);
    console.log('🔍 Searching for shops within', searchRadius + 'km radius...\n');
    
    const nearbyShops = await Shop.getShopsByLocation(customerLat, customerLng, searchRadius);
    
    const b2cShops = nearbyShops.filter(shop => {
      const shopType = typeof shop.shop_type === 'string' ? parseInt(shop.shop_type) : shop.shop_type;
      return shopType === 1 || shopType === 2 || shopType === 3;
    });
    
    const topShops = b2cShops.slice(0, 10);
    
    console.log('📞 Phone Numbers of Top 10 Nearest Shops:\n');
    
    for (let i = 0; i < topShops.length; i++) {
      const shop = topShops[i];
      let phoneNumber = shop.contact || 'N/A';
      
      // Try to get phone number from user record
      if (shop.user_id) {
        try {
          const user = await User.findById(shop.user_id);
          if (user && user.mob_num) {
            phoneNumber = user.mob_num;
          }
        } catch (err) {
          // Use shop contact if user lookup fails
        }
      }
      
      console.log((i + 1) + '. Shop:', shop.shopname || 'N/A', '(ID: ' + shop.id + ')');
      console.log('   Phone:', phoneNumber);
      console.log('   Distance:', shop.distance ? shop.distance.toFixed(2) + ' km' : 'N/A');
      console.log('');
    }
  } catch (error) {
    console.error('Error:', error);
  }
}

getShopPhoneNumbers();

