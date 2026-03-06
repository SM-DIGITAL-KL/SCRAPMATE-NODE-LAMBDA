/**
 * Script to check actual API subscription data for a user
 * This fetches the profile data exactly as the DashboardScreen.tsx sees it
 * 
 * Run with: node scripts/check-api-subscription-data.js <user_id_or_mobile>
 * Example: node scripts/check-api-subscription-data.js 8056744395
 *          node scripts/check-api-subscription-data.js 12345
 */

require('dotenv').config();
const https = require('https');
const User = require('../models/User');
const Shop = require('../models/Shop');

// API Configuration
const API_BASE_URL = process.env.API_BASE_URL || 'gpn6vt3mlkm6zq7ibxdtu6bphi0onexr.lambda-url.ap-south-1.on.aws';
const API_KEY = process.env.API_KEY || 'zyubkfzeumeoviaqzcsrvfwdzbiwnlnn';

// Colors for console output
const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const BLUE = '\x1b[34m';
const CYAN = '\x1b[36m';
const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';

async function findUserByMobile(mobile) {
  const allUsers = await User.getAll();
  return allUsers.find(u => 
    String(u.mob_num) === mobile || 
    u.phone === mobile ||
    u.mobile === mobile
  );
}

function makeApiRequest(path) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: API_BASE_URL,
      port: 443,
      path: path,
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'api-key': API_KEY,
        'x-app-type': 'vendor_app'
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          resolve({ error: 'Invalid JSON', raw: data });
        }
      });
    });

    req.on('error', reject);
    req.end();
  });
}

