const fs = require('fs');
const path = require('path');
const { getDynamoDBClient } = require('../config/dynamodb');
const { ScanCommand } = require('@aws-sdk/lib-dynamodb');

// Image directories to check
const IMAGE_DIRS = [
  { localPath: path.join(__dirname, '../public/assets/images/profile'), type: 'profile' },
  { localPath: path.join(__dirname, '../public/assets/images/shopimages'), type: 'shops' },
  { localPath: path.join(__dirname, '../public/assets/images/deliveryboy'), type: 'deliveryboy' },
  { localPath: path.join(__dirname, '../public/assets/images/product_category'), type: 'categories' },
  { localPath: path.join(__dirname, '../public/assets/images/order'), type: 'orders' },
  // Additional directories that might contain uploaded images
  { localPath: path.join(__dirname, '../public/uploads'), type: 'uploads' }
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

// Get all image filenames that exist in DynamoDB (either as S3 URLs or filenames)
async function getImagesInDynamoDB() {
  const imagesInDB = new Set();
  
  console.log('📊 Scanning DynamoDB for images...\n');
  
  for (const [tableName, imageFields] of Object.entries(TABLES_CONFIG)) {
    try {
      const client = getDynamoDBClient();
      let lastKey = null;
      let count = 0;
      
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
                const imageValue = item[fieldName];
                
                // Check if it's an S3 URL
                if (imageValue.startsWith('http://') || imageValue.startsWith('https://')) {
                  // Extract filename from S3 URL
                  let filename = imageValue;
                  if (filename.includes('/')) {
                    filename = filename.split('/').pop();
                  }
                  if (filename.includes('?')) {
                    filename = filename.split('?')[0];
                  }
                  
                  if (filename && !filename.startsWith('http')) {
                    imagesInDB.add(filename);
                  }
                } else {
                  // It's a local filename reference
                  let filename = imageValue;
                  if (filename.includes('/')) {
                    filename = filename.split('/').pop();
                  }
                  if (filename && !filename.startsWith('http')) {
                    imagesInDB.add(filename);
                  }
                }
              }
            }
          }
          count += response.Items.length;
        }
        
        lastKey = response.LastEvaluatedKey;
      } while (lastKey);
      
      console.log(`   ✅ Scanned ${tableName}: ${count} records`);
    } catch (err) {
      console.error(`   ❌ Error scanning ${tableName}:`, err.message);
    }
  }
  
  console.log(`\n📝 Found ${imagesInDB.size} image filenames in DynamoDB\n`);
  return { imagesInDB };
}

// Find local images that exist in DynamoDB
async function findImagesInDynamoDB() {
  const { imagesInDB } = await getImagesInDynamoDB();
  const allLocalImages = [];
  const toDelete = [];
  const notInDB = [];
  let totalSize = 0;
  
  console.log('🔍 Checking local images against DynamoDB...\n');
  
  // First, collect all local images
  for (const dirConfig of IMAGE_DIRS) {
    const { localPath } = dirConfig;
    if (fs.existsSync(localPath)) {
      const images = getAllImages(localPath);
      allLocalImages.push(...images);
    }
  }
  
  console.log(`📁 Found ${allLocalImages.length} total local images\n`);
  
  // Check each image
  for (const image of allLocalImages) {
    if (imagesInDB.has(image.filename)) {
      toDelete.push(image);
      totalSize += image.size;
    } else {
      notInDB.push(image);
    }
  }
  
  // Report by directory
  for (const dirConfig of IMAGE_DIRS) {
    const { localPath } = dirConfig;
    if (!fs.existsSync(localPath)) continue;
    
    const images = getAllImages(localPath);
    const dirInDB = images.filter(img => imagesInDB.has(img.filename));
    const dirNotInDB = images.filter(img => !imagesInDB.has(img.filename));
    
    console.log(`📁 ${localPath}`);
    console.log(`   Total: ${images.length}, In DB: ${dirInDB.length}, Not in DB: ${dirNotInDB.length}`);
  }
  
  console.log(`\n📊 Summary:`);
  console.log(`   Total local images: ${allLocalImages.length}`);
  console.log(`   Found in DynamoDB: ${toDelete.length}`);
  console.log(`   NOT found in DynamoDB: ${notInDB.length}`);
  console.log(`   Total size to delete: ${(totalSize / 1024 / 1024).toFixed(2)} MB`);
  
  if (notInDB.length > 0) {
    console.log(`\n⚠️  WARNING: ${notInDB.length} images are NOT in DynamoDB:`);
    notInDB.slice(0, 10).forEach(img => {
      console.log(`     - ${img.filename}`);
    });
    if (notInDB.length > 10) {
      console.log(`     ... and ${notInDB.length - 10} more`);
    }
  }
  
  return { toDelete, notInDB, allLocalImages };
}

