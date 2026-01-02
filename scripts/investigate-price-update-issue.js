/**
 * Script to investigate why price wasn't updated
 * Checks if there's a logic issue where prices match, so no update happens
 */

const Order = require('../models/Order');
const User = require('../models/User');
const { getDynamoDBClient } = require('../config/dynamodb');
const { ScanCommand } = require('@aws-sdk/lib-dynamodb');

const orderNumber = process.argv[2] || '106881244';
const vendorUserId = process.argv[3] || '1767168699549';

async function investigatePriceUpdate() {
  try {
    console.log(`\n🔍 Investigating price update issue for order #${orderNumber}\n`);
    
    const orders = await Order.findByOrderNo(parseInt(orderNumber));
    if (!orders || orders.length === 0) {
      console.log(`❌ Order ${orderNumber} not found`);
      return;
    }
    
    const order = orders[0];
    const vendor = await User.findById(parseInt(vendorUserId));
    
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📦 Order Info:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`   Order ID: ${order.id}`);
    console.log(`   Order Number: ${order.order_number || order.order_no}`);
    console.log(`   Status: ${order.status}`);
    console.log(`   Created At: ${order.created_at || order.date}`);
    console.log(`   Accepted At: ${order.accepted_at || 'N/A'}`);
    console.log(`   Shop ID: ${order.shop_id}`);
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
        return;
      }
    }
    
    if (!orderdetails || !Array.isArray(orderdetails)) {
      console.log('❌ Order details is not an array');
      return;
    }
    
    // Get vendor's custom prices
    if (!vendor || !vendor.operating_subcategories || !Array.isArray(vendor.operating_subcategories)) {
      console.log('❌ Vendor has no operating_subcategories');
      return;
    }
    
    const vendorPriceMap = new Map();
    vendor.operating_subcategories.forEach(userSubcat => {
      const subcatId = userSubcat.subcategory_id || userSubcat.subcategoryId;
      const customPrice = userSubcat.custom_price || '';
      if (subcatId && customPrice && customPrice.trim() !== '') {
        vendorPriceMap.set(parseInt(subcatId), parseFloat(customPrice));
      }
    });
    
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('💰 Price Analysis:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    let wouldUpdate = false;
    let totalRecalculated = 0;
    let pricesUpdatedCount = 0;
    
    orderdetails.forEach((item, idx) => {
      const materialId = item.material_id || item.subcategory_id;
      const name = item.material_name || item.name || 'Unknown';
      const weight = parseFloat(item.expected_weight_kg || item.weight || 0);
      const currentPricePerKg = parseFloat(item.price_per_kg || item.price || 0);
      const vendorPrice = materialId ? vendorPriceMap.get(parseInt(materialId)) : null;
      
      console.log(`\n   Item ${idx + 1}: ${name}`);
      console.log(`   ────────────────────────────────────────`);
      console.log(`   Material ID: ${materialId}`);
      console.log(`   Weight: ${weight} kg`);
      console.log(`   Current Price: ₹${currentPricePerKg}/kg`);
      console.log(`   Vendor Custom Price: ${vendorPrice !== undefined && vendorPrice !== null ? `₹${vendorPrice}/kg` : 'N/A (no custom price)'}`);
      
      if (vendorPrice !== undefined && vendorPrice !== null) {
        const pricesMatch = Math.abs(vendorPrice - currentPricePerKg) < 0.01;
        console.log(`   Prices Match: ${pricesMatch ? '✅ YES' : '❌ NO'}`);
        
        if (!pricesMatch) {
          console.log(`   ⚠️  PRICE MISMATCH - Should be ₹${vendorPrice}/kg but is ₹${currentPricePerKg}/kg`);
          wouldUpdate = true;
          pricesUpdatedCount++;
          totalRecalculated += vendorPrice * weight;
        } else {
          console.log(`   ✅ Prices match - no update needed`);
          totalRecalculated += currentPricePerKg * weight; // Use current price since it matches
        }
      } else {
        console.log(`   ⚠️  Vendor has no custom price for this subcategory`);
        totalRecalculated += currentPricePerKg * weight; // Use current price
      }
    });
    
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📊 Summary:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`   Current estim_price: ₹${order.estim_price || 0}`);
    console.log(`   Recalculated total: ₹${totalRecalculated.toFixed(2)}`);
    console.log(`   Would prices be updated? ${wouldUpdate ? '✅ YES' : '❌ NO (prices match or vendor has no custom prices)'}`);
    console.log(`   Items with price changes: ${pricesUpdatedCount}`);
    
    if (!wouldUpdate) {
      console.log('\n💡 Explanation:');
      console.log('   The acceptPickupRequest logic only updates orderdetails if:');
      console.log('   1. Vendor has custom prices for the subcategories, AND');
      console.log('   2. The custom prices differ from the current order prices');
      console.log('\n   In this case:');
      if (pricesUpdatedCount === 0) {
        console.log('   - Vendor\'s custom prices MATCH the order prices (or vendor has no custom prices)');
        console.log('   - Therefore, no update was performed (this is correct behavior)');
      }
    } else {
      console.log('\n⚠️  ISSUE DETECTED:');
      console.log('   Prices SHOULD have been updated but weren\'t!');
      console.log('   This suggests a bug in the acceptPickupRequest logic.');
    }
    
    console.log('');
    
  } catch (error) {
    console.error('❌ Error:', error);
    console.error(error.stack);
    process.exit(1);
  }
}

investigatePriceUpdate();


