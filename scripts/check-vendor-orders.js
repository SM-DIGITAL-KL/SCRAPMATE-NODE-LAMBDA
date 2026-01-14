/**
 * Script to check which orders are available for a specific vendor
 * 
 * Usage: node scripts/check-vendor-orders.js [vendor_id]
 * Example: node scripts/check-vendor-orders.js 1767945729183
 */

require('dotenv').config();
const Order = require('../models/Order');
const User = require('../models/User');
const Customer = require('../models/Customer');
const Shop = require('../models/Shop');
const { getDynamoDBClient } = require('../config/dynamodb');
const { ScanCommand } = require('@aws-sdk/lib-dynamodb');

const vendorId = process.argv[2];

if (!vendorId) {
  console.error('❌ Please provide a vendor ID');
  console.error('   Usage: node scripts/check-vendor-orders.js [vendor_id]');
  process.exit(1);
}

// Helper function to calculate distance using Haversine formula
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // Earth's radius in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

async function checkVendorOrders() {
  try {
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🔍 Checking Orders for Vendor');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`Vendor ID: ${vendorId}`);
    console.log('');
    
    // Get vendor details
    const vendor = await User.findById(vendorId);
    if (!vendor) {
      console.error(`❌ Vendor with ID ${vendorId} not found`);
      process.exit(1);
    }
    
    console.log(`✅ Vendor found:`);
    console.log(`   Name: ${vendor.name || 'N/A'}`);
    console.log(`   User Type: ${vendor.user_type || 'N/A'}`);
    console.log(`   App Type: ${vendor.app_type || 'N/A'}`);
    console.log(`   App Version: ${vendor.app_version || 'N/A'}`);
    console.log('');
    
    // Get vendor location (for distance calculation)
    let vendorLat = null;
    let vendorLng = null;
    
    if (vendor.user_type === 'D') {
      // For D type, get from DeliveryBoy table
      const DeliveryBoy = require('../models/DeliveryBoy');
      const deliveryBoy = await DeliveryBoy.findByUserId(vendorId);
      if (deliveryBoy && deliveryBoy.lat_log) {
        const [lat, lng] = deliveryBoy.lat_log.split(',').map(Number);
        if (!isNaN(lat) && !isNaN(lng)) {
          vendorLat = lat;
          vendorLng = lng;
          console.log(`📍 Vendor location (from DeliveryBoy): ${vendorLat}, ${vendorLng}`);
        }
      }
    } else {
      // For R, S, SR types, get from Customer table
      const customer = await Customer.findByUserId(vendorId);
      if (customer && customer.lat_log) {
        const [lat, lng] = customer.lat_log.split(',').map(Number);
        if (!isNaN(lat) && !isNaN(lng)) {
          vendorLat = lat;
          vendorLng = lng;
          console.log(`📍 Vendor location (from Customer): ${vendorLat}, ${vendorLng}`);
        }
      }
    }
    
    if (!vendorLat || !vendorLng) {
      console.log(`⚠️  Vendor location not found - distance-based filtering will be skipped`);
    }
    
    console.log('');
    
    // Get vendor shop_id if applicable
    let vendorShopId = null;
    if (vendor.user_type === 'R' || vendor.user_type === 'S' || vendor.user_type === 'SR') {
      const Shop = require('../models/Shop');
      if (vendor.user_type === 'R') {
        // For R users, find B2C shop (shop_type = 3)
        const allShops = await Shop.findAllByUserId(parseInt(vendorId));
        const b2cShop = allShops.find(s => parseInt(s.shop_type) === 3);
        if (b2cShop && b2cShop.id) {
          vendorShopId = parseInt(b2cShop.id);
          console.log(`🏪 Vendor B2C Shop ID: ${vendorShopId}`);
        }
      } else {
        const shop = await Shop.findByUserId(parseInt(vendorId));
        if (shop && shop.id) {
          vendorShopId = parseInt(shop.id);
          console.log(`🏪 Vendor Shop ID: ${vendorShopId}`);
        }
      }
    }
    
    console.log('');
    
    // Get all orders with status = 1 (Scheduled/pending)
    console.log(`📦 Fetching all orders with status = 1 (Scheduled)...`);
    const client = getDynamoDBClient();
    
    let allOrders = [];
    let lastKey = null;
    
    do {
      const params = {
        TableName: 'orders',
        FilterExpression: '#status = :status',
        ExpressionAttributeNames: { '#status': 'status' },
        ExpressionAttributeValues: { ':status': 1 }
      };
      if (lastKey) params.ExclusiveStartKey = lastKey;
      
      const command = new ScanCommand(params);
      const response = await client.send(command);
      if (response.Items) allOrders.push(...response.Items);
      lastKey = response.LastEvaluatedKey;
    } while (lastKey);
    
    console.log(`✅ Found ${allOrders.length} orders with status = 1`);
    console.log('');
    
    // Filter orders that should be shown to this vendor
    const availableOrders = [];
    const notifiedOrders = [];
    const distanceBasedOrders = [];
    const shopAssignedOrders = [];
    
    for (const order of allOrders) {
      let isAvailable = false;
      let reason = '';
      
      // Check if vendor is in notified_vendor_ids
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
          console.warn(`   Warning: Could not parse notified_vendor_ids for order ${order.id}`);
        }
      }
      
      // Convert to numbers for comparison
      const notifiedIds = notifiedVendorIds.map(id => parseInt(id));
      const vendorIdNum = parseInt(vendorId);
      
      // Priority 1: If vendor is in notified_vendor_ids, always show the order
      if (notifiedIds.includes(vendorIdNum)) {
        isAvailable = true;
        reason = 'notified';
        notifiedOrders.push({ order, reason });
      }
      // Priority 2: If order is assigned to vendor's shop_id
      else if (order.shop_id && vendorShopId && parseInt(order.shop_id) === vendorShopId) {
        isAvailable = true;
        reason = 'shop_assigned';
        shopAssignedOrders.push({ order, reason });
      }
      // Priority 3: Distance-based filtering (if vendor has location)
      else if (vendorLat && vendorLng && order.lat_log) {
        try {
          const [orderLat, orderLng] = order.lat_log.split(',').map(Number);
          if (!isNaN(orderLat) && !isNaN(orderLng)) {
            const distance = calculateDistance(vendorLat, vendorLng, orderLat, orderLng);
            
            // Default radius is 10 km for B2C dashboard
            if (distance <= 10) {
              isAvailable = true;
              reason = `distance_${distance.toFixed(2)}km`;
              distanceBasedOrders.push({ order, reason, distance });
            }
          }
        } catch (e) {
          // Skip if location parsing fails
        }
      }
      
      if (isAvailable) {
        availableOrders.push({ order, reason });
      }
    }
    
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📊 Summary');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`Total orders with status = 1: ${allOrders.length}`);
    console.log(`Available orders for vendor: ${availableOrders.length}`);
    console.log(`   - Notified (in notified_vendor_ids): ${notifiedOrders.length}`);
    console.log(`   - Shop assigned (shop_id match): ${shopAssignedOrders.length}`);
    console.log(`   - Distance-based (within 10 km): ${distanceBasedOrders.length}`);
    console.log('');
    
    if (availableOrders.length > 0) {
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('📋 Available Orders');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      
      // Group by reason
      const byReason = {
        notified: [],
        shop_assigned: [],
        distance: []
      };
      
      availableOrders.forEach(({ order, reason }) => {
        if (reason === 'notified') {
          byReason.notified.push(order);
        } else if (reason === 'shop_assigned') {
          byReason.shop_assigned.push(order);
        } else if (reason.startsWith('distance_')) {
          byReason.distance.push({ order, distance: parseFloat(reason.split('_')[1].replace('km', '')) });
        }
      });
      
      // Show notified orders first (highest priority)
      if (byReason.notified.length > 0) {
        console.log(`\n✅ Notified Orders (${byReason.notified.length}):`);
        byReason.notified.forEach((order, idx) => {
          console.log(`   ${idx + 1}. Order ID: ${order.id}`);
          console.log(`      Order #: ${order.order_number || order.order_no || 'N/A'}`);
          console.log(`      Customer ID: ${order.customer_id || 'N/A'}`);
          console.log(`      Amount: ₹${order.estim_price || order.estimated_price || 0}`);
          console.log(`      Address: ${order.address || order.customerdetails || 'N/A'}`);
          console.log(`      Reason: ✅ Vendor is in notified_vendor_ids`);
        });
      }
      
      // Show shop-assigned orders
      if (byReason.shop_assigned.length > 0) {
        console.log(`\n🏪 Shop-Assigned Orders (${byReason.shop_assigned.length}):`);
        byReason.shop_assigned.forEach((order, idx) => {
          console.log(`   ${idx + 1}. Order ID: ${order.id}`);
          console.log(`      Order #: ${order.order_number || order.order_no || 'N/A'}`);
          console.log(`      Shop ID: ${order.shop_id}`);
          console.log(`      Amount: ₹${order.estim_price || order.estimated_price || 0}`);
          console.log(`      Reason: ✅ Order is assigned to vendor's shop`);
        });
      }
      
      // Show distance-based orders
      if (byReason.distance.length > 0) {
        console.log(`\n📍 Distance-Based Orders (within 10 km) (${byReason.distance.length}):`);
        byReason.distance
          .sort((a, b) => a.distance - b.distance)
          .forEach(({ order, distance }, idx) => {
            console.log(`   ${idx + 1}. Order ID: ${order.id}`);
            console.log(`      Order #: ${order.order_number || order.order_no || 'N/A'}`);
            console.log(`      Distance: ${distance.toFixed(2)} km`);
            console.log(`      Amount: ₹${order.estim_price || order.estimated_price || 0}`);
            console.log(`      Address: ${order.address || order.customerdetails || 'N/A'}`);
            console.log(`      Reason: ✅ Order is within 10 km of vendor location`);
          });
      }
    } else {
      console.log('⚠️  No orders are available for this vendor');
      console.log('');
      console.log('💡 Reasons why orders might not be shown:');
      console.log('   1. Vendor is not in any order\'s notified_vendor_ids');
      console.log('   2. No orders are assigned to vendor\'s shop_id');
      console.log('   3. Vendor location is not set (distance filtering requires location)');
      console.log('   4. No orders are within 10 km of vendor location');
      console.log('   5. All orders have status != 1 (already accepted/completed)');
    }
    
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
  } catch (error) {
    console.error('❌ Error:', error);
    console.error('   Message:', error.message);
    console.error('   Stack:', error.stack);
    process.exit(1);
  }
}

checkVendorOrders();

