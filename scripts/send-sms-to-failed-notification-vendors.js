require('dotenv').config();
const User = require('../models/User');
const Shop = require('../models/Shop');
const BulkMessageNotification = require('../models/BulkMessageNotification');
const http = require('http');
const querystring = require('querystring');

// SMS Configuration
const SMS_CONFIG = {
  username: 'scrapmate',
  sendername: 'SCRPMT',
  smstype: 'TRANS',
  apikey: '1bf0131f-d1f2-49ed-9c57-19f1b4400f32',
  peid: '1701173389563945545',
  templateid: '1707176848678158022'
};

const SMS_MESSAGE = 'Your address and Aadhaar card details are missing. Srapmate Customers awaiting pickup. Your data is secure with us. Join with one of 1000+ vendors across India.';

// List of failed vendor user IDs (extracted from terminal output)
const FAILED_VENDOR_IDS = [
  1768235582684, // User_9123553536
  1132, // SUDALAI TRADERS
  1767938464344, // User_8078447827
  1767864205335, // User_8807281983
  1767269393771, // Mani
  476, // INDIAN STEELS
  1767870602730, // User_9585115621
  2583, // isravel
  1768058203442, // User_9789668120
  1768016657038, // User_9080260071
  1767975909438, // User_9865961570
  1845, // AMAN MOTOR PARTS AND SCRAP
  1768030038223, // User_7502904946
  1768128518216, // Nithin
  1767929843104, // User_8489624884
  1768038557926, // User_9842340840
  1767910425271, // User_9092997380
  1768032399926, // User_8015018911
  1768360903340, // User_7291800073
  1100, // Tiruppur scrap
  1767837997926, // User_6300114610
  1767269512269, // User_9074135128
  1767805501588, // User_7502738037
  523, // AJ BJ TRADERS
  1768012074551, // User_9790445951
  1768032322096, // User_7904306030
  1767869092608, // User_9500938093
  1768053316798, // User_9965367676
  1767773888491, // User_9913737272
  1768032272830, // User_8939574723
  1767701912586, // User_9495385853
  1767930622280, // User_7639802886
  1767961151779, // User_8610878563
  1766755545292, // User_9080909832
  1202, // Vijay traders
  1767965673222, // User_8879332108
  3677, // Mutharamman waste pepar mart
  1768218728390, // User_8838904669
  1768101867491, // User_9790090437
  1768111463108, // User_9626257139
  3399, // Sb old IRONMART
  974, // sugam mettals
  2570, // S2
  1768058835147, // User_9946781786
  1767881685222, // User_9344265622
  826, // A@S SCRAP
  1767865561654, // User_9789444767
  1767082654118, // User_7736068552
  1767360358937, // Kathirvel
  3663, // Vijay scrap Traders Iron, Plastic, Cotton Box and Papers Chennai
  1767962695176, // User_9597346229
  1768139959006, // User_9926440346
  337, // ss scrap
  1768032071724, // User_8825501809
  1768034861036, // MANI traders
  1767958599569, // User_8610303096
  1766223326299, // Balamurugan Traders
  1767533077342, // User_9526374900
  863, // sm scrap buyers
  1767975746640, // User_8608016175
  1767928395223, // User_9363602533
  1766584571456, // User_9074135421
  910, // SK Old Scrap
  1767704430163, // User_9667754604
  1768015650249, // User_6380136385
  1767870655001, // User_9003182228
  1767923322330, // User_7904526583
  1768199072662, // User_8921819474
  688 // திரவியம் பேப்பர் மாட்
];

// Function to send SMS
function sendSMS(phoneNumber, message) {
  return new Promise((resolve, reject) => {
    // Clean phone number
    const cleanedPhone = String(phoneNumber).replace(/\D/g, '');
    
    if (cleanedPhone.length !== 10) {
      reject(new Error(`Invalid phone number: ${phoneNumber}`));
      return;
    }

    const params = querystring.stringify({
      username: SMS_CONFIG.username,
      message: message,
      sendername: SMS_CONFIG.sendername,
      smstype: SMS_CONFIG.smstype,
      numbers: cleanedPhone,
      apikey: SMS_CONFIG.apikey,
      peid: SMS_CONFIG.peid,
      templateid: SMS_CONFIG.templateid
    });

    const options = {
      hostname: 'sms.bulksmsind.in',
      path: `/v2/sendSMS?${params}`,
      method: 'GET',
      timeout: 10000
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        try {
          const response = JSON.parse(data);
          console.log(`   SMS API Response:`, JSON.stringify(response));
          
          // Handle array response format
          let responseObj = response;
          if (Array.isArray(response) && response.length > 0) {
            responseObj = response[0];
          }
          
          // Check if response indicates success
          if (responseObj && (responseObj.status === 'success' || responseObj.msg === 'successfully submitted' || responseObj.statusCode === '200' || responseObj.message === 'SMS sent successfully')) {
            resolve({ success: true, response: responseObj, messageId: responseObj.msgid });
          } else {
            resolve({ success: false, response: responseObj });
          }
        } catch (e) {
          // If not JSON, treat as raw response
          const rawResponse = data.trim();
          console.log(`   SMS API Raw Response: ${rawResponse}`);
          if (rawResponse && !rawResponse.includes('error') && !rawResponse.includes('Error')) {
            resolve({ success: true, response: rawResponse });
          } else {
            resolve({ success: false, response: rawResponse });
          }
        }
      });
    });

    req.on('error', (error) => {
      reject({ success: false, error: error.message });
    });

    req.on('timeout', () => {
      req.destroy();
      reject({ success: false, error: 'SMS request timeout' });
    });

    req.end();
  });
}

