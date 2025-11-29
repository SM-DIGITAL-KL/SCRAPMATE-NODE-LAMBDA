/**
 * Health Check Service Lambda Handler
 * Simple health check and test endpoints
 */

const serverless = require('serverless-http');
const express = require('express');
const app = express();

app.use(express.json());

app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, api-key');
  if (req.method === 'OPTIONS') return res.status(200).end();
  next();
});

// Health check endpoint - handle both /api/health and /health
app.get('/api/health', (req, res) => {
  res.status(200).json({
    status: 'healthy',
    service: 'ScrapMate Microservices',
    environment: process.env.NODE_ENV || 'production',
    timestamp: new Date().toISOString()
  });
});

app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'healthy',
    service: 'ScrapMate Microservices',
    environment: process.env.NODE_ENV || 'production',
    timestamp: new Date().toISOString()
  });
});

// Test endpoint - handle both /api/test and /test
app.get('/api/test', (req, res) => {
  res.json({
    status: 'success',
    msg: 'Microservices API is running',
    timestamp: new Date().toISOString()
  });
});

app.get('/test', (req, res) => {
  res.json({
    status: 'success',
    msg: 'Microservices API is running',
    timestamp: new Date().toISOString()
  });
});

// Catch-all for debugging
app.use((req, res) => {
  console.log('Health service - unmatched route:', req.method, req.path, req.originalUrl);
  res.status(404).json({
    status: 'error',
    msg: 'Health endpoint not found',
    path: req.path,
    originalUrl: req.originalUrl
  });
});

const handler = serverless(app);

exports.handler = async (event, context) => {
  context.callbackWaitsForEmptyEventLoop = false;
  
  // Log full event for debugging (first invocation only)
  if (!process.env._LOGGED_EVENT) {
    console.log('Health handler received event:', JSON.stringify(event, null, 2));
    process.env._LOGGED_EVENT = 'true';
  }
  
  try {
    const result = await handler(event, context);
    console.log('Health handler result status:', result.statusCode);
    return result;
  } catch (error) {
    console.error('Health service error:', error);
    console.error('Error stack:', error.stack);
    console.error('Event that caused error:', JSON.stringify(event, null, 2));
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        status: 'error',
        message: error.message,
        service: 'health'
      })
    };
  }
};

