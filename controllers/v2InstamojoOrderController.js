/**
 * V2 Instamojo Payment Request Controller
 * Creates payment requests using Instamojo v1 API (X-Api-Key and X-Auth-Token)
 * Returns longurl for WebView integration
 */

const https = require('https');
const { URLSearchParams } = require('url');

/**
 * Create Instamojo payment request (for WebView)
 * POST /api/v2/instamojo/create-payment-request
 * Body: {
 *   purpose: string,
 *   amount: string | number,
 *   buyer_name: string,
 *   email: string,
 *   phone: string,
 *   redirect_url: string
 * }
 * 
 * Returns: {
 *   status: 'success',
 *   data: {
 *     payment_request_id: string,
 *     longurl: string,
 *     ...other payment request fields
 *   }
 * }
 */
exports.createPaymentRequest = async (req, res) => {
  try {
    const {
      purpose,
      amount,
      buyer_name,
      email,
      phone,
      redirect_url,
      webhook_url,
      send_email = false,
      send_sms = false,
      allow_repeated_payments = false,
    } = req.body;

    // Validate required fields
    if (!purpose || !amount || !buyer_name || !email || !phone || !redirect_url) {
      return res.status(400).json({
        status: 'error',
        msg: 'Missing required fields: purpose, amount, buyer_name, email, phone, and redirect_url are required',
        data: null,
      });
    }

    // Validate amount
    const amountNum = parseFloat(amount);
    if (isNaN(amountNum) || amountNum <= 0) {
      return res.status(400).json({
        status: 'error',
        msg: 'Invalid amount. Amount must be a positive number',
        data: null,
      });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        status: 'error',
        msg: 'Invalid email format',
        data: null,
      });
    }

    // Validate phone (should be 10 digits)
    const phoneClean = String(phone).replace(/\D/g, '');
    if (phoneClean.length !== 10) {
      return res.status(400).json({
        status: 'error',
        msg: 'Invalid phone number. Phone number must be 10 digits',
        data: null,
      });
    }

    console.log('💳 Creating Instamojo payment request:', {
      purpose,
      amount: amountNum,
      buyer_name,
      email,
      phone: phoneClean,
      redirect_url,
    });

    // Get Instamojo credentials
    const apiKey = process.env.INSTAMOJO_API_KEY;
    const authToken = process.env.INSTAMOJO_AUTH_TOKEN;

    if (!apiKey || !authToken) {
      console.error('❌ Instamojo credentials not configured');
      return res.status(500).json({
        status: 'error',
        msg: 'Instamojo API credentials not configured. Please check environment variables.',
        data: null,
      });
    }

    // Create payment request using Instamojo v1 API
    const paymentRequestData = new URLSearchParams({
      purpose: purpose,
      amount: amountNum.toString(),
      buyer_name: buyer_name,
      email: email,
      phone: phoneClean,
      redirect_url: redirect_url,
      send_email: send_email ? 'True' : 'False',
      send_sms: send_sms ? 'True' : 'False',
      allow_repeated_payments: allow_repeated_payments ? 'True' : 'False',
    });

    // Add webhook URL if provided
    if (webhook_url) {
      paymentRequestData.append('webhook', webhook_url);
    }

    const postData = paymentRequestData.toString();

    // Instamojo uses different domains for test and production
    // Test: https://test.instamojo.com/api/1.1/
    // Production: https://www.instamojo.com/api/1.1/
    // You can set INSTAMOJO_ENV=test or INSTAMOJO_ENV=production in environment variables
    // Default to production if not specified
    const instamojoEnv = process.env.INSTAMOJO_ENV || 'production';
    const hostname = instamojoEnv === 'test' ? 'test.instamojo.com' : 'www.instamojo.com';

    console.log('🌐 Using Instamojo environment:', instamojoEnv, '→', hostname);

    const options = {
      hostname: hostname,
      path: '/api/1.1/payment-requests/',
      method: 'POST',
      headers: {
        'X-Api-Key': apiKey,
        'X-Auth-Token': authToken,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(postData),
      },
    };

    const paymentRequest = await new Promise((resolve, reject) => {
      const req = https.request(options, (res) => {
        let data = '';

        res.on('data', (chunk) => {
          data += chunk;
        });

        res.on('end', () => {
          try {
            const response = JSON.parse(data);
            console.log('📥 Instamojo API response:', {
              statusCode: res.statusCode,
              hostname: hostname,
              path: options.path,
              success: response.success,
              hasPaymentRequest: !!response.payment_request,
              hasId: !!(response.payment_request?.id || response.id),
              hasLongurl: !!(response.payment_request?.longurl || response.longurl),
              error: response.message || response.error,
            });

            // Instamojo API returns data in nested payment_request object
            const paymentRequest = response.payment_request || response;
            
            if (res.statusCode === 201 && paymentRequest.id && paymentRequest.longurl) {
              console.log('✅ Instamojo payment request created successfully:', {
                id: paymentRequest.id,
                longurl: paymentRequest.longurl,
              });
              resolve(paymentRequest);
            } else {
              // Log full response for debugging
              console.error('❌ Instamojo API error response:', JSON.stringify(response, null, 2));
              reject(new Error(response.message || response.error || `HTTP ${res.statusCode}: Failed to create payment request`));
            }
          } catch (error) {
            console.error('❌ Failed to parse Instamojo response:', error);
            console.error('Raw response:', data);
            console.error('Status code:', res.statusCode);
            reject(new Error(`Failed to parse payment request response: ${error.message}`));
          }
        });
      });

      req.on('error', (error) => {
        console.error('❌ Request error:', error);
        reject(new Error(`Failed to create payment request: ${error.message}`));
      });

      req.write(postData);
      req.end();
    });

    console.log('✅ Instamojo payment request created:', {
      payment_request_id: paymentRequest.id,
      longurl: paymentRequest.longurl,
    });

    // Return payment request data with longurl for WebView
    res.json({
      status: 'success',
      msg: 'Payment request created successfully',
      data: {
        id: paymentRequest.id,
        phone: paymentRequest.phone,
        email: paymentRequest.email,
        buyer_name: paymentRequest.buyer_name,
        amount: paymentRequest.amount,
        purpose: paymentRequest.purpose,
        expires_at: paymentRequest.expires_at,
        status: paymentRequest.status,
        send_sms: paymentRequest.send_sms,
        send_email: paymentRequest.send_email,
        sms_status: paymentRequest.sms_status,
        email_status: paymentRequest.email_status,
        shorturl: paymentRequest.shorturl,
        longurl: paymentRequest.longurl, // This is what we need for WebView
        redirect_url: paymentRequest.redirect_url,
        webhook: paymentRequest.webhook,
        created_at: paymentRequest.created_at,
        modified_at: paymentRequest.modified_at,
        allow_repeated_payments: paymentRequest.allow_repeated_payments,
        mark_fulfilled: paymentRequest.mark_fulfilled,
        payment_request_id: paymentRequest.id, // Alias for compatibility
      },
    });
  } catch (error) {
    console.error('❌ Error creating Instamojo payment order:', error);
    res.status(500).json({
      status: 'error',
      msg: error.message || 'Failed to create payment order',
      data: null,
    });
  }
};

