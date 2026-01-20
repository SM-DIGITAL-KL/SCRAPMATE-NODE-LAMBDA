#!/usr/bin/env node

/**
 * Script to count vendors (S, R, SR, D) in v1 and v2, excluding specific vendors
 * Excludes vendors based on shop names from paid subscriptions list
 * Usage: node scripts/count-vendors-excluding-subscriptions.js [env]
 */

require('dotenv').config();
const { getDynamoDBClient } = require('../config/dynamodb');
const { ScanCommand } = require('@aws-sdk/lib-dynamodb');
const { getTableName } = require('../utils/dynamodbTableNames');
const User = require('../models/User');
const Shop = require('../models/Shop');

const client = getDynamoDBClient();

// Vendors to exclude (based on shop names from paid subscriptions)
const EXCLUDED_SHOP_NAMES = [
  'Shri varaha metalss',
  'sri sai sakthi waste paper mart',
  'sr service center',
  'User_9344727260'
].map(name => name.toLowerCase().trim());

async function countVendorsExcludingSubscriptions() {
  const env = process.argv[2] || process.env.NODE_ENV || 'prod';
  process.env.NODE_ENV = env;
  
  const usersTableName = getTableName('users');
  const shopsTableName = getTableName('shops');
  
  console.log(`\n📊 Counting Vendors (Excluding Paid Subscriptions)`);
  console.log(`   Environment: ${env}`);
  console.log(`   Users Table: ${usersTableName}`);
  console.log(`   Shops Table: ${shopsTableName}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  console.log('🚫 Excluding vendors with shop names:');
  EXCLUDED_SHOP_NAMES.forEach(name => console.log(`   - ${name}`));
  console.log('');

  try {
    // Vendor user types: S (Shop), R (Recycler), SR (Shop+Recycler), D (Delivery)
    const vendorTypes = ['S', 'R', 'SR', 'D'];
    
    let allUsers = [];
    let lastKey = null;

    // Scan all users
    console.log('📋 Scanning users...');
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

    // Filter vendors (exclude deleted users)
    const vendors = allUsers.filter(user => 
      vendorTypes.includes(user.user_type) &&
      (user.del_status !== 2 && user.del_status !== '2')
    );

    console.log(`📦 Total vendors (S, R, SR, D, not deleted): ${vendors.length}\n`);

    // Get shop data for vendors to check exclusion
    console.log('🔍 Checking shop names for exclusion...');
    const vendorsWithShops = [];
    const excludedVendors = [];
    let checkedCount = 0;

    for (const vendor of vendors) {
      checkedCount++;
      process.stdout.write(`\r   Checking ${checkedCount}/${vendors.length} vendors...`);
      
      let shouldExclude = false;
      let shopName = '';
      
      // For S, R, SR users, check shop name
      if (vendor.user_type === 'S' || vendor.user_type === 'R' || vendor.user_type === 'SR') {
        try {
          const shop = await Shop.findByUserId(parseInt(vendor.id));
          if (shop) {
            shopName = String(shop.shopname || shop.company_name || shop.ownername || '').toLowerCase().trim();
            
            // Check if shop name matches any excluded name
            if (EXCLUDED_SHOP_NAMES.some(excludedName => shopName.includes(excludedName) || excludedName.includes(shopName))) {
              shouldExclude = true;
            }
          }
        } catch (error) {
          // If shop not found or error, check user name as fallback
          const userName = String(vendor.name || '').toLowerCase().trim();
          if (EXCLUDED_SHOP_NAMES.some(excludedName => userName.includes(excludedName) || excludedName.includes(userName))) {
            shouldExclude = true;
            shopName = String(vendor.name || '');
          }
        }
      } else if (vendor.user_type === 'D') {
        // For Delivery users, check user name
        const userName = String(vendor.name || '').toLowerCase().trim();
        if (EXCLUDED_SHOP_NAMES.some(excludedName => userName.includes(excludedName) || excludedName.includes(userName))) {
          shouldExclude = true;
          shopName = String(vendor.name || '');
        }
      }

      if (shouldExclude) {
        excludedVendors.push({
          id: vendor.id,
          name: vendor.name,
          user_type: vendor.user_type,
          app_version: vendor.app_version || 'v1',
          shop_name: shopName || vendor.name
        });
      } else {
        vendorsWithShops.push(vendor);
      }
    }
    
    console.log(`\n✅ Checked ${checkedCount} vendors`);
    console.log(`   Excluded: ${excludedVendors.length}`);
    console.log(`   Included: ${vendorsWithShops.length}\n`);

    if (excludedVendors.length > 0) {
      console.log('🚫 Excluded Vendors:');
      excludedVendors.forEach(v => {
        console.log(`   - ID: ${v.id}, Name: ${v.name || v.shop_name}, Type: ${v.user_type}, Version: ${v.app_version || 'v1'}`);
      });
      console.log('');
    }

    // Count by app version
    const v1Vendors = vendorsWithShops.filter(vendor => {
      const appVersion = vendor.app_version || vendor.appVersion || 'v1';
      return appVersion === 'v1' || appVersion === 'v1.0' || !appVersion || appVersion === '';
    });

    const v2Vendors = vendorsWithShops.filter(vendor => {
      const appVersion = vendor.app_version || vendor.appVersion || 'v1';
      return appVersion === 'v2' || appVersion === 'v2.0' || appVersion.startsWith('v2');
    });

    // Count by user type
    const vendorsByType = {
      'S': vendorsWithShops.filter(v => v.user_type === 'S'),
      'R': vendorsWithShops.filter(v => v.user_type === 'R'),
      'SR': vendorsWithShops.filter(v => v.user_type === 'SR'),
      'D': vendorsWithShops.filter(v => v.user_type === 'D'),
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
    console.log('📊 VENDOR COUNT BY APP VERSION (EXCLUDING SUBSCRIPTIONS)');
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

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📊 VENDOR COUNT BY USER TYPE (EXCLUDING SUBSCRIPTIONS)');
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

    const totalVendors = vendorsWithShops.length;
    console.log(`   Total Vendors (Included):   ${totalVendors}`);
    console.log(`   Excluded Vendors:           ${excludedVendors.length}`);
    console.log(`   V1 Vendors:                 ${v1Vendors.length} (${totalVendors > 0 ? ((v1Vendors.length / totalVendors) * 100).toFixed(1) : 0}%)`);
    console.log(`   V2 Vendors:                 ${v2Vendors.length} (${totalVendors > 0 ? ((v2Vendors.length / totalVendors) * 100).toFixed(1) : 0}%)`);
    console.log('');

  } catch (error) {
    console.error(`\n❌ Error counting vendors:`, error.message);
    console.error('   Error details:', error);
    process.exit(1);
  }
}

// Run the script
countVendorsExcludingSubscriptions()
  .then(() => {
    console.log('✅ Script completed successfully\n');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Script failed:', error);
    process.exit(1);
  });
