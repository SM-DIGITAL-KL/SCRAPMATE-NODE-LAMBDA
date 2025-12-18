/**
 * Test script to verify category name changes appear in incremental updates
 * 
 * Usage:
 * 1. Run this script to get a timestamp
 * 2. Update a category name in admin panel (e.g., change "Papers" to "Paper")
 * 3. Run this script again with the timestamp from step 1
 * 4. The updated category should appear in the response
 */

const fetch = require('node-fetch');

const BASE_URL = process.env.API_URL || 'http://localhost:3000';
const API_KEY = process.env.API_KEY || 'zyubkfzeumeoviaqzcsrvfwdzbiwnlnn';

// Get timestamp from command line argument or use 1 day ago
const lastUpdatedOn = process.argv[2] || new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

async function testCategoryNameChange() {
  console.log('\n' + '='.repeat(80));
  console.log('🧪 Testing Category Name Changes in Incremental Updates');
  console.log('='.repeat(80));
  console.log(`Base URL: ${BASE_URL}`);
  console.log(`Last Updated On: ${lastUpdatedOn}`);
  console.log('');

  try {
    const url = `${BASE_URL}/api/v2/categories/incremental-updates?userType=b2c&lastUpdatedOn=${encodeURIComponent(lastUpdatedOn)}`;
    
    console.log('📡 Making request to:', url);
    console.log('');

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'api-key': API_KEY,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();

    console.log('📊 Response:');
    console.log(`   Status: ${data.status}`);
    console.log(`   Message: ${data.msg}`);
    console.log(`   Has Updates: ${data.meta?.hasUpdates || false}`);
    console.log(`   Categories Count: ${data.data?.categories?.length || 0}`);
    console.log(`   Subcategories Count: ${data.data?.subcategories?.length || 0}`);
    console.log(`   Last Updated On (response): ${data.meta?.lastUpdatedOn || 'N/A'}`);
    console.log('');

    if (data.data?.categories && data.data.categories.length > 0) {
      console.log('📋 Updated Categories:');
      console.log('');
      data.data.categories.forEach((cat, index) => {
        console.log(`   ${index + 1}. ID: ${cat.id}`);
        console.log(`      Name: "${cat.name}"`);
        console.log(`      Updated At: ${cat.updated_at || 'N/A'}`);
        console.log(`      Image: ${cat.image ? cat.image.substring(0, 50) + '...' : 'N/A'}`);
        console.log(`      Available In: B2B=${cat.available_in?.b2b ? 'Yes' : 'No'}, B2C=${cat.available_in?.b2c ? 'Yes' : 'No'}`);
        console.log('');
      });
      console.log('✅ Category name changes are being detected!');
    } else {
      console.log('ℹ️  No updated categories found.');
      console.log('   This could mean:');
      console.log('   - No categories were updated since the timestamp');
      console.log('   - The timestamp is too recent');
      console.log('');
      console.log('💡 To test:');
      console.log('   1. Note the current timestamp:', new Date().toISOString());
      console.log('   2. Update a category name in admin panel');
      console.log('   3. Run this script with: node test-category-name-change.js <timestamp>');
    }

    if (data.data?.subcategories && data.data.subcategories.length > 0) {
      console.log('📋 Updated Subcategories:');
      console.log('');
      data.data.subcategories.slice(0, 5).forEach((sub, index) => {
        console.log(`   ${index + 1}. ID: ${sub.id}`);
        console.log(`      Name: "${sub.name}"`);
        console.log(`      Category ID: ${sub.main_category_id}`);
        console.log(`      Updated At: ${sub.updated_at || 'N/A'}`);
        console.log('');
      });
      if (data.data.subcategories.length > 5) {
        console.log(`   ... and ${data.data.subcategories.length - 5} more subcategories`);
      }
    }

    console.log('');
    console.log('='.repeat(80));
    console.log('✅ Test completed successfully!');
    console.log('='.repeat(80));
    console.log('');

  } catch (error) {
    console.error('❌ Error testing incremental updates:', error.message);
    console.error('Stack:', error.stack);
    process.exit(1);
  }
}

