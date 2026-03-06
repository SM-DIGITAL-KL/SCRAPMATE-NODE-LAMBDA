/**
 * Script to extend subscriptions by 15 days for users based on their transaction IDs
 * Run with: node scripts/extend-subscriptions-by-transaction-id.js
 * 
 * Users to extend:
 * 1. sri sai sakthi waste paper mart - MOJO6111205Q15596214 (2026-01-11 to 2026-02-11) → +15 days = 2026-02-26
 * 2. sr service center - MOJO6111D05Q15595837 (2026-01-11 to 2026-02-11) → +15 days = 2026-02-26
 * 3. User_9344727260 - MOJO6110X05D94041853 (2026-01-10 to 2026-02-10) → +15 days = 2026-02-25
 * 4. User_8056744395 - MOJO6107905Q14567072 (2026-01-07) → +15 days from today or original end date
 */

require('dotenv').config();
const User = require('../models/User');
const Invoice = require('../models/Invoice');
const Shop = require('../models/Shop');

// Users with their transaction IDs and extension details
const USERS_TO_EXTEND = [
  {
    name: 'sri sai sakthi waste paper mart',
    transactionId: 'MOJO6111205Q15596214',
    originalFromDate: '2026-01-11',
    originalToDate: '2026-02-11',
    newToDate: '2026-02-26' // +15 days
  },
  {
    name: 'sr service center',
    transactionId: 'MOJO6111D05Q15595837',
    originalFromDate: '2026-01-11',
    originalToDate: '2026-02-11',
    newToDate: '2026-02-26' // +15 days
  },
  {
    name: 'User_9344727260',
    transactionId: 'MOJO6110X05D94041853',
    originalFromDate: '2026-01-10',
    originalToDate: '2026-02-10',
    newToDate: '2026-02-25' // +15 days
  },
  {
    name: 'User_8056744395',
    transactionId: 'MOJO6107905Q14567072',
    originalFromDate: '2026-01-07',
    originalToDate: '2026-02-07',
    newToDate: '2026-02-22' // +15 days
  }
];

const DAYS_TO_EXTEND = 15;

/**
 * Add days to a date string
 */
function addDays(dateString, days) {
  const date = new Date(dateString);
  date.setDate(date.getDate() + days);
  return date.toISOString().split('T')[0]; // Return YYYY-MM-DD
}

/**
 * Find invoice by transaction ID (payment_moj_id or payment_req_id)
 */
async function findInvoiceByTransactionId(transactionId) {
  try {
    const invoices = await Invoice.findByTransactionIds([transactionId]);
    return invoices.length > 0 ? invoices[0] : null;
  } catch (error) {
    console.error(`Error finding invoice for transaction ${transactionId}:`, error.message);
    return null;
  }
}

/**
 * Find user by ID
 */
async function findUserById(userId) {
  try {
    return await User.findById(userId);
  } catch (error) {
    console.error(`Error finding user ${userId}:`, error.message);
    return null;
  }
}

/**
 * Find B2C shops for a user
 */
async function findB2CShopsForUser(userId, mobile) {
  try {
    // Find shops by user_id
    const allShops = await Shop.getAll();
    const userShops = allShops.filter(s => s.user_id === userId && s.shop_type === 3);
    
    // Also find by contact number
    const contactShops = allShops.filter(s => 
      s.shop_type === 3 && 
      (s.contact === mobile || s.contact_number === mobile)
    );
    
    // Combine and deduplicate
    const allB2CShops = [...userShops, ...contactShops];
    const uniqueShops = [...new Map(allB2CShops.map(s => [s.id, s])).values()];
    
    return uniqueShops;
  } catch (error) {
    console.error(`Error finding B2C shops for user ${userId}:`, error.message);
    return [];
  }
}

/**
 * Extend subscription for a single user
 */
