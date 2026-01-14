require('dotenv').config();
const Shop = require('../models/Shop');
const Customer = require('../models/Customer');
const User = require('../models/User');

/**
 * Calculate distance between a shop and a customer
 * Usage: node scripts/calculate-distance-shop-customer.js [shop_name] [customer_id]
 * Example: node scripts/calculate-distance-shop-customer.js "Esakki selvam waste paper mart" 1768209939921
 */

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

// Parse lat_log string to [lat, lon]
function parseLatLog(latLogString) {
  if (!latLogString) return null;
  const parts = latLogString.split(',').map(s => s.trim());
  if (parts.length !== 2) return null;
  const lat = parseFloat(parts[0]);
  const lon = parseFloat(parts[1]);
  if (isNaN(lat) || isNaN(lon)) return null;
  return [lat, lon];
}

async function calculateDistanceBetweenShopAndCustomer() {
  const args = process.argv.slice(2);
  const shopName = args[0] || 'Esakki selvam waste paper mart';
  const customerId = args[1] || '1768209939921';

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📏 Calculate Distance: Shop to Customer');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  console.log(`🏪 Shop Name: ${shopName}`);
  console.log(`👤 Customer ID: ${customerId}\n`);

  try {
    // Step 1: Find shop by name
    console.log('📋 Step 1: Finding shop...');
    const { getDynamoDBClient } = require('../config/dynamodb');
    const { ScanCommand } = require('@aws-sdk/lib-dynamodb');
    const client = getDynamoDBClient();

    let shop = null;
    let lastKey = null;

    do {
      const params = {
        TableName: 'shops',
        FilterExpression: 'contains(shopname, :shopName)',
        ExpressionAttributeValues: {
          ':shopName': shopName
        }
      };

      if (lastKey) {
        params.ExclusiveStartKey = lastKey;
      }

      const command = new ScanCommand(params);
      const response = await client.send(command);

      if (response.Items && response.Items.length > 0) {
        // Find exact match or closest match
        const exactMatch = response.Items.find(s => 
          s.shopname && s.shopname.toLowerCase().includes(shopName.toLowerCase())
        );
        if (exactMatch) {
          shop = exactMatch;
          break;
        }
        // If no exact match, use first result
        if (!shop) {
          shop = response.Items[0];
        }
      }

      lastKey = response.LastEvaluatedKey;
    } while (lastKey && !shop);

    if (!shop) {
      console.error(`❌ Shop "${shopName}" not found`);
      process.exit(1);
    }

    console.log(`✅ Found shop:`);
    console.log(`   Shop ID: ${shop.id}`);
    console.log(`   Shop Name: ${shop.shopname || 'N/A'}`);
    console.log(`   User ID: ${shop.user_id || 'N/A'}`);
    console.log(`   Address: ${shop.address || 'N/A'}`);
    console.log(`   Location: ${shop.location || 'N/A'}`);
    console.log(`   Lat/Long: ${shop.lat_log || 'N/A'}\n`);

    // Step 2: Find customer (try by ID first, then by user_id)
    console.log('📋 Step 2: Finding customer...');
    let customer = await Customer.findById(parseInt(customerId));

    // If not found, try finding by user_id (customer_id might be user_id)
    if (!customer) {
      console.log(`   Customer not found by ID, trying user_id...`);
      customer = await Customer.findByUserId(parseInt(customerId));
    }

    // If still not found, try User table
    if (!customer) {
      console.log(`   Customer not found, trying User table...`);
      const user = await User.findById(parseInt(customerId));
      if (user) {
        // Try to find customer by user_id
        customer = await Customer.findByUserId(user.id);
        if (!customer && user.mob_num) {
          // Create a temporary customer object from user data
          console.log(`   Creating customer object from user data...`);
          customer = {
            id: user.id,
            name: user.name,
            contact: user.mob_num,
            address: 'Service Road, Tirunelveli, Tamil Nadu, 627001',
            location: '',
            lat_log: null // Will need to get from customer table or geocode
          };
        }
      }
    }

    if (!customer) {
      console.error(`❌ Customer/User with ID ${customerId} not found`);
      console.error(`   Please check if the ID is correct or if location data exists`);
      process.exit(1);
    }

    console.log(`✅ Found customer:`);
    console.log(`   Customer ID: ${customer.id}`);
    console.log(`   Name: ${customer.name || 'N/A'}`);
    console.log(`   Phone: ${customer.contact || 'N/A'}`);
    console.log(`   Address: ${customer.address || 'N/A'}`);
    console.log(`   Location: ${customer.location || 'N/A'}`);
    console.log(`   Lat/Long: ${customer.lat_log || 'N/A'}\n`);

    // Step 3: Parse coordinates
    console.log('📋 Step 3: Parsing coordinates...');
    const shopCoords = parseLatLog(shop.lat_log);
    const customerCoords = parseLatLog(customer.lat_log);

    if (!shopCoords) {
      console.error(`❌ Shop location (lat_log) is missing or invalid: ${shop.lat_log}`);
      process.exit(1);
    }

    if (!customerCoords) {
      console.error(`❌ Customer location (lat_log) is missing or invalid: ${customer.lat_log}`);
      process.exit(1);
    }

    console.log(`✅ Shop Coordinates: ${shopCoords[0]}, ${shopCoords[1]}`);
    console.log(`✅ Customer Coordinates: ${customerCoords[0]}, ${customerCoords[1]}\n`);

    // Step 4: Calculate distance
    console.log('📋 Step 4: Calculating distance...');
    const distance = calculateDistance(
      shopCoords[0],
      shopCoords[1],
      customerCoords[0],
      customerCoords[1]
    );

    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📊 Distance Result');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    console.log(`   Shop: ${shop.shopname || 'N/A'}`);
    console.log(`   Customer: ${customer.name || 'N/A'} (ID: ${customer.id})`);
    console.log(`   Distance: ${distance.toFixed(2)} km`);
    console.log(`   Distance: ${(distance * 0.621371).toFixed(2)} miles\n`);

    // Additional info
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📍 Location Details');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    console.log(`Shop:`);
    console.log(`   Address: ${shop.address || 'N/A'}`);
    console.log(`   Location: ${shop.location || 'N/A'}`);
    console.log(`   Place: ${shop.place || 'N/A'}`);
    console.log(`   State: ${shop.state || 'N/A'}`);
    console.log(`   Pincode: ${shop.pincode || 'N/A'}\n`);
    console.log(`Customer:`);
    console.log(`   Address: ${customer.address || 'N/A'}`);
    console.log(`   Location: ${customer.location || 'N/A'}`);
    console.log(`   Place: ${customer.place || 'N/A'}`);
    console.log(`   State: ${customer.state || 'N/A'}`);
    console.log(`   Pincode: ${customer.pincode || 'N/A'}\n`);

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('✅ Calculation completed!');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    console.error('Stack:', error.stack);
    process.exit(1);
  }
}

calculateDistanceBetweenShopAndCustomer();

