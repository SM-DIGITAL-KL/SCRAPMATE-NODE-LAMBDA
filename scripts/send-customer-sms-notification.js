require('dotenv').config();
const { getDynamoDBClient } = require('../config/dynamodb');
const { ScanCommand } = require('@aws-sdk/lib-dynamodb');
const http = require('http');
const querystring = require('querystring');

/**
 * Send SMS notification to all customer_app users in v1 and v2
 * Usage: node scripts/send-customer-sms-notification.js
 */

// SMS Configuration
const SMS_CONFIG = {
  username: 'scrapmate',
  sendername: 'SCRPMT',
  smstype: 'TRANS',
  apikey: '1bf0131f-d1f2-49ed-9c57-19f1b4400f32',
  peid: '1701173389563945545',
  templateid: '1707176897029207625'
};

const SMS_MESSAGE = 'Scrapmate offers doorstep scrap and food waste pickup , high scrap prices on iOS and Android https://play.google.com/store/apps/details?id=com.alpts.scrapmate';

// Test mode: Set to a phone number to test with only that number
const TEST_PHONE = null; // Set to null or empty string to send to all customers

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

async function sendCustomerSMSNotification() {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  if (TEST_PHONE) {
    console.log('🧪 TEST MODE: Sending SMS to Test Phone Number');
    console.log(`📱 Test Phone: ${TEST_PHONE}`);
  } else {
    console.log('📱 Sending SMS to All Customer App Users');
  }
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  try {
    // Test mode: Send only to the test phone number
    if (TEST_PHONE) {
      console.log('📋 Test Mode: Sending SMS to test phone number...\n');
      const results = {
        total: 1,
        smsSent: 0,
        smsFailed: 0,
        skipped: 0,
        errors: []
      };

      console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
      console.log(`Processing Test Phone`);
      console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
      console.log(`   Phone: ${TEST_PHONE}`);

      try {
        console.log(`   📱 Sending SMS to ${TEST_PHONE}...`);
        const smsResult = await sendSMS(TEST_PHONE, SMS_MESSAGE);
        
        // Check if SMS was successful
        if (Array.isArray(smsResult) && smsResult.length > 0) {
          const firstResult = smsResult[0];
          if (firstResult.status === 'success' || firstResult.status === 'sent') {
            console.log(`   ✅ SMS sent successfully (Message ID: ${firstResult.msgid || 'N/A'})`);
            results.smsSent++;
          } else {
            console.log(`   ⚠️  SMS API returned: ${firstResult.status || 'unknown'}`);
            results.smsFailed++;
            results.errors.push({
              phone: TEST_PHONE,
              error: `SMS status: ${firstResult.status || 'unknown'}`
            });
          }
        } else if (smsResult.status === 'success' || smsResult.status === 'sent') {
          console.log(`   ✅ SMS sent successfully`);
          results.smsSent++;
        } else {
          console.log(`   ⚠️  SMS API returned: ${smsResult.status || 'unknown'}`);
          results.smsFailed++;
          results.errors.push({
            phone: TEST_PHONE,
            error: `SMS status: ${smsResult.status || 'unknown'}`
          });
        }
      } catch (smsError) {
        console.log(`   ❌ SMS failed: ${smsError.message}`);
        results.smsFailed++;
        results.errors.push({
          phone: TEST_PHONE,
          error: smsError.message
        });
      }

      // Summary for test mode
      console.log('\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('📊 Test SMS Summary');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
      console.log(`   SMS Sent Successfully: ${results.smsSent}`);
      console.log(`   SMS Failed: ${results.smsFailed}\n`);

      if (results.errors.length > 0) {
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('⚠️  Errors Encountered');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
        results.errors.forEach((error, index) => {
          console.log(`   ${index + 1}. Phone: ${error.phone}`);
          console.log(`      Error: ${error.error}\n`);
        });
      }

      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('✅ Test SMS completed!');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
      return;
    }

    const client = getDynamoDBClient();
    
    // Step 1: Find all customer users (all versions)
    // Include: users with app_type = 'customer_app' OR users without app_type (older customers)
    // Exclude: users with app_type = 'vendor_app' and deleted users
    console.log('📋 Step 1: Finding all customer users...');
    let lastKey = null;
    const customers = [];

    do {
      const params = {
        TableName: 'users',
        FilterExpression: 'attribute_not_exists(app_type) OR app_type = :appType',
        ExpressionAttributeValues: {
          ':appType': 'customer_app'
        }
      };

      if (lastKey) {
        params.ExclusiveStartKey = lastKey;
      }

      const command = new ScanCommand(params);
      const response = await client.send(command);

      if (response.Items && response.Items.length > 0) {
        // Filter out deleted users (del_status = 2) and vendor_app users
        const activeCustomers = response.Items.filter(user => {
          const notDeleted = !user.del_status || user.del_status !== 2;
          const notVendor = !user.app_type || user.app_type !== 'vendor_app';
          return notDeleted && notVendor;
        });
        customers.push(...activeCustomers);
      }

      lastKey = response.LastEvaluatedKey;
    } while (lastKey);

    console.log(`✅ Found ${customers.length} active customer users (all versions)\n`);

    if (customers.length === 0) {
      console.log('ℹ️  No customers to send SMS to. Exiting...\n');
      return;
    }

    // Step 2: Send SMS to each customer
    console.log('📋 Step 2: Sending SMS notifications...\n');
    const results = {
      total: customers.length,
      smsSent: 0,
      smsFailed: 0,
      skipped: 0,
      errors: []
    };

    for (let i = 0; i < customers.length; i++) {
      const customer = customers[i];
      console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
      console.log(`Processing Customer ${i + 1}/${customers.length}`);
      console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
      console.log(`   User ID: ${customer.id}`);
      console.log(`   Name: ${customer.name || 'N/A'}`);
      console.log(`   Phone: ${customer.mob_num || 'N/A'}`);
      console.log(`   App Version: ${customer.app_version || 'N/A'}`);

      if (!customer.mob_num) {
        console.log(`   ⚠️  No phone number available - skipping`);
        results.skipped++;
        continue;
      }

      try {
        console.log(`   📱 Sending SMS to ${customer.mob_num}...`);
        const smsResult = await sendSMS(customer.mob_num, SMS_MESSAGE);
        
        // Check if SMS was successful
        if (Array.isArray(smsResult) && smsResult.length > 0) {
          const firstResult = smsResult[0];
          if (firstResult.status === 'success' || firstResult.status === 'sent') {
            console.log(`   ✅ SMS sent successfully (Message ID: ${firstResult.msgid || 'N/A'})`);
            results.smsSent++;
          } else {
            console.log(`   ⚠️  SMS API returned: ${firstResult.status || 'unknown'}`);
            results.smsFailed++;
            results.errors.push({
              user_id: customer.id,
              phone: customer.mob_num,
              error: `SMS status: ${firstResult.status || 'unknown'}`
            });
          }
        } else if (smsResult.status === 'success' || smsResult.status === 'sent') {
          console.log(`   ✅ SMS sent successfully`);
          results.smsSent++;
        } else {
          console.log(`   ⚠️  SMS API returned: ${smsResult.status || 'unknown'}`);
          results.smsFailed++;
          results.errors.push({
            user_id: customer.id,
            phone: customer.mob_num,
            error: `SMS status: ${smsResult.status || 'unknown'}`
          });
        }

        // Add a small delay to avoid rate limiting
        if (i < customers.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      } catch (smsError) {
        console.log(`   ❌ SMS failed: ${smsError.message}`);
        results.smsFailed++;
        results.errors.push({
          user_id: customer.id,
          phone: customer.mob_num,
          error: smsError.message
        });
      }
    }

    // Step 3: Summary
    console.log('\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📊 SMS Notification Summary');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    console.log(`   Total Customers Found: ${results.total}`);
    console.log(`   SMS Sent Successfully: ${results.smsSent}`);
    console.log(`   SMS Failed: ${results.smsFailed}`);
    console.log(`   Skipped (No Phone): ${results.skipped}`);
    console.log(`   Errors: ${results.errors.length}\n`);

    if (results.errors.length > 0) {
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('⚠️  Errors Encountered');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
      results.errors.forEach((error, index) => {
        console.log(`   ${index + 1}. User ID: ${error.user_id}, Phone: ${error.phone}`);
        console.log(`      Error: ${error.error}\n`);
      });
    }

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('✅ SMS notification process completed!');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  } catch (error) {
    console.error('\n❌ Fatal error:', error.message);
    console.error('Stack:', error.stack);
    process.exit(1);
  }
}

sendCustomerSMSNotification();
