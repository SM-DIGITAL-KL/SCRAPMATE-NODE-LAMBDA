/**
 * User Service Lambda Handler
 * Handles user profile and FCM token management
 */

const serverless = require('serverless-http');
const express = require('express');
const app = express();

require('dotenv').config();
const { loadEnvFromFile } = require('../../utils/loadEnv');
loadEnvFromFile();

require('../../config/dynamodb');

// Middleware - Body parsing for HTTP API v2 (BEFORE express.json)
// IMPORTANT: Do NOT parse multipart/form-data - let multer handle it
app.use((req, res, next) => {
  const contentType = req.headers['content-type'] || req.headers['Content-Type'] || '';
  const isMultipart = contentType.includes('multipart/form-data');
  const isFormData = contentType.includes('application/x-www-form-urlencoded');
  
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
        // Parse JSON if it looks like JSON
        if (contentType.includes('application/json') || bodyString.trim().startsWith('{') || bodyString.trim().startsWith('[')) {
          req.body = JSON.parse(bodyString);
          console.log('✅ Parsed JSON body in middleware:', Object.keys(req.body));
        } 
        // Parse form data if it's form-encoded
        else if (isFormData || bodyString.includes('=') && !bodyString.includes('{')) {
          const querystring = require('querystring');
          req.body = querystring.parse(bodyString);
          console.log('✅ Parsed form data body in middleware:', Object.keys(req.body));
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
// Skip if body is already parsed (object) or if it's multipart
app.use((req, res, next) => {
  const contentType = req.headers['content-type'] || req.headers['Content-Type'] || '';
  const isMultipart = contentType.includes('multipart/form-data');
  
  if (isMultipart) {
    return next();
  }
  
  // If body is already an object (parsed), skip urlencoded parser
  if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) {
    console.log('✅ Body already parsed, skipping urlencoded parser');
    return next();
  }
  
  // Otherwise use express.urlencoded
  express.urlencoded({ extended: true })(req, res, next);
});

app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, api-key');
  if (req.method === 'OPTIONS') return res.status(200).end();
  next();
});

// Cache middleware - GET requests cached for 365 days
const { cacheGetMiddleware } = require('../../middleware/cacheMiddleware');
app.use(cacheGetMiddleware);

const userRoutes = require('./routes');

// Mount user routes (includes v2 routes)
app.use('/api', userRoutes);

app.use((err, req, res, next) => {
  console.error('User Service Error:', err);
  res.status(err.status || 500).json({
    status: 'error',
    msg: err.message || 'Internal server error',
    data: ''
  });
});

app.use((req, res) => {
  res.status(404).json({
    status: 'error',
    msg: 'User endpoint not found',
    data: ''
  });
});

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
    const isFormData = contentType.includes('application/x-www-form-urlencoded');
    
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
        // For JSON or form data, decode base64 if needed
        if (event.isBase64Encoded) {
          try {
            event.body = Buffer.from(event.body, 'base64').toString('utf-8');
            console.log('✅ Decoded base64 body to string');
          } catch (e) {
            console.error('Failed to decode base64 body:', e);
          }
        }
        
        // Ensure Content-Type is set for express parsers
        if (!contentType) {
          // Try to detect content type from body
          if (event.body.trim().startsWith('{') || event.body.trim().startsWith('[')) {
        event.headers['content-type'] = 'application/json';
            console.log('📝 Detected JSON body, setting Content-Type');
          } else if (event.body.includes('=') && !event.body.includes('{')) {
            event.headers['content-type'] = 'application/x-www-form-urlencoded';
            console.log('📝 Detected form data body, setting Content-Type');
          }
        } else if (contentType.includes('application/x-www-form-urlencoded')) {
          // Ensure form data is properly set
          console.log('📝 Form data Content-Type detected, body length:', event.body?.length || 0);
          console.log('📝 Form data body preview:', event.body?.substring(0, 200) || 'empty');
        }
      }
    }
  }
  
  try {
    const result = await handler(event, context);
    return result;
  } catch (error) {
    console.error('User handler error:', error);
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

