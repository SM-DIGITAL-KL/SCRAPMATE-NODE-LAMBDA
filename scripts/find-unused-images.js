const fs = require('fs');
const path = require('path');
const { getDynamoDBClient } = require('../config/dynamodb');
const { ScanCommand } = require('@aws-sdk/lib-dynamodb');

// Image directories to check
const IMAGE_DIRS = [
  path.join(__dirname, '../public/assets/images/profile'),
  path.join(__dirname, '../public/assets/images/shopimages'),
  path.join(__dirname, '../public/assets/images/deliveryboy'),
  path.join(__dirname, '../public/assets/images/product_category'),
  path.join(__dirname, '../public/assets/images/order')
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

// Get all image filenames referenced in DynamoDB
async function getReferencedImages() {
  const referenced = new Set();
  
  for (const [tableName, imageFields] of Object.entries(TABLES_CONFIG)) {
    try {
      const client = getDynamoDBClient();
      let lastKey = null;
      
      console.log(`📊 Scanning ${tableName}...`);
      
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
              if (item[fieldName]) {
                // Extract filename from URL or use as-is
                let filename = item[fieldName];
                if (filename.includes('/')) {
                  filename = filename.split('/').pop();
                }
                if (filename.includes('?')) {
                  filename = filename.split('?')[0];
                }
                referenced.add(filename);
              }
            }
          }
        }
        
        lastKey = response.LastEvaluatedKey;
      } while (lastKey);
    } catch (err) {
      console.error(`❌ Error scanning ${tableName}:`, err.message);
    }
  }
  
  return referenced;
}

// Find unused images
async function findUnusedImages() {
  console.log('🔍 Finding unused images...\n');
  
  // Get all referenced images from DynamoDB
  const referenced = await getReferencedImages();
  console.log(`\n📝 Found ${referenced.size} referenced images in DynamoDB\n`);
  
  const unusedImages = [];
  let totalSize = 0;
  
  // Check each directory
  for (const dirPath of IMAGE_DIRS) {
    console.log(`📁 Checking: ${dirPath}`);
    const images = getAllImages(dirPath);
    
    for (const image of images) {
      if (!referenced.has(image.filename)) {
        unusedImages.push(image);
        totalSize += image.size;
      }
    }
    
    console.log(`   Found ${images.length} images, ${images.length - unusedImages.filter(img => img.fullPath.startsWith(dirPath)).length} referenced`);
  }
  
  console.log(`\n📊 Summary:`);
  console.log(`   Total unused images: ${unusedImages.length}`);
  console.log(`   Total size: ${(totalSize / 1024 / 1024).toFixed(2)} MB`);
  
  // Write unused images to file
  const outputFile = path.join(__dirname, '../unused-images.json');
  fs.writeFileSync(outputFile, JSON.stringify(unusedImages, null, 2));
  console.log(`\n📄 Unused images list saved to: ${outputFile}`);
  
  return unusedImages;
}

// Delete unused images
async function deleteUnusedImages(dryRun = true) {
  const unusedImages = await findUnusedImages();
  
  if (dryRun) {
    console.log(`\n🔍 DRY RUN: Would delete ${unusedImages.length} images`);
    console.log(`   Run with dryRun=false to actually delete`);
    return;
  }
  
  console.log(`\n🗑️  Deleting ${unusedImages.length} unused images...`);
  
  let deleted = 0;
  let failed = 0;
  
  for (const image of unusedImages) {
    try {
      fs.unlinkSync(image.fullPath);
      deleted++;
      console.log(`   ✅ Deleted: ${image.filename}`);
    } catch (err) {
      failed++;
      console.error(`   ❌ Failed to delete ${image.filename}:`, err.message);
    }
  }
  
  console.log(`\n✅ Deleted: ${deleted}, ❌ Failed: ${failed}`);
}

// Run
if (require.main === module) {
  const dryRun = process.argv[2] !== 'delete';
  deleteUnusedImages(dryRun).catch(err => {
    console.error('❌ Error:', err);
    process.exit(1);
  });
}

module.exports = { findUnusedImages, deleteUnusedImages };

