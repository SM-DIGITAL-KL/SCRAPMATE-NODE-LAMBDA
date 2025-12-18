#!/usr/bin/env node
/**
 * Test paginated subcategories API speed on localhost and Lambda microservice
 */

require('dotenv').config();
const { loadEnvFromFile } = require('./utils/loadEnv');
loadEnvFromFile();

const http = require('http');
const https = require('https');

const LOCAL_URL = 'http://localhost:3000';
const LAMBDA_URL = process.env.LAMBDA_URL || 'https://uodttljjzj3nh3e4cjqardxip40btqef.lambda-url.ap-south-1.on.aws';
const API_KEY = process.env.API_KEY;

function makeRequest(url, path) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(path, url);
    const isHttps = urlObj.protocol === 'https:';
    const client = isHttps ? https : http;
    
    const options = {
      hostname: urlObj.hostname,
      port: urlObj.port || (isHttps ? 443 : 80),
      path: urlObj.pathname + urlObj.search,
      method: 'GET',
      headers: {
        'api-key': API_KEY,
        'Content-Type': 'application/json'
      }
    };

    const startTime = Date.now();
    const req = client.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        const duration = Date.now() - startTime;
        try {
          resolve({ 
            statusCode: res.statusCode, 
            duration,
            data: JSON.parse(data),
            size: data.length
          });
        } catch (e) {
          resolve({ 
            statusCode: res.statusCode, 
            duration,
            data: { raw: data },
            size: data.length
          });
        }
      });
    });

    req.on('error', reject);
    req.setTimeout(60000, () => { req.destroy(); reject(new Error('Timeout')); });
    req.end();
  });
}

async function testEndpoint(baseUrl, name, path, clearCache = false) {
  console.log(`\n${'='.repeat(70)}`);
  console.log(`📍 Testing: ${name}`);
  console.log(`   URL: ${baseUrl}${path}`);
  console.log(`${'='.repeat(70)}`);

  const results = [];

  // First request (cache miss)
  console.log('\n1️⃣  First Request (Cache Miss)...');
  try {
    const first = await makeRequest(baseUrl, path);
    results.push({ type: 'First', ...first });
    console.log(`   Status: ${first.statusCode}`);
    console.log(`   Duration: ${first.duration}ms`);
    console.log(`   hitBy: ${first.data.hitBy || 'MISSING'}`);
    console.log(`   Response size: ${(first.size / 1024).toFixed(2)} KB`);
    if (first.data.meta) {
      console.log(`   Total items: ${first.data.meta.total}`);
      console.log(`   Items returned: ${first.data.data?.length || 0}`);
      console.log(`   Page: ${first.data.meta.page || 'N/A'}`);
      console.log(`   Total pages: ${first.data.meta.totalPages || 'N/A'}`);
    }
    
    if (first.duration > 2000) {
      console.log(`   ⚠️  WARNING: Slow response (>2s)`);
    }
    if (first.duration > 5000) {
      console.log(`   ❌ CRITICAL: Very slow response (>5s)`);
    }
  } catch (err) {
    console.log(`   ❌ Error: ${err.message}`);
    return null;
  }

  // Wait a moment
  await new Promise(r => setTimeout(r, 1000));

  // Second request (should hit cache)
  console.log('\n2️⃣  Second Request (Should Hit Cache)...');
  try {
    const second = await makeRequest(baseUrl, path);
    results.push({ type: 'Second', ...second });
    console.log(`   Status: ${second.statusCode}`);
    console.log(`   Duration: ${second.duration}ms`);
    console.log(`   hitBy: ${second.data.hitBy || 'MISSING'}`);
    console.log(`   Response size: ${(second.size / 1024).toFixed(2)} KB`);
    
    if (second.data.hitBy === 'Redis') {
      console.log(`   ✅ Cache hit confirmed!`);
    } else {
      console.log(`   ⚠️  Cache miss (expected hitBy: "Redis")`);
    }
    
    if (results[0]) {
      const speedup = ((results[0].duration - second.duration) / results[0].duration * 100).toFixed(1);
      console.log(`   Performance: ${speedup}% ${second.duration < results[0].duration ? 'faster' : 'slower'}`);
    }
  } catch (err) {
    console.log(`   ❌ Error: ${err.message}`);
  }

  return results;
}

