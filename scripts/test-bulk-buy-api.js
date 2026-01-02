/**
 * Script to test the v2 bulk buy request API
 * Usage: node scripts/test-bulk-buy-api.js <phoneNumber> [apiBaseUrl]
 * 
 * Example: node scripts/test-bulk-buy-api.js 9074135125
 * Example: node scripts/test-bulk-buy-api.js 9074135125 http://localhost:3000
 */

require('dotenv').config();
const User = require('../models/User');
const Shop = require('../models/Shop');
const FormData = require('form-data');
const fs = require('fs');
const path = require('path');

async function findUserByPhone(phoneNumber) {
  try {
    const { getDynamoDBClient } = require('../config/dynamodb');
    const { ScanCommand } = require('@aws-sdk/lib-dynamodb');
    const client = getDynamoDBClient();
    
    const phoneFormats = [
      String(phoneNumber),
      parseInt(phoneNumber),
      phoneNumber
    ];
    
    for (const phoneFormat of phoneFormats) {
      let scanKey = null;
      let foundUsers = [];
      
      do {
        const scanParams = {
          TableName: 'users',
          FilterExpression: 'mob_num = :mobNum',
          ExpressionAttributeValues: {
            ':mobNum': phoneFormat
          }
        };
        
        if (scanKey) {
          scanParams.ExclusiveStartKey = scanKey;
        }
        
        const scanCommand = new ScanCommand(scanParams);
        const response = await client.send(scanCommand);
        
        if (response.Items) {
          foundUsers.push(...response.Items);
        }
        scanKey = response.LastEvaluatedKey;
      } while (scanKey);
      
      if (foundUsers.length > 0) {
        return foundUsers[0];
      }
    }

    return null;
  } catch (error) {
    console.error('Error finding user:', error);
    return null;
  }
}

