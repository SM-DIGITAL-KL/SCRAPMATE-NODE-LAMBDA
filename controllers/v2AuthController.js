const V2AuthService = require('../services/auth/v2AuthService');

class V2AuthController {
  /**
   * POST /api/v2/auth/login
   * Login with phone number - returns OTP
   * Body: { phoneNumber: string }
   * Response: { status, message, data: { otp, isNewUser, userType? } }
   */
  static async login(req, res) {
    try {
      const { phoneNumber, appType } = req.body;

      if (!phoneNumber) {
        return res.status(400).json({
          status: 'error',
          message: 'Phone number is required',
          data: null
        });
      }

      const result = await V2AuthService.generateOtp(phoneNumber, appType);

      return res.json({
        status: 'success',
        message: 'OTP sent successfully',
        data: result
      });
    } catch (err) {
      console.error('V2 Login error:', err);
      const statusCode = err.message.includes('admin') ? 403 : 
                        err.message.includes('Invalid') ? 400 : 500;
      return res.status(statusCode).json({
        status: 'error',
        message: err.message || 'Failed to process login request',
        data: null
      });
    }
  }

  /**
   * POST /api/v2/auth/verify-otp
   * Verify OTP and complete login
   * Body: { phoneNumber: string, otp: string, joinType?: 'b2b' | 'b2c' | 'delivery' }
   * Response: { status, message, data: { user, token, dashboardType } }
   */
  static async verifyOtp(req, res) {
    try {
      // Debug logging
      console.log('📋 [verifyOtp] Request body:', JSON.stringify(req.body, null, 2));
      console.log('📋 [verifyOtp] Request body type:', typeof req.body);
      console.log('📋 [verifyOtp] Request body keys:', req.body ? Object.keys(req.body) : 'NO BODY');
      console.log('📋 [verifyOtp] Content-Type:', req.headers['content-type'] || req.headers['Content-Type']);
      
      const { phoneNumber, otp, joinType, appType, fcm_token } = req.body;

      if (!phoneNumber || !otp) {
        console.error('❌ [verifyOtp] Missing required fields:', {
          phoneNumber: !!phoneNumber,
          otp: !!otp,
          body: req.body
        });
        return res.status(400).json({
          status: 'error',
          message: 'Phone number and OTP are required',
          data: null
        });
      }

      const result = await V2AuthService.verifyOtpAndLogin(phoneNumber, otp, joinType, appType, fcm_token);

      // Log the result to debug
      console.log('📋 V2AuthController.verifyOtp - Result keys:', Object.keys(result));
      console.log('📋 V2AuthController.verifyOtp - b2bStatus:', result.b2bStatus);
      console.log('📋 V2AuthController.verifyOtp - Full result:', JSON.stringify(result, null, 2));

      return res.json({
        status: 'success',
        message: 'Login successful',
        data: result
      });
    } catch (err) {
      console.error('V2 Verify OTP error:', err);
      const statusCode = err.message.includes('admin') ? 403 : 
                        err.message.includes('required') || err.message.includes('Invalid') ? 400 : 500;
      return res.status(statusCode).json({
        status: 'error',
        message: err.message || 'Failed to verify OTP',
        data: null
      });
    }
  }
}

module.exports = V2AuthController;

