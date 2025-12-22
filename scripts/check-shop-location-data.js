require('dotenv').config();
const { getDynamoDBClient } = require('../config/dynamodb');
const { ScanCommand } = require('@aws-sdk/lib-dynamodb');
const Shop = require('../models/Shop');

const TABLE_NAME = 'shops';

async function checkShopLocationData(userId) {
  try {
    const client = getDynamoDBClient();
    const uid = typeof userId === 'string' && !isNaN(userId) ? parseInt(userId) : userId;

    console.log(`\n🔍 Checking shop location data for user ID: ${userId}\n`);

    // Find shop by user_id
    const shop = await Shop.findByUserId(uid);

    if (!shop) {
      console.log(`❌ No shop found for user ID: ${userId}`);
      return null;
    }

    console.log(`✅ Shop found!`);
    console.log(`   Shop ID: ${shop.id}`);
    console.log(`   User ID: ${shop.user_id}`);
    console.log(`   Shop Name: ${shop.shopname || 'N/A'}`);
    console.log(`   Address: ${shop.address || 'N/A'}`);
    console.log(`\n📍 Location Data Fields:\n`);

    // Check all location fields
    const locationFields = {
      'lat_log': shop.lat_log || null,
      'latitude': shop.latitude !== undefined ? shop.latitude : null,
      'longitude': shop.longitude !== undefined ? shop.longitude : null,
      'pincode': shop.pincode || null,
      'place_id': shop.place_id || null,
      'state': shop.state || null,
      'language': shop.language || null,
      'place': shop.place || null,
      'location': shop.location || null,
    };

    let allPresent = true;
    let missingFields = [];

    Object.entries(locationFields).forEach(([field, value]) => {
      const status = value !== null && value !== undefined && value !== '' ? '✅' : '❌';
      const displayValue = value !== null && value !== undefined ? value : 'MISSING';
      console.log(`   ${status} ${field.padEnd(15)}: ${displayValue}`);
      
      if (value === null || value === undefined || value === '') {
        allPresent = false;
        missingFields.push(field);
      }
    });

    console.log(`\n📊 Summary:\n`);
    if (allPresent) {
      console.log(`   ✅ All location fields are present!`);
    } else {
      console.log(`   ⚠️  Missing fields: ${missingFields.join(', ')}`);
    }

    // Validate lat_log format if present
    if (shop.lat_log) {
      const parts = shop.lat_log.split(',');
      if (parts.length === 2) {
        const lat = parseFloat(parts[0]);
        const lng = parseFloat(parts[1]);
        if (!isNaN(lat) && !isNaN(lng)) {
          console.log(`   ✅ lat_log format is valid: ${lat}, ${lng}`);
        } else {
          console.log(`   ❌ lat_log format is invalid`);
        }
      } else {
        console.log(`   ❌ lat_log format is invalid (should be "lat,lng")`);
      }
    }

    // Check consistency between lat_log and latitude/longitude
    if (shop.lat_log && shop.latitude !== undefined && shop.longitude !== undefined) {
      const [latFromLog, lngFromLog] = shop.lat_log.split(',').map(Number);
      if (Math.abs(latFromLog - shop.latitude) < 0.0001 && Math.abs(lngFromLog - shop.longitude) < 0.0001) {
        console.log(`   ✅ lat_log matches latitude/longitude`);
      } else {
        console.log(`   ⚠️  lat_log doesn't match latitude/longitude`);
        console.log(`      lat_log: ${shop.lat_log}`);
        console.log(`      latitude: ${shop.latitude}, longitude: ${shop.longitude}`);
      }
    }

    console.log(`\n`);

    return shop;
  } catch (error) {
    console.error('❌ Error checking shop location data:', error);
    throw error;
  }
}

// Get user ID from command line argument
const userId = process.argv[2];

if (!userId) {
  console.error('Usage: node scripts/check-shop-location-data.js <user_id>');
  process.exit(1);
}

checkShopLocationData(userId)
  .then((shop) => {
    if (shop) {
      process.exit(0);
    } else {
      process.exit(1);
    }
  })
  .catch((error) => {
    console.error('Error:', error);
    process.exit(1);
  });

