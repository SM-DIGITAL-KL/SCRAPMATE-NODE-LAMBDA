/**
 * Test script to update delivery boy address
 * Usage: node scripts/test-update-delivery-address.js <user_id> <address>
 */

require('dotenv').config();
const User = require('../models/User');
const DeliveryBoy = require('../models/DeliveryBoy');
const V2ProfileService = require('../services/user/v2ProfileService');

async function testUpdateAddress(userId, address) {
  try {
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`🧪 Testing address update for user ${userId}`);
    console.log(`📝 Address to set: "${address}"`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    // Check user exists
    const user = await User.findById(userId);
    if (!user) {
      console.log('❌ User not found');
      return;
    }

    console.log('✅ User found:', user.name, `(Type: ${user.user_type})`);

    // Check current delivery boy record
    console.log('\n📋 Step 1: Checking current delivery boy record...');
    let deliveryBoy = await DeliveryBoy.findByUserId(userId);
    console.log('Current delivery boy:', deliveryBoy ? JSON.stringify(deliveryBoy, null, 2) : 'Not found');

    // Test creating/updating via V2ProfileService
    console.log('\n📋 Step 2: Updating via V2ProfileService...');
    const updateData = {
      delivery: {
        address: address,
      },
    };

    console.log('Update data:', JSON.stringify(updateData, null, 2));

    const updatedProfile = await V2ProfileService.updateProfile(userId, updateData);

    console.log('\n✅ Updated profile:');
    console.log(JSON.stringify(updatedProfile, null, 2));

    // Verify delivery boy record
    console.log('\n📋 Step 3: Verifying delivery boy record after update...');
    const verifyDelivery = await DeliveryBoy.findByUserId(userId);
    console.log('Delivery boy after update:', verifyDelivery ? JSON.stringify(verifyDelivery, null, 2) : 'Not found');

    if (verifyDelivery) {
      console.log(`\n✅ Address in database: "${verifyDelivery.address}"`);
      if (verifyDelivery.address === address) {
        console.log('✅ Address matches! Update successful.');
      } else {
        console.log(`❌ Address mismatch! Expected: "${address}", Got: "${verifyDelivery.address}"`);
      }
    } else {
      console.log('❌ Delivery boy record still not found after update!');
    }

  } catch (error) {
    console.error('\n❌ Error:', error);
    console.error('Error stack:', error.stack);
  }
}

const userId = process.argv[2];
const address = process.argv[3] || 'Test Address 123, City, State';

if (!userId) {
  console.error('❌ Error: User ID is required');
  console.log('\nUsage: node scripts/test-update-delivery-address.js <user_id> [address]');
  console.log('Example: node scripts/test-update-delivery-address.js 1764140693337 "123 Main St"');
  process.exit(1);
}

testUpdateAddress(userId, address)
  .then(() => {
    console.log('\n✅ Test completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Test failed:', error);
    process.exit(1);
  });

