// Middleware to verify API key
const apiKeyCheck = (req, res, next) => {
  console.log('🔑 API Key Middleware - Checking request:', req.method, req.path);
  console.log('Request headers:', {
    'api-key': req.headers['api-key'] ? 'Present' : 'Missing',
    'content-type': req.headers['content-type'],
    'accept': req.headers['accept']
  });
  
  const apiKey = req.headers['api-key'];
  const validApiKey = process.env.API_KEY;

  console.log('API Key check:', {
    'received': apiKey ? `Present (length: ${apiKey.length})` : 'Missing',
    'expected': validApiKey ? `Set (length: ${validApiKey.length})` : 'Not Set',
    'match': apiKey === validApiKey ? 'Yes' : 'No',
    'receivedFirstChars': apiKey ? apiKey.substring(0, 4) + '...' : 'N/A',
    'expectedFirstChars': validApiKey ? validApiKey.substring(0, 4) + '...' : 'N/A'
  });

  if (!apiKey) {
    console.log('❌ API Key missing - rejecting request');
    return res.status(404).json({
      error: 'header api key not found'
    });
  }

  if (!validApiKey) {
    console.log('❌ API_KEY not set in Node.js .env file');
    return res.status(500).json({
      error: 'API key not configured on server'
    });
  }

  if (apiKey !== validApiKey) {
    console.log('❌ API Key mismatch - rejecting request');
    console.log('   Make sure NODE_API_KEY in Laravel .env matches API_KEY in Node.js .env');
    return res.status(401).json({
      error: 'api key mismatch',
      hint: 'Check that NODE_API_KEY in Laravel .env matches API_KEY in Node.js .env'
    });
  }

  console.log('✅ API Key validated - proceeding');
  next();
};

module.exports = { apiKeyCheck };