async function extendSubscription(userConfig) {
  console.log(`\n${'─'.repeat(60)}`);
  console.log(`📱 Processing: ${userConfig.name}`);
  console.log(`🆔 Transaction ID: ${userConfig.transactionId}`);
  console.log(`${'─'.repeat(60)}`);

  try {
    // Step 1: Find invoice by transaction ID
    const invoice = await findInvoiceByTransactionId(userConfig.transactionId);
    
    if (!invoice) {
      console.log(`   ❌ Invoice not found for transaction: ${userConfig.transactionId}`);
      return { success: false, error: 'Invoice not found' };
    }

    console.log(`   ✅ Found Invoice ID: ${invoice.id}`);
    console.log(`   📅 Current From: ${invoice.from_date}`);
    console.log(`   📅 Current To: ${invoice.to_date}`);
    console.log(`   💰 Amount: ₹${invoice.amount || invoice.price || 'N/A'}`);

    // Step 2: Find user
    const userId = invoice.user_id;
    if (!userId) {
      console.log(`   ❌ No user_id found in invoice`);
      return { success: false, error: 'No user_id in invoice' };
    }

    const user = await findUserById(userId);
    if (!user) {
      console.log(`   ❌ User not found: ${userId}`);
      return { success: false, error: 'User not found' };
    }

    console.log(`   ✅ Found User: ${user.name || userConfig.name} (ID: ${user.id})`);
    console.log(`   📞 Mobile: ${user.mobile || user.phone || 'N/A'}`);

    // Calculate new dates
    const originalFromDate = invoice.from_date || userConfig.originalFromDate;
    const originalToDate = invoice.to_date || userConfig.originalToDate;
    const newToDate = addDays(originalToDate, DAYS_TO_EXTEND);

    console.log(`\n   📅 Date Extension:`);
    console.log(`      From Date: ${originalFromDate} (unchanged)`);
    console.log(`      To Date: ${originalToDate} → ${newToDate} (+${DAYS_TO_EXTEND} days)`);

    // Step 3: Update Invoice
    const payDetails = JSON.parse(invoice.pay_details || '{}');
    payDetails.extended = true;
    payDetails.original_to_date = originalToDate;
    payDetails.extension_date = new Date().toISOString();
    payDetails.extension_days = DAYS_TO_EXTEND;
    payDetails.extension_reason = 'Manual extension by admin';

    await Invoice.update(invoice.id, {
      from_date: originalFromDate,
      to_date: newToDate,
      pay_details: JSON.stringify(payDetails)
    });

    console.log(`   ✅ Invoice updated`);

    // Step 4: Set new subscription end time for shops
    const newEndDate = new Date(newToDate);
    newEndDate.setHours(23, 59, 59, 999);
    const subscriptionEndsAt = newEndDate.toISOString();

    // Find and update B2C shops
    const mobile = user.mobile || user.phone || invoice.mobile;
    const shops = await findB2CShopsForUser(user.id, mobile);

    console.log(`\n   🏪 Updating ${shops.length} B2C shop(s):`);

    for (const shop of shops) {
      await Shop.update(shop.id, {
        is_subscribed: true,
        subscription_ends_at: subscriptionEndsAt,
        is_subscription_ends: false,
        subscribed_duration: 'month',
        user_id: user.id
      });
      console.log(`      ✅ ${shop.shopname || shop.name || 'Shop'}: Extended to ${newToDate}`);
    }

    if (shops.length === 0) {
      console.log(`      ⚠️  No B2C shops found to update`);
    }

    // Step 5: Invalidate caches
    try {
      const RedisCache = require('../utils/redisCache');
      const cacheKeys = [
        `v2_profile_${user.id}`,
        `profile_${user.id}`,
        `user_${user.id}_profile`,
        `v2_api_profile_${user.id}`,
        `user:mobile:${mobile}`
      ];
      
      for (const key of cacheKeys) {
        if (key) {
          try {
            await RedisCache.delete(key);
          } catch (err) {
            // Continue
          }
        }
      }
      console.log(`\n   ✅ Cache invalidated`);
    } catch (cacheError) {
      // Ignore cache errors
    }

    return {
      success: true,
      userId: user.id,
      invoiceId: invoice.id,
      newToDate: newToDate,
      shopsUpdated: shops.length
    };

  } catch (error) {
    console.error(`   ❌ Error processing ${userConfig.name}:`, error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Main function to process all users
 */
async function main() {
  console.log('\n' + '='.repeat(70));
  console.log('  EXTEND SUBSCRIPTIONS BY 15 DAYS');
  console.log('  Based on Transaction IDs');
  console.log('='.repeat(70));
  console.log(`\n📋 Total users to process: ${USERS_TO_EXTEND.length}`);
  console.log(`📅 Extension: +${DAYS_TO_EXTEND} days\n`);

  const results = [];

  for (const userConfig of USERS_TO_EXTEND) {
    const result = await extendSubscription(userConfig);
    results.push({ ...userConfig, ...result });
  }

  // Summary
  console.log('\n' + '='.repeat(70));
  console.log('  SUMMARY');
  console.log('='.repeat(70));

  const successful = results.filter(r => r.success);
  const failed = results.filter(r => !r.success);

  console.log(`\n✅ Successful: ${successful.length}/${results.length}`);
  console.log(`❌ Failed: ${failed.length}/${results.length}\n`);

  if (successful.length > 0) {
    console.log('✅ SUCCESSFUL EXTENSIONS:');
    successful.forEach(r => {
      console.log(`   • ${r.name}`);
      console.log(`     Invoice: ${r.invoiceId}, New End Date: ${r.newToDate}`);
      console.log(`     Shops Updated: ${r.shopsUpdated}`);
      console.log('');
    });
  }

  if (failed.length > 0) {
    console.log('❌ FAILED EXTENSIONS:');
    failed.forEach(r => {
      console.log(`   • ${r.name}`);
      console.log(`     Transaction ID: ${r.transactionId}`);
      console.log(`     Error: ${r.error}`);
      console.log('');
    });
  }

  // Clear caches so admin panel and vendor apps show fresh data
  if (successful.length > 0) {
    console.log('\n🔄 Clearing caches...');
    try {
      const RedisCache = require('../utils/redisCache');
      
      // Clear paid subscriptions cache (admin panel)
      const cacheKey = RedisCache.listKey('paid_subscriptions');
      await RedisCache.delete(cacheKey);
      console.log('✅ Paid subscriptions cache cleared');
      
      // Clear user profile caches for each successful user
      for (const result of successful) {
        if (result.userId) {
          const profileCacheKey = RedisCache.userKey(result.userId, 'profile');
          await RedisCache.delete(profileCacheKey);
          console.log(`✅ Profile cache cleared for user ${result.userId}`);
        }
      }
      
      console.log('   Admin panel and vendor apps will show updated data on next refresh');
    } catch (cacheError) {
      console.log('⚠️  Could not clear cache (non-critical)');
    }
  }

  console.log('\n' + '='.repeat(70));
  console.log('  EXTENSION PROCESS COMPLETE');
  console.log('='.repeat(70) + '\n');

  process.exit(failed.length > 0 ? 1 : 0);
}

// Run the script
main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
