#!/usr/bin/env node

/**
 * Check wallet balance using 4SMS API
 * This uses the same credentials but different signature method for wallet operations
 */

require('dotenv').config();
const crypto = require('crypto');
const axios = require('axios');

// Credentials
const accessToken = '9KOTMY69K6EW8G7';
const accessTokenKey = '*UaJ-DndNk5g8z[fhrwFOcXv|SI;2b^';

// Base URL for 4SMS API
const baseUrl = 'http://4sms.alp-ts.com/api/sms/v1.0';

/**
 * Generate signature for wallet operations
 * PHP code:
 * $timeKey = md5($requestFor."account@rits-v1.0".$expire);
 * $timeAccessTokenKey = md5($accessToken.$timeKey);
 * $signature = md5($timeAccessTokenKey.$accessTokenKey);
 */
function generateWalletSignature(expire, accessToken, accessTokenKey, requestFor = 'get-wallet-balance') {
  // Step 1: md5($requestFor."account@rits-v1.0".$expire)
  const timeKey = crypto.createHash('md5')
    .update(`${requestFor}account@rits-v1.0${expire}`)
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

async function checkWalletBalance() {
  console.log('💰 Checking Wallet Balance');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  
  // Generate expire timestamp (Unix Epoch Time, +1 minute from now)
  const expire = Math.floor(Date.now() / 1000) + 60;
  const requestFor = 'get-wallet-balance';
  
  console.log('📋 Configuration:');
  console.log(`   Access Token: ${accessToken}`);
  console.log(`   Access Token Key: ${accessTokenKey.substring(0, 10)}...${accessTokenKey.substring(accessTokenKey.length - 5)}`);
  console.log(`   Request For: ${requestFor}`);
  console.log(`   Expire (Unix timestamp): ${expire}`);
  console.log(`   Expire (Human readable): ${new Date(expire * 1000).toISOString()}\n`);
  
  // Generate signature using wallet method
  const { timeKey, timeAccessTokenKey, signature } = generateWalletSignature(expire, accessToken, accessTokenKey, requestFor);
  
  console.log('🔐 Signature Generation (Wallet Method):');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`   Step 1: timeKey = md5("${requestFor}account@rits-v1.0${expire}")`);
  console.log(`          = ${timeKey}`);
  console.log(`   Step 2: timeAccessTokenKey = md5("${accessToken}" + "${timeKey}")`);
  console.log(`          = ${timeAccessTokenKey}`);
  console.log(`   Step 3: signature = md5("${timeAccessTokenKey}" + "${accessTokenKey.substring(0, 10)}...")`);
  console.log(`          = ${signature}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  
  // Build URL with query parameters (GET request)
  const params = new URLSearchParams({
    accessToken: accessToken,
    expire: expire.toString(),
    authSignature: signature,
  });
  
  const url = `${baseUrl}/${requestFor}?${params.toString()}`;
  
  console.log('📤 Sending Wallet Balance Request:');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`   URL: ${url}`);
  console.log(`   Method: GET`);
  console.log(`   Parameters:`);
  console.log(`     accessToken: ${accessToken}`);
  console.log(`     expire: ${expire}`);
  console.log(`     authSignature: ${signature}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  
  try {
    const response = await axios.get(url, {
      timeout: 10000,
    });
    
    console.log('✅ Wallet Balance Retrieved Successfully!');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`   Status: ${response.status}`);
    console.log(`   Response:`, JSON.stringify(response.data, null, 2));
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    
    // Extract balance if available
    if (response.data && response.data.data) {
      const balance = response.data.data.balance || response.data.data.walletBalance || response.data.data;
      console.log(`💰 Current Wallet Balance: ${balance}`);
      console.log('');
    }
    
    return response.data;
    
  } catch (error) {
    console.error('❌ Wallet Balance Check Failed!');
    console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.error(`   Error: ${error.message}`);
    
    if (error.response) {
      console.error(`   HTTP Status: ${error.response.status}`);
      console.error(`   Response:`, JSON.stringify(error.response.data, null, 2));
      
      if (error.response.status === 401) {
        console.error('\n⚠️  Authorization Failed!');
        console.error('   The credentials (Access Token or Access Token Key) are incorrect.');
        console.error('   Please verify:');
        console.error(`   - Access Token: "${accessToken}"`);
        console.error(`   - Access Token Key: "${accessTokenKey}"`);
        console.error('\n   If wallet check fails, the SMS sending will also fail with the same credentials.\n');
      } else if (error.response.status === 402) {
        console.error('\n⚠️  Insufficient Balance!');
        console.error('   The wallet has insufficient balance. Please recharge your wallet.\n');
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

checkWalletBalance().catch(error => {
  console.error('❌ Script failed:', error);
  process.exit(1);
});

