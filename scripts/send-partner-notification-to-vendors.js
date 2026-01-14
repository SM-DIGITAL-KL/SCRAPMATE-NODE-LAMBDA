#!/usr/bin/env node

/**
 * Script to send SMS notifications to all v1 and v2 vendors about the partner app
 * Saves all results (success/error) to a file
 * Usage: node scripts/send-partner-notification-to-vendors.js [env] [--dry-run] [--batch-size=N]
 * Example: node scripts/send-partner-notification-to-vendors.js prod
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
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

// Template ID for promotional SMS
const TEMPLATE_ID = '1707173856462706835';

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function sendPartnerNotificationToVendors() {
  process.env.NODE_ENV = env;
  const tableName = getTableName('users');
  
  console.log(`\n📱 Sending Partner App Notification to All Vendors (v1 & v2)`);
  console.log(`   Environment: ${env}`);
  console.log(`   Table: ${tableName}`);
  console.log(`   Mode: ${isDryRun ? 'DRY RUN (no SMS will be sent)' : 'LIVE (SMS will be sent)'}`);
  console.log(`   Batch Size: ${batchSize} SMS per batch`);
  console.log(`   Delay Between Batches: ${delayBetweenBatches}ms`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  // Check SMS API configuration
  let smsApiUrl = process.env['4SMS_API_URL_NEW'] || process.env.SMS_API_URL_NEW;
  let entityid = process.env['4SMS_API_ENITYID'] || process.env.SMS_API_ENITYID;
  let accessToken = process.env['4SMS_API_TOKEN'] || process.env.SMS_API_TOKEN;
  let accessTokenKey = process.env['4SMS_API_KEY'] || process.env.SMS_API_KEY;
  let smsHeader = process.env.SMS_HEADER_CENTER_ID || '';

  // If not set, use old working credentials
  if (!smsApiUrl) {
    smsApiUrl = 'http://4sms.alp-ts.com/api/sms/v1.0/send-sms';
    console.log('⚠️  SMS_API_URL_NEW not set, using default URL');
  }
  if (!entityid) {
    entityid = '1701173389563945545';
    console.log('⚠️  SMS_API_ENITYID not set, using default entity ID');
  }
  if (!accessToken) {
    accessToken = 'EVLZ8267TMY1O2Z'; // Old working token
    console.log('✅ Using old SMS API access token');
  }
  if (!accessTokenKey) {
    accessTokenKey = '/BR2+k;L(-aPKA@r%5SO*GzcCm8&Hg6o'; // Old working key
    console.log('✅ Using old SMS API access token key');
  }
  if (!smsHeader) {
    smsHeader = 'SCRPMT';
    console.log('⚠️  SMS_HEADER_CENTER_ID not set, using default header');
  }

  // Set them in process.env so SmsService can use them
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
    process.exit(1);
  }

  // Results array to save to file
  const results = [];
  const startTime = new Date().toISOString();

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
        ProjectionExpression: 'id, mob_num, user_type, app_type, app_version, #name, del_status',
        ExpressionAttributeNames: {
          '#name': 'name',
        },
      };

      if (lastKey) {
        params.ExclusiveStartKey = lastKey;
      }

      const command = new ScanCommand(params);
      const response = await client.send(command);

      if (response.Items && response.Items.length > 0) {
        allUsers = allUsers.concat(response.Items);
        if (allUsers.length % 1000 === 0) {
          console.log(`   Scanned ${allUsers.length} users so far...`);
        }
      }

      lastKey = response.LastEvaluatedKey;
    } while (lastKey);

    console.log(`✅ Total users scanned: ${allUsers.length}\n`);

    // Filter vendors (v1 and v2)
    const vendors = allUsers.filter(user => 
      vendorTypes.includes(user.user_type) &&
      user.mob_num && // Must have phone number
      (user.del_status !== 2 || !user.del_status) && // Not deleted
      (user.app_version === 'v1' || user.app_version === 'v2' || !user.app_version) // v1, v2, or no version (treat as v1)
    );

    // Separate v1 and v2 vendors
    const v1Vendors = vendors.filter(v => v.app_version === 'v1' || !v.app_version);
    const v2Vendors = vendors.filter(v => v.app_version === 'v2');

    console.log(`📦 Total vendors found: ${vendors.length}`);
    console.log(`   V1 Vendors: ${v1Vendors.length}`);
    console.log(`   V2 Vendors: ${v2Vendors.length}`);
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
        console.log(`   ${index + 1}. ${vendor.name || 'N/A'} (${vendor.mob_num}) - Type: ${vendor.user_type}, Version: ${vendor.app_version || 'v1'}`);
      });
      console.log('\n✅ Dry run completed. Remove --dry-run flag to send actual SMS.');
      process.exit(0);
    }

    // Send SMS in batches
    let successCount = 0;
    let failureCount = 0;

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
        const result = {
          vendor_id: vendor.id,
          name: vendor.name || 'N/A',
          phone: String(vendor.mob_num).trim(),
          user_type: vendor.user_type,
          app_version: vendor.app_version || 'v1',
          app_type: vendor.app_type || 'N/A',
          timestamp: new Date().toISOString(),
          status: 'pending',
          success: false,
          error: null,
          error_message: null,
          api_response: null, // Store full API response
        };

        try {
          const phoneNumber = result.phone;
          
          // Skip if phone number is invalid
          if (!phoneNumber || phoneNumber.length < 10) {
            result.status = 'failed';
            result.error = 'Invalid phone number';
            result.error_message = 'Phone number is invalid or too short';
            failureCount++;
            console.log(`   ⚠️  Skipping vendor ${vendor.id} (${vendor.name || 'N/A'}): Invalid phone number`);
            results.push(result);
            return;
          }

          // Send SMS using SmsService's singlePushSMS2 method
          const apiResponse = await SmsService.singlePushSMS2(phoneNumber, TEMPLATE_ID, SMS_MESSAGE);
          
          // Store the API response
          result.api_response = apiResponse;
          
          // Check if API response indicates actual success
          // The API might return status: 'success' but message might not be delivered
          const isActuallySuccessful = apiResponse && (
            (apiResponse.status === 'success' || apiResponse.status === 'Success') &&
            apiResponse.httpStatusCode === 200
          );

          if (isActuallySuccessful) {
            result.status = 'success';
            result.success = true;
            successCount++;
            console.log(`   ✅ Sent to ${vendor.name || 'N/A'} (${phoneNumber})`);
          } else {
            // API returned but status indicates failure
            result.status = 'failed';
            result.success = false;
            result.error = apiResponse?.message || 'API returned non-success status';
            result.error_message = apiResponse?.message || 'API returned non-success status';
            failureCount++;
            console.log(`   ⚠️  API returned non-success for ${vendor.name || 'N/A'} (${phoneNumber}): ${result.error_message}`);
          }
        } catch (error) {
          result.status = 'failed';
          result.error = error.response?.data?.message || error.message || 'Unknown error';
          result.error_message = error.response?.data?.message || error.message || 'Unknown error';
          result.api_response = error.response?.data || { error: error.message };
          failureCount++;
          console.log(`   ❌ Failed to send to ${vendor.name || 'N/A'} (${vendor.mob_num}): ${result.error}`);
        }

        results.push(result);
      });

      await Promise.all(batchPromises);

      // Wait before next batch (except for the last batch)
      if (i + batchSize < vendors.length) {
        console.log(`   ⏳ Waiting ${delayBetweenBatches}ms before next batch...\n`);
        await sleep(delayBetweenBatches);
      }
    }

    const endTime = new Date().toISOString();

    // Summary
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📊 SMS SENDING SUMMARY');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    console.log(`   Total Vendors:     ${vendors.length}`);
    console.log(`   ✅ Successful:     ${successCount} (${((successCount / vendors.length) * 100).toFixed(1)}%)`);
    console.log(`   ❌ Failed:         ${failureCount} (${((failureCount / vendors.length) * 100).toFixed(1)}%)`);
    console.log('');

    // Save results to file
    const resultsData = {
      campaign: 'Partner App Notification',
      environment: env,
      start_time: startTime,
      end_time: endTime,
      total_vendors: vendors.length,
      successful: successCount,
      failed: failureCount,
      success_rate: `${((successCount / vendors.length) * 100).toFixed(1)}%`,
      results: results,
      summary: {
        v1_vendors: v1Vendors.length,
        v2_vendors: v2Vendors.length,
        by_user_type: {
          S: vendors.filter(v => v.user_type === 'S').length,
          R: vendors.filter(v => v.user_type === 'R').length,
          SR: vendors.filter(v => v.user_type === 'SR').length,
          D: vendors.filter(v => v.user_type === 'D').length,
        },
        successful_by_version: {
          v1: results.filter(r => r.success && (r.app_version === 'v1' || !r.app_version)).length,
          v2: results.filter(r => r.success && r.app_version === 'v2').length,
        },
        failed_by_version: {
          v1: results.filter(r => !r.success && (r.app_version === 'v1' || !r.app_version)).length,
          v2: results.filter(r => !r.success && r.app_version === 'v2').length,
        },
      },
    };

    // Save to JSON file
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
    const filename = `partner-notification-results-${timestamp}.json`;
    const filepath = path.join(__dirname, filename);
    
    fs.writeFileSync(filepath, JSON.stringify(resultsData, null, 2));
    console.log(`💾 Results saved to: ${filepath}\n`);

    // Also create a CSV file for easy viewing
    const csvFilename = `partner-notification-results-${timestamp}.csv`;
    const csvFilepath = path.join(__dirname, csvFilename);
    
    const csvHeader = 'Vendor ID,Name,Phone,User Type,App Version,Status,Success,Error Message,API Status,API Message,Timestamp\n';
    const csvRows = results.map(r => {
      const name = (r.name || 'N/A').replace(/,/g, ';'); // Replace commas in names
      const error = (r.error_message || '').replace(/,/g, ';').replace(/\n/g, ' '); // Replace commas and newlines in errors
      const apiStatus = r.api_response?.status || 'N/A';
      const apiMessage = (r.api_response?.message || '').replace(/,/g, ';').replace(/\n/g, ' ');
      return `${r.vendor_id},${name},${r.phone},${r.user_type},${r.app_version || 'v1'},${r.status},${r.success},${error},${apiStatus},${apiMessage},${r.timestamp}`;
    }).join('\n');
    
    fs.writeFileSync(csvFilepath, csvHeader + csvRows);
    console.log(`💾 CSV results saved to: ${csvFilepath}\n`);

    // Show failed SMS details (first 10)
    const failedResults = results.filter(r => !r.success);
    if (failedResults.length > 0) {
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('❌ FAILED SMS DELIVERIES (first 10):');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
      failedResults.slice(0, 10).forEach((failure, index) => {
        console.log(`   ${index + 1}. ${failure.name} (${failure.phone}): ${failure.error_message}`);
      });
      if (failedResults.length > 10) {
        console.log(`   ... and ${failedResults.length - 10} more failures`);
      }
      console.log('');
    }

    console.log('✅ SMS notification campaign completed!');
    console.log(`   Full results available in: ${filename}`);
    console.log(`   CSV results available in: ${csvFilename}\n`);

  } catch (error) {
    console.error(`❌ Error sending vendor SMS:`, error.message);
    console.error('   Error details:', error);
    
    // Save error to results file
    const errorResults = {
      campaign: 'Partner App Notification',
      environment: env,
      start_time: startTime,
      end_time: new Date().toISOString(),
      error: error.message,
      error_stack: error.stack,
      results: results,
    };
    
    const errorFilename = `partner-notification-error-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5)}.json`;
    const errorFilepath = path.join(__dirname, errorFilename);
    fs.writeFileSync(errorFilepath, JSON.stringify(errorResults, null, 2));
    console.error(`   Error details saved to: ${errorFilepath}`);
    
    process.exit(1);
  }
}

// Run the script
sendPartnerNotificationToVendors()
  .then(() => {
    console.log('🎉 Script completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Script failed:', error);
    process.exit(1);
  });

