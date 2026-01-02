/**
 * Test script to send OTP via SMS
 * Usage: node scripts/test-sms-otp.js [phone_number] [otp]
 * Example: node scripts/test-sms-otp.js 9074135121 123456
 */

require('dotenv').config();
const SmsService = require('../utils/smsService');

const phoneNumber = process.argv[2] || '9074135121';
const otp = process.argv[3] || Math.floor(100000 + Math.random() * 900000).toString();

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('🧪 Testing SMS OTP Sending');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log(`📱 Phone Number: ${phoneNumber}`);
console.log(`🔑 OTP: ${otp}`);
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('');

// Check environment variables
console.log('🔍 Checking environment variables...');
const requiredVars = [
  'SMS_API_URL_NEW',
  'SMS_API_ENITYID',
  'SMS_API_TOKEN',
  'SMS_API_KEY',
  'SMS_HEADER_CENTER_ID'
];

const missingVars = [];
requiredVars.forEach(varName => {
  const value = process.env[varName] || process.env[`4${varName}`];
  if (value) {
    console.log(`   ✅ ${varName}: ${varName.includes('KEY') || varName.includes('TOKEN') ? 'SET (hidden)' : value}`);
  } else {
    console.log(`   ❌ ${varName}: NOT SET`);
    missingVars.push(varName);
  }
});

if (missingVars.length > 0) {
  console.log('');
  console.error('❌ Missing required environment variables:', missingVars.join(', '));
  console.error('   Please set these in your .env file or environment');
  process.exit(1);
}

console.log('');
console.log('📤 Sending OTP via SMS...');
console.log('');

SmsService.sendOtp(phoneNumber, otp)
  .then(response => {
    console.log('');
    console.log('✅ SMS sent successfully!');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('Response:', response);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    process.exit(0);
  })
  .catch(error => {
    console.log('');
    console.error('❌ Failed to send SMS');
    console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.error('Error:', error.message);
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Response Data:', JSON.stringify(error.response.data, null, 2));
    }
    console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    process.exit(1);
  });
