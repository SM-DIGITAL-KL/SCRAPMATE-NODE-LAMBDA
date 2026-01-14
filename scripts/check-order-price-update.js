/**
 * Script to check if order prices were updated with vendor custom prices
 * Usage: node scripts/check-order-price-update.js <order_number> <vendor_user_id>
 * Example: node scripts/check-order-price-update.js 106881244 1767168699549
 */

const Order = require('../models/Order');
const User = require('../models/User');
const { getDynamoDBClient } = require('@aws-sdk/lib-dynamodb');
const { ScanCommand } = require('@aws-sdk/lib-dynamodb');

const orderNumber = process.argv[2];
const vendorUserId = process.argv[3];

if (!orderNumber || !vendorUserId) {
  console.error('❌ Please provide order number and vendor user ID');
  console.log('Usage: node scripts/check-order-price-update.js <order_number> <vendor_user_id>');
  process.exit(1);
}

async function checkOrderPriceUpdate() {
  try {
    console.log(`\n🔍 Checking order price update for order #${orderNumber} accepted by vendor ${vendorUserId}\n`);
    
    const client = require('../config/dynamodb').getDynamoDBClient();
    const orderNum = parseInt(orderNumber);
    
    // Find order
    const orders = await Order.findByOrderNo(orderNum);
    
    if (!orders || orders.length === 0) {
      console.log(`❌ Order ${orderNumber} not found`);
      return;
    }
    
    const order = orders[0];
    
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📦 Order Details:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`   Order ID: ${order.id}`);
    console.log(`   Order Number: ${order.order_number || order.order_no}`);
    console.log(`   Customer ID: ${order.customer_id}`);
    console.log(`   Shop ID: ${order.shop_id}`);
    console.log(`   Status: ${order.status}`);
    console.log(`   Estimated Price: ₹${order.estim_price || 0}`);
    console.log(`   Estimated Weight: ${order.estim_weight || 0} kg`);
    console.log(`   Accepted At: ${order.accepted_at || 'N/A'}`);
    console.log(`   Created At: ${order.created_at || order.date || 'N/A'}`);
    console.log('');
    
    // Parse orderdetails
    let orderdetails = null;
    if (order.orderdetails) {
      try {
        orderdetails = typeof order.orderdetails === 'string' 
          ? JSON.parse(order.orderdetails) 
          : order.orderdetails;
      } catch (e) {
        console.log('⚠️  Error parsing orderdetails:', e.message);
      }
    }
    
    if (orderdetails && Array.isArray(orderdetails)) {
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('📋 Order Items (Current Prices):');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      orderdetails.forEach((item, idx) => {
        const materialId = item.material_id || item.subcategory_id;
        const name = item.material_name || item.name || 'Unknown';
        const weight = item.expected_weight_kg || item.weight || 0;
        const pricePerKg = item.price_per_kg || item.price || 0;
        const total = pricePerKg * weight;
        console.log(`   ${idx + 1}. ${name} (ID: ${materialId})`);
        console.log(`      Weight: ${weight} kg`);
        console.log(`      Price per kg: ₹${pricePerKg}`);
        console.log(`      Total: ₹${total}`);
        console.log('');
      });
    }
    
    // Check if vendor exists
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('👤 Vendor Details:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    const vendor = await User.findById(parseInt(vendorUserId));
    if (!vendor) {
      console.log(`❌ Vendor user ${vendorUserId} not found`);
      return;
    }
    
    console.log(`   Vendor User ID: ${vendor.id}`);
    console.log(`   Vendor Name: ${vendor.name || 'N/A'}`);
    console.log(`   Vendor Phone: ${vendor.mob_num || 'N/A'}`);
    console.log(`   Vendor Type: ${vendor.user_type || 'N/A'}`);
    console.log(`   App Type: ${vendor.app_type || 'N/A'}`);
    console.log('');
    
    // Check if order was accepted by this vendor
    const Shop = require('../models/Shop');
    let vendorShopId = null;
    
    if (vendor.user_type === 'R') {
      const allShops = await Shop.findAllByUserId(parseInt(vendorUserId));
      const b2cShop = allShops.find(s => parseInt(s.shop_type) === 3);
      if (b2cShop && b2cShop.id) {
        vendorShopId = parseInt(b2cShop.id);
      }
    } else if (vendor.user_type === 'S' || vendor.user_type === 'SR') {
      const shop = await Shop.findByUserId(parseInt(vendorUserId));
      if (shop && shop.id) {
        vendorShopId = parseInt(shop.id);
      }
    }
    
    const orderShopId = order.shop_id ? parseInt(order.shop_id) : null;
    const orderAcceptedByVendor = orderShopId === vendorShopId;
    
    console.log(`   Vendor Shop ID: ${vendorShopId || 'N/A'}`);
    console.log(`   Order Shop ID: ${orderShopId || 'N/A'}`);
    console.log(`   Order Accepted by This Vendor: ${orderAcceptedByVendor ? '✅ YES' : '❌ NO'}`);
    console.log('');
    
    if (!orderAcceptedByVendor) {
      console.log('⚠️  This order was not accepted by the specified vendor');
      console.log('   The price update logic only applies when the vendor accepts the order.');
      return;
    }
    
    // Get vendor's custom prices
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('💰 Vendor Custom Prices:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    if (!vendor.operating_subcategories || !Array.isArray(vendor.operating_subcategories)) {
      console.log('❌ Vendor has no operating_subcategories');
      return;
    }
    
    // Create map of vendor custom prices
    const vendorPriceMap = new Map();
    vendor.operating_subcategories.forEach(userSubcat => {
      const subcatId = userSubcat.subcategory_id || userSubcat.subcategoryId;
      const customPrice = userSubcat.custom_price || '';
      if (subcatId && customPrice && customPrice.trim() !== '') {
        vendorPriceMap.set(parseInt(subcatId), parseFloat(customPrice));
      }
    });
    
    console.log(`   Vendor has ${vendorPriceMap.size} subcategories with custom prices\n`);
    
    if (vendorPriceMap.size === 0) {
      console.log('⚠️  Vendor has no custom prices set');
      console.log('   Prices would not be updated if vendor has no custom prices.');
      return;
    }
    
    // Show vendor's custom prices
    vendorPriceMap.forEach((price, subcatId) => {
      console.log(`   Subcategory ID ${subcatId}: ₹${price}/kg`);
    });
    console.log('');
    
    // Compare order prices with vendor prices
    if (orderdetails && Array.isArray(orderdetails)) {
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('🔍 Price Comparison:');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      
      let pricesShouldHaveChanged = false;
      let totalPrice = 0;
      
      orderdetails.forEach((item, idx) => {
        const materialId = item.material_id || item.subcategory_id;
        const name = item.material_name || item.name || 'Unknown';
        const weight = item.expected_weight_kg || item.weight || 0;
        const currentPricePerKg = item.price_per_kg || item.price || 0;
        const vendorPrice = materialId ? vendorPriceMap.get(parseInt(materialId)) : null;
        
        if (vendorPrice !== undefined && vendorPrice !== null) {
          const shouldBe = vendorPrice;
          const actualIs = currentPricePerKg;
          const isCorrect = Math.abs(shouldBe - actualIs) < 0.01;
          
          console.log(`   ${idx + 1}. ${name} (ID: ${materialId}):`);
          console.log(`      Current Price: ₹${actualIs}/kg`);
          console.log(`      Vendor Custom Price: ₹${shouldBe}/kg`);
          
          if (!isCorrect) {
            console.log(`      ❌ MISMATCH - Should be ₹${shouldBe}/kg but is ₹${actualIs}/kg`);
            pricesShouldHaveChanged = true;
          } else {
            console.log(`      ✅ Correct - Matches vendor custom price`);
          }
          
          totalPrice += shouldBe * weight;
        } else {
          console.log(`   ${idx + 1}. ${name} (ID: ${materialId}):`);
          console.log(`      Current Price: ₹${currentPricePerKg}/kg`);
          console.log(`      Vendor Custom Price: N/A (vendor doesn't have custom price for this subcategory)`);
          totalPrice += currentPricePerKg * weight;
        }
        console.log('');
      });
      
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('💰 Price Summary:');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log(`   Current Estimated Price: ₹${order.estim_price || 0}`);
      console.log(`   Expected Total (with vendor prices): ₹${totalPrice.toFixed(2)}`);
      
      if (pricesShouldHaveChanged) {
        console.log(`   ❌ ISSUE: Order prices were NOT updated with vendor custom prices`);
        console.log(`   The acceptPickupRequest function should have updated these prices.`);
      } else {
        console.log(`   ✅ Prices appear to be correct`);
      }
      console.log('');
    }
    
  } catch (error) {
    console.error('❌ Error:', error);
    console.error(error.stack);
    process.exit(1);
  }
}

