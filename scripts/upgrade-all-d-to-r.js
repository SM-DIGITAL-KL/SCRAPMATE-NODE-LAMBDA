require('dotenv').config();
const User = require('../models/User');
const Shop = require('../models/Shop');
const { getDynamoDBClient } = require('../config/dynamodb');
const { UpdateCommand, ScanCommand } = require('@aws-sdk/lib-dynamodb');
const RedisCache = require('../utils/redisCache');
const http = require('http');
const querystring = require('querystring');

/**
 * Upgrade all v2 vendor_app users with user_type 'D' to 'R'
 * Restore deleted users, set shop approval_status to 'rejected'
 * Send SMS notification to all upgraded users
 * Usage: node scripts/upgrade-all-d-to-r.js
 */

// SMS Configuration
const SMS_CONFIG = {
  username: 'scrapmate',
  sendername: 'SCRPMT',
  smstype: 'TRANS',
  apikey: '1bf0131f-d1f2-49ed-9c57-19f1b4400f32',
  peid: '1701173389563945545',
  templateid: '1707176820121312775'
};

const SMS_MESSAGE = 'Congratulations on your B2C promotion. Download Scrapmate Partner App, receive customer orders, get free festive orders, and start earning.';

/**
 * Send SMS using bulksmsind.in API
 */
function sendSMS(phoneNumber, message) {
  return new Promise((resolve, reject) => {
    // Clean phone number
    const cleanedPhone = String(phoneNumber).replace(/\D/g, '');
    
    if (cleanedPhone.length !== 10) {
      reject(new Error(`Invalid phone number: ${phoneNumber}`));
      return;
    }

    const params = querystring.stringify({
      username: SMS_CONFIG.username,
      message: message,
      sendername: SMS_CONFIG.sendername,
      smstype: SMS_CONFIG.smstype,
      numbers: cleanedPhone,
      apikey: SMS_CONFIG.apikey,
      peid: SMS_CONFIG.peid,
      templateid: SMS_CONFIG.templateid
    });

    const options = {
      hostname: 'sms.bulksmsind.in',
      path: `/v2/sendSMS?${params}`,
      method: 'GET',
      timeout: 10000
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const response = JSON.parse(data);
          resolve(response);
        } catch (e) {
          resolve({ raw: data, status: 'unknown' });
        }
      });
    });

    req.on('error', (error) => reject(error));
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('SMS request timeout'));
    });
    req.end();
  });
}

