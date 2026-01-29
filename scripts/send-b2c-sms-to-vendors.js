/**
 * Script to send SMS to all vendors from database and bulk_message_notifications table
 * Message: "Hi {name}, scrap pickup pending near {location} Join as B2C {url}"
 * Must be exactly 160 characters
 * Usage: 
 *   node scripts/send-b2c-sms-to-vendors.js [--dry-run]
 *   TEST_MOBILE=9074135121 node scripts/send-b2c-sms-to-vendors.js  (test mode)
 */

require('dotenv').config();
const { getDynamoDBClient } = require('../config/dynamodb');
const { ScanCommand } = require('@aws-sdk/lib-dynamodb');
const { getTableName, getEnvironment } = require('../utils/dynamodbTableNames');
const User = require('../models/User');
const Shop = require('../models/Shop');
const BulkMessageNotification = require('../models/BulkMessageNotification');
const http = require('http');
const querystring = require('querystring');

// SMS Configuration
const SMS_CONFIG = {
  username: 'scrapmate',
  sendername: 'SCRPMT',
  smstype: 'TRANS',
  apikey: '1bf0131f-d1f2-49ed-9c57-19f1b4400f32',
  peid: '1701173389563945545',
  templateid: '1707176802268094939',
  baseUrl: 'https://play.google.com/store/apps/details?id=com.app.scrapmatepartner',
  maxMessageLength: 160,
  delayBetweenSms: 1000, // 1 second delay between SMS
};

// Base message template
const BASE_MESSAGE = 'Hi {name}, scrap pickup pending near {location} Join as B2C {url}';

/**
 * Extract phone number from various formats
 */
function extractPhoneNumber(phone) {
  if (!phone) return null;
  let cleaned = phone.toString().replace(/\D/g, '');
  if (cleaned.startsWith('91') && cleaned.length === 12) {
    cleaned = cleaned.substring(2);
  }
  if (cleaned.length === 10 && /^[6-9]\d{9}$/.test(cleaned)) {
    return cleaned;
  }
  return null;
}

/**
 * Trim text to fit within remaining character limit
 */
function trimText(text, maxLength) {
  if (!text || text.length <= maxLength) return text || '';
  const trimmed = text.substring(0, maxLength);
  const lastSpace = trimmed.lastIndexOf(' ');
  if (lastSpace > maxLength - 5) {
    return trimmed.substring(0, lastSpace);
  }
  return text.substring(0, maxLength);
}

/**
 * Build message ensuring it stays under 160 characters
 */
