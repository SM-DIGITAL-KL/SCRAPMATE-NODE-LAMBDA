/**
 * Script to check user signup completion status
 */

const User = require('../models/User');
const Shop = require('../models/Shop');
require('dotenv').config();
const { loadEnvFromFile } = require('../utils/loadEnv');
loadEnvFromFile();

async function checkUserSignupStatus(phoneNumber) {
  try {
    console.log(`\n🔍 Checking signup status for phone: ${phoneNumber}\n`);
    
    const user = await User.findByMobile(phoneNumber);
    
    if (!user) {
      console.log(`❌ User not found with phone: ${phoneNumber}`);
      return;
    }
    
    console.log('✅ User found:');
    console.log(`   ID: ${user.id}`);
    console.log(`   Name: ${user.name}`);
    console.log(`   User Type: ${user.user_type}`);
    console.log(`   App Version: ${user.app_version || 'N/A'}\n`);
    
    const shop = await Shop.findByUserId(user.id);
    
    if (!shop) {
      console.log('❌ No shop found for this user');
      return;
    }
    
    console.log('📋 Shop Details:');
    console.log(`   Shop ID: ${shop.id}`);
    console.log(`   Shop Name: ${shop.shopname || 'N/A'}`);
    console.log(`   Company Name: ${shop.company_name || 'N/A'}`);
    console.log(`   GST Number: ${shop.gst_number || 'N/A'}`);
    console.log(`   Address: ${shop.address || 'N/A'}`);
    console.log(`   Contact: ${shop.contact || 'N/A'}\n`);
    
    // Check B2B signup completion
    console.log('🔍 B2B Signup Status:');
    const hasCompanyName = shop.company_name && shop.company_name.trim() !== '';
    const hasGstNumber = shop.gst_number && shop.gst_number.trim() !== '';
    const hasBusinessLicense = shop.business_license_url && shop.business_license_url.trim() !== '';
    const hasGstCertificate = shop.gst_certificate_url && shop.gst_certificate_url.trim() !== '';
    const hasAddressProof = shop.address_proof_url && shop.address_proof_url.trim() !== '';
    const hasKycOwner = shop.kyc_owner_url && shop.kyc_owner_url.trim() !== '';
    
    console.log(`   Company Name: ${hasCompanyName ? '✅' : '❌'}`);
    console.log(`   GST Number: ${hasGstNumber ? '✅' : '❌'}`);
    console.log(`   Business License: ${hasBusinessLicense ? '✅' : '❌'}`);
    console.log(`   GST Certificate: ${hasGstCertificate ? '✅' : '❌'}`);
    console.log(`   Address Proof: ${hasAddressProof ? '✅' : '❌'}`);
    console.log(`   KYC Owner: ${hasKycOwner ? '✅' : '❌'}`);
    
    const isB2BComplete = hasCompanyName && hasGstNumber && hasBusinessLicense && 
                         hasGstCertificate && hasAddressProof && hasKycOwner;
    console.log(`   B2B Signup Complete: ${isB2BComplete ? '✅ YES' : '❌ NO'}\n`);
    
    // Check B2C signup completion
    console.log('🔍 B2C Signup Status:');
    const hasName = user.name && user.name.trim() !== '';
    const hasAddress = shop.address && shop.address.trim() !== '';
    const hasContact = shop.contact && shop.contact.trim() !== '';
    const hasAadharCard = shop.aadhar_card && shop.aadhar_card.trim() !== '';
    
    console.log(`   Name: ${hasName ? '✅' : '❌'}`);
    console.log(`   Address: ${hasAddress ? '✅' : '❌'}`);
    console.log(`   Contact: ${hasContact ? '✅' : '❌'}`);
    console.log(`   Aadhar Card: ${hasAadharCard ? '✅' : '❌'}`);
    
    const isB2CComplete = hasName && hasAddress && hasContact && hasAadharCard;
    console.log(`   B2C Signup Complete: ${isB2CComplete ? '✅ YES' : '❌ NO'}\n`);
    
    // Expected user type based on completion
    let expectedUserType = 'R'; // Default to B2C (new users start as R)
    if (isB2BComplete && isB2CComplete) {
      expectedUserType = 'SR';
    } else if (isB2BComplete) {
      expectedUserType = 'S';
    } else if (isB2CComplete) {
      expectedUserType = 'R';
    }
    
    console.log('📊 Summary:');
    console.log(`   Current User Type: ${user.user_type}`);
    console.log(`   Expected User Type: ${expectedUserType}`);
    console.log(`   Match: ${user.user_type === expectedUserType ? '✅ YES' : '❌ NO - MISMATCH!'}\n`);
    
    if (user.user_type !== expectedUserType) {
      console.log('⚠️  WARNING: User type does not match signup completion status!');
      console.log('   This user should be reverted to the correct type.\n');
    }
    
  } catch (err) {
    console.error('❌ Error checking user signup status:', err);
    throw err;
  }
}

const phoneNumber = process.argv[2];

if (!phoneNumber) {
  console.error('❌ Please provide a phone number as an argument.');
  console.log('Usage: node scripts/check-user-signup-status.js <phone_number>');
  console.log('Example: node scripts/check-user-signup-status.js 9074135121');
  process.exit(1);
}

checkUserSignupStatus(phoneNumber)
  .then(() => {
    console.log('✅ Script completed successfully.');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Script failed:', error);
    process.exit(1);
  });


