/**
 * Location Tracking Service Lambda Handler
 * Handles real-time location tracking for pickup vendors (R, S, D, SR)
 */

const serverless = require('serverless-http');
const express = require('express');
const app = express();

require('dotenv').config();
const { loadEnvFromFile } = require('../../utils/loadEnv');
loadEnvFromFile();

require('../../config/dynamodb');

// Middleware - Body parsing for HTTP API v2
app.use((req, res, next) => {
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

// Import routes
const locationRoutes = require('./routes');

// Mount routes
app.use('/api/v2/location', locationRoutes);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'location-service' });
});

// Export handler
module.exports.handler = serverless(app);





