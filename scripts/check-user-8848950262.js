require('dotenv').config();
const User = require('../models/User');
const Shop = require('../models/Shop');

async function check() {
  console.log('🔍 CHECKING MOBILE: 8848950262\n');
  
  const allUsers = await User.getAll();
  const user = allUsers.find(u => String(u.mob_num) === '8848950262');
  
  if (!user) {
    console.log('❌ User not found');
    return;
  }
  
  console.log('👤 USER:');
  console.log('   ID:', user.id);
  console.log('   Name:', user.name);
  console.log('   Mobile:', user.mob_num);
  console.log('   user_type:', user.user_type);
  console.log('   app_type:', user.app_type);
  console.log('');
  
  // Check shops by user_id
  const allShops = await Shop.getAll();
  const userShops = allShops.filter(s => s.user_id === user.id);
  console.log('🏪 SHOPS WITH user_id', user.id, ':', userShops.length);
  
  // Check shops by contact
  const contactShops = allShops.filter(s => String(s.contact) === '8848950262');
  console.log('🏪 SHOPS WITH contact 8848950262:', contactShops.length);
  
  if (contactShops.length > 0) {
    contactShops.forEach(s => {
      console.log('\n   Shop ID:', s.id);
      console.log('   Name:', s.shopname);
      console.log('   user_id:', s.user_id, '❌ Should be:', user.id);
    });
  }
}

check();
