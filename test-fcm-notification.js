/**
 * Test Script for FCM Notification API
 * Tests sending push notification to phone number 9074135121
 */

const axios = require('axios');

const API_BASE_URL = 'http://localhost:3000/api/v2';
const API_KEY = 'zyubkfzeumeoviaqzcsrvfwdzbiwnlnn';
const PHONE_NUMBER = '9074135121';

async function testFCMNotification() {
  console.log('🧪 Testing FCM Notification API');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`📱 Target Phone: ${PHONE_NUMBER}`);
  console.log(`🌐 API Endpoint: ${API_BASE_URL}/notifications/send`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  try {
    // Test 1: Send notification by phone number
    console.log('📤 Test 1: Sending notification by phone number...');
    const response = await axios.post(
      `${API_BASE_URL}/notifications/send`,
      {
        phone_number: PHONE_NUMBER,
        title: 'Test Notification',
        body: 'This is a test push notification from the FCM API',
        data: {
          type: 'test',
          timestamp: new Date().toISOString(),
          test_id: 'fcm-api-test-001'
        }
      },
      {
        headers: {
          'api-key': API_KEY,
          'Content-Type': 'application/json'
        }
      }
    );

    console.log('✅ Response Status:', response.status);
    console.log('📥 Response Data:', JSON.stringify(response.data, null, 2));
    
    if (response.data.status === 'success') {
      console.log('\n🎉 SUCCESS: Notification sent successfully!');
      console.log(`   Message ID: ${response.data.data.messageId}`);
      console.log(`   User ID: ${response.data.data.user_id}`);
    } else {
      console.log('\n⚠️  Response indicates an issue:');
      console.log(`   Message: ${response.data.msg}`);
    }

  } catch (error) {
    console.error('\n❌ Error occurred:');
    
    if (error.response) {
      // Server responded with error status
      console.error(`   Status: ${error.response.status}`);
      console.error(`   Message: ${error.response.data?.msg || error.message}`);
      console.error(`   Data:`, JSON.stringify(error.response.data, null, 2));
    } else if (error.request) {
      // Request made but no response
      console.error('   No response received from server');
      console.error('   Make sure the server is running on http://localhost:3000');
    } else {
      // Error setting up request
      console.error(`   Error: ${error.message}`);
    }
  }

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📝 Notes:');
  console.log('   - If you see "User does not have an FCM token registered",');
  console.log('     the user needs to log in to the mobile app first.');
  console.log('   - If you see "User is not a customer_app user",');
  console.log('     the user must have app_type = "customer_app" in the database.');
  console.log('   - Make sure Firebase Admin SDK is properly configured.');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
}

// Run the test
testFCMNotification().catch(console.error);




