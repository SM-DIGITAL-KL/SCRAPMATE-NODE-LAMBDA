const axios = require('axios');
const path = require('path');
const fs = require('fs');

// Import the User model (we're in SCRAPMATE-NODE-LAMBDA/scripts)
const User = require('../models/User');

// Configuration
const CONFIG = {
  apiUrl: 'http://web.cloudwhatsapp.com/wapp/api/send',
  apikey: '32cc1bf19c6a483ea89dccc23aed48eb',
  imageUrl: 'https://web.cloudwhatsapp.com/uploads/20260203/17557/Whatsapp_vendor_40in.png',
  message: `♻️ Scrapmate
To keep receiving scrap pickup requests and payments, please complete your Aadhaar & PAN verification in the app.
It takes only a couple of minutes and helps keep the platform safe and smooth for everyone.
You can upload the documents anytime at your convenience.
📱 Partner App (Download / Update):
https://play.google.com/store/apps/details?id=com.app.scrapmatepartner&hl=en_IN
📽 How to complete verification (Demo):
https://drive.google.com/file/d/1RgDdws3bwvaAVQflaRGOJmvi5hPKLYIg/view?usp=drivesdk
Thank you for being part of Scrapmate 🙏`,
  delayBetweenMessages: 2000, // 2 seconds delay to avoid rate limiting
};

async function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function sendWhatsAppMessage(mobile, message, imageUrl) {
  try {
    // Clean mobile number (remove +91 or any prefix)
    const cleanMobile = String(mobile).replace(/\D/g, '').replace(/^91/, '');
    
    const params = {
      mobile: cleanMobile,
      apikey: CONFIG.apikey,
      msg: message,
      img1: imageUrl
    };

    console.log(`📤 Sending to ${cleanMobile}...`);
    
    const response = await axios.get(CONFIG.apiUrl, { 
      params,
      timeout: 30000,
      validateStatus: () => true // Don't throw on non-2xx status
    });

    return {
      success: response.status === 200,
      mobile: cleanMobile,
      status: response.status,
      data: response.data
    };
  } catch (error) {
    return {
      success: false,
      mobile,
      error: error.message
    };
  }
}

async function sendBulkMessages() {
  console.log('🚀 Starting Bulk WhatsApp Campaign for Vendors\n');
  console.log('📋 Configuration:');
  console.log(`   API URL: ${CONFIG.apiUrl}`);
  console.log(`   Image: ${CONFIG.imageUrl}`);
  console.log(`   Message length: ${CONFIG.message.length} characters\n`);

  try {
    // Fetch all 'N' type users (New vendor_app users)
    console.log('📥 Fetching all N-type (New) vendor users from database...');
    const result = await User.getNewUsers(1, 999999); // Get all users without pagination
    
    if (!result.users || result.users.length === 0) {
      console.log('❌ No N-type users found in database');
      return;
    }

    const users = result.users;
    console.log(`✅ Found ${users.length} N-type users\n`);

    // Filter users with valid mobile numbers
    const validUsers = users.filter(user => {
      const mobile = user.mob_num;
      return mobile && String(mobile).length >= 10;
    });

    console.log(`📱 ${validUsers.length} users have valid mobile numbers\n`);

    // Show first 5 users as preview
    console.log('👥 Sample users:');
    validUsers.slice(0, 5).forEach((user, i) => {
      console.log(`   ${i + 1}. ${user.name || 'Unknown'} - ${user.mob_num}`);
    });
    if (validUsers.length > 5) {
      console.log(`   ... and ${validUsers.length - 5} more\n`);
    }

    // Ask for confirmation
    console.log('\n⚠️  This will send WhatsApp messages to all ' + validUsers.length + ' users.');
    console.log('Press Ctrl+C within 5 seconds to cancel...\n');
    await delay(5000);

    // Results tracking
    const results = {
      success: [],
      failed: []
    };

    // Send messages one by one with delay
    for (let i = 0; i < validUsers.length; i++) {
      const user = validUsers[i];
      const mobile = user.mob_num;
      
      console.log(`\n[${i + 1}/${validUsers.length}] Sending to ${user.name || 'Unknown'} (${mobile})...`);
      
      const result = await sendWhatsAppMessage(mobile, CONFIG.message, CONFIG.imageUrl);
      
      if (result.success) {
        console.log(`   ✅ Success: ${JSON.stringify(result.data)}`);
        results.success.push({ mobile, user: user.name });
      } else {
        console.log(`   ❌ Failed: ${result.error || JSON.stringify(result.data)}`);
        results.failed.push({ mobile, user: user.name, error: result.error });
      }

      // Delay between messages to avoid rate limiting
      if (i < validUsers.length - 1) {
        console.log(`   ⏳ Waiting ${CONFIG.delayBetweenMessages}ms before next message...`);
        await delay(CONFIG.delayBetweenMessages);
      }
    }

    // Summary
    console.log('\n' + '='.repeat(60));
    console.log('📊 CAMPAIGN SUMMARY');
    console.log('='.repeat(60));
    console.log(`Total Users: ${validUsers.length}`);
    console.log(`✅ Successful: ${results.success.length}`);
    console.log(`❌ Failed: ${results.failed.length}`);
    
    if (results.failed.length > 0) {
      console.log('\n❌ Failed numbers:');
      results.failed.forEach(f => console.log(`   - ${f.mobile} (${f.user}): ${f.error}`));
    }

    // Save results to file
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const reportFile = path.join(__dirname, `campaign-report-${timestamp}.json`);
    fs.writeFileSync(reportFile, JSON.stringify(results, null, 2));
    console.log(`\n📝 Report saved to: ${reportFile}`);

  } catch (error) {
    console.error('\n❌ Fatal Error:', error.message);
    console.error(error.stack);
  }
}

// Run the campaign
sendBulkMessages().then(() => {
  console.log('\n✅ Campaign completed!');
  process.exit(0);
}).catch(err => {
  console.error('\n❌ Campaign failed:', err);
  process.exit(1);
});
