const crypto = require('crypto');
const axios = require('axios');

/**
 * SMS Service for sending OTP and other SMS messages via 4SMS API
 */
class SmsService {
  /**
   * Generate SMS signature for authentication
   * @param {number} expire - Expiration timestamp
   * @returns {string} MD5 signature
   */
  static smsSignatureApi4(expire) {
    // Match PHP implementation: uses 4SMS_API_TOKEN and 4SMS_API_KEY
    const accessToken = process.env['4SMS_API_TOKEN'] || process.env.SMS_API_TOKEN || '';
    const accessTokenKey = process.env['4SMS_API_KEY'] || process.env.SMS_API_KEY || '';
    
    // Request For may vary eg. send-sms, send-sms-array, send-dynamic-sms, etc..
    const requestFor = 'send-sms';
    
    // MD5 algorithm is hash function producing a 128-bit hash value
    // Match PHP: md5($requestFor."sms@rits-v1.0".$expire)
    const timeKey = crypto.createHash('md5').update(`${requestFor}sms@rits-v1.0${expire}`).digest('hex');
    // Match PHP: md5($accessToken.$timeKey)
    const timeAccessTokenKey = crypto.createHash('md5').update(`${accessToken}${timeKey}`).digest('hex');
    // Match PHP: md5($timeAccessTokenKey.$accessTokenKey)
    const signature = crypto.createHash('md5').update(`${timeAccessTokenKey}${accessTokenKey}`).digest('hex');
    
    return signature;
  }

  /**
   * Send SMS using 4SMS API
   * @param {string} phone - Phone number
   * @param {string} templateId - Template ID
   * @param {string} message - Message content
   * @returns {Promise<string>} API response
   */
  static async singlePushSMS2(phone, templateId, message) {
    try {
      console.log(`📤 [SmsService] Preparing to send SMS to ${phone}`);
      const expire = Math.floor(Date.now() / 1000) + 60; // Current time + 1 minute (match PHP: strtotime("+1 minute"))
      const signature = this.smsSignatureApi4(expire);
      // Match PHP: env('4SMS_API_URL_NEW'), env('4SMS_API_ENITYID'), env('4SMS_API_TOKEN'), env('SMS_HEADER_CENTER_ID')
      const smsApiUrl = (process.env['4SMS_API_URL_NEW'] || process.env.SMS_API_URL_NEW || '').trim();
      const entityid = (process.env['4SMS_API_ENITYID'] || process.env.SMS_API_ENITYID || '').trim();
      const accessToken = process.env['4SMS_API_TOKEN'] || process.env.SMS_API_TOKEN || '';
      const smsHeader = process.env.SMS_HEADER_CENTER_ID || '';

      console.log(`🔍 [SmsService] SMS API Configuration Check:`);
      console.log(`   4SMS_API_URL_NEW (or SMS_API_URL_NEW): ${smsApiUrl ? 'SET (' + smsApiUrl.substring(0, 30) + '...)' : 'NOT SET'}`);
      console.log(`   4SMS_API_ENITYID (or SMS_API_ENITYID): ${entityid ? 'SET (' + entityid + ')' : 'NOT SET'}`);
      console.log(`   4SMS_API_TOKEN (or SMS_API_TOKEN): ${accessToken ? 'SET (' + accessToken.substring(0, 10) + '...)' : 'NOT SET'}`);
      console.log(`   SMS_HEADER_CENTER_ID: ${smsHeader ? 'SET (' + smsHeader + ')' : 'NOT SET'}`);
      console.log(`   Template ID: ${templateId}`);
      console.log(`   Message length: ${message.length} characters`);

      if (!smsApiUrl || !entityid || !accessToken) {
        console.error('❌ [SmsService] SMS API configuration missing. Required: 4SMS_API_URL_NEW (or SMS_API_URL_NEW), 4SMS_API_ENITYID (or SMS_API_ENITYID), 4SMS_API_TOKEN (or SMS_API_TOKEN), 4SMS_API_KEY (or SMS_API_KEY)');
        throw new Error('SMS API configuration not found');
      }
      
      const accessTokenKey = process.env['4SMS_API_KEY'] || process.env.SMS_API_KEY || '';
      if (!accessTokenKey) {
        console.error('❌ [SmsService] SMS_API_KEY missing. Required: 4SMS_API_KEY (or SMS_API_KEY)');
        throw new Error('SMS API KEY not found');
      }

      const params = new URLSearchParams({
        accessToken: accessToken,
        expire: expire.toString(),
        authSignature: signature,
        route: 'transactional',
        smsHeader: smsHeader,
        messageContent: message,
        recipients: phone,
        entityId: entityid,
        templateId: templateId,
      });

      console.log(`📤 [SmsService] Sending SMS request to: ${smsApiUrl}`);
      console.log(`   Parameters (excluding sensitive data):`);
      console.log(`     expire: ${expire}`);
      console.log(`     authSignature: ${signature.substring(0, 20)}...`);
      console.log(`     route: transactional`);
      console.log(`     smsHeader: ${smsHeader}`);
      console.log(`     recipients: ${phone}`);
      console.log(`     entityId: ${entityid}`);
      console.log(`     templateId: ${templateId}`);

      const response = await axios.post(smsApiUrl, params.toString(), {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        timeout: 10000, // 10 second timeout
      });

      console.log(`✅ [SmsService] SMS sent successfully to ${phone}`);
      console.log(`   Response Status: ${response.status}`);
      console.log(`   Response Data:`, JSON.stringify(response.data, null, 2));
      return response.data || response.statusText;
    } catch (error) {
      console.error('❌ [SmsService] Error sending SMS:', error.message);
      console.error('   Error type:', error.constructor.name);
      if (error.response) {
        console.error(`   HTTP Status: ${error.response.status}`);
        console.error(`   Response Headers:`, JSON.stringify(error.response.headers, null, 2));
        console.error(`   Response Data:`, JSON.stringify(error.response.data, null, 2));
      } else if (error.request) {
        console.error(`   No response received. Request details:`, {
          url: error.config?.url,
          method: error.config?.method,
        });
      } else {
        console.error(`   Error message: ${error.message}`);
        console.error(`   Error stack:`, error.stack);
      }
      throw error;
    }
  }

