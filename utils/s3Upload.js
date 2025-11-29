const { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, ListObjectsV2Command } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const fs = require('fs');
const path = require('path');
const { getDynamoDBClient } = require('../config/dynamodb');

// Load AWS credentials from aws.txt
function loadAwsCredentials() {
  const fs = require('fs');
  const path = require('path');
  
  // Skip if already loaded
  if (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY) {
    return;
  }
  
  const possiblePaths = [
    path.join(__dirname, '..', '..', 'aws.txt'),
    path.join(process.cwd(), 'aws.txt'),
    path.join(process.cwd(), '..', 'aws.txt'),
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
    const content = fs.readFileSync(awsTxtPath, 'utf-8');
    const lines = content.split('\n');

    lines.forEach((line) => {
      line = line.trim();
      if (!line || line.startsWith('#')) {
        return;
      }
      
      if (line.startsWith('export ')) {
        const parts = line.substring(7).split('=', 2);
        if (parts.length === 2) {
          let key = parts[0].trim();
          let value = parts[1].trim();
          if (
            (value.startsWith('"') && value.endsWith('"')) ||
            (value.startsWith("'") && value.endsWith("'"))
          ) {
            value = value.slice(1, -1);
          }
          process.env[key] = value;
        }
      }
    });
  }
}

// Initialize S3 client
let s3Client = null;

function getS3Client() {
  if (s3Client) {
    return s3Client;
  }

  // Check if running in Lambda
  const isLambda = !!process.env.AWS_LAMBDA_FUNCTION_NAME;
  
  if (!isLambda) {
    // Local development - load credentials from aws.txt
    loadAwsCredentials();
  }

  const region = process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || 'ap-south-1';
  
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
      throw new Error('AWS credentials not found. Please ensure AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY are set.');
    }

    clientConfig.credentials = {
      accessKeyId: accessKeyId,
      secretAccessKey: secretAccessKey,
    };
  }
  // In Lambda, AWS SDK will automatically use the IAM execution role

  s3Client = new S3Client(clientConfig);
  return s3Client;
}

// S3 bucket name (should be in env or config)
// Check environment variable first, then default
const BUCKET_NAME = process.env.S3_BUCKET_NAME || process.env.AWS_S3_BUCKET || 'scrapmate-images';

// Get S3 base URL
function getS3BaseUrl() {
  const region = process.env.AWS_REGION || 'ap-south-1';
  return `https://${BUCKET_NAME}.s3.${region}.amazonaws.com`;
}

// Upload file to S3
async function uploadToS3(filePath, s3Key, contentType = null) {
  try {
    const client = getS3Client();
    const fileContent = fs.readFileSync(filePath);
    
    // Auto-detect content type if not provided
    if (!contentType) {
      const ext = path.extname(filePath).toLowerCase();
      const contentTypes = {
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.png': 'image/png',
        '.gif': 'image/gif',
        '.webp': 'image/webp'
      };
      contentType = contentTypes[ext] || 'application/octet-stream';
    }

    const command = new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: s3Key,
      Body: fileContent,
      ContentType: contentType
      // Note: ACL removed - bucket has Block Public ACLs enabled
      // Public access is handled via bucket policy instead
    });

    await client.send(command);
    
    const s3Url = `${getS3BaseUrl()}/${s3Key}`;
    console.log(`✅ Uploaded to S3: ${s3Key} -> ${s3Url}`);
    
    return s3Url;
  } catch (err) {
    if (err.name === 'NoSuchBucket') {
      console.error(`\n❌ S3 Bucket "${BUCKET_NAME}" does not exist!`);
      console.error(`\n📝 Please create the bucket first:`);
      console.error(`   1. Run: node scripts/create-s3-bucket.js`);
      console.error(`   2. Or create it manually in AWS Console`);
      console.error(`   3. Or set S3_BUCKET_NAME environment variable to an existing bucket\n`);
    }
    console.error(`❌ Error uploading to S3: ${filePath} -> ${s3Key}`, err.message);
    throw err;
  }
}

