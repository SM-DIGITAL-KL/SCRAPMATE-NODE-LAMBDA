#!/usr/bin/env node

/**
 * Script to count v1 vendors (S, R) who have latitude and longitude
 * Usage: node scripts/count-v1-vendors-with-location.js [env]
 */

require('dotenv').config();
const { getDynamoDBClient } = require('../config/dynamodb');
const { ScanCommand } = require('@aws-sdk/lib-dynamodb');
const { getTableName } = require('../utils/dynamodbTableNames');
const User = require('../models/User');
const Shop = require('../models/Shop');

const client = getDynamoDBClient();

/**
 * Check if shop has valid latitude and longitude
 */
function hasValidLocation(shop) {
  if (!shop) return false;
  
  // Check lat_log field (format: "latitude,longitude")
  if (shop.lat_log) {
    const latLog = String(shop.lat_log).trim();
    if (latLog && latLog.includes(',')) {
      const parts = latLog.split(',');
      if (parts.length >= 2) {
        const lat = parseFloat(parts[0].trim());
        const lng = parseFloat(parts[1].trim());
        if (!isNaN(lat) && !isNaN(lng) && lat !== 0 && lng !== 0) {
          return true;
        }
      }
    }
  }
  
  // Check separate latitude and longitude fields
  if (shop.latitude !== undefined && shop.latitude !== null && 
      shop.longitude !== undefined && shop.longitude !== null) {
    const lat = typeof shop.latitude === 'string' ? parseFloat(shop.latitude) : shop.latitude;
    const lng = typeof shop.longitude === 'string' ? parseFloat(shop.longitude) : shop.longitude;
    if (!isNaN(lat) && !isNaN(lng) && lat !== 0 && lng !== 0) {
      return true;
    }
  }
  
  return false;
}