async function runTests() {
  console.log('🚀 Paginated Subcategories API Speed Test');
  console.log('='.repeat(70));
  console.log(`Local URL: ${LOCAL_URL}`);
  console.log(`Lambda URL: ${LAMBDA_URL}`);
  console.log('='.repeat(70));

  const testCases = [
    { name: 'Page 1, Limit 20', path: '/api/v2/subcategories/paginated?page=1&limit=20' },
    { name: 'Page 1, Limit 20, CategoryId=1', path: '/api/v2/subcategories/paginated?page=1&limit=20&categoryId=1' },
    { name: 'Page 2, Limit 20', path: '/api/v2/subcategories/paginated?page=2&limit=20' },
    { name: 'Page 1, Limit 50', path: '/api/v2/subcategories/paginated?page=1&limit=50' },
    { name: 'Page 1, Limit 20, userType=b2b', path: '/api/v2/subcategories/paginated?page=1&limit=20&userType=b2b' },
  ];

  const localResults = [];
  const lambdaResults = [];

  for (const testCase of testCases) {
    console.log(`\n\n${'#'.repeat(70)}`);
    console.log(`📋 Test Case: ${testCase.name}`);
    console.log(`${'#'.repeat(70)}`);

    // Test localhost
    console.log(`\n🏠 LOCALHOST TEST`);
    const localResult = await testEndpoint(LOCAL_URL, 'Localhost', testCase.path);
    if (localResult) {
      localResults.push({ testCase: testCase.name, ...localResult });
    }

    // Wait between tests
    await new Promise(r => setTimeout(r, 2000));

    // Test Lambda
    console.log(`\n☁️  LAMBDA MICROSERVICE TEST`);
    const lambdaResult = await testEndpoint(LAMBDA_URL, 'Lambda', testCase.path);
    if (lambdaResult) {
      lambdaResults.push({ testCase: testCase.name, ...lambdaResult });
    }

    // Wait between test cases
    await new Promise(r => setTimeout(r, 1000));
  }

  // Summary
  console.log(`\n\n${'='.repeat(70)}`);
  console.log('📊 PERFORMANCE SUMMARY');
  console.log('='.repeat(70));

  console.log('\n🏠 LOCALHOST Results:');
  localResults.forEach((result, idx) => {
    if (result[0] && result[1]) {
      const first = result[0].duration;
      const second = result[1].duration;
      const speedup = ((first - second) / first * 100).toFixed(1);
      console.log(`   ${result.testCase}:`);
      console.log(`      First: ${first}ms, Second: ${second}ms (${speedup}% faster)`);
      console.log(`      Cache hit: ${result[1].data.hitBy === 'Redis' ? '✅' : '❌'}`);
    }
  });

  console.log('\n☁️  LAMBDA Results:');
  lambdaResults.forEach((result, idx) => {
    if (result[0] && result[1]) {
      const first = result[0].duration;
      const second = result[1].duration;
      const speedup = ((first - second) / first * 100).toFixed(1);
      console.log(`   ${result.testCase}:`);
      console.log(`      First: ${first}ms, Second: ${second}ms (${speedup}% faster)`);
      console.log(`      Cache hit: ${result[1].data.hitBy === 'Redis' ? '✅' : '❌'}`);
    }
  });

  // Comparison
  console.log('\n📈 LOCALHOST vs LAMBDA Comparison:');
  testCases.forEach((testCase, idx) => {
    const local = localResults[idx];
    const lambda = lambdaResults[idx];
    if (local && local[0] && lambda && lambda[0]) {
      const localFirst = local[0].duration;
      const lambdaFirst = lambda[0].duration;
      const diff = ((lambdaFirst - localFirst) / localFirst * 100).toFixed(1);
      console.log(`   ${testCase.name}:`);
      console.log(`      Localhost: ${localFirst}ms`);
      console.log(`      Lambda: ${lambdaFirst}ms`);
      console.log(`      Difference: ${diff}% ${lambdaFirst > localFirst ? 'slower' : 'faster'}`);
    }
  });

  console.log('\n' + '='.repeat(70));
  console.log('✅ Speed test completed!');
}

