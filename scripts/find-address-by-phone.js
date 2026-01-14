/**
 * Script to find address by phone number
 * Usage: node scripts/find-address-by-phone.js <phone_number>
 * Example: node scripts/find-address-by-phone.js 9003454319
 */

require('dotenv').config();
const User = require('../models/User');
const Customer = require('../models/Customer');
const Address = require('../models/Address');
const { getDynamoDBClient } = require('../config/dynamodb');
const { ScanCommand } = require('@aws-sdk/lib-dynamodb');

const phoneNumber = process.argv[2];

if (!phoneNumber) {
  console.error('❌ Please provide a phone number');
  console.log('Usage: node scripts/find-address-by-phone.js <phone_number>');
  process.exit(1);
}

async function findAddressByPhone() {
  try {
    console.log(`🔍 Searching for address of phone number: ${phoneNumber}\n`);
    
    const client = getDynamoDBClient();
    const mobileValue = parseInt(phoneNumber);
    
    // Step 1: Find user(s) by phone number
    console.log('📱 Step 1: Finding user(s) by phone number...');
    const userResult = await User.findByMobile(phoneNumber);
    
    // Handle both single user and array of users
    const users = Array.isArray(userResult) ? userResult : (userResult ? [userResult] : []);
    
    if (users.length === 0) {
      console.log(`❌ No users found with phone number ${phoneNumber}`);
      return;
    }
    
    console.log(`✅ Found ${users.length} user(s):\n`);
    users.forEach((user, index) => {
      console.log(`   User ${index + 1}:`);
      console.log(`   - ID: ${user.id}`);
      console.log(`   - Name: ${user.name || 'N/A'}`);
      console.log(`   - User Type: ${user.user_type || 'N/A'}`);
      console.log(`   - App Type: ${user.app_type || 'N/A'}`);
      console.log(`   - Email: ${user.email || 'N/A'}`);
      console.log('');
    });
    
    // Step 2: Find customer records
    console.log('👤 Step 2: Finding customer records...');
    const customerIds = users.map(u => u.id);
    const customers = [];
    
    for (const userId of customerIds) {
      try {
        const customer = await Customer.findByUserId(userId);
        if (customer) {
          customers.push({ userId, customer });
        }
      } catch (err) {
        // Customer might not exist, continue
      }
    }
    
    if (customers.length > 0) {
      console.log(`✅ Found ${customers.length} customer record(s):\n`);
      customers.forEach(({ userId, customer }, index) => {
        console.log(`   Customer ${index + 1} (User ID: ${userId}):`);
        console.log(`   - Customer ID: ${customer.id}`);
        console.log(`   - Name: ${customer.name || 'N/A'}`);
        console.log(`   - Contact: ${customer.contact || 'N/A'}`);
        console.log(`   - Address: ${customer.address || 'N/A'}`);
        console.log(`   - Location: ${customer.location || 'N/A'}`);
        console.log(`   - State: ${customer.state || 'N/A'}`);
        console.log(`   - Place: ${customer.place || 'N/A'}`);
        console.log(`   - Pincode: ${customer.pincode || 'N/A'}`);
        if (customer.lat_log) {
          console.log(`   - Coordinates (lat_log): ${customer.lat_log}`);
        }
        if (customer.latitude && customer.longitude) {
          console.log(`   - Coordinates: ${customer.latitude}, ${customer.longitude}`);
        }
        console.log(`   - Full customer data:`, JSON.stringify(customer, null, 2));
        console.log('');
      });
    } else {
      console.log('⚠️  No customer records found\n');
    }
    
    // Step 3: Find addresses
    console.log('📍 Step 3: Finding address records...');
    const addresses = [];
    
    for (const userId of customerIds) {
      try {
        // Try to find by customer_id (which might be user_id)
        const customerAddresses = await Address.findByCustomerId(userId);
        if (customerAddresses && customerAddresses.length > 0) {
          addresses.push(...customerAddresses.map(addr => ({ userId, address: addr })));
        }
      } catch (err) {
        // Address might not exist, continue
      }
    }
    
    if (addresses.length > 0) {
      console.log(`✅ Found ${addresses.length} address record(s):\n`);
      addresses.forEach(({ userId, address }, index) => {
        console.log(`   Address ${index + 1} (User ID: ${userId}):`);
        console.log(`   - Address ID: ${address.id}`);
        console.log(`   - Address: ${address.address || 'N/A'}`);
        console.log(`   - Address Type: ${address.addres_type || 'N/A'}`);
        console.log(`   - Building No: ${address.building_no || 'N/A'}`);
        console.log(`   - Landmark: ${address.landmark || 'N/A'}`);
        if (address.lat_log) {
          console.log(`   - Coordinates (lat_log): ${address.lat_log}`);
        }
        if (address.latitude && address.longitude) {
          console.log(`   - Coordinates: ${address.latitude}, ${address.longitude}`);
        }
        console.log('');
      });
    } else {
      console.log('⚠️  No address records found\n');
    }
    
    // Step 4: Find orders with this phone number (to get order addresses)
    console.log('📦 Step 4: Finding orders with this phone number...');
    
    // Scan orders for all customer IDs (user IDs and customer IDs)
    const allIds = [...customerIds, ...users.map(u => u.id)];
    const orders = [];
    let lastKey = null;
    
    do {
      const params = {
        TableName: 'orders'
      };
      
      if (lastKey) {
        params.ExclusiveStartKey = lastKey;
      }
      
      const orderCommand = new ScanCommand(params);
      const orderResponse = await client.send(orderCommand);
      
      if (orderResponse.Items) {
        // Filter orders that match any of our customer/user IDs
        const matchingOrders = orderResponse.Items.filter(order => {
          const orderCustomerId = order.customer_id ? parseInt(order.customer_id) : null;
          return allIds.includes(orderCustomerId);
        });
        orders.push(...matchingOrders);
      }
      
      lastKey = orderResponse.LastEvaluatedKey;
    } while (lastKey);
    
    if (orders.length > 0) {
      console.log(`✅ Found ${orders.length} order(s):\n`);
      const uniqueAddresses = new Set();
      
      orders.forEach((order, index) => {
        const orderAddress = order.customerdetails || order.address || 'N/A';
        if (orderAddress !== 'N/A' && !uniqueAddresses.has(orderAddress)) {
          uniqueAddresses.add(orderAddress);
          console.log(`   Order ${index + 1}:`);
          console.log(`   - Order ID: ${order.id}`);
          console.log(`   - Order Number: ${order.order_number || order.order_no || 'N/A'}`);
          console.log(`   - Address: ${orderAddress}`);
          if (order.lat_log) {
            console.log(`   - Coordinates (lat_log): ${order.lat_log}`);
          }
          if (order.latitude && order.longitude) {
            console.log(`   - Coordinates: ${order.latitude}, ${order.longitude}`);
          }
          console.log('');
        }
      });
    } else {
      console.log('⚠️  No orders found\n');
    }
    
    console.log('✅ Search completed!');
    
  } catch (error) {
    console.error('❌ Error finding address:', error);
    process.exit(1);
  }
}

// Run the script
findAddressByPhone()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Script failed:', error);
    process.exit(1);
  });