async function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    console.log('Usage: node scripts/test-bulk-buy-api.js <phoneNumber> [apiBaseUrl]');
    console.log('\nExample: node scripts/test-bulk-buy-api.js 9074135125');
    console.log('Example: node scripts/test-bulk-buy-api.js 9074135125 http://localhost:3000');
    console.log('Example: node scripts/test-bulk-buy-api.js 9074135125 https://06de21c6cbb4.ngrok-free.app');
    process.exit(1);
  }

  const phoneNumber = args[0];
  const apiBaseUrl = args[1] || process.env.API_BASE_URL || 'https://06de21c6cbb4.ngrok-free.app';
  const apiKey = process.env.API_KEY || 'zyubkfzeumeoviaqzcsrvfwdzbiwnlnn';

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🔍 FINDING USER');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`Phone Number: ${phoneNumber}\n`);

  const user = await findUserByPhone(phoneNumber);

  if (!user) {
    console.log(`❌ User not found for phone number: ${phoneNumber}`);
    process.exit(1);
  }

  console.log(`✅ Found user:`);
  console.log(`   Name: ${user.name || user.company_name || `User_${user.id}`}`);
  console.log(`   User ID: ${user.id}`);
  console.log(`   User Type: ${user.user_type || 'N/A'}`);

  // Check if user is B2B (S or SR)
  if (user.user_type !== 'S' && user.user_type !== 'SR') {
    console.log(`\n❌ User must be B2B type (S or SR) to create bulk buy requests. Current type: ${user.user_type}`);
    process.exit(1);
  }

  // Get user's shop location
  const shops = await Shop.findAllByUserId(user.id);
  if (shops.length === 0) {
    console.log(`\n❌ User has no shops. Cannot create bulk buy request without location.`);
    process.exit(1);
  }

  // Use first shop with location
  let shopWithLocation = null;
  for (const shop of shops) {
    if (shop.lat_log) {
      shopWithLocation = shop;
      break;
    }
  }

  if (!shopWithLocation) {
    console.log(`\n❌ User's shops have no location data (lat_log). Cannot create bulk buy request.`);
    process.exit(1);
  }

  const [lat, lng] = shopWithLocation.lat_log.split(',').map(Number);
  console.log(`\n✅ Using shop location:`);
  console.log(`   Shop ID: ${shopWithLocation.id}`);
  console.log(`   Shop Name: ${shopWithLocation.shopname || shopWithLocation.name || 'N/A'}`);
  console.log(`   Location: ${shopWithLocation.lat_log}`);
  console.log(`   Latitude: ${lat}`);
  console.log(`   Longitude: ${lng}`);

  // Prepare request data with proper subcategories structure
  const subcategories = [
    {
      subcategory_id: 1765083942936, // Example subcategory ID
      subcategory_name: 'MDF Board',
      preferred_quantity: 720, // kg
      preferred_price: 5.5 // per kg
    },
    {
      subcategory_id: 1765083942937, // Example subcategory ID
      subcategory_name: 'Particle Board',
      preferred_quantity: 720, // kg
      preferred_price: 5.5 // per kg
    }
  ];

  const totalQuantity = subcategories.reduce((sum, s) => sum + s.preferred_quantity, 0);
  const avgPrice = subcategories.reduce((sum, s) => sum + (s.preferred_price * s.preferred_quantity), 0) / totalQuantity;
  
  // Build scrap_type from subcategory names
  const scrapType = subcategories.map(s => s.subcategory_name).join(', ');

  // Create FormData with all required fields
  const formData = new FormData();
  formData.append('buyer_id', user.id);
  formData.append('latitude', lat);
  formData.append('longitude', lng);
  formData.append('quantity', totalQuantity);
  formData.append('preferred_price', avgPrice.toFixed(2));
  formData.append('preferred_distance', 50); // km
  formData.append('scrap_type', scrapType);
  formData.append('subcategories', JSON.stringify(subcategories));
  formData.append('subcategory_id', subcategories[0].subcategory_id); // First subcategory ID
  formData.append('when_needed', 'one-time');
  formData.append('location', shopWithLocation.address || 'Location from shop');
  formData.append('additional_notes', 'Bulk buy request created via API test script');
  // Note: documents are optional - not including them in this test

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📦 PREPARING API REQUEST');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`API Base URL: ${apiBaseUrl}`);
  console.log(`Endpoint: /api/v2/bulk-scrap/purchase`);
  console.log(`Buyer ID: ${user.id}`);
  console.log(`Buyer Name: ${user.name || user.company_name || `User_${user.id}`}`);
  console.log(`Location: ${lat}, ${lng}`);
  console.log(`Address: ${shopWithLocation.address || 'N/A'}`);
  console.log(`Quantity: ${totalQuantity} kg`);
  console.log(`Preferred Price: ₹${avgPrice.toFixed(2)}/kg`);
  console.log(`Preferred Distance: 50 km`);
  console.log(`Scrap Type: ${scrapType}`);
  console.log(`Subcategories: ${subcategories.length} items`);
  subcategories.forEach((sub, idx) => {
    console.log(`   ${idx + 1}. ${sub.subcategory_name} (ID: ${sub.subcategory_id}) - ${sub.preferred_quantity} kg @ ₹${sub.preferred_price}/kg`);
  });
  console.log(`When Needed: one-time`);
  console.log(`Additional Notes: Bulk buy request created via API test script`);

  // Make API request
  const fetch = require('node-fetch');
  const url = `${apiBaseUrl}/api/v2/bulk-scrap/purchase`;

  console.log(`\n📤 Sending request to: ${url}`);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'api-key': apiKey,
        ...formData.getHeaders()
      },
      body: formData
    });

    const responseData = await response.json();

    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📥 API RESPONSE');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`Status Code: ${response.status}`);
    console.log(`Status: ${responseData.status || 'N/A'}`);
    console.log(`Message: ${responseData.msg || 'N/A'}`);

    if (responseData.status === 'success' && responseData.data) {
      console.log(`\n✅ Request created successfully!`);
      console.log(`\n📊 Response Data:`);
      console.log(JSON.stringify(responseData.data, null, 2));
      
      if (responseData.data.notified_shops) {
        console.log(`\n📱 Notified Shops:`);
        console.log(`   Total: ${responseData.data.notified_shops.total}`);
        console.log(`   B2B: ${responseData.data.notified_shops.b2b_count}`);
        console.log(`   B2C: ${responseData.data.b2c_count}`);
        console.log(`   Unique Users: ${responseData.data.notified_shops.unique_users}`);
        console.log(`   With FCM Tokens: ${responseData.data.notified_shops.with_fcm_tokens}`);
      }
      
      if (responseData.data.notifications) {
        console.log(`\n🔔 Notifications:`);
        console.log(`   Success: ${responseData.data.notifications.success_count}`);
        console.log(`   Failed: ${responseData.data.notifications.failure_count}`);
      }
    } else {
      console.log(`\n❌ Request failed`);
      console.log(`Error: ${responseData.msg || 'Unknown error'}`);
      if (responseData.data) {
        console.log(`Data:`, JSON.stringify(responseData.data, null, 2));
      }
    }

    console.log('\n✅ Test complete!\n');
  } catch (error) {
    console.error(`\n❌ Error making API request:`, error.message);
    console.error(`Full error:`, error);
    process.exit(1);
  }
}

main().catch(error => {
  console.error('❌ Error:', error);
  process.exit(1);
});

