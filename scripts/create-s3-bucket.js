const { S3Client, CreateBucketCommand, PutBucketCorsCommand, PutBucketPolicyCommand } = require('@aws-sdk/client-s3');
const fs = require('fs');
const path = require('path');

// Load AWS credentials from aws.txt
function loadAwsCredentials() {
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
function getS3Client() {
  loadAwsCredentials();

  const region = process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || 'ap-south-1';
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;

  if (!accessKeyId || !secretAccessKey) {
    throw new Error('AWS credentials not found. Please ensure AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY are set.');
  }

  return new S3Client({
    region: region,
    credentials: {
      accessKeyId: accessKeyId,
      secretAccessKey: secretAccessKey,
    },
  });
}

// Create S3 bucket
async function createBucket(bucketName, region = 'ap-south-1') {
  try {
    const client = getS3Client();
    
    console.log(`\n🪣 Creating S3 bucket: ${bucketName} in region: ${region}...`);
    
    // Create bucket
    const createCommand = new CreateBucketCommand({
      Bucket: bucketName,
      CreateBucketConfiguration: {
        LocationConstraint: region
      }
    });

    try {
      await client.send(createCommand);
      console.log(`✅ Bucket created successfully: ${bucketName}`);
    } catch (err) {
      if (err.name === 'BucketAlreadyExists' || err.name === 'BucketAlreadyOwnedByYou') {
        console.log(`ℹ️  Bucket already exists: ${bucketName}`);
      } else if (err.name === 'IllegalLocationConstraintException') {
        // For us-east-1, don't specify LocationConstraint
        const createCommandUS = new CreateBucketCommand({
          Bucket: bucketName
        });
        await client.send(createCommandUS);
        console.log(`✅ Bucket created successfully: ${bucketName}`);
      } else {
        throw err;
      }
    }

    // Configure CORS
    console.log(`\n🔧 Configuring CORS for bucket...`);
    const corsCommand = new PutBucketCorsCommand({
      Bucket: bucketName,
      CORSConfiguration: {
        CORSRules: [
          {
            AllowedHeaders: ['*'],
            AllowedMethods: ['GET', 'HEAD', 'PUT', 'POST', 'DELETE'],
            AllowedOrigins: ['*'],
            ExposeHeaders: ['ETag'],
            MaxAgeSeconds: 3000
          }
        ]
      }
    });

    try {
      await client.send(corsCommand);
      console.log(`✅ CORS configured successfully`);
    } catch (err) {
      console.warn(`⚠️  Could not configure CORS: ${err.message}`);
    }

    // Configure public read access policy
    console.log(`\n🔧 Configuring public read access...`);
    const policy = {
      Version: '2012-10-17',
      Statement: [
        {
          Sid: 'PublicReadGetObject',
          Effect: 'Allow',
          Principal: '*',
          Action: 's3:GetObject',
          Resource: `arn:aws:s3:::${bucketName}/*`
        }
      ]
    };

    const policyCommand = new PutBucketPolicyCommand({
      Bucket: bucketName,
      Policy: JSON.stringify(policy)
    });

    try {
      await client.send(policyCommand);
      console.log(`✅ Public read access configured via bucket policy`);
    } catch (err) {
      console.warn(`⚠️  Could not configure public read access: ${err.message}`);
      console.warn(`   This is likely due to Block Public Access settings.`);
      console.warn(`   To enable public access:`);
      console.warn(`   1. Go to S3 Console > Bucket > Permissions`);
      console.warn(`   2. Edit Block Public Access settings (if needed)`);
      console.warn(`   3. Add bucket policy manually with the JSON above`);
      console.warn(`\n   Bucket Policy JSON:`);
      console.warn(`   ${JSON.stringify(policy, null, 2)}`);
    }

    console.log(`\n✅ Bucket setup complete: ${bucketName}`);
    console.log(`   URL: https://${bucketName}.s3.${region}.amazonaws.com`);
    
    return true;
  } catch (err) {
    console.error(`❌ Error creating bucket: ${err.message}`);
    if (err.name === 'AccessDenied') {
      console.error(`\n⚠️  Access denied. Please ensure your AWS credentials have permission to:`);
      console.error(`   - s3:CreateBucket`);
      console.error(`   - s3:PutBucketCors`);
      console.error(`   - s3:PutBucketPolicy`);
    }
    throw err;
  }
}

// Main
if (require.main === module) {
  const bucketName = process.env.S3_BUCKET_NAME || 'scrapmate-images';
  const region = process.env.AWS_REGION || 'ap-south-1';
  
  createBucket(bucketName, region)
    .then(() => {
      console.log('\n✅ Setup complete! You can now run the migration script.');
      process.exit(0);
    })
    .catch(err => {
      console.error('\n❌ Setup failed:', err.message);
      process.exit(1);
    });
}

module.exports = { createBucket };

