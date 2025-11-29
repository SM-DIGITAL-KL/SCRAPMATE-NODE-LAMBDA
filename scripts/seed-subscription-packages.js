/**
 * Seed Subscription Packages to DynamoDB
 * Creates default subscription packages for B2B and B2C users
 */

require('dotenv').config();
const { loadEnvFromFile } = require('../utils/loadEnv');
loadEnvFromFile();

const SubscriptionPackage = require('../models/SubscriptionPackage');

const packages = [
  {
    id: 'b2b-order',
    name: 'B2B Per Order',
    price: 999,
    duration: 'order',
    description: 'B2B subscription plan - ₹999 + GST per order',
    features: [
      'Per order pricing',
      'GST applicable',
      'Priority support',
      'Real-time tracking',
    ],
    popular: false,
    userType: 'b2b',
    upiId: '7736068251@pthdfc',
    merchantName: 'Scrapmate Partner',
    isActive: true,
  },
  {
    id: 'b2c-monthly',
    name: 'Monthly Plan',
    price: 269,
    duration: 'month',
    description: 'Monthly subscription plan for unlimited orders',
    features: [
      'Unlimited orders',
      'Priority support',
      'Real-time tracking',
      'Monthly reports',
    ],
    popular: false,
    userType: 'b2c',
    upiId: '7736068251@pthdfc',
    merchantName: 'Scrapmate Partner',
    isActive: true,
  },
  {
    id: 'b2c-yearly',
    name: 'Yearly Plan',
    price: 2699,
    duration: 'year',
    description: 'Yearly subscription plan for unlimited orders',
    features: [
      'Unlimited orders',
      'Priority support',
      'Real-time tracking',
      'Monthly reports',
      'Save ₹540 (2 months free)',
      'Annual analytics',
    ],
    popular: true,
    userType: 'b2c',
    upiId: '7736068251@pthdfc',
    merchantName: 'Scrapmate Partner',
    isActive: true,
  },
];

async function seedPackages() {
  console.log('🌱 Starting to seed subscription packages...\n');

  for (const packageData of packages) {
    try {
      console.log(`📦 Creating package: ${packageData.name} (${packageData.id})...`);
      const result = await SubscriptionPackage.upsert(packageData);
      console.log(`✅ Created: ${result.name} - ₹${result.price}/${result.duration}\n`);
    } catch (error) {
      console.error(`❌ Failed to create package ${packageData.id}:`, error.message);
      if (error.name === 'ResourceNotFoundException' || error.__type?.includes('ResourceNotFoundException')) {
        console.error('   ⚠️  DynamoDB table "subscription_packages" does not exist!');
        console.error('   Please create the table first using:');
        console.error('   aws dynamodb create-table \\');
        console.error('     --table-name subscription_packages \\');
        console.error('     --attribute-definitions AttributeName=id,AttributeType=S \\');
        console.error('     --key-schema AttributeName=id,KeyType=HASH \\');
        console.error('     --billing-mode PAY_PER_REQUEST');
        process.exit(1);
      }
    }
  }

  console.log('✅ All subscription packages seeded successfully!');
  console.log('\n📋 Summary:');
  packages.forEach(pkg => {
    console.log(`   - ${pkg.name}: ₹${pkg.price}/${pkg.duration} (${pkg.userType})`);
  });
}

// Run the seed function
seedPackages()
  .then(() => {
    console.log('\n🎉 Seeding completed!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Seeding failed:', error);
    process.exit(1);
  });

