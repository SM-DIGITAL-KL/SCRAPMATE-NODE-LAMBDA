require('dotenv').config();
const SubscriptionPackage = require('../models/SubscriptionPackage');

/**
 * Script to add a new subscription plan to the database
 * 
 * Usage: node scripts/addSubscriptionPlan.js
 * 
 * Modify the packageData object below with your subscription plan details
 */

async function addSubscriptionPlan() {
  try {
    console.log('📦 Adding new subscription plan...\n');

    // ============================================
    // MODIFY THIS OBJECT WITH YOUR PLAN DETAILS
    // ============================================
    const packageData = {
      id: 'b2b-per-order-0.5', // Unique identifier (e.g., 'b2b-per-order-0.5', 'b2b-monthly', 'b2c-yearly')
      name: 'B2B Per Order (0.5%)', // Display name
      price: 0, // For percentage-based plans, set to 0. For fixed price plans, set the amount
      duration: 'order', // 'month', 'year', or 'order'
      description: 'Pay 0.5% of each order value when accepting orders', // Description
      features: [
        'Accept unlimited orders',
        'Pay 0.5% per order',
        'No upfront cost',
        'Flexible pricing'
      ], // Array of features
      popular: false, // Set to true to mark as popular/recommended
      userType: 'b2b', // 'b2b' or 'b2c'
      upiId: '', // UPI ID for payment (optional)
      merchantName: '', // Merchant name for payment (optional)
      isActive: true, // Set to false to disable the plan
      pricePercentage: 0.5, // For percentage-based pricing (0.5 = 0.5%)
      isPercentageBased: true // Set to true for percentage-based plans
    };

    // Validate required fields
    if (!packageData.id || !packageData.name || packageData.price === undefined || !packageData.duration) {
      console.error('❌ Missing required fields: id, name, price, duration');
      process.exit(1);
    }

    // Validate duration
    if (!['month', 'year', 'order'].includes(packageData.duration)) {
      console.error('❌ Invalid duration. Must be "month", "year", or "order"');
      process.exit(1);
    }

    // Validate userType
    if (packageData.userType && !['b2b', 'b2c'].includes(packageData.userType)) {
      console.error('❌ Invalid userType. Must be "b2b" or "b2c"');
      process.exit(1);
    }

    // Check if package already exists
    const existing = await SubscriptionPackage.getById(packageData.id);
    if (existing) {
      console.log(`⚠️  Package with ID "${packageData.id}" already exists:`);
      console.log(JSON.stringify(existing, null, 2));
      console.log('\n❌ Use updateSubscriptionPackage.js to update existing packages');
      process.exit(1);
    }

    // Create the subscription package
    console.log('📋 Package Details:');
    console.log(JSON.stringify(packageData, null, 2));
    console.log('\n💾 Saving to database...\n');

    const result = await SubscriptionPackage.upsert(packageData);

    console.log('✅ Subscription plan added successfully!');
    console.log('\n📦 Created Package:');
    console.log(JSON.stringify(result, null, 2));
    console.log('\n💡 Note: Cache will be invalidated on next API call');
    console.log('   You may need to clear Redis cache manually if needed');

  } catch (error) {
    console.error('❌ Error adding subscription plan:', error);
    console.error('   Error details:', error.message);
    if (error.stack) {
      console.error('   Stack trace:', error.stack);
    }
    process.exit(1);
  }
}

// Run the script
addSubscriptionPlan();