runTests().catch(console.error);


/**
 * Test paginated subcategories API speed on localhost and Lambda microservice
 */

require('dotenv').config();
const { loadEnvFromFile } = require('./utils/loadEnv');
loadEnvFromFile();

const http = require('http');
const https = require('https');

const LOCAL_URL = 'http://localhost:3000';
const LAMBDA_URL = process.env.LAMBDA_URL || 'https://uodttljjzj3nh3e4cjqardxip40btqef.lambda-url.ap-south-1.on.aws';
const API_KEY = process.env.API_KEY;

function makeRequest(url, path) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(path, url);
    const isHttps = urlObj.protocol === 'https:';
    const client = isHttps ? https : http;
    
    const options = {
      hostname: urlObj.hostname,
      port: urlObj.port || (isHttps ? 443 : 80),
      path: urlObj.pathname + urlObj.search,
      method: 'GET',
      headers: {
        'api-key': API_KEY,
        'Content-Type': 'application/json'
      }
    };

    const startTime = Date.now();
    const req = client.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        const duration = Date.now() - startTime;
        try {
          resolve({ 
            statusCode: res.statusCode, 
            duration,
            data: JSON.parse(data),
            size: data.length
          });
        } catch (e) {
          resolve({ 
            statusCode: res.statusCode, 
            duration,
            data: { raw: data },
            size: data.length
          });
        }
      });
    });

    req.on('error', reject);
    req.setTimeout(60000, () => { req.destroy(); reject(new Error('Timeout')); });
    req.end();
  });
}

async function testEndpoint(baseUrl, name, path, clearCache = false) {
  console.log(`\n${'='.repeat(70)}`);
  console.log(`📍 Testing: ${name}`);
  console.log(`   URL: ${baseUrl}${path}`);
  console.log(`${'='.repeat(70)}`);

  const results = [];

  // First request (cache miss)
  console.log('\n1️⃣  First Request (Cache Miss)...');
  try {
    const first = await makeRequest(baseUrl, path);
    results.push({ type: 'First', ...first });
    console.log(`   Status: ${first.statusCode}`);
    console.log(`   Duration: ${first.duration}ms`);
    console.log(`   hitBy: ${first.data.hitBy || 'MISSING'}`);
    console.log(`   Response size: ${(first.size / 1024).toFixed(2)} KB`);
    if (first.data.meta) {
      console.log(`   Total items: ${first.data.meta.total}`);
      console.log(`   Items returned: ${first.data.data?.length || 0}`);
      console.log(`   Page: ${first.data.meta.page || 'N/A'}`);
      console.log(`   Total pages: ${first.data.meta.totalPages || 'N/A'}`);
    }
    
    if (first.duration > 2000) {
      console.log(`   ⚠️  WARNING: Slow response (>2s)`);
    }
    if (first.duration > 5000) {
      console.log(`   ❌ CRITICAL: Very slow response (>5s)`);
    }
  } catch (err) {
    console.log(`   ❌ Error: ${err.message}`);
    return null;
  }

  // Wait a moment
  await new Promise(r => setTimeout(r, 1000));

  // Second request (should hit cache)
  console.log('\n2️⃣  Second Request (Should Hit Cache)...');
  try {
    const second = await makeRequest(baseUrl, path);
    results.push({ type: 'Second', ...second });
    console.log(`   Status: ${second.statusCode}`);
    console.log(`   Duration: ${second.duration}ms`);
    console.log(`   hitBy: ${second.data.hitBy || 'MISSING'}`);
    console.log(`   Response size: ${(second.size / 1024).toFixed(2)} KB`);
    
    if (second.data.hitBy === 'Redis') {
      console.log(`   ✅ Cache hit confirmed!`);
    } else {
      console.log(`   ⚠️  Cache miss (expected hitBy: "Redis")`);
    }
    
    if (results[0]) {
      const speedup = ((results[0].duration - second.duration) / results[0].duration * 100).toFixed(1);
      console.log(`   Performance: ${speedup}% ${second.duration < results[0].duration ? 'faster' : 'slower'}`);
    }
  } catch (err) {
    console.log(`   ❌ Error: ${err.message}`);
  }

  return results;
}

