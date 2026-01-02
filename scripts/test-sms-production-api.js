/**
 * Test SMS via Production API
 * Tests SMS sending by calling the login endpoint which sends OTP
 * Usage: node scripts/test-sms-production-api.js [phone_number] [production_url]
 * Example: node scripts/test-sms-production-api.js 9074135121 https://gpn6vt3mlkm6zq7ibxdtu6bphi0onexr.lambda-url.ap-south-1.on.aws/api
 */

const axios = require('axios');

const phoneNumber = process.argv[2] || '9074135121';
const productionUrl = process.argv[3] || 'https://gpn6vt3mlkm6zq7ibxdtu6bphi0onexr.lambda-url.ap-south-1.on.aws/api';
const API_KEY = 'zyubkfzeumeoviaqzcsrvfwdzbiwnlnn';

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('🧪 Testing SMS via Production API');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log(`📱 Phone Number: ${phoneNumber}`);
console.log(`🌐 Production URL: ${productionUrl}`);
console.log(`🔗 Endpoint: ${productionUrl}/v2/auth/login`);
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('');

async function testSMS() {
  try {
    console.log('📤 Calling login endpoint to trigger SMS...');
    console.log('');

    const response = await axios.post(
      `${productionUrl}/v2/auth/login`,
      {
        phoneNumber: phoneNumber,
        appType: 'vendor_app'
      },
      {
        headers: {
          'api-key': API_KEY,
          'Content-Type': 'application/json'
        },
        timeout: 30000 // 30 second timeout
      }
    );

    console.log('✅ API Response Received!');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('Status:', response.status);
    console.log('Response Data:', JSON.stringify(response.data, null, 2));
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('');

    if (response.data.status === 'success') {
      console.log('🎉 SUCCESS: SMS OTP request sent successfully!');
      if (response.data.data?.otp) {
        console.log(`   📱 OTP: ${response.data.data.otp}`);
      }
      if (response.data.data?.isNewUser !== undefined) {
        console.log(`   👤 Is New User: ${response.data.data.isNewUser}`);
      }
    } else {
      console.log('⚠️  Response indicates an issue:');
      console.log(`   Message: ${response.data.msg || response.data.message}`);
    }

  } catch (error) {
    console.error('❌ Error occurred:');
    console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Status Text:', error.response.statusText);
      console.error('Response Data:', JSON.stringify(error.response.data, null, 2));
    } else if (error.request) {
      console.error('No response received from server');
      console.error('Request URL:', error.config?.url);
      console.error('Error:', error.message);
    } else {
      console.error('Error:', error.message);
    }
    console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    process.exit(1);
  }
}

testSMS()
  .then(() => {
    console.log('');
    console.log('✅ Test completed!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Test failed:', error.message);
    process.exit(1);
  });

