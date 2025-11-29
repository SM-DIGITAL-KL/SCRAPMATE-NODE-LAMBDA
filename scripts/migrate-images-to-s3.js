const fs = require('fs');
const path = require('path');
const { uploadToS3, generateS3Key, getS3Url, BUCKET_NAME } = require('../utils/s3Upload');
const { getDynamoDBClient } = require('../config/dynamodb');
const { UpdateCommand, ScanCommand } = require('@aws-sdk/lib-dynamodb');

// Image directories to migrate
const IMAGE_DIRS = [
  { localPath: path.join(__dirname, '../public/assets/images/profile'), type: 'profile' },
  { localPath: path.join(__dirname, '../public/assets/images/shopimages'), type: 'shops' },
  { localPath: path.join(__dirname, '../public/assets/images/deliveryboy'), type: 'deliveryboy' },
  { localPath: path.join(__dirname, '../public/assets/images/product_category'), type: 'categories' },
  { localPath: path.join(__dirname, '../public/assets/images/order'), type: 'orders' }
];

// DynamoDB tables and their image fields
const TABLES_CONFIG = {
  'users': ['profile_photo'],
  'shops': ['profile_photo', 'shop_img'],
  'customer': ['profile_photo'],
  'delivery_boy': ['profile_img', 'licence_img_front', 'licence_img_back'],
  'product_category': ['cat_img'],
  'orders': ['image1', 'image2', 'image3', 'image4', 'image5', 'image6']
};

// Get all image files from a directory
function getAllImages(dirPath) {
  const images = [];
  if (!fs.existsSync(dirPath)) {
    console.log(`⚠️  Directory does not exist: ${dirPath}`);
    return images;
  }
  
  const files = fs.readdirSync(dirPath);
  for (const file of files) {
    const filePath = path.join(dirPath, file);
    const stat = fs.statSync(filePath);
    if (stat.isFile()) {
      const ext = path.extname(file).toLowerCase();
      if (['.jpg', '.jpeg', '.png', '.gif', '.webp'].includes(ext)) {
        images.push({
          filename: file,
          fullPath: filePath,
          size: stat.size
        });
      }
    }
  }
  return images;
}

// Update DynamoDB record with S3 URL
async function updateDynamoDBRecord(tableName, recordId, fieldName, s3Url) {
  try {
    const client = getDynamoDBClient();
    
    // Build update expression
    const updateExpressions = [];
    const expressionAttributeNames = {};
    const expressionAttributeValues = {};
    
    const attrName = `#${fieldName}`;
    const attrValue = `:${fieldName}`;
    updateExpressions.push(`${attrName} = ${attrValue}`);
    expressionAttributeNames[attrName] = fieldName;
    expressionAttributeValues[attrValue] = s3Url;
    
    // Always update updated_at if it exists
    updateExpressions.push(`#updated_at = :updated_at`);
    expressionAttributeNames['#updated_at'] = 'updated_at';
    expressionAttributeValues[':updated_at'] = new Date().toISOString();
    
    const command = new UpdateCommand({
      TableName: tableName,
      Key: { id: Number(recordId) },
      UpdateExpression: `SET ${updateExpressions.join(', ')}`,
      ExpressionAttributeNames: expressionAttributeNames,
      ExpressionAttributeValues: expressionAttributeValues
    });
    
    await client.send(command);
    console.log(`  ✅ Updated ${tableName}[${recordId}].${fieldName} -> ${s3Url}`);
    return true;
  } catch (err) {
    console.error(`  ❌ Error updating ${tableName}[${recordId}].${fieldName}:`, err.message);
    return false;
  }
}

// Find and update DynamoDB records that reference an image
async function updateDynamoDBRecords(filename, s3Url) {
  let updated = 0;
  
  for (const [tableName, imageFields] of Object.entries(TABLES_CONFIG)) {
    try {
      const client = getDynamoDBClient();
      let lastKey = null;
      
      do {
        const params = {
          TableName: tableName
        };
        
        if (lastKey) {
          params.ExclusiveStartKey = lastKey;
        }
        
        const command = new ScanCommand(params);
        const response = await client.send(command);
        
        if (response.Items) {
          for (const item of response.Items) {
            for (const fieldName of imageFields) {
              if (item[fieldName] === filename) {
                await updateDynamoDBRecord(tableName, item.id, fieldName, s3Url);
                updated++;
              }
            }
          }
        }
        
        lastKey = response.LastEvaluatedKey;
      } while (lastKey);
    } catch (err) {
      console.error(`  ❌ Error scanning ${tableName}:`, err.message);
    }
  }
  
  return updated;
}