// Extract phone number from various formats
function extractPhoneNumber(phone) {
  if (!phone) return null;
  
  // Remove all non-digit characters
  let cleaned = phone.toString().replace(/\D/g, '');
  
  // Remove leading country code if present (91 for India)
  if (cleaned.startsWith('91') && cleaned.length === 12) {
    cleaned = cleaned.substring(2);
  }
  
  // Should be 10 digits
  if (cleaned.length === 10) {
    return cleaned;
  }
  
  return null;
}

async function sendSMSToFailedVendors() {
  try {
    console.log('\n📱 Sending SMS to Failed Notification Vendors');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    console.log(`Total failed vendors: ${FAILED_VENDOR_IDS.length}\n`);
    
    const results = [];
    let successCount = 0;
    let failureCount = 0;
    
    for (let i = 0; i < FAILED_VENDOR_IDS.length; i++) {
      const userId = FAILED_VENDOR_IDS[i];
      
      try {
        // Get user details
        const user = await User.findById(userId);
        
        if (!user) {
          console.log(`[${i + 1}/${FAILED_VENDOR_IDS.length}] User ID ${userId} - ❌ User not found`);
          results.push({
            user_id: userId,
            name: 'N/A',
            mobile: 'N/A',
            status: 'user_not_found'
          });
          failureCount++;
          continue;
        }
        
        const userName = user.name || 'N/A';
        const userMobile = user.mob_num || user.mobile || user.phone || 'N/A';
        
        console.log(`[${i + 1}/${FAILED_VENDOR_IDS.length}] Sending SMS to: ${userName} (ID: ${userId}, Mobile: ${userMobile})`);
        
        // Extract and validate phone number
        const phoneNumber = extractPhoneNumber(userMobile);
        
        if (!phoneNumber) {
          console.log(`   ❌ Invalid phone number: ${userMobile}`);
          results.push({
            user_id: userId,
            name: userName,
            mobile: userMobile,
            status: 'invalid_phone'
          });
          failureCount++;
          continue;
        }
        
        // Send SMS
        const smsResult = await sendSMS(phoneNumber, SMS_MESSAGE);
        
        // Save to bulk_message_notifications table
        try {
          await BulkMessageNotification.save({
            phone_number: phoneNumber,
            business_data: {
              user_id: userId,
              user_name: userName,
              type: 'rejected_vendor_reminder'
            },
            message: SMS_MESSAGE,
            status: smsResult.success ? 'sent' : 'failed',
            language: 'en'
          });
        } catch (saveErr) {
          console.error(`   ⚠️  Error saving to bulk_message_notifications: ${saveErr.message}`);
        }
        
        if (smsResult.success) {
          successCount++;
          console.log(`   ✅ SMS sent successfully`);
          results.push({
            user_id: userId,
            name: userName,
            mobile: phoneNumber,
            status: 'success'
          });
        } else {
          failureCount++;
          console.log(`   ❌ SMS failed: ${smsResult.response || smsResult.error}`);
          results.push({
            user_id: userId,
            name: userName,
            mobile: phoneNumber,
            status: 'failed',
            error: smsResult.response || smsResult.error
          });
        }
        
        // Add delay to avoid rate limiting
        if (i < FAILED_VENDOR_IDS.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 200));
        }
        
      } catch (err) {
        failureCount++;
        console.error(`   ❌ Error processing user ${userId}: ${err.message}`);
        results.push({
          user_id: userId,
          name: 'N/A',
          mobile: 'N/A',
          status: 'error',
          error: err.message
        });
      }
    }
    
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📊 Final Results:');
    console.log(`   ✅ Success: ${successCount}`);
    console.log(`   ❌ Failed: ${failureCount}`);
    console.log(`   📊 Total: ${FAILED_VENDOR_IDS.length}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    
    // Show summary of failures
    const failedResults = results.filter(r => r.status !== 'success');
    if (failedResults.length > 0) {
      console.log('❌ Failed SMS:');
      failedResults.forEach((result, idx) => {
        console.log(`   ${idx + 1}. ${result.name} (ID: ${result.user_id}) - ${result.status}`);
        if (result.error) {
          console.log(`      Error: ${result.error}`);
        }
      });
      console.log('');
    }
    
    console.log('✅ Done!\n');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run the script
sendSMSToFailedVendors();
