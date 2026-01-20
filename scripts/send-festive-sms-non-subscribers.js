#!/usr/bin/env node

/**
 * Script to send festive offer SMS to vendors who are NOT opted in with monthly subscription plan
 * Usage: node scripts/send-festive-sms-non-subscribers.js [env] [--dry-run] [--batch-size=N]
 * Example: node scripts/send-festive-sms-non-subscribers.js prod
 */

require('dotenv').config();
const { getDynamoDBClient } = require('../config/dynamodb');
const { ScanCommand } = require('@aws-sdk/lib-dynamodb');
const { getTableName } = require('../utils/dynamodbTableNames');
const User = require('../models/User');
const Shop = require('../models/Shop');
const http = require('http');
const querystring = require('querystring');

const client = getDynamoDBClient();

// Parse command line arguments
const args = process.argv.slice(2);
const env = args.find(arg => !arg.startsWith('--')) || process.env.NODE_ENV || 'prod';
const isDryRun = args.includes('--dry-run');
const batchSizeArg = args.find(arg => arg.startsWith('--batch-size='));
const batchSize = batchSizeArg ? parseInt(batchSizeArg.split('=')[1]) : 10;
const delayBetweenBatches = 2000; // 2 seconds delay between batches

// SMS Configuration (from user provided credentials)
const SMS_CONFIG = {
  username: 'scrapmate',
  sendername: 'SCRPMT',
  smstype: 'TRANS',
  apikey: '1bf0131f-d1f2-49ed-9c57-19f1b4400f32',
  peid: '1701173389563945545',
  templateid: '1707176840358843187' // Correct template ID from template table
};

// SMS message
const SMS_MESSAGE = 'Festive offer! Get FREE scrap pickups of Rs1000+ and earn more with Scrapmate Partner: https://play.google.com/store/apps/details?id=com.app.scrapmatepartner';

// Vendors to exclude (from paid subscriptions list)
const EXCLUDED_SHOP_NAMES = [
  'Shri varaha metalss',
  'sri sai sakthi waste paper mart',
  'sr service center',
  'User_9344727260'
].map(name => name.toLowerCase().trim());

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Send SMS using bulksmsind.in API
 */
function sendSMS(phoneNumber, message) {
  return new Promise((resolve, reject) => {
    // Clean phone number
    const cleanedPhone = String(phoneNumber).replace(/\D/g, '');
    
    if (cleanedPhone.length !== 10) {
      reject(new Error(`Invalid phone number: ${phoneNumber}`));
      return;
    }

    const params = querystring.stringify({
      username: SMS_CONFIG.username,
      message: message,
      sendername: SMS_CONFIG.sendername,
      smstype: SMS_CONFIG.smstype,
      numbers: cleanedPhone,
      apikey: SMS_CONFIG.apikey,
      peid: SMS_CONFIG.peid,
      templateid: SMS_CONFIG.templateid
    });

    const options = {
      hostname: 'sms.bulksmsind.in',
      path: `/v2/sendSMS?${params}`,
      method: 'GET',
      timeout: 10000
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const response = JSON.parse(data);
          resolve(response);
        } catch (e) {
          resolve({ raw: data, status: 'unknown' });
        }
      });
    });

    req.on('error', (error) => reject(error));
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('SMS request timeout'));
    });
    req.end();
  });
}

/**
 * Check if vendor has active subscription
 */
function hasActiveSubscription(shop) {
  if (!shop) return false;
  
  // Check if subscribed
  if (shop.is_subscribed === false) return false;
  if (shop.is_subscription_ends === true) return false;
  
  // Check if subscription has ended
  if (shop.subscription_ends_at) {
    const endsAt = new Date(shop.subscription_ends_at);
    const now = new Date();
    if (endsAt < now) return false;
  }
  
  // For R type users, require explicit subscription confirmation
  return shop.is_subscribed === true;
}

/**
 * Check if vendor should be excluded based on shop name
 */
function shouldExcludeVendor(vendor, shop) {
  let shopName = '';
  
  if (shop) {
    shopName = String(shop.shopname || shop.company_name || shop.ownername || '').toLowerCase().trim();
  } else {
    shopName = String(vendor.name || '').toLowerCase().trim();
  }
  
  return EXCLUDED_SHOP_NAMES.some(excludedName => 
    shopName.includes(excludedName) || excludedName.includes(shopName)
  );
}

