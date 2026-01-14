/**
 * Test script to simulate deleted user_type 'R' re-registering as 'S'
 */

const User = require('../models/User');
const Shop = require('../models/Shop');
const V2B2BSignupService = require('../services/shop/v2B2BSignupService');

const userId = 1767622711328;
const phoneNumber = '9074135121';

async function testDeletedUserReregister() {
  try {
    console.log('🧪 Testing deleted user_type "R" re-registering as "S"...\n');
    
    // Step 1: Get current user
    let user = await User.findById(userId);
    console.log('📋 Current user state:');
    console.log(`   ID: ${user.id}`);
    console.log(`   user_type: ${user.user_type}`);
    console.log(`   del_status: ${user.del_status || 'undefined (not deleted)'}`);
    console.log(`   phone: ${user.mob_num || user.phone}\n`);
    
    // Step 2: Set user as deleted with user_type 'R'
    console.log('🔄 Setting user as deleted (del_status=2) with user_type "R"...');
    await User.updateProfile(userId, {
      user_type: 'R',
      del_status: 2
    });
    user = await User.findById(userId);
    console.log(`✅ User updated - user_type: ${user.user_type}, del_status: ${user.del_status}\n`);
    
    // Step 3: Check shop
    let shop = await Shop.findByUserId(userId);
    if (shop) {
      console.log('📋 Current shop state:');
      console.log(`   ID: ${shop.id}`);
      console.log(`   shop_type: ${shop.shop_type}`);
      console.log(`   del_status: ${shop.del_status}`);
      console.log(`   company_name: ${shop.company_name || 'N/A'}\n`);
    } else {
      console.log('ℹ️  No shop found\n');
    }
    
    // Step 4: Simulate B2B signup
    console.log('📝 Simulating B2B signup submission...\n');
    const signupData = {
      companyName: 'Test Company',
      gstNumber: '',
      panNumber: 'BAGPJ4703G',
      businessAddress: 'Test Address, Kerala, 691558',
      contactPersonName: 'Test Person',
      contactNumber: phoneNumber,
      contactEmail: 'test@example.com',
      businessLicenseUrl: 'https://scrapmate-images.s3.ap-south-1.amazonaws.com/b2b-documents/test-business-license.pdf',
      gstCertificateUrl: 'https://scrapmate-images.s3.ap-south-1.amazonaws.com/b2b-documents/test-gst-certificate.pdf',
      addressProofUrl: 'https://scrapmate-images.s3.ap-south-1.amazonaws.com/b2b-documents/test-address-proof.pdf',
      kycOwnerUrl: 'https://scrapmate-images.s3.ap-south-1.amazonaws.com/b2b-documents/test-kyc-owner.pdf',
      latitude: 9.1332787,
      longitude: 76.7709822,
      pincode: '691558',
      state: 'Kerala',
      place: 'Test Place',
      location: 'Kerala, India'
    };
    
    try {
      const result = await V2B2BSignupService.submitB2BSignup(userId, signupData);
      console.log('✅ B2B signup successful!');
      console.log('📋 Result shop:', {
        id: result.id,
        company_name: result.company_name,
        shop_type: result.shop_type,
        del_status: result.del_status
      });
    } catch (error) {
      console.error('❌ B2B signup failed!');
      console.error('   Error:', error.message);
      console.error('   Stack:', error.stack);
    }
    
    // Step 5: Verify final state
    console.log('\n📋 Final user state:');
    user = await User.findById(userId);
    console.log(`   user_type: ${user.user_type}`);
    console.log(`   del_status: ${user.del_status}`);
    
    shop = await Shop.findByUserId(userId);
    if (shop) {
      console.log('\n📋 Final shop state:');
      console.log(`   shop_type: ${shop.shop_type}`);
      console.log(`   del_status: ${shop.del_status}`);
      console.log(`   company_name: ${shop.company_name}`);
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error);
    console.error('Stack:', error.stack);
  }
  
  process.exit(0);
}

testDeletedUserReregister();

