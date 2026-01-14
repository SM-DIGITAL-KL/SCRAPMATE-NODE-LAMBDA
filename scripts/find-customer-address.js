/**
 * Script to find customer address by phone number
 * Usage: node scripts/find-customer-address.js <phone_number>
 * Example: node scripts/find-customer-address.js 7982881901
 */

require('dotenv').config();
const User = require('../models/User');
const Customer = require('../models/Customer');
const Address = require('../models/Address');
const Order = require('../models/Order');

const phoneNumber = process.argv[2];

if (!phoneNumber) {
  console.error('❌ Please provide a phone number');
  console.log('Usage: node scripts/find-customer-address.js <phone_number>');
  process.exit(1);
}

async function findCustomerAddress() {
  try {
    console.log('\n🔍 Finding Customer Address');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    console.log(`📞 Phone Number: ${phoneNumber}\n`);

    // Find all users with this phone number
    const users = await User.findAllByMobile(phoneNumber);
    if (!users || users.length === 0) {
      console.error(`❌ No user found with phone number: ${phoneNumber}`);
      return;
    }

    console.log(`✅ Found ${users.length} user(s) with phone number ${phoneNumber}\n`);

    // Find customer app user (type 'C' or customer_app)
    const customerUser = users.find(u => 
      (u.app_type === 'customer_app' || (!u.app_type && u.user_type === 'C')) &&
      (u.del_status !== 2 || !u.del_status)
    );

    if (!customerUser) {
      console.error(`❌ No customer app user found with phone number: ${phoneNumber}`);
      console.log(`   Found ${users.length} user(s) with this phone number, but none are customer app users.`);
      console.log(`   User types found: ${users.map(u => `${u.user_type} (${u.app_type || 'no app_type'})`).join(', ')}`);
      return;
    }

    console.log('✅ Customer User Found:');
    console.log(`   User ID: ${customerUser.id}`);
    console.log(`   Name: ${customerUser.name || 'N/A'}`);
    console.log(`   Phone: ${customerUser.mob_num || 'N/A'}`);
    console.log(`   Email: ${customerUser.email || 'N/A'}`);
    console.log(`   User Type: ${customerUser.user_type || 'N/A'}`);
    console.log(`   App Type: ${customerUser.app_type || 'N/A'}`);
    console.log('');

    // Find customer record
    const customer = await Customer.findByUserId(customerUser.id);
    if (!customer) {
      console.error(`❌ No customer record found for user_id: ${customerUser.id}`);
      console.log('   Customer record is required to find addresses.');
      return;
    }

    console.log('✅ Customer Record Found:');
    console.log(`   Customer ID: ${customer.id}`);
    console.log(`   Name: ${customer.name || 'N/A'}`);
    console.log(`   Email: ${customer.email || 'N/A'}`);
    console.log(`   Phone: ${customer.phone || customer.contact || 'N/A'}`);
    console.log(`   Address: ${customer.address || 'N/A'}`);
    console.log(`   Place: ${customer.place || 'N/A'}`);
    console.log(`   State: ${customer.state || 'N/A'}`);
    console.log(`   Pincode: ${customer.pincode || 'N/A'}`);
    if (customer.lat_log) {
      console.log(`   Location (lat_log): ${customer.lat_log}`);
    }
    if (customer.location) {
      console.log(`   Location: ${customer.location}`);
    }
    console.log('');

    // Find addresses for this customer
    // Try with customer.id first
    let addresses = await Address.findByCustomerId(customer.id);
    
    // Also try with user.id (user_id) as addresses are often saved with customer_id = user_id
    if ((!addresses || addresses.length === 0) && customerUser.id) {
      console.log(`   🔍 Trying with user_id (${customerUser.id}) instead of customer.id (${customer.id})...`);
      addresses = await Address.findByCustomerId(customerUser.id);
    }
    
    if (!addresses || addresses.length === 0) {
      console.log('⚠️  No addresses found in addresses table for this customer.');
      
      // Check if customer has address in the customer record itself
      if (customer.address) {
        console.log('\n📍 Address from Customer Record:');
        console.log(`   ${customer.address}`);
        if (customer.latitude && customer.longitude) {
          console.log(`   Coordinates: ${customer.latitude}, ${customer.longitude}`);
        }
        console.log('');
      }
    } else {
      console.log(`✅ Found ${addresses.length} address(es) for this customer:\n`);

      addresses.forEach((address, index) => {
        console.log(`📍 Address ${index + 1}:`);
        console.log(`   Address ID: ${address.id}`);
        console.log(`   Full Address: ${address.address || 'N/A'}`);
        console.log(`   Landmark: ${address.landmark || 'N/A'}`);
        console.log(`   City: ${address.city || 'N/A'}`);
        console.log(`   State: ${address.state || 'N/A'}`);
        console.log(`   Pincode: ${address.pincode || 'N/A'}`);
        if (address.latitude && address.longitude) {
          console.log(`   Coordinates: ${address.latitude}, ${address.longitude}`);
        }
        console.log(`   Is Default: ${address.is_default ? 'Yes' : 'No'}`);
        console.log(`   Created: ${address.created_at || 'N/A'}`);
        console.log('');
      });

      // Also check customer record for address
      if (customer.address && !addresses.find(a => a.address === customer.address)) {
        console.log('📍 Additional Address from Customer Record:');
        console.log(`   ${customer.address}`);
        if (customer.latitude && customer.longitude) {
          console.log(`   Coordinates: ${customer.latitude}, ${customer.longitude}`);
        }
        console.log('');
      }
    }

    // Check orders for address information
    console.log('🔍 Checking orders for address information...');
    const orders = await Order.findByCustomerId(customer.id);
    if (orders && orders.length > 0) {
      console.log(`   Found ${orders.length} order(s) for this customer\n`);
      
      // Extract unique addresses from orders
      const orderAddresses = new Set();
      orders.forEach(order => {
        if (order.customerdetails) {
          orderAddresses.add(order.customerdetails);
        }
      });
      
      if (orderAddresses.size > 0) {
        console.log('📍 Address(es) from Orders:');
        Array.from(orderAddresses).forEach((addr, idx) => {
          console.log(`   ${idx + 1}. ${addr}`);
        });
        console.log('');
      } else {
        console.log('   No address information found in orders.\n');
      }
    } else {
      console.log('   No orders found for this customer.\n');
    }

  } catch (error) {
    console.error('❌ Error finding customer address:', error);
    console.error('   Stack:', error.stack);
    process.exit(1);
  }
}

// Run the script
findCustomerAddress();

