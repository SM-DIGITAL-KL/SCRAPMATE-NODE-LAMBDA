#!/usr/bin/env node

/**
 * Script to send SMS notifications to all vendors about the new partner app release
 * Usage: node scripts/send-vendor-app-release-sms.js [env] [--dry-run] [--batch-size=N]
 * Example: node scripts/send-vendor-app-release-sms.js prod
 * Example: node scripts/send-vendor-app-release-sms.js prod --dry-run
 * Example: node scripts/send-vendor-app-release-sms.js prod --batch-size=50
 */

require('dotenv').config();
const { getDynamoDBClient } = require('../config/dynamodb');
const { ScanCommand } = require('@aws-sdk/lib-dynamodb');
const { getTableName } = require('../utils/dynamodbTableNames');
const SmsService = require('../utils/smsService');

const client = getDynamoDBClient();

// Parse command line arguments
const args = process.argv.slice(2);
const env = args.find(arg => !arg.startsWith('--')) || process.env.NODE_ENV || 'prod';
const isDryRun = args.includes('--dry-run');
const batchSizeArg = args.find(arg => arg.startsWith('--batch-size='));
const batchSize = batchSizeArg ? parseInt(batchSizeArg.split('=')[1]) : 10; // Default: 10 SMS per batch
const delayBetweenBatches = 2000; // 2 seconds delay between batches

// SMS message template (ASCII only - no Unicode/emojis for SMS compatibility)
const SMS_MESSAGE = `Great News! SCRAPMATE has released a new Partner App on Play Store!

Join as B2B or B2C to receive customer orders directly.

Download now: https://play.google.com/store/apps/details?id=com.app.scrapmatepartner

Start receiving orders today! - SCRAPMATE Team`;

