/**
 * Script to query addresses by customer ID
 * Usage: node scripts/query-addresses-by-customer.js <customer_id>
 */

require('dotenv').config();
const Address = require('../models/Address');

async function findAddressesByCustomer(customerId) {
  try {
    console.log(`\n🔍 Searching for addresses for customer ID: ${customerId}\n`);
    
    const addresses = await Address.findByCustomerId(customerId);
    
    if (addresses && addresses.length > 0) {
      console.log(`✅ Found ${addresses.length} address(es)!\n`);
      
      addresses.forEach((addr, index) => {
        console.log(`Address ${index + 1}:`);
        console.log('─'.repeat(60));
        console.log(`ID: ${addr.id}`);
        console.log(`Customer ID: ${addr.customer_id}`);
        console.log(`Address: ${addr.address || 'N/A'}`);
        console.log(`Address Type: ${addr.addres_type || 'N/A'}`);
        console.log(`Building No: ${addr.building_no || 'N/A'}`);
        console.log(`Landmark: ${addr.landmark || 'N/A'}`);
        console.log(`Lat/Long: ${addr.lat_log || 'N/A'}`);
        console.log(`Latitude: ${addr.latitude !== undefined && addr.latitude !== null ? addr.latitude : 'N/A'}`);
        console.log(`Longitude: ${addr.longitude !== undefined && addr.longitude !== null ? addr.longitude : 'N/A'}`);
        console.log(`Created At: ${addr.created_at || 'N/A'}`);
        console.log(`Updated At: ${addr.updated_at || 'N/A'}`);
        console.log(`Del Status: ${addr.del_status !== undefined ? addr.del_status : 'N/A'}`);
        console.log('─'.repeat(60));
        console.log('');
      });
      
      // JSON output
      console.log('\n📋 JSON Output:');
      console.log(JSON.stringify(addresses, null, 2));
      
      return addresses;
    } else {
      console.log('❌ No addresses found for customer ID:', customerId);
      return [];
    }
  } catch (error) {
    console.error('❌ Error querying addresses:', error);
    throw error;
  }
}

// Get customer ID from command line argument
const customerId = process.argv[2] || '1766391801094';

if (!customerId) {
  console.error('❌ Please provide a customer ID as an argument');
  console.log('Usage: node scripts/query-addresses-by-customer.js <customer_id>');
  process.exit(1);
}

// Run the query
findAddressesByCustomer(customerId)
  .then((addresses) => {
    if (addresses && addresses.length > 0) {
      console.log(`\n✅ Found ${addresses.length} address(es) for customer ${customerId}\n`);
      process.exit(0);
    } else {
      console.log(`\n⚠️  No addresses found for customer ${customerId}\n`);
      process.exit(0);
    }
  })
  .catch((error) => {
    console.error('Script failed:', error);
    process.exit(1);
  });