async function sendFestiveSMSToNonSubscribers() {
  process.env.NODE_ENV = env;
  const usersTableName = getTableName('users');
  
  console.log(`\n📱 Sending Festive Offer SMS to Non-Subscribers`);
  console.log(`   Environment: ${env}`);
  console.log(`   Table: ${usersTableName}`);
  console.log(`   Mode: ${isDryRun ? 'DRY RUN (no SMS will be sent)' : 'LIVE (SMS will be sent)'}`);
  console.log(`   Batch Size: ${batchSize} SMS per batch`);
  console.log(`   Delay Between Batches: ${delayBetweenBatches}ms`);
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

    // Filter vendors (not deleted, have phone number)
    const vendors = allUsers.filter(user => 
      vendorTypes.includes(user.user_type) &&
      user.mob_num && // Must have phone number
      (user.del_status !== 2 && user.del_status !== '2') // Not deleted
    );

    console.log(`📦 Total vendors found: ${vendors.length}`);
    console.log(`   S (Shop):        ${vendors.filter(v => v.user_type === 'S').length}`);
    console.log(`   R (Recycler):    ${vendors.filter(v => v.user_type === 'R').length}`);
    console.log(`   SR (Shop+Recycler): ${vendors.filter(v => v.user_type === 'SR').length}`);
    console.log(`   D (Delivery):    ${vendors.filter(v => v.user_type === 'D').length}`);
    console.log('');

    // Check subscription status and filter
    console.log('🔍 Checking subscription status and filtering...');
    const eligibleVendors = [];
    const excludedBySubscription = [];
    const excludedByShopName = [];
    let checkedCount = 0;

    for (const vendor of vendors) {
      checkedCount++;
      process.stdout.write(`\r   Checking ${checkedCount}/${vendors.length} vendors...`);
      
      // Check if should be excluded by shop name
      let shop = null;
      if (vendor.user_type === 'S' || vendor.user_type === 'R' || vendor.user_type === 'SR') {
        try {
          shop = await Shop.findByUserId(parseInt(vendor.id));
        } catch (error) {
          // Shop not found, continue
        }
      }
      
      if (shouldExcludeVendor(vendor, shop)) {
        excludedByShopName.push({
          id: vendor.id,
          name: vendor.name,
          user_type: vendor.user_type,
          shop_name: shop?.shopname || vendor.name
        });
        continue;
      }
      
      // Check subscription status (only for S, R, SR - D type doesn't have subscriptions)
      if (vendor.user_type === 'S' || vendor.user_type === 'R' || vendor.user_type === 'SR') {
        if (hasActiveSubscription(shop)) {
          excludedBySubscription.push({
            id: vendor.id,
            name: vendor.name,
            user_type: vendor.user_type,
            shop_name: shop?.shopname || vendor.name
          });
          continue;
        }
      }
      
      // Vendor is eligible
      eligibleVendors.push({
        id: vendor.id,
        name: vendor.name,
        user_type: vendor.user_type,
        phone: vendor.mob_num,
        app_version: vendor.app_version || 'v1',
        shop_name: shop?.shopname || vendor.name
      });
    }
    
    console.log(`\n✅ Checked ${checkedCount} vendors\n`);
    console.log(`📊 Filtering Results:`);
    console.log(`   ✅ Eligible (no subscription): ${eligibleVendors.length}`);
    console.log(`   🚫 Excluded by subscription: ${excludedBySubscription.length}`);
    console.log(`   🚫 Excluded by shop name: ${excludedByShopName.length}`);
    console.log('');

    if (eligibleVendors.length === 0) {
      console.log('⚠️  No eligible vendors found to send SMS to.');
      process.exit(0);
    }

    // Show message preview
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📝 SMS MESSAGE PREVIEW:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(SMS_MESSAGE);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    // Count by version
    const v1Vendors = eligibleVendors.filter(v => {
      const appVersion = v.app_version || 'v1';
      return appVersion === 'v1' || appVersion === 'v1.0' || !appVersion || appVersion === '';
    });
    const v2Vendors = eligibleVendors.filter(v => {
      const appVersion = v.app_version || 'v1';
      return appVersion === 'v2' || appVersion === 'v2.0' || appVersion.startsWith('v2');
    });

    console.log(`📊 Eligible Vendors Breakdown:`);
    console.log(`   V1 Vendors: ${v1Vendors.length}`);
    console.log(`   V2 Vendors: ${v2Vendors.length}`);
    console.log('');

    if (isDryRun) {
      console.log('🔍 DRY RUN MODE: No SMS will be sent.');
      console.log(`   Would send SMS to ${eligibleVendors.length} vendors.\n`);
      console.log('   Sample vendors (first 5):');
      eligibleVendors.slice(0, 5).forEach((vendor, index) => {
        console.log(`   ${index + 1}. ${vendor.name || 'N/A'} (${vendor.phone}) - Type: ${vendor.user_type}, Version: ${vendor.app_version || 'v1'}`);
      });
      console.log('\n✅ Dry run completed. Remove --dry-run flag to send actual SMS.');
      process.exit(0);
    }

    // Confirm before sending
    console.log('⚠️  WARNING: This will send SMS to eligible vendors!');
    console.log(`   Total eligible vendors: ${eligibleVendors.length}`);
    console.log(`   Estimated cost: Check with your SMS provider\n`);

    // Send SMS in batches
    let successCount = 0;
    let failureCount = 0;
    const failures = [];

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📤 SENDING SMS NOTIFICATIONS...');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    for (let i = 0; i < eligibleVendors.length; i += batchSize) {
      const batch = eligibleVendors.slice(i, i + batchSize);
      const batchNumber = Math.floor(i / batchSize) + 1;
      const totalBatches = Math.ceil(eligibleVendors.length / batchSize);

      console.log(`📦 Batch ${batchNumber}/${totalBatches} (${batch.length} vendors)...`);

      // Send SMS to each vendor in the batch
      const batchPromises = batch.map(async (vendor) => {
        try {
          const phoneNumber = String(vendor.phone).trim();
          
          // Skip if phone number is invalid
          if (!phoneNumber || phoneNumber.length < 10) {
            console.log(`   ⚠️  Skipping vendor ${vendor.id} (${vendor.name || 'N/A'}): Invalid phone number`);
            failureCount++;
            failures.push({
              vendor_id: vendor.id,
              name: vendor.name || 'N/A',
              phone: phoneNumber,
              error: 'Invalid phone number'
            });
            return;
          }

          // Send SMS
          const smsResult = await sendSMS(phoneNumber, SMS_MESSAGE);

          // Check if SMS was successful
          if (smsResult && Array.isArray(smsResult) && smsResult.length > 0) {
            const firstResult = smsResult[0];
            if (firstResult.status === 'success' || firstResult.status === 'queued') {
              successCount++;
              console.log(`   ✅ Sent to ${vendor.name || 'N/A'} (${phoneNumber})`);
            } else {
              failureCount++;
              console.log(`   ⚠️  SMS API returned: ${firstResult.status || 'unknown'}`);
              failures.push({
                vendor_id: vendor.id,
                name: vendor.name || 'N/A',
                phone: phoneNumber,
                error: firstResult.status || 'unknown'
              });
            }
          } else if (smsResult && smsResult.status === 'success') {
            successCount++;
            console.log(`   ✅ Sent to ${vendor.name || 'N/A'} (${phoneNumber})`);
          } else {
            failureCount++;
            console.log(`   ⚠️  SMS API returned: ${smsResult.status || 'unknown'}`);
            failures.push({
              vendor_id: vendor.id,
              name: vendor.name || 'N/A',
              phone: phoneNumber,
              error: smsResult.status || 'unknown'
            });
          }
        } catch (error) {
          failureCount++;
          const errorMsg = error.message || 'Unknown error';
          console.log(`   ❌ Failed to send to ${vendor.name || 'N/A'} (${vendor.phone}): ${errorMsg}`);
          failures.push({
            vendor_id: vendor.id,
            name: vendor.name || 'N/A',
            phone: vendor.phone,
            error: errorMsg
          });
        }
      });

      await Promise.all(batchPromises);

      // Wait before next batch (except for the last batch)
      if (i + batchSize < eligibleVendors.length) {
        console.log(`   ⏳ Waiting ${delayBetweenBatches}ms before next batch...\n`);
        await sleep(delayBetweenBatches);
      }
    }

    // Summary
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📊 SMS SENDING SUMMARY');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    console.log(`   Total Eligible Vendors: ${eligibleVendors.length}`);
    console.log(`   ✅ Successful:         ${successCount} (${((successCount / eligibleVendors.length) * 100).toFixed(1)}%)`);
    console.log(`   ❌ Failed:             ${failureCount} (${((failureCount / eligibleVendors.length) * 100).toFixed(1)}%)`);
    console.log('');

    if (failures.length > 0) {
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('❌ FAILED SMS DELIVERIES (first 10):');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
      failures.slice(0, 10).forEach((failure, index) => {
        console.log(`   ${index + 1}. ${failure.name} (${failure.phone}): ${failure.error}`);
      });
      if (failures.length > 10) {
        console.log(`   ... and ${failures.length - 10} more failures`);
      }
      console.log('');
    }

    console.log('✅ SMS notification campaign completed!');

  } catch (error) {
    console.error(`\n❌ Error sending festive SMS:`, error.message);
    console.error('   Error details:', error);
    process.exit(1);
  }
}

// Run the script
sendFestiveSMSToNonSubscribers()
  .then(() => {
    console.log('🎉 Script completed successfully\n');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Script failed:', error);
    process.exit(1);
  });
