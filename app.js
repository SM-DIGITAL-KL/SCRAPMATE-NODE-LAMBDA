require('dotenv').config();
// Load environment variables from aws.txt (includes API_KEY, AWS credentials, etc.)
const { loadEnvFromFile } = require('./utils/loadEnv');
loadEnvFromFile();

const express = require('express');
const session = require('express-session');
const path = require('path');
const apiRoutes = require('./routes/apiRoutes');
const v2Routes = require('./routes/v2Routes');
// Initialize DynamoDB connection (replacing MySQL)
require('./config/dynamodb'); // Initialize DynamoDB connection

const app = express();

// Request logging middleware (for debugging) - MUST BE FIRST
app.use((req, res, next) => {
  // Log /dologin requests in detail
  if (req.path === '/dologin') {
    console.log('\n🌐🌐🌐 INCOMING LOGIN REQUEST 🌐🌐🌐');
    console.log('   Method:', req.method);
    console.log('   Path:', req.path);
    console.log('   Content-Type:', req.headers['content-type'] || req.headers['Content-Type'] || 'NOT SET');
    console.log('   Body type:', typeof req.body);
    console.log('   Body keys:', req.body ? Object.keys(req.body) : 'NO BODY');
    console.log('   Raw body:', typeof req.body === 'string' ? req.body.substring(0, 200) : JSON.stringify(req.body));
    console.log('   Lambda event body:', req.lambdaEvent?.body ? typeof req.lambdaEvent.body : 'NO LAMBDA EVENT');
  }
  // Only log API routes to reduce noise
  else if (req.path.startsWith('/api')) {
    console.log('\n');
    console.log('🌐🌐🌐 INCOMING REQUEST TO NODE.JS SERVER 🌐🌐🌐');
    console.log('   Method:', req.method);
    console.log('   Path:', req.path);
    console.log('   Full URL:', req.originalUrl || req.url);
    console.log('   Query:', JSON.stringify(req.query));
    console.log('   Params:', JSON.stringify(req.params));
    console.log('   Headers:', {
      'api-key': req.headers['api-key'] ? `Present (${req.headers['api-key'].substring(0, 10)}...)` : '❌ MISSING',
      'content-type': req.headers['content-type'],
      'accept': req.headers['accept']
    });
    console.log('   Timestamp:', new Date().toISOString());
    console.log('   Will route to:', req.path.startsWith('/api/admin') ? 'Admin Panel Routes' : 'API Routes');
  }
  next();
});

// CORS middleware - Allow requests from PHP Laravel app and HTML admin panel
app.use((req, res, next) => {
  const origin = req.headers.origin;
  
  // Allow requests from localhost:8000 (PHP app), HTML admin panel, and Lambda Function URL
  const allowedOrigins = [
    'http://localhost:8000',
    'http://127.0.0.1:8000',
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    'https://uodttljjzj3nh3e4cjqardxip40btqef.lambda-url.ap-south-1.on.aws',
    'https://mono.scrapmate.co.in'
  ];
  
  // IMPORTANT: When using Access-Control-Allow-Credentials: true,
  // you CANNOT use Access-Control-Allow-Origin: *
  // You MUST specify the exact origin
  
  // Check if origin is allowed or if we should allow all origins (for development)
  const isAllowedOrigin = origin && allowedOrigins.includes(origin);
  const shouldAllowAll = !origin; // Allow if no origin (file:// or direct fetch)
  
  console.log('🌐 CORS Middleware:', {
    origin: origin || 'NO_ORIGIN',
    isAllowed: isAllowedOrigin,
    method: req.method,
    path: req.path
  });
  
  if (isAllowedOrigin) {
    // Set the exact origin for allowed origins
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    console.log('✅ CORS: Allowed origin with credentials:', origin);
  } else if (shouldAllowAll) {
    // No origin header (file://, direct fetch, or same-origin)
    // Set a wildcard but disable credentials
    res.setHeader('Access-Control-Allow-Origin', '*');
    console.log('✅ CORS: Allowed wildcard (no origin)');
    // Don't set credentials when using wildcard
  } else if (origin) {
    // For other origins, allow them too (for development flexibility)
    // In production, you might want to reject these
    console.log('⚠️  CORS: Allowing unlisted origin:', origin);
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
  }
  
  // Set other CORS headers
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, api-key, Accept');
  res.setHeader('Access-Control-Expose-Headers', 'Content-Type, Authorization');
  res.setHeader('Vary', 'Origin'); // Important: Tell cache to vary by origin
  
  // Handle preflight OPTIONS requests
  if (req.method === 'OPTIONS') {
    console.log('🔄 CORS Preflight OPTIONS request:', {
      origin: origin,
      'access-control-request-method': req.headers['access-control-request-method'],
      'access-control-request-headers': req.headers['access-control-request-headers']
    });
    return res.status(200).end();
  }
  
  next();
});

