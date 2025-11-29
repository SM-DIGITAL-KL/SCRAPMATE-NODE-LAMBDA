// Simple test handler
exports.handler = async (event) => {
  console.log('Event:', JSON.stringify(event, null, 2));
  
  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      status: 'healthy',
      service: 'ScrapMate Microservices',
      path: event.rawPath || event.path,
      method: event.requestContext?.http?.method || event.httpMethod
    })
  };
};