async function upgradeAllDToR() {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🔄 Upgrading All D Type Users to R (B2C)');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  try {
    const client = getDynamoDBClient();
    
    // Step 1: Find all v2 vendor_app users with user_type 'D'
    console.log('📋 Step 1: Finding all v2 vendor_app users with user_type D...');
    let lastKey = null;
    const dUsers = [];

    do {
      const params = {
        TableName: 'users',
        FilterExpression: 'user_type = :userType AND app_type = :appType AND app_version = :appVersion',
        ExpressionAttributeValues: {
          ':userType': 'D',
          ':appType': 'vendor_app',
          ':appVersion': 'v2'
        }
      };

      if (lastKey) {
        params.ExclusiveStartKey = lastKey;
      }

      const command = new ScanCommand(params);
      const response = await client.send(command);

      if (response.Items && response.Items.length > 0) {
        dUsers.push(...response.Items);
      }

      lastKey = response.LastEvaluatedKey;
    } while (lastKey);

    console.log(`✅ Found ${dUsers.length} users with user_type 'D' (v2 vendor_app)\n`);

    if (dUsers.length === 0) {
      console.log('ℹ️  No users to upgrade. Exiting...\n');
      return;
    }

    // Step 2: Process each user
    console.log('📋 Step 2: Processing users...\n');
    const results = {
      total: dUsers.length,
      upgraded: 0,
      shopsCreated: 0,
      shopsUpdated: 0,
      shopsApproved: 0,
      shopsRejected: 0,
      restored: 0,
      smsSent: 0,
      smsFailed: 0,
      errors: []
    };

    for (let i = 0; i < dUsers.length; i++) {
      const user = dUsers[i];
      console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
      console.log(`Processing User ${i + 1}/${dUsers.length}`);
      console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
      console.log(`   User ID: ${user.id}`);
      console.log(`   Name: ${user.name || 'N/A'}`);
      console.log(`   Phone: ${user.mob_num || 'N/A'}`);
      console.log(`   Current user_type: ${user.user_type}`);
      console.log(`   Current del_status: ${user.del_status || 'Active'}`);

      try {
        // Update user_type to 'R' and remove del_status
        const updateExpression = 'SET user_type = :userType, updated_at = :updatedAt';
        const expressionAttributeValues = {
          ':userType': 'R',
          ':updatedAt': new Date().toISOString()
        };

        let updateCommand;
        if (user.del_status === 2) {
          // Remove del_status if it's 2 (deleted)
          updateCommand = new UpdateCommand({
            TableName: 'users',
            Key: { id: user.id },
            UpdateExpression: updateExpression + ' REMOVE del_status',
            ExpressionAttributeValues: expressionAttributeValues
          });
          results.restored++;
        } else {
          // Just update user_type
          updateCommand = new UpdateCommand({
            TableName: 'users',
            Key: { id: user.id },
            UpdateExpression: updateExpression,
            ExpressionAttributeValues: expressionAttributeValues
          });
        }

        await client.send(updateCommand);
        console.log(`   ✅ Updated user_type: D → R`);
        if (user.del_status === 2) {
          console.log(`   ✅ Restored user (removed del_status)`);
        }
        results.upgraded++;

        // Check/create B2C shop
        let shop = await Shop.findByUserId(user.id);
        
        if (shop) {
          // Check if shop already has 'approved' status
          const existingApprovalStatus = shop.approval_status;
          const newApprovalStatus = existingApprovalStatus === 'approved' ? 'approved' : 'rejected';
          
          // Update existing shop
          const shopUpdateCommand = new UpdateCommand({
            TableName: 'shops',
            Key: { id: shop.id },
            UpdateExpression: 'SET shop_type = :shopType, approval_status = :approvalStatus, updated_at = :updatedAt',
            ExpressionAttributeValues: {
              ':shopType': 3, // B2C (Retailer)
              ':approvalStatus': newApprovalStatus,
              ':updatedAt': new Date().toISOString()
            }
          });
          await client.send(shopUpdateCommand);
          console.log(`   ✅ Updated shop (ID: ${shop.id}) to B2C with approval_status: ${newApprovalStatus}`);
          if (existingApprovalStatus === 'approved') {
            console.log(`   ℹ️  Preserved existing 'approved' status`);
            results.shopsApproved++;
          } else {
            results.shopsRejected++;
          }
          results.shopsUpdated++;
        } else {
          // Create new B2C shop (always rejected for new shops)
          const shopData = {
            user_id: user.id,
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
            approval_status: 'rejected',
            del_status: 1
          };

          shop = await Shop.create(shopData);
          console.log(`   ✅ Created B2C shop (ID: ${shop.id}) with approval_status: rejected`);
          results.shopsCreated++;
          results.shopsRejected++;
        }

        // Clear Redis cache
        try {
          const cacheKey = RedisCache.userKey(user.id, 'profile');
          await RedisCache.delete(cacheKey);
        } catch (cacheError) {
          // Ignore cache errors
        }

        // Send SMS
        if (user.mob_num) {
          try {
            console.log(`   📱 Sending SMS to ${user.mob_num}...`);
            const smsResult = await sendSMS(user.mob_num, SMS_MESSAGE);
            
            // Check if SMS was successful
            if (Array.isArray(smsResult) && smsResult.length > 0) {
              const firstResult = smsResult[0];
              if (firstResult.status === 'success' || firstResult.status === 'sent') {
                console.log(`   ✅ SMS sent successfully (Message ID: ${firstResult.msgid || 'N/A'})`);
                results.smsSent++;
              } else {
                console.log(`   ⚠️  SMS API returned: ${firstResult.status || 'unknown'}`);
                results.smsFailed++;
                results.errors.push({
                  user_id: user.id,
                  phone: user.mob_num,
                  error: `SMS status: ${firstResult.status || 'unknown'}`
                });
              }
            } else if (smsResult.status === 'success' || smsResult.status === 'sent') {
              console.log(`   ✅ SMS sent successfully`);
              results.smsSent++;
            } else {
              console.log(`   ⚠️  SMS API returned: ${smsResult.status || 'unknown'}`);
              results.smsFailed++;
              results.errors.push({
                user_id: user.id,
                phone: user.mob_num,
                error: `SMS status: ${smsResult.status || 'unknown'}`
              });
            }
          } catch (smsError) {
            console.log(`   ❌ SMS failed: ${smsError.message}`);
            results.smsFailed++;
            results.errors.push({
              user_id: user.id,
              phone: user.mob_num,
              error: smsError.message
            });
          }
        } else {
          console.log(`   ⚠️  No phone number available for SMS`);
        }

      } catch (error) {
        console.error(`   ❌ Error processing user ${user.id}:`, error.message);
        results.errors.push({
          user_id: user.id,
          phone: user.mob_num || 'N/A',
          error: error.message
        });
      }
    }

    // Step 3: Summary
    console.log('\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📊 Upgrade Summary');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    console.log(`   Total Users Found: ${results.total}`);
    console.log(`   Users Upgraded: ${results.upgraded}`);
    console.log(`   Users Restored: ${results.restored}`);
    console.log(`   Shops Created: ${results.shopsCreated}`);
    console.log(`   Shops Updated: ${results.shopsUpdated}`);
    console.log(`   Shops with Approved Status: ${results.shopsApproved}`);
    console.log(`   Shops with Rejected Status: ${results.shopsRejected}`);
    console.log(`   SMS Sent Successfully: ${results.smsSent}`);
    console.log(`   SMS Failed: ${results.smsFailed}`);
    console.log(`   Errors: ${results.errors.length}\n`);

    if (results.errors.length > 0) {
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('⚠️  Errors Encountered');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
      results.errors.forEach((error, index) => {
        console.log(`   ${index + 1}. User ID: ${error.user_id}, Phone: ${error.phone}`);
        console.log(`      Error: ${error.error}\n`);
      });
    }

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('✅ Upgrade process completed!');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  } catch (error) {
    console.error('\n❌ Fatal error:', error.message);
    console.error('Stack:', error.stack);
    process.exit(1);
  }
}

upgradeAllDToR();

