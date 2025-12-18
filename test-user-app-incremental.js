/**
 * Test script to verify incremental updates API from user app perspective
 * Tests specifically for category "U" or any category
 */

const fetch = require('node-fetch');

// Use localhost for testing
const BASE_URL = process.env.API_URL || 'http://localhost:3000';
const API_KEY = process.env.API_KEY || 'zyubkfzeumeoviaqzcsrvfwdzbiwnlnn';

async function testUserAppIncrementalUpdates() {
  console.log('\n' + '='.repeat(80));
  console.log('🧪 Testing Incremental Updates API (User App Perspective)');
  console.log('='.repeat(80));
  console.log(`Base URL: ${BASE_URL}`);
  console.log('');

  try {
    // Test 1: Get incremental updates with old timestamp (should show all categories including "U")
    console.log('🔍 Test 1: Get incremental updates with old timestamp (1 day ago)');
    console.log('   This simulates what the mobile app would do');
    console.log('');
    
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const url1 = `${BASE_URL}/api/v2/categories/incremental-updates?userType=b2c&lastUpdatedOn=${encodeURIComponent(oneDayAgo)}`;
    
    console.log(`   URL: ${url1}`);
    console.log(`   Timestamp: ${oneDayAgo}`);
    console.log('');

    const response1 = await fetch(url1, {
      method: 'GET',
      headers: {
        'api-key': API_KEY,
        'Content-Type': 'application/json'
      }
    });

    if (!response1.ok) {
      throw new Error(`HTTP ${response1.status}: ${response1.statusText}`);
    }

    const data1 = await response1.json();

    console.log('📊 Response:');
    console.log(`   Status: ${data1.status}`);
    console.log(`   Has Updates: ${data1.meta?.hasUpdates || false}`);
    console.log(`   Categories Count: ${data1.data?.categories?.length || 0}`);
    console.log(`   Subcategories Count: ${data1.data?.subcategories?.length || 0}`);
    console.log('');

    // Check for category "U" specifically
    if (data1.data?.categories && data1.data.categories.length > 0) {
      console.log('📋 All Updated Categories:');
      console.log('');
      
      const categoryU = data1.data.categories.find(cat => 
        cat.name === 'U' || cat.name.toLowerCase() === 'u' || cat.id === 'U'
      );
      
      data1.data.categories.forEach((cat, index) => {
        const isCategoryU = cat.name === 'U' || cat.name.toLowerCase() === 'u';
        const marker = isCategoryU ? ' ⭐ (This is category U!)' : '';
        console.log(`   ${index + 1}. ID: ${cat.id}, Name: "${cat.name}"${marker}`);
        console.log(`      Updated At: ${cat.updated_at || 'N/A'}`);
        console.log(`      Available: B2B=${cat.available_in?.b2b ? 'Yes' : 'No'}, B2C=${cat.available_in?.b2c ? 'Yes' : 'No'}`);
        console.log('');
      });

      if (categoryU) {
        console.log('✅ Category "U" found in incremental updates!');
        console.log('');
        console.log('   Category U Details:');
        console.log(`   - ID: ${categoryU.id}`);
        console.log(`   - Name: "${categoryU.name}"`);
        console.log(`   - Updated At: ${categoryU.updated_at || 'N/A'}`);
        console.log(`   - Image: ${categoryU.image ? categoryU.image.substring(0, 60) + '...' : 'N/A'}`);
        console.log('');
      } else {
        console.log('ℹ️  Category "U" not found in the updated categories list.');
        console.log('   This could mean:');
        console.log('   - Category "U" was not updated recently');
        console.log('   - Category "U" does not exist');
        console.log('   - Category "U" is filtered out by userType=b2c');
        console.log('');
      }
    } else {
      console.log('ℹ️  No updated categories found.');
      console.log('');
    }

    // Test 2: Get all categories (without timestamp) to see if "U" exists
    console.log('🔍 Test 2: Get all categories (no timestamp filter)');
    console.log('   This will show all categories to verify "U" exists');
    console.log('');
    
    const url2 = `${BASE_URL}/api/v2/categories/incremental-updates?userType=b2c`;
    
    const response2 = await fetch(url2, {
      method: 'GET',
      headers: {
        'api-key': API_KEY,
        'Content-Type': 'application/json'
      }
    });

    const data2 = await response2.json();

    if (data2.data?.categories && data2.data.categories.length > 0) {
      const categoryUAll = data2.data.categories.find(cat => 
        cat.name === 'U' || cat.name.toLowerCase() === 'u'
      );

      console.log(`   Total Categories: ${data2.data.categories.length}`);
      
      if (categoryUAll) {
        console.log('   ✅ Category "U" exists in all categories!');
        console.log(`      ID: ${categoryUAll.id}, Name: "${categoryUAll.name}"`);
      } else {
        console.log('   ℹ️  Category "U" not found in all categories.');
        console.log('   Available category names:');
        data2.data.categories.slice(0, 10).forEach(cat => {
          console.log(`      - "${cat.name}" (ID: ${cat.id})`);
        });
      }
    }

    // Test 3: Test with different userType to see if that affects results
    console.log('');
    console.log('🔍 Test 3: Test with userType=all (should show all categories)');
    console.log('');
    
    const url3 = `${BASE_URL}/api/v2/categories/incremental-updates?userType=all&lastUpdatedOn=${encodeURIComponent(oneDayAgo)}`;
    
    const response3 = await fetch(url3, {
      method: 'GET',
      headers: {
        'api-key': API_KEY,
        'Content-Type': 'application/json'
      }
    });

    const data3 = await response3.json();

    console.log(`   Categories with userType=all: ${data3.data?.categories?.length || 0}`);
    
    const categoryUAll = data3.data?.categories?.find(cat => 
      cat.name === 'U' || cat.name.toLowerCase() === 'u'
    );

    if (categoryUAll) {
      console.log('   ✅ Category "U" found with userType=all!');
    } else {
      console.log('   ℹ️  Category "U" not found even with userType=all');
    }

    console.log('');
    console.log('='.repeat(80));
    console.log('✅ Test completed!');
    console.log('='.repeat(80));
    console.log('');

  } catch (error) {
    console.error('❌ Error testing incremental updates:', error.message);
    console.error('Stack:', error.stack);
    process.exit(1);
  }
}