// Migrate images from a directory
async function migrateDirectory(dirConfig) {
  const { localPath, type } = dirConfig;
  console.log(`\n📁 Migrating directory: ${localPath} (type: ${type})`);
  
  const images = getAllImages(localPath);
  console.log(`   Found ${images.length} images`);
  
  let uploaded = 0;
  let failed = 0;
  let updated = 0;
  
  for (const image of images) {
    try {
      // Generate S3 key
      const s3Key = generateS3Key(image.fullPath, type);
      
      // Upload to S3
      const s3Url = await uploadToS3(image.fullPath, s3Key);
      uploaded++;
      
      // Update DynamoDB records
      const recordsUpdated = await updateDynamoDBRecords(image.filename, s3Url);
      updated += recordsUpdated;
      
      if (recordsUpdated === 0) {
        console.log(`  ⚠️  No DynamoDB records found for: ${image.filename}`);
      }
    } catch (err) {
      // Check for permission errors
      if (err.$metadata?.httpStatusCode === 403 || err.name === 'Forbidden' || err.name === 'AccessDenied') {
        console.error(`  ❌ Permission denied for ${image.filename}`);
        console.error(`     Required permission: s3:PutObject on bucket ${BUCKET_NAME}`);
        console.error(`     Please check your IAM permissions.`);
      } else {
        console.error(`  ❌ Failed to migrate ${image.filename}: ${err.message}`);
      }
      failed++;
    }
  }
  
  console.log(`   ✅ Uploaded: ${uploaded}, ❌ Failed: ${failed}, 📝 Updated records: ${updated}`);
  
  return { uploaded, failed, updated };
}

// Check if S3 bucket exists (with permission error handling)
async function checkBucketExists() {
  try {
    const { S3Client, HeadBucketCommand } = require('@aws-sdk/client-s3');
    const { getS3Client, BUCKET_NAME } = require('../utils/s3Upload');
    
    const client = getS3Client();
    const command = new HeadBucketCommand({ Bucket: BUCKET_NAME });
    await client.send(command);
    return { exists: true, error: null };
  } catch (err) {
    if (err.name === 'NotFound' || err.name === 'NoSuchBucket') {
      return { exists: false, error: null };
    }
    // Permission error - bucket might exist but we can't check
    if (err.$metadata?.httpStatusCode === 403 || err.name === 'Forbidden') {
      console.warn(`⚠️  Cannot verify bucket existence (permission denied)`);
      console.warn(`   Assuming bucket exists and continuing...`);
      return { exists: true, error: 'permission_denied' };
    }
    throw err;
  }
}

// Main migration function
async function migrateAllImages() {
  console.log('🚀 Starting image migration to S3...\n');
  
  // Check if bucket exists
  const { BUCKET_NAME } = require('../utils/s3Upload');
  console.log(`📦 Checking S3 bucket: ${BUCKET_NAME}...`);
  
  const bucketCheck = await checkBucketExists();
  if (!bucketCheck.exists && !bucketCheck.error) {
    console.error(`\n❌ S3 Bucket "${BUCKET_NAME}" does not exist!`);
    console.error(`\n📝 Please create the bucket first:`);
    console.error(`   1. Run: node scripts/create-s3-bucket.js`);
    console.error(`   2. Or create it manually in AWS Console`);
    console.error(`   3. Or set S3_BUCKET_NAME environment variable to an existing bucket\n`);
    process.exit(1);
  }
  
  if (bucketCheck.error === 'permission_denied') {
    console.log(`⚠️  Note: Could not verify bucket permissions. Make sure you have:`);
    console.log(`   - s3:PutObject permission`);
    console.log(`   - s3:GetObject permission (optional, for verification)\n`);
  } else {
    console.log(`✅ Bucket exists: ${BUCKET_NAME}\n`);
  }
  
  let totalUploaded = 0;
  let totalFailed = 0;
  let totalUpdated = 0;
  
  for (const dirConfig of IMAGE_DIRS) {
    const result = await migrateDirectory(dirConfig);
    totalUploaded += result.uploaded;
    totalFailed += result.failed;
    totalUpdated += result.updated;
  }
  
  console.log('\n📊 Migration Summary:');
  console.log(`   ✅ Total uploaded: ${totalUploaded}`);
  console.log(`   ❌ Total failed: ${totalFailed}`);
  console.log(`   📝 Total records updated: ${totalUpdated}`);
  console.log('\n✅ Migration completed!');
}

// Run migration
if (require.main === module) {
  migrateAllImages().catch(err => {
    console.error('❌ Migration failed:', err);
    process.exit(1);
  });
}

module.exports = { migrateAllImages, migrateDirectory };

