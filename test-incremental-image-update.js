/**
 * Test script to verify incremental updates API detects category image changes
 * 
 * This script:
 * 1. Gets a list of categories
 * 2. Selects a category to update
 * 3. Gets baseline timestamp
 * 4. Updates the category image
 * 5. Waits for database propagation
 * 6. Calls incremental updates API
 * 7. Verifies the updated category appears with new image
 */

const fetch = require('node-fetch');

const BASE_URL = process.env.API_URL || 'https://uodttljjzj3nh3e4cjqardxip40btqef.lambda-url.ap-south-1.on.aws';
const API_KEY = process.env.API_KEY || 'zyubkfzeumeoviaqzcsrvfwdzbiwnlnn';

// Test image URL - you can change this to a different image URL
const TEST_IMAGE_URL = 'https://via.placeholder.com/300x300.png?text=Updated+Image';

async function testIncrementalImageUpdate() {
  console.log('\n' + '='.repeat(80));
  console.log('🧪 Testing Incremental Updates API - Category Image Change');
  console.log('='.repeat(80));
  console.log(`Base URL: ${BASE_URL}`);
  console.log(`API Key: ${API_KEY.substring(0, 10)}...`);
  console.log('');

  try {
    // Step 1: Get list of categories to find one to update
    console.log('📋 Step 1: Getting list of categories...');
    const categoriesUrl = `${BASE_URL}/api/v2/categories?userType=all`;
    console.log(`   URL: ${categoriesUrl}`);
    
    const categoriesResponse = await fetch(categoriesUrl, {
      method: 'GET',
      headers: {
        'api-key': API_KEY,
        'Content-Type': 'application/json'
      }
    });

    if (!categoriesResponse.ok) {
      throw new Error(`Failed to fetch categories: ${categoriesResponse.statusText}`);
    }

    const categoriesData = await categoriesResponse.json();
    
    if (categoriesData.status !== 'success' || !categoriesData.data || categoriesData.data.length === 0) {
      throw new Error('No categories found');
    }

    const categories = categoriesData.data;
    console.log(`   ✅ Found ${categories.length} categories`);
    
    // Find 'materials' category specifically (case-insensitive)
    const testCategory = categories.find(cat => 
      cat.name && cat.name.toLowerCase().includes('materials')
    );
    
    if (!testCategory) {
      console.log('\n   📋 Available categories:');
      categories.forEach(cat => {
        console.log(`      - ID: ${cat.id}, Name: "${cat.name}"`);
      });
      throw new Error('Category "materials" not found');
    }
    
    console.log(`\n   📌 Selected category for testing:`);
    console.log(`      ID: ${testCategory.id}`);
    console.log(`      Name: "${testCategory.name}"`);
    console.log(`      Current Image: ${testCategory.image ? testCategory.image.substring(0, 80) + '...' : 'none'}`);
    console.log('');

    // Step 2: Get baseline timestamp (before update)
    console.log('📅 Step 2: Getting baseline timestamp...');
    const baselineTimestamp = new Date().toISOString();
    console.log(`   Baseline timestamp: ${baselineTimestamp}`);
    console.log('');

    // Step 3: Wait a moment to ensure timestamp difference
    console.log('⏳ Step 3: Waiting 2 seconds to ensure timestamp difference...');
    await new Promise(resolve => setTimeout(resolve, 2000));
    console.log('');

    // Step 4: Update category image
    console.log('🖼️  Step 4: Updating category image...');
    const updateUrl = `${BASE_URL}/api/category_img_keywords/${testCategory.id}`;
    console.log(`   URL: ${updateUrl}`);
    console.log(`   Category ID: ${testCategory.id}`);
    console.log(`   New Image URL: ${TEST_IMAGE_URL}`);
    
    // Update using PUT with image URL (simpler than file upload for testing)
    const updateResponse = await fetch(updateUrl, {
      method: 'PUT',
      headers: {
        'api-key': API_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        category_img: TEST_IMAGE_URL
      })
    });

    if (!updateResponse.ok) {
      const errorData = await updateResponse.json().catch(() => ({ msg: updateResponse.statusText }));
      throw new Error(`Failed to update category: ${errorData.msg || updateResponse.statusText}`);
    }

    const updateData = await updateResponse.json();
    console.log(`   ✅ Update response: ${updateData.status}`);
    console.log(`   Message: ${updateData.msg || 'N/A'}`);
    
    if (updateData.data && updateData.data.category_img) {
      console.log(`   Updated image URL: ${updateData.data.category_img.substring(0, 80)}...`);
    }
    console.log('');

    // Step 5: Wait for database propagation (DynamoDB eventual consistency)
    console.log('⏳ Step 5: Waiting 3 seconds for database propagation...');
    await new Promise(resolve => setTimeout(resolve, 3000));
    console.log('');

    // Step 6: Call incremental updates API with baseline timestamp
    console.log('🔄 Step 6: Calling incremental updates API...');
    const incrementalUrl = `${BASE_URL}/api/v2/categories/incremental-updates?userType=all&lastUpdatedOn=${encodeURIComponent(baselineTimestamp)}`;
    console.log(`   URL: ${incrementalUrl}`);
    console.log(`   Last Updated On: ${baselineTimestamp}`);
    console.log('');

    const incrementalResponse = await fetch(incrementalUrl, {
      method: 'GET',
      headers: {
        'api-key': API_KEY,
        'Content-Type': 'application/json'
      }
    });

    if (!incrementalResponse.ok) {
      throw new Error(`Failed to fetch incremental updates: ${incrementalResponse.statusText}`);
    }

    const incrementalData = await incrementalResponse.json();
    console.log(`   ✅ Response Status: ${incrementalData.status}`);
    console.log(`   Message: ${incrementalData.msg || 'N/A'}`);
    console.log(`   Has Updates: ${incrementalData.meta?.hasUpdates || false}`);
    console.log(`   Categories Count: ${incrementalData.data?.categories?.length || 0}`);
    console.log(`   Subcategories Count: ${incrementalData.data?.subcategories?.length || 0}`);
    console.log('');

    // Step 7: Verify the updated category appears
    console.log('✅ Step 7: Verifying results...');
    const updatedCategories = incrementalData.data?.categories || [];
    const foundCategory = updatedCategories.find(cat => cat.id === testCategory.id);

    if (foundCategory) {
      console.log(`   ✅ SUCCESS: Updated category found in incremental updates!`);
      console.log(`      Category ID: ${foundCategory.id}`);
      console.log(`      Category Name: "${foundCategory.name}"`);
      console.log(`      New Image URL: ${foundCategory.image ? foundCategory.image.substring(0, 80) + '...' : 'none'}`);
      console.log(`      Updated At: ${foundCategory.updated_at || 'N/A'}`);
      
      // Verify image URL matches
      if (foundCategory.image && foundCategory.image.includes('Updated+Image')) {
        console.log(`   ✅ Image URL verification: PASSED (contains expected text)`);
      } else {
        console.log(`   ⚠️  Image URL verification: Image URL may be different`);
        console.log(`      Expected to contain: "Updated+Image"`);
        console.log(`      Actual: ${foundCategory.image ? foundCategory.image.substring(0, 100) : 'none'}`);
      }
    } else {
      console.log(`   ❌ FAILED: Updated category NOT found in incremental updates`);
      console.log(`      Expected Category ID: ${testCategory.id}`);
      console.log(`      Categories in response: ${updatedCategories.map(c => c.id).join(', ') || 'none'}`);
      
      if (updatedCategories.length > 0) {
        console.log(`\n   📋 Categories that were returned:`);
        updatedCategories.slice(0, 5).forEach(cat => {
          console.log(`      - ID: ${cat.id}, Name: "${cat.name}", Updated: ${cat.updated_at || 'N/A'}`);
        });
      }
    }
    console.log('');

    // Summary
    console.log('='.repeat(80));
    console.log('📊 Test Summary:');
    console.log('='.repeat(80));
    console.log(`✓ Category fetched: ${categories.length > 0 ? 'PASSED' : 'FAILED'}`);
    console.log(`✓ Category updated: ${updateData.status === 'success' ? 'PASSED' : 'FAILED'}`);
    console.log(`✓ Incremental updates API called: ${incrementalData.status === 'success' ? 'PASSED' : 'FAILED'}`);
    console.log(`✓ Updated category found: ${foundCategory ? 'PASSED' : 'FAILED'}`);
    
    if (foundCategory) {
      console.log(`✓ Image URL updated: ${foundCategory.image && foundCategory.image.includes('Updated+Image') ? 'PASSED' : 'PARTIAL'}`);
    }
    
    console.log('');
    console.log('💡 Note: If the test failed, check:');
    console.log('   1. Database propagation delay (DynamoDB eventual consistency)');
    console.log('   2. Timestamp comparison logic (30-second buffer)');
    console.log('   3. Category update actually succeeded');
    console.log('   4. API endpoint configuration');
    console.log('');

  } catch (error) {
    console.error('❌ Error testing incremental image update:', error.message);
    console.error('Stack:', error.stack);
    process.exit(1);
  }
}

// Run the test
testIncrementalImageUpdate();

