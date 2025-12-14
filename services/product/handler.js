/**
 * Product Service Lambda Handler
 * Handles product and category management
 */

const serverless = require('serverless-http');
const express = require('express');
const app = express();

require('dotenv').config();
const { loadEnvFromFile } = require('../../utils/loadEnv');
loadEnvFromFile();

require('../../config/dynamodb');

// Middleware - Body parsing for HTTP API v2 (BEFORE express.json)
app.use((req, res, next) => {
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
        const contentType = req.headers['content-type'] || req.headers['Content-Type'] || '';
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

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

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

// Mount v2 API routes for microservices gateway
// This lets /api/v2/... work on the microservices API Gateway
// Also mount at /v2 for Lambda Function URL direct access (without /api prefix)
const v2Routes = require('../../routes/v2Routes');

// v2 routes must be mounted BEFORE generic /api routes so they don't fall through to 404
// Mount at both /api/v2 (for API Gateway) and /v2 (for Lambda Function URL)
app.use('/api/v2', v2Routes);
app.use('/v2', v2Routes);

const productRoutes = require('./routes');
app.use('/api', productRoutes);

app.use((err, req, res, next) => {
  console.error('Product Service Error:', err);
  res.status(err.status || 500).json({
    status: 'error',
    msg: err.message || 'Internal server error',
    data: ''
  });
});

app.use((req, res) => {
  res.status(404).json({
    status: 'error',
    msg: 'Product endpoint not found',
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
    // HTTP API v2 sends body as string
    if (typeof event.body === 'string') {
      // Check if body is base64 encoded
      if (event.isBase64Encoded) {
        try {
          event.body = Buffer.from(event.body, 'base64').toString('utf-8');
        } catch (e) {
          console.error('Failed to decode base64 body:', e);
        }
      }
      
      // Ensure Content-Type is set for express.json() to parse
      if (!event.headers) event.headers = {};
      const contentType = event.headers['content-type'] || event.headers['Content-Type'] || '';
      if ((contentType.includes('application/json') || event.body.trim().startsWith('{') || event.body.trim().startsWith('[')) && !contentType) {
        event.headers['content-type'] = 'application/json';
      }
    }
  }
  
  try {
    const result = await handler(event, context);
    return result;
  } catch (error) {
    console.error('Product handler error:', error);
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