// Run the test
testUserAppIncrementalUpdates();


 * Test script to verify incremental updates API from user app perspective
 * Tests specifically for category "U" or any category
 */

const fetch = require('node-fetch');

// Use localhost for testing
const BASE_URL = process.env.API_URL || 'http://localhost:3000';
const API_KEY = process.env.API_KEY || 'zyubkfzeumeoviaqzcsrvfwdzbiwnlnn';

async function testUserAppIncrementalUpdates() {
  console.log('\n' + '='.repeat(80));
  console.log('🧪 Testing Incremental Updates API (User App Perspective)');
  console.log('='.repeat(80));
  console.log(`Base URL: ${BASE_URL}`);
  console.log('');

  try {
    // Test 1: Get incremental updates with old timestamp (should show all categories including "U")
    console.log('🔍 Test 1: Get incremental updates with old timestamp (1 day ago)');
    console.log('   This simulates what the mobile app would do');
    console.log('');
    
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const url1 = `${BASE_URL}/api/v2/categories/incremental-updates?userType=b2c&lastUpdatedOn=${encodeURIComponent(oneDayAgo)}`;
    
    console.log(`   URL: ${url1}`);
    console.log(`   Timestamp: ${oneDayAgo}`);
    console.log('');

    const response1 = await fetch(url1, {
      method: 'GET',
      headers: {
        'api-key': API_KEY,
        'Content-Type': 'application/json'
      }
    });

    if (!response1.ok) {
      throw new Error(`HTTP ${response1.status}: ${response1.statusText}`);
    }

    const data1 = await response1.json();

    console.log('📊 Response:');
    console.log(`   Status: ${data1.status}`);
    console.log(`   Has Updates: ${data1.meta?.hasUpdates || false}`);
    console.log(`   Categories Count: ${data1.data?.categories?.length || 0}`);
    console.log(`   Subcategories Count: ${data1.data?.subcategories?.length || 0}`);
    console.log('');

    // Check for category "U" specifically
    if (data1.data?.categories && data1.data.categories.length > 0) {
      console.log('📋 All Updated Categories:');
      console.log('');
      
      const categoryU = data1.data.categories.find(cat => 
        cat.name === 'U' || cat.name.toLowerCase() === 'u' || cat.id === 'U'
      );
      
      data1.data.categories.forEach((cat, index) => {
        const isCategoryU = cat.name === 'U' || cat.name.toLowerCase() === 'u';
        const marker = isCategoryU ? ' ⭐ (This is category U!)' : '';
        console.log(`   ${index + 1}. ID: ${cat.id}, Name: "${cat.name}"${marker}`);
        console.log(`      Updated At: ${cat.updated_at || 'N/A'}`);
        console.log(`      Available: B2B=${cat.available_in?.b2b ? 'Yes' : 'No'}, B2C=${cat.available_in?.b2c ? 'Yes' : 'No'}`);
        console.log('');
      });

      if (categoryU) {
        console.log('✅ Category "U" found in incremental updates!');
        console.log('');
        console.log('   Category U Details:');
        console.log(`   - ID: ${categoryU.id}`);
        console.log(`   - Name: "${categoryU.name}"`);
        console.log(`   - Updated At: ${categoryU.updated_at || 'N/A'}`);
        console.log(`   - Image: ${categoryU.image ? categoryU.image.substring(0, 60) + '...' : 'N/A'}`);
        console.log('');
      } else {
        console.log('ℹ️  Category "U" not found in the updated categories list.');
        console.log('   This could mean:');
        console.log('   - Category "U" was not updated recently');
        console.log('   - Category "U" does not exist');
        console.log('   - Category "U" is filtered out by userType=b2c');
        console.log('');
      }
    } else {
      console.log('ℹ️  No updated categories found.');
      console.log('');
    }

    // Test 2: Get all categories (without timestamp) to see if "U" exists
    console.log('🔍 Test 2: Get all categories (no timestamp filter)');
    console.log('   This will show all categories to verify "U" exists');
    console.log('');
    
    const url2 = `${BASE_URL}/api/v2/categories/incremental-updates?userType=b2c`;
    
    const response2 = await fetch(url2, {
      method: 'GET',
      headers: {
        'api-key': API_KEY,
        'Content-Type': 'application/json'
      }
    });

    const data2 = await response2.json();

    if (data2.data?.categories && data2.data.categories.length > 0) {
      const categoryUAll = data2.data.categories.find(cat => 
        cat.name === 'U' || cat.name.toLowerCase() === 'u'
      );

      console.log(`   Total Categories: ${data2.data.categories.length}`);
      
      if (categoryUAll) {
        console.log('   ✅ Category "U" exists in all categories!');
        console.log(`      ID: ${categoryUAll.id}, Name: "${categoryUAll.name}"`);
      } else {
        console.log('   ℹ️  Category "U" not found in all categories.');
        console.log('   Available category names:');
        data2.data.categories.slice(0, 10).forEach(cat => {
          console.log(`      - "${cat.name}" (ID: ${cat.id})`);
        });
      }
    }

    // Test 3: Test with different userType to see if that affects results
    console.log('');
    console.log('🔍 Test 3: Test with userType=all (should show all categories)');
    console.log('');
    
    const url3 = `${BASE_URL}/api/v2/categories/incremental-updates?userType=all&lastUpdatedOn=${encodeURIComponent(oneDayAgo)}`;
    
    const response3 = await fetch(url3, {
      method: 'GET',
      headers: {
        'api-key': API_KEY,
        'Content-Type': 'application/json'
      }
    });

    const data3 = await response3.json();

    console.log(`   Categories with userType=all: ${data3.data?.categories?.length || 0}`);
    
    const categoryUAll = data3.data?.categories?.find(cat => 
      cat.name === 'U' || cat.name.toLowerCase() === 'u'
    );

    if (categoryUAll) {
      console.log('   ✅ Category "U" found with userType=all!');
    } else {
      console.log('   ℹ️  Category "U" not found even with userType=all');
    }

    console.log('');
    console.log('='.repeat(80));
    console.log('✅ Test completed!');
    console.log('='.repeat(80));
    console.log('');

  } catch (error) {
    console.error('❌ Error testing incremental updates:', error.message);
    console.error('Stack:', error.stack);
    process.exit(1);
  }
}

// Run the test
testUserAppIncrementalUpdates();

