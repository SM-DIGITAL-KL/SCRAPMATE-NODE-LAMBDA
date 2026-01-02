/**
 * Script to delete vendor_app user account with specific phone number and user_type
 * Usage: node scripts/delete-vendor-app-account-specific.js <phone_number> <user_type>
 * Example: node scripts/delete-vendor-app-account-specific.js 9074135121 R
 */

require('dotenv').config();
const { getDynamoDBClient } = require('../config/dynamodb');
const { ScanCommand, DeleteCommand, UpdateCommand } = require('@aws-sdk/lib-dynamodb');
const User = require('../models/User');
const Shop = require('../models/Shop');

const PHONE_NUMBER = process.argv[2] || '9074135121';
const USER_TYPE = process.argv[3] || 'R';

async function deleteVendorAppAccount() {
  try {
    console.log('\n🗑️  Deleting Vendor App Account');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    console.log(`Phone Number: ${PHONE_NUMBER}`);
    console.log(`User Type: ${USER_TYPE}`);
    console.log(`App Type: vendor_app\n`);

    // Find all users with this phone number
    const allUsers = await User.findAllByMobile(PHONE_NUMBER);
    
    if (!allUsers || allUsers.length === 0) {
      console.log(`❌ No users found with phone number: ${PHONE_NUMBER}`);
      return;
    }

    console.log(`📋 Found ${allUsers.length} user(s) with phone ${PHONE_NUMBER}:\n`);
    allUsers.forEach((user, idx) => {
      console.log(`${idx + 1}. User ID: ${user.id}`);
      console.log(`   Name: ${user.name || 'N/A'}`);
      console.log(`   User Type: ${user.user_type || 'N/A'}`);
      console.log(`   App Type: ${user.app_type || 'N/A'}`);
      console.log(`   Del Status: ${user.del_status || 'N/A'}`);
      console.log('');
    });

    // Find the vendor_app user with specified user_type
    const vendorUser = allUsers.find(u => 
      u.app_type === 'vendor_app' && 
      u.user_type === USER_TYPE &&
      (u.del_status !== 2 || !u.del_status)
    );

    if (!vendorUser) {
      console.log(`❌ No active vendor_app user found with phone ${PHONE_NUMBER} and user_type ${USER_TYPE}`);
      console.log(`   Available users:`);
      allUsers.forEach(u => {
        console.log(`   - User ID: ${u.id}, Type: ${u.user_type}, App: ${u.app_type || 'N/A'}, Del Status: ${u.del_status || 'N/A'}`);
      });
      return;
    }

    console.log('✅ Found vendor_app user to delete:');
    console.log(`   User ID: ${vendorUser.id}`);
    console.log(`   Name: ${vendorUser.name || 'N/A'}`);
    console.log(`   Email: ${vendorUser.email || 'N/A'}`);
    console.log(`   Phone: ${vendorUser.mob_num || 'N/A'}`);
    console.log(`   User Type: ${vendorUser.user_type}`);
    console.log(`   App Type: ${vendorUser.app_type}`);
    console.log('');

    // Check for associated shop
    const shop = await Shop.findByUserId(vendorUser.id);
    if (shop) {
      console.log('⚠️  Found associated shop:');
      console.log(`   Shop ID: ${shop.id}`);
      console.log(`   Shop Name: ${shop.shopname || 'N/A'}`);
      console.log(`   Shop Type: ${shop.shop_type || 'N/A'}`);
      console.log(`   Del Status: ${shop.del_status || 'N/A'}`);
      console.log('');
      console.log('   Note: Shop record will remain in database but marked as deleted.');
      console.log('   If you want to delete the shop as well, please do so separately.');
      console.log('');
    }

    // Confirm deletion
    console.log('⚠️  WARNING: This will permanently delete the user account!');
    console.log('   This action cannot be undone.\n');

    // Delete the user
    const client = getDynamoDBClient();
    console.log('🗑️  Deleting user...');
    
    const deleteCommand = new DeleteCommand({
      TableName: 'users',
      Key: {
        id: vendorUser.id
      }
    });

    await client.send(deleteCommand);
    console.log(`✅ User deleted successfully!`);
    console.log(`   Deleted User ID: ${vendorUser.id}`);
    console.log(`   Deleted Name: ${vendorUser.name || 'N/A'}`);
    console.log('');

    // If shop exists, mark it as deleted (soft delete)
    if (shop && shop.del_status !== 2) {
      console.log('🗑️  Marking associated shop as deleted...');
      try {
        await Shop.update(shop.id, { del_status: 2 });
        console.log(`✅ Shop marked as deleted (del_status = 2)`);
        console.log(`   Shop ID: ${shop.id}`);
        console.log('');
      } catch (shopErr) {
        console.error('⚠️  Error marking shop as deleted:', shopErr.message);
        console.log('   Shop record still exists but user is deleted.');
        console.log('');
      }
    }

    console.log('📊 Summary:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`   ✅ User deleted: ${vendorUser.id} (${vendorUser.name || 'N/A'})`);
    if (shop) {
      console.log(`   ${shop.del_status === 2 ? '✅' : '⚠️ '} Shop status: ${shop.id} (${shop.del_status === 2 ? 'deleted' : 'active'})`);
    }
    console.log('');

    console.log('✅ Done!\n');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

deleteVendorAppAccount();


