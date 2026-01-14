#!/usr/bin/env node

/**
 * Script to check SMS delivery status for a specific phone number
 * This helps verify if the API response actually indicates successful delivery
 */

require('dotenv').config();
const SmsService = require('../utils/smsService');

// Parse command line arguments
const phoneNumber = process.argv[2];
const message = process.argv[3] || 'Test message to verify delivery status';

if (!phoneNumber) {
  console.error('❌ Please provide a phone number');
  console.log('Usage: node scripts/check-sms-delivery-status.js [phone_number] [message]');
  process.exit(1);
}

// Set old working credentials
process.env['4SMS_API_URL_NEW'] = process.env['4SMS_API_URL_NEW'] || 'http://4sms.alp-ts.com/api/sms/v1.0/send-sms';
process.env.SMS_API_URL_NEW = process.env.SMS_API_URL_NEW || 'http://4sms.alp-ts.com/api/sms/v1.0/send-sms';
process.env['4SMS_API_ENITYID'] = process.env['4SMS_API_ENITYID'] || '1701173389563945545';
process.env.SMS_API_ENITYID = process.env.SMS_API_ENITYID || '1701173389563945545';
process.env['4SMS_API_TOKEN'] = process.env['4SMS_API_TOKEN'] || 'EVLZ8267TMY1O2Z';
process.env.SMS_API_TOKEN = process.env.SMS_API_TOKEN || 'EVLZ8267TMY1O2Z';
process.env['4SMS_API_KEY'] = process.env['4SMS_API_KEY'] || '/BR2+k;L(-aPKA@r%5SO*GzcCm8&Hg6o';
process.env.SMS_API_KEY = process.env.SMS_API_KEY || '/BR2+k;L(-aPKA@r%5SO*GzcCm8&Hg6o';
process.env.SMS_HEADER_CENTER_ID = process.env.SMS_HEADER_CENTER_ID || 'SCRPMT';

const TEMPLATE_ID = '1707173856462706835';

async function checkSMSDelivery() {
  console.log('📱 Checking SMS Delivery Status');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  console.log(`   Phone Number: ${phoneNumber}`);
  console.log(`   Message: ${message}`);
  console.log(`   Template ID: ${TEMPLATE_ID}\n`);

  try {
    console.log('📤 Sending SMS...\n');
    const apiResponse = await SmsService.singlePushSMS2(phoneNumber, TEMPLATE_ID, message);

    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📊 API RESPONSE ANALYSIS');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    console.log('Full API Response:');
    console.log(JSON.stringify(apiResponse, null, 2));
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    // Analyze the response
    const status = apiResponse?.status || 'unknown';
    const httpStatusCode = apiResponse?.httpStatusCode || apiResponse?.statusCode || 'unknown';
    const apiMessage = apiResponse?.message || apiResponse?.msg || 'No message';

    console.log('📋 Response Analysis:');
    console.log(`   Status: ${status}`);
    console.log(`   HTTP Status Code: ${httpStatusCode}`);
    console.log(`   API Message: ${apiMessage}`);

    if (status === 'success' || status === 'Success') {
      if (httpStatusCode === 200) {
        console.log('\n✅ API indicates SUCCESS');
        console.log('   However, if the message was not received, possible reasons:');
        console.log('   1. Phone number might be blocked or DND (Do Not Disturb)');
        console.log('   2. Carrier filtering or spam detection');
        console.log('   3. Network issues or delivery delay');
        console.log('   4. Phone is switched off or out of coverage');
        console.log('   5. The API might be returning false positives');
        console.log('\n   💡 Check with the SMS provider dashboard for actual delivery status');
      } else {
        console.log('\n⚠️  API returned success status but non-200 HTTP code');
        console.log('   This might indicate a partial success or false positive');
      }
    } else {
      console.log('\n❌ API indicates FAILURE');
      console.log(`   Reason: ${apiMessage}`);
    }

    // Check for data array (some APIs return delivery details in data array)
    if (apiResponse?.data && Array.isArray(apiResponse.data)) {
      console.log('\n📦 Delivery Details:');
      apiResponse.data.forEach((item, index) => {
        console.log(`   Item ${index + 1}:`, JSON.stringify(item, null, 2));
      });
    }

    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  } catch (error) {
    console.error('\n❌ Error sending SMS:');
    console.error(`   Error: ${error.message}`);
    if (error.response) {
      console.error(`   HTTP Status: ${error.response.status}`);
      console.error(`   Response Data:`, JSON.stringify(error.response.data, null, 2));
    }
    console.error('\n');
    process.exit(1);
  }
}

checkSMSDelivery().catch(error => {
  console.error('❌ Script failed:', error);
  process.exit(1);
});

