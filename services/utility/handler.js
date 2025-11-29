/**
 * Utility Service Lambda Handler
 * Handles utility and helper functions
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

// Middleware to extract path parameters for API Gateway HTTP API v2
app.use((req, res, next) => {
  // If pathParameters exist in the Lambda event, merge them into req.params
  // This is needed because serverless-http might not always map them correctly
  if (req.lambdaEvent?.pathParameters) {
    req.params = { ...req.params, ...req.lambdaEvent.pathParameters };
    console.log('✅ Path parameters from event:', req.lambdaEvent.pathParameters);
  }
  
  // Also try to extract from URL if pathParameters not available
  if (req.path && req.path.includes('/count_row/') && !req.params.table_name) {
    const match = req.path.match(/\/count_row\/([^\/\?]+)/);
    if (match) {
      req.params.table_name = match[1];
      console.log('✅ Path parameter extracted from URL:', req.params.table_name);
    }
  }
  
  // Extract path parameters for keyword_search (handle both /api/keyword_search and /keyword_search)
  if (req.path && req.path.includes('keyword_search') && (!req.params.table || !req.params.name)) {
    // Try to match /keyword_search/:table/:name or /api/keyword_search/:table/:name
    const match = req.path.match(/(?:\/api)?\/keyword_search\/([^\/\?]+)\/([^\/\?]+)/);
    if (match) {
      req.params.table = match[1];
      req.params.name = match[2];
      console.log('✅ keyword_search parameters extracted:', { table: req.params.table, name: req.params.name });
    }
  }
  
  // Extract path parameters for get_user_by_id
  if (req.path && req.path.includes('/get_user_by_id/') && (!req.params.user_id || !req.params.table)) {
    const match = req.path.match(/\/get_user_by_id\/([^\/\?]+)\/([^\/\?]+)/);
    if (match) {
      req.params.user_id = match[1];
      req.params.table = match[2];
      console.log('✅ get_user_by_id parameters extracted:', { user_id: req.params.user_id, table: req.params.table });
    }
  }
  
  // Extract path parameters for versionCheck
  if (req.path && req.path.includes('/versionCheck/') && !req.params.version) {
    const match = req.path.match(/\/versionCheck\/([^\/\?]+)/);
    if (match) {
      req.params.version = match[1];
      console.log('✅ versionCheck parameter extracted:', req.params.version);
    }
  }
  
  // Log for debugging all parameterized routes
  if (req.path && (req.path.includes('count_row') || req.path.includes('keyword_search') || req.path.includes('get_user_by_id') || req.path.includes('versionCheck'))) {
    console.log('🔍 Route middleware - req.path:', req.path);
    console.log('🔍 Route middleware - req.originalUrl:', req.originalUrl);
    console.log('🔍 Route middleware - req.params:', req.params);
    console.log('🔍 Route middleware - req.lambdaEvent?.pathParameters:', req.lambdaEvent?.pathParameters);
  }
  
  next();
});

// Log all incoming requests for debugging
app.use((req, res, next) => {
  console.log('🔍 Incoming request:', {
    method: req.method,
    path: req.path,
    originalUrl: req.originalUrl,
    url: req.url,
    baseUrl: req.baseUrl,
    params: req.params
  });
  next();
});

const utilityRoutes = require('./routes');
app.use('/api', utilityRoutes);
app.use('/', utilityRoutes);  // Also mount at root for API Gateway path handling

// Log after routes are mounted
app.use((req, res, next) => {
  console.log('🔍 After routes - request not matched:', {
    method: req.method,
    path: req.path,
    originalUrl: req.originalUrl
  });
  next();
});

app.use((err, req, res, next) => {
  console.error('Utility Service Error:', err);
  res.status(err.status || 500).json({
    status: 'error',
    msg: err.message || 'Internal server error',
    data: ''
  });
});

app.use((req, res) => {
  console.log('❌ 404 - No route matched:', {
    method: req.method,
    path: req.path,
    originalUrl: req.originalUrl,
    url: req.url,
    baseUrl: req.baseUrl
  });
  res.status(404).json({
    status: 'error',
    msg: 'Utility endpoint not found',
    data: '',
    debug: {
      method: req.method,
      path: req.path,
      originalUrl: req.originalUrl
    }
  });
});

const handler = serverless(app, {
  binary: ['application/octet-stream', 'image/*', 'multipart/form-data'],
  request: (request, event, context) => {
    // Make event available on request for middleware to access
    request.lambdaEvent = event;
    request.lambdaContext = context;
    
    // Ensure pathParameters are available
    if (event.pathParameters) {
      // Path parameters will be merged in middleware
    }
  }
});

exports.handler = async (event, context) => {
  context.callbackWaitsForEmptyEventLoop = false;
  
  // Log for debugging
  if (event.requestContext?.http?.path?.includes('count_row')) {
    console.log('Utility handler - count_row request:', {
      path: event.requestContext?.http?.path,
      rawPath: event.rawPath,
      pathParameters: event.pathParameters,
      routeKey: event.routeKey
    });
  }
  
  // Handle HTTP API v2 format - parse body if needed
  if (event.requestContext?.http && event.body) {
    if (typeof event.body === 'string') {
      if (event.isBase64Encoded) {
        try {
          event.body = Buffer.from(event.body, 'base64').toString('utf-8');
        } catch (e) {
          console.error('Failed to decode base64 body:', e);
        }
      }
      
      if (!event.headers) event.headers = {};
      const contentType = event.headers['content-type'] || event.headers['Content-Type'] || '';
      if ((contentType.includes('application/json') || event.body.trim().startsWith('{') || event.body.trim().startsWith('[')) && !contentType) {
        event.headers['content-type'] = 'application/json';
      }
    }
  }
  
  // Ensure pathParameters are properly set for serverless-http
  // API Gateway HTTP API v2 passes path parameters in event.pathParameters
  // serverless-http expects them in the event for Express to parse
  if (event.pathParameters && !event.pathParameters.table_name && event.requestContext?.http?.path) {
    // Extract table_name from path if not in pathParameters
    const pathMatch = event.requestContext.http.path.match(/\/count_row\/([^\/]+)/);
    if (pathMatch) {
      event.pathParameters = event.pathParameters || {};
      event.pathParameters.table_name = pathMatch[1];
    }
  }
  
  try {
    console.log('🔍 Utility handler - Starting serverless-http handler...');
    const result = await handler(event, context);
    
    console.log('🔍 Utility handler - serverless-http returned:', {
      resultType: typeof result,
      isObject: typeof result === 'object',
      isNull: result === null,
      isUndefined: result === undefined,
      hasStatusCode: result?.statusCode ? true : false,
      statusCode: result?.statusCode,
      hasHeaders: !!result?.headers,
      hasBody: !!result?.body,
      bodyType: typeof result?.body,
      bodyLength: result?.body?.length,
      resultKeys: result && typeof result === 'object' ? Object.keys(result) : 'N/A'
    });
    
    // Log response for debugging count_row
    if (event.requestContext?.http?.path?.includes('count_row')) {
      console.log('🔍 count_row - Full result object:', JSON.stringify(result).substring(0, 500));
    }
    
    // Ensure response format is correct for API Gateway HTTP API v2
    // API Gateway requires: { statusCode, headers, body }
    if (!result || typeof result !== 'object') {
      console.error('❌ Invalid result from serverless-http:', {
        result: result,
        type: typeof result,
        isNull: result === null,
        isUndefined: result === undefined
      });
      return {
        statusCode: 500,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        },
        body: JSON.stringify({
          status: 'error',
          msg: 'Invalid response from handler',
          data: ''
        })
      };
    }
    
    // Ensure statusCode exists (required by API Gateway)
    if (!result.statusCode) {
      console.error('❌ Response missing statusCode:', {
        result: result,
        keys: Object.keys(result),
        hasStatus: 'status' in result,
        hasStatusCode: 'statusCode' in result
      });
      return {
        statusCode: 500,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        },
        body: JSON.stringify({
          status: 'error',
          msg: 'Response missing statusCode',
          data: ''
        })
      };
    }
    
    // Ensure body is a string
    let bodyString = result.body;
    if (typeof bodyString !== 'string') {
      console.log('⚠️  Body is not a string, converting:', typeof bodyString);
      bodyString = JSON.stringify(bodyString || {});
    }
    
    // Build response object (required format for API Gateway)
    const response = {
      statusCode: result.statusCode,
      headers: result.headers || {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: bodyString
    };
    
    console.log('✅ Utility handler - Final response:', {
      statusCode: response.statusCode,
      headersCount: Object.keys(response.headers).length,
      bodyLength: response.body.length,
      bodyPreview: response.body.substring(0, 200),
      hasAllRequiredFields: !!(response.statusCode && response.headers && response.body)
    });
    
    if (event.requestContext?.http?.path?.includes('count_row')) {
      console.log('✅ count_row - Returning to API Gateway:', {
        statusCode: response.statusCode,
        bodyLength: response.body.length,
        bodyContent: response.body
      });
    }
    
    return response;
  } catch (error) {
    console.error('❌ Utility handler ERROR:', error);
    console.error('Error name:', error.name);
    console.error('Error message:', error.message);
    console.error('Error code:', error.code);
    console.error('Error stack:', error.stack);
    console.error('Error details:', JSON.stringify(error, Object.getOwnPropertyNames(error)));
    
    // Return proper error response with statusCode (required by API Gateway)
    const errorResponse = {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({
        status: 'error',
        msg: error.message || 'Internal server error',
        data: ''
      })
    };
    
    console.log('❌ Returning error response:', errorResponse);
    return errorResponse;
  }
};

