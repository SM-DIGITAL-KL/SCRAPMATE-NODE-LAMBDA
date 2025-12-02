/**
 * Script to fix user_type based on actual signup completion status
 * Reverts user_type to correct value if signup is incomplete
 */

const User = require('../models/User');
const Shop = require('../models/Shop');
require('dotenv').config();
const { loadEnvFromFile } = require('../utils/loadEnv');
loadEnvFromFile();

async function fixUserTypeBySignup(phoneNumber, dryRun = true) {
  try {
    console.log(`\n🔍 Fixing user type for phone: ${phoneNumber}`);
    console.log(`   Mode: ${dryRun ? 'DRY RUN (no changes will be made)' : 'LIVE (changes will be saved)'}\n`);
    
    const user = await User.findByMobile(phoneNumber);
    
    if (!user) {
      console.log(`❌ User not found with phone: ${phoneNumber}`);
      return;
    }
    
    console.log('✅ User found:');
    console.log(`   ID: ${user.id}`);
    console.log(`   Name: ${user.name}`);
    console.log(`   Current User Type: ${user.user_type}`);
    console.log(`   App Version: ${user.app_version || 'N/A'}\n`);
    
    const shop = await Shop.findByUserId(user.id);
    
    // Check B2B signup completion (form + all documents)
    const isB2BComplete = shop && 
                          shop.company_name && shop.company_name.trim() !== '' &&
                          shop.gst_number && shop.gst_number.trim() !== '' &&
                          shop.business_license_url && shop.business_license_url.trim() !== '' &&
                          shop.gst_certificate_url && shop.gst_certificate_url.trim() !== '' &&
                          shop.address_proof_url && shop.address_proof_url.trim() !== '' &&
                          shop.kyc_owner_url && shop.kyc_owner_url.trim() !== '';
    
    // Check B2C signup completion (name + address + contact + aadhar card)
    const isB2CComplete = user.name && user.name.trim() !== '' &&
                          shop && shop.address && shop.address.trim() !== '' &&
                          shop.contact && shop.contact.trim() !== '' &&
                          shop.aadhar_card && shop.aadhar_card.trim() !== '';
    
    console.log('📋 Signup Status:');
    console.log(`   B2B Complete: ${isB2BComplete ? '✅ YES' : '❌ NO'}`);
    console.log(`   B2C Complete: ${isB2CComplete ? '✅ YES' : '❌ NO'}\n`);
    
    // Determine correct user type
    let correctUserType = 'R'; // Default to B2C (new users start as R)
    if (isB2BComplete && isB2CComplete) {
      correctUserType = 'SR';
    } else if (isB2BComplete) {
      correctUserType = 'S';
    } else if (isB2CComplete) {
      correctUserType = 'R';
    } else {
      // No signup complete - should be R (default for new users)
      correctUserType = 'R';
    }
    
    console.log('📊 Analysis:');
    console.log(`   Current User Type: ${user.user_type}`);
    console.log(`   Correct User Type: ${correctUserType}`);
    
    if (user.user_type === correctUserType) {
      console.log(`   Status: ✅ User type is correct\n`);
      return;
    }
    
    console.log(`   Status: ❌ MISMATCH - User type needs to be fixed\n`);
    
    if (dryRun) {
      console.log('🔍 DRY RUN: Would update user_type from', user.user_type, 'to', correctUserType);
      console.log('   Run with --live flag to apply changes\n');
    } else {
      console.log('🔄 Updating user_type...');
      await User.updateProfile(user.id, { user_type: correctUserType });
      console.log(`✅ User type updated from ${user.user_type} to ${correctUserType}\n`);
      
      // Verify the update
      const updatedUser = await User.findById(user.id);
      console.log('🔍 Verification:');
      console.log(`   Updated User Type: ${updatedUser.user_type}`);
      console.log(`   Match: ${updatedUser.user_type === correctUserType ? '✅ YES' : '❌ NO'}\n`);
    }
    
  } catch (err) {
    console.error('❌ Error fixing user type:', err);
    throw err;
  }
}

const phoneNumber = process.argv[2];
const isLive = process.argv.includes('--live');

if (!phoneNumber) {
  console.error('❌ Please provide a phone number as an argument.');
  console.log('Usage: node scripts/fix-user-type-by-signup.js <phone_number> [--live]');
  console.log('Example: node scripts/fix-user-type-by-signup.js 9074135121');
  console.log('Example: node scripts/fix-user-type-by-signup.js 9074135121 --live');
  process.exit(1);
}

fixUserTypeBySignup(phoneNumber, !isLive)
  .then(() => {
    console.log('✅ Script completed successfully.');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Script failed:', error);
    process.exit(1);
  });


