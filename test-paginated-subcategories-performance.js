#!/usr/bin/env node
/**
 * Test paginated subcategories API performance
 */

require('dotenv').config();
const { loadEnvFromFile } = require('./utils/loadEnv');
loadEnvFromFile();

const http = require('http');

const BASE_URL = 'http://localhost:3000';
const API_KEY = process.env.API_KEY;

function makeRequest(path) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const options = {
      hostname: url.hostname,
      port: url.port || 3000,
      path: url.pathname + url.search,
      method: 'GET',
      headers: {
        'api-key': API_KEY,
        'Content-Type': 'application/json'
      }
    };

    const startTime = Date.now();
    const req = http.request(options, (res) => {
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

async function testPerformance() {
  console.log('🚀 Testing Paginated Subcategories API Performance');
  console.log('='.repeat(70));
  
  const testCases = [
    { name: 'Page 1, limit 20', path: '/api/v2/subcategories/paginated?page=1&limit=20' },
    { name: 'Page 1, limit 20, categoryId=1', path: '/api/v2/subcategories/paginated?page=1&limit=20&categoryId=1' },
    { name: 'Page 2, limit 20', path: '/api/v2/subcategories/paginated?page=2&limit=20' },
    { name: 'Page 1, limit 50', path: '/api/v2/subcategories/paginated?page=1&limit=50' },
    { name: 'Page 1, limit 20, userType=b2b', path: '/api/v2/subcategories/paginated?page=1&limit=20&userType=b2b' },
  ];
  
  for (const testCase of testCases) {
    console.log(`\n📋 Testing: ${testCase.name}`);
    console.log(`   Path: ${testCase.path}`);
    console.log('-'.repeat(70));
    
    // First request (cache miss)
    console.log('\n1️⃣  First request (cache miss)...');
    const first = await makeRequest(testCase.path);
    console.log(`   Status: ${first.statusCode}`);
    console.log(`   Duration: ${first.duration}ms`);
    console.log(`   hitBy: ${first.data.hitBy || 'MISSING'}`);
    console.log(`   Response size: ${(first.size / 1024).toFixed(2)} KB`);
    if (first.data.meta) {
      console.log(`   Total items: ${first.data.meta.total}`);
      console.log(`   Items returned: ${first.data.data?.length || 0}`);
      console.log(`   Total pages: ${first.data.meta.totalPages}`);
    }
    
    // Second request (should hit cache)
    console.log('\n2️⃣  Second request (should hit cache)...');
    const second = await makeRequest(testCase.path);
    console.log(`   Status: ${second.statusCode}`);
    console.log(`   Duration: ${second.duration}ms`);
    console.log(`   hitBy: ${second.data.hitBy || 'MISSING'}`);
    console.log(`   Response size: ${(second.size / 1024).toFixed(2)} KB`);
    
    // Performance comparison
    if (first.duration && second.duration) {
      const speedup = ((first.duration - second.duration) / first.duration * 100).toFixed(1);
      console.log(`\n📊 Performance:`);
      console.log(`   First request: ${first.duration}ms`);
      console.log(`   Second request: ${second.duration}ms`);
      console.log(`   Speedup: ${speedup}% ${second.duration < first.duration ? 'faster' : 'slower'}`);
      
      if (first.duration > 2000) {
        console.log(`   ⚠️  WARNING: First request took ${first.duration}ms (>2s) - SLOW!`);
      }
      if (first.duration > 5000) {
        console.log(`   ❌ CRITICAL: First request took ${first.duration}ms (>5s) - VERY SLOW!`);
      }
    }
    
    console.log('\n' + '='.repeat(70));
    
    // Small delay between test cases
    await new Promise(r => setTimeout(r, 500));
  }
  
  console.log('\n✅ Performance test completed!');
}

testPerformance().catch(console.error);


/**
 * Test paginated subcategories API performance
 */

require('dotenv').config();
const { loadEnvFromFile } = require('./utils/loadEnv');
loadEnvFromFile();

const http = require('http');

const BASE_URL = 'http://localhost:3000';
const API_KEY = process.env.API_KEY;

function makeRequest(path) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const options = {
      hostname: url.hostname,
      port: url.port || 3000,
      path: url.pathname + url.search,
      method: 'GET',
      headers: {
        'api-key': API_KEY,
        'Content-Type': 'application/json'
      }
    };

    const startTime = Date.now();
    const req = http.request(options, (res) => {
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

async function testPerformance() {
  console.log('🚀 Testing Paginated Subcategories API Performance');
  console.log('='.repeat(70));
  
  const testCases = [
    { name: 'Page 1, limit 20', path: '/api/v2/subcategories/paginated?page=1&limit=20' },
    { name: 'Page 1, limit 20, categoryId=1', path: '/api/v2/subcategories/paginated?page=1&limit=20&categoryId=1' },
    { name: 'Page 2, limit 20', path: '/api/v2/subcategories/paginated?page=2&limit=20' },
    { name: 'Page 1, limit 50', path: '/api/v2/subcategories/paginated?page=1&limit=50' },
    { name: 'Page 1, limit 20, userType=b2b', path: '/api/v2/subcategories/paginated?page=1&limit=20&userType=b2b' },
  ];
  
  for (const testCase of testCases) {
    console.log(`\n📋 Testing: ${testCase.name}`);
    console.log(`   Path: ${testCase.path}`);
    console.log('-'.repeat(70));
    
    // First request (cache miss)
    console.log('\n1️⃣  First request (cache miss)...');
    const first = await makeRequest(testCase.path);
    console.log(`   Status: ${first.statusCode}`);
    console.log(`   Duration: ${first.duration}ms`);
    console.log(`   hitBy: ${first.data.hitBy || 'MISSING'}`);
    console.log(`   Response size: ${(first.size / 1024).toFixed(2)} KB`);
    if (first.data.meta) {
      console.log(`   Total items: ${first.data.meta.total}`);
      console.log(`   Items returned: ${first.data.data?.length || 0}`);
      console.log(`   Total pages: ${first.data.meta.totalPages}`);
    }
    
    // Second request (should hit cache)
    console.log('\n2️⃣  Second request (should hit cache)...');
    const second = await makeRequest(testCase.path);
    console.log(`   Status: ${second.statusCode}`);
    console.log(`   Duration: ${second.duration}ms`);
    console.log(`   hitBy: ${second.data.hitBy || 'MISSING'}`);
    console.log(`   Response size: ${(second.size / 1024).toFixed(2)} KB`);
    
    // Performance comparison
    if (first.duration && second.duration) {
      const speedup = ((first.duration - second.duration) / first.duration * 100).toFixed(1);
      console.log(`\n📊 Performance:`);
      console.log(`   First request: ${first.duration}ms`);
      console.log(`   Second request: ${second.duration}ms`);
      console.log(`   Speedup: ${speedup}% ${second.duration < first.duration ? 'faster' : 'slower'}`);
      
      if (first.duration > 2000) {
        console.log(`   ⚠️  WARNING: First request took ${first.duration}ms (>2s) - SLOW!`);
      }
      if (first.duration > 5000) {
        console.log(`   ❌ CRITICAL: First request took ${first.duration}ms (>5s) - VERY SLOW!`);
      }
    }
    
    console.log('\n' + '='.repeat(70));
    
    // Small delay between test cases
    await new Promise(r => setTimeout(r, 500));
  }
  
  console.log('\n✅ Performance test completed!');
}

testPerformance().catch(console.error);