  /**
   * Send OTP via SMS using bulksmsind.in API
   * @param {string} phone - Phone number
   * @param {string} otp - OTP code
   * @param {string} userName - User name (optional, defaults to "User")
   * @returns {Promise<Object>} API response
   */
  static async sendOtp(phone, otp, userName = 'User') {
    console.log(`📱 [SmsService] sendOtp called for phone: ${phone}, OTP: ${otp}`);
    
    return new Promise((resolve, reject) => {
      const http = require('http');
      
      // Clean phone number (remove non-digits)
      const cleanedPhone = phone.replace(/\D/g, '');
      
      // Template message with placeholders
      // Template: "Dear {#var#}, Your SCRAPMATE application login One Time Password (OTP) is {#var#}. Do not share this OTP with anyone."
      const message = `Dear ${userName}, Your SCRAPMATE application login One Time Password (OTP) is ${otp}. Do not share this OTP with anyone.`;
      
      // SMS API configuration
      const username = 'scrapmate';
      const sendername = 'SCRPMT';
      const smstype = 'TRANS';
      const apikey = '1bf0131f-d1f2-49ed-9c57-19f1b4400f32';
      const templateid = '1707173856462706835';
      const peid = '1701173389563945545';
      
      // Build query parameters
      const params = new URLSearchParams({
        username: username,
        sendername: sendername,
        smstype: smstype,
        numbers: cleanedPhone,
        apikey: apikey,
        message: message,
        templateid: templateid,
        peid: peid
      });
      
      const options = {
        hostname: 'sms.bulksmsind.in',
        path: `/v2/sendSMS?${params.toString()}`,
        method: 'GET',
        timeout: 10000 // 10 second timeout
      };
      
      console.log(`📤 [SmsService] Sending OTP SMS to ${cleanedPhone} via bulksmsind.in`);
      console.log(`   Message: ${message.substring(0, 60)}...`);
      console.log(`   URL: https://${options.hostname}${options.path.replace(/apikey=[^&]+/, 'apikey=***')}`);
      
      const req = http.request(options, (res) => {
        let data = '';
        
        res.on('data', (chunk) => {
          data += chunk;
        });
        
        res.on('end', () => {
          try {
            const response = JSON.parse(data);
            console.log(`✅ [SmsService] OTP SMS sent successfully to ${cleanedPhone}`);
            console.log(`   Response:`, JSON.stringify(response, null, 2));
            
            // Check if response indicates success
            if (Array.isArray(response) && response.length > 0) {
              const firstResult = response[0];
              if (firstResult.status === 'success' || firstResult.status === 'sent') {
                resolve(response);
              } else {
                console.error(`❌ [SmsService] SMS API returned error status:`, firstResult);
                reject(new Error(`SMS API error: ${firstResult.status || 'unknown error'}`));
              }
            } else if (response.status === 'success' || response.status === 'sent') {
              resolve(response);
            } else {
              console.error(`❌ [SmsService] SMS API returned error:`, response);
              reject(new Error(`SMS API error: ${response.status || response.message || 'unknown error'}`));
            }
          } catch (parseError) {
            console.error(`❌ [SmsService] Failed to parse SMS API response:`, parseError.message);
            console.error(`   Raw response:`, data);
            reject(new Error(`Failed to parse SMS API response: ${parseError.message}`));
          }
        });
      });
      
      req.on('error', (error) => {
        console.error(`❌ [SmsService] Error sending OTP SMS:`, error.message);
        reject(error);
      });
      
      req.on('timeout', () => {
        console.error(`❌ [SmsService] OTP SMS request timeout`);
        req.destroy();
        reject(new Error('SMS request timeout'));
      });
      
      req.end();
    });
  }

  /**
   * Send order notification SMS
   * @param {string} phone - Phone number
   * @param {string} distance - Distance
   * @param {string} custPlace - Customer place/location
   * @returns {Promise<string>} API response
   */
  static async sendOrderNotification(phone, distance, custPlace) {
    const templateId = '1707173875190649486';
    const message = `Dear User, New scrap materials order, located within ${distance} is ready for collection. Please review the details and coordinate the pickup with the customer at ${custPlace}. SCRAPMATE`;
    
    return await this.singlePushSMS2(phone, templateId, message);
  }
}

module.exports = SmsService;

