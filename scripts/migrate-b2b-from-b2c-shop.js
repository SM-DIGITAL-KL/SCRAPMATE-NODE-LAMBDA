/**
 * Script to migrate B2B documents from B2C shop to a new B2B shop
 * Usage: node scripts/migrate-b2b-from-b2c-shop.js <userId>
 * Example: node scripts/migrate-b2b-from-b2c-shop.js 1766754146099
 */

const Shop = require('../models/Shop');
const User = require('../models/User');

const userId = process.argv[2];

if (!userId) {
  console.error('❌ Please provide a user ID');
  console.log('Usage: node scripts/migrate-b2b-from-b2c-shop.js <userId>');
  process.exit(1);
}

async function migrateB2BFromB2CShop() {
  try {
    const uid = parseInt(userId);
    console.log(`🔍 Migrating B2B data from B2C shop for user ${uid}\n`);
    
    // Get user
    const user = await User.findById(uid);
    if (!user) {
      console.error(`❌ User ${uid} not found`);
      process.exit(1);
    }
    
    console.log(`✅ User found: ${user.name} (${user.user_type})\n`);
    
    // Get all shops
    const allShops = await Shop.findAllByUserId(uid);
    console.log(`🔍 Found ${allShops.length} shop(s) for user\n`);
    
    // Find B2C and B2B shops
    const b2cShop = allShops.find(s => s.shop_type === 3);
    const b2bShop = allShops.find(s => s.shop_type === 1 || s.shop_type === 4);
    
    if (!b2cShop) {
      console.error(`❌ No B2C shop found for user ${uid}`);
      process.exit(1);
    }
    
    console.log(`📋 B2C Shop: ID ${b2cShop.id}, Shop Name: ${b2cShop.shopname || 'N/A'}`);
    console.log(`📋 B2B Shop: ${b2bShop ? `ID ${b2bShop.id}` : 'NOT FOUND'}\n`);
    
    // Check if B2C shop has B2B documents
    const hasB2BDocuments = !!(b2cShop.business_license_url || b2cShop.gst_certificate_url || 
                                b2cShop.address_proof_url || b2cShop.kyc_owner_url);
    const hasB2BFields = !!(b2cShop.company_name || b2cShop.gst_number || b2cShop.pan_number);
    
    console.log(`🔍 B2C Shop B2B Data Check:`);
    console.log(`   Company Name: ${b2cShop.company_name || 'N/A'}`);
    console.log(`   GST Number: ${b2cShop.gst_number || 'N/A'}`);
    console.log(`   PAN Number: ${b2cShop.pan_number || 'N/A'}`);
    console.log(`   Business License: ${b2cShop.business_license_url ? 'YES' : 'NO'}`);
    console.log(`   GST Certificate: ${b2cShop.gst_certificate_url ? 'YES' : 'NO'}`);
    console.log(`   Address Proof: ${b2cShop.address_proof_url ? 'YES' : 'NO'}`);
    console.log(`   KYC Owner: ${b2cShop.kyc_owner_url ? 'YES' : 'NO'}\n`);
    
    if (!hasB2BDocuments && !hasB2BFields) {
      console.log(`ℹ️  B2C shop doesn't have B2B data. Nothing to migrate.`);
      process.exit(0);
    }
    
    if (b2bShop) {
      console.log(`✅ B2B shop already exists (ID: ${b2bShop.id})`);
      console.log(`   Checking if B2B shop needs B2B data...\n`);
      
      // Check if B2B shop is missing data that B2C shop has
      const needsMigration = !b2bShop.business_license_url && b2cShop.business_license_url ||
                            !b2bShop.gst_certificate_url && b2cShop.gst_certificate_url ||
                            !b2bShop.address_proof_url && b2cShop.address_proof_url ||
                            !b2bShop.kyc_owner_url && b2cShop.kyc_owner_url ||
                            !b2bShop.company_name && b2cShop.company_name ||
                            !b2bShop.gst_number && b2cShop.gst_number;
      
      if (needsMigration) {
        console.log(`📝 Updating existing B2B shop with data from B2C shop...`);
        const updateData = {};
        
        if (b2cShop.company_name && !b2bShop.company_name) updateData.company_name = b2cShop.company_name;
        if (b2cShop.gst_number && !b2bShop.gst_number) updateData.gst_number = b2cShop.gst_number;
        if (b2cShop.pan_number && !b2bShop.pan_number) updateData.pan_number = b2cShop.pan_number;
        if (b2cShop.business_license_url && !b2bShop.business_license_url) updateData.business_license_url = b2cShop.business_license_url;
        if (b2cShop.gst_certificate_url && !b2bShop.gst_certificate_url) updateData.gst_certificate_url = b2cShop.gst_certificate_url;
        if (b2cShop.address_proof_url && !b2bShop.address_proof_url) updateData.address_proof_url = b2cShop.address_proof_url;
        if (b2cShop.kyc_owner_url && !b2bShop.kyc_owner_url) updateData.kyc_owner_url = b2cShop.kyc_owner_url;
        if (b2cShop.contact_person_name && !b2bShop.contact_person_name) updateData.contact_person_name = b2cShop.contact_person_name;
        if (b2cShop.contact_person_email && !b2bShop.contact_person_email) updateData.contact_person_email = b2cShop.contact_person_email;
        
        // Copy location fields if not present
        if (b2cShop.address && !b2bShop.address) updateData.address = b2cShop.address;
        if (b2cShop.location && !b2bShop.location) updateData.location = b2cShop.location;
        if (b2cShop.state && !b2bShop.state) updateData.state = b2cShop.state;
        if (b2cShop.place && !b2bShop.place) updateData.place = b2cShop.place;
        if (b2cShop.pincode && !b2bShop.pincode) updateData.pincode = b2cShop.pincode;
        if (b2cShop.lat_log && !b2bShop.lat_log) updateData.lat_log = b2cShop.lat_log;
        if (b2cShop.latitude && !b2bShop.latitude) updateData.latitude = b2cShop.latitude;
        if (b2cShop.longitude && !b2bShop.longitude) updateData.longitude = b2cShop.longitude;
        
        if (Object.keys(updateData).length > 0) {
          await Shop.update(b2bShop.id, updateData);
          console.log(`✅ Updated B2B shop ${b2bShop.id} with B2B data`);
          console.log(`   Updated fields: ${Object.keys(updateData).join(', ')}\n`);
        } else {
          console.log(`ℹ️  B2B shop already has all the data. No update needed.\n`);
        }
      } else {
        console.log(`ℹ️  B2B shop already has all B2B data. No migration needed.\n`);
      }
    } else {
      // Create new B2B shop
      console.log(`📝 Creating new B2B shop with data from B2C shop...\n`);
      
      const b2bShopData = {
        user_id: uid,
        shopname: b2cShop.company_name || b2cShop.shopname || user.name || '',
        ownername: b2cShop.ownername || '',
        company_name: b2cShop.company_name || '',
        gst_number: b2cShop.gst_number || '',
        pan_number: b2cShop.pan_number || '',
        contact: b2cShop.contact || user.mob_num || '',
        address: b2cShop.address || '',
        email: b2cShop.email || user.email || '',
        contact_person_name: b2cShop.contact_person_name || '',
        contact_person_email: b2cShop.contact_person_email || b2cShop.email || user.email || '',
        shop_type: 1, // Industrial/B2B
        business_license_url: b2cShop.business_license_url || '',
        gst_certificate_url: b2cShop.gst_certificate_url || '',
        address_proof_url: b2cShop.address_proof_url || '',
        kyc_owner_url: b2cShop.kyc_owner_url || '',
        approval_status: b2cShop.approval_status || 'pending',
        // Copy location fields
        location: b2cShop.location || '',
        state: b2cShop.state || '',
        place: b2cShop.place || '',
        pincode: b2cShop.pincode || '',
        lat_log: b2cShop.lat_log || '',
        latitude: b2cShop.latitude || '',
        longitude: b2cShop.longitude || '',
        place_id: b2cShop.place_id || ''
      };
      
      const newB2BShop = await Shop.create(b2bShopData);
      console.log(`✅ Created new B2B shop: ID ${newB2BShop.id}`);
      console.log(`   Shop Name: ${newB2BShop.shopname || 'N/A'}`);
      console.log(`   Company Name: ${newB2BShop.company_name || 'N/A'}`);
      console.log(`   GST Number: ${newB2BShop.gst_number || 'N/A'}\n`);
    }
    
    // Clean up B2C shop - remove B2B fields (optional, can be commented out)
    console.log(`🧹 Cleaning up B2C shop (removing B2B fields)...`);
    const cleanupData = {
      company_name: '',
      gst_number: '',
      pan_number: '',
      business_license_url: '',
      gst_certificate_url: '',
      address_proof_url: '',
      kyc_owner_url: '',
      contact_person_name: '',
      contact_person_email: ''
    };
    
    await Shop.update(b2cShop.id, cleanupData);
    console.log(`✅ Cleaned up B2C shop ${b2cShop.id} (removed B2B fields)\n`);
    
    // Verify the result
    const finalShops = await Shop.findAllByUserId(uid);
    console.log(`✅ Final shops for user ${uid}:`);
    finalShops.forEach(s => {
      console.log(`   Shop ID: ${s.id}, Type: ${s.shop_type} (${s.shop_type === 1 ? 'B2B' : s.shop_type === 3 ? 'B2C' : 'Other'}), Name: ${s.shopname || 'N/A'}`);
      if (s.shop_type === 1 || s.shop_type === 4) {
        console.log(`      Company: ${s.company_name || 'N/A'}, GST: ${s.gst_number || 'N/A'}`);
        console.log(`      Business License: ${s.business_license_url ? 'YES' : 'NO'}`);
      }
      if (s.shop_type === 3) {
        console.log(`      Aadhar: ${s.aadhar_card ? 'YES' : 'NO'}`);
      }
    });
    
    console.log('\n✅ Migration complete!');
    
  } catch (error) {
    console.error('❌ Error migrating B2B data:', error);
    process.exit(1);
  }
}

migrateB2BFromB2CShop();

