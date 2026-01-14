/**
 * Test script to send SMS pickup request message to a phone number
 * Usage: node scripts/test-sms-pickup-request.js [phone_number]
 * Example: node scripts/test-sms-pickup-request.js 9074135121
 */

require('dotenv').config();
const http = require('http');
const querystring = require('querystring');

const phoneNumber = process.argv[2] || '9074135121';

// SMS Configuration
const SMS_CONFIG = {
  username: 'scrapmate',
  sendername: 'SCRPMT',
  smstype: 'TRANS',
  apikey: '1bf0131f-d1f2-49ed-9c57-19f1b4400f32',
  peid: '1701173389563945545',
  templateid: '1707176812500484578' // Template ID for pickup request SMS
};

// Test message - same format as pickup request
const orderNumber = 'ORD12345';
const materialName = 'Books scrap';
const payableAmount = 1200;
const firstVar = `${orderNumber} of ${materialName}`;
const secondVar = `${payableAmount}`;
const smsMessage = `Scrapmate pickup request ${firstVar}. Payable amount Rs${secondVar}. Open B2C dashboard to accept.`;

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('🧪 Testing SMS Pickup Request Message');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log(`Phone Number: ${phoneNumber}`);
console.log(`Message: ${smsMessage}`);
console.log(`Message Length: ${smsMessage.length} characters`);
console.log('');

// Helper function to extract phone number
function extractPhoneNumber(phone) {
  if (!phone) return null;
  let cleaned = phone.replace(/\s+/g, '').replace(/[^\d+]/g, '');
  if (cleaned.startsWith('+91')) {
    cleaned = cleaned.substring(3);
  } else if (cleaned.startsWith('91') && cleaned.length === 12) {
    cleaned = cleaned.substring(2);
  }
  if (cleaned.length === 10 && /^[6-9]\d{9}$/.test(cleaned)) {
    return cleaned;
  }
  return null;
}

// Helper function to send SMS
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
    };
    
    console.log(`📤 Sending SMS to ${phoneNumber}...`);
    console.log(`   URL: https://${options.hostname}${options.path}`);
    console.log('');
    
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const response = JSON.parse(data);
          resolve(response);
        } catch (e) {
          resolve({ raw: data });
        }
      });
    });
    
    req.on('error', (error) => reject(error));
    req.end();
  });
}

// Main function
async function testSMS() {
  try {
    const extractedPhone = extractPhoneNumber(phoneNumber);
    
    if (!extractedPhone) {
      console.error(`❌ Invalid phone number: ${phoneNumber}`);
      console.error(`   Phone number must be a valid 10-digit Indian mobile number`);
      process.exit(1);
    }
    
    console.log(`✅ Extracted phone number: ${extractedPhone}`);
    console.log('');
    
    // Send SMS
    const smsResult = await sendSMS(extractedPhone, smsMessage);
    
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📱 SMS API Response:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(JSON.stringify(smsResult, null, 2));
    console.log('');
    
    // Check if SMS was successful
    const isSuccess = smsResult && (smsResult.status === 'success' || smsResult.success || smsResult.messageId);
    
    if (isSuccess) {
      console.log('✅ SMS sent successfully!');
      console.log(`   Phone: ${extractedPhone}`);
      console.log(`   Message: ${smsMessage}`);
    } else {
      console.error('❌ SMS sending may have failed');
      console.error(`   Response:`, smsResult);
    }
    
    console.log('');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
  } catch (error) {
    console.error('❌ Error:', error);
    console.error('   Message:', error.message);
    console.error('   Stack:', error.stack);
    process.exit(1);
  }
}

// Run the test
testSMS();

