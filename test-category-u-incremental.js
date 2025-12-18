/**
 * Test script to verify incremental updates API for category 'U' (common users)
 * This tests what the scrapmate app (common users) would receive
 */

const fetch = require('node-fetch');

const BASE_URL = process.env.API_URL || 'http://localhost:3000';
const API_KEY = process.env.API_KEY || 'zyubkfzeumeoviaqzcsrvfwdzbiwnlnn';

async function testCategoryUIncrementalUpdates() {
  console.log('\n' + '='.repeat(80));
  console.log('🧪 Testing Incremental Updates API for Category U (Common Users)');
  console.log('='.repeat(80));
  console.log(`Base URL: ${BASE_URL}`);
  console.log('');

  try {
    // Test 1: Test with userType=b2c (what scrapmate app currently uses)
    console.log('🔍 Test 1: Testing with userType=b2c (current scrapmate app setting)');
    console.log('   This is what the scrapmate app currently calls');
    console.log('');
    
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const url1 = `${BASE_URL}/api/v2/categories/incremental-updates?userType=b2c&lastUpdatedOn=${encodeURIComponent(oneDayAgo)}`;
    
    console.log(`   URL: ${url1}`);
    console.log('');

    const response1 = await fetch(url1, {
      method: 'GET',
      headers: {
        'api-key': API_KEY,
        'Content-Type': 'application/json'
      }
    });

    const data1 = await response1.json();

    console.log('📊 Response (userType=b2c):');
    console.log(`   Status: ${data1.status}`);
    console.log(`   Has Updates: ${data1.meta?.hasUpdates || false}`);
    console.log(`   Categories Count: ${data1.data?.categories?.length || 0}`);
    console.log(`   Subcategories Count: ${data1.data?.subcategories?.length || 0}`);
    console.log('');

    if (data1.data?.categories && data1.data.categories.length > 0) {
      console.log('   📋 Categories returned:');
      data1.data.categories.forEach((cat, index) => {
        console.log(`      ${index + 1}. ID: ${cat.id}, Name: "${cat.name}"`);
        console.log(`         Available: B2B=${cat.available_in?.b2b ? 'Yes' : 'No'}, B2C=${cat.available_in?.b2c ? 'Yes' : 'No'}`);
      });
    }
    console.log('');

    // Test 2: Test with userType=all (should show all categories)
    console.log('🔍 Test 2: Testing with userType=all (should show all categories)');
    console.log('');
    
    const url2 = `${BASE_URL}/api/v2/categories/incremental-updates?userType=all&lastUpdatedOn=${encodeURIComponent(oneDayAgo)}`;
    
    const response2 = await fetch(url2, {
      method: 'GET',
      headers: {
        'api-key': API_KEY,
        'Content-Type': 'application/json'
      }
    });

    const data2 = await response2.json();

    console.log('📊 Response (userType=all):');
    console.log(`   Status: ${data2.status}`);
    console.log(`   Has Updates: ${data2.meta?.hasUpdates || false}`);
    console.log(`   Categories Count: ${data2.data?.categories?.length || 0}`);
    console.log(`   Subcategories Count: ${data2.data?.subcategories?.length || 0}`);
    console.log('');

    if (data2.data?.categories && data2.data.categories.length > 0) {
      console.log('   📋 All Categories returned:');
      data2.data.categories.forEach((cat, index) => {
        console.log(`      ${index + 1}. ID: ${cat.id}, Name: "${cat.name}"`);
        console.log(`         Available: B2B=${cat.available_in?.b2b ? 'Yes' : 'No'}, B2C=${cat.available_in?.b2c ? 'Yes' : 'No'}`);
      });
    }
    console.log('');

    // Test 3: Test without userType (should default to all)
    console.log('🔍 Test 3: Testing without userType parameter (defaults to all)');
    console.log('');
    
    const url3 = `${BASE_URL}/api/v2/categories/incremental-updates?lastUpdatedOn=${encodeURIComponent(oneDayAgo)}`;
    
    const response3 = await fetch(url3, {
      method: 'GET',
      headers: {
        'api-key': API_KEY,
        'Content-Type': 'application/json'
      }
    });

    const data3 = await response3.json();

    console.log('📊 Response (no userType):');
    console.log(`   Status: ${data3.status}`);
    console.log(`   Categories Count: ${data3.data?.categories?.length || 0}`);
    console.log(`   Subcategories Count: ${data3.data?.subcategories?.length || 0}`);
    console.log('');

    // Summary
    console.log('='.repeat(80));
    console.log('✅ Test Summary:');
    console.log('='.repeat(80));
    console.log(`✓ userType=b2c: ${data1.data?.categories?.length || 0} categories`);
    console.log(`✓ userType=all: ${data2.data?.categories?.length || 0} categories`);
    console.log(`✓ no userType: ${data3.data?.categories?.length || 0} categories`);
    console.log('');
    console.log('💡 Note: The scrapmate app (common users, category U) currently uses userType=b2c');
    console.log('   This means it will only receive categories available for B2C users.');
    console.log('   If category U needs different categories, consider using userType=all');
    console.log('');

  } catch (error) {
    console.error('❌ Error testing incremental updates:', error.message);
    console.error('Stack:', error.stack);
    process.exit(1);
  }
}

