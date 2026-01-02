/**
 * Script to check why a specific user is not showing in nearby shops
 * Usage: node scripts/check-user-why-not-nearby.js <reference_user_phone> <check_user_phone>
 */

const User = require('../models/User');
const Shop = require('../models/Shop');
const { getDynamoDBClient } = require('../config/dynamodb');
const { ScanCommand } = require('@aws-sdk/lib-dynamodb');

const referencePhone = process.argv[2];
const checkPhone = process.argv[3];

if (!referencePhone || !checkPhone) {
  console.error('❌ Please provide both reference user phone and check user phone');
  console.log('Usage: node scripts/check-user-why-not-nearby.js <reference_phone> <check_phone>');
  process.exit(1);
}

async function checkUser() {
  try {
    console.log(`\n🔍 Checking why user ${checkPhone} is not showing as nearby for user ${referencePhone}\n`);

    const client = getDynamoDBClient();

    // Find reference user - try different phone formats
    console.log(`📍 Finding reference user: ${referencePhone}...`);
    let referenceUser = null;
    const phoneFormats = [String(referencePhone), parseInt(referencePhone), referencePhone];
    
    for (const phoneFormat of phoneFormats) {
      let scanKey = null;
      let foundUsers = [];
      
      do {
        const scanParams = {
          TableName: 'users',
          FilterExpression: 'mob_num = :mobNum',
          ExpressionAttributeValues: {
            ':mobNum': phoneFormat
          }
        };
        
        if (scanKey) {
          scanParams.ExclusiveStartKey = scanKey;
        }
        
        const scanCommand = new ScanCommand(scanParams);
        const response = await client.send(scanCommand);
        
        if (response.Items) {
          foundUsers.push(...response.Items);
        }
        scanKey = response.LastEvaluatedKey;
      } while (scanKey);
      
      if (foundUsers.length > 0) {
        const b2bUsers = foundUsers.filter(u => u.user_type === 'S' || u.user_type === 'SR');
        if (b2bUsers.length > 0) {
          referenceUser = b2bUsers[0];
        } else {
          referenceUser = foundUsers[0];
        }
        break;
      }
    }

    if (!referenceUser) {
      console.error(`❌ Reference user ${referencePhone} not found`);
      process.exit(1);
    }

    const { password: _, ...refUserWithoutPassword } = referenceUser;
    referenceUser = refUserWithoutPassword;

    console.log(`✅ Found reference user: ${referenceUser.name || 'N/A'} (ID: ${referenceUser.id}, Type: ${referenceUser.user_type})\n`);

    // Get reference user's shop location
    let refShop = await Shop.findByUserId(referenceUser.id);
    if (!refShop) {
      scanKey = null;
      do {
        const scanParams = {
          TableName: 'shops',
          FilterExpression: 'user_id = :userId',
          ExpressionAttributeValues: {
            ':userId': referenceUser.id
          }
        };
        
        if (scanKey) {
          scanParams.ExclusiveStartKey = scanKey;
        }
        
        const scanCommand = new ScanCommand(scanParams);
        const response = await client.send(scanCommand);
        
        if (response.Items && response.Items.length > 0) {
          refShop = response.Items[0];
          break;
        }
        scanKey = response.LastEvaluatedKey;
      } while (scanKey);
    }

    if (!refShop || !refShop.lat_log) {
      console.error(`❌ Reference user does not have a shop location`);
      process.exit(1);
    }

    const [refLat, refLng] = refShop.lat_log.split(',').map(Number);
    console.log(`📍 Reference user location: ${refLat}, ${refLng}\n`);

    // Find check user - try different phone formats
    console.log(`🔍 Finding user to check: ${checkPhone}...`);
    let checkUser = null;
    const checkPhoneFormats = [String(checkPhone), parseInt(checkPhone), checkPhone];
    
    for (const phoneFormat of checkPhoneFormats) {
      let scanKey = null;
      let foundUsers = [];
      
      do {
        const scanParams = {
          TableName: 'users',
          FilterExpression: 'mob_num = :mobNum',
          ExpressionAttributeValues: {
            ':mobNum': phoneFormat
          }
        };
        
        if (scanKey) {
          scanParams.ExclusiveStartKey = scanKey;
        }
        
        const scanCommand = new ScanCommand(scanParams);
        const response = await client.send(scanCommand);
        
        if (response.Items) {
          foundUsers.push(...response.Items);
        }
        scanKey = response.LastEvaluatedKey;
      } while (scanKey);
      
      if (foundUsers.length > 0) {
        checkUser = foundUsers[0];
        break;
      }
    }

    if (!checkUser) {
      console.error(`❌ User ${checkPhone} not found in database`);
      process.exit(1);
    }

    const { password: __, ...checkUserWithoutPassword } = checkUser;
    checkUser = checkUserWithoutPassword;

    console.log(`✅ Found user: ${checkUser.name || 'N/A'} (ID: ${checkUser.id})`);
    console.log(`   - User Type: ${checkUser.user_type || 'N/A'}`);
    console.log(`   - App Type: ${checkUser.app_type || 'N/A'}`);
    console.log(`   - Del Status: ${checkUser.del_status || 'N/A'}\n`);

    // Check reasons why not showing
    const reasons = [];

    // 1. Check user type
    if (checkUser.user_type !== 'R' && checkUser.user_type !== 'S' && checkUser.user_type !== 'SR') {
      reasons.push(`❌ User type is "${checkUser.user_type}", not R/S/SR - excluded from search`);
    } else {
      console.log(`✅ User type "${checkUser.user_type}" is valid (R/S/SR)`);
    }

    // 2. Check app type
    if (checkUser.app_type !== 'vendor_app') {
      reasons.push(`❌ App type is "${checkUser.app_type}", not "vendor_app" - excluded from search`);
    } else {
      console.log(`✅ App type "vendor_app" is valid`);
    }

    // 3. Check del status
    if (checkUser.del_status === 2) {
      reasons.push(`❌ User is deleted (del_status = 2) - excluded from search`);
    } else {
      console.log(`✅ User is not deleted (del_status: ${checkUser.del_status || 'N/A'})`);
    }

    // 4. Check if user has a shop
    let checkShop = await Shop.findByUserId(checkUser.id);
    if (!checkShop) {
      scanKey = null;
      do {
        const scanParams = {
          TableName: 'shops',
          FilterExpression: 'user_id = :userId',
          ExpressionAttributeValues: {
            ':userId': checkUser.id
          }
        };
        
        if (scanKey) {
          scanParams.ExclusiveStartKey = scanKey;
        }
        
        const scanCommand = new ScanCommand(scanParams);
        const response = await client.send(scanCommand);
        
        if (response.Items && response.Items.length > 0) {
          checkShop = response.Items[0];
          break;
        }
        scanKey = response.LastEvaluatedKey;
      } while (scanKey);
    }

    if (!checkShop) {
      reasons.push(`❌ User does not have a shop - excluded from search`);
    } else {
      console.log(`✅ User has shop: ID=${checkShop.id}, Name=${checkShop.name || checkShop.shopname || 'N/A'}`);

      // 5. Check shop location
      if (!checkShop.lat_log) {
        reasons.push(`❌ Shop does not have location (lat_log) - excluded from search`);
      } else {
        const [checkLat, checkLng] = checkShop.lat_log.split(',').map(Number);
        if (isNaN(checkLat) || isNaN(checkLng)) {
          reasons.push(`❌ Shop location is invalid: "${checkShop.lat_log}"`);
        } else {
          console.log(`✅ Shop location: ${checkLat}, ${checkLng}`);

          // 6. Calculate distance
          const R = 6371; // Earth's radius in km
          const dLat = (checkLat - refLat) * Math.PI / 180;
          const dLng = (checkLng - refLng) * Math.PI / 180;
          const a =
            Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(refLat * Math.PI / 180) * Math.cos(checkLat * Math.PI / 180) *
            Math.sin(dLng / 2) * Math.sin(dLng / 2);
          const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
          const distance = R * c;

          console.log(`📏 Distance from reference user: ${distance.toFixed(2)} km`);

          if (distance > 50) {
            reasons.push(`❌ Distance (${distance.toFixed(2)} km) exceeds 50km radius - excluded from search`);
          } else {
            console.log(`✅ Distance (${distance.toFixed(2)} km) is within 50km radius`);
          }
        }
      }
    }

    // Print summary
    console.log(`\n${'='.repeat(60)}`);
    if (reasons.length === 0) {
      console.log(`✅ User ${checkPhone} should appear in nearby shops!`);
      console.log(`   If it's not showing, there might be a bug in the search logic.`);
    } else {
      console.log(`❌ Reasons why user ${checkPhone} is NOT showing:\n`);
      reasons.forEach((reason, idx) => {
        console.log(`   ${idx + 1}. ${reason}`);
      });
    }
    console.log(`${'='.repeat(60)}\n`);

  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

checkUser();