async function countV1VendorsWithLocation() {
  const env = process.argv[2] || process.env.NODE_ENV || 'prod';
  process.env.NODE_ENV = env;
  
  const usersTableName = getTableName('users');
  
  console.log(`\n📊 Counting V1 Vendors (S, R) with Latitude/Longitude`);
  console.log(`   Environment: ${env}`);
  console.log(`   Table: ${usersTableName}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  try {
    // Vendor user types: S (Shop), R (Recycler)
    const vendorTypes = ['S', 'R'];
    
    let allUsers = [];
    let lastKey = null;

    // Scan all users
    console.log('📋 Scanning users table...');
    do {
      const params = {
        TableName: usersTableName,
      };

      if (lastKey) {
        params.ExclusiveStartKey = lastKey;
      }

      const command = new ScanCommand(params);
      const response = await client.send(command);

      if (response.Items && response.Items.length > 0) {
        allUsers = allUsers.concat(response.Items);
        process.stdout.write(`\r   Scanned ${allUsers.length} users...`);
      }

      lastKey = response.LastEvaluatedKey;
    } while (lastKey);
    
    console.log(`\n✅ Total users scanned: ${allUsers.length}\n`);

    // Filter v1 vendors (S, R) - not deleted
    const v1Vendors = allUsers.filter(user => {
      const isVendor = vendorTypes.includes(user.user_type);
      const isV1 = !user.app_version || 
                   user.app_version === 'v1' || 
                   user.app_version === 'v1.0' || 
                   user.app_version === '';
      const notDeleted = user.del_status !== 2 && user.del_status !== '2';
      return isVendor && isV1 && notDeleted;
    });

    console.log(`📦 Total V1 vendors (S, R, not deleted): ${v1Vendors.length}`);
    console.log(`   S (Shop):        ${v1Vendors.filter(v => v.user_type === 'S').length}`);
    console.log(`   R (Recycler):    ${v1Vendors.filter(v => v.user_type === 'R').length}`);
    console.log('');

    // Check location for each vendor
    console.log('🔍 Checking shop locations...');
    const vendorsWithLocation = [];
    const vendorsWithoutLocation = [];
    let checkedCount = 0;

    for (const vendor of v1Vendors) {
      checkedCount++;
      process.stdout.write(`\r   Checking ${checkedCount}/${v1Vendors.length} vendors...`);
      
      let shop = null;
      try {
        shop = await Shop.findByUserId(parseInt(vendor.id));
      } catch (error) {
        // Shop not found, continue
      }
      
      if (hasValidLocation(shop)) {
        vendorsWithLocation.push({
          id: vendor.id,
          name: vendor.name,
          user_type: vendor.user_type,
          phone: vendor.mob_num,
          shop_id: shop?.id,
          shop_name: shop?.shopname || shop?.company_name || vendor.name,
          lat_log: shop?.lat_log,
          latitude: shop?.latitude,
          longitude: shop?.longitude
        });
      } else {
        vendorsWithoutLocation.push({
          id: vendor.id,
          name: vendor.name,
          user_type: vendor.user_type,
          phone: vendor.mob_num,
          shop_id: shop?.id,
          shop_name: shop?.shopname || shop?.company_name || vendor.name
        });
      }
    }
    
    console.log(`\n✅ Checked ${checkedCount} vendors\n`);

    // Count by user type
    const sWithLocation = vendorsWithLocation.filter(v => v.user_type === 'S');
    const rWithLocation = vendorsWithLocation.filter(v => v.user_type === 'R');
    const sWithoutLocation = vendorsWithoutLocation.filter(v => v.user_type === 'S');
    const rWithoutLocation = vendorsWithoutLocation.filter(v => v.user_type === 'R');

    // Display results
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📊 V1 VENDORS WITH LATITUDE/LONGITUDE');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    console.log(`✅ Vendors WITH Location: ${vendorsWithLocation.length}`);
    console.log(`   S (Shop):        ${sWithLocation.length}`);
    console.log(`   R (Recycler):    ${rWithLocation.length}`);
    console.log('');

    console.log(`❌ Vendors WITHOUT Location: ${vendorsWithoutLocation.length}`);
    console.log(`   S (Shop):        ${sWithoutLocation.length}`);
    console.log(`   R (Recycler):    ${rWithoutLocation.length}`);
    console.log('');

    // Summary
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📊 SUMMARY');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    const totalV1Vendors = v1Vendors.length;
    console.log(`   Total V1 Vendors (S, R):     ${totalV1Vendors}`);
    console.log(`   With Location:                ${vendorsWithLocation.length} (${totalV1Vendors > 0 ? ((vendorsWithLocation.length / totalV1Vendors) * 100).toFixed(1) : 0}%)`);
    console.log(`   Without Location:             ${vendorsWithoutLocation.length} (${totalV1Vendors > 0 ? ((vendorsWithoutLocation.length / totalV1Vendors) * 100).toFixed(1) : 0}%)`);
    console.log('');

    // Show sample vendors with location
    if (vendorsWithLocation.length > 0) {
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('📍 SAMPLE VENDORS WITH LOCATION (first 10):');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
      vendorsWithLocation.slice(0, 10).forEach((vendor, index) => {
        console.log(`   ${index + 1}. ${vendor.name || 'N/A'} (ID: ${vendor.id}, Type: ${vendor.user_type})`);
        console.log(`      Shop: ${vendor.shop_name || 'N/A'}`);
        console.log(`      Location: ${vendor.lat_log || `${vendor.latitude}, ${vendor.longitude}` || 'N/A'}`);
        console.log('');
      });
    }

    // Show sample vendors without location
    if (vendorsWithoutLocation.length > 0) {
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('⚠️  SAMPLE VENDORS WITHOUT LOCATION (first 10):');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
      vendorsWithoutLocation.slice(0, 10).forEach((vendor, index) => {
        console.log(`   ${index + 1}. ${vendor.name || 'N/A'} (ID: ${vendor.id}, Type: ${vendor.user_type})`);
        console.log(`      Shop: ${vendor.shop_name || 'N/A'}`);
        console.log('');
      });
    }

  } catch (error) {
    console.error(`\n❌ Error counting vendors:`, error.message);
    console.error('   Error details:', error);
    process.exit(1);
  }
}

// Run the script
countV1VendorsWithLocation()
  .then(() => {
    console.log('✅ Script completed successfully\n');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Script failed:', error);
    process.exit(1);
  });