async function runTests() {
  console.log('🚀 Paginated Subcategories API Speed Test');
  console.log('='.repeat(70));
  console.log(`Local URL: ${LOCAL_URL}`);
  console.log(`Lambda URL: ${LAMBDA_URL}`);
  console.log('='.repeat(70));

  const testCases = [
    { name: 'Page 1, Limit 20', path: '/api/v2/subcategories/paginated?page=1&limit=20' },
    { name: 'Page 1, Limit 20, CategoryId=1', path: '/api/v2/subcategories/paginated?page=1&limit=20&categoryId=1' },
    { name: 'Page 2, Limit 20', path: '/api/v2/subcategories/paginated?page=2&limit=20' },
    { name: 'Page 1, Limit 50', path: '/api/v2/subcategories/paginated?page=1&limit=50' },
    { name: 'Page 1, Limit 20, userType=b2b', path: '/api/v2/subcategories/paginated?page=1&limit=20&userType=b2b' },
  ];

  const localResults = [];
  const lambdaResults = [];

  for (const testCase of testCases) {
    console.log(`\n\n${'#'.repeat(70)}`);
    console.log(`📋 Test Case: ${testCase.name}`);
    console.log(`${'#'.repeat(70)}`);

    // Test localhost
    console.log(`\n🏠 LOCALHOST TEST`);
    const localResult = await testEndpoint(LOCAL_URL, 'Localhost', testCase.path);
    if (localResult) {
      localResults.push({ testCase: testCase.name, ...localResult });
    }

    // Wait between tests
    await new Promise(r => setTimeout(r, 2000));

    // Test Lambda
    console.log(`\n☁️  LAMBDA MICROSERVICE TEST`);
    const lambdaResult = await testEndpoint(LAMBDA_URL, 'Lambda', testCase.path);
    if (lambdaResult) {
      lambdaResults.push({ testCase: testCase.name, ...lambdaResult });
    }

    // Wait between test cases
    await new Promise(r => setTimeout(r, 1000));
  }

  // Summary
  console.log(`\n\n${'='.repeat(70)}`);
  console.log('📊 PERFORMANCE SUMMARY');
  console.log('='.repeat(70));

  console.log('\n🏠 LOCALHOST Results:');
  localResults.forEach((result, idx) => {
    if (result[0] && result[1]) {
      const first = result[0].duration;
      const second = result[1].duration;
      const speedup = ((first - second) / first * 100).toFixed(1);
      console.log(`   ${result.testCase}:`);
      console.log(`      First: ${first}ms, Second: ${second}ms (${speedup}% faster)`);
      console.log(`      Cache hit: ${result[1].data.hitBy === 'Redis' ? '✅' : '❌'}`);
    }
  });

  console.log('\n☁️  LAMBDA Results:');
  lambdaResults.forEach((result, idx) => {
    if (result[0] && result[1]) {
      const first = result[0].duration;
      const second = result[1].duration;
      const speedup = ((first - second) / first * 100).toFixed(1);
      console.log(`   ${result.testCase}:`);
      console.log(`      First: ${first}ms, Second: ${second}ms (${speedup}% faster)`);
      console.log(`      Cache hit: ${result[1].data.hitBy === 'Redis' ? '✅' : '❌'}`);
    }
  });

  // Comparison
  console.log('\n📈 LOCALHOST vs LAMBDA Comparison:');
  testCases.forEach((testCase, idx) => {
    const local = localResults[idx];
    const lambda = lambdaResults[idx];
    if (local && local[0] && lambda && lambda[0]) {
      const localFirst = local[0].duration;
      const lambdaFirst = lambda[0].duration;
      const diff = ((lambdaFirst - localFirst) / localFirst * 100).toFixed(1);
      console.log(`   ${testCase.name}:`);
      console.log(`      Localhost: ${localFirst}ms`);
      console.log(`      Lambda: ${lambdaFirst}ms`);
      console.log(`      Difference: ${diff}% ${lambdaFirst > localFirst ? 'slower' : 'faster'}`);
    }
  });

  console.log('\n' + '='.repeat(70));
  console.log('✅ Speed test completed!');
}

runTests().catch(console.error);

