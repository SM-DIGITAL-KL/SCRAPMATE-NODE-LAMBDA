#!/usr/bin/env node

/**
 * Test script to simulate B2C signup profile update
 * This tests the exact flow that happens when a user submits B2C signup
 */

const V2ProfileService = require('../services/user/v2ProfileService');
const User = require('../models/User');
const Shop = require('../models/Shop');
const { loadEnvFromFile } = require('../utils/loadEnv');

loadEnvFromFile();

async function testB2CSignup() {
  try {
    const userId = '1764599284469';
    
    console.log('🧪 Testing B2C Signup Profile Update\n');
    console.log('='.repeat(60));
    
    // Get initial state
    console.log('\n📋 Initial State:');
    const initialUser = await User.findById(userId);
    const initialShop = await Shop.findByUserId(userId);
    
    console.log(`   User Type: ${initialUser.user_type}`);
    console.log(`   User Name: ${initialUser.name || 'missing'}`);
    console.log(`   Shop ID: ${initialShop?.id || 'not found'}`);
    console.log(`   Shop Address: ${initialShop?.address || 'missing'}`);
    console.log(`   Shop Contact: ${initialShop?.contact || 'missing'}`);
    console.log(`   Shop Aadhar: ${initialShop?.aadhar_card ? 'present' : 'missing'}`);
    console.log(`   Shop Type: ${initialShop?.shop_type || 'N/A'}`);
    
    // Simulate the update data from React Native
    const updateData = {
      name: 'Test user',
      shop: {
        address: 'Hhjnn',
        contact: '9074135121',
        aadhar_card: 'https://scrapmate-images.s3.ap-south-1.amazonaws.com/documents/aadhar-1764599284469-1764599956137.pdf'
      }
    };
    
    console.log('\n📤 Update Data:');
    console.log(JSON.stringify(updateData, null, 2));
    
    console.log('\n🔄 Calling V2ProfileService.updateProfile...');
    console.log('-'.repeat(60));
    
    // Call the profile update service
    const result = await V2ProfileService.updateProfile(userId, updateData);
    
    console.log('-'.repeat(60));
    console.log('\n📥 Update Result:');
    console.log(JSON.stringify(result, null, 2));
    
    // Wait a bit for DynamoDB eventual consistency
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Check final state
    console.log('\n📋 Final State:');
    const finalUser = await User.findById(userId);
    const finalShop = await Shop.findByUserId(userId);
    
    console.log(`   User Type: ${finalUser.user_type} ${finalUser.user_type !== initialUser.user_type ? '✅ CHANGED' : '❌ NOT CHANGED'}`);
    console.log(`   User Name: ${finalUser.name || 'missing'}`);
    console.log(`   Shop ID: ${finalShop?.id || 'not found'}`);
    console.log(`   Shop Address: ${finalShop?.address || 'missing'} ${finalShop?.address !== initialShop?.address ? '✅ CHANGED' : '❌ NOT CHANGED'}`);
    console.log(`   Shop Contact: ${finalShop?.contact || 'missing'} ${finalShop?.contact !== initialShop?.contact ? '✅ CHANGED' : '❌ NOT CHANGED'}`);
    console.log(`   Shop Aadhar: ${finalShop?.aadhar_card ? 'present' : 'missing'}`);
    console.log(`   Shop Type: ${finalShop?.shop_type || 'N/A'}`);
    
    // Validation
    console.log('\n✅ Validation:');
    const hasName = finalUser.name && finalUser.name.trim() !== '';
    const hasAddress = finalShop?.address && String(finalShop.address || '').trim() !== '';
    const hasContact = finalShop?.contact && String(finalShop.contact || '').trim() !== '';
    const hasAadhar = finalShop?.aadhar_card && String(finalShop.aadhar_card || '').trim() !== '';
    const isComplete = hasName && hasAddress && hasContact && hasAadhar;
    
    console.log(`   Name: ${hasName ? '✅' : '❌'}`);
    console.log(`   Address: ${hasAddress ? '✅' : '❌'}`);
    console.log(`   Contact: ${hasContact ? '✅' : '❌'}`);
    console.log(`   Aadhar: ${hasAadhar ? '✅' : '❌'}`);
    console.log(`   Complete: ${isComplete ? '✅' : '❌'}`);
    
    console.log('\n📊 Summary:');
    if (isComplete && finalUser.user_type === 'N') {
      console.log('   ⚠️  ISSUE: Signup is complete but user type is still N (should be R)');
    } else if (!isComplete) {
      console.log('   ⚠️  ISSUE: Signup is incomplete - missing fields');
      if (!hasAddress) console.log('      - Address not saved');
      if (!hasContact) console.log('      - Contact not saved');
    } else if (finalUser.user_type === 'R') {
      console.log('   ✅ SUCCESS: User type updated to R');
    } else {
      console.log(`   ℹ️  User type: ${finalUser.user_type}`);
    }
    
    console.log('\n' + '='.repeat(60));
    
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    console.error(error.stack);
  }
}

testB2CSignup()
  .then(() => {
    console.log('\n✅ Test completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Test failed:', error);
    process.exit(1);
  });


