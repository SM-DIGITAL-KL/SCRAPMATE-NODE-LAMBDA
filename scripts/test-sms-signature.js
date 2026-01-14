#!/usr/bin/env node

/**
 * Test script to debug SMS signature generation
 * This will help verify if the credentials and signature are correct
 */

require('dotenv').config();
const crypto = require('crypto');

// Test credentials
const accessToken = '9KOTMY69K6EW8G7';
const accessTokenKey = '*UaJ-DndNk5g8z[fhrwFOcXv|SI;2b^';
const entityId = '1701173389563945545'; // May need to be different for new credentials

function smsSignatureApi4(expire, accessToken, accessTokenKey) {
  const requestFor = 'send-sms';
  
  console.log('\n🔐 Signature Generation Steps:');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`   Step 1: requestFor = "${requestFor}"`);
  console.log(`   Step 2: expire = ${expire}`);
  console.log(`   Step 3: timeKey = md5("${requestFor}sms@rits-v1.0${expire}")`);
  
  const timeKey = crypto.createHash('md5').update(`${requestFor}sms@rits-v1.0${expire}`).digest('hex');
  console.log(`          = ${timeKey}`);
  
  console.log(`   Step 4: timeAccessTokenKey = md5("${accessToken}" + "${timeKey}")`);
  const timeAccessTokenKey = crypto.createHash('md5').update(`${accessToken}${timeKey}`).digest('hex');
  console.log(`          = ${timeAccessTokenKey}`);
  
  console.log(`   Step 5: signature = md5("${timeAccessTokenKey}" + "${accessTokenKey}")`);
  const signature = crypto.createHash('md5').update(`${timeAccessTokenKey}${accessTokenKey}`).digest('hex');
  console.log(`          = ${signature}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  
  return signature;
}

console.log('🧪 SMS Signature Test');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
console.log('📋 Configuration:');
console.log(`   Access Token: ${accessToken}`);
console.log(`   Access Token Key: ${accessTokenKey.substring(0, 10)}...${accessTokenKey.substring(accessTokenKey.length - 5)}`);
console.log(`   Entity ID: ${entityId}`);

const expire = Math.floor(Date.now() / 1000) + 60;
console.log(`   Expire (Unix timestamp): ${expire}`);
console.log(`   Expire (Human readable): ${new Date(expire * 1000).toISOString()}`);

const signature = smsSignatureApi4(expire, accessToken, accessTokenKey);

console.log('📤 Request Parameters:');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log(`   accessToken: ${accessToken}`);
console.log(`   expire: ${expire}`);
console.log(`   authSignature: ${signature}`);
console.log(`   entityId: ${entityId}`);
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

console.log('⚠️  If you\'re still getting "Signature Mismatch" errors:');
console.log('   1. Verify the Access Token and Access Token Key are correct');
console.log('   2. Check if the Entity ID needs to be different for these credentials');
console.log('   3. Ensure there are no extra spaces or special characters in the credentials');
console.log('   4. Contact the SMS provider to verify the credentials are active\n');

