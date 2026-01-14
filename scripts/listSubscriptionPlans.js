require('dotenv').config();
const SubscriptionPackage = require('../models/SubscriptionPackage');

/**
 * Script to list all subscription plans in the database
 * 
 * Usage: node scripts/listSubscriptionPlans.js
 */

async function listSubscriptionPlans() {
  try {
    console.log('📦 Fetching all subscription plans...\n');

    const packages = await SubscriptionPackage.getAll();

    if (packages.length === 0) {
      console.log('ℹ️  No subscription plans found in database');
      return;
    }

    console.log(`✅ Found ${packages.length} subscription plan(s):\n`);
    console.log('='.repeat(80));

    packages.forEach((pkg, index) => {
      console.log(`\n${index + 1}. ${pkg.name} (ID: ${pkg.id})`);
      console.log(`   Duration: ${pkg.duration}`);
      console.log(`   Price: ₹${pkg.price}`);
      if (pkg.isPercentageBased) {
        console.log(`   Percentage: ${pkg.pricePercentage}%`);
      }
      console.log(`   User Type: ${pkg.userType || 'N/A'}`);
      console.log(`   Active: ${pkg.isActive ? 'Yes' : 'No'}`);
      console.log(`   Popular: ${pkg.popular ? 'Yes' : 'No'}`);
      if (pkg.description) {
        console.log(`   Description: ${pkg.description}`);
      }
      if (pkg.features && pkg.features.length > 0) {
        console.log(`   Features: ${pkg.features.join(', ')}`);
      }
      console.log(`   Created: ${pkg.createdAt || 'N/A'}`);
      console.log(`   Updated: ${pkg.updatedAt || 'N/A'}`);
    });

    console.log('\n' + '='.repeat(80));
    console.log(`\n✅ Total: ${packages.length} plan(s)`);

  } catch (error) {
    console.error('❌ Error listing subscription plans:', error);
    console.error('   Error details:', error.message);
    if (error.stack) {
      console.error('   Stack trace:', error.stack);
    }
    process.exit(1);
  }
}

// Run the script
listSubscriptionPlans();






