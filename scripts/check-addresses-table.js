/**
 * Script to check all addresses in the addresses table
 * Usage: node scripts/check-addresses-table.js [customer_id]
 * Example: node scripts/check-addresses-table.js 1767542897156
 */

require('dotenv').config();
const { getDynamoDBClient } = require('../config/dynamodb');
const { ScanCommand } = require('@aws-sdk/lib-dynamodb');

const customerId = process.argv[2] ? parseInt(process.argv[2]) : null;

async function checkAddressesTable() {
  try {
    console.log('\n🔍 Checking Addresses Table');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    const client = getDynamoDBClient();
    let lastKey = null;
    const allAddresses = [];

    do {
      const params = {
        TableName: 'addresses',
      };

      if (customerId) {
        params.FilterExpression = 'customer_id = :customerId';
        params.ExpressionAttributeValues = {
          ':customerId': customerId
        };
      }

      if (lastKey) {
        params.ExclusiveStartKey = lastKey;
      }

      const command = new ScanCommand(params);
      const response = await client.send(command);

      if (response.Items && response.Items.length > 0) {
        allAddresses.push(...response.Items);
      }

      lastKey = response.LastEvaluatedKey;
    } while (lastKey);

    if (allAddresses.length === 0) {
      console.log(customerId 
        ? `⚠️  No addresses found for customer_id: ${customerId}`
        : '⚠️  No addresses found in addresses table'
      );
      return;
    }

    console.log(`✅ Found ${allAddresses.length} address(es)${customerId ? ` for customer_id: ${customerId}` : ''}\n`);

    allAddresses.forEach((address, index) => {
      console.log(`📍 Address ${index + 1}:`);
      console.log(`   Address ID: ${address.id}`);
      console.log(`   Customer ID: ${address.customer_id}`);
      console.log(`   Full Address: ${address.address || 'N/A'}`);
      console.log(`   Address Type: ${address.addres_type || 'N/A'}`);
      console.log(`   Building No: ${address.building_no || 'N/A'}`);
      console.log(`   Landmark: ${address.landmark || 'N/A'}`);
      if (address.latitude && address.longitude) {
        console.log(`   Coordinates: ${address.latitude}, ${address.longitude}`);
      }
      if (address.lat_log) {
        console.log(`   Lat/Long: ${address.lat_log}`);
      }
      console.log(`   Created: ${address.created_at || 'N/A'}`);
      console.log(`   Updated: ${address.updated_at || 'N/A'}`);
      console.log(`   Del Status: ${address.del_status || 'N/A'}`);
      console.log('');
    });

  } catch (error) {
    console.error('❌ Error checking addresses table:', error);
    console.error('   Stack:', error.stack);
    process.exit(1);
  }
}

// Run the script
checkAddressesTable();

