/**
 * Find vendors from bulk_message_notifications that are near an order location
 * Usage: node scripts/find-vendors-nearby-order.js <order_number>
 * Example: node scripts/find-vendors-nearby-order.js 106881275
 */

require('dotenv').config();
const { loadEnvFromFile } = require('../utils/loadEnv');
loadEnvFromFile();

const Order = require('../models/Order');
const BulkMessageNotification = require('../models/BulkMessageNotification');
const { getDynamoDBClient } = require('../config/dynamodb');
const { ScanCommand } = require('@aws-sdk/lib-dynamodb');

// Haversine formula to calculate distance between two coordinates
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

// Function to normalize city name for comparison
function normalizeCityName(city) {
  if (!city) return '';
  return city.toLowerCase()
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// Function to check if city names are similar
function isSimilarCity(city1, city2) {
  if (!city1 || !city2) return false;
  const norm1 = normalizeCityName(city1);
  const norm2 = normalizeCityName(city2);
  
  // Exact match
  if (norm1 === norm2) return true;
  
  // One contains the other (e.g., "Thiruvananthapuram" and "Trivandrum")
  if (norm1.includes(norm2) || norm2.includes(norm1)) return true;
  
  // Common abbreviations
  const aliases = {
    'thiruvananthapuram': ['trivandrum', 'tvm'],
    'trivandrum': ['thiruvananthapuram', 'tvm'],
    'tvm': ['thiruvananthapuram', 'trivandrum']
  };
  
  for (const [key, values] of Object.entries(aliases)) {
    if ((norm1 === key && values.includes(norm2)) || 
        (norm2 === key && values.includes(norm1))) {
      return true;
    }
  }
  
  return false;
}

async function findVendorsNearbyOrder() {
  try {
    const orderNumber = process.argv[2];
    
    if (!orderNumber) {
      console.error('❌ Please provide an order number');
      console.log('Usage: node scripts/find-vendors-nearby-order.js <order_number>');
      process.exit(1);
    }
    
    console.log(`🔍 Finding vendors near order ${orderNumber}...\n`);
    
    // Get order by order number
    const orders = await Order.findByOrderNo(parseInt(orderNumber));
    if (!orders || orders.length === 0) {
      console.error(`❌ Order ${orderNumber} not found`);
      process.exit(1);
    }
    
    const order = orders[0];
    console.log(`✅ Order found: ${order.id}`);
    console.log(`   Order #: ${order.order_number}`);
    console.log(`   Customer Address: ${order.customerdetails || order.customer_address || 'N/A'}`);
    
    // Parse customer address to extract city
    const customerAddress = order.customerdetails || order.customer_address || '';
    let customerCity = '';
    let customerState = '';
    
    // Try to extract city and state from address
    // Format: "Tamil School lane, Chala, Thiruvananthapuram, Kerala, 695001"
    const addressParts = customerAddress.split(',');
    if (addressParts.length >= 4) {
      customerCity = addressParts[addressParts.length - 3].trim();
      customerState = addressParts[addressParts.length - 2].trim();
    }
    
    console.log(`   Extracted City: ${customerCity}`);
    console.log(`   Extracted State: ${customerState}`);
    
    // Get order location
    let orderLat = null;
    let orderLng = null;
    if (order.lat_log) {
      const [lat, lng] = order.lat_log.split(',').map(Number);
      if (!isNaN(lat) && !isNaN(lng)) {
        orderLat = lat;
        orderLng = lng;
        console.log(`   Location: ${orderLat}, ${orderLng}`);
      }
    }
    
    console.log(`\n📋 Scanning bulk_message_notifications table...\n`);
    
    // Scan all bulk message notifications
    const client = getDynamoDBClient();
    let allNotifications = [];
    let lastKey = null;
    
    do {
      const params = {
        TableName: 'bulk_message_notifications',
        FilterExpression: '#status = :status',
        ExpressionAttributeNames: {
          '#status': 'status'
        },
        ExpressionAttributeValues: {
          ':status': 'sent'
        }
      };
      
      if (lastKey) {
        params.ExclusiveStartKey = lastKey;
      }
      
      const command = new ScanCommand(params);
      const response = await client.send(command);
      
      if (response.Items) {
        allNotifications.push(...response.Items);
      }
      
      lastKey = response.LastEvaluatedKey;
      console.log(`   Scanned ${allNotifications.length} records...`);
    } while (lastKey);
    
    console.log(`\n✅ Total records scanned: ${allNotifications.length}\n`);
    
    // Filter vendors with similar city/state
    const matchingVendors = [];
    
    for (const notification of allNotifications) {
      const businessData = notification.business_data || {};
      const vendorCity = businessData.city || '';
      const vendorState = businessData.state || '';
      const vendorStreet = businessData.street || '';
      const vendorTitle = businessData.title || '';
      
      // Check if city matches
      const cityMatch = customerCity && vendorCity && isSimilarCity(customerCity, vendorCity);
      const stateMatch = customerState && vendorState && normalizeCityName(customerState) === normalizeCityName(vendorState);
      
      if (cityMatch && stateMatch) {
        matchingVendors.push({
          phone_number: notification.phone_number,
          title: vendorTitle,
          city: vendorCity,
          state: vendorState,
          street: vendorStreet,
          categoryName: businessData.categoryName || '',
          language: notification.language || 'en',
          notified_at: notification.notified_at || notification.created_at,
          business_data: businessData
        });
      }
    }
    
    console.log(`\n📊 Results:\n`);
    console.log(`   Total vendors with matching city/state: ${matchingVendors.length}\n`);
    
    if (matchingVendors.length > 0) {
      console.log(`   Matching Vendors:\n`);
      matchingVendors.forEach((vendor, idx) => {
        console.log(`${idx + 1}. ${vendor.title || 'N/A'}`);
        console.log(`   Phone: ${vendor.phone_number}`);
        console.log(`   City: ${vendor.city}, State: ${vendor.state}`);
        console.log(`   Street: ${vendor.street || 'N/A'}`);
        console.log(`   Category: ${vendor.categoryName || 'N/A'}`);
        console.log(`   Language: ${vendor.language}`);
        console.log(`   Notified: ${vendor.notified_at}`);
        console.log('');
      });
    } else {
      console.log(`   ⚠️  No vendors found with matching city/state in bulk_message_notifications`);
      console.log(`   Looking for: ${customerCity}, ${customerState}`);
    }
    
    // Note about distance calculation
    if (orderLat && orderLng) {
      console.log(`\n📝 Note: Distance calculation requires geocoding vendor addresses.`);
      console.log(`   Order location: ${orderLat}, ${orderLng}`);
      console.log(`   To calculate 20km radius, you would need to geocode the vendor addresses.`);
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

findVendorsNearbyOrder();

