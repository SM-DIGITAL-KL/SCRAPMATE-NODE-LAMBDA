require('dotenv').config();
const SubscriptionPackage = require('../models/SubscriptionPackage');

/**
 * Script to update an existing subscription plan in the database
 * 
 * Usage: node scripts/updateSubscriptionPlan.js
 * 
 * Modify the packageId and updateData object below
 */

async function updateSubscriptionPlan() {
  try {
    console.log('📦 Updating subscription plan...\n');

    // ============================================
    // MODIFY THESE VALUES
    // ============================================
    const packageId = 'b2b-order'; // ID of the package to update
    
    // Only include fields you want to update
    const updateData = {
      name: 'B2B Per Order (0.5%)',
      price: 0, // Set to 0 for percentage-based pricing
      description: 'B2B subscription plan - Pay 0.5% of each order value when accepting orders',
      features: [
        'Per order pricing (0.5% of order value)',
        'No upfront cost',
        'Flexible pricing based on order value',
        'Priority support',
        'Real-time tracking'
      ],
      pricePercentage: 0.5, // 0.5% of order value
      isPercentageBased: true // Mark as percentage-based plan
    };

    // Check if package exists
    const existing = await SubscriptionPackage.getById(packageId);
    if (!existing) {
      console.error(`❌ Package with ID "${packageId}" not found`);
      process.exit(1);
    }

    console.log('📋 Current Package:');
    console.log(JSON.stringify(existing, null, 2));
    console.log('\n📝 Update Data:');
    console.log(JSON.stringify(updateData, null, 2));
    console.log('\n💾 Updating...\n');

    const result = await SubscriptionPackage.update(packageId, updateData);

    console.log('✅ Subscription plan updated successfully!');
    console.log('\n📦 Updated Package:');
    console.log(JSON.stringify(result, null, 2));
    console.log('\n💡 Note: Cache will be invalidated on next API call');

  } catch (error) {
    console.error('❌ Error updating subscription plan:', error);
    console.error('   Error details:', error.message);
    if (error.stack) {
      console.error('   Stack trace:', error.stack);
    }
    process.exit(1);
  }
}

// Run the script
updateSubscriptionPlan();

