require('dotenv').config();
const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient } = require("@aws-sdk/lib-dynamodb");
const fs = require("fs");
const path = require("path");

// Singleton DynamoDB client
let dynamoClient = null;

// Load AWS credentials from aws.txt if it exists
function loadAwsCredentials() {
  // Try multiple possible paths for aws.txt
  const possiblePaths = [
    path.join(__dirname, "..", "..", "aws.txt"), // From nodeserver/config -> root
    path.join(process.cwd(), "aws.txt"), // From current working directory
    path.join(process.cwd(), "..", "aws.txt"), // One level up from cwd
  ];

  let awsTxtPath = null;
  for (const possiblePath of possiblePaths) {
    if (fs.existsSync(possiblePath)) {
      awsTxtPath = possiblePath;
      break;
    }
  }

  if (awsTxtPath) {
    console.log(`📁 Loading AWS credentials from: ${awsTxtPath}`);
    const content = fs.readFileSync(awsTxtPath, "utf-8");
    const lines = content.split("\n");

    lines.forEach((line) => {
      line = line.trim();
      // Skip empty lines and comments
      if (!line || line.startsWith("#")) {
        return;
      }
      
      if (line.startsWith("export ")) {
        const parts = line.substring(7).split("=", 2);
        if (parts.length === 2) {
          let key = parts[0].trim();
          let value = parts[1].trim();
          // Remove quotes if present
          if (
            (value.startsWith('"') && value.endsWith('"')) ||
            (value.startsWith("'") && value.endsWith("'"))
          ) {
            value = value.slice(1, -1);
          }
          process.env[key] = value;
          console.log(`   ✅ Loaded ${key}`);
        }
      }
    });
    console.log('✅ AWS credentials loaded from aws.txt');
  } else {
    console.log('⚠️  aws.txt not found. Using environment variables or default credentials.');
  }
}

// Initialize DynamoDB client (singleton pattern)
function getDynamoDBClient() {
  if (dynamoClient) {
    return dynamoClient;
  }

  // Check if running in Lambda
  const isLambda = !!process.env.AWS_LAMBDA_FUNCTION_NAME;
  
  if (!isLambda) {
    // Local development - load credentials from aws.txt
    loadAwsCredentials();
  }

  const region =
    process.env.AWS_REGION ||
    process.env.AWS_DEFAULT_REGION ||
    "ap-south-1";

  // In Lambda, use IAM role (don't set credentials explicitly)
  // In local dev, use credentials from aws.txt
  const clientConfig = {
    region: region,
  };

  if (!isLambda) {
    // Local development - use explicit credentials
    const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
    const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;

    if (!accessKeyId || !secretAccessKey) {
      throw new Error(
        '❌ AWS credentials not found. Please ensure AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY are set in aws.txt or environment variables.'
      );
    }

    clientConfig.credentials = {
      accessKeyId: accessKeyId,
      secretAccessKey: secretAccessKey,
    };
    
    console.log('✅ DynamoDB client initialized (local dev mode)');
    console.log(`   Region: ${region}`);
    console.log(`   Access Key ID: ${accessKeyId.substring(0, 8)}...`);
  } else {
    // Lambda - use IAM role (no credentials needed)
    console.log('✅ DynamoDB client initialized (Lambda - using IAM role)');
    console.log(`   Region: ${region}`);
  }

  const client = new DynamoDBClient(clientConfig);
  dynamoClient = DynamoDBDocumentClient.from(client);
  
  return dynamoClient;
}

// Test the connection
try {
  const client = getDynamoDBClient();
  console.log('✅ DynamoDB connection ready');
} catch (err) {
  console.error('❌ DynamoDB connection failed:', err);
}

// Export client getter
module.exports = {
  getDynamoDBClient,
  // For backward compatibility
  client: getDynamoDBClient(),
};

