/**
 * Test SMS to 9074135121 using the same configuration as order placement
 */

require('dotenv').config();
const http = require('http');
const querystring = require('querystring');

const TEST_PHONE = '9074135121';

// Use the same SMS_CONFIG as in v2OrderController.js
const SMS_CONFIG = {
  username: 'scrapmate',
  sendername: 'SCRPMT',
  smstype: 'TRANS',
  apikey: '1bf0131f-d1f2-49ed-9c57-19f1b4400f32',
  peid: '1701173389563945545',
  templateid: '1707176812500484578' // Template ID for pickup request SMS
};

// Test message matching the template format
const testMessage = 'Scrapmate pickup request 106881300 of Books. Payable amount Rs22. Open B2C dashboard to accept.';

console.log('\n📱 Testing SMS to', TEST_PHONE);
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

console.log('📋 SMS Configuration:');
console.log('   Username:', SMS_CONFIG.username);
console.log('   Sender Name:', SMS_CONFIG.sendername);
console.log('   SMS Type:', SMS_CONFIG.smstype);
console.log('   API Key:', SMS_CONFIG.apikey.substring(0, 20) + '...');
console.log('   PEID (Entity ID):', SMS_CONFIG.peid);
console.log('   Template ID:', SMS_CONFIG.templateid);
console.log('');

console.log('📝 Message:');
console.log('   ', testMessage);
console.log('');

// Helper function to send SMS (same as in v2OrderController.js)
const sendSMS = (phoneNumber, message) => {
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
      timeout: 30000, // 30 second timeout
    };
    
    console.log('🌐 SMS API Request:');
    console.log('   URL:', `https://${options.hostname}${options.path.replace(/\?.*/, '')}`);
    console.log('   Method:', options.method);
    console.log('   Parameters:', {
      username: SMS_CONFIG.username,
      sendername: SMS_CONFIG.sendername,
      smstype: SMS_CONFIG.smstype,
      numbers: phoneNumber,
      apikey: SMS_CONFIG.apikey.substring(0, 20) + '...',
      peid: SMS_CONFIG.peid,
      templateid: SMS_CONFIG.templateid,
      message: message.substring(0, 50) + '...'
    });
    console.log('');
    
    const req = http.request(options, (res) => {
      let data = '';
      
      console.log('📡 Response Status:', res.statusCode);
      console.log('   Headers:', JSON.stringify(res.headers, null, 2));
      
      res.on('data', (chunk) => { 
        data += chunk; 
      });
      
      res.on('end', () => {
        try {
          const response = JSON.parse(data);
          console.log('✅ Response received:');
          console.log(JSON.stringify(response, null, 2));
          resolve(response);
        } catch (e) {
          console.warn('⚠️  Failed to parse response as JSON');
          console.log('   Raw data:', data);
          resolve({ raw: data, parseError: e.message });
        }
      });
      
      res.on('error', (error) => {
        console.error('❌ Response error:', error);
        reject(error);
      });
    });
    
    req.on('error', (error) => {
      console.error('❌ Request error:', error);
      reject(error);
    });
    
    req.on('timeout', () => {
      console.error('❌ Request timeout after 30 seconds');
      req.destroy();
      reject(new Error('SMS request timeout'));
    });
    
    req.setTimeout(30000); // Set timeout
    req.end();
  });
};

// Send test SMS
(async () => {
  try {
    console.log('📤 Sending SMS...\n');
    const result = await sendSMS(TEST_PHONE, testMessage);
    
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    // Check if SMS was successful
    let isSuccess = false;
    if (Array.isArray(result) && result.length > 0) {
      isSuccess = result[0].status === 'success';
      if (isSuccess) {
        console.log('✅ SMS sent successfully!');
        console.log('   Message ID:', result[0].msgid || 'N/A');
        console.log('   Status:', result[0].status);
        console.log('   Message:', result[0].msg || 'N/A');
      } else {
        console.log('❌ SMS failed');
        console.log('   Status:', result[0].status);
        console.log('   Message:', result[0].msg || 'N/A');
      }
    } else if (result && typeof result === 'object') {
      isSuccess = result.status === 'success' || result.success === true;
      if (isSuccess) {
        console.log('✅ SMS sent successfully!');
        console.log('   Response:', JSON.stringify(result, null, 2));
      } else {
        console.log('❌ SMS may have failed');
        console.log('   Response:', JSON.stringify(result, null, 2));
      }
    } else {
      console.log('⚠️  Unexpected response format');
      console.log('   Response:', JSON.stringify(result, null, 2));
    }
    
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    
    if (isSuccess) {
      console.log('💡 Next steps:');
      console.log('   1. Check phone 9074135121 for the SMS');
      console.log('   2. Verify the message content matches the template');
      console.log('   3. If not received, check SMS provider dashboard for delivery status');
    } else {
      console.log('💡 Troubleshooting:');
      console.log('   1. Check SMS provider dashboard for error details');
      console.log('   2. Verify template ID and entity ID are correct');
      console.log('   3. Check if phone number is valid and active');
      console.log('   4. Verify API key and credentials are correct');
    }
    console.log('');
    
  } catch (error) {
    console.error('\n❌ Error sending SMS:');
    console.error('   Error name:', error.name);
    console.error('   Error message:', error.message);
    console.error('   Error stack:', error.stack);
    console.log('');
  }
})();