checkOrderPriceUpdate();

 * Script to check if order prices were updated with vendor custom prices
 * Usage: node scripts/check-order-price-update.js <order_number> <vendor_user_id>
 * Example: node scripts/check-order-price-update.js 106881244 1767168699549
 */

const Order = require('../models/Order');
const User = require('../models/User');
const { getDynamoDBClient } = require('@aws-sdk/lib-dynamodb');
const { ScanCommand } = require('@aws-sdk/lib-dynamodb');

const orderNumber = process.argv[2];
const vendorUserId = process.argv[3];

if (!orderNumber || !vendorUserId) {
  console.error('❌ Please provide order number and vendor user ID');
  console.log('Usage: node scripts/check-order-price-update.js <order_number> <vendor_user_id>');
  process.exit(1);
}

async function checkOrderPriceUpdate() {
  try {
    console.log(`\n🔍 Checking order price update for order #${orderNumber} accepted by vendor ${vendorUserId}\n`);
    
    const client = require('../config/dynamodb').getDynamoDBClient();
    const orderNum = parseInt(orderNumber);
    
    // Find order
    const orders = await Order.findByOrderNo(orderNum);
    
    if (!orders || orders.length === 0) {
      console.log(`❌ Order ${orderNumber} not found`);
      return;
    }
    
    const order = orders[0];
    
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📦 Order Details:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`   Order ID: ${order.id}`);
    console.log(`   Order Number: ${order.order_number || order.order_no}`);
    console.log(`   Customer ID: ${order.customer_id}`);
    console.log(`   Shop ID: ${order.shop_id}`);
    console.log(`   Status: ${order.status}`);
    console.log(`   Estimated Price: ₹${order.estim_price || 0}`);
    console.log(`   Estimated Weight: ${order.estim_weight || 0} kg`);
    console.log(`   Accepted At: ${order.accepted_at || 'N/A'}`);
    console.log(`   Created At: ${order.created_at || order.date || 'N/A'}`);
    console.log('');
    
    // Parse orderdetails
    let orderdetails = null;
    if (order.orderdetails) {
      try {
        orderdetails = typeof order.orderdetails === 'string' 
          ? JSON.parse(order.orderdetails) 
          : order.orderdetails;
      } catch (e) {
        console.log('⚠️  Error parsing orderdetails:', e.message);
      }
    }
    
    if (orderdetails && Array.isArray(orderdetails)) {
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('📋 Order Items (Current Prices):');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      orderdetails.forEach((item, idx) => {
        const materialId = item.material_id || item.subcategory_id;
        const name = item.material_name || item.name || 'Unknown';
        const weight = item.expected_weight_kg || item.weight || 0;
        const pricePerKg = item.price_per_kg || item.price || 0;
        const total = pricePerKg * weight;
        console.log(`   ${idx + 1}. ${name} (ID: ${materialId})`);
        console.log(`      Weight: ${weight} kg`);
        console.log(`      Price per kg: ₹${pricePerKg}`);
        console.log(`      Total: ₹${total}`);
        console.log('');
      });
    }
    
    // Check if vendor exists
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('👤 Vendor Details:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    const vendor = await User.findById(parseInt(vendorUserId));
    if (!vendor) {
      console.log(`❌ Vendor user ${vendorUserId} not found`);
      return;
    }
    
    console.log(`   Vendor User ID: ${vendor.id}`);
    console.log(`   Vendor Name: ${vendor.name || 'N/A'}`);
    console.log(`   Vendor Phone: ${vendor.mob_num || 'N/A'}`);
    console.log(`   Vendor Type: ${vendor.user_type || 'N/A'}`);
    console.log(`   App Type: ${vendor.app_type || 'N/A'}`);
    console.log('');
    
    // Check if order was accepted by this vendor
    const Shop = require('../models/Shop');
    let vendorShopId = null;
    
    if (vendor.user_type === 'R') {
      const allShops = await Shop.findAllByUserId(parseInt(vendorUserId));
      const b2cShop = allShops.find(s => parseInt(s.shop_type) === 3);
      if (b2cShop && b2cShop.id) {
        vendorShopId = parseInt(b2cShop.id);
      }
    } else if (vendor.user_type === 'S' || vendor.user_type === 'SR') {
      const shop = await Shop.findByUserId(parseInt(vendorUserId));
      if (shop && shop.id) {
        vendorShopId = parseInt(shop.id);
      }
    }
    
    const orderShopId = order.shop_id ? parseInt(order.shop_id) : null;
    const orderAcceptedByVendor = orderShopId === vendorShopId;
    
    console.log(`   Vendor Shop ID: ${vendorShopId || 'N/A'}`);
    console.log(`   Order Shop ID: ${orderShopId || 'N/A'}`);
    console.log(`   Order Accepted by This Vendor: ${orderAcceptedByVendor ? '✅ YES' : '❌ NO'}`);
    console.log('');
    
    if (!orderAcceptedByVendor) {
      console.log('⚠️  This order was not accepted by the specified vendor');
      console.log('   The price update logic only applies when the vendor accepts the order.');
      return;
    }
    
    // Get vendor's custom prices
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('💰 Vendor Custom Prices:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    if (!vendor.operating_subcategories || !Array.isArray(vendor.operating_subcategories)) {
      console.log('❌ Vendor has no operating_subcategories');
      return;
    }
    
    // Create map of vendor custom prices
    const vendorPriceMap = new Map();
    vendor.operating_subcategories.forEach(userSubcat => {
      const subcatId = userSubcat.subcategory_id || userSubcat.subcategoryId;
      const customPrice = userSubcat.custom_price || '';
      if (subcatId && customPrice && customPrice.trim() !== '') {
        vendorPriceMap.set(parseInt(subcatId), parseFloat(customPrice));
      }
    });
    
    console.log(`   Vendor has ${vendorPriceMap.size} subcategories with custom prices\n`);
    
    if (vendorPriceMap.size === 0) {
      console.log('⚠️  Vendor has no custom prices set');
      console.log('   Prices would not be updated if vendor has no custom prices.');
      return;
    }
    
    // Show vendor's custom prices
    vendorPriceMap.forEach((price, subcatId) => {
      console.log(`   Subcategory ID ${subcatId}: ₹${price}/kg`);
    });
    console.log('');
    
    // Compare order prices with vendor prices
    if (orderdetails && Array.isArray(orderdetails)) {
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('🔍 Price Comparison:');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      
      let pricesShouldHaveChanged = false;
      let totalPrice = 0;
      
      orderdetails.forEach((item, idx) => {
        const materialId = item.material_id || item.subcategory_id;
        const name = item.material_name || item.name || 'Unknown';
        const weight = item.expected_weight_kg || item.weight || 0;
        const currentPricePerKg = item.price_per_kg || item.price || 0;
        const vendorPrice = materialId ? vendorPriceMap.get(parseInt(materialId)) : null;
        
        if (vendorPrice !== undefined && vendorPrice !== null) {
          const shouldBe = vendorPrice;
          const actualIs = currentPricePerKg;
          const isCorrect = Math.abs(shouldBe - actualIs) < 0.01;
          
          console.log(`   ${idx + 1}. ${name} (ID: ${materialId}):`);
          console.log(`      Current Price: ₹${actualIs}/kg`);
          console.log(`      Vendor Custom Price: ₹${shouldBe}/kg`);
          
          if (!isCorrect) {
            console.log(`      ❌ MISMATCH - Should be ₹${shouldBe}/kg but is ₹${actualIs}/kg`);
            pricesShouldHaveChanged = true;
          } else {
            console.log(`      ✅ Correct - Matches vendor custom price`);
          }
          
          totalPrice += shouldBe * weight;
        } else {
          console.log(`   ${idx + 1}. ${name} (ID: ${materialId}):`);
          console.log(`      Current Price: ₹${currentPricePerKg}/kg`);
          console.log(`      Vendor Custom Price: N/A (vendor doesn't have custom price for this subcategory)`);
          totalPrice += currentPricePerKg * weight;
        }
        console.log('');
      });
      
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('💰 Price Summary:');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log(`   Current Estimated Price: ₹${order.estim_price || 0}`);
      console.log(`   Expected Total (with vendor prices): ₹${totalPrice.toFixed(2)}`);
      
      if (pricesShouldHaveChanged) {
        console.log(`   ❌ ISSUE: Order prices were NOT updated with vendor custom prices`);
        console.log(`   The acceptPickupRequest function should have updated these prices.`);
      } else {
        console.log(`   ✅ Prices appear to be correct`);
      }
      console.log('');
    }
    
  } catch (error) {
    console.error('❌ Error:', error);
    console.error(error.stack);
    process.exit(1);
  }
}

checkOrderPriceUpdate();




