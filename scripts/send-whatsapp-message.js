/**
 * Send WhatsApp Message Script
 * Sends a WhatsApp message using a template ID
 * 
 * Usage:
 *   node scripts/send-whatsapp-message.js [phone_number]
 * 
 * Example:
 *   node scripts/send-whatsapp-message.js 9074135121
 */

require('dotenv').config();
const SmsService = require('../utils/smsService');

// Set SMS API credentials if not already set (from serverless.yml defaults)
process.env['4SMS_API_URL_NEW'] = process.env['4SMS_API_URL_NEW'] || process.env.SMS_API_URL_NEW || 'http://4sms.alp-ts.com/api/sms/v1.0/send-sms';
process.env.SMS_API_URL_NEW = process.env.SMS_API_URL_NEW || process.env['4SMS_API_URL_NEW'] || 'http://4sms.alp-ts.com/api/sms/v1.0/send-sms';
process.env['4SMS_API_ENITYID'] = process.env['4SMS_API_ENITYID'] || process.env.SMS_API_ENITYID || '1701173389563945545';
process.env.SMS_API_ENITYID = process.env.SMS_API_ENITYID || process.env['4SMS_API_ENITYID'] || '1701173389563945545';
process.env['4SMS_API_TOKEN'] = process.env['4SMS_API_TOKEN'] || process.env.SMS_API_TOKEN || 'EVLZ8267TMY1O2Z';
process.env.SMS_API_TOKEN = process.env.SMS_API_TOKEN || process.env['4SMS_API_TOKEN'] || 'EVLZ8267TMY1O2Z';
process.env['4SMS_API_KEY'] = process.env['4SMS_API_KEY'] || process.env.SMS_API_KEY || '/BR2+k;L(-aPKA@r%5SO*GzcCm8&Hg6o';
process.env.SMS_API_KEY = process.env.SMS_API_KEY || process.env['4SMS_API_KEY'] || '/BR2+k;L(-aPKA@r%5SO*GzcCm8&Hg6o';
process.env.SMS_HEADER_CENTER_ID = process.env.SMS_HEADER_CENTER_ID || 'SCRPMT';

// Configuration
const TEMPLATE_ID = '1707176769703006561';
const MESSAGE = 'SCRAPMATE Partner App is now live. Join as B2B or B2C to receive customer orders. Download: play.google.com/store/apps/details?id=com.app.scrapmatepartner';
const DEFAULT_PHONE_NUMBER = '9074135121';

// Get phone number from command line argument or use default
const phoneNumber = process.argv[2] || DEFAULT_PHONE_NUMBER;

async function sendWhatsAppMessage() {
  console.log('\n📱 WhatsApp Message Sender');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`📞 Phone Number: ${phoneNumber}`);
  console.log(`🆔 Template ID: ${TEMPLATE_ID}`);
  console.log(`💬 Message: ${MESSAGE}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  try {
    console.log('📤 Sending WhatsApp message...');
    const response = await SmsService.singlePushSMS2(phoneNumber, TEMPLATE_ID, MESSAGE);
    
    console.log('\n✅ WhatsApp message sent successfully!');
    console.log('📥 Response:', JSON.stringify(response, null, 2));
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Error sending WhatsApp message:');
    console.error('   Error:', error.message);
    if (error.response) {
      console.error('   HTTP Status:', error.response.status);
      console.error('   Response Data:', JSON.stringify(error.response.data, null, 2));
    }
    process.exit(1);
  }
}

// Run the script
sendWhatsAppMessage();

