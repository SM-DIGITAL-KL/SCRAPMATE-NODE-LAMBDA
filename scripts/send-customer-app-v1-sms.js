#!/usr/bin/env node

/**
 * Script to send SMS notifications to all customer app v1 users
 * Usage: node scripts/send-customer-app-v1-sms.js [env] [--dry-run] [--batch-size=N]
 * Example: node scripts/send-customer-app-v1-sms.js prod
 * Example: node scripts/send-customer-app-v1-sms.js prod --dry-run
 * Example: node scripts/send-customer-app-v1-sms.js prod --batch-size=50
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

// SMS message template for customer app users (ASCII only - no Unicode/emojis for SMS compatibility)
const SMS_MESSAGE = `Great News! SCRAPMATE has released a new Customer App on Play Store!

Sell scraps from home and get food waste pickup service.

Download now: https://play.google.com/store/apps/details?id=com.alpts.scrapmate

Start selling your scraps today! - SCRAPMATE Team`;

// Template ID for promotional SMS (you may need to update this based on your SMS provider)
const TEMPLATE_ID = '1707173856462706835'; // Using OTP template ID as fallback, update if you have a promotional template

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function sendCustomerAppV1SMS() {
  process.env.NODE_ENV = env;
  const tableName = getTableName('users');
  
  console.log(`\n📱 Sending SMS to All Customer App Users (V1 & V2)`);
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

  // Always use the new provided credentials
  smsApiUrl = 'http://4sms.alp-ts.com/api/sms/v1.0/send-sms';
  entityid = '1701173389563945545'; // Keep same entity ID, or update if needed for new credentials
  accessToken = '9KOTMY69K6EW8G7';
  accessTokenKey = '*UaJ-DndNk5g8z[fhrwFOcXv|SI;2b^';
  smsHeader = 'SCRPMT';
  
  console.log('✅ Using new SMS API credentials:');
  console.log(`   Access Token: ${accessToken}`);
  console.log(`   Entity ID: ${entityid}`);
  console.log(`   Header: ${smsHeader}`);

  // Always set them in process.env so SmsService can use them (override with new credentials)
  process.env['4SMS_API_URL_NEW'] = smsApiUrl;
  process.env.SMS_API_URL_NEW = smsApiUrl;
  process.env['4SMS_API_ENITYID'] = entityid;
  process.env.SMS_API_ENITYID = entityid;
  process.env['4SMS_API_TOKEN'] = accessToken;
  process.env.SMS_API_TOKEN = accessToken;
  process.env['4SMS_API_KEY'] = accessTokenKey;
  process.env.SMS_API_KEY = accessTokenKey;
  process.env.SMS_HEADER_CENTER_ID = smsHeader;

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
    // Customer app v1 users: app_type='customer_app' and (app_version='v1' or app_version is null/undefined/empty)
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

    // Filter all customer app users (v1 and v2)
    // Customer app users are identified by:
    // - app_type === 'customer_app' OR
    // - user_type === 'C' (Customer) OR
    // - user_type === 'U' (User)
    let customerAppUsers = allUsers.filter(user => {
      const isCustomerApp = user.app_type === 'customer_app' || 
                           user.user_type === 'C' || 
                           user.user_type === 'U';
      const hasPhone = user.mob_num && String(user.mob_num).trim().length >= 10;
      const notDeleted = user.del_status !== 2 || !user.del_status;
      
      return isCustomerApp && hasPhone && notDeleted;
    });

    // Filter out invalid/test phone numbers
    const invalidPhonePatterns = [
      '9999999999', '2222222222', '1111111111', '0000000000',
      '1234567890', '9876543210', '1232345555', '3658956235',
      '3658956258', '4554466375', '2356852369', '5686865386',
      '5656698866'
    ];

    customerAppUsers = customerAppUsers.filter(user => {
      const phone = String(user.mob_num).trim();
      // Valid Indian mobile number: starts with 6-9 and has 10 digits
      return !invalidPhonePatterns.includes(phone) && 
             phone.length === 10 && 
             /^[6-9]\d{9}$/.test(phone);
    });

    // Count by version
    const v1Users = customerAppUsers.filter(user => {
      const appVersion = user.app_version || user.appVersion || '';
      return (appVersion === 'v1' || appVersion === 'v1.0' || appVersion === '' || !appVersion) && 
             appVersion !== 'v2' && appVersion !== 'v2.0' && !appVersion.startsWith('v2');
    });
    const v2Users = customerAppUsers.filter(user => {
      const appVersion = user.app_version || user.appVersion || '';
      return appVersion === 'v2' || appVersion === 'v2.0' || appVersion.startsWith('v2');
    });

    console.log(`📦 Total customer app users found: ${customerAppUsers.length}`);
    console.log(`   V1 users: ${v1Users.length}`);
    console.log(`   V2 users: ${v2Users.length}`);
    console.log('');

    if (customerAppUsers.length === 0) {
      console.log('⚠️  No customer app users found to send SMS to.');
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
      console.log(`   Would send SMS to ${customerAppUsers.length} customer app users (v1 and v2).\n`);
      console.log('   Sample users (first 5):');
      customerAppUsers.slice(0, 5).forEach((user, index) => {
        console.log(`   ${index + 1}. ${user.name || 'N/A'} (${user.mob_num}) - App: ${user.app_type}, Version: ${user.app_version || user.appVersion || 'v1'}`);
      });
      console.log('\n✅ Dry run completed. Remove --dry-run flag to send actual SMS.');
      process.exit(0);
    }

    // Confirm before sending
    console.log('⚠️  WARNING: This will send SMS to ALL customer app users (v1 and v2)!');
    console.log(`   Total users: ${customerAppUsers.length}`);
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

    for (let i = 0; i < customerAppUsers.length; i += batchSize) {
      const batch = customerAppUsers.slice(i, i + batchSize);
      const batchNumber = Math.floor(i / batchSize) + 1;
      const totalBatches = Math.ceil(customerAppUsers.length / batchSize);

      console.log(`📦 Batch ${batchNumber}/${totalBatches} (${batch.length} users)...`);

      // Send SMS to each user in the batch
      const batchPromises = batch.map(async (user) => {
        try {
          const phoneNumber = String(user.mob_num).trim();
          
          // Skip if phone number is invalid
          if (!phoneNumber || phoneNumber.length < 10) {
            console.log(`   ⚠️  Skipping user ${user.id} (${user.name || 'N/A'}): Invalid phone number`);
            failureCount++;
            failures.push({
              user_id: user.id,
              name: user.name || 'N/A',
              phone: phoneNumber,
              error: 'Invalid phone number'
            });
            return;
          }

          // Send SMS using SmsService's singlePushSMS2 method
          await SmsService.singlePushSMS2(phoneNumber, TEMPLATE_ID, SMS_MESSAGE);

          successCount++;
          console.log(`   ✅ Sent to ${user.name || 'N/A'} (${phoneNumber})`);
        } catch (error) {
          failureCount++;
          const errorMsg = error.response?.data?.message || error.message || 'Unknown error';
          console.log(`   ❌ Failed to send to ${user.name || 'N/A'} (${user.mob_num}): ${errorMsg}`);
          failures.push({
            user_id: user.id,
            name: user.name || 'N/A',
            phone: user.mob_num,
            error: errorMsg
          });
        }
      });

      await Promise.all(batchPromises);

      // Wait before next batch (except for the last batch)
      if (i + batchSize < customerAppUsers.length) {
        console.log(`   ⏳ Waiting ${delayBetweenBatches}ms before next batch...\n`);
        await sleep(delayBetweenBatches);
      }
    }

    // Summary
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📊 SMS SENDING SUMMARY');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    console.log(`   Total Users:       ${customerAppUsers.length}`);
    console.log(`   V1 Users:          ${v1Users.length}`);
    console.log(`   V2 Users:          ${v2Users.length}`);
    console.log(`   ✅ Successful:     ${successCount} (${((successCount / customerAppUsers.length) * 100).toFixed(1)}%)`);
    console.log(`   ❌ Failed:         ${failureCount} (${((failureCount / customerAppUsers.length) * 100).toFixed(1)}%)`);
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
    console.error(`❌ Error sending customer app v1 SMS:`, error.message);
    console.error('   Error details:', error);
    process.exit(1);
  }
}

// Run the script
sendCustomerAppV1SMS()
  .then(() => {
    console.log('🎉 Script completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Script failed:', error);
    process.exit(1);
  });

