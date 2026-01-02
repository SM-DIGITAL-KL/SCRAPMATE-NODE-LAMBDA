/**
 * Script to find customer orders by phone number
 * Usage: node scripts/find-customer-orders-by-phone.js <phone_number>
 * Example: node scripts/find-customer-orders-by-phone.js 9074135121
 */

const User = require('../models/User');
const Order = require('../models/Order');
const Customer = require('../models/Customer');
const Shop = require('../models/Shop');

const phoneNumber = process.argv[2];

if (!phoneNumber) {
  console.error('❌ Please provide a phone number');
  console.log('Usage: node scripts/find-customer-orders-by-phone.js <phone_number>');
  process.exit(1);
}

async function findCustomerOrders() {
  try {
    console.log(`\n🔍 Finding customer orders for phone number: ${phoneNumber}\n`);
    
    // Find all users with this phone number
    const { getDynamoDBClient } = require('../config/dynamodb');
    const { ScanCommand } = require('@aws-sdk/lib-dynamodb');
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
    
    // Find ONLY customer_app users with user_type 'C' (exclude vendor_app users)
    const customerUsers = allUsers.filter(u => 
      u.app_type === 'customer_app' && 
      u.user_type === 'C' &&
      (u.del_status !== 2 || !u.del_status)
    );
    
    if (customerUsers.length === 0) {
      console.log(`❌ No customer app users found with phone number ${phoneNumber}`);
      console.log(`   Found ${allUsers.length} user(s), but none are customer app users.`);
      console.log(`   User types found: ${allUsers.map(u => `${u.user_type || 'N/A'} (${u.app_type || 'no app_type'})`).join(', ')}`);
      return;
    }
    
    // Use the first customer user (or most recent if multiple)
    const customerUser = customerUsers.sort((a, b) => {
      const dateA = new Date(a.updated_at || a.created_at || 0);
      const dateB = new Date(b.updated_at || b.created_at || 0);
      return dateB - dateA;
    })[0];
    
    console.log('✅ Customer User Found:');
    console.log(`   User ID: ${customerUser.id}`);
    console.log(`   Name: ${customerUser.name || 'N/A'}`);
    console.log(`   Phone: ${customerUser.mob_num || 'N/A'}`);
    console.log(`   User Type: ${customerUser.user_type || 'N/A'}`);
    console.log(`   App Type: ${customerUser.app_type || 'N/A'}`);
    console.log('');
    
    // Find orders for this customer
    const customerId = customerUser.id;
    console.log(`🔍 Finding orders for customer_id: ${customerId}...\n`);
    
    const orders = await Order.findByCustomerId(customerId);
    
    if (!orders || orders.length === 0) {
      console.log(`❌ No orders found for customer ID ${customerId}`);
      return;
    }
    
    console.log(`✅ Found ${orders.length} order(s)\n`);
    
    // Get shop details for orders that have shop_id
    const shopIds = [...new Set(orders.map(o => o.shop_id).filter(Boolean))];
    const shops = await Promise.all(shopIds.map(id => Shop.findById(id).catch(() => null)));
    const shopMap = {};
    shops.forEach(shop => {
      if (shop && shop.id) {
        shopMap[shop.id] = shop;
      }
    });
    
    // Display orders
    orders.forEach((order, index) => {
      console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
      console.log(`📦 Order #${index + 1}`);
      console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
      console.log(`   Order ID: ${order.id}`);
      console.log(`   Order Number: ${order.order_number || order.order_no || 'N/A'}`);
      console.log(`   Status: ${order.status} (${getStatusText(order.status)})`);
      console.log(`   Customer ID: ${order.customer_id}`);
      console.log(`   Shop ID: ${order.shop_id || 'N/A'}`);
      
      if (order.shop_id && shopMap[order.shop_id]) {
        const shop = shopMap[order.shop_id];
        console.log(`   Shop Name: ${shop.shopname || 'N/A'}`);
        console.log(`   Shop Address: ${shop.address || shop.shopaddress || 'N/A'}`);
      }
      
      console.log(`   Estimated Weight: ${order.estim_weight || 0} kg`);
      console.log(`   Estimated Price: ₹${order.estim_price || 0}`);
      console.log(`   Address: ${order.address || order.customerdetails || 'N/A'}`);
      console.log(`   Date: ${order.date || order.created_at || 'N/A'}`);
      
      // Parse orderdetails if available
      if (order.orderdetails) {
        try {
          const orderdetails = typeof order.orderdetails === 'string' 
            ? JSON.parse(order.orderdetails) 
            : order.orderdetails;
          
          if (Array.isArray(orderdetails) && orderdetails.length > 0) {
            console.log(`   Items (${orderdetails.length}):`);
            orderdetails.forEach((item, idx) => {
              const name = item.material_name || item.name || item.category_name || 'Unknown';
              const weight = item.expected_weight_kg || item.weight || 0;
              const price = item.price_per_kg || item.price || 0;
              console.log(`     ${idx + 1}. ${name} - ${weight} kg @ ₹${price}/kg`);
            });
          }
        } catch (e) {
          console.log(`   Order Details: (parse error: ${e.message})`);
        }
      }
      
      console.log('');
    });
    
    // Summary
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📊 Summary');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    const statusCounts = {};
    orders.forEach(order => {
      const status = order.status || 0;
      statusCounts[status] = (statusCounts[status] || 0) + 1;
    });
    
    Object.keys(statusCounts).sort().forEach(status => {
      console.log(`   Status ${status} (${getStatusText(parseInt(status))}): ${statusCounts[status]} order(s)`);
    });
    
    const totalValue = orders.reduce((sum, order) => sum + (parseFloat(order.estim_price) || 0), 0);
    const totalWeight = orders.reduce((sum, order) => sum + (parseFloat(order.estim_weight) || 0), 0);
    console.log(`   Total Orders: ${orders.length}`);
    console.log(`   Total Value: ₹${totalValue.toLocaleString('en-IN')}`);
    console.log(`   Total Weight: ${totalWeight.toFixed(2)} kg`);
    console.log('');
    
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

function getStatusText(status) {
  switch (status) {
    case 1: return 'Pending/Scheduled';
    case 2: return 'Accepted';
    case 3: return 'Pickup Started';
    case 4: return 'Completed';
    case 5: return 'Cancelled';
    case 6: return 'Accepted by Others';
    default: return 'Unknown';
  }
}

findCustomerOrders();

