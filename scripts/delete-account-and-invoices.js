/**
 * Script to delete user account and associated invoices/subscriptions
 * User: Kastiri (1770029017987), Mobile: 9074135121
 * Invoices to delete: 1770477319256, 1770476734927
 */

require('dotenv').config();
const { getDynamoDBClient } = require('../config/dynamodb');
const { DeleteCommand } = require('@aws-sdk/lib-dynamodb');
const User = require('../models/User');
const Invoice = require('../models/Invoice');
const Shop = require('../models/Shop');

const USER_ID = 1770029017987;
const MOBILE = '9074135121';
const INVOICE_IDS = [1770477319256, 1770476734927];

async function deleteAccountAndInvoices() {
  try {
    console.log(`\n🗑️  Deleting account and subscriptions...\n`);
    console.log('User ID:', USER_ID);
    console.log('Mobile:', MOBILE);
    console.log('Invoices to delete:', INVOICE_IDS.join(', '));
    console.log('');

    const client = getDynamoDBClient();

    // Step 1: Delete invoices
    console.log('🗑️  Deleting invoices...');
    for (const invoiceId of INVOICE_IDS) {
      try {
        const invoice = await Invoice.findById(invoiceId);
        if (invoice) {
          await Invoice.delete(invoiceId);
          console.log(`   ✅ Deleted invoice ${invoiceId}`);
        } else {
          console.log(`   ⚠️  Invoice ${invoiceId} not found`);
        }
      } catch (err) {
        console.log(`   ❌ Error deleting invoice ${invoiceId}:`, err.message);
      }
    }

    // Step 2: Find and update B2C shops - remove subscription
    console.log('\n🗑️  Removing shop subscriptions...');
    const allShops = await Shop.getAll();
    const userShops = allShops.filter(s => s.user_id === USER_ID);
    const contactShops = allShops.filter(s => 
      s.contact === MOBILE || s.contact_number === MOBILE
    );
    
    const allRelatedShops = [...userShops, ...contactShops];
    const uniqueShops = [...new Map(allRelatedShops.map(s => [s.id, s])).values()];
    
    console.log(`   Found ${uniqueShops.length} related shop(s)`);
    
    for (const shop of uniqueShops) {
      try {
        await Shop.update(shop.id, {
          is_subscribed: false,
          subscription_ends_at: null,
          is_subscription_ends: true,
          subscribed_duration: null,
          user_id: null
        });
        console.log(`   ✅ Removed subscription from shop: ${shop.shopname || shop.name} (${shop.id})`);
      } catch (err) {
        console.log(`   ❌ Error updating shop ${shop.id}:`, err.message);
      }
    }

    // Step 3: Delete user account
    console.log('\n🗑️  Deleting user account...');
    try {
      const deleteCommand = new DeleteCommand({
        TableName: 'users',
        Key: { id: USER_ID }
      });
      await client.send(deleteCommand);
      console.log(`   ✅ Deleted user account ${USER_ID}`);
    } catch (err) {
      console.log(`   ❌ Error deleting user:`, err.message);
    }

    // Step 4: Invalidate caches
    console.log('\n🗑️  Invalidating caches...');
    try {
      const RedisCache = require('../utils/redisCache');
      const cacheKeys = [
        `v2_profile_${USER_ID}`,
        `profile_${USER_ID}`,
        `user_${USER_ID}_profile`,
        `v2_api_profile_${USER_ID}`,
        `user:mobile:${MOBILE}`
      ];
      
      for (const key of cacheKeys) {
        try {
          await RedisCache.delete(key);
          console.log(`   ✅ Invalidated cache: ${key}`);
        } catch (err) {
          // Continue
        }
      }
    } catch (cacheError) {
      // Ignore
    }

    console.log(`\n${'='.repeat(60)}`);
    console.log(`✅ ACCOUNT AND SUBSCRIPTIONS DELETED!`);
    console.log(`${'='.repeat(60)}`);
    console.log(`\nDeleted:`);
    console.log(`   👤 User: Kastiri (${USER_ID})`);
    console.log(`   📱 Mobile: ${MOBILE}`);
    console.log(`   📝 Invoices: ${INVOICE_IDS.length}`);
    console.log(`   🏪 Shops updated: ${uniqueShops.length}`);
    console.log(`\nAll subscription data has been cleared.\n`);

    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

deleteAccountAndInvoices();
