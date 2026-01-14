#!/usr/bin/env node

/**
 * Test SMS credentials and signature generation
 * This script tests the exact PHP method provided by the user
 */

require('dotenv').config();
const crypto = require('crypto');
const axios = require('axios');

// New credentials provided by user
const accessToken = '9KOTMY69K6EW8G7';
const accessTokenKey = '*UaJ-DndNk5g8z[fhrwFOcXv|SI;2b^';
const entityId = '1701173389563945545'; // May need to be different

// SMS API configuration
const smsApiUrl = 'http://4sms.alp-ts.com/api/sms/v1.0/send-sms';
const smsHeader = 'SCRPMT';
const templateId = '1707173856462706835';

/**
 * Generate signature using the exact PHP method provided
 * PHP code:
 * $timeKey = md5($requestFor."sms@rits-v1.0".$expire);
 * $timeAccessTokenKey = md5($accessToken.$timeKey);
 * $signature = md5($timeAccessTokenKey.$accessTokenKey);
 */
function generateSignature(expire, accessToken, accessTokenKey) {
  const requestFor = 'send-sms';
  
  // Step 1: md5($requestFor."sms@rits-v1.0".$expire)
  const timeKey = crypto.createHash('md5')
    .update(`${requestFor}sms@rits-v1.0${expire}`)
    .digest('hex');
  
  // Step 2: md5($accessToken.$timeKey)
  const timeAccessTokenKey = crypto.createHash('md5')
    .update(`${accessToken}${timeKey}`)
    .digest('hex');
  
  // Step 3: md5($timeAccessTokenKey.$accessTokenKey)
  const signature = crypto.createHash('md5')
    .update(`${timeAccessTokenKey}${accessTokenKey}`)
    .digest('hex');
  
  return { timeKey, timeAccessTokenKey, signature };
}

async function testSMS() {
  console.log('🧪 Testing SMS API with New Credentials');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  
  // Generate expire timestamp (Unix Epoch Time, +1 minute from now)
  const expire = Math.floor(Date.now() / 1000) + 60;
  
  console.log('📋 Configuration:');
  console.log(`   Access Token: ${accessToken}`);
  console.log(`   Access Token Key: ${accessTokenKey.substring(0, 10)}...${accessTokenKey.substring(accessTokenKey.length - 5)}`);
  console.log(`   Entity ID: ${entityId}`);
  console.log(`   Expire (Unix timestamp): ${expire}`);
  console.log(`   Expire (Human readable): ${new Date(expire * 1000).toISOString()}\n`);
  
  // Generate signature using exact PHP method
  const { timeKey, timeAccessTokenKey, signature } = generateSignature(expire, accessToken, accessTokenKey);
  
  console.log('🔐 Signature Generation (PHP Method):');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`   Step 1: timeKey = md5("send-smssms@rits-v1.0${expire}")`);
  console.log(`          = ${timeKey}`);
  console.log(`   Step 2: timeAccessTokenKey = md5("${accessToken}" + "${timeKey}")`);
  console.log(`          = ${timeAccessTokenKey}`);
  console.log(`   Step 3: signature = md5("${timeAccessTokenKey}" + "${accessTokenKey.substring(0, 10)}...")`);
  console.log(`          = ${signature}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  
  // Test phone number
  const testPhone = '9074135121';
  const testMessage = 'Test message from new credentials';
  
  const params = new URLSearchParams({
    accessToken: accessToken,
    expire: expire.toString(),
    authSignature: signature,
    route: 'transactional',
    smsHeader: smsHeader,
    messageContent: testMessage,
    recipients: testPhone,
    entityId: entityId,
    templateId: templateId,
  });
  
  console.log('📤 Sending SMS Request:');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`   URL: ${smsApiUrl}`);
  console.log(`   Method: POST`);
  console.log(`   Content-Type: application/x-www-form-urlencoded`);
  console.log(`   Parameters:`);
  console.log(`     accessToken: ${accessToken}`);
  console.log(`     expire: ${expire}`);
  console.log(`     authSignature: ${signature}`);
  console.log(`     route: transactional`);
  console.log(`     smsHeader: ${smsHeader}`);
  console.log(`     recipients: ${testPhone}`);
  console.log(`     entityId: ${entityId}`);
  console.log(`     templateId: ${templateId}`);
  console.log(`     messageContent: ${testMessage}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  
  try {
    const response = await axios.post(smsApiUrl, params.toString(), {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      timeout: 10000,
    });
    
    console.log('✅ SMS Sent Successfully!');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`   Status: ${response.status}`);
    console.log(`   Response:`, JSON.stringify(response.data, null, 2));
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    
  } catch (error) {
    console.error('❌ SMS Sending Failed!');
    console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.error(`   Error: ${error.message}`);
    
    if (error.response) {
      console.error(`   HTTP Status: ${error.response.status}`);
      console.error(`   Response:`, JSON.stringify(error.response.data, null, 2));
      
      if (error.response.status === 401) {
        console.error('\n⚠️  Signature Mismatch Error!');
        console.error('   Possible causes:');
        console.error('   1. Access Token is incorrect');
        console.error('   2. Access Token Key is incorrect');
        console.error('   3. Entity ID does not match these credentials');
        console.error('   4. There may be extra spaces or special characters in credentials');
        console.error('\n   Please verify:');
        console.error(`   - Access Token: "${accessToken}"`);
        console.error(`   - Access Token Key: "${accessTokenKey}"`);
        console.error(`   - Entity ID: "${entityId}"`);
        console.error('\n   The signature algorithm is correct (matches PHP method).');
        console.error('   The issue is likely with the credentials or entity ID.\n');
      }
    } else if (error.request) {
      console.error(`   No response received. Request URL: ${error.config?.url}`);
    } else {
      console.error(`   Error details: ${error.message}`);
    }
    console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    
    process.exit(1);
  }
}

testSMS().catch(error => {
  console.error('❌ Test failed:', error);
  process.exit(1);
});