// Run the test
testCategoryNameChange();


 * Test script to verify category name changes appear in incremental updates
 * 
 * Usage:
 * 1. Run this script to get a timestamp
 * 2. Update a category name in admin panel (e.g., change "Papers" to "Paper")
 * 3. Run this script again with the timestamp from step 1
 * 4. The updated category should appear in the response
 */

const fetch = require('node-fetch');

const BASE_URL = process.env.API_URL || 'http://localhost:3000';
const API_KEY = process.env.API_KEY || 'zyubkfzeumeoviaqzcsrvfwdzbiwnlnn';

// Get timestamp from command line argument or use 1 day ago
const lastUpdatedOn = process.argv[2] || new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

async function testCategoryNameChange() {
  console.log('\n' + '='.repeat(80));
  console.log('🧪 Testing Category Name Changes in Incremental Updates');
  console.log('='.repeat(80));
  console.log(`Base URL: ${BASE_URL}`);
  console.log(`Last Updated On: ${lastUpdatedOn}`);
  console.log('');

  try {
    const url = `${BASE_URL}/api/v2/categories/incremental-updates?userType=b2c&lastUpdatedOn=${encodeURIComponent(lastUpdatedOn)}`;
    
    console.log('📡 Making request to:', url);
    console.log('');

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'api-key': API_KEY,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();

    console.log('📊 Response:');
    console.log(`   Status: ${data.status}`);
    console.log(`   Message: ${data.msg}`);
    console.log(`   Has Updates: ${data.meta?.hasUpdates || false}`);
    console.log(`   Categories Count: ${data.data?.categories?.length || 0}`);
    console.log(`   Subcategories Count: ${data.data?.subcategories?.length || 0}`);
    console.log(`   Last Updated On (response): ${data.meta?.lastUpdatedOn || 'N/A'}`);
    console.log('');

    if (data.data?.categories && data.data.categories.length > 0) {
      console.log('📋 Updated Categories:');
      console.log('');
      data.data.categories.forEach((cat, index) => {
        console.log(`   ${index + 1}. ID: ${cat.id}`);
        console.log(`      Name: "${cat.name}"`);
        console.log(`      Updated At: ${cat.updated_at || 'N/A'}`);
        console.log(`      Image: ${cat.image ? cat.image.substring(0, 50) + '...' : 'N/A'}`);
        console.log(`      Available In: B2B=${cat.available_in?.b2b ? 'Yes' : 'No'}, B2C=${cat.available_in?.b2c ? 'Yes' : 'No'}`);
        console.log('');
      });
      console.log('✅ Category name changes are being detected!');
    } else {
      console.log('ℹ️  No updated categories found.');
      console.log('   This could mean:');
      console.log('   - No categories were updated since the timestamp');
      console.log('   - The timestamp is too recent');
      console.log('');
      console.log('💡 To test:');
      console.log('   1. Note the current timestamp:', new Date().toISOString());
      console.log('   2. Update a category name in admin panel');
      console.log('   3. Run this script with: node test-category-name-change.js <timestamp>');
    }

    if (data.data?.subcategories && data.data.subcategories.length > 0) {
      console.log('📋 Updated Subcategories:');
      console.log('');
      data.data.subcategories.slice(0, 5).forEach((sub, index) => {
        console.log(`   ${index + 1}. ID: ${sub.id}`);
        console.log(`      Name: "${sub.name}"`);
        console.log(`      Category ID: ${sub.main_category_id}`);
        console.log(`      Updated At: ${sub.updated_at || 'N/A'}`);
        console.log('');
      });
      if (data.data.subcategories.length > 5) {
        console.log(`   ... and ${data.data.subcategories.length - 5} more subcategories`);
      }
    }

    console.log('');
    console.log('='.repeat(80));
    console.log('✅ Test completed successfully!');
    console.log('='.repeat(80));
    console.log('');

  } catch (error) {
    console.error('❌ Error testing incremental updates:', error.message);
    console.error('Stack:', error.stack);
    process.exit(1);
  }
}

// Run the test
testCategoryNameChange();