// Template ID for promotional SMS (you may need to update this based on your SMS provider)
const TEMPLATE_ID = '1707173856462706835'; // Using OTP template ID as fallback, update if you have a promotional template

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function sendVendorSMS() {
  process.env.NODE_ENV = env;
  const tableName = getTableName('users');
  
  console.log(`\n📱 Sending Vendor App Release SMS Notifications`);
  console.log(`   Environment: ${env}`);
  console.log(`   Table: ${tableName}`);
  console.log(`   Mode: ${isDryRun ? 'DRY RUN (no SMS will be sent)' : 'LIVE (SMS will be sent)'}`);
  console.log(`   Batch Size: ${batchSize} SMS per batch`);
  console.log(`   Delay Between Batches: ${delayBetweenBatches}ms`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  // Check SMS API configuration
  // Try to load from environment variables first
  let smsApiUrl = process.env['4SMS_API_URL_NEW'] || process.env.SMS_API_URL_NEW;
  let entityid = process.env['4SMS_API_ENITYID'] || process.env.SMS_API_ENITYID;
  let accessToken = process.env['4SMS_API_TOKEN'] || process.env.SMS_API_TOKEN;
  let accessTokenKey = process.env['4SMS_API_KEY'] || process.env.SMS_API_KEY;
  let smsHeader = process.env.SMS_HEADER_CENTER_ID || '';

  // If not set, use default values from serverless.yml (for local development)
  if (!smsApiUrl) {
    smsApiUrl = 'http://4sms.alp-ts.com/api/sms/v1.0/send-sms';
    console.log('⚠️  SMS_API_URL_NEW not set, using default from serverless.yml');
  }
  if (!entityid) {
    entityid = '1701173389563945545';
    console.log('⚠️  SMS_API_ENITYID not set, using default from serverless.yml');
  }
  if (!accessToken) {
    accessToken = 'EVLZ8267TMY1O2Z';
    console.log('⚠️  SMS_API_TOKEN not set, using default from serverless.yml');
  }
  if (!accessTokenKey) {
    accessTokenKey = '/BR2+k;L(-aPKA@r%5SO*GzcCm8&Hg6o';
    console.log('⚠️  SMS_API_KEY not set, using default from serverless.yml');
  }
  if (!smsHeader) {
    smsHeader = 'SCRPMT';
    console.log('⚠️  SMS_HEADER_CENTER_ID not set, using default from serverless.yml');
  }

  // Set them in process.env so SmsService can use them
  if (!process.env['4SMS_API_URL_NEW'] && !process.env.SMS_API_URL_NEW) {
    process.env['4SMS_API_URL_NEW'] = smsApiUrl;
    process.env.SMS_API_URL_NEW = smsApiUrl;
  }
  if (!process.env['4SMS_API_ENITYID'] && !process.env.SMS_API_ENITYID) {
    process.env['4SMS_API_ENITYID'] = entityid;
    process.env.SMS_API_ENITYID = entityid;
  }
  if (!process.env['4SMS_API_TOKEN'] && !process.env.SMS_API_TOKEN) {
    process.env['4SMS_API_TOKEN'] = accessToken;
    process.env.SMS_API_TOKEN = accessToken;
  }
  if (!process.env['4SMS_API_KEY'] && !process.env.SMS_API_KEY) {
    process.env['4SMS_API_KEY'] = accessTokenKey;
    process.env.SMS_API_KEY = accessTokenKey;
  }
  if (!process.env.SMS_HEADER_CENTER_ID) {
    process.env.SMS_HEADER_CENTER_ID = smsHeader;
  }

  if (!isDryRun && (!smsApiUrl || !entityid || !accessToken || !accessTokenKey)) {
    console.error('❌ SMS API configuration missing!');
    console.error('   Required environment variables:');
    console.error('     - SMS_API_URL_NEW (or 4SMS_API_URL_NEW)');
    console.error('     - SMS_API_ENITYID (or 4SMS_API_ENITYID)');
    console.error('     - SMS_API_TOKEN (or 4SMS_API_TOKEN)');
    console.error('     - SMS_API_KEY (or 4SMS_API_KEY)');
    console.error('     - SMS_HEADER_CENTER_ID');
    process.exit(1);
  }

  try {
    // Vendor user types: S (Shop), R (Recycler), SR (Shop+Recycler), D (Delivery)
    const vendorTypes = ['S', 'R', 'SR', 'D'];
    
    let allUsers = [];
    let lastKey = null;

    // Scan all users
    console.log('📋 Scanning users table...');
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
        console.log(`   Scanned ${allUsers.length} users so far...`);
      }

      lastKey = response.LastEvaluatedKey;
    } while (lastKey);

    console.log(`✅ Total users scanned: ${allUsers.length}\n`);

    // Filter vendors
    const vendors = allUsers.filter(user => 
      vendorTypes.includes(user.user_type) &&
      user.mob_num && // Must have phone number
      (user.del_status !== 2 || !user.del_status) // Not deleted
    );

    console.log(`📦 Total vendors found: ${vendors.length}`);
    console.log(`   S (Shop):        ${vendors.filter(v => v.user_type === 'S').length}`);
    console.log(`   R (Recycler):    ${vendors.filter(v => v.user_type === 'R').length}`);
    console.log(`   SR (Shop+Recycler): ${vendors.filter(v => v.user_type === 'SR').length}`);
    console.log(`   D (Delivery):    ${vendors.filter(v => v.user_type === 'D').length}`);
    console.log('');

    if (vendors.length === 0) {
      console.log('⚠️  No vendors found to send SMS to.');
      process.exit(0);
    }

    // Show message preview
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📝 SMS MESSAGE PREVIEW:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(SMS_MESSAGE);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    if (isDryRun) {
      console.log('🔍 DRY RUN MODE: No SMS will be sent.');
      console.log(`   Would send SMS to ${vendors.length} vendors.\n`);
      console.log('   Sample vendors (first 5):');
      vendors.slice(0, 5).forEach((vendor, index) => {
        console.log(`   ${index + 1}. ${vendor.name || 'N/A'} (${vendor.mob_num}) - Type: ${vendor.user_type}`);
      });
      console.log('\n✅ Dry run completed. Remove --dry-run flag to send actual SMS.');
      process.exit(0);
    }

    // Confirm before sending
    console.log('⚠️  WARNING: This will send SMS to ALL vendors!');
    console.log(`   Total vendors: ${vendors.length}`);
    console.log(`   Estimated cost: Check with your SMS provider\n`);
    
    // In production, you might want to add a confirmation prompt here
    // For now, we'll proceed automatically

    // Send SMS in batches
    let successCount = 0;
    let failureCount = 0;
    const failures = [];

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📤 SENDING SMS NOTIFICATIONS...');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    for (let i = 0; i < vendors.length; i += batchSize) {
      const batch = vendors.slice(i, i + batchSize);
      const batchNumber = Math.floor(i / batchSize) + 1;
      const totalBatches = Math.ceil(vendors.length / batchSize);

      console.log(`📦 Batch ${batchNumber}/${totalBatches} (${batch.length} vendors)...`);

      // Send SMS to each vendor in the batch
      const batchPromises = batch.map(async (vendor) => {
        try {
          const phoneNumber = String(vendor.mob_num).trim();
          
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

          // Send SMS using SmsService's singlePushSMS2 method
          await SmsService.singlePushSMS2(phoneNumber, TEMPLATE_ID, SMS_MESSAGE);

          successCount++;
          console.log(`   ✅ Sent to ${vendor.name || 'N/A'} (${phoneNumber})`);
        } catch (error) {
          failureCount++;
          const errorMsg = error.response?.data?.message || error.message || 'Unknown error';
          console.log(`   ❌ Failed to send to ${vendor.name || 'N/A'} (${vendor.mob_num}): ${errorMsg}`);
          failures.push({
            vendor_id: vendor.id,
            name: vendor.name || 'N/A',
            phone: vendor.mob_num,
            error: errorMsg
          });
        }
      });

      await Promise.all(batchPromises);

      // Wait before next batch (except for the last batch)
      if (i + batchSize < vendors.length) {
        console.log(`   ⏳ Waiting ${delayBetweenBatches}ms before next batch...\n`);
        await sleep(delayBetweenBatches);
      }
    }

    // Summary
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📊 SMS SENDING SUMMARY');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    console.log(`   Total Vendors:     ${vendors.length}`);
    console.log(`   ✅ Successful:     ${successCount} (${((successCount / vendors.length) * 100).toFixed(1)}%)`);
    console.log(`   ❌ Failed:         ${failureCount} (${((failureCount / vendors.length) * 100).toFixed(1)}%)`);
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
    console.error(`❌ Error sending vendor SMS:`, error.message);
    console.error('   Error details:', error);
    process.exit(1);
  }
}

// Run the script
sendVendorSMS()
  .then(() => {
    console.log('🎉 Script completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Script failed:', error);
    process.exit(1);
  });

