/**
 * Script to delete all users with multiple phone numbers
 * Usage: node scripts/delete-users-by-phone-list.js <phone1> <phone2> ... <phoneN>
 * Or modify PHONE_NUMBERS array in this file
 * 
 * WARNING: This will permanently delete all users with the specified phone numbers!
 */

require('dotenv').config();
const { getDynamoDBClient } = require('../config/dynamodb');
const { ScanCommand, DeleteCommand } = require('@aws-sdk/lib-dynamodb');
const Shop = require('../models/Shop');
const DeliveryBoy = require('../models/DeliveryBoy');
const Customer = require('../models/Customer');

const TABLE_NAME = 'users';

// Phone numbers to delete - can be modified directly or passed as command line arguments
const PHONE_NUMBERS = process.argv.length > 2 
  ? process.argv.slice(2) 
  : [
      '9074135122',
      '9074135123',
      '9074135124', // Assuming typo 907435124 -> 9074135124
      '9074135125',
      '9074135126',
      '9074135127',
      '9074135128',
      '9074135129'
    ];

async function deleteUsersByPhoneList(phoneNumbers) {
  try {
    const client = getDynamoDBClient();
    
    console.log('\n🗑️  Deleting Users by Phone Numbers');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`📱 Phone numbers to process: ${phoneNumbers.length}`);
    phoneNumbers.forEach((phone, idx) => {
      console.log(`   ${idx + 1}. ${phone}`);
    });
    console.log('');
    console.log('⚠️  WARNING: This will permanently delete all users with these phone numbers!');
    console.log('   This action cannot be undone!\n');
    
    const allUsersToDelete = [];
    const phoneToUsersMap = {};
    
    // Find all users for each phone number
    for (const phoneNumber of phoneNumbers) {
      const mobileValue = typeof phoneNumber === 'string' && !isNaN(phoneNumber) 
        ? parseInt(phoneNumber) 
        : phoneNumber;
      
      console.log(`🔍 Searching for users with phone: ${phoneNumber}...`);
      const users = [];
      let lastKey = null;
      
      do {
        const params = {
          TableName: TABLE_NAME,
          FilterExpression: 'mob_num = :mobile',
          ExpressionAttributeValues: {
            ':mobile': mobileValue
          }
        };
        
        if (lastKey) {
          params.ExclusiveStartKey = lastKey;
        }
        
        const command = new ScanCommand(params);
        const response = await client.send(command);
        
        if (response.Items && response.Items.length > 0) {
          users.push(...response.Items);
        }
        
        lastKey = response.LastEvaluatedKey;
      } while (lastKey);
      
      if (users.length > 0) {
        phoneToUsersMap[phoneNumber] = users;
        allUsersToDelete.push(...users);
        console.log(`   ✅ Found ${users.length} user(s)`);
      } else {
        console.log(`   ⚠️  No users found`);
      }
    }
    
    if (allUsersToDelete.length === 0) {
      console.log('\n❌ No users found with any of the specified phone numbers.');
      return;
    }
    
    console.log(`\n📋 Summary: Found ${allUsersToDelete.length} total user(s) to delete:\n`);
    
    // Display all users found
    for (const [phone, users] of Object.entries(phoneToUsersMap)) {
      if (users.length > 0) {
        console.log(`Phone: ${phone} (${users.length} user(s)):`);
        users.forEach((user, idx) => {
          console.log(`  ${idx + 1}. ID: ${user.id}`);
          console.log(`     Name: ${user.name || 'N/A'}`);
          console.log(`     Email: ${user.email || 'N/A'}`);
          console.log(`     App Type: ${user.app_type || 'N/A'}`);
          console.log(`     User Type: ${user.user_type || 'N/A'}`);
          console.log(`     Del Status: ${user.del_status || 'N/A'}`);
          console.log('');
        });
      }
    }
    
    // Delete all users and related records
    console.log('🗑️  Starting deletion process...\n');
    let deletedCount = 0;
    let errorCount = 0;
    const errors = [];
    
    for (const user of allUsersToDelete) {
      try {
        console.log(`Deleting user ${user.id} (${user.name || 'N/A'}, ${user.app_type || 'N/A'})...`);
        
        // Check and handle related records
        try {
          // Check for shop
          const shops = await Shop.findAllByUserId(user.id);
          if (shops && shops.length > 0) {
            console.log(`   Found ${shops.length} shop(s) - marking as deleted...`);
            for (const shop of shops) {
              if (shop.del_status !== 2) {
                await Shop.update(shop.id, { del_status: 2 });
                console.log(`     ✅ Shop ${shop.id} marked as deleted`);
              }
            }
          }
        } catch (shopErr) {
          console.log(`   ⚠️  Could not handle shops: ${shopErr.message}`);
        }
        
        try {
          // Check for delivery boy
          const deliveryBoy = await DeliveryBoy.findByUserId(user.id);
          if (deliveryBoy && deliveryBoy.del_status !== 2) {
            await DeliveryBoy.update(deliveryBoy.id, { del_status: 2 });
            console.log(`     ✅ Delivery boy ${deliveryBoy.id} marked as deleted`);
          }
        } catch (deliveryErr) {
          // Delivery boy might not exist, that's okay
        }
        
        try {
          // Check for customer
          const customer = await Customer.findByUserId(user.id);
          if (customer) {
            // Customer doesn't have del_status, so we skip it
            console.log(`     ℹ️  Customer record ${customer.id} exists (no soft delete available)`);
          }
        } catch (customerErr) {
          // Customer might not exist, that's okay
        }
        
        // Delete the user
        const deleteCommand = new DeleteCommand({
          TableName: TABLE_NAME,
          Key: { id: user.id }
        });
        
        await client.send(deleteCommand);
        console.log(`   ✅ User ${user.id} deleted successfully\n`);
        deletedCount++;
      } catch (error) {
        console.error(`   ❌ Error deleting user ${user.id}: ${error.message}\n`);
        errors.push({ userId: user.id, error: error.message });
        errorCount++;
      }
    }
    
    // Final summary
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📊 Deletion Summary:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`   Total users found: ${allUsersToDelete.length}`);
    console.log(`   Successfully deleted: ${deletedCount}`);
    console.log(`   Errors: ${errorCount}`);
    
    if (errors.length > 0) {
      console.log('\n❌ Errors encountered:');
      errors.forEach(({ userId, error }) => {
        console.log(`   User ${userId}: ${error}`);
      });
    }
    
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    
  } catch (error) {
    console.error('❌ Fatal error deleting users:', error);
    throw error;
  }
}

// Run the deletion
deleteUsersByPhoneList(PHONE_NUMBERS)
  .then(() => {
    console.log('✅ Deletion process completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Script failed:', error);
    process.exit(1);
  });