// Delete file from S3
async function deleteFromS3(s3Key) {
  try {
    const client = getS3Client();
    const command = new DeleteObjectCommand({
      Bucket: BUCKET_NAME,
      Key: s3Key
    });

    await client.send(command);
    console.log(`✅ Deleted from S3: ${s3Key}`);
    return true;
  } catch (err) {
    console.error(`❌ Error deleting from S3: ${s3Key}`, err);
    throw err;
  }
}

// Get S3 URL for a key - returns presigned URL for private access
async function getS3Url(s3Key, expiresIn = 3600) {
  if (!s3Key) return '';
  if (s3Key.startsWith('http://') || s3Key.startsWith('https://')) {
    return s3Key; // Already a full URL
  }
  
  try {
    const client = getS3Client();
    
    // First check if the object exists in S3
    try {
      const headCommand = new GetObjectCommand({
        Bucket: BUCKET_NAME,
        Key: s3Key
      });
      // Try to generate presigned URL - this will fail if object doesn't exist
      const url = await getSignedUrl(client, headCommand, { expiresIn });
      return url;
    } catch (headErr) {
      // If object doesn't exist, return empty string or original key
      if (headErr.name === 'NoSuchKey' || headErr.$metadata?.httpStatusCode === 404) {
        console.warn(`⚠️  S3 object not found: ${s3Key}`);
        return ''; // Return empty string if file doesn't exist
      }
      throw headErr; // Re-throw other errors
    }
  } catch (err) {
    console.error(`❌ Error generating presigned URL for ${s3Key}:`, err.message);
    // Return empty string if file doesn't exist or error occurs
    return '';
  }
}

// Get S3 URL synchronously (for backward compatibility - returns direct URL)
// Note: This will only work if bucket is public
function getS3UrlSync(s3Key) {
  if (!s3Key) return '';
  if (s3Key.startsWith('http://') || s3Key.startsWith('https://')) {
    return s3Key; // Already a full URL
  }
  return `${getS3BaseUrl()}/${s3Key}`;
}

// Generate S3 key from local path
function generateS3Key(localPath, type = 'images') {
  // Extract filename from local path
  const filename = path.basename(localPath);
  
  // Determine folder based on type
  let folder = 'images';
  if (localPath.includes('profile')) {
    folder = 'profile';
  } else if (localPath.includes('shopimages') || localPath.includes('shop')) {
    folder = 'shops';
  } else if (localPath.includes('deliveryboy')) {
    folder = 'deliveryboy';
  } else if (localPath.includes('product_category') || localPath.includes('category')) {
    folder = 'categories';
  } else if (localPath.includes('order')) {
    folder = 'orders';
  }
  
  return `${folder}/${filename}`;
}

// Upload buffer to S3 (for multer)
async function uploadBufferToS3(buffer, filename, folder = 'images') {
  try {
    const client = getS3Client();
    
    // Auto-detect content type
    const ext = path.extname(filename).toLowerCase();
    const contentTypes = {
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.gif': 'image/gif',
      '.webp': 'image/webp',
      '.pdf': 'application/pdf'
    };
    const contentType = contentTypes[ext] || 'application/octet-stream';
    
    const s3Key = `${folder}/${filename}`;
    
    const command = new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: s3Key,
      Body: buffer,
      ContentType: contentType
      // Note: ACL removed - bucket has Block Public ACLs enabled
      // Public access is handled via bucket policy instead
    });

    await client.send(command);
    
    const s3Url = `${getS3BaseUrl()}/${s3Key}`;
    console.log(`✅ Uploaded buffer to S3: ${s3Key} -> ${s3Url}`);
    
    return {
      s3Key: s3Key,
      s3Url: s3Url,
      filename: filename
    };
  } catch (err) {
    console.error(`❌ Error uploading buffer to S3: ${filename}`, err);
    throw err;
  }
}

module.exports = {
  uploadToS3,
  deleteFromS3,
  getS3Url,
  generateS3Key,
  uploadBufferToS3,
  getS3BaseUrl,
  getS3Client,
  BUCKET_NAME
};

