/**
 * Script to find nearby 'N' type users for a specific order
 * Usage: node scripts/find-nearby-n-users-for-order.js <orderId> [radius]
 */

const Order = require('../models/Order');
const Customer = require('../models/Customer');
const DeliveryBoy = require('../models/DeliveryBoy');
const User = require('../models/User');
const { getDynamoDBClient } = require('../config/dynamodb');
const { ScanCommand } = require('@aws-sdk/lib-dynamodb');

async function findNearbyNUsers(orderId, radius = 20) {
  try {
    console.log(`\n🔍 Finding nearby 'N' type users for order: ${orderId}`);
    console.log(`📍 Radius: ${radius} km\n`);
    
    // Convert orderId to number if it's a string
    const orderIdNum = typeof orderId === 'string' && !isNaN(orderId) ? parseInt(orderId) : orderId;
    console.log(`   Looking for order ID: ${orderIdNum} (type: ${typeof orderIdNum})\n`);
    
    // Get order details
    const order = await Order.getById(orderIdNum);
    if (!order) {
      console.error(`❌ Order ${orderId} (${orderIdNum}) not found in database`);
      console.error(`   Please check if the order ID is correct.`);
      process.exit(1);
    }
    
    console.log(`✅ Order found: ${order.order_number || order.id}`);
    console.log(`   Customer ID: ${order.customer_id}`);
    console.log(`   Address: ${order.customerdetails || order.customer_address || 'N/A'}\n`);
    
    // Get order location from lat_log or customerdetails
    let orderLat = null;
    let orderLng = null;
    
    if (order.lat_log) {
      const [lat, lng] = order.lat_log.split(',').map(Number);
      if (!isNaN(lat) && !isNaN(lng)) {
        orderLat = lat;
        orderLng = lng;
      }
    }
    
    // If no lat_log, try to get from customer location
    if (!orderLat || !orderLng) {
      if (order.customer_id) {
        try {
          const customer = await Customer.findById(order.customer_id);
          if (customer && customer.lat_log) {
            const [lat, lng] = customer.lat_log.split(',').map(Number);
            if (!isNaN(lat) && !isNaN(lng)) {
              orderLat = lat;
              orderLng = lng;
            }
          }
        } catch (e) {
          console.warn(`⚠️  Could not fetch customer location: ${e.message}`);
        }
      }
    }
    
    if (!orderLat || !orderLng) {
      console.error(`❌ Order location not found. Cannot find nearby users without location data.`);
      console.error(`   Order lat_log: ${order.lat_log || 'N/A'}`);
      process.exit(1);
    }
    
    console.log(`📍 Order location: ${orderLat}, ${orderLng}\n`);
    
    // Find all 'N' type users (new users)
    const client = getDynamoDBClient();
    let lastKey = null;
    const nUsers = [];
    
    do {
      const params = {
        TableName: 'users',
        FilterExpression: 'user_type = :typeN AND (attribute_not_exists(del_status) OR del_status <> :deleted)',
        ExpressionAttributeValues: {
          ':typeN': 'N',
          ':deleted': 2
        }
      };
      
      if (lastKey) {
        params.ExclusiveStartKey = lastKey;
      }
      
      const command = new ScanCommand(params);
      const response = await client.send(command);
      
      if (response.Items) {
        nUsers.push(...response.Items);
      }
      
      lastKey = response.LastEvaluatedKey;
    } while (lastKey);
    
    console.log(`📊 Found ${nUsers.length} 'N' type users in database\n`);
    
    // Batch fetch all customer locations at once (optimization)
    const userIds = nUsers.map(u => u.id);
    console.log(`🔍 Fetching customer locations for ${userIds.length} users...`);
    
    const customers = [];
    const batchSize = 10;
    
    for (let i = 0; i < userIds.length; i += batchSize) {
      const batch = userIds.slice(i, i + batchSize);
      const batchCustomers = await Promise.all(
        batch.map(async (userId) => {
          try {
            return await Customer.findByUserId(userId);
          } catch (err) {
            return null;
          }
        })
      );
      customers.push(...batchCustomers.filter(c => c !== null));
    }
    
    // Create a map of user_id -> customer for quick lookup
    const customerMap = {};
    customers.forEach(c => {
      if (c && c.user_id) {
        customerMap[c.user_id] = c;
      }
    });
    
    console.log(`✅ Found ${customers.length} customer records with locations\n`);
    
    // Calculate distance for each user and filter by radius
    const R = 6371; // Earth's radius in km
    const nearbyUsers = [];
    
    for (const user of nUsers) {
      const customer = customerMap[user.id];
      
      if (customer && customer.lat_log) {
        const [userLat, userLng] = customer.lat_log.split(',').map(Number);
        if (!isNaN(userLat) && !isNaN(userLng)) {
          // Calculate distance using Haversine formula
          const dLat = (userLat - orderLat) * Math.PI / 180;
          const dLng = (userLng - orderLng) * Math.PI / 180;
          const a =
            Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(orderLat * Math.PI / 180) * Math.cos(userLat * Math.PI / 180) *
            Math.sin(dLng / 2) * Math.sin(dLng / 2);
          const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
          const distance = R * c;
          
          if (distance <= parseFloat(radius)) {
            nearbyUsers.push({
              user_id: user.id,
              name: user.name || 'N/A',
              mobile: user.mob_num || 'N/A',
              email: user.email || 'N/A',
              distance: distance.toFixed(2),
              location: customer.lat_log
            });
          }
        }
      }
    }
    
    // Sort by distance
    nearbyUsers.sort((a, b) => parseFloat(a.distance) - parseFloat(b.distance));
    
    console.log(`✅ Found ${nearbyUsers.length} 'N' type users within ${radius} km\n`);
    
    // Check already notified users
    let alreadyNotifiedNUsers = [];
    if (order.nearby_n_vendors) {
      try {
        if (typeof order.nearby_n_vendors === 'string') {
          alreadyNotifiedNUsers = JSON.parse(order.nearby_n_vendors);
        } else {
          alreadyNotifiedNUsers = order.nearby_n_vendors;
        }
        if (!Array.isArray(alreadyNotifiedNUsers)) {
          alreadyNotifiedNUsers = [alreadyNotifiedNUsers];
        }
      } catch (e) {
        console.warn('Error parsing nearby_n_vendors:', e.message);
      }
    }
    
    // Filter already notified
    const alreadyNotifiedIds = new Set(alreadyNotifiedNUsers.map(id => String(id)));
    const newNearbyUsers = nearbyUsers.filter(u => !alreadyNotifiedIds.has(String(u.user_id)));
    
    // Display results
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`📋 NEARBY 'N' TYPE USERS (within ${radius} km)`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    
    if (nearbyUsers.length === 0) {
      console.log('   ❌ No users found within the specified radius.\n');
    } else {
      console.log(`   Total found: ${nearbyUsers.length}`);
      console.log(`   Already notified: ${alreadyNotifiedNUsers.length}`);
      console.log(`   New (not yet notified): ${newNearbyUsers.length}\n`);
      
      console.log('   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log(`   📍 ALL NEARBY USERS (sorted by distance):\n`);
      
      nearbyUsers.forEach((user, index) => {
        const isNotified = alreadyNotifiedIds.has(String(user.user_id));
        const status = isNotified ? '✅ [ALREADY NOTIFIED]' : '🆕 [NEW]';
        console.log(`   ${index + 1}. ${status}`);
        console.log(`      User ID: ${user.user_id}`);
        console.log(`      Name: ${user.name}`);
        console.log(`      Mobile: ${user.mobile}`);
        console.log(`      Email: ${user.email}`);
        console.log(`      Distance: ${user.distance} km`);
        console.log(`      Location: ${user.location}\n`);
      });
      
      if (newNearbyUsers.length > 0) {
        console.log('   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log(`   🆕 NEW USERS (not yet notified):\n`);
        
        newNearbyUsers.forEach((user, index) => {
          console.log(`   ${index + 1}. User ID: ${user.user_id} | Name: ${user.name} | Mobile: ${user.mobile} | Distance: ${user.distance} km`);
        });
        console.log('');
      }
    }
    
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Main execution
const orderId = process.argv[2];
const radius = process.argv[3] || 20;

if (!orderId) {
  console.error('Usage: node scripts/find-nearby-n-users-for-order.js <orderId> [radius]');
  console.error('Example: node scripts/find-nearby-n-users-for-order.js 1768127050664 20');
  process.exit(1);
}

findNearbyNUsers(orderId, radius)
  .then(() => {
    console.log('✅ Done!\n');
    process.exit(0);
  })
  .catch(error => {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  });

