require('dotenv').config();
const Order = require('../models/Order');
const Shop = require('../models/Shop');
const User = require('../models/User');

const ORDER_NUMBER = process.argv[2] || '106881213';

async function checkOrderAcceptanceFlow() {
  try {
    console.log('\n🔍 Investigating Order Acceptance Flow');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    console.log(`Order Number: ${ORDER_NUMBER}\n`);

    // Find the order
    const orders = await Order.findByOrderNo(parseInt(ORDER_NUMBER));
    if (!orders || orders.length === 0) {
      console.error(`❌ Order not found: ${ORDER_NUMBER}`);
      return;
    }

    const order = orders[0];
    
    console.log('📋 Order Details:');
    console.log(`   Order ID: ${order.id}`);
    console.log(`   Order Number: ${order.order_number}`);
    console.log(`   Status: ${order.status}`);
    console.log(`   Shop ID: ${order.shop_id || 'Not assigned'}`);
    console.log(`   Created At: ${order.created_at}`);
    if (order.accepted_at) {
      console.log(`   Accepted At: ${order.accepted_at}`);
    }
    console.log('');

    // Check notified vendor IDs
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
        console.error('Error parsing notified_vendor_ids:', e);
      }
    }

    console.log('📢 Notified Vendor IDs (from notified_vendor_ids field):');
    if (notifiedVendorIds.length === 0) {
      console.log('   (None - no vendors were notified)');
    } else {
      notifiedVendorIds.forEach((id, idx) => {
        console.log(`   ${idx + 1}. User ID: ${id}`);
      });
    }
    console.log('');

    // Find who accepted it
    if (order.shop_id) {
      const shop = await Shop.findById(order.shop_id);
      if (shop) {
        console.log('✅ Vendor Who Accepted:');
        console.log(`   Shop ID: ${shop.id}`);
        console.log(`   Shop Name: ${shop.shopname || 'N/A'}`);
        console.log(`   Vendor User ID: ${shop.user_id || 'N/A'}`);
        console.log('');

        if (shop.user_id) {
          const vendorUser = await User.findById(shop.user_id);
          if (vendorUser) {
            console.log('   Vendor Details:');
            console.log(`   - User ID: ${vendorUser.id}`);
            console.log(`   - Name: ${vendorUser.name || 'N/A'}`);
            console.log(`   - Phone: ${vendorUser.mob_num || 'N/A'}`);
            console.log(`   - User Type: ${vendorUser.user_type || 'N/A'}`);
            console.log('');

            // Check if this vendor was in the notified list
            const wasNotified = notifiedVendorIds.includes(vendorUser.id) || 
                               notifiedVendorIds.includes(parseInt(vendorUser.id)) ||
                               notifiedVendorIds.includes(String(vendorUser.id));
            
            console.log('🔍 Analysis:');
            console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
            if (wasNotified) {
              console.log('✅ This vendor WAS in the notified_vendor_ids list');
              console.log('   → They received a notification and accepted the order');
            } else {
              console.log('⚠️  This vendor was NOT in the notified_vendor_ids list');
              console.log('');
              console.log('💡 How did they get the order?');
              console.log('');
              console.log('   The getAvailablePickupRequests API shows ALL unassigned orders');
              console.log('   (status = 1, shop_id = null) to ANY vendor, regardless of');
              console.log('   whether they were in the notified_vendor_ids list.');
              console.log('');
              console.log('   The notified_vendor_ids field is only used for:');
              console.log('   1. Sending FCM push notifications to specific vendors');
              console.log('   2. Tracking which vendors were notified');
              console.log('');
              console.log('   But any vendor can browse and accept available orders');
              console.log('   through the "Available Pickup Requests" feature.');
              console.log('');
              console.log('   So this vendor likely:');
              console.log('   1. Opened the vendor app');
              console.log('   2. Viewed "Available Pickup Requests"');
              console.log('   3. Saw this order (because it was unassigned)');
              console.log('   4. Accepted it');
            }
          }
        }
      }
    } else {
      console.log('ℹ️  Order has not been accepted yet (no shop_id)');
    }

    console.log('\n✅ Done!\n');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

checkOrderAcceptanceFlow();


