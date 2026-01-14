require('dotenv').config();
const SmsService = require('../utils/smsService');

/**
 * Test script to send OTP SMS to a phone number
 * Usage: node scripts/test-otp-sms.js [phone_number] [otp] [user_name]
 * Example: node scripts/test-otp-sms.js 9074135121 123456 "Test User"
 */

async function testOtpSms() {
  const args = process.argv.slice(2);
  const phoneNumber = args[0] || '9074135121';
  const otp = args[1] || '123456';
  const userName = args[2] || 'Test User';

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🧪 Testing OTP SMS via bulksmsind.in API');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  console.log(`📱 Phone Number: ${phoneNumber}`);
  console.log(`🔢 OTP: ${otp}`);
  console.log(`👤 User Name: ${userName}\n`);

  try {
    console.log('📤 Sending OTP SMS...\n');
    const result = await SmsService.sendOtp(phoneNumber, otp, userName);
    
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('✅ OTP SMS Test Result');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    console.log('Response:', JSON.stringify(result, null, 2));
    console.log('\n✅ Test completed successfully!');
    
  } catch (error) {
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('❌ OTP SMS Test Failed');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    console.error('Error:', error.message);
    console.error('Stack:', error.stack);
    process.exit(1);
  }
}

testOtpSms();


