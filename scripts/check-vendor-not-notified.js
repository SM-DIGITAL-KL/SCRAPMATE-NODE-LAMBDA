require('dotenv').config();
const Order = require('../models/Order');
const Shop = require('../models/Shop');
const User = require('../models/User');
const { getDynamoDBClient } = require('../config/dynamodb');
const { ScanCommand } = require('@aws-sdk/lib-dynamodb');

const ORDER_NUMBER = process.argv[2] || '106881290';
const VENDOR_USER_ID = process.argv[3] || '1767360358937';

async function checkVendorNotNotified() {
  try {
    console.log('\n🔍 Investigating Why Vendor Was Not Notified');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    console.log(`Order Number: ${ORDER_NUMBER}`);
    console.log(`Vendor User ID: ${VENDOR_USER_ID}\n`);

    // Find the order
    let orders = await Order.findByOrderNo(parseInt(ORDER_NUMBER));
    if (orders.length === 0 && !isNaN(ORDER_NUMBER)) {
      orders = await Order.findByOrderNo(parseInt(ORDER_NUMBER));
    }
    
    if (orders.length === 0) {
      console.error(`❌ Order not found: ${ORDER_NUMBER}`);
      return;
    }

    const order = orders[0];
    
    console.log('📋 Order Details:');
    console.log(`   Order ID: ${order.id}`);
    console.log(`   Order Number: ${order.order_number}`);
    console.log(`   Customer ID: ${order.customer_id}`);
    console.log(`   Status: ${order.status}`);
    console.log(`   Location: ${order.lat_log || 'Not set'}`);
    console.log(`   Date: ${order.date || 'N/A'}`);
    console.log('');

    // Get notified vendor IDs
    let notifiedVendorIds = [];
    if (order.notified_vendor_ids) {
      try {
        notifiedVendorIds = typeof order.notified_vendor_ids === 'string'
          ? JSON.parse(order.notified_vendor_ids)
          : order.notified_vendor_ids;
        if (!Array.isArray(notifiedVendorIds)) {
          notifiedVendorIds = [notifiedVendorIds];
        }
      } catch (e) {
        console.error('❌ Error parsing notified_vendor_ids:', e.message);
      }
    }

    console.log(`📢 Notified Vendors: ${notifiedVendorIds.length}`);
    notifiedVendorIds.forEach((id, idx) => {
      console.log(`   ${idx + 1}. User ID: ${id}${id == VENDOR_USER_ID ? ' ✅ THIS VENDOR' : ''}`);
    });
    console.log('');

    // Check if vendor is in the list
    const vendorIdNum = parseInt(VENDOR_USER_ID);
    const isNotified = notifiedVendorIds.includes(vendorIdNum) || 
                      notifiedVendorIds.includes(String(vendorIdNum));

    if (isNotified) {
      console.log('✅ Vendor WAS notified! They are in the notified_vendor_ids list.');
      return;
    }

    console.log('❌ Vendor was NOT notified. Investigating reasons...\n');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    // Get vendor user details
    const vendorUser = await User.findById(vendorIdNum);
    if (!vendorUser) {
      console.error(`❌ Vendor user not found: ${VENDOR_USER_ID}`);
      return;
    }

    console.log('👤 Vendor User Details:');
    console.log(`   User ID: ${vendorUser.id}`);
    console.log(`   Name: ${vendorUser.name || 'N/A'}`);
    console.log(`   Phone: ${vendorUser.mob_num || 'N/A'}`);
    console.log(`   User Type: ${vendorUser.user_type || 'N/A'}`);
    console.log(`   App Type: ${vendorUser.app_type || 'N/A'}`);
    console.log(`   Del Status: ${vendorUser.del_status || 1}`);
    console.log(`   FCM Token: ${vendorUser.fcm_token ? 'Present' : 'Missing'}`);
    console.log('');

    // Check if vendor has correct user_type (R or SR)
    const userType = vendorUser.user_type;
    if (userType !== 'R' && userType !== 'SR') {
      console.log(`❌ REASON: User type is '${userType}' but must be 'R' or 'SR' for B2C orders`);
    } else {
      console.log(`✅ User type '${userType}' is correct`);
    }

    // Check if app_type is vendor_app
    const appType = vendorUser.app_type;
    if (appType !== 'vendor_app') {
      console.log(`❌ REASON: App type is '${appType}' but must be 'vendor_app'`);
    } else {
      console.log(`✅ App type '${appType}' is correct`);
    }

    // Check if vendor is deleted
    if (vendorUser.del_status === 2) {
      console.log(`❌ REASON: Vendor is deleted (del_status = 2)`);
    } else {
      console.log(`✅ Vendor is active (del_status = ${vendorUser.del_status || 1})`);
    }

    console.log('');

    // Find vendor's shop
    const client = getDynamoDBClient();
    const shopScanCommand = new ScanCommand({
      TableName: 'shops',
      FilterExpression: 'user_id = :userId',
      ExpressionAttributeValues: {
        ':userId': vendorIdNum
      }
    });

    const shopResponse = await client.send(shopScanCommand);
    const vendorShops = shopResponse.Items || [];

    if (vendorShops.length === 0) {
      console.log('⚠️  Vendor has NO shops in the database');
      console.log('   Note: The system can still find vendors by user_type even without shops,');
      console.log('   but they need to have lat_log set elsewhere or in a deleted shop.');
      console.log('');
    } else {
      console.log(`🏪 Vendor's Shops: ${vendorShops.length}`);
      vendorShops.forEach((shop, idx) => {
        console.log(`\n   Shop ${idx + 1}:`);
        console.log(`      Shop ID: ${shop.id}`);
        console.log(`      Shop Name: ${shop.shopname || 'N/A'}`);
        console.log(`      Shop Type: ${shop.shop_type || 'N/A'}`);
        console.log(`      Del Status: ${shop.del_status || 1}`);
        console.log(`      Location: ${shop.lat_log || 'Not set'}`);

        // Check shop type
        const shopType = shop.shop_type ? (typeof shop.shop_type === 'string' ? parseInt(shop.shop_type) : shop.shop_type) : null;
        if (shopType !== 2 && shopType !== 3) {
          console.log(`      ❌ Shop type ${shopType} is not B2C (must be 2 or 3)`);
        } else {
          console.log(`      ✅ Shop type ${shopType} is B2C`);
        }
      });
      console.log('');
    }

    // Check distance if order and vendor have locations
    let minDistance = Infinity;
    if (order.lat_log && vendorShops.length > 0) {
      const [orderLat, orderLng] = order.lat_log.split(',').map(Number);
      if (!isNaN(orderLat) && !isNaN(orderLng)) {
        console.log('📍 Distance Check:');
        console.log(`   Order Location: ${order.lat_log}`);

        let closestShop = null;

        for (const shop of vendorShops) {
          if (shop.lat_log) {
            const [shopLat, shopLng] = shop.lat_log.split(',').map(Number);
            if (!isNaN(shopLat) && !isNaN(shopLng)) {
              // Calculate distance using Haversine formula
              const R = 6371; // Earth's radius in km
              const dLat = (shopLat - orderLat) * Math.PI / 180;
              const dLng = (shopLng - orderLng) * Math.PI / 180;
              const a =
                Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                Math.cos(orderLat * Math.PI / 180) * Math.cos(shopLat * Math.PI / 180) *
                Math.sin(dLng / 2) * Math.sin(dLng / 2);
              const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
              const distance = R * c;

              if (distance < minDistance) {
                minDistance = distance;
                closestShop = shop;
              }
            }
          }
        }

        const searchRadius = 15; // km (same as order placement logic)
        console.log(`   Closest Shop Location: ${closestShop?.lat_log || 'N/A'}`);
        console.log(`   Distance: ${minDistance !== Infinity ? minDistance.toFixed(2) : 'N/A'} km`);
        console.log(`   Search Radius: ${searchRadius} km`);

        if (minDistance > searchRadius) {
          console.log(`   ❌ REASON: Vendor is ${minDistance.toFixed(2)} km away, which is beyond the ${searchRadius} km radius`);
        } else {
          console.log(`   ✅ Vendor is within ${searchRadius} km radius`);
        }
        console.log('');
      }
    }

    // Summary
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📊 SUMMARY:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`Vendor ${VENDOR_USER_ID} was NOT selected for order ${ORDER_NUMBER} because:`);
    console.log('');
    
    const reasons = [];
    if (userType !== 'R' && userType !== 'SR') {
      reasons.push(`- User type is '${userType}' (must be 'R' or 'SR')`);
    }
    if (appType !== 'vendor_app') {
      reasons.push(`- App type is '${appType}' (must be 'vendor_app')`);
    }
    if (vendorUser.del_status === 2) {
      reasons.push('- Vendor is deleted (del_status = 2)');
    }
    if (vendorShops.length > 0) {
      const hasB2CShop = vendorShops.some(s => {
        const st = s.shop_type ? (typeof s.shop_type === 'string' ? parseInt(s.shop_type) : s.shop_type) : null;
        return st === 2 || st === 3;
      });
      if (!hasB2CShop) {
        reasons.push('- No shops with shop_type 2 or 3 (B2C)');
      }
    }
    if (minDistance !== undefined && minDistance > 15) {
      reasons.push(`- Too far away (${minDistance.toFixed(2)} km, limit is 15 km)`);
    }
    if (vendorShops.length === 0) {
      reasons.push('- No shops found (or no location data)');
    }
    if (reasons.length === 0) {
      reasons.push('- Vendor may have been filtered out due to being beyond top 5 nearest vendors');
      reasons.push('  (Only top 5 nearest B2C vendors within 15km are notified)');
    }

    reasons.forEach((reason, idx) => {
      console.log(`   ${idx + 1}. ${reason}`);
    });

    console.log('\n💡 Note: Only the top 5 nearest B2C vendors within 15km are notified.');
    console.log(`   Current order has ${notifiedVendorIds.length} vendors (may have been manually added).`);
    console.log('');

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
  }
}

// Run the script
checkVendorNotNotified().catch(console.error);
