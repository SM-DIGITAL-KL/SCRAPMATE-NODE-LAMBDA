/**
 * Test script to verify SR users API endpoint
 */

require('dotenv').config();
const http = require('http');

const options = {
  hostname: 'localhost',
  port: 3000,
  path: '/api/admin/sr-users?page=1&limit=10',
  method: 'GET',
  headers: {
    'Content-Type': 'application/json',
    'x-api-key': process.env.API_KEY || 'your-api-key-here'
  }
};

const req = http.request(options, (res) => {
  let data = '';

  res.on('data', (chunk) => {
    data += chunk;
  });

  res.on('end', () => {
    try {
      const response = JSON.parse(data);
      console.log('✅ API Response Status:', res.statusCode);
      console.log('📊 Response Data:');
      console.log(JSON.stringify(response, null, 2));
      
      if (response.status === 'success' && response.data) {
        console.log('\n✅ SR Users Found:', response.data.total);
        if (response.data.users && response.data.users.length > 0) {
          console.log('\n📋 Users:');
          response.data.users.forEach((user, index) => {
            console.log(`\n${index + 1}. User ID: ${user.id}`);
            console.log(`   Name: ${user.name || 'N/A'}`);
            console.log(`   Phone: ${user.mob_num || user.contact || 'N/A'}`);
            console.log(`   Type: ${user.user_type || 'N/A'}`);
            console.log(`   App Type: ${user.app_type || 'N/A'}`);
          });
        } else {
          console.log('\n⚠️  No users found in response');
        }
      } else {
        console.log('\n❌ API returned error:', response.msg || 'Unknown error');
      }
    } catch (err) {
      console.error('❌ Error parsing response:', err);
      console.log('Raw response:', data);
    }
  });
});

req.on('error', (error) => {
  console.error('❌ Request error:', error.message);
  console.log('\n💡 Make sure the Node.js server is running on port 3000');
});

req.end();


