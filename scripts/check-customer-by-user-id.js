require('dotenv').config();
const Customer = require('../models/Customer');

const userId = process.argv[2];

if (!userId) {
  console.log('Usage: node check-customer-by-user-id.js <user_id>');
  process.exit(1);
}

async function checkCustomer() {
  try {
    console.log(`\n🔍 Checking for Customer record for user_id: ${userId}\n`);
    
    const customer = await Customer.findByUserId(userId);
    
    if (customer) {
      console.log('✅ Customer record found!\n');
      console.log('Customer Details:');
      console.log('─'.repeat(60));
      console.log(`ID: ${customer.id}`);
      console.log(`User ID: ${customer.user_id}`);
      console.log(`Name: ${customer.name || 'N/A'}`);
      console.log(`Email: ${customer.email || 'N/A'}`);
      console.log(`Contact: ${customer.contact || 'N/A'}`);
      console.log(`Address: ${customer.address || 'N/A'}`);
      console.log(`Location: ${customer.location || 'N/A'}`);
      console.log(`State: ${customer.state || 'N/A'}`);
      console.log(`Place: ${customer.place || 'N/A'}`);
      console.log(`Pincode: ${customer.pincode || 'N/A'}`);
      console.log(`Language: ${customer.language || 'N/A'}`);
      console.log(`Created At: ${customer.created_at || 'N/A'}`);
      console.log(`Updated At: ${customer.updated_at || 'N/A'}`);
      console.log('─'.repeat(60));
    } else {
      console.log('❌ No Customer record found for this user_id');
    }
  } catch (error) {
    console.error('❌ Error:', error);
  }
}

checkCustomer();