function buildMessage(name, location) {
  const url = SMS_CONFIG.baseUrl;
  const fixedParts = 'Hi , scrap pickup pending near  Join as B2C ';
  const fixedPartLength = fixedParts.length + url.length;
  const availableSpace = SMS_CONFIG.maxMessageLength - fixedPartLength;
  
  let fullName = (name || 'Trader').trim();
  let fullLocation = (location || 'your area').trim();
  
  let nameMax = Math.floor(availableSpace * 0.5);
  let locationMax = availableSpace - nameMax;
  
  if (fullName.length < nameMax) {
    locationMax += (nameMax - fullName.length);
    nameMax = fullName.length;
  }
  if (fullLocation.length < locationMax) {
    nameMax += (locationMax - fullLocation.length);
    locationMax = fullLocation.length;
  }
  
  let trimmedName = trimText(fullName, nameMax);
  let trimmedLocation = trimText(fullLocation, locationMax);
  
  let message = BASE_MESSAGE
    .replace('{name}', trimmedName)
    .replace('{location}', trimmedLocation)
    .replace('{url}', url);
  
  // Maximize usage if under limit
  if (message.length < SMS_CONFIG.maxMessageLength) {
    let iterations = 0;
    const maxIterations = 10;
    
    while (message.length < SMS_CONFIG.maxMessageLength && iterations < maxIterations) {
      const remaining = SMS_CONFIG.maxMessageLength - message.length;
      let added = false;
      
      if (trimmedLocation.length < fullLocation.length) {
        const addChars = Math.min(remaining, fullLocation.length - trimmedLocation.length);
        if (addChars > 0) {
          trimmedLocation = fullLocation.substring(0, trimmedLocation.length + addChars);
          added = true;
        }
      }
      
      const newMessage = BASE_MESSAGE
        .replace('{name}', trimmedName)
        .replace('{location}', trimmedLocation)
        .replace('{url}', url);
      
      const newRemaining = SMS_CONFIG.maxMessageLength - newMessage.length;
      
      if (trimmedName.length < fullName.length && newRemaining > 0) {
        const addChars = Math.min(newRemaining, fullName.length - trimmedName.length);
        if (addChars > 0) {
          trimmedName = fullName.substring(0, trimmedName.length + addChars);
          added = true;
        }
      }
      
      message = BASE_MESSAGE
        .replace('{name}', trimmedName)
        .replace('{location}', trimmedLocation)
        .replace('{url}', url);
      
      iterations++;
      if (!added || message.length >= SMS_CONFIG.maxMessageLength) break;
    }
  }
  
  // Trim if over limit
  while (message.length > SMS_CONFIG.maxMessageLength) {
    const excess = message.length - SMS_CONFIG.maxMessageLength;
    
    if (trimmedLocation.length > excess + 3) {
      trimmedLocation = trimText(fullLocation, trimmedLocation.length - excess);
    } else if (trimmedName.length > excess + 3) {
      trimmedName = trimText(fullName, trimmedName.length - excess);
    } else {
      const locationTrim = Math.ceil(excess * 0.6);
      const nameTrim = Math.floor(excess * 0.4);
      trimmedLocation = trimText(fullLocation, Math.max(5, trimmedLocation.length - locationTrim));
      trimmedName = trimText(fullName, Math.max(5, trimmedName.length - nameTrim));
    }
    
    message = BASE_MESSAGE
      .replace('{name}', trimmedName)
      .replace('{location}', trimmedLocation)
      .replace('{url}', url);
    
    if (message.length <= SMS_CONFIG.maxMessageLength) break;
    
    // Emergency truncate
    if (message.length > SMS_CONFIG.maxMessageLength) {
      const beforeUrl = message.indexOf(url);
      if (beforeUrl > 0) {
        const excess2 = message.length - SMS_CONFIG.maxMessageLength;
        const mainPart = message.substring(0, beforeUrl - excess2).trim();
        message = mainPart + ' ' + url;
      } else {
        message = message.substring(0, SMS_CONFIG.maxMessageLength);
      }
      break;
    }
  }
  
  // Ensure exactly 160 characters by maximizing content
  if (message.length < SMS_CONFIG.maxMessageLength) {
    // Try to add more characters from location or name to reach exactly 160
    const remaining = SMS_CONFIG.maxMessageLength - message.length;
    let iterations = 0;
    const maxIterations = 20;
    
    while (message.length < SMS_CONFIG.maxMessageLength && iterations < maxIterations) {
      const currentRemaining = SMS_CONFIG.maxMessageLength - message.length;
      let added = false;
      
      // Prefer adding to location first (usually has more content)
      if (trimmedLocation.length < fullLocation.length && currentRemaining > 0) {
        const addChars = Math.min(currentRemaining, fullLocation.length - trimmedLocation.length);
        if (addChars > 0) {
          trimmedLocation = fullLocation.substring(0, trimmedLocation.length + addChars);
          added = true;
        }
      }
      
      // Then add to name if still have space
      const tempMessage = BASE_MESSAGE
        .replace('{name}', trimmedName)
        .replace('{location}', trimmedLocation)
        .replace('{url}', url);
      const newRemaining = SMS_CONFIG.maxMessageLength - tempMessage.length;
      
      if (trimmedName.length < fullName.length && newRemaining > 0) {
        const addChars = Math.min(newRemaining, fullName.length - trimmedName.length);
        if (addChars > 0) {
          trimmedName = fullName.substring(0, trimmedName.length + addChars);
          added = true;
        }
      }
      
      message = BASE_MESSAGE
        .replace('{name}', trimmedName)
        .replace('{location}', trimmedLocation)
        .replace('{url}', url);
      
      iterations++;
      if (!added || message.length >= SMS_CONFIG.maxMessageLength) break;
    }
  }
  
  // Final check: trim to exactly 160 if over
  if (message.length > SMS_CONFIG.maxMessageLength) {
    message = message.substring(0, SMS_CONFIG.maxMessageLength);
  }
  
  return message;
}

/**
 * Send SMS to a single phone number
 */
function sendSMS(phoneNumber, message) {
  return new Promise((resolve, reject) => {
    const params = querystring.stringify({
      username: SMS_CONFIG.username,
      message: message,
      sendername: SMS_CONFIG.sendername,
      smstype: SMS_CONFIG.smstype,
      numbers: phoneNumber,
      apikey: SMS_CONFIG.apikey,
      peid: SMS_CONFIG.peid,
      templateid: SMS_CONFIG.templateid,
    });

    const options = {
      hostname: 'sms.bulksmsind.in',
      path: `/v2/sendSMS?${params}`,
      method: 'GET',
      timeout: 10000
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        try {
          const response = JSON.parse(data);
          let responseObj = response;
          if (Array.isArray(response) && response.length > 0) {
            responseObj = response[0];
          }
          
          if (responseObj && (responseObj.status === 'success' || responseObj.msg === 'successfully submitted' || responseObj.statusCode === '200')) {
            resolve({ success: true, response: responseObj });
          } else {
            resolve({ success: false, response: responseObj });
          }
        } catch (e) {
          const rawResponse = data.trim();
          if (rawResponse && !rawResponse.includes('error') && !rawResponse.includes('Error')) {
            resolve({ success: true, response: rawResponse });
          } else {
            resolve({ success: false, response: rawResponse });
          }
        }
      });
    });

    req.on('error', (error) => {
      reject({ success: false, error: error.message });
    });

    req.on('timeout', () => {
      req.destroy();
      reject({ success: false, error: 'SMS request timeout' });
    });

    req.end();
  });
}

