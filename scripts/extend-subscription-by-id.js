/**
 * Quick script to extend subscription by transaction ID
 * Usage: node scripts/extend-subscription-by-id.js <transaction_id> [days]
 * 
 * Examples:
 *   node scripts/extend-subscription-by-id.js MOJO6111205Q15596214 15
 *   node scripts/extend-subscription-by-id.js MOJO6111D05Q15595837 15
 */

require('dotenv').config();
const Invoice = require('../models/Invoice');
const Shop = require('../models/Shop');
const User = require('../models/User');

const DAYS_TO_EXTEND = parseInt(process.argv[3]) || 15;

const RedisCache = require('../utils/redisCache');

function addDays(dateString, days) {
  const date = new Date(dateString);
  date.setDate(date.getDate() + days);
  return date.toISOString().split('T')[0];
}

async function extendByTransactionId(transactionId) {
  console.log(`\n🔍 Looking for transaction: ${transactionId}`);
  
  const invoices = await Invoice.findByTransactionIds([transactionId]);
  if (invoices.length === 0) {
    console.log('❌ Invoice not found');
    return;
  }
  
  const invoice = invoices[0];
  console.log(`✅ Found Invoice ${invoice.id}`);
  console.log(`   Current: ${invoice.from_date} to ${invoice.to_date}`);
  
  const newToDate = addDays(invoice.to_date, DAYS_TO_EXTEND);
  console.log(`   New End: ${newToDate} (+${DAYS_TO_EXTEND} days)`);
  
  // Update invoice
  const payDetails = JSON.parse(invoice.pay_details || '{}');
  payDetails.extended = true;
  payDetails.extension_date = new Date().toISOString();
  payDetails.extension_days = DAYS_TO_EXTEND;
  
  await Invoice.update(invoice.id, {
    to_date: newToDate,
    pay_details: JSON.stringify(payDetails)
  });
  
  // Update shops
  const userId = invoice.user_id;
  const newEndDate = new Date(newToDate);
  newEndDate.setHours(23, 59, 59, 999);
  
  const allShops = await Shop.getAll();
  const userShops = allShops.filter(s => s.user_id === userId && s.shop_type === 3);
  
  for (const shop of userShops) {
    await Shop.update(shop.id, {
      is_subscribed: true,
      subscription_ends_at: newEndDate.toISOString(),
      is_subscription_ends: false
    });
    console.log(`   ✅ Updated shop: ${shop.shopname || shop.id}`);
  }
  
  // Clear paid subscriptions cache
  try {
    const cacheKey = RedisCache.listKey('paid_subscriptions');
    await RedisCache.delete(cacheKey);
    console.log(`   ✅ Paid subscriptions cache cleared`);
  } catch (err) {
    // Ignore cache errors
  }

  console.log(`\n✅ Extension complete!`);
}

const transactionId = process.argv[2];
if (!transactionId) {
  console.log('Usage: node extend-subscription-by-id.js <transaction_id> [days]');
  console.log('Example: node extend-subscription-by-id.js MOJO6111205Q15596214 15');
  process.exit(1);
}

extendByTransactionId(transactionId).catch(console.error);
