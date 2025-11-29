/**
 * Test utility service directly via Lambda invocation
 */

const { LambdaClient, InvokeCommand } = require('@aws-sdk/client-lambda');
const { loadEnvFromFile } = require('./utils/loadEnv');

loadEnvFromFile();

const lambda = new LambdaClient({
  region: process.env.AWS_REGION || 'ap-south-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
  }
});

async function testUtilityService() {
  const event = {
    version: '2.0',
    routeKey: 'GET /api/get_all_tables',
    rawPath: '/api/get_all_tables',
    requestContext: {
      http: {
        method: 'GET',
        path: '/api/get_all_tables',
        protocol: 'HTTP/1.1',
        requestId: 'test-request-id',
        routeKey: 'GET /api/get_all_tables',
        time: new Date().toISOString(),
        timeEpoch: Date.now()
      }
    },
    headers: {
      'api-key': process.env.API_KEY || 'zyubkfzeumeoviaqzcsrvfwdzbiwnlnn',
      'content-type': 'application/json'
    },
    isBase64Encoded: false
  };

  try {
    console.log('🧪 Testing utility service directly...');
    console.log('   Function: scrapmate-ms-dev-utility');
    console.log('   Endpoint: GET /api/get_all_tables');
    console.log('');

    const command = new InvokeCommand({
      FunctionName: 'scrapmate-ms-dev-utility',
      Payload: JSON.stringify(event)
    });

    const response = await lambda.send(command);
    
    if (response.Payload) {
      const result = JSON.parse(Buffer.from(response.Payload).toString());
      
      if (result.statusCode === 200) {
        const body = JSON.parse(result.body);
        console.log('✅ Success!');
        console.log('');
        console.log('Response:');
        console.log(JSON.stringify(body, null, 2));
        
        if (body.status === 'success' && body.data && Array.isArray(body.data)) {
          console.log('');
          console.log(`✅ Found ${body.data.length} tables`);
        }
      } else {
        console.log('❌ Error response:');
        console.log(JSON.stringify(result, null, 2));
      }
    } else {
      console.log('❌ No response payload');
    }
  } catch (error) {
    console.error('❌ Error:', error.message);
    if (error.name === 'ResourceNotFoundException') {
      console.error('   Function not found. Deploy it first:');
      console.error('   ./scripts/deploy-service.sh utility dev ap-south-1');
    }
  }
}

testUtilityService();