async function main() {
  const input = process.argv[2];
  
  if (!input) {
    console.log('\nUsage: node check-api-subscription-data.js <user_id_or_mobile>');
    console.log('Example: node check-api-subscription-data.js 8056744395');
    console.log('         node check-api-subscription-data.js 12345\n');
    process.exit(1);
  }

  console.log('\n' + '='.repeat(80));
  console.log(`${BOLD}  CHECKING API SUBSCRIPTION DATA${RESET}`);
  console.log('='.repeat(80) + '\n');

  let userId = input;
  let user = null;

  // Check if input is a mobile number or user ID
  if (input.length >= 10 && /\d{10,}/.test(input)) {
    console.log(`${BLUE}🔍 Looking up user by mobile: ${input}${RESET}\n`);
    user = await findUserByMobile(input);
    if (user) {
      userId = user.id;
      console.log(`${GREEN}✅ Found user: ${user.name || 'N/A'} (ID: ${userId})${RESET}\n`);
    } else {
      console.log(`${RED}❌ User not found with mobile: ${input}${RESET}\n`);
      process.exit(1);
    }
  } else {
    console.log(`${BLUE}🔍 Using user ID: ${input}${RESET}\n`);
  }

  // Fetch profile from API
  console.log(`${CYAN}📡 Calling API: GET /api/v2/profile/${userId}?app_type=vendor_app${RESET}\n`);
  
  const response = await makeApiRequest(`/api/v2/profile/${userId}?app_type=vendor_app`);
  
  if (response.status !== 'success' || !response.data) {
    console.log(`${RED}❌ API Error:${RESET}`, response.msg || response.error || 'Unknown error');
    console.log('Full response:', JSON.stringify(response, null, 2));
    process.exit(1);
  }

  const profile = response.data;
  
  console.log(`${GREEN}✅ API Response received (source: ${response.hitBy || 'unknown'})${RESET}\n`);
  
  // Extract shop data (same logic as DashboardScreen.tsx)
  const userType = profile?.user_type || profile?.user?.user_type;
  const hasB2CShop = profile?.shop?.shop_type === 3 || profile?.b2cShop?.shop_type === 3;
  const isB2CUser = userType === 'R' || userType === 'SR' || (userType === 'S' && hasB2CShop);
  
  console.log(`${BOLD}📊 USER INFO:${RESET}`);
  console.log(`   User ID: ${profile.id}`);
  console.log(`   Name: ${profile.name || 'N/A'}`);
  console.log(`   User Type: ${userType || 'N/A'}`);
  console.log(`   App Type: ${profile.app_type || 'N/A'}`);
  console.log(`   Is B2C User: ${isB2CUser ? GREEN + 'YES' + RESET : RED + 'NO' + RESET}`);
  console.log('');

  // Get B2C shop (same logic as DashboardScreen.tsx line ~1580)
  const b2cShop = profile?.b2cShop || (profile?.shop?.shop_type === 3 ? profile.shop : null);
  
  if (!b2cShop) {
    console.log(`${RED}❌ NO B2C SHOP FOUND${RESET}`);
    console.log('   profile.shop:', profile.shop ? `exists (type: ${profile.shop.shop_type})` : 'null');
    console.log('   profile.b2cShop:', profile.b2cShop ? 'exists' : 'null');
    console.log('');
    console.log(`${YELLOW}⚠️  Without B2C shop, user cannot accept orders${RESET}\n`);
    process.exit(0);
  }

  console.log(`${BOLD}🏪 B2C SHOP INFO:${RESET}`);
  console.log(`   Shop ID: ${b2cShop.id}`);
  console.log(`   Name: ${b2cShop.shopname || 'N/A'}`);
  console.log(`   Shop Type: ${b2cShop.shop_type}`);
  console.log('');

  console.log(`${BOLD}🔑 SUBSCRIPTION FIELDS (Raw API Data):${RESET}`);
  console.log(`   is_subscribed: ${CYAN}${b2cShop.is_subscribed}${RESET} (type: ${typeof b2cShop.is_subscribed})`);
  console.log(`   is_subscription_ends: ${CYAN}${b2cShop.is_subscription_ends}${RESET} (type: ${typeof b2cShop.is_subscription_ends})`);
  console.log(`   subscription_ends_at: ${CYAN}${b2cShop.subscription_ends_at}${RESET}`);
  console.log(`   subscribed_duration: ${CYAN}${b2cShop.subscribed_duration}${RESET}`);
  console.log('');

  // Validation (same as DashboardScreen.tsx lines 1620-1750)
  console.log(`${BOLD}✅ VALIDATION CHECKS (DashboardScreen.tsx logic):${RESET}\n`);

  // Check 1: is_subscribed === true
  const check1 = b2cShop.is_subscribed === true;
  console.log(`   ${check1 ? GREEN + '✅' : RED + '❌'} Check 1: is_subscribed === true`);
  console.log(`      Value: ${b2cShop.is_subscribed} ${check1 ? GREEN + '(PASS)' : RED + '(FAIL)'}${RESET}`);
  if (!check1) {
    console.log(`      ${YELLOW}⚠️  Must be explicitly 'true' (boolean)${RESET}`);
    console.log(`      Current type: ${typeof b2cShop.is_subscribed}`);
    if (b2cShop.is_subscribed === undefined) console.log(`      ${RED}Field is UNDEFINED${RESET}`);
    if (b2cShop.is_subscribed === null) console.log(`      ${RED}Field is NULL${RESET}`);
    if (b2cShop.is_subscribed === false) console.log(`      ${RED}Field is FALSE${RESET}`);
  }
  console.log('');

  // Check 2: is_subscription_ends !== true
  const check2 = b2cShop.is_subscription_ends !== true;
  console.log(`   ${check2 ? GREEN + '✅' : RED + '❌'} Check 2: is_subscription_ends !== true`);
  console.log(`      Value: ${b2cShop.is_subscription_ends} ${check2 ? GREEN + '(PASS)' : RED + '(FAIL)'}${RESET}`);
  if (!check2) {
    console.log(`      ${RED}⚠️  Subscription is marked as ENDED${RESET}`);
  }
  console.log('');

  // Check 3: subscription_ends_at must be in future
  let check3 = false;
  let endsAtDate = null;
  if (b2cShop.subscription_ends_at) {
    endsAtDate = new Date(b2cShop.subscription_ends_at);
    const now = new Date();
    check3 = endsAtDate > now;
    console.log(`   ${check3 ? GREEN + '✅' : RED + '❌'} Check 3: subscription_ends_at > now`);
    console.log(`      Expires: ${endsAtDate.toISOString()}`);
    console.log(`      Now:     ${now.toISOString()}`);
    console.log(`      ${check3 ? GREEN + 'NOT EXPIRED' : RED + 'EXPIRED'}${RESET}`);
  } else {
    console.log(`   ${RED}❌ Check 3: subscription_ends_at is ${b2cShop.subscription_ends_at === null ? 'NULL' : 'UNDEFINED'}${RESET}`);
  }
  console.log('');

  // Final result
  const allChecksPass = check1 && check2 && check3;
  
  console.log('='.repeat(80));
  console.log(`${BOLD}📋 FINAL RESULT:${RESET}`);
  console.log('='.repeat(80));
  
  if (allChecksPass) {
    console.log(`\n${GREEN}${BOLD}✅ ALL CHECKS PASS - USER CAN ACCEPT ORDERS${RESET}`);
    console.log(`${GREEN}   isSubscribed will be TRUE in DashboardScreen.tsx${RESET}`);
    console.log(`${GREEN}   Accept button will NOT be blurred${RESET}\n`);
  } else {
    console.log(`\n${RED}${BOLD}❌ SOME CHECKS FAILED - USER CANNOT ACCEPT ORDERS${RESET}`);
    console.log(`${RED}   isSubscribed will be FALSE in DashboardScreen.tsx${RESET}`);
    console.log(`${RED}   Accept button WILL BE BLURRED (opacity: 0.3)${RESET}\n`);
    
    console.log(`${YELLOW}Failed checks:${RESET}`);
    if (!check1) console.log(`   ❌ is_subscribed is not true`);
    if (!check2) console.log(`   ❌ is_subscription_ends is true`);
    if (!check3) console.log(`   ❌ subscription_ends_at is expired or missing`);
    console.log('');
  }

  // Show raw shop object for debugging
  console.log(`${BOLD}🔍 RAW SHOP OBJECT (from API):${RESET}`);
  console.log(JSON.stringify(b2cShop, null, 2));
  console.log('');
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
