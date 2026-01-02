/**
 * Script to find shop details by phone number
 * Usage: node scripts/find-shop-by-phone.js <phone_number>
 * Example: node scripts/find-shop-by-phone.js 9074135123
 */

const User = require('../models/User');
const Shop = require('../models/Shop');

const phoneNumber = process.argv[2];

if (!phoneNumber) {
  console.error('❌ Please provide a phone number');
  console.log('Usage: node scripts/find-shop-by-phone.js <phone_number>');
  process.exit(1);
}

async function findShopByPhone() {
  try {
    console.log(`🔍 Finding shop details for phone number: ${phoneNumber}\n`);
    
    // First, find user by phone number
    const user = await User.findByMobile(phoneNumber);
    
    if (user) {
      console.log('📋 User Found:');
      console.log('─'.repeat(50));
      console.log(`ID: ${user.id}`);
      console.log(`Name: ${user.name || '(empty)'}`);
      console.log(`Email: ${user.email || '(empty)'}`);
      console.log(`Mobile: ${user.mob_num || '(empty)'}`);
      console.log(`User Type: ${user.user_type || '(empty)'}`);
      console.log(`App Type: ${user.app_type || '(empty)'}\n`);
      
      // Check shops by user_id
      if (user.user_type === 'SR') {
        const allShops = await Shop.findAllByUserId(parseInt(user.id));
        console.log(`🏪 Shops found by user_id (${user.id}): ${allShops.length}`);
        
        if (allShops.length > 0) {
          allShops.forEach((shop, index) => {
            console.log(`\nShop ${index + 1}:`);
            console.log(`  Shop ID: ${shop.id}`);
            console.log(`  Shop Type: ${shop.shop_type} (${shop.shop_type === 1 ? 'Industrial/B2B' : shop.shop_type === 3 ? 'Retailer/B2C' : shop.shop_type === 4 ? 'Wholesaler/B2B' : 'Unknown'})`);
            console.log(`  Shop Name: ${shop.shopname || '(empty)'}`);
            console.log(`  Owner Name: ${shop.ownername || '(empty)'}`);
            console.log(`  Company Name: ${shop.company_name || '(empty)'}`);
            console.log(`  Contact: ${shop.contact || '(empty)'}`);
            console.log(`  Address: ${shop.address || '(empty)'}`);
            console.log(`  Approval Status: ${shop.approval_status || '(empty)'}`);
            console.log(`  Del Status: ${shop.del_status || 1}`);
            
            // B2B Documents
            if (shop.shop_type === 1 || shop.shop_type === 4) {
              console.log(`  B2B Documents:`);
              console.log(`    - Business License: ${shop.business_license_url || '(empty)'}`);
              console.log(`    - GST Certificate: ${shop.gst_certificate_url || '(empty)'}`);
              console.log(`    - Address Proof: ${shop.address_proof_url || '(empty)'}`);
              console.log(`    - KYC Owner: ${shop.kyc_owner_url || '(empty)'}`);
              console.log(`    - GST Number: ${shop.gst_number || '(empty)'}`);
              console.log(`    - PAN Number: ${shop.pan_number || '(empty)'}`);
            }
            
            // B2C Documents
            if (shop.shop_type === 3) {
              console.log(`  B2C Documents:`);
              console.log(`    - Aadhar Card: ${shop.aadhar_card || '(empty)'}`);
              console.log(`    - Driving License: ${shop.driving_license || '(empty)'}`);
            }
          });
        } else {
          console.log('❌ No shops found by user_id\n');
        }
      } else {
        const shop = await Shop.findByUserId(parseInt(user.id));
        if (shop) {
          console.log(`🏪 Shop found by user_id (${user.id}):`);
          console.log(`  Shop ID: ${shop.id}`);
          console.log(`  Shop Type: ${shop.shop_type}`);
          console.log(`  Shop Name: ${shop.shopname || '(empty)'}`);
          console.log(`  Owner Name: ${shop.ownername || '(empty)'}`);
          console.log(`  Company Name: ${shop.company_name || '(empty)'}`);
          console.log(`  Contact: ${shop.contact || '(empty)'}`);
          console.log(`  Address: ${shop.address || '(empty)'}`);
        } else {
          console.log('❌ No shop found by user_id\n');
        }
      }
    } else {
      console.log('❌ No user found with this phone number\n');
    }
    
    // Also check shops by contact number
    console.log('\n🔍 Checking shops by contact number...');
    const shopsByContact = await Shop.findByContact(phoneNumber);
    console.log(`🏪 Shops found by contact number: ${shopsByContact.length}`);
    
    if (shopsByContact.length > 0) {
      shopsByContact.forEach((shop, index) => {
        console.log(`\nShop ${index + 1} (by contact):`);
        console.log(`  Shop ID: ${shop.id}`);
        console.log(`  User ID: ${shop.user_id || '(empty)'}`);
        console.log(`  Shop Type: ${shop.shop_type} (${shop.shop_type === 1 ? 'Industrial/B2B' : shop.shop_type === 3 ? 'Retailer/B2C' : shop.shop_type === 4 ? 'Wholesaler/B2B' : 'Unknown'})`);
        console.log(`  Shop Name: ${shop.shopname || '(empty)'}`);
        console.log(`  Owner Name: ${shop.ownername || '(empty)'}`);
        console.log(`  Company Name: ${shop.company_name || '(empty)'}`);
        console.log(`  Contact: ${shop.contact || '(empty)'}`);
        console.log(`  Address: ${shop.address || '(empty)'}`);
        console.log(`  Approval Status: ${shop.approval_status || '(empty)'}`);
        console.log(`  Del Status: ${shop.del_status || 1}`);
        
        // B2B Documents
        if (shop.shop_type === 1 || shop.shop_type === 4) {
          console.log(`  B2B Documents:`);
          console.log(`    - Business License: ${shop.business_license_url || '(empty)'}`);
          console.log(`    - GST Certificate: ${shop.gst_certificate_url || '(empty)'}`);
          console.log(`    - Address Proof: ${shop.address_proof_url || '(empty)'}`);
          console.log(`    - KYC Owner: ${shop.kyc_owner_url || '(empty)'}`);
          console.log(`    - GST Number: ${shop.gst_number || '(empty)'}`);
          console.log(`    - PAN Number: ${shop.pan_number || '(empty)'}`);
        }
        
        // B2C Documents
        if (shop.shop_type === 3) {
          console.log(`  B2C Documents:`);
          console.log(`    - Aadhar Card: ${shop.aadhar_card || '(empty)'}`);
          console.log(`    - Driving License: ${shop.driving_license || '(empty)'}`);
        }
      });
    } else {
      console.log('❌ No shops found by contact number');
    }
    
    console.log('\n✅ Check complete');
    
  } catch (error) {
    console.error('❌ Error finding shop:', error);
    process.exit(1);
  }
}

findShopByPhone();

