/**
 * Test script to add address for a customer
 * Usage: node scripts/test-add-address.js <phone_number> [address] [latitude] [longitude]
 * Example: node scripts/test-add-address.js 9074135121 "Test Address, Kerala" 9.128175 76.767061
 */

require('dotenv').config();
const axios = require('axios');
const User = require('../models/User');
const Customer = require('../models/Customer');
const Address = require('../models/Address');

const phoneNumber = process.argv[2] || '9074135121';
const testAddress = process.argv[3] || 'Enathu - Ezhamkulam road, Parakode, Kerala, 691526';
const latitude = parseFloat(process.argv[4]) || 9.1283829;
const longitude = parseFloat(process.argv[5]) || 76.7667312;

// API configuration
const API_BASE_URL = process.env.API_BASE_URL || 'https://gpn6vt3mlkm6zq7ibxdtu6bphi0onexr.lambda-url.ap-south-1.on.aws/api/v2';
const API_KEY = process.env.API_KEY || 'zyubkfzeumeoviaqzcsrvfwdzbiwnlnn';

async function testAddAddress() {
  try {
    console.log('\n🧪 Testing Add Address for Customer App User');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    console.log(`📞 Phone Number: ${phoneNumber}`);
    console.log(`📍 Address: ${testAddress}`);
    console.log(`🌐 Coordinates: ${latitude}, ${longitude}\n`);

    // Step 1: Find user and customer
    console.log('Step 1: Finding user and customer...');
    const users = await User.findAllByMobile(phoneNumber);
    if (!users || users.length === 0) {
      console.error(`❌ No user found with phone number: ${phoneNumber}`);
      return;
    }

    const customerUser = users.find(u => 
      (u.app_type === 'customer_app' || (!u.app_type && u.user_type === 'C')) &&
      (u.del_status !== 2 || !u.del_status)
    );

    if (!customerUser) {
      console.error(`❌ No customer app user found with phone number: ${phoneNumber}`);
      return;
    }

    console.log(`✅ User found: ID ${customerUser.id}, Name: ${customerUser.name || 'N/A'}`);

    const customer = await Customer.findByUserId(customerUser.id);
    if (!customer) {
      console.error(`❌ No customer record found for user_id: ${customerUser.id}`);
      return;
    }

    console.log(`✅ Customer found: ID ${customer.id}, Name: ${customer.name || 'N/A'}`);
    console.log(`   Current customer.address: "${customer.address || '(empty)'}"\n`);

    // Step 2: Check existing addresses
    console.log('Step 2: Checking existing addresses...');
    let existingAddresses = [];
    try {
      // Try with customer.id first
      existingAddresses = await Address.findByCustomerId(customer.id);
      console.log(`   Found ${existingAddresses.length} address(es) with customer_id = ${customer.id}`);
      
      // Also try with user_id
      if (existingAddresses.length === 0) {
        const addressesByUserId = await Address.findByCustomerId(customerUser.id);
        console.log(`   Found ${addressesByUserId.length} address(es) with customer_id = ${customerUser.id}`);
        existingAddresses = addressesByUserId;
      }
    } catch (err) {
      console.log(`   Error checking addresses: ${err.message}`);
    }
    console.log('');

    // Step 3: Add address via API
    console.log('Step 3: Adding address via API...');
    const addressData = {
      customer_id: customerUser.id, // Using user_id as customer_id (as frontend does)
      address: testAddress,
      addres_type: 'Home',
      building_no: 'Test Building',
      landmark: 'Test Landmark',
      latitude: latitude,
      longitude: longitude,
      lat_log: `${latitude},${longitude}`,
    };

    console.log('   Request data:', JSON.stringify(addressData, null, 2));

    const response = await axios.post(
      `${API_BASE_URL}/addresses`,
      addressData,
      {
        headers: {
          'api-key': API_KEY,
          'Content-Type': 'application/json',
        },
      }
    );

    console.log(`   ✅ API Response Status: ${response.status}`);
    console.log('   Response:', JSON.stringify(response.data, null, 2));

    if (response.data.status === 'success') {
      const savedAddress = response.data.data;
      console.log(`\n✅ Address saved successfully!`);
      console.log(`   Address ID: ${savedAddress.id}`);
      console.log(`   Customer ID: ${savedAddress.customer_id}`);
      console.log(`   Address: ${savedAddress.address}`);
      console.log(`   Coordinates: ${savedAddress.latitude}, ${savedAddress.longitude}`);
    } else {
      console.error(`\n❌ Address save failed:`, response.data.msg);
      return;
    }

    // Step 4: Verify in database
    console.log('\nStep 4: Verifying address in database...');
    await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second for DB write

    try {
      // Check with user_id (as that's what frontend uses)
      const verifyAddresses = await Address.findByCustomerId(customerUser.id);
      console.log(`   ✅ Found ${verifyAddresses.length} address(es) in database for customer_id = ${customerUser.id}`);
      
      const newAddress = verifyAddresses.find(addr => 
        addr.address === testAddress || 
        (addr.latitude === latitude && addr.longitude === longitude)
      );

      if (newAddress) {
        console.log(`   ✅ New address verified in database:`);
        console.log(`      ID: ${newAddress.id}`);
        console.log(`      Address: ${newAddress.address}`);
        console.log(`      Latitude: ${newAddress.latitude}`);
        console.log(`      Longitude: ${newAddress.longitude}`);
        console.log(`      Lat/Long: ${newAddress.lat_log}`);
      } else {
        console.log(`   ⚠️  New address not found in verification (might need more time)`);
      }

      // Also check with customer.id
      const verifyByCustomerId = await Address.findByCustomerId(customer.id);
      console.log(`   Found ${verifyByCustomerId.length} address(es) with customer_id = ${customer.id}`);
    } catch (err) {
      console.error(`   ❌ Error verifying address: ${err.message}`);
    }

    // Step 5: Check customer table address
    console.log('\nStep 5: Checking customer table address...');
    const updatedCustomer = await Customer.findById(customer.id);
    console.log(`   Customer.address: "${updatedCustomer?.address || '(empty)'}"`);
    if (updatedCustomer?.address) {
      console.log(`   ✅ Address also saved to customer table`);
    } else {
      console.log(`   ⚠️  Address NOT in customer table (only in addresses table)`);
    }

    console.log('\n✅ Test completed!\n');

  } catch (error) {
    console.error('\n❌ Error during test:', error.message);
    if (error.response) {
      console.error('   API Response:', JSON.stringify(error.response.data, null, 2));
      console.error('   Status:', error.response.status);
    }
    console.error('   Stack:', error.stack);
    process.exit(1);
  }
}

// Run the test
testAddAddress();

