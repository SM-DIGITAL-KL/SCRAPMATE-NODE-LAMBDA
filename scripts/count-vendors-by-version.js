#!/usr/bin/env node

/**
 * Script to count vendors by app version (v1 vs v2)
 * Vendors are users with user_type: 'S', 'R', 'SR', or 'D'
 * Usage: node scripts/count-vendors-by-version.js [env]
 * Example: node scripts/count-vendors-by-version.js prod
 */

const { getDynamoDBClient } = require('../config/dynamodb');
const { ScanCommand } = require('@aws-sdk/lib-dynamodb');
const { getTableName } = require('../utils/dynamodbTableNames');

const client = getDynamoDBClient();

async function countVendorsByVersion() {
  const env = process.argv[2] || process.env.NODE_ENV || 'prod';
  process.env.NODE_ENV = env;
  
  const tableName = getTableName('users');
  
  console.log(`\n📊 Counting Vendors by App Version`);
  console.log(`   Environment: ${env}`);
  console.log(`   Table: ${tableName}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  try {
    // Vendor user types: S (Shop), R (Recycler), SR (Shop+Recycler), D (Delivery)
    const vendorTypes = ['S', 'R', 'SR', 'D'];
    
    let allUsers = [];
    let lastKey = null;

    // Scan all users
    do {
      const params = {
        TableName: tableName,
      };

      if (lastKey) {
        params.ExclusiveStartKey = lastKey;
      }

      const command = new ScanCommand(params);
      const response = await client.send(command);

      if (response.Items && response.Items.length > 0) {
        allUsers = allUsers.concat(response.Items);
      }

      lastKey = response.LastEvaluatedKey;
    } while (lastKey);

    console.log(`📋 Total users in database: ${allUsers.length}\n`);

    // Filter vendors
    const vendors = allUsers.filter(user => 
      vendorTypes.includes(user.user_type)
    );

    console.log(`📦 Total vendors (S, R, SR, D): ${vendors.length}\n`);

    // Count by app version
    const v1Vendors = vendors.filter(vendor => {
      const appVersion = vendor.app_version || vendor.appVersion || 'v1';
      return appVersion === 'v1' || appVersion === 'v1.0' || !appVersion || appVersion === '';
    });

    const v2Vendors = vendors.filter(vendor => {
      const appVersion = vendor.app_version || vendor.appVersion || 'v1';
      return appVersion === 'v2' || appVersion === 'v2.0' || appVersion.startsWith('v2');
    });

    const unknownVersionVendors = vendors.filter(vendor => {
      const appVersion = vendor.app_version || vendor.appVersion || 'v1';
      return !v1Vendors.includes(vendor) && !v2Vendors.includes(vendor);
    });

    // Count by user type
    const vendorsByType = {
      'S': vendors.filter(v => v.user_type === 'S'),
      'R': vendors.filter(v => v.user_type === 'R'),
      'SR': vendors.filter(v => v.user_type === 'SR'),
      'D': vendors.filter(v => v.user_type === 'D'),
    };

    // Count by user type and version
    const v1ByType = {
      'S': v1Vendors.filter(v => v.user_type === 'S').length,
      'R': v1Vendors.filter(v => v.user_type === 'R').length,
      'SR': v1Vendors.filter(v => v.user_type === 'SR').length,
      'D': v1Vendors.filter(v => v.user_type === 'D').length,
    };

    const v2ByType = {
      'S': v2Vendors.filter(v => v.user_type === 'S').length,
      'R': v2Vendors.filter(v => v.user_type === 'R').length,
      'SR': v2Vendors.filter(v => v.user_type === 'SR').length,
      'D': v2Vendors.filter(v => v.user_type === 'D').length,
    };

    // Display results
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📊 VENDOR COUNT BY APP VERSION');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    console.log(`✅ V1 Vendors: ${v1Vendors.length}`);
    console.log(`   S (Shop):        ${v1ByType.S}`);
    console.log(`   R (Recycler):    ${v1ByType.R}`);
    console.log(`   SR (Shop+Recycler): ${v1ByType.SR}`);
    console.log(`   D (Delivery):    ${v1ByType.D}`);
    console.log('');

    console.log(`✅ V2 Vendors: ${v2Vendors.length}`);
    console.log(`   S (Shop):        ${v2ByType.S}`);
    console.log(`   R (Recycler):    ${v2ByType.R}`);
    console.log(`   SR (Shop+Recycler): ${v2ByType.SR}`);
    console.log(`   D (Delivery):    ${v2ByType.D}`);
    console.log('');

    if (unknownVersionVendors.length > 0) {
      console.log(`⚠️  Unknown Version Vendors: ${unknownVersionVendors.length}`);
      console.log('   Sample app_version values:');
      const sampleVersions = [...new Set(unknownVersionVendors.slice(0, 10).map(v => v.app_version || v.appVersion || 'null'))];
      sampleVersions.forEach(version => {
        console.log(`      - ${version}`);
      });
      console.log('');
    }

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📊 VENDOR COUNT BY USER TYPE');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    console.log(`   S (Shop):        ${vendorsByType.S.length}`);
    console.log(`   R (Recycler):    ${vendorsByType.R.length}`);
    console.log(`   SR (Shop+Recycler): ${vendorsByType.SR.length}`);
    console.log(`   D (Delivery):    ${vendorsByType.D.length}`);
    console.log('');

    // Summary
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📊 SUMMARY');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    console.log(`   Total Vendors:   ${vendors.length}`);
    console.log(`   V1 Vendors:      ${v1Vendors.length} (${((v1Vendors.length / vendors.length) * 100).toFixed(1)}%)`);
    console.log(`   V2 Vendors:      ${v2Vendors.length} (${((v2Vendors.length / vendors.length) * 100).toFixed(1)}%)`);
    if (unknownVersionVendors.length > 0) {
      console.log(`   Unknown:         ${unknownVersionVendors.length} (${((unknownVersionVendors.length / vendors.length) * 100).toFixed(1)}%)`);
    }
    console.log('');

  } catch (error) {
    console.error(`❌ Error counting vendors:`, error.message);
    console.error('   Error details:', error);
    process.exit(1);
  }
}

// Run the script
countVendorsByVersion()
  .then(() => {
    console.log('✅ Script completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Script failed:', error);
    process.exit(1);
  });

