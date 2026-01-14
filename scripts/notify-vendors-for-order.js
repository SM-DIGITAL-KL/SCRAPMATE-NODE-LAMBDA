/**
 * Notify vendors about an existing order
 * Usage: node scripts/notify-vendors-for-order.js <order_id>
 * Example: node scripts/notify-vendors-for-order.js 1767969553265
 */

require('dotenv').config();
const { getDynamoDBClient } = require('../config/dynamodb');
const { GetCommand, ScanCommand, UpdateCommand } = require('@aws-sdk/lib-dynamodb');
const Shop = require('../models/Shop');
const User = require('../models/User');
const { sendVendorNotification } = require('../utils/fcmNotification');

const ORDER_ID = process.argv[2];

if (!ORDER_ID) {
  console.error('❌ Please provide an order ID');
  console.log('Usage: node scripts/notify-vendors-for-order.js <order_id>');
  process.exit(1);
}

async function notifyVendorsForOrder() {
  try {
    console.log('\n📤 Notifying Vendors for Order');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    console.log(`Order ID: ${ORDER_ID}\n`);

    const client = getDynamoDBClient();
    const orderId = typeof ORDER_ID === 'string' && !isNaN(ORDER_ID) ? parseInt(ORDER_ID) : ORDER_ID;

    // Get order details
    const getCommand = new GetCommand({
      TableName: 'orders',
      Key: { id: orderId }
    });

    const orderResponse = await client.send(getCommand);
    if (!orderResponse.Item) {
      console.error(`❌ Order not found for ID: ${ORDER_ID}`);
      return;
    }

    const order = orderResponse.Item;
    console.log('✅ Order found:');
    console.log(`   Order ID: ${order.id}`);
    console.log(`   Order Number: ${order.order_number || order.order_no || 'N/A'}`);
    console.log(`   Customer ID: ${order.customer_id || 'N/A'}`);
    console.log(`   Status: ${order.status || 'N/A'}`);
    console.log(`   Address: ${order.address || order.customerdetails || 'N/A'}`);
    console.log(`   Location: ${order.lat_log || 'N/A'}`);
    console.log('');

    // Check if order has location
    if (!order.lat_log) {
      console.error('❌ Order does not have location (lat_log). Cannot find nearby vendors.');
      return;
    }

    // Parse location
    const [lat, lng] = order.lat_log.split(',').map(Number);
    if (isNaN(lat) || isNaN(lng)) {
      console.error(`❌ Invalid location format: ${order.lat_log}`);
      console.log('   Expected format: "latitude,longitude"');
      return;
    }

    console.log(`📍 Order Location: ${lat}, ${lng}`);
    console.log('');

    // Find nearby vendors (same logic as placePickupRequest)
    const searchRadius = 15; // km
    console.log(`🔍 Finding B2C vendors within ${searchRadius}km radius...`);

    // Search for nearby shops
    const nearbyShops = await Shop.getShopsByLocation(lat, lng, searchRadius);
    
    // Filter for B2C vendors (shop_type 2 = Retailer/Door Step Buyer, shop_type 3 = Retailer B2C)
    const b2cShops = nearbyShops.filter(shop => {
      const shopType = typeof shop.shop_type === 'string' ? parseInt(shop.shop_type) : shop.shop_type;
      return shopType === 2 || shopType === 3; // B2C vendors
    });

    // Get top 5 nearest B2C vendors from shop-based search
    const shopBasedVendors = b2cShops.slice(0, 5).map(v => ({
      user_id: v.user_id,
      shop_id: v.id,
      distance: v.distance
    }));

    console.log(`   Found ${shopBasedVendors.length} vendor(s) from shop-based search`);

    // Also find B2C vendors directly by user_type (R or SR) and app_type (vendor_app)
    const userBasedVendors = [];

    try {
      // Find all vendor_app users with user_type R or SR
      let allVendorUsers = [];
      let lastKey = null;

      do {
        const userParams = {
          TableName: 'users',
          FilterExpression: 'app_type = :appType AND (user_type = :typeR OR user_type = :typeSR) AND (attribute_not_exists(del_status) OR del_status <> :deleted)',
          ExpressionAttributeValues: {
            ':appType': 'vendor_app',
            ':typeR': 'R',
            ':typeSR': 'SR',
            ':deleted': 2
          }
        };

        if (lastKey) {
          userParams.ExclusiveStartKey = lastKey;
        }

        const userCommand = new ScanCommand(userParams);
        const userResponse = await client.send(userCommand);

        if (userResponse.Items) {
          allVendorUsers.push(...userResponse.Items);
        }

        lastKey = userResponse.LastEvaluatedKey;
      } while (lastKey);

      console.log(`   Found ${allVendorUsers.length} vendor_app users with type R or SR`);

      // For each vendor user, check if they have a shop and calculate distance
      for (const vendorUser of allVendorUsers) {
        try {
          // Try to find shop for this vendor (including shops with del_status = 2)
          const shopScanCommand = new ScanCommand({
            TableName: 'shops',
            FilterExpression: 'user_id = :userId',
            ExpressionAttributeValues: {
              ':userId': parseInt(vendorUser.id)
            }
          });

          const shopResponse = await client.send(shopScanCommand);
          const vendorShops = shopResponse.Items || [];
          const vendorShop = vendorShops.length > 0 ? vendorShops[0] : null;

          if (vendorShop && vendorShop.lat_log) {
            // Calculate distance
            const [shopLat, shopLng] = vendorShop.lat_log.split(',').map(Number);
            if (shopLat && shopLng) {
              const R = 6371; // Earth's radius in km
              const dLat = (shopLat - lat) * Math.PI / 180;
              const dLng = (shopLng - lng) * Math.PI / 180;
              const a =
                Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                Math.cos(lat * Math.PI / 180) * Math.cos(shopLat * Math.PI / 180) *
                Math.sin(dLng / 2) * Math.sin(dLng / 2);
              const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
              const distance = R * c;

              if (distance <= searchRadius) {
                // Check if shop is B2C type (2 or 3), or if no shop type, include vendor anyway
                const shopType = vendorShop.shop_type ? (typeof vendorShop.shop_type === 'string' ? parseInt(vendorShop.shop_type) : vendorShop.shop_type) : null;
                if (!shopType || shopType === 2 || shopType === 3) {
                  userBasedVendors.push({
                    user_id: vendorUser.id,
                    shop_id: vendorShop.id,
                    distance: distance,
                    shop_type: shopType,
                    del_status: vendorShop.del_status || 1
                  });
                }
              }
            }
          }
        } catch (vendorError) {
          console.error(`   ❌ Error processing vendor ${vendorUser.id}:`, vendorError.message);
        }
      }

      console.log(`   Found ${userBasedVendors.length} vendor(s) from user-based search`);
    } catch (userSearchError) {
      console.error('❌ Error finding vendors by user_type:', userSearchError);
    }

    // Combine shop-based and user-based vendors, avoiding duplicates, sort by distance, take top 5
    const allVendorsMap = new Map();

    // Add shop-based vendors first
    for (const vendor of shopBasedVendors) {
      const userId = parseInt(vendor.user_id);
      if (!allVendorsMap.has(userId) || allVendorsMap.get(userId).distance > vendor.distance) {
        allVendorsMap.set(userId, vendor);
      }
    }

    // Add user-based vendors
    for (const vendor of userBasedVendors) {
      const userId = parseInt(vendor.user_id);
      if (!allVendorsMap.has(userId) || allVendorsMap.get(userId).distance > vendor.distance) {
        allVendorsMap.set(userId, vendor);
      }
    }

    // Convert to array, sort by distance, take top 5
    const allVendors = Array.from(allVendorsMap.values())
      .sort((a, b) => (a.distance || 999) - (b.distance || 999))
      .slice(0, 5);

    if (allVendors.length === 0) {
      console.log(`⚠️  No B2C vendors found within ${searchRadius}km radius.`);
      return;
    }

    console.log(`\n✅ Found ${allVendors.length} B2C vendor(s) to notify:`);
    allVendors.forEach((v, index) => {
      console.log(`   ${index + 1}. User ID: ${v.user_id}, Shop ID: ${v.shop_id || 'none'}, Distance: ${v.distance?.toFixed(2) || 'N/A'} km`);
    });
    console.log('');

    // Parse order details for notification
    let orderDetailsText = 'New pickup request';
    try {
      const orderDetailsObj = typeof order.orderdetails === 'string'
        ? JSON.parse(order.orderdetails)
        : order.orderdetails;

      if (orderDetailsObj && Array.isArray(orderDetailsObj) && orderDetailsObj.length > 0) {
        const materialCount = orderDetailsObj.length;
        const totalQty = orderDetailsObj.reduce((sum, item) => {
          const qty = parseFloat(item.expected_weight_kg || item.quantity || item.qty || 0);
          return sum + qty;
        }, 0);
        orderDetailsText = `${materialCount} material(s), ${totalQty} kg`;
      } else if (orderDetailsObj && orderDetailsObj.orders) {
        // Handle nested structure
        const materials = [];
        Object.keys(orderDetailsObj.orders).forEach(category => {
          if (Array.isArray(orderDetailsObj.orders[category])) {
            materials.push(...orderDetailsObj.orders[category]);
          }
        });
        const materialCount = materials.length;
        const totalQty = materials.reduce((sum, item) => {
          const qty = parseFloat(item.approximate_weight || item.expected_weight_kg || item.quantity || item.qty || 0);
          return sum + qty;
        }, 0);
        orderDetailsText = `${materialCount} material(s), ${totalQty} kg`;
      }
    } catch (parseErr) {
      console.warn('⚠️  Could not parse order details for notification:', parseErr.message);
    }

    // Create notification content
    const notificationTitle = `📦 New Pickup Request #${order.order_number || order.order_no || order.id}`;
    const addressPreview = order.customerdetails || order.address
      ? ((order.customerdetails || order.address).length > 50
        ? (order.customerdetails || order.address).substring(0, 50) + '...'
        : (order.customerdetails || order.address))
      : 'Address not provided';
    const notificationBody = `${orderDetailsText} | Weight: ${order.estim_weight || 0} kg | Price: ₹${order.estim_price || 0} | ${addressPreview}`;

    console.log('📤 Sending notifications...');
    console.log(`   Title: ${notificationTitle}`);
    console.log(`   Body: ${notificationBody}`);
    console.log('');

    // Send notification to each vendor
    const notificationPromises = allVendors.map(async (vendor) => {
      try {
        const vendorUser = await User.findById(parseInt(vendor.user_id));

        if (vendorUser && vendorUser.fcm_token) {
          await sendVendorNotification(
            vendorUser.fcm_token,
            notificationTitle,
            notificationBody,
            {
              type: 'pickup_request',
              order_id: order.id.toString(),
              order_number: (order.order_number || order.order_no || order.id).toString(),
              customer_id: (order.customer_id || '').toString(),
              status: (order.status || '1').toString(), // pending - available for acceptance
              timestamp: new Date().toISOString()
            }
          );

          console.log(`✅ Notification sent to vendor (User ID: ${vendor.user_id}, Distance: ${vendor.distance?.toFixed(2) || 'N/A'} km)`);
          return { success: true, user_id: vendor.user_id, distance: vendor.distance };
        } else {
          console.warn(`⚠️  Vendor user (User ID: ${vendor.user_id}) not found or has no FCM token`);
          return { success: false, user_id: vendor.user_id, reason: 'no_fcm_token' };
        }
      } catch (err) {
        console.error(`❌ Error sending notification to vendor (User ID: ${vendor.user_id}):`, err.message);
        return { success: false, user_id: vendor.user_id, error: err.message };
      }
    });

    // Wait for all notifications to be sent
    const results = await Promise.allSettled(notificationPromises);
    const successful = results.filter(r => r.status === 'fulfilled' && r.value?.success);
    const failed = results.filter(r => r.status === 'rejected' || (r.status === 'fulfilled' && !r.value?.success));

    // Collect successfully notified vendor IDs and shop IDs
    const notifiedVendorIds = successful.map(r => parseInt(r.value.user_id));
    const notifiedShopIds = allVendors
      .filter(v => notifiedVendorIds.includes(parseInt(v.user_id)) && v.shop_id)
      .map(v => parseInt(v.shop_id));

    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📊 Notification Summary:');
    console.log(`   ✅ Successfully sent: ${successful.length}/${allVendors.length}`);
    if (failed.length > 0) {
      console.log(`   ❌ Failed: ${failed.length}/${allVendors.length}`);
    }
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    // Update order with notified vendor IDs and shop IDs
    if (notifiedVendorIds.length > 0) {
      try {
        console.log('💾 Saving notified vendor IDs to order record...');
        console.log(`   Notified Vendor IDs: ${notifiedVendorIds.join(', ')}`);
        console.log(`   Notified Shop IDs: ${notifiedShopIds.length > 0 ? notifiedShopIds.join(', ') : 'none'}`);

        const updateExpression = 'SET notified_vendor_ids = :vendorIds, notified_shop_ids = :shopIds, updated_at = :updatedAt';
        const expressionAttributeValues = {
          ':vendorIds': notifiedVendorIds.length > 0 ? JSON.stringify(notifiedVendorIds) : null,
          ':shopIds': notifiedShopIds.length > 0 ? JSON.stringify(notifiedShopIds) : null,
          ':updatedAt': new Date().toISOString()
        };

        const updateCommand = new UpdateCommand({
          TableName: 'orders',
          Key: { id: orderId },
          UpdateExpression: updateExpression,
          ExpressionAttributeValues: expressionAttributeValues
        });

        await client.send(updateCommand);
        console.log('✅ Successfully saved notified vendor IDs to order record');
        console.log('');
      } catch (updateError) {
        console.error('❌ Error updating order with notified vendor IDs:', updateError.message);
        console.error('   Notifications were sent, but vendor IDs were not saved to database');
      }
    } else {
      console.log('⚠️  No vendors were successfully notified, skipping database update');
    }

  } catch (error) {
    console.error('\n❌ Error:', error);
    console.error('   Stack:', error.stack);
    process.exit(1);
  }
}

// Run the script
notifyVendorsForOrder().catch(console.error);

