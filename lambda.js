/**
 * AWS Lambda Handler for Express Application
 * This file wraps the Express app using serverless-http for Lambda compatibility
 */

const serverless = require('serverless-http');
const app = require('./app');

// Wrap Express app with serverless-http
// This converts Lambda events to Express requests and responses
const handler = serverless(app, {
  // Binary media types for file uploads
  binary: [
    'application/octet-stream',
    'image/*',
    'application/pdf',
    'multipart/form-data'
  ],
  // Request ID for tracing
  request(request, event, context) {
    // Add Lambda context to request for logging
    request.lambdaContext = context;
    request.lambdaEvent = event;
    request.requestId = context.requestId || context.awsRequestId;
  }
});

// Lambda handler function
exports.handler = async (event, context) => {
  // Set callbackWaitsForEmptyEventLoop to false for better performance
  // This allows Lambda to freeze the execution context immediately after the response
  context.callbackWaitsForEmptyEventLoop = false;
  
  // Lambda Function URL sends body as a string that needs parsing
  // serverless-http should handle this, but sometimes Lambda Function URLs need special handling
  let bodyString = event.body;
  let parsedBody = null;
  
  if (bodyString && typeof bodyString === 'string') {
    // Check if body is base64 encoded
    if (event.isBase64Encoded) {
      try {
        bodyString = Buffer.from(bodyString, 'base64').toString('utf-8');
        console.log('✅ Decoded base64 body');
      } catch (decodeError) {
        console.error('❌ Failed to decode base64 body:', decodeError);
      }
    }
    
    // Ensure Content-Type is set for JSON parsing by serverless-http
    const contentType = event.headers?.['content-type'] || event.headers?.['Content-Type'];
    const isJson = contentType?.includes('application/json') || bodyString.trim().startsWith('{') || bodyString.trim().startsWith('[');
    
    if (isJson && !contentType) {
      if (!event.headers) event.headers = {};
      event.headers['content-type'] = 'application/json';
      console.log('✅ Set content-type to application/json');
    }
    
    // Parse JSON body manually and store parsed version
    // serverless-http expects body as string, but we'll parse it in middleware
    if (isJson) {
      try {
        parsedBody = JSON.parse(bodyString);
        event._parsedBody = parsedBody; // Store parsed version for manual access in middleware
        // Also store as _body for backward compatibility
        event._body = parsedBody;
        console.log('✅ Parsed JSON body in Lambda handler:', Object.keys(parsedBody));
      } catch (parseError) {
        console.error('❌ Failed to parse JSON body:', parseError);
        console.error('   Body string (first 200 chars):', bodyString.substring(0, 200));
      }
    }
    
    // Keep body as string for serverless-http (it expects string)
    // The express.json() middleware or our custom middleware will parse it
    // But if we already parsed it, ensure Content-Type is set so express.json() can handle it
    event.body = bodyString;
    
    // Ensure headers exist and Content-Type is set for express.json() to parse correctly
    if (!event.headers) {
      event.headers = {};
    }
    if (isJson && !event.headers['content-type'] && !event.headers['Content-Type']) {
      event.headers['content-type'] = 'application/json';
    }
  }
  
  // Log for debugging (especially for /dologin)
  const path = event.path || event.requestContext?.http?.path || event.requestContext?.path;
  if (path === '/dologin') {
    console.log('🔍 Lambda Function URL received login request:', {
      path: path,
      method: event.httpMethod || event.requestContext?.http?.method || event.requestContext?.httpMethod,
      contentType: event.headers?.['content-type'] || event.headers?.['Content-Type'],
      bodyType: typeof event.body,
      bodyLength: event.body?.length,
      bodyPreview: typeof event.body === 'string' ? event.body.substring(0, 100) : 'N/A',
      isBase64Encoded: event.isBase64Encoded
    });
  }
  
  try {
    // Invoke the serverless-http handler
    const result = await handler(event, context);
    return result;
  } catch (error) {
    console.error('❌ Lambda handler error:', error);
    
    // Return a proper error response
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type,api-key,Authorization',
        'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS'
      },
      body: JSON.stringify({
        status: 'error',
        msg: 'Internal server error',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      })
    };
  }
};

