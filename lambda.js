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
  
  // Ensure Content-Type is set for parsing by serverless-http
  const contentType = event.headers?.['content-type'] || event.headers?.['Content-Type'] || '';
  const isMultipart = contentType.includes('multipart/form-data');
  
  // IMPORTANT: For multipart/form-data, decode base64 to Buffer for multer
  // Lambda Function URL sends multipart as base64-encoded string, but multer needs raw Buffer
  if (isMultipart && bodyString && typeof bodyString === 'string') {
    // Decode base64 to Buffer if encoded - multer needs raw binary data
    if (event.isBase64Encoded) {
      try {
        event.body = Buffer.from(bodyString, 'base64');
        console.log('📎 Multipart/form-data detected - decoded base64 body to Buffer for multer');
        console.log('   isBase64Encoded: true');
        console.log('   Buffer length:', event.body.length, 'bytes');
      } catch (decodeError) {
        console.error('❌ Failed to decode base64 multipart body:', decodeError);
        // Fallback: keep as string and let serverless-http try to handle it
        event.body = bodyString;
      }
    } else {
      // If not base64 encoded, convert string to Buffer for multer
      try {
        event.body = Buffer.from(bodyString, 'binary');
        console.log('📎 Multipart/form-data detected - converted string to Buffer for multer');
        console.log('   isBase64Encoded: false');
        console.log('   Buffer length:', event.body.length, 'bytes');
      } catch (convertError) {
        console.error('❌ Failed to convert multipart body to Buffer:', convertError);
        event.body = bodyString;
      }
    }
    // Ensure headers exist
    if (!event.headers) {
      event.headers = {};
    }
    // Keep content-type header for multer to parse boundaries
  } else if (bodyString && typeof bodyString === 'string') {
    // For non-multipart, check if body is base64 encoded
    if (event.isBase64Encoded) {
      try {
        bodyString = Buffer.from(bodyString, 'base64').toString('utf-8');
        console.log('✅ Decoded base64 body');
      } catch (decodeError) {
        console.error('❌ Failed to decode base64 body:', decodeError);
      }
    }
    
    const isJson = contentType.includes('application/json') || (!isMultipart && (bodyString.trim().startsWith('{') || bodyString.trim().startsWith('[')));
    const isFormData = contentType.includes('application/x-www-form-urlencoded') || (!isMultipart && bodyString.includes('=') && !bodyString.includes('{') && !bodyString.includes('--'));
    
    if (!contentType) {
      if (!event.headers) event.headers = {};
      if (isJson) {
        event.headers['content-type'] = 'application/json';
        console.log('✅ Detected and set content-type to application/json');
      } else if (isFormData) {
        event.headers['content-type'] = 'application/x-www-form-urlencoded';
        console.log('✅ Detected and set content-type to application/x-www-form-urlencoded');
      }
    }
    
    // Parse JSON body manually and store parsed version
    if (isJson) {
      try {
        parsedBody = JSON.parse(bodyString);
        event._parsedBody = parsedBody; // Store parsed version for manual access in middleware
        event._body = parsedBody;
        console.log('✅ Parsed JSON body in Lambda handler:', Object.keys(parsedBody));
      } catch (parseError) {
        console.error('❌ Failed to parse JSON body:', parseError);
        console.error('   Body string (first 200 chars):', bodyString.substring(0, 200));
      }
    }
    // Parse form data manually (only for application/x-www-form-urlencoded, NOT multipart)
    else if (isFormData) {
      try {
        const querystring = require('querystring');
        parsedBody = querystring.parse(bodyString);
        event._parsedBody = parsedBody;
        event._body = parsedBody;
        console.log('✅ Parsed form data body in Lambda handler:', Object.keys(parsedBody));
      } catch (parseError) {
        console.error('❌ Failed to parse form data body:', parseError);
        console.error('   Body string (first 200 chars):', bodyString.substring(0, 200));
      }
    }
    
    // Keep body as string for serverless-http (it expects string for non-multipart)
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

