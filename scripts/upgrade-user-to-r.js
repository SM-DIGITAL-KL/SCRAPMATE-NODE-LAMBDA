require('dotenv').config();
const User = require('../models/User');
const Shop = require('../models/Shop');
const { getDynamoDBClient } = require('../config/dynamodb');
const { UpdateCommand } = require('@aws-sdk/lib-dynamodb');
const RedisCache = require('../utils/redisCache');

/**
 * Upgrade user from 'N' to 'R' and create B2C shop with rejected approval status
 * Usage: node scripts/upgrade-user-to-r.js [user_id]
 * Example: node scripts/upgrade-user-to-r.js 1767855778892
 */

async function upgradeUserToR() {
  const args = process.argv.slice(2);
  const userId = args[0] || '1767855778892';

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🔄 Upgrading User to Type R (B2C)');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  console.log(`👤 User ID: ${userId}\n`);

  try {
    // Step 1: Get user details
    console.log('📋 Step 1: Fetching user details...');
    const user = await User.findById(parseInt(userId));
    
    if (!user) {
      console.error(`❌ User with ID ${userId} not found`);
      process.exit(1);
    }

    console.log(`✅ Found user: ${user.name || 'N/A'}`);
    console.log(`   Current user_type: ${user.user_type || 'N/A'}`);
    console.log(`   Current del_status: ${user.del_status || 'N/A'}`);
    console.log(`   Email: ${user.email || 'N/A'}`);
    console.log(`   Phone: ${user.mob_num || 'N/A'}\n`);

    // Step 2: Update user_type from 'N' to 'R' and restore user (remove del_status)
    console.log('📋 Step 2: Updating user_type to R and restoring user...');
    const client = getDynamoDBClient();
    
    const updateExpression = 'SET user_type = :userType, updated_at = :updatedAt';
    const expressionAttributeValues = {
      ':userType': 'R',
      ':updatedAt': new Date().toISOString()
    };
    
    // Remove del_status if it exists (set to null to effectively remove it)
    const updateCommand = new UpdateCommand({
      TableName: 'users',
      Key: { id: parseInt(userId) },
      UpdateExpression: updateExpression + ' REMOVE del_status',
      ExpressionAttributeValues: expressionAttributeValues
    });

    await client.send(updateCommand);
    console.log(`✅ Updated user_type: ${user.user_type} → R`);
    console.log(`✅ Removed del_status (user restored)\n`);

    // Step 3: Check if shop already exists
    console.log('📋 Step 3: Checking for existing shop...');
    const existingShop = await Shop.findByUserId(parseInt(userId));
    
    if (existingShop) {
      console.log(`⚠️  Shop already exists (ID: ${existingShop.id})`);
      console.log(`   Shop Type: ${existingShop.shop_type || 'N/A'}`);
      console.log(`   Shop Name: ${existingShop.shopname || 'N/A'}`);
      
      // Update existing shop to B2C (shop_type = 3) with rejected status
      console.log('\n📋 Step 4: Updating existing shop to B2C with rejected status...');
      const shopUpdateCommand = new UpdateCommand({
        TableName: 'shops',
        Key: { id: existingShop.id },
        UpdateExpression: 'SET shop_type = :shopType, approval_status = :approvalStatus, updated_at = :updatedAt',
        ExpressionAttributeValues: {
          ':shopType': 3, // B2C (Retailer)
          ':approvalStatus': 'rejected',
          ':updatedAt': new Date().toISOString()
        }
      });

      await client.send(shopUpdateCommand);
      console.log(`✅ Updated shop to B2C (shop_type: 3) with approval_status: rejected\n`);
    } else {
      // Step 4: Create new B2C shop
      console.log('📋 Step 4: Creating new B2C shop...');
      const shopData = {
        user_id: parseInt(userId),
        email: user.email || '',
        shopname: user.name || 'Shop',
        contact: user.mob_num || '',
        address: '',
        location: '',
        state: '',
        place: '',
        language: '',
        profile_photo: '',
        shop_type: 3, // B2C (Retailer)
        pincode: '',
        lat_log: '',
        place_id: '',
        approval_status: 'rejected', // Set to rejected as requested
        del_status: 1
      };

      const newShop = await Shop.create(shopData);
      console.log(`✅ Created B2C shop (ID: ${newShop.id})`);
      console.log(`   Shop Type: 3 (Retailer/B2C)`);
      console.log(`   Approval Status: rejected\n`);
    }

    // Step 5: Clear Redis cache
    console.log('📋 Step 5: Clearing Redis cache...');
    try {
      const cacheKey = RedisCache.userKey(userId, 'profile');
      await RedisCache.delete(cacheKey);
      console.log(`✅ Cleared profile cache for user ${userId}\n`);
    } catch (cacheError) {
      console.log(`⚠️  Cache clear warning: ${cacheError.message}\n`);
    }

    // Step 6: Verify changes
    console.log('📋 Step 6: Verifying changes...');
    const updatedUser = await User.findById(parseInt(userId));
    const updatedShop = await Shop.findByUserId(parseInt(userId));

    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('✅ Upgrade Complete - Verification');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    
    console.log('👤 User Details:');
    console.log(`   User ID: ${updatedUser.id}`);
    console.log(`   Name: ${updatedUser.name || 'N/A'}`);
    console.log(`   User Type: ${updatedUser.user_type || 'N/A'}`);
    console.log(`   Del Status: ${updatedUser.del_status || 'Active (not deleted)'}`);
    console.log(`   App Type: ${updatedUser.app_type || 'N/A'}`);
    console.log(`   App Version: ${updatedUser.app_version || 'N/A'}\n`);

    if (updatedShop) {
      console.log('🏪 Shop Details:');
      console.log(`   Shop ID: ${updatedShop.id}`);
      console.log(`   Shop Name: ${updatedShop.shopname || 'N/A'}`);
      console.log(`   Shop Type: ${updatedShop.shop_type || 'N/A'} (${updatedShop.shop_type === 3 ? 'Retailer/B2C' : 'Other'})`);
      console.log(`   Approval Status: ${updatedShop.approval_status || 'N/A'}`);
      console.log(`   User ID: ${updatedShop.user_id || 'N/A'}\n`);
    } else {
      console.log('⚠️  Shop not found after creation\n');
    }

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('✅ All operations completed successfully!');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  } catch (error) {
    console.error('\n❌ Error upgrading user:', error.message);
    console.error('Stack:', error.stack);
    process.exit(1);
  }
}

upgradeUserToR();