/**
 * Get Instamojo payment request details
 * GET /api/v2/instamojo/payment-request/:paymentRequestId
 * 
 * Returns: {
 *   status: 'success',
 *   data: {
 *     payment_request: {...},
 *     payments: [...]
 *   }
 * }
 */
exports.getPaymentRequestDetails = async (req, res) => {
  try {
    const { paymentRequestId } = req.params;

    if (!paymentRequestId) {
      return res.status(400).json({
        status: 'error',
        msg: 'Payment request ID is required',
        data: null,
      });
    }

    console.log('🔍 Fetching Instamojo payment request details:', paymentRequestId);

    // Get Instamojo credentials
    const apiKey = process.env.INSTAMOJO_API_KEY;
    const authToken = process.env.INSTAMOJO_AUTH_TOKEN;

    if (!apiKey || !authToken) {
      console.error('❌ Instamojo credentials not configured');
      return res.status(500).json({
        status: 'error',
        msg: 'Instamojo API credentials not configured. Please check environment variables.',
        data: null,
      });
    }

    // Determine environment
    const instamojoEnv = process.env.INSTAMOJO_ENV || 'production';
    const hostname = instamojoEnv === 'test' ? 'test.instamojo.com' : 'www.instamojo.com';

    const options = {
      hostname: hostname,
      path: `/api/1.1/payment-requests/${paymentRequestId}/`,
      method: 'GET',
      headers: {
        'X-Api-Key': apiKey,
        'X-Auth-Token': authToken,
      },
    };

    const paymentDetails = await new Promise((resolve, reject) => {
      const req = https.request(options, (res) => {
        let data = '';

        res.on('data', (chunk) => {
          data += chunk;
        });

        res.on('end', () => {
          try {
            const response = JSON.parse(data);
            console.log('📥 Instamojo payment details response:', {
              statusCode: res.statusCode,
              hasPaymentRequest: !!response.payment_request,
              paymentsCount: response.payments?.length || 0,
            });

            if (res.statusCode === 200 && response.payment_request) {
              resolve(response);
            } else {
              reject(new Error(response.message || response.error || `HTTP ${res.statusCode}: Failed to get payment details`));
            }
          } catch (error) {
            console.error('❌ Failed to parse Instamojo payment details response:', error);
            console.error('Raw response:', data);
            reject(new Error(`Failed to parse payment details response: ${error.message}`));
          }
        });
      });

      req.on('error', (error) => {
        console.error('❌ Request error:', error);
        reject(new Error(`Failed to get payment details: ${error.message}`));
      });

      req.end();
    });

    console.log('✅ Instamojo payment details fetched:', {
      payment_request_id: paymentRequestId,
      payments_count: paymentDetails.payments?.length || 0,
    });

    // Return payment details
    res.json({
      status: 'success',
      msg: 'Payment details fetched successfully',
      data: {
        payment_request: paymentDetails.payment_request,
        payments: paymentDetails.payments || [],
      },
    });
  } catch (error) {
    console.error('❌ Error fetching Instamojo payment details:', error);
    res.status(500).json({
      status: 'error',
      msg: error.message || 'Failed to fetch payment details',
      data: null,
    });
  }
};

