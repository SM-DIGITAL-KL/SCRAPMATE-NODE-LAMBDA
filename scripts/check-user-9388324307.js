require('dotenv').config();
const User = require('../models/User');
const Shop = require('../models/Shop');

async function check() {
  console.log('🔍 CHECKING MOBILE: 9388324307\n');
  
  const allUsers = await User.getAll();
  const user = allUsers.find(u => String(u.mob_num) === '9388324307');
  
  if (!user) {
    console.log('❌ User not found');
    return;
  }
  
  console.log('👤 USER:');
  console.log('   ID:', user.id);
  console.log('   Name:', user.name);
  console.log('   Mobile:', user.mob_num);
  console.log('');
  
  const allShops = await Shop.getAll();
  const userShops = allShops.filter(s => s.user_id === user.id);
  console.log('🏪 SHOPS WITH user_id', user.id, ':', userShops.length);
  
  const contactShops = allShops.filter(s => String(s.contact) === '9388324307');
  console.log('🏪 SHOPS WITH contact 9388324307:', contactShops.length);
  
  if (contactShops.length > 0) {
    contactShops.forEach(s => {
      console.log('\n   Shop ID:', s.id);
      console.log('   Name:', s.shopname);
      console.log('   Current user_id:', s.user_id);
      if (s.user_id !== user.id) {
        console.log('   ❌ Should be:', user.id);
      }
    });
  }
}

check();
