/**
 * Auth Service Lambda Handler
 * Handles authentication, login, and user registration
 */

const serverless = require('serverless-http');
const express = require('express');
const app = express();

// Load environment variables
require('dotenv').config();
const { loadEnvFromFile } = require('../../utils/loadEnv');
loadEnvFromFile();

// Initialize DynamoDB
require('../../config/dynamodb');

// Middleware - Body parsing for HTTP API v2 (BEFORE express.json)
app.use((req, res, next) => {
  // IMPORTANT: Do NOT parse multipart/form-data - let multer handle it
  const contentType = req.headers['content-type'] || req.headers['Content-Type'] || '';
  const isMultipart = contentType.includes('multipart/form-data');
  
  // Skip parsing for multipart/form-data - multer will handle it
  if (isMultipart) {
    console.log('📎 Multipart request detected, skipping JSON parsing - multer will handle');
    return next();
  }
  
  // If body is a Buffer or string, parse it manually for HTTP API v2
  if (req.body) {
    try {
      let bodyString = null;
      
      if (Buffer.isBuffer(req.body)) {
        bodyString = req.body.toString('utf-8');
      } else if (typeof req.body === 'string') {
        bodyString = req.body;
      }
      
      if (bodyString) {
        if (contentType.includes('application/json') || bodyString.trim().startsWith('{') || bodyString.trim().startsWith('[')) {
          req.body = JSON.parse(bodyString);
          console.log('✅ Parsed body in middleware:', Object.keys(req.body));
        }
      }
    } catch (e) {
      console.error('Failed to parse body:', e);
    }
  }
  next();
});

// Only use JSON parser for non-multipart requests
app.use((req, res, next) => {
  const contentType = req.headers['content-type'] || req.headers['Content-Type'] || '';
  if (!contentType.includes('multipart/form-data')) {
    express.json()(req, res, next);
  } else {
    next();
  }
});

// Only use urlencoded parser for non-multipart requests
app.use((req, res, next) => {
  const contentType = req.headers['content-type'] || req.headers['Content-Type'] || '';
  if (!contentType.includes('multipart/form-data')) {
    express.urlencoded({ extended: true })(req, res, next);
  } else {
    next();
  }
});

// Debug middleware to log request body
app.use((req, res, next) => {
  if (req.path === '/login' || req.path === '/api/login') {
    console.log('Request body in Express:', {
      body: req.body,
      bodyType: typeof req.body,
      bodyKeys: req.body ? Object.keys(req.body) : 'no body',
      path: req.path,
      originalUrl: req.originalUrl
    });
  }
  next();
});

// CORS middleware
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, api-key');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  next();
});

// Cache middleware - GET requests cached for 365 days
const { cacheGetMiddleware } = require('../../middleware/cacheMiddleware');
app.use(cacheGetMiddleware);

// Import routes
const authRoutes = require('./routes');

// Mount routes - handle both /api and root paths
app.use('/api', authRoutes);
app.use('/', authRoutes);  // Also mount at root for API Gateway path handling

// Error handler
app.use((err, req, res, next) => {
  console.error('Auth Service Error:', err);
  res.status(err.status || 500).json({
    status: 'error',
    msg: err.message || 'Internal server error',
    data: ''
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    status: 'error',
    msg: 'Auth endpoint not found',
    data: ''
  });
});

// Wrap with serverless-http
const handler = serverless(app, {
  binary: ['application/octet-stream', 'image/*', 'multipart/form-data']
});

exports.handler = async (event, context) => {
  context.callbackWaitsForEmptyEventLoop = false;
  
  // Handle HTTP API v2 format - parse body if needed
  if (event.requestContext?.http && event.body) {
    if (!event.headers) event.headers = {};
    const contentType = event.headers['content-type'] || event.headers['Content-Type'] || '';
    const isMultipart = contentType.includes('multipart/form-data');
    
    // HTTP API v2 sends body as string
    if (typeof event.body === 'string') {
      // For multipart/form-data, decode base64 to Buffer for multer
      if (isMultipart && event.isBase64Encoded) {
        // Decode base64 to Buffer - multer needs the raw binary data
        try {
          event.body = Buffer.from(event.body, 'base64');
          console.log('📎 Multipart request: decoded base64 body to Buffer for multer');
        } catch (e) {
          console.error('Failed to decode base64 multipart body:', e);
        }
      } else {
        // For JSON, decode base64 if needed
        if (event.isBase64Encoded) {
          try {
            event.body = Buffer.from(event.body, 'base64').toString('utf-8');
          } catch (e) {
            console.error('Failed to decode base64 body:', e);
          }
        }
        
        // Ensure Content-Type is set for express.json() to parse (only for JSON)
        if ((contentType.includes('application/json') || event.body.trim().startsWith('{') || event.body.trim().startsWith('[')) && !contentType) {
          event.headers['content-type'] = 'application/json';
        }
      }
    }
  }
  
  // Log for debugging
  if (event.requestContext?.http?.path === '/api/login' || event.requestContext?.http?.path === '/login') {
    console.log('Auth handler - login request:', {
      body: typeof event.body === 'string' ? event.body.substring(0, 100) : JSON.stringify(event.body).substring(0, 100),
      bodyType: typeof event.body,
      contentType: event.headers?.['content-type'] || event.headers?.['Content-Type'],
      rawPath: event.rawPath,
      path: event.requestContext?.http?.path
    });
  }
  
  try {
    const result = await handler(event, context);
    return result;
  } catch (error) {
    console.error('Auth handler error:', error);
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        status: 'error',
        msg: error.message || 'Internal server error',
        data: ''
      })
    };
  }
};

