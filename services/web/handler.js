/**
 * Web Service Lambda Handler
 * Handles web panel routes (admin, vendor, agent, customer panels, etc.)
 */

const serverless = require('serverless-http');
const express = require('express');
const app = express();

require('dotenv').config();
const { loadEnvFromFile } = require('../../utils/loadEnv');
loadEnvFromFile();

require('../../config/dynamodb');

const session = require('express-session');

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

// Session configuration (for web routes authentication)
// Note: In Lambda, sessions use in-memory store (stateless)
// For production, consider using DynamoDB or ElastiCache for session persistence
app.use(session({
  secret: process.env.SESSION_SECRET || 'scrapmate-session-secret-change-in-production',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: false, // Set to true in production with HTTPS
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  }
}));

// Debug middleware to log request body for login
app.use((req, res, next) => {
  if (req.path === '/dologin' || req.path === '/api/dologin') {
    console.log('Web handler - dologin request:', {
      body: req.body,
      bodyType: typeof req.body,
      bodyKeys: req.body ? Object.keys(req.body) : 'no body',
      path: req.path,
      originalUrl: req.originalUrl,
      contentType: req.headers['content-type'] || req.headers['Content-Type']
    });
  }
  next();
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

const webRoutes = require('./routes');
app.use('/api', webRoutes);
app.use('/', webRoutes);  // Also mount at root for API Gateway path handling

app.use((err, req, res, next) => {
  console.error('Web Service Error:', err);
  res.status(err.status || 500).json({
    status: 'error',
    msg: err.message || 'Internal server error',
    data: ''
  });
});

app.use((req, res) => {
  res.status(404).json({
    status: 'error',
    msg: 'Web endpoint not found',
    data: ''
  });
});

const handler = serverless(app, {
  binary: ['application/octet-stream', 'image/*', 'multipart/form-data'],
  request: (request, event, context) => {
    // Make event available on request for middleware to access
    request.lambdaEvent = event;
    request.lambdaContext = context;
  }
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
      
      // If it's JSON and not already parsed, ensure Content-Type is set
      if ((contentType.includes('application/json') || event.body.trim().startsWith('{') || event.body.trim().startsWith('[')) && !contentType) {
        event.headers['content-type'] = 'application/json';
      }
    }
  }
  
  // Log for debugging
  if (event.requestContext?.http?.path === '/dologin' || event.requestContext?.http?.path === '/api/dologin') {
    console.log('Web handler - dologin request:', {
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
    console.error('Web handler error:', error);
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

