require('dotenv').config();
const axios = require('axios');

// Configuration
const BASE_URL = process.env.NODE_API_URL || 'http://localhost:3000';
const API_KEY = process.env.API_KEY || 'your-api-key-here';

// Test endpoints
const endpoints = [
  // Admin endpoints
  { method: 'GET', path: '/api/admin/dashboard', name: 'Admin Dashboard' },
  { method: 'GET', path: '/api/admin/users', name: 'Admin Users' },
  { method: 'GET', path: '/api/admin/view_users', name: 'View Users' },
  { method: 'GET', path: '/api/admin/callLogSearch', name: 'Call Log Search' },
  { method: 'GET', path: '/api/admin/signUpReport', name: 'Sign Up Report' },
  { method: 'GET', path: '/api/admin/custNotification', name: 'Customer Notification' },
  { method: 'GET', path: '/api/admin/vendorNotification', name: 'Vendor Notification' },
  
  // Vendor endpoints
  { method: 'GET', path: '/api/vendor/list', name: 'Vendor List' },
  
  // Agent endpoints
  { method: 'GET', path: '/api/agent/list', name: 'Agent List' },
  { method: 'GET', path: '/api/agent/leads', name: 'Agent Leads' },
  { method: 'GET', path: '/api/agent/shops', name: 'Agent Shops' },
  
  // Customer endpoints
  { method: 'GET', path: '/api/customer/list', name: 'Customer List' },
  { method: 'GET', path: '/api/customer/orders', name: 'Customer Orders' },
  
  // Student endpoints
  { method: 'GET', path: '/api/student/list', name: 'Student List' },
  
  // SubSchool endpoints
  { method: 'GET', path: '/api/subschool/list', name: 'SubSchool List' },
  
  // Course endpoints
  { method: 'GET', path: '/api/course/categories', name: 'Course Categories' },
  { method: 'GET', path: '/api/course/list', name: 'Course List' },
  
  // Store endpoints
  { method: 'GET', path: '/api/store/categories', name: 'Store Categories' },
  { method: 'GET', path: '/api/store/list', name: 'Store List' },
  
  // Exam endpoints
  { method: 'GET', path: '/api/exam/list', name: 'Exam List' },
  { method: 'GET', path: '/api/exam/questions', name: 'Exam Questions' },
  
  // Report endpoints
  { method: 'GET', path: '/api/report', name: 'Report' },
  
  // Site endpoints
  { method: 'GET', path: '/api/site', name: 'Site Info' },
  { method: 'GET', path: '/api/site/app-version', name: 'App Version' },
  
  // Accounts endpoints
  { method: 'GET', path: '/api/accounts/sub-packages', name: 'Sub Packages' },
  { method: 'GET', path: '/api/accounts/subscribers', name: 'Subscribers' },
];

// Test function
async function testEndpoint(endpoint) {
  try {
    const config = {
      method: endpoint.method,
      url: `${BASE_URL}${endpoint.path}`,
      headers: {
        'api-key': API_KEY,
        'Content-Type': 'application/json'
      },
      timeout: 5000
    };

    const response = await axios(config);
    
    return {
      name: endpoint.name,
      path: endpoint.path,
      status: response.status,
      success: true,
      hasData: response.data && (response.data.status === 'success' || response.data.data !== undefined),
      message: response.data?.msg || 'OK'
    };
  } catch (error) {
    return {
      name: endpoint.name,
      path: endpoint.path,
      status: error.response?.status || 'ERROR',
      success: false,
      hasData: false,
      message: error.response?.data?.error || error.response?.data?.msg || error.message
    };
  }
}

// Run tests
async function runTests() {
  console.log('🧪 Testing Admin Panel APIs...\n');
  console.log(`Base URL: ${BASE_URL}`);
  console.log(`API Key: ${API_KEY ? '✅ Set' : '❌ Not set'}\n`);
  console.log('─'.repeat(80));
  
  const results = [];
  
  for (const endpoint of endpoints) {
    const result = await testEndpoint(endpoint);
    results.push(result);
    
    const statusIcon = result.success ? '✅' : '❌';
    const statusColor = result.success ? '\x1b[32m' : '\x1b[31m';
    const resetColor = '\x1b[0m';
    
    console.log(`${statusIcon} ${result.name.padEnd(30)} ${statusColor}${result.status}${resetColor} - ${result.message}`);
    
    // Small delay to avoid overwhelming the server
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  
  console.log('─'.repeat(80));
  
  // Summary
  const successful = results.filter(r => r.success).length;
  const failed = results.filter(r => !r.success).length;
  const withData = results.filter(r => r.hasData).length;
  
  console.log(`\n📊 Summary:`);
  console.log(`   ✅ Successful: ${successful}/${results.length}`);
  console.log(`   ❌ Failed: ${failed}/${results.length}`);
  console.log(`   📦 With Data: ${withData}/${results.length}`);
  
  // Show failed endpoints
  if (failed > 0) {
    console.log(`\n❌ Failed Endpoints:`);
    results.filter(r => !r.success).forEach(r => {
      console.log(`   - ${r.name} (${r.path}): ${r.message}`);
    });
  }
  
  // Show endpoints without data
  const noData = results.filter(r => r.success && !r.hasData);
  if (noData.length > 0) {
    console.log(`\n⚠️  Endpoints without data (may be expected):`);
    noData.forEach(r => {
      console.log(`   - ${r.name} (${r.path})`);
    });
  }
}

// Check if API key is set
if (!API_KEY || API_KEY === 'your-api-key-here') {
  console.error('❌ Error: API_KEY not set in .env file');
  console.log('Please set API_KEY in your .env file');
  process.exit(1);
}

// Run the tests
runTests().catch(error => {
  console.error('❌ Test execution failed:', error.message);
  process.exit(1);
});