/**
 * Handle Instamojo payment redirect
 * GET /api/v2/instamojo/payment-redirect
 * This endpoint is called by Instamojo after payment completion
 * Query params: payment_id, payment_request_id, payment_status
 * 
 * Note: This endpoint is public (no API key required) as it's called by Instamojo servers
 * The WebView will detect the redirect URL and extract payment details
 */
exports.handlePaymentRedirect = async (req, res) => {
  try {
    const { payment_id, payment_request_id, payment_status } = req.query;

    console.log('🔄 Instamojo payment redirect received:', {
      payment_id,
      payment_request_id,
      payment_status,
    });

    // Return a simple HTML page that the WebView can detect
    // The WebView's onNavigationStateChange will handle the actual processing
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Payment Redirect</title>
        <style>
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            display: flex;
            justify-content: center;
            align-items: center;
            min-height: 100vh;
            margin: 0;
            background-color: #f5f5f5;
          }
          .container {
            text-align: center;
            padding: 20px;
            background: white;
            border-radius: 8px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
          }
          .success {
            color: #4CAF50;
            font-size: 24px;
            margin-bottom: 10px;
          }
          .message {
            color: #666;
            font-size: 16px;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="success">✓</div>
          <div class="message">Payment processed. Please close this window.</div>
        </div>
      </body>
      </html>
    `;

    res.setHeader('Content-Type', 'text/html');
    res.send(html);
  } catch (error) {
    console.error('❌ Error handling Instamojo payment redirect:', error);
    res.status(500).send('Error processing payment redirect');
  }
};

