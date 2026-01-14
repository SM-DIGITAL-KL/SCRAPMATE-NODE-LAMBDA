#!/usr/bin/env node

/**
 * Script to retry sending SMS to failed users
 * This script reads the failure list and retries sending SMS
 * Usage: node scripts/retry-failed-sms.js [env] [--batch-size=N]
 * Example: node scripts/retry-failed-sms.js prod
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
const batchSizeArg = args.find(arg => arg.startsWith('--batch-size='));
const batchSize = batchSizeArg ? parseInt(batchSizeArg.split('=')[1]) : 10;
const delayBetweenBatches = 2000;

// SMS message template (ASCII only - no Unicode/emojis for SMS compatibility)
const SMS_MESSAGE = `Great News! SCRAPMATE has released a new Customer App on Play Store!

Sell scraps from home and get food waste pickup service.

Download now: https://play.google.com/store/apps/details?id=com.alpts.scrapmate

Start selling your scraps today! - SCRAPMATE Team`;

const TEMPLATE_ID = '1707173856462706835';

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function retryFailedSMS() {
  process.env.NODE_ENV = env;
  const tableName = getTableName('users');
  
  console.log(`\n📱 Retrying Failed SMS for Customer App Users`);
  console.log(`   Environment: ${env}`);
  console.log(`   Table: ${tableName}`);
  console.log(`   Batch Size: ${batchSize} SMS per batch`);
  console.log(`   Delay Between Batches: ${delayBetweenBatches}ms`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  // Set SMS API credentials (using new credentials)
  const smsApiUrl = 'http://4sms.alp-ts.com/api/sms/v1.0/send-sms';
  const entityid = '1701173389563945545';
  const accessToken = '9KOTMY69K6EW8G7';
  const accessTokenKey = '*UaJ-DndNk5g8z[fhrwFOcXv|SI;2b^';
  const smsHeader = 'SCRPMT';

  // Set them in process.env
  process.env['4SMS_API_URL_NEW'] = smsApiUrl;
  process.env.SMS_API_URL_NEW = smsApiUrl;
  process.env['4SMS_API_ENITYID'] = entityid;
  process.env.SMS_API_ENITYID = entityid;
  process.env['4SMS_API_TOKEN'] = accessToken;
  process.env.SMS_API_TOKEN = accessToken;
  process.env['4SMS_API_KEY'] = accessTokenKey;
  process.env.SMS_API_KEY = accessTokenKey;
  process.env.SMS_HEADER_CENTER_ID = smsHeader;

  console.log('✅ Using new SMS API credentials');
  console.log(`   Access Token: ${accessToken}`);
  console.log(`   Entity ID: ${entityid}`);
  console.log('');

  try {
    // Get all customer app users
    let allUsers = [];
    let lastKey = null;

    console.log('📋 Scanning users table...');
    do {
      const params = { TableName: tableName };
      if (lastKey) params.ExclusiveStartKey = lastKey;
      const command = new ScanCommand(params);
      const response = await client.send(command);
      if (response.Items) {
        allUsers = allUsers.concat(response.Items);
        console.log(`   Scanned ${allUsers.length} users so far...`);
      }
      lastKey = response.LastEvaluatedKey;
    } while (lastKey);

    console.log(`✅ Total users scanned: ${allUsers.length}\n`);

    // Filter all customer app users
    const customerAppUsers = allUsers.filter(user => {
      const isCustomerApp = user.app_type === 'customer_app' || 
                           user.user_type === 'C' || 
                           user.user_type === 'U';
      const hasPhone = user.mob_num && String(user.mob_num).trim().length >= 10;
      const notDeleted = user.del_status !== 2 || !user.del_status;
      return isCustomerApp && hasPhone && notDeleted;
    });

    // Filter out invalid phone numbers (test numbers)
    const invalidPhonePatterns = [
      '9999999999', '2222222222', '1111111111', '0000000000',
      '1234567890', '9876543210', '1232345555', '3658956235',
      '3658956258', '4554466375', '2356852369', '5686865386',
      '5656698866', '2356852369'
    ];

    const validUsers = customerAppUsers.filter(user => {
      const phone = String(user.mob_num).trim();
      return !invalidPhonePatterns.includes(phone) && 
             phone.length === 10 && 
             /^[6-9]\d{9}$/.test(phone); // Valid Indian mobile number
    });

    console.log(`📦 Total customer app users: ${customerAppUsers.length}`);
    console.log(`📦 Valid phone numbers: ${validUsers.length}`);
    console.log(`📦 Invalid/test numbers filtered: ${customerAppUsers.length - validUsers.length}`);
    console.log('');

    if (validUsers.length === 0) {
      console.log('⚠️  No valid customer app users found to send SMS to.');
      process.exit(0);
    }

    // Send SMS in batches
    let successCount = 0;
    let failureCount = 0;
    const failures = [];

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📤 SENDING SMS NOTIFICATIONS...');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    for (let i = 0; i < validUsers.length; i += batchSize) {
      const batch = validUsers.slice(i, i + batchSize);
      const batchNumber = Math.floor(i / batchSize) + 1;
      const totalBatches = Math.ceil(validUsers.length / batchSize);

      console.log(`📦 Batch ${batchNumber}/${totalBatches} (${batch.length} users)...`);

      const batchPromises = batch.map(async (user) => {
        try {
          const phoneNumber = String(user.mob_num).trim();
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

      if (i + batchSize < validUsers.length) {
        console.log(`   ⏳ Waiting ${delayBetweenBatches}ms before next batch...\n`);
        await sleep(delayBetweenBatches);
      }
    }

    // Summary
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📊 SMS SENDING SUMMARY');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    console.log(`   Total Valid Users:  ${validUsers.length}`);
    console.log(`   ✅ Successful:      ${successCount} (${((successCount / validUsers.length) * 100).toFixed(1)}%)`);
    console.log(`   ❌ Failed:          ${failureCount} (${((failureCount / validUsers.length) * 100).toFixed(1)}%)`);
    console.log('');

    if (failures.length > 0) {
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('❌ FAILED SMS DELIVERIES (first 20):');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
      failures.slice(0, 20).forEach((failure, index) => {
        console.log(`   ${index + 1}. ${failure.name} (${failure.phone}): ${failure.error}`);
      });
      if (failures.length > 20) {
        console.log(`   ... and ${failures.length - 20} more failures`);
      }
      console.log('');
    }

    console.log('✅ SMS notification campaign completed!');

  } catch (error) {
    console.error(`❌ Error retrying failed SMS:`, error.message);
    console.error('   Error details:', error);
    process.exit(1);
  }
}

retryFailedSMS()
  .then(() => {
    console.log('🎉 Script completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Script failed:', error);
    process.exit(1);
  });