// Run the test
testCategoryUIncrementalUpdates();


 * Test script to verify incremental updates API for category 'U' (common users)
 * This tests what the scrapmate app (common users) would receive
 */

const fetch = require('node-fetch');

const BASE_URL = process.env.API_URL || 'http://localhost:3000';
const API_KEY = process.env.API_KEY || 'zyubkfzeumeoviaqzcsrvfwdzbiwnlnn';

async function testCategoryUIncrementalUpdates() {
  console.log('\n' + '='.repeat(80));
  console.log('🧪 Testing Incremental Updates API for Category U (Common Users)');
  console.log('='.repeat(80));
  console.log(`Base URL: ${BASE_URL}`);
  console.log('');

  try {
    // Test 1: Test with userType=b2c (what scrapmate app currently uses)
    console.log('🔍 Test 1: Testing with userType=b2c (current scrapmate app setting)');
    console.log('   This is what the scrapmate app currently calls');
    console.log('');
    
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const url1 = `${BASE_URL}/api/v2/categories/incremental-updates?userType=b2c&lastUpdatedOn=${encodeURIComponent(oneDayAgo)}`;
    
    console.log(`   URL: ${url1}`);
    console.log('');

    const response1 = await fetch(url1, {
      method: 'GET',
      headers: {
        'api-key': API_KEY,
        'Content-Type': 'application/json'
      }
    });

    const data1 = await response1.json();

    console.log('📊 Response (userType=b2c):');
    console.log(`   Status: ${data1.status}`);
    console.log(`   Has Updates: ${data1.meta?.hasUpdates || false}`);
    console.log(`   Categories Count: ${data1.data?.categories?.length || 0}`);
    console.log(`   Subcategories Count: ${data1.data?.subcategories?.length || 0}`);
    console.log('');

    if (data1.data?.categories && data1.data.categories.length > 0) {
      console.log('   📋 Categories returned:');
      data1.data.categories.forEach((cat, index) => {
        console.log(`      ${index + 1}. ID: ${cat.id}, Name: "${cat.name}"`);
        console.log(`         Available: B2B=${cat.available_in?.b2b ? 'Yes' : 'No'}, B2C=${cat.available_in?.b2c ? 'Yes' : 'No'}`);
      });
    }
    console.log('');

    // Test 2: Test with userType=all (should show all categories)
    console.log('🔍 Test 2: Testing with userType=all (should show all categories)');
    console.log('');
    
    const url2 = `${BASE_URL}/api/v2/categories/incremental-updates?userType=all&lastUpdatedOn=${encodeURIComponent(oneDayAgo)}`;
    
    const response2 = await fetch(url2, {
      method: 'GET',
      headers: {
        'api-key': API_KEY,
        'Content-Type': 'application/json'
      }
    });

    const data2 = await response2.json();

    console.log('📊 Response (userType=all):');
    console.log(`   Status: ${data2.status}`);
    console.log(`   Has Updates: ${data2.meta?.hasUpdates || false}`);
    console.log(`   Categories Count: ${data2.data?.categories?.length || 0}`);
    console.log(`   Subcategories Count: ${data2.data?.subcategories?.length || 0}`);
    console.log('');

    if (data2.data?.categories && data2.data.categories.length > 0) {
      console.log('   📋 All Categories returned:');
      data2.data.categories.forEach((cat, index) => {
        console.log(`      ${index + 1}. ID: ${cat.id}, Name: "${cat.name}"`);
        console.log(`         Available: B2B=${cat.available_in?.b2b ? 'Yes' : 'No'}, B2C=${cat.available_in?.b2c ? 'Yes' : 'No'}`);
      });
    }
    console.log('');

    // Test 3: Test without userType (should default to all)
    console.log('🔍 Test 3: Testing without userType parameter (defaults to all)');
    console.log('');
    
    const url3 = `${BASE_URL}/api/v2/categories/incremental-updates?lastUpdatedOn=${encodeURIComponent(oneDayAgo)}`;
    
    const response3 = await fetch(url3, {
      method: 'GET',
      headers: {
        'api-key': API_KEY,
        'Content-Type': 'application/json'
      }
    });

    const data3 = await response3.json();

    console.log('📊 Response (no userType):');
    console.log(`   Status: ${data3.status}`);
    console.log(`   Categories Count: ${data3.data?.categories?.length || 0}`);
    console.log(`   Subcategories Count: ${data3.data?.subcategories?.length || 0}`);
    console.log('');

    // Summary
    console.log('='.repeat(80));
    console.log('✅ Test Summary:');
    console.log('='.repeat(80));
    console.log(`✓ userType=b2c: ${data1.data?.categories?.length || 0} categories`);
    console.log(`✓ userType=all: ${data2.data?.categories?.length || 0} categories`);
    console.log(`✓ no userType: ${data3.data?.categories?.length || 0} categories`);
    console.log('');
    console.log('💡 Note: The scrapmate app (common users, category U) currently uses userType=b2c');
    console.log('   This means it will only receive categories available for B2C users.');
    console.log('   If category U needs different categories, consider using userType=all');
    console.log('');

  } catch (error) {
    console.error('❌ Error testing incremental updates:', error.message);
    console.error('Stack:', error.stack);
    process.exit(1);
  }
}

// Run the test
testCategoryUIncrementalUpdates();