async function sendB2CSMSToVendors() {
  try {
    const isDryRun = process.argv.includes('--dry-run');
    const TEST_MOBILE = process.env.TEST_MOBILE || (process.argv[2] && /^[0-9]+$/.test(process.argv[2]) ? process.argv[2] : null);
    const isTestMode = !!TEST_MOBILE;
    const environment = getEnvironment();
    const USER_TABLE = getTableName('users');
    const client = getDynamoDBClient();
    
    console.log('\n📱 Sending B2C SMS to All Vendors');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`   Environment: ${environment}`);
    if (isTestMode) {
      console.log(`   🧪 TEST MODE ENABLED - Mobile: ${TEST_MOBILE}`);
    }
    console.log(`   Mode: ${isDryRun ? 'DRY RUN (no SMS will be sent)' : 'LIVE (SMS will be sent)'}`);
    console.log(`   Max Message Length: ${SMS_CONFIG.maxMessageLength} chars (exactly)`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    
    // Step 1: Get vendors from users table
    console.log('📋 Step 1: Getting vendors from users table...');
    const vendorTypes = ['S', 'R', 'SR', 'D'];
    let allVendors = [];
    let lastKey = null;
    
    do {
      const params = {
        TableName: USER_TABLE,
        FilterExpression: '(user_type = :typeS OR user_type = :typeR OR user_type = :typeSR OR user_type = :typeD) AND (attribute_not_exists(del_status) OR del_status <> :deleted) AND attribute_exists(mob_num)',
        ExpressionAttributeValues: {
          ':typeS': 'S',
          ':typeR': 'R',
          ':typeSR': 'SR',
          ':typeD': 'D',
          ':deleted': 2
        }
      };
      
      if (lastKey) {
        params.ExclusiveStartKey = lastKey;
      }
      
      const command = new ScanCommand(params);
      const response = await client.send(command);
      
      if (response.Items) {
        allVendors.push(...response.Items);
      }
      
      lastKey = response.LastEvaluatedKey;
    } while (lastKey);
    
    console.log(`   ✅ Found ${allVendors.length} vendors from users table\n`);
    
    // Step 2: Get vendors from bulk_message_notifications table
    console.log('📋 Step 2: Getting vendors from bulk_message_notifications table...');
    let bulkVendors = [];
    lastKey = null;
    
    do {
      const params = {
        TableName: 'bulk_message_notifications',
      };
      
      if (lastKey) {
        params.ExclusiveStartKey = lastKey;
      }
      
      const command = new ScanCommand(params);
      const response = await client.send(command);
      
      if (response.Items) {
        bulkVendors.push(...response.Items);
      }
      
      lastKey = response.LastEvaluatedKey;
    } while (lastKey);
    
    console.log(`   ✅ Found ${bulkVendors.length} entries in bulk_message_notifications table\n`);
    
    // Step 3: Combine and deduplicate vendors
    console.log('📋 Step 3: Combining and deduplicating vendors...');
    const vendorMap = new Map(); // phone_number -> vendor data
    
    // Add vendors from users table
    for (const vendor of allVendors) {
      const phone = extractPhoneNumber(vendor.mob_num);
      if (phone) {
        let shop = null;
        try {
          shop = await Shop.findByUserId(vendor.id);
        } catch (e) {
          // Shop not found, continue
        }
        
        const location = shop?.address || shop?.street || vendor.address || 'your area';
        vendorMap.set(phone, {
          phone_number: phone,
          name: vendor.name || 'Trader',
          location: location,
          source: 'users_table',
          user_id: vendor.id,
          user_type: vendor.user_type
        });
      }
    }
    
    // Add vendors from bulk_message_notifications (prefer existing if phone exists)
    for (const bulk of bulkVendors) {
      const phone = extractPhoneNumber(bulk.phone_number);
      if (phone && !vendorMap.has(phone)) {
        const businessData = bulk.business_data || {};
        vendorMap.set(phone, {
          phone_number: phone,
          name: businessData.title || businessData.user_name || 'Trader',
          location: businessData.street || businessData.address || 'your area',
          source: 'bulk_message_notifications',
          business_data: businessData
        });
      }
    }
    
    let vendors = Array.from(vendorMap.values());
    
    // Test mode: Only send to test phone number
    if (isTestMode) {
      const testPhone = extractPhoneNumber(TEST_MOBILE);
      if (testPhone) {
        // Find test vendor or create one
        const testVendor = vendors.find(v => v.phone_number === testPhone);
        if (testVendor) {
          vendors = [testVendor];
          console.log(`   🧪 TEST MODE: Using existing vendor with phone ${testPhone}`);
        } else {
          // Create a test vendor entry
          vendors = [{
            phone_number: testPhone,
            name: 'Test Vendor',
            location: 'Test Location',
            source: 'test_mode'
          }];
          console.log(`   🧪 TEST MODE: Created test vendor entry for phone ${testPhone}`);
        }
      } else {
        console.error(`   ❌ Invalid test phone number: ${TEST_MOBILE}`);
        return;
      }
    }
    
    console.log(`   ✅ Total unique vendors: ${vendors.length}`);
    if (!isTestMode) {
      console.log(`      From users table: ${allVendors.length}`);
      console.log(`      From bulk_message_notifications: ${bulkVendors.length}`);
      console.log(`      Unique phone numbers: ${vendors.length}`);
    }
    console.log('');
    
    if (vendors.length === 0) {
      console.log('❌ No vendors found to send SMS to.');
      return;
    }
    
    const language = 'en';
    
    if (isDryRun) {
      console.log('🔍 DRY RUN MODE: No SMS will be sent.');
      console.log(`   Would send SMS to ${vendors.length} vendors.\n`);
      console.log('   Sample vendors (first 5):');
      vendors.slice(0, 5).forEach((vendor, index) => {
        const message = buildMessage(vendor.name, vendor.location);
        console.log(`   ${index + 1}. ${vendor.name} (${vendor.phone_number})`);
        console.log(`      Location: ${vendor.location}`);
        console.log(`      Message (${message.length} chars): ${message}\n`);
      });
      console.log('✅ Dry run completed. Remove --dry-run flag to send actual SMS.');
      return;
    }
    
    // Step 4: Send SMS
    console.log('📤 Step 4: Sending SMS...\n');
    let successCount = 0;
    let failCount = 0;
    
    for (let i = 0; i < vendors.length; i++) {
      const vendor = vendors[i];
      const message = buildMessage(vendor.name, vendor.location);
      
      console.log(`[${i + 1}/${vendors.length}] ${vendor.name} (${vendor.phone_number})`);
      console.log(`   Location: ${vendor.location}`);
      console.log(`   Message (${message.length} chars): ${message}`);
      
      // Validate message length
      if (message.length !== SMS_CONFIG.maxMessageLength) {
        console.warn(`   ⚠️  WARNING: Message length is ${message.length}, expected ${SMS_CONFIG.maxMessageLength}`);
      }
      
      try {
        const smsResult = await sendSMS(vendor.phone_number, message);
        
        if (smsResult.success) {
          console.log(`   ✅ SMS sent successfully`);
          successCount++;
          
          // Save to bulk_message_notifications
          try {
            await BulkMessageNotification.save({
              phone_number: vendor.phone_number,
              business_data: {
                name: vendor.name,
                location: vendor.location,
                source: vendor.source,
                user_id: vendor.user_id || null,
                user_type: vendor.user_type || null
              },
              message: message,
              status: 'sent',
              language: language
            });
          } catch (saveErr) {
            console.error(`   ⚠️  Error saving to database: ${saveErr.message}`);
          }
        } else {
          console.log(`   ❌ SMS failed: ${smsResult.response || smsResult.error}`);
          failCount++;
          
          // Save failed attempt
          try {
            await BulkMessageNotification.save({
              phone_number: vendor.phone_number,
              business_data: {
                name: vendor.name,
                location: vendor.location,
                source: vendor.source
              },
              message: message,
              status: 'failed',
              language: language
            });
          } catch (saveErr) {
            // Ignore save errors for failed sends
          }
        }
      } catch (error) {
        console.error(`   ❌ Error: ${error.message || error.error}`);
        failCount++;
      }
      
      // Delay between SMS
      if (i < vendors.length - 1) {
        await new Promise(resolve => setTimeout(resolve, SMS_CONFIG.delayBetweenSms));
      }
    }
    
    // Summary
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📊 SUMMARY');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`Total vendors found: ${vendors.length}`);
    console.log(`Processed: ${vendors.length}`);
    console.log(`✅ Success: ${successCount}`);
    console.log(`❌ Failed: ${failCount}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run the script
sendB2CSMSToVendors()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Script failed:', error);
    process.exit(1);
  });
