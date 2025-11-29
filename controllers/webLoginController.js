const User = require('../models/User');
const bcrypt = require('bcryptjs');
const RedisCache = require('../utils/redisCache');

class WebLoginController {
  // Show login page or redirect if already logged in
  static async login(req, res) {
    try {
      // Check if user is already logged in
      if (req.session && req.session.userId) {
        const userType = req.session.userType;
        if (userType === 'A' || userType === 'U') {
          return res.redirect('/admin/dashboard');
        }
      }

      // If it's an API request, return JSON
      if (req.headers['content-type'] === 'application/json' || req.accepts('json')) {
        return res.json({
          status: 'success',
          msg: 'Login page',
          data: { requiresLogin: true }
        });
      }

      // Otherwise, you would render the login view
      // For now, return a simple response
      return res.json({
        status: 'success',
        msg: 'Please login',
        redirect: '/login'
      });
    } catch (err) {
      console.error('Login page error:', err);
      res.status(500).json({
        status: 'error',
        msg: 'Server error',
        data: ''
      });
    }
  }

  // Handle login form submission
  static async doLogin(req, res) {
    try {
      console.log('\n🔐 ========== LOGIN ATTEMPT ==========');
      console.log('🔐 Request details:', {
        method: req.method,
        url: req.url,
        contentType: req.headers['content-type'] || req.headers['Content-Type'],
        bodyType: typeof req.body,
        bodyIsArray: Array.isArray(req.body),
        bodyKeys: req.body ? Object.keys(req.body) : 'NO_BODY',
        rawBody: JSON.stringify(req.body),
        body: req.body
      });
      
      // Try multiple ways to get email and password
      let email, password;
      
      // Method 0: If body is still a string, parse it first
      if (req.body && typeof req.body === 'string') {
        try {
          const parsed = JSON.parse(req.body);
          req.body = parsed;
          console.log('🔐 Parsed body string in controller:', Object.keys(parsed));
        } catch (parseError) {
          console.error('❌ Failed to parse body string in controller:', parseError);
        }
      }
      
      // Method 1: Direct from body
      if (req.body && typeof req.body === 'object' && !Array.isArray(req.body)) {
        email = req.body.email;
        password = req.body.password;
      }
      
      // Method 2: From nested body (Lambda Function URL sometimes wraps it)
      if ((!email || !password) && req.body && typeof req.body === 'object' && req.body.body) {
        const bodyData = typeof req.body.body === 'string' ? JSON.parse(req.body.body) : req.body.body;
        email = email || bodyData?.email;
        password = password || bodyData?.password;
      }
      
      // Method 3: From Lambda event parsed body (if middleware didn't set req.body)
      if ((!email || !password) && req.lambdaEvent && req.lambdaEvent._parsedBody) {
        email = email || req.lambdaEvent._parsedBody.email;
        password = password || req.lambdaEvent._parsedBody.password;
      }
      
      // Method 4: From query params (fallback)
      if (!email || !password) {
        email = email || req.query.email;
        password = password || req.query.password;
      }

      console.log('🔐 Extracted credentials:', {
        email: email || 'MISSING',
        hasPassword: !!password,
        passwordLength: password?.length || 0,
        emailType: typeof email,
        passwordType: typeof password
      });

      // Validate input
      if (!email || !password) {
        console.log('❌ STEP 1 FAILED: Missing email or password');
        console.log('   Email:', email || 'MISSING', '(type:', typeof email, ')');
        console.log('   Password:', password ? 'PRESENT' : 'MISSING', '(type:', typeof password, ')');
        console.log('   Full request body keys:', req.body ? Object.keys(req.body) : 'NO_BODY');
        console.log('   Full request body:', JSON.stringify(req.body, null, 2));
        return res.json({
          msg: 'invalid',
          status: 'error',
          debug: 'missing_email_or_password',
          received_email: !!email,
          received_password: !!password,
          body_keys: req.body ? Object.keys(req.body) : []
        });
      }

      // Query database for user using User model
      console.log('\n🔍 STEP 2: Looking up user by email:', email);
      let user;
      try {
        user = await User.findByEmail(email);
      } catch (dbError) {
        console.error('❌ STEP 2 FAILED: Database error while finding user:', dbError);
        console.error('   Error name:', dbError.name);
        console.error('   Error message:', dbError.message);
        return res.json({
          msg: 'invalid',
          status: 'error',
          debug: 'database_error_finding_user',
          error: dbError.message
        });
      }
      
      if (!user) {
        console.log('❌ STEP 2 FAILED: User not found:', email);
        console.log('   Attempted email:', email);
        console.log('   Email type:', typeof email);
        
        // Try to find any users in the table for debugging
        try {
          const { getDynamoDBClient } = require('../config/dynamodb');
          const { ScanCommand } = require('@aws-sdk/lib-dynamodb');
          const client = getDynamoDBClient();
          
          // Scan a few users to see what emails exist
          const scanCommand = new ScanCommand({
            TableName: 'users',
            Limit: 10
          });
          const scanResult = await client.send(scanCommand);
          console.log(`   Found ${scanResult.Items?.length || 0} users in table (sample):`);
          if (scanResult.Items && scanResult.Items.length > 0) {
            scanResult.Items.forEach(u => {
              console.log(`     - ID: ${u.id}, Email: "${u.email}" (type: ${typeof u.email}), Name: ${u.name}, UserType: ${u.user_type}`);
            });
          } else {
            console.log('   ⚠️  No users found in table');
          }
        } catch (scanError) {
          console.error('   Could not scan users table:', scanError.message);
          console.error('   Error details:', scanError);
        }
        
        return res.json({
          msg: 'invalid',
          status: 'error',
          debug: 'user_not_found',
          searched_email: email
        });
      }

      console.log('✅ STEP 2 PASSED: User found:', {
        id: user.id,
        email: user.email,
        user_type: user.user_type,
        name: user.name
      });

      // Check user_type
      console.log('\n🔍 STEP 3: Checking user_type:', user.user_type);
      if (user.user_type !== 'A' && user.user_type !== 'U') {
        console.log('❌ STEP 3 FAILED: User type not allowed:', user.user_type);
        console.log('   Allowed types: "A" (Admin) or "U" (User)');
        return res.json({
          msg: 'invalid',
          status: 'error',
          debug: 'user_type_not_allowed',
          user_type: user.user_type
        });
      }
      console.log('✅ STEP 3 PASSED: User type is allowed');

      // Get full user with password for verification
      console.log('\n🔍 STEP 4: Retrieving full user data with password...');
      const { getDynamoDBClient } = require('../config/dynamodb');
      const { GetCommand } = require('@aws-sdk/lib-dynamodb');
      const client = getDynamoDBClient();
      
      let fullUser;
      try {
        const getCommand = new GetCommand({
          TableName: 'users',
          Key: { id: user.id }
        });
        
        const fullUserResponse = await client.send(getCommand);
        fullUser = fullUserResponse.Item;
      } catch (getError) {
        console.error('❌ STEP 4 FAILED: Error retrieving user from DynamoDB:', getError);
        console.error('   Error name:', getError.name);
        console.error('   Error message:', getError.message);
        return res.json({
          msg: 'invalid',
          status: 'error',
          debug: 'database_error_getting_user',
          error: getError.message
        });
      }

      // Verify password exists
      if (!fullUser) {
        console.log('❌ STEP 4 FAILED: Full user data not found');
        console.log('   User ID:', user.id);
        return res.json({
          msg: 'invalid',
          status: 'error',
          debug: 'full_user_not_found'
        });
      }

      if (!fullUser.password) {
        console.log('❌ STEP 4 FAILED: User has no password set');
        console.log('   User ID:', user.id);
        console.log('   User email:', user.email);
        return res.json({
          msg: 'invalid',
          status: 'error',
          debug: 'no_password_set'
        });
      }

      console.log('✅ STEP 4 PASSED: Full user data retrieved');
      console.log('   Has password: YES');
      console.log('   Password hash prefix:', fullUser.password.substring(0, 7));

      // Verify password
      console.log('\n🔐 STEP 5: Verifying password...');
      let isValidPassword;
      try {
        isValidPassword = await bcrypt.compare(password, fullUser.password);
      } catch (bcryptError) {
        console.error('❌ STEP 5 FAILED: Error during password verification:', bcryptError);
        console.error('   Error message:', bcryptError.message);
        return res.json({
          msg: 'invalid',
          status: 'error',
          debug: 'password_verification_error',
          error: bcryptError.message
        });
      }
      
      if (!isValidPassword) {
        console.log('❌ STEP 5 FAILED: Password does not match');
        console.log('   Provided password length:', password.length);
        console.log('   Password hash format:', fullUser.password.substring(0, 7));
        console.log('   Password hash length:', fullUser.password.length);
        return res.json({
          msg: 'invalid',
          status: 'error',
          debug: 'password_mismatch'
        });
      }

      console.log('✅ STEP 5 PASSED: Password verified successfully');

      // Set session
      console.log('\n🔍 STEP 6: Setting session...');
      req.session.userId = user.id;
      req.session.userEmail = user.email;
      req.session.userType = user.user_type;
      req.session.userName = user.name;
      console.log('✅ STEP 6 PASSED: Session set');

      console.log('\n✅ ========== LOGIN SUCCESS ==========');

      // Return success response
      return res.json({
        msg: 'success',
        status: 'success',
        data: {
          user: {
            id: user.id,
            email: user.email,
            name: user.name,
            user_type: user.user_type
          }
        }
      });
    } catch (err) {
      console.error('\n❌ ========== LOGIN ERROR ==========');
      console.error('DoLogin error:', err);
      console.error('Error name:', err.name);
      console.error('Error message:', err.message);
      console.error('Error stack:', err.stack);
      return res.json({
        msg: 'invalid',
        status: 'error',
        debug: 'exception',
        error: err.message
      });
    }
  }

  // Handle logout
  static async logout(req, res) {
    try {
      // Destroy session
      req.session.destroy((err) => {
        if (err) {
          console.error('Session destroy error:', err);
        }
      });

      // If it's an API request, return JSON
      if (req.headers['content-type'] === 'application/json' || req.accepts('json')) {
        return res.json({
          status: 'success',
          msg: 'Logged out successfully',
          redirect: '/login'
        });
      }

      // Otherwise redirect to login
      return res.redirect('/login');
    } catch (err) {
      console.error('Logout error:', err);
      return res.redirect('/login');
    }
  }
}

module.exports = WebLoginController;