// Middleware - Body parsing for Lambda Function URL
// Lambda Function URL sends body as string, so we need to parse it manually if body parser didn't
// This MUST run BEFORE express.json() to catch cases where express.json() doesn't parse
app.use((req, res, next) => {
  // If body is a string but should be JSON (from Lambda Function URL)
  if (req.body && typeof req.body === 'string') {
    const trimmed = req.body.trim();
    // Check if it looks like JSON
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      try {
        const parsed = JSON.parse(req.body);
        req.body = parsed;
        console.log('✅ Manually parsed body from string (before express.json):', Object.keys(parsed));
      } catch (parseError) {
        console.error('❌ Failed to manually parse body:', parseError);
        console.error('   Body preview:', req.body.substring(0, 200));
      }
    }
  }
  // Also check Lambda event parsed body if present (from lambda.js)
  else if (req.lambdaEvent && req.lambdaEvent._parsedBody) {
    req.body = req.lambdaEvent._parsedBody;
    console.log('✅ Using pre-parsed body from Lambda event:', Object.keys(req.body));
  }
  // Also check Lambda event body string if present
  else if (req.lambdaEvent && req.lambdaEvent.body && typeof req.lambdaEvent.body === 'string') {
    const trimmed = req.lambdaEvent.body.trim();
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      try {
        const parsed = JSON.parse(req.lambdaEvent.body);
        req.body = parsed;
        console.log('✅ Parsed body from Lambda event string:', Object.keys(parsed));
      } catch (parseError) {
        console.error('❌ Failed to parse Lambda event body:', parseError);
        console.error('   Body preview:', req.lambdaEvent.body.substring(0, 200));
      }
    }
  }
  next();
});

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Session configuration (for web routes authentication)
// Note: In Lambda, sessions should use DynamoDB or ElastiCache for persistence
app.use(session({
  secret: process.env.SESSION_SECRET || 'your-secret-key-change-in-production',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production', // Use secure cookies in production (HTTPS)
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  }
}));

// Serve static files (images and assets)
// In Lambda, static files should be served from S3 or CloudFront
app.use('/assets', express.static(path.join(__dirname, 'public/assets')));
app.use('/public', express.static(path.join(__dirname, 'public')));

// API Routes (Mobile App APIs) - Mount BEFORE web routes to avoid conflicts
app.use('/api', apiRoutes);

// API v2 Routes (New React Native project APIs)
app.use('/api/v2', v2Routes);

// Health check endpoint for Docker/Lambda
app.get('/api/health', (req, res) => {
  res.status(200).json({
    status: 'healthy',
    service: 'Node.js API Server',
    environment: process.env.NODE_ENV || 'development',
    timestamp: new Date().toISOString()
  });
});

// Test endpoint (no auth required) to verify server is reachable
app.get('/api/test', (req, res) => {
  console.log('✅ Test endpoint hit - Node.js server is reachable');
  res.json({
    status: 'success',
    msg: 'Node.js API server is running and reachable',
    timestamp: new Date().toISOString()
  });
});

// Admin Panel API Routes (for Laravel to call)
const adminPanelApiRoutes = require('./routes/adminPanelApiRoutes');
app.use('/api', adminPanelApiRoutes);

// Web Routes (Admin Panel - migrated from Laravel web.php)
// Mount AFTER API routes so API routes are checked first
const webRoutes = require('./routes/webRoutes');
app.use('/', webRoutes);

// Error handler for API routes
app.use((err, req, res, next) => {
  return res.status(err.status || 500).json({
    status: 'error',
    msg: err.message || 'Internal server error',
    data: ''
  });
});

// 404 handler
app.use((req, res) => {
  return res.status(404).json({
    status: 'error',
    msg: 'API endpoint not found',
    data: ''
  });
});

module.exports = app;

