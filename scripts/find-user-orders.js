require('dotenv').config();
const User = require('../models/User');
const Order = require('../models/Order');

async function findUserOrders(phoneNumber) {
  try {
    console.log(`\n🔍 Finding orders for phone number: ${phoneNumber}\n`);

    // Find user by phone number
    const user = await User.findByMobile(phoneNumber);
    
    if (!user) {
      console.log(`❌ User not found for phone number: ${phoneNumber}`);
      return null;
    }

    console.log(`✅ User found:`);
    console.log(`   User ID: ${user.id}`);
    console.log(`   Name: ${user.name || 'N/A'}`);
    console.log(`   Email: ${user.email || 'N/A'}`);
    console.log(`   User Type: ${user.user_type || 'N/A'}`);
    console.log(`   App Type: ${user.app_type || 'N/A'}`);
    console.log(`\n`);

    // Find orders by customer_id
    const orders = await Order.findByCustomerId(user.id);

    if (!orders || orders.length === 0) {
      console.log(`❌ No orders found for user ID: ${user.id}`);
      return null;
    }

    console.log(`✅ Found ${orders.length} order(s):\n`);

    orders.forEach((order, index) => {
      console.log(`📦 Order ${index + 1}:`);
      console.log(`   Order ID: ${order.id}`);
      console.log(`   Order Number: ${order.order_number || 'N/A'}`);
      console.log(`   Customer ID: ${order.customer_id}`);
      console.log(`   Shop ID: ${order.shop_id || 'N/A'}`);
      console.log(`   Status: ${order.status || 'N/A'}`);
      console.log(`   Delivery Type: ${order.del_type || 'N/A'}`);
      console.log(`   Address: ${order.address || order.customerdetails || 'N/A'}`);
      console.log(`   Location: ${order.lat_log || 'N/A'}`);
      console.log(`   Estimated Weight: ${order.estim_weight || 0} kg`);
      console.log(`   Estimated Price: ₹${order.estim_price || 0}`);
      console.log(`   Preferred Pickup Time: ${order.preferred_pickup_time || 'N/A'}`);
      console.log(`   Date: ${order.date || order.created_at || 'N/A'}`);
      console.log(`   Created At: ${order.created_at || 'N/A'}`);
      console.log(`   Updated At: ${order.updated_at || 'N/A'}`);
      
      // Parse order details if available
      if (order.orderdetails) {
        try {
          const orderDetails = typeof order.orderdetails === 'string' 
            ? JSON.parse(order.orderdetails) 
            : order.orderdetails;
          
          if (Array.isArray(orderDetails) && orderDetails.length > 0) {
            console.log(`   Order Details (${orderDetails.length} items):`);
            orderDetails.forEach((item, idx) => {
              console.log(`     ${idx + 1}. ${item.material_name || 'N/A'} - ${item.expected_weight_kg || 0} kg @ ₹${item.price_per_kg || 0}/kg`);
            });
          }
        } catch (e) {
          console.log(`   Order Details: ${order.orderdetails.substring(0, 100)}...`);
        }
      }
      
      console.log(`\n`);
    });

    // Summary
    const pendingOrders = orders.filter(o => o.status === 1 || o.status === '1');
    const assignedOrders = orders.filter(o => o.status === 2 || o.status === '2');
    const completedOrders = orders.filter(o => o.status === 3 || o.status === '3' || o.status === 4 || o.status === '4');

    console.log(`📊 Summary:`);
    console.log(`   Total Orders: ${orders.length}`);
    console.log(`   Pending: ${pendingOrders.length}`);
    console.log(`   Assigned: ${assignedOrders.length}`);
    console.log(`   Completed: ${completedOrders.length}`);

    return { user, orders };
  } catch (error) {
    console.error('❌ Error finding user orders:', error);
    throw error;
  }
}

// Get phone number from command line argument
const phoneNumber = process.argv[2];

if (!phoneNumber) {
  console.error('Usage: node scripts/find-user-orders.js <phone_number>');
  process.exit(1);
}

findUserOrders(phoneNumber)
  .then((result) => {
    if (result) {
      process.exit(0);
    } else {
      process.exit(1);
    }
  })
  .catch((error) => {
    console.error('Error:', error);
    process.exit(1);
  });