// Get all local images (for delete-all option)
function getAllLocalImages() {
  const allImages = [];
  
  for (const dirConfig of IMAGE_DIRS) {
    const images = getAllImages(dirConfig.localPath);
    allImages.push(...images);
  }
  
  return allImages;
}

// Delete images that are in DynamoDB
async function deleteImagesInDynamoDB(dryRun = true, deleteAll = false, requireAll = true) {
  let toDelete = [];
  let notInDB = [];
  let allLocalImages = [];
  
  if (deleteAll) {
    console.log('⚠️  DELETE ALL MODE: Will delete ALL images in directories\n');
    allLocalImages = getAllLocalImages();
    toDelete = allLocalImages;
    notInDB = [];
  } else {
    const result = await findImagesInDynamoDB();
    toDelete = result.toDelete;
    notInDB = result.notInDB;
    allLocalImages = result.allLocalImages;
    
    if (toDelete.length === 0) {
      console.log('\n✅ No images found in DynamoDB to delete.');
      return;
    }
    
    // If requireAll is true, only delete if ALL images are in DB
    if (requireAll && notInDB.length > 0) {
      console.log(`\n❌ Cannot proceed: ${notInDB.length} images are NOT in DynamoDB.`);
      console.log(`   All images must be in DynamoDB before deletion.`);
      console.log(`   Use 'delete' argument with '--force' flag to delete only images in DB.`);
      return;
    }
  }
  
  if (dryRun) {
    console.log(`\n🔍 DRY RUN: Would delete ${toDelete.length} images`);
    if (notInDB.length > 0) {
      console.log(`   ⚠️  Note: ${notInDB.length} images are NOT in DynamoDB and will NOT be deleted`);
    }
    console.log(`   Run with 'delete' argument to actually delete`);
    if (!deleteAll) {
      console.log(`   Or run with 'delete-all' to delete ALL images (not just those in DB)`);
    }
    console.log(`\n   Sample files to delete:`);
    toDelete.slice(0, 10).forEach(img => {
      console.log(`     - ${img.filename} (${(img.size / 1024).toFixed(2)} KB)`);
    });
    if (toDelete.length > 10) {
      console.log(`     ... and ${toDelete.length - 10} more`);
    }
    return;
  }
  
  console.log(`\n🗑️  Deleting ${toDelete.length} images that are in DynamoDB...`);
  if (notInDB.length > 0) {
    console.log(`   ⚠️  Note: ${notInDB.length} images NOT in DynamoDB will be kept`);
  }
  
  let deleted = 0;
  let failed = 0;
  let totalSize = 0;
  
  for (const image of toDelete) {
    try {
      fs.unlinkSync(image.fullPath);
      deleted++;
      totalSize += image.size;
      if (deleted % 100 === 0) {
        console.log(`   ✅ Deleted ${deleted}/${toDelete.length} images...`);
      }
    } catch (err) {
      failed++;
      console.error(`   ❌ Failed to delete ${image.filename}:`, err.message);
    }
  }
  
  console.log(`\n📊 Deletion Summary:`);
  console.log(`   ✅ Deleted: ${deleted}`);
  console.log(`   ❌ Failed: ${failed}`);
  console.log(`   💾 Space freed: ${(totalSize / 1024 / 1024).toFixed(2)} MB`);
  if (notInDB.length > 0) {
    console.log(`   📝 Kept (not in DB): ${notInDB.length} images`);
  }
  console.log(`\n✅ Cleanup complete!`);
}

// Main
if (require.main === module) {
  const arg = process.argv[2];
  const forceFlag = process.argv.includes('--force');
  const dryRun = arg !== 'delete' && arg !== 'delete-all';
  const deleteAll = arg === 'delete-all';
  const requireAll = !forceFlag; // If --force, don't require all images to be in DB
  
  if (!dryRun) {
    if (deleteAll) {
      console.log('⚠️  WARNING: This will permanently delete ALL images from local storage!');
      console.log('   This includes images that may not have been migrated to S3.\n');
    } else {
      if (requireAll) {
        console.log('⚠️  WARNING: This will permanently delete images from local storage!');
        console.log('   Only images that exist in DynamoDB will be deleted.');
        console.log('   If any images are NOT in DynamoDB, deletion will be aborted.\n');
      } else {
        console.log('⚠️  WARNING: This will permanently delete images from local storage!');
        console.log('   Only images that exist in DynamoDB will be deleted.');
        console.log('   Images NOT in DynamoDB will be kept.\n');
      }
    }
  }
  
  deleteImagesInDynamoDB(dryRun, deleteAll, requireAll)
    .then(() => {
      process.exit(0);
    })
    .catch(err => {
      console.error('❌ Error:', err);
      process.exit(1);
    });
}

module.exports = { deleteImagesInDynamoDB, findImagesInDynamoDB };

