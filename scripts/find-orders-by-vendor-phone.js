/**
 * Script to find customer app orders completed by a vendor with a specific phone number
 * Usage: node scripts/find-orders-by-vendor-phone.js <phone_number>
 * Example: node scripts/find-orders-by-vendor-phone.js 9074135121
 */

require('dotenv').config();
const User = require('../models/User');
const Shop = require('../models/Shop');
const { getDynamoDBClient } = require('../config/dynamodb');
const { ScanCommand } = require('@aws-sdk/lib-dynamodb');

const phoneNumber = process.argv[2];

if (!phoneNumber) {
  console.error('❌ Please provide a phone number');
  console.log('Usage: node scripts/find-orders-by-vendor-phone.js <phone_number>');
  process.exit(1);
}

async function findOrdersByVendorPhone() {
  try {
    console.log('\n🔍 Finding Customer App Orders Completed by Vendor');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    console.log(`Vendor Phone Number: ${phoneNumber}\n`);

    // Step 1: Find all users with this phone number
    const client = getDynamoDBClient();
    let lastKey = null;
    const allUsers = [];
    
    do {
      const params = {
        TableName: 'users',
        FilterExpression: 'mob_num = :mobile AND (attribute_not_exists(del_status) OR del_status <> :deleted)',
        ExpressionAttributeValues: {
          ':mobile': parseInt(phoneNumber),
          ':deleted': 2
        }
      };
      
      if (lastKey) {
        params.ExclusiveStartKey = lastKey;
      }
      
      const command = new ScanCommand(params);
      const response = await client.send(command);
      
      if (response.Items && response.Items.length > 0) {
        allUsers.push(...response.Items);
      }
      
      lastKey = response.LastEvaluatedKey;
    } while (lastKey);
    
    if (allUsers.length === 0) {
      console.log(`❌ No users found with phone number ${phoneNumber}`);
      return;
    }
    
    console.log(`✅ Found ${allUsers.length} user(s) with phone number ${phoneNumber}\n`);
    
    // Filter for vendor_app users (R, S, SR, D types)
    const vendorUsers = allUsers.filter(u => 
      (u.app_type === 'vendor_app' || !u.app_type) && 
      ['R', 'S', 'SR', 'D'].includes(u.user_type)
    );
    
    if (vendorUsers.length === 0) {
      console.log(`❌ No vendor users found with phone number ${phoneNumber}`);
      console.log('   (Users found but none are vendor type: R, S, SR, or D)');
      return;
    }
    
    console.log(`✅ Found ${vendorUsers.length} vendor user(s):\n`);
    vendorUsers.forEach((user, idx) => {
      console.log(`   ${idx + 1}. User ID: ${user.id}`);
      console.log(`      Name: ${user.name || 'N/A'}`);
      console.log(`      User Type: ${user.user_type || 'N/A'}`);
      console.log(`      App Type: ${user.app_type || 'N/A'}`);
      console.log('');
    });
    
    // Step 2: Find shops for these vendor users
    const shopIds = [];
    const userShopMap = {};
    
    for (const vendorUser of vendorUsers) {
      try {
        let shops = [];
        
        if (vendorUser.user_type === 'SR') {
          // SR users can have multiple shops
          shops = await Shop.findAllByUserId(vendorUser.id);
        } else {
          // R, S, D users have single shop
          const shop = await Shop.findByUserId(vendorUser.id);
          if (shop) {
            shops = [shop];
          }
        }
        
        if (shops && shops.length > 0) {
          shops.forEach(shop => {
            if (shop.id) {
              shopIds.push(parseInt(shop.id));
              if (!userShopMap[vendorUser.id]) {
                userShopMap[vendorUser.id] = [];
              }
              userShopMap[vendorUser.id].push(shop);
            }
          });
        }
      } catch (error) {
        console.error(`⚠️  Error finding shops for user ${vendorUser.id}:`, error.message);
      }
    }
    
    if (shopIds.length === 0) {
      console.log(`❌ No shops found for users with phone number ${phoneNumber}`);
      return;
    }
    
    console.log(`✅ Found ${shopIds.length} shop(s):\n`);
    Object.entries(userShopMap).forEach(([userId, shops]) => {
      const user = vendorUsers.find(u => u.id === parseInt(userId));
      console.log(`   User ${userId} (${user?.name || 'N/A'}):`);
      shops.forEach(shop => {
        console.log(`      - Shop ID: ${shop.id}, Name: ${shop.shopname || shop.company_name || 'N/A'}`);
      });
    });
    console.log('');
    
    // Step 3: Find completed customer app orders (status 5, no bulk_request_id)
    console.log('🔍 Searching for completed customer app orders...\n');
    
    // DynamoDB doesn't support IN clause directly, so we need to build OR conditions
    const shopIdConditions = shopIds.map((shopId, i) => `shop_id = :shopId${i}`).join(' OR ');
    const filterExpression = `(${shopIdConditions}) AND #status = :status5 AND (attribute_not_exists(bulk_request_id) OR bulk_request_id = :nullValue OR bulk_request_id = :emptyString)`;
    
    const expressionAttributeValues = {
      ':status5': 5, // Completed status
      ':nullValue': null,
      ':emptyString': ''
    };
    
    shopIds.forEach((shopId, i) => {
      expressionAttributeValues[`:shopId${i}`] = shopId;
    });
    
    let allOrders = [];
    lastKey = null;
    
    do {
      const command = new ScanCommand({
        TableName: 'orders',
        FilterExpression: filterExpression,
        ExpressionAttributeNames: {
          '#status': 'status'
        },
        ExpressionAttributeValues: expressionAttributeValues
      });
      
      if (lastKey) {
        command.input.ExclusiveStartKey = lastKey;
      }
      
      const response = await client.send(command);
      
      if (response.Items && response.Items.length > 0) {
        allOrders.push(...response.Items);
      }
      
      lastKey = response.LastEvaluatedKey;
    } while (lastKey);
    
    // Filter out any orders that might have bulk_request_id (double check)
    const customerAppOrders = allOrders.filter(order => {
      const bulkRequestId = order.bulk_request_id;
      return !bulkRequestId || bulkRequestId === null || bulkRequestId === '' || bulkRequestId === undefined;
    });
    
    console.log(`✅ Found ${customerAppOrders.length} completed customer app order(s)\n`);
    
    if (customerAppOrders.length === 0) {
      console.log('   No completed customer app orders found for this vendor.');
      return;
    }
    
    // Display order details
    console.log('📦 Completed Customer App Orders:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    
    // Sort by date (most recent first)
    customerAppOrders.sort((a, b) => {
      const dateA = a.pickup_completed_at ? new Date(a.pickup_completed_at).getTime() : 
                    (a.accepted_at ? new Date(a.accepted_at).getTime() : new Date(a.created_at).getTime());
      const dateB = b.pickup_completed_at ? new Date(b.pickup_completed_at).getTime() : 
                    (b.accepted_at ? new Date(b.accepted_at).getTime() : new Date(b.created_at).getTime());
      return dateB - dateA;
    });
    
    customerAppOrders.forEach((order, idx) => {
      const shop = Object.values(userShopMap).flat().find(s => s.id === order.shop_id);
      const vendorUser = vendorUsers.find(u => userShopMap[u.id]?.some(s => s.id === order.shop_id));
      
      console.log(`${idx + 1}. Order #${order.order_number || order.order_no || order.id}`);
      console.log(`   Order ID: ${order.id}`);
      console.log(`   Status: ${order.status} (Completed)`);
      console.log(`   Shop ID: ${order.shop_id}`);
      console.log(`   Shop Name: ${shop?.shopname || shop?.company_name || 'N/A'}`);
      console.log(`   Vendor: ${vendorUser?.name || 'N/A'} (User ID: ${vendorUser?.id || 'N/A'})`);
      console.log(`   Customer ID: ${order.customer_id || 'N/A'}`);
      console.log(`   Estimated Weight: ${order.estim_weight || 0} kg`);
      console.log(`   Estimated Price: ₹${order.estim_price || 0}`);
      console.log(`   Created At: ${order.created_at || 'N/A'}`);
      console.log(`   Accepted At: ${order.accepted_at || 'N/A'}`);
      console.log(`   Completed At: ${order.pickup_completed_at || 'N/A'}`);
      console.log(`   Address: ${order.customerdetails || order.address || 'N/A'}`);
      console.log('');
    });
    
    // Summary
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`\n📊 Summary:`);
    console.log(`   Total Orders: ${customerAppOrders.length}`);
    console.log(`   Total Weight: ${customerAppOrders.reduce((sum, o) => sum + (parseFloat(o.estim_weight) || 0), 0).toFixed(2)} kg`);
    console.log(`   Total Value: ₹${customerAppOrders.reduce((sum, o) => sum + (parseFloat(o.estim_price) || 0), 0).toFixed(2)}`);
    console.log('');
    
  } catch (error) {
    console.error('❌ Error:', error);
    throw error;
  }
}

// Run the script
findOrdersByVendorPhone()
  .then(() => {
    console.log('✅ Script completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Script failed:', error);
    process.exit(1);
  });


