/**
 * Check why vendor 9074135121 didn't receive notification/SMS for order 106881300
 */

require('dotenv').config();
const User = require('../models/User');
const Shop = require('../models/Shop');
const Order = require('../models/Order');

const VENDOR_PHONE = '9074135121';
const ORDER_NUMBER = '106881300';

// Haversine formula to calculate distance
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // Earth's radius in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c; // Distance in km
}

async function checkVendor() {
  try {
    console.log('\n🔍 Checking why vendor 9074135121 didn\'t receive notification/SMS');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    // 1. Find vendor user
    console.log('1️⃣  Finding vendor user by phone...');
    const vendorUsers = await User.findAllByMobile(VENDOR_PHONE);
    if (!vendorUsers || vendorUsers.length === 0) {
      console.error('❌ No user found with phone:', VENDOR_PHONE);
      return;
    }

    // Find vendor_app user
    const vendorUser = vendorUsers.find(u => 
      u.app_type === 'vendor_app' && 
      (u.del_status !== 2 || !u.del_status)
    );

    if (!vendorUser) {
      console.error('❌ No vendor_app user found with phone:', VENDOR_PHONE);
      console.log('   Found users:', vendorUsers.map(u => ({
        id: u.id,
        app_type: u.app_type,
        user_type: u.user_type,
        del_status: u.del_status
      })));
      return;
    }

    console.log('✅ Vendor user found:');
    console.log(`   User ID: ${vendorUser.id}`);
    console.log(`   Name: ${vendorUser.name || 'N/A'}`);
    console.log(`   Phone: ${vendorUser.mob_num || 'N/A'}`);
    console.log(`   User Type: ${vendorUser.user_type || 'N/A'}`);
    console.log(`   App Type: ${vendorUser.app_type || 'N/A'}`);
    console.log(`   FCM Token: ${vendorUser.fcm_token ? 'Present' : 'Missing'}`);
    console.log('');

    // 2. Find vendor shop
    console.log('2️⃣  Finding vendor shop...');
    const shops = await Shop.findByUserId(vendorUser.id);
    const shopsArray = Array.isArray(shops) ? shops : (shops ? [shops] : []);
    const activeShop = shopsArray.find(s => s.del_status === 1);
    
    if (!activeShop) {
      console.error('❌ No active shop found for vendor');
      if (shopsArray.length > 0) {
        console.log('   Found shops:', shopsArray.map(s => ({
          id: s.id,
          shop_type: s.shop_type,
          del_status: s.del_status,
          lat_log: s.lat_log ? 'Present' : 'Missing'
        })));
      } else {
        console.log('   No shops found for this vendor');
      }
      console.log('');
      console.log('⚠️  Without an active shop, vendor may not be included in search');
      console.log('   The code searches for shops first, then matches to users');
      return;
    }

    console.log('✅ Shop found:');
    console.log(`   Shop ID: ${activeShop.id}`);
    console.log(`   Shop Type: ${activeShop.shop_type || 'N/A'}`);
    console.log(`   Location: ${activeShop.lat_log || 'Missing'}`);
    console.log('');

    // 3. Check shop type (must be 2 or 3 for B2C)
    const shopType = typeof activeShop.shop_type === 'string' 
      ? parseInt(activeShop.shop_type) 
      : activeShop.shop_type;
    
    if (shopType !== 2 && shopType !== 3) {
      console.error(`❌ Shop type is ${shopType}, but B2C vendors must have shop_type 2 or 3`);
      console.log('   This vendor will NOT receive B2C pickup requests');
      console.log('   Shop types: 2 = Retailer/Door Step Buyer, 3 = Retailer B2C');
      return;
    }

    console.log('✅ Shop type is valid for B2C (shop_type:', shopType, ')');
    console.log('');

    // 4. Check order details
    console.log('3️⃣  Checking order details...');
    const orders = await Order.findByOrderNo(ORDER_NUMBER);
    if (!orders || orders.length === 0) {
      console.error('❌ Order not found:', ORDER_NUMBER);
      return;
    }

    const order = orders[0];
    console.log('✅ Order found:');
    console.log(`   Order ID: ${order.id}`);
    console.log(`   Order Number: ${order.order_number || order.order_no}`);
    console.log(`   Customer ID: ${order.customer_id}`);
    console.log(`   Location: ${order.lat_log || 'Missing'}`);
    console.log(`   Notified Vendor IDs: ${order.notified_vendor_ids || 'None'}`);
    console.log('');

    // 5. Check if vendor is in notified list
    const notifiedVendorIds = order.notified_vendor_ids 
      ? (typeof order.notified_vendor_ids === 'string' 
          ? JSON.parse(order.notified_vendor_ids) 
          : order.notified_vendor_ids)
      : [];
    
    const isNotified = notifiedVendorIds.includes(vendorUser.id) || 
                       notifiedVendorIds.includes(String(vendorUser.id)) ||
                       notifiedVendorIds.includes(Number(vendorUser.id));

    if (isNotified) {
      console.log('✅ Vendor IS in notified_vendor_ids list');
    } else {
      console.error('❌ Vendor is NOT in notified_vendor_ids list');
      console.log(`   Notified vendor IDs: ${notifiedVendorIds.join(', ')}`);
      console.log(`   Vendor user ID: ${vendorUser.id}`);
    }
    console.log('');

    // 6. Check distance if both have locations
    if (activeShop.lat_log && order.lat_log) {
      console.log('4️⃣  Calculating distance...');
      const [shopLat, shopLng] = activeShop.lat_log.split(',').map(Number);
      const [orderLat, orderLng] = order.lat_log.split(',').map(Number);
      
      if (shopLat && shopLng && orderLat && orderLng) {
        const distance = calculateDistance(orderLat, orderLng, shopLat, shopLng);
        console.log(`   Distance: ${distance.toFixed(2)} km`);
        console.log(`   Order location: ${orderLat}, ${orderLng}`);
        console.log(`   Shop location: ${shopLat}, ${shopLng}`);
        
        if (distance > 15) {
          console.error(`❌ Vendor is ${distance.toFixed(2)} km away, which is beyond 15 km radius`);
          console.log('   If other vendors were found within 15km, this vendor won\'t be notified');
        } else {
          console.log(`✅ Vendor is within 15km radius (${distance.toFixed(2)} km)`);
        }
      } else {
        console.warn('⚠️  Could not parse locations');
      }
    } else {
      console.warn('⚠️  Missing location data:');
      if (!activeShop.lat_log) console.warn('   - Shop location missing');
      if (!order.lat_log) console.warn('   - Order location missing');
    }
    console.log('');

    // 7. Check user type
    console.log('5️⃣  Checking user type...');
    const userType = vendorUser.user_type;
    if (userType === 'R' || userType === 'SR') {
      console.log(`✅ User type is ${userType} (valid for B2C orders)`);
    } else {
      console.warn(`⚠️  User type is ${userType}, expected R or SR for B2C vendors`);
      console.log('   The code filters for user_type R or SR');
    }
    console.log('');

    // Summary
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📊 SUMMARY:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    const issues = [];
    if (!isNotified) {
      issues.push('❌ Not in notified_vendor_ids list');
    }
    if (shopType !== 2 && shopType !== 3) {
      issues.push(`❌ Shop type ${shopType} (must be 2 or 3)`);
    }
    if (userType !== 'R' && userType !== 'SR') {
      issues.push(`⚠️  User type ${userType} (expected R or SR)`);
    }
    if (activeShop.lat_log && order.lat_log) {
      const [shopLat, shopLng] = activeShop.lat_log.split(',').map(Number);
      const [orderLat, orderLng] = order.lat_log.split(',').map(Number);
      if (shopLat && shopLng && orderLat && orderLng) {
        const distance = calculateDistance(orderLat, orderLng, shopLat, shopLng);
        if (distance > 15) {
          issues.push(`❌ Distance ${distance.toFixed(2)}km (beyond 15km)`);
        }
      }
    }
    if (!vendorUser.fcm_token) {
      issues.push('⚠️  No FCM token (won\'t receive push notifications)');
    }
    if (!activeShop.lat_log) {
      issues.push('⚠️  Shop location missing (distance check will fail)');
    }

    if (issues.length === 0) {
      console.log('✅ All checks passed! Vendor should have been notified.');
      console.log('   If vendor still didn\'t receive notification, check:');
      console.log('   - CloudWatch logs for SMS/notification errors');
      console.log('   - FCM token validity');
      console.log('   - Order placement time vs vendor availability');
    } else {
      console.log('❌ Issues found:');
      issues.forEach(issue => console.log(`   ${issue}`));
    }
    console.log('');

  } catch (error) {
    console.error('❌ Error:', error);
    console.error('   Stack:', error.stack);
  }
}

checkVendor();
