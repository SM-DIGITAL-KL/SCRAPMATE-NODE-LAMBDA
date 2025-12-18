/**
 * Test script for incremental updates API
 * Tests that category name changes are returned correctly
 */

const fetch = require('node-fetch');

const BASE_URL = process.env.API_URL || 'http://localhost:3000';
const API_KEY = process.env.API_KEY || 'your-api-key-here';

async function testIncrementalUpdates() {
  console.log('\n' + '='.repeat(80));
  console.log('🧪 Testing Incremental Updates API');
  console.log('='.repeat(80));
  console.log(`Base URL: ${BASE_URL}`);
  console.log(`API Key: ${API_KEY.substring(0, 10)}...`);
  console.log('');

  try {
    // Step 1: Get current timestamp (simulate what mobile app would have)
    const currentTimestamp = new Date().toISOString();
    console.log('📅 Current timestamp:', currentTimestamp);
    console.log('');

    // Step 2: Wait a moment to simulate time passing
    console.log('⏳ Waiting 2 seconds to simulate time passing...');
    await new Promise(resolve => setTimeout(resolve, 2000));
    console.log('');

    // Step 3: Test incremental updates with current timestamp (should return empty or recent updates)
    console.log('🔍 Step 1: Testing incremental updates with current timestamp');
    console.log('   (Should return empty or only very recent updates)');
    const url1 = `${BASE_URL}/api/v2/categories/incremental-updates?userType=b2c&lastUpdatedOn=${encodeURIComponent(currentTimestamp)}`;
    console.log(`   URL: ${url1}`);
    
    const response1 = await fetch(url1, {
      method: 'GET',
      headers: {
        'api-key': API_KEY,
        'Content-Type': 'application/json'
      }
    });

    const data1 = await response1.json();
    console.log(`   Status: ${response1.status}`);
    console.log(`   Response:`, JSON.stringify(data1, null, 2));
    console.log('');

    // Step 4: Test with old timestamp (should return all categories)
    console.log('🔍 Step 2: Testing incremental updates with old timestamp (1 day ago)');
    console.log('   (Should return all categories)');
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const url2 = `${BASE_URL}/api/v2/categories/incremental-updates?userType=b2c&lastUpdatedOn=${encodeURIComponent(oneDayAgo)}`;
    console.log(`   URL: ${url2}`);
    console.log(`   Timestamp: ${oneDayAgo}`);
    
    const response2 = await fetch(url2, {
      method: 'GET',
      headers: {
        'api-key': API_KEY,
        'Content-Type': 'application/json'
      }
    });

    const data2 = await response2.json();
    console.log(`   Status: ${response2.status}`);
    console.log(`   Categories found: ${data2.data?.categories?.length || 0}`);
    console.log(`   Subcategories found: ${data2.data?.subcategories?.length || 0}`);
    console.log(`   Has updates: ${data2.meta?.hasUpdates || false}`);
    console.log(`   Last updated on: ${data2.meta?.lastUpdatedOn || 'N/A'}`);
    
    if (data2.data?.categories?.length > 0) {
      console.log('\n   📋 Sample categories:');
      data2.data.categories.slice(0, 5).forEach(cat => {
        console.log(`      - ID: ${cat.id}, Name: "${cat.name}", Updated: ${cat.updated_at || 'N/A'}`);
      });
    }
    console.log('');

    // Step 5: Test with very old timestamp (should return all)
    console.log('🔍 Step 3: Testing incremental updates with very old timestamp (1 year ago)');
    console.log('   (Should return all categories and subcategories)');
    const oneYearAgo = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString();
    const url3 = `${BASE_URL}/api/v2/categories/incremental-updates?userType=b2c&lastUpdatedOn=${encodeURIComponent(oneYearAgo)}`;
    console.log(`   URL: ${url3}`);
    
    const response3 = await fetch(url3, {
      method: 'GET',
      headers: {
        'api-key': API_KEY,
        'Content-Type': 'application/json'
      }
    });

    const data3 = await response3.json();
    console.log(`   Status: ${response3.status}`);
    console.log(`   Categories found: ${data3.data?.categories?.length || 0}`);
    console.log(`   Subcategories found: ${data3.data?.subcategories?.length || 0}`);
    console.log(`   Has updates: ${data3.meta?.hasUpdates || false}`);
    console.log('');

    // Step 6: Test without timestamp (should return all)
    console.log('🔍 Step 4: Testing incremental updates without timestamp');
    console.log('   (Should return all categories and subcategories)');
    const url4 = `${BASE_URL}/api/v2/categories/incremental-updates?userType=b2c`;
    console.log(`   URL: ${url4}`);
    
    const response4 = await fetch(url4, {
      method: 'GET',
      headers: {
        'api-key': API_KEY,
        'Content-Type': 'application/json'
      }
    });

    const data4 = await response4.json();
    console.log(`   Status: ${response4.status}`);
    console.log(`   Categories found: ${data4.data?.categories?.length || 0}`);
    console.log(`   Subcategories found: ${data4.data?.subcategories?.length || 0}`);
    console.log('');

    // Summary
    console.log('='.repeat(80));
    console.log('✅ Test Summary:');
    console.log('='.repeat(80));
    console.log(`✓ Current timestamp test: ${data1.status === 'success' ? 'PASSED' : 'FAILED'}`);
    console.log(`✓ Old timestamp (1 day) test: ${data2.status === 'success' ? 'PASSED' : 'FAILED'} - Found ${data2.data?.categories?.length || 0} categories`);
    console.log(`✓ Very old timestamp (1 year) test: ${data3.status === 'success' ? 'PASSED' : 'FAILED'} - Found ${data3.data?.categories?.length || 0} categories`);
    console.log(`✓ No timestamp test: ${data4.status === 'success' ? 'PASSED' : 'FAILED'} - Found ${data4.data?.categories?.length || 0} categories`);
    console.log('');
    console.log('💡 To test category name changes:');
    console.log('   1. Update a category name in admin panel');
    console.log('   2. Note the timestamp before the update');
    console.log('   3. Run this script with that timestamp as lastUpdatedOn');
    console.log('   4. The updated category should appear in the response');
    console.log('');

  } catch (error) {
    console.error('❌ Error testing incremental updates:', error);
    console.error('Stack:', error.stack);
  }
}

