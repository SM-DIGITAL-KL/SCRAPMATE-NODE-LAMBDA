/**
 * Script to check shop by ID
 * Usage: node scripts/check-shop-by-id.js <shop_id>
 */

const Shop = require('../models/Shop');

const shopId = process.argv[2];

if (!shopId) {
  console.error('❌ Please provide a shop ID');
  console.log('Usage: node scripts/check-shop-by-id.js <shop_id>');
  process.exit(1);
}

async function checkShopById() {
  try {
    console.log(`🔍 Checking shop with ID: ${shopId}\n`);
    
    const shop = await Shop.findById(parseInt(shopId));
    
    if (shop) {
      console.log('✅ Shop Found:');
      console.log('─'.repeat(50));
      console.log(`Shop ID: ${shop.id}`);
      console.log(`User ID: ${shop.user_id || '(empty)'}`);
      console.log(`Shop Type: ${shop.shop_type} (${shop.shop_type === 1 ? 'Industrial/B2B' : shop.shop_type === 3 ? 'Retailer/B2C' : shop.shop_type === 4 ? 'Wholesaler/B2B' : 'Unknown'})`);
      console.log(`Shop Name: ${shop.shopname || '(empty)'}`);
      console.log(`Owner Name: ${shop.ownername || '(empty)'}`);
      console.log(`Company Name: ${shop.company_name || '(empty)'}`);
      console.log(`Contact: ${shop.contact || '(empty)'}`);
      console.log(`Address: ${shop.address || '(empty)'}`);
      console.log(`Del Status: ${shop.del_status || 1} (${shop.del_status === 2 ? 'DELETED' : 'ACTIVE'})`);
      console.log(`Approval Status: ${shop.approval_status || '(empty)'}`);
      
      // B2B Documents
      if (shop.shop_type === 1 || shop.shop_type === 4) {
        console.log(`\nB2B Documents:`);
        console.log(`  - Business License: ${shop.business_license_url || '(empty)'}`);
        console.log(`  - GST Certificate: ${shop.gst_certificate_url || '(empty)'}`);
        console.log(`  - Address Proof: ${shop.address_proof_url || '(empty)'}`);
        console.log(`  - KYC Owner: ${shop.kyc_owner_url || '(empty)'}`);
        console.log(`  - GST Number: ${shop.gst_number || '(empty)'}`);
        console.log(`  - PAN Number: ${shop.pan_number || '(empty)'}`);
      }
      
      // B2C Documents
      if (shop.shop_type === 3) {
        console.log(`\nB2C Documents:`);
        console.log(`  - Aadhar Card: ${shop.aadhar_card || '(empty)'}`);
        console.log(`  - Driving License: ${shop.driving_license || '(empty)'}`);
      }
      
      console.log(`\nCreated At: ${shop.created_at || '(empty)'}`);
      console.log(`Updated At: ${shop.updated_at || '(empty)'}`);
    } else {
      console.log(`❌ Shop with ID ${shopId} not found`);
    }
    
    console.log('\n✅ Check complete');
    
  } catch (error) {
    console.error('❌ Error checking shop:', error);
    process.exit(1);
  }
}

checkShopById();

