const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { uploadToS3, getS3Url, BUCKET_NAME, getS3Client, getS3BaseUrl } = require('../utils/s3Upload');
const { getDynamoDBClient } = require('../config/dynamodb');
const { UpdateCommand, ScanCommand } = require('@aws-sdk/lib-dynamodb');
const { HeadObjectCommand } = require('@aws-sdk/client-s3');

const OLD_DOMAIN = 'https://app.scrapmate.co.in';
const IMAGE_BASE_PATH = '/assets/images/appimages/categoryimagesstatic/';
const TEMP_DIR = path.join(__dirname, '../temp-category-images');

// Ensure temp directory exists
if (!fs.existsSync(TEMP_DIR)) {
  fs.mkdirSync(TEMP_DIR, { recursive: true });
}

// Download image from URL
function downloadImage(url, filepath) {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https') ? https : http;
    
    protocol.get(url, (response) => {
      if (response.statusCode === 200) {
        const fileStream = fs.createWriteStream(filepath);
        response.pipe(fileStream);
        fileStream.on('finish', () => {
          fileStream.close();
          resolve(filepath);
        });
      } else if (response.statusCode === 301 || response.statusCode === 302) {
        // Handle redirect
        downloadImage(response.headers.location, filepath)
          .then(resolve)
          .catch(reject);
      } else {
        reject(new Error(`Failed to download: ${response.statusCode} ${response.statusMessage}`));
      }
    }).on('error', (err) => {
      reject(err);
    });
  });
}

// Get all category records from DynamoDB
async function getAllCategories() {
  try {
    const client = getDynamoDBClient();
    const result = await client.send(new ScanCommand({
      TableName: 'category_img_keywords'
    }));
    return result.Items || [];
  } catch (err) {
    console.error('❌ Error fetching categories:', err);
    throw err;
  }
}

// Extract filename from URL
function extractFilename(url) {
  if (!url) return null;
  const parts = url.split('/');
  return parts[parts.length - 1];
}

// Update DynamoDB record with S3 URL
async function updateCategoryRecord(categoryId, s3Url) {
  try {
    const client = getDynamoDBClient();
    const command = new UpdateCommand({
      TableName: 'category_img_keywords',
      Key: { id: categoryId },
      UpdateExpression: 'SET cat_img = :s3Url, updated_at = :updatedAt',
      ExpressionAttributeValues: {
        ':s3Url': s3Url,
        ':updatedAt': new Date().toISOString()
      }
    });
    
    await client.send(command);
    console.log(`  ✅ Updated category ${categoryId} with S3 URL`);
    return true;
  } catch (err) {
    console.error(`  ❌ Error updating category ${categoryId}:`, err.message);
    return false;
  }
}

// Process a single category
async function processCategory(category) {
  const categoryId = category.id;
  let imageUrl = category.cat_img || category.category_img;
  
  if (!imageUrl) {
    console.log(`⚠️  Category ${categoryId} has no image URL`);
    return { success: false, reason: 'no_url' };
  }
  
  // If already an S3 URL, skip
  if (imageUrl.includes('s3.amazonaws.com') || imageUrl.includes('scrapmate-images.s3')) {
    console.log(`⏭️  Category ${categoryId} already has S3 URL: ${imageUrl}`);
    return { success: true, reason: 'already_s3', s3Url: imageUrl };
  }
  
  // Extract filename
  const filename = extractFilename(imageUrl);
  if (!filename) {
    console.log(`⚠️  Category ${categoryId}: Could not extract filename from ${imageUrl}`);
    return { success: false, reason: 'no_filename' };
  }
  
  // Check if file already exists in S3
  const s3Key = `categories/${filename}`;
  try {
    const s3Client = getS3Client();
    await s3Client.send(new HeadObjectCommand({
      Bucket: BUCKET_NAME,
      Key: s3Key
    }));
    // File exists in S3
    const s3BaseUrl = getS3BaseUrl();
    const s3Url = `${s3BaseUrl}/${s3Key}`;
    console.log(`✅ Category ${categoryId}: File already in S3: ${s3Key}`);
    // Update DynamoDB with existing S3 URL
    await updateCategoryRecord(categoryId, s3Url);
    return { success: true, reason: 'already_in_s3', s3Url };
  } catch (err) {
    // File doesn't exist in S3, continue with download
    if (err.name !== 'NotFound' && err.$metadata?.httpStatusCode !== 404) {
      console.warn(`  ⚠️  Error checking S3 for ${s3Key}:`, err.message);
    }
  }
  
  // Construct full URL
  let fullUrl = imageUrl;
  if (!imageUrl.startsWith('http')) {
    fullUrl = `${OLD_DOMAIN}${IMAGE_BASE_PATH}${filename}`;
  }
  
  console.log(`📥 Downloading: ${fullUrl}`);
  
  // Download image
  const tempFilePath = path.join(TEMP_DIR, filename);
  try {
    await downloadImage(fullUrl, tempFilePath);
    console.log(`  ✅ Downloaded: ${filename}`);
  } catch (err) {
    console.error(`  ❌ Failed to download ${filename}:`, err.message);
    return { success: false, reason: 'download_failed', error: err.message };
  }
  
  // Upload to S3
  try {
    const s3Url = await uploadToS3(tempFilePath, s3Key);
    console.log(`  ✅ Uploaded to S3: ${s3Key}`);
    
    // Update DynamoDB
    await updateCategoryRecord(categoryId, s3Url);
    
    // Clean up temp file
    fs.unlinkSync(tempFilePath);
    
    return { success: true, reason: 'migrated', s3Url };
  } catch (err) {
    console.error(`  ❌ Failed to upload ${filename} to S3:`, err.message);
    // Clean up temp file
    if (fs.existsSync(tempFilePath)) {
      fs.unlinkSync(tempFilePath);
    }
    return { success: false, reason: 'upload_failed', error: err.message };
  }
}

// getS3BaseUrl is imported from utils/s3Upload

// Main migration function
async function migrateCategoryImages() {
  console.log('🚀 Starting category image migration to S3\n');
  
  try {
    // Get all categories
    console.log('📋 Fetching categories from DynamoDB...');
    const categories = await getAllCategories();
    console.log(`✅ Found ${categories.length} categories\n`);
    
    let successCount = 0;
    let skipCount = 0;
    let failCount = 0;
    
    // Process each category
    for (const category of categories) {
      const result = await processCategory(category);
      
      if (result.success) {
        if (result.reason === 'already_s3' || result.reason === 'already_in_s3') {
          skipCount++;
        } else {
          successCount++;
        }
      } else {
        failCount++;
      }
      
      // Small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    console.log('\n📊 Migration Summary:');
    console.log(`   ✅ Migrated: ${successCount}`);
    console.log(`   ⏭️  Skipped (already in S3): ${skipCount}`);
    console.log(`   ❌ Failed: ${failCount}`);
    console.log(`   📦 Total: ${categories.length}`);
    
    // Clean up temp directory
    try {
      const files = fs.readdirSync(TEMP_DIR);
      for (const file of files) {
        fs.unlinkSync(path.join(TEMP_DIR, file));
      }
      fs.rmdirSync(TEMP_DIR);
      console.log('\n🧹 Cleaned up temporary files');
    } catch (err) {
      console.log('\n⚠️  Could not clean up temp directory:', err.message);
    }
    
    console.log('\n✅ Migration complete!');
    
  } catch (err) {
    console.error('\n❌ Migration failed:', err);
    process.exit(1);
  }
}

// Run migration
if (require.main === module) {
  migrateCategoryImages();
}

module.exports = { migrateCategoryImages };