// Run the test
testIncrementalUpdates();


 * Test script for incremental updates API
 * Tests that category name changes are returned correctly
 */

const fetch = require('node-fetch');

const BASE_URL = process.env.API_URL || 'http://localhost:3000';
const API_KEY = process.env.API_KEY || 'your-api-key-here';

async function testIncrementalUpdates() {
  console.log('\n' + '='.repeat(80));
  console.log('🧪 Testing Incremental Updates API');
  console.log('='.repeat(80));
  console.log(`Base URL: ${BASE_URL}`);
  console.log(`API Key: ${API_KEY.substring(0, 10)}...`);
  console.log('');

  try {
    // Step 1: Get current timestamp (simulate what mobile app would have)
    const currentTimestamp = new Date().toISOString();
    console.log('📅 Current timestamp:', currentTimestamp);
    console.log('');

    // Step 2: Wait a moment to simulate time passing
    console.log('⏳ Waiting 2 seconds to simulate time passing...');
    await new Promise(resolve => setTimeout(resolve, 2000));
    console.log('');

    // Step 3: Test incremental updates with current timestamp (should return empty or recent updates)
    console.log('🔍 Step 1: Testing incremental updates with current timestamp');
    console.log('   (Should return empty or only very recent updates)');
    const url1 = `${BASE_URL}/api/v2/categories/incremental-updates?userType=b2c&lastUpdatedOn=${encodeURIComponent(currentTimestamp)}`;
    console.log(`   URL: ${url1}`);
    
    const response1 = await fetch(url1, {
      method: 'GET',
      headers: {
        'api-key': API_KEY,
        'Content-Type': 'application/json'
      }
    });

    const data1 = await response1.json();
    console.log(`   Status: ${response1.status}`);
    console.log(`   Response:`, JSON.stringify(data1, null, 2));
    console.log('');

    // Step 4: Test with old timestamp (should return all categories)
    console.log('🔍 Step 2: Testing incremental updates with old timestamp (1 day ago)');
    console.log('   (Should return all categories)');
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const url2 = `${BASE_URL}/api/v2/categories/incremental-updates?userType=b2c&lastUpdatedOn=${encodeURIComponent(oneDayAgo)}`;
    console.log(`   URL: ${url2}`);
    console.log(`   Timestamp: ${oneDayAgo}`);
    
    const response2 = await fetch(url2, {
      method: 'GET',
      headers: {
        'api-key': API_KEY,
        'Content-Type': 'application/json'
      }
    });

    const data2 = await response2.json();
    console.log(`   Status: ${response2.status}`);
    console.log(`   Categories found: ${data2.data?.categories?.length || 0}`);
    console.log(`   Subcategories found: ${data2.data?.subcategories?.length || 0}`);
    console.log(`   Has updates: ${data2.meta?.hasUpdates || false}`);
    console.log(`   Last updated on: ${data2.meta?.lastUpdatedOn || 'N/A'}`);
    
    if (data2.data?.categories?.length > 0) {
      console.log('\n   📋 Sample categories:');
      data2.data.categories.slice(0, 5).forEach(cat => {
        console.log(`      - ID: ${cat.id}, Name: "${cat.name}", Updated: ${cat.updated_at || 'N/A'}`);
      });
    }
    console.log('');

    // Step 5: Test with very old timestamp (should return all)
    console.log('🔍 Step 3: Testing incremental updates with very old timestamp (1 year ago)');
    console.log('   (Should return all categories and subcategories)');
    const oneYearAgo = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString();
    const url3 = `${BASE_URL}/api/v2/categories/incremental-updates?userType=b2c&lastUpdatedOn=${encodeURIComponent(oneYearAgo)}`;
    console.log(`   URL: ${url3}`);
    
    const response3 = await fetch(url3, {
      method: 'GET',
      headers: {
        'api-key': API_KEY,
        'Content-Type': 'application/json'
      }
    });

    const data3 = await response3.json();
    console.log(`   Status: ${response3.status}`);
    console.log(`   Categories found: ${data3.data?.categories?.length || 0}`);
    console.log(`   Subcategories found: ${data3.data?.subcategories?.length || 0}`);
    console.log(`   Has updates: ${data3.meta?.hasUpdates || false}`);
    console.log('');

    // Step 6: Test without timestamp (should return all)
    console.log('🔍 Step 4: Testing incremental updates without timestamp');
    console.log('   (Should return all categories and subcategories)');
    const url4 = `${BASE_URL}/api/v2/categories/incremental-updates?userType=b2c`;
    console.log(`   URL: ${url4}`);
    
    const response4 = await fetch(url4, {
      method: 'GET',
      headers: {
        'api-key': API_KEY,
        'Content-Type': 'application/json'
      }
    });

    const data4 = await response4.json();
    console.log(`   Status: ${response4.status}`);
    console.log(`   Categories found: ${data4.data?.categories?.length || 0}`);
    console.log(`   Subcategories found: ${data4.data?.subcategories?.length || 0}`);
    console.log('');

    // Summary
    console.log('='.repeat(80));
    console.log('✅ Test Summary:');
    console.log('='.repeat(80));
    console.log(`✓ Current timestamp test: ${data1.status === 'success' ? 'PASSED' : 'FAILED'}`);
    console.log(`✓ Old timestamp (1 day) test: ${data2.status === 'success' ? 'PASSED' : 'FAILED'} - Found ${data2.data?.categories?.length || 0} categories`);
    console.log(`✓ Very old timestamp (1 year) test: ${data3.status === 'success' ? 'PASSED' : 'FAILED'} - Found ${data3.data?.categories?.length || 0} categories`);
    console.log(`✓ No timestamp test: ${data4.status === 'success' ? 'PASSED' : 'FAILED'} - Found ${data4.data?.categories?.length || 0} categories`);
    console.log('');
    console.log('💡 To test category name changes:');
    console.log('   1. Update a category name in admin panel');
    console.log('   2. Note the timestamp before the update');
    console.log('   3. Run this script with that timestamp as lastUpdatedOn');
    console.log('   4. The updated category should appear in the response');
    console.log('');

  } catch (error) {
    console.error('❌ Error testing incremental updates:', error);
    console.error('Stack:', error.stack);
  }
}

// Run the test
testIncrementalUpdates();

