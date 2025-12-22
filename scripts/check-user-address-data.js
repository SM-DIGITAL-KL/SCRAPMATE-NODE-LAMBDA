require('dotenv').config();
const { getDynamoDBClient } = require('../config/dynamodb');
const { ScanCommand } = require('@aws-sdk/lib-dynamodb');
const Address = require('../models/Address');

async function checkUserAddressData(userId) {
  try {
    const client = getDynamoDBClient();
    const uid = typeof userId === 'string' && !isNaN(userId) ? parseInt(userId) : userId;

    console.log(`\n🔍 Checking address data for user ID: ${userId}\n`);

    // Find addresses by customer_id (which is user_id)
    const addresses = await Address.findByCustomerId(uid);

    if (!addresses || addresses.length === 0) {
      console.log(`❌ No addresses found for user ID: ${userId}`);
      return null;
    }

    console.log(`✅ Found ${addresses.length} address(es)\n`);

    addresses.forEach((address, index) => {
      console.log(`📍 Address ${index + 1} (ID: ${address.id}):\n`);
      console.log(`   Address: ${address.address || 'N/A'}`);
      console.log(`   Type: ${address.addres_type || 'N/A'}`);
      console.log(`   Building No: ${address.building_no || 'N/A'}`);
      console.log(`   Landmark: ${address.landmark || 'N/A'}`);
      console.log(`   lat_log: ${address.lat_log || 'MISSING'}`);
      console.log(`   latitude: ${address.latitude !== undefined ? address.latitude : 'MISSING'}`);
      console.log(`   longitude: ${address.longitude !== undefined ? address.longitude : 'MISSING'}`);
      console.log(`\n`);
    });

    // Check if any address has location data
    const addressWithLocation = addresses.find(addr => 
      (addr.lat_log && addr.lat_log.includes(',')) || 
      (addr.latitude && addr.longitude)
    );

    if (addressWithLocation) {
      console.log(`✅ Found address with location data:\n`);
      console.log(`   Address: ${addressWithLocation.address}`);
      console.log(`   lat_log: ${addressWithLocation.lat_log}`);
      if (addressWithLocation.latitude && addressWithLocation.longitude) {
        console.log(`   latitude: ${addressWithLocation.latitude}`);
        console.log(`   longitude: ${addressWithLocation.longitude}`);
      }
    }

    return addresses;
  } catch (error) {
    console.error('❌ Error checking address data:', error);
    throw error;
  }
}

// Get user ID from command line argument
const userId = process.argv[2];

if (!userId) {
  console.error('Usage: node scripts/check-user-address-data.js <user_id>');
  process.exit(1);
}

checkUserAddressData(userId)
  .then((addresses) => {
    if (addresses) {
      process.exit(0);
    } else {
      process.exit(1);
    }
  })
  .catch((error) => {
    console.error('Error:', error);
    process.exit(1);
  });

