/**
 * Script to compress all S3 images to below 50KB and re-upload
 * Maintains same S3 keys so DynamoDB references remain valid
 */

const { S3Client, ListObjectsV2Command, GetObjectCommand, PutObjectCommand } = require('@aws-sdk/client-s3');
const { getS3Client, BUCKET_NAME } = require('../utils/s3Upload');
const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

// Image folders in S3
const IMAGE_FOLDERS = ['orders', 'categories', 'profile', 'shops', 'deliveryboy', 'images'];

// Target size: 50KB
const TARGET_SIZE_BYTES = 50 * 1024; // 50KB

// Supported image formats
const SUPPORTED_FORMATS = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];

// Statistics
let stats = {
  total: 0,
  processed: 0,
  compressed: 0,
  skipped: 0,
  errors: 0,
  totalOriginalSize: 0,
  totalCompressedSize: 0
};

/**
 * Compress image buffer to under 50KB
 */
async function compressImage(buffer, originalKey) {
  try {
    const ext = path.extname(originalKey).toLowerCase();
    
    // If not a supported image format, return original
    if (!SUPPORTED_FORMATS.includes(ext)) {
      return buffer;
    }

    const originalSize = buffer.length;
    
    // If already under 50KB, return original
    if (originalSize <= TARGET_SIZE_BYTES) {
      return buffer;
    }

    // Determine output format (prefer JPEG for better compression)
    let outputFormat = 'jpeg';
    let quality = 85;
    let maxWidth = 1920;
    let maxHeight = 1920;

    if (ext === '.png') {
      outputFormat = 'png';
      quality = 90; // PNG uses compression level
    } else if (ext === '.webp') {
      outputFormat = 'webp';
      quality = 85;
    }

    // Try to compress with different quality levels
    let compressedBuffer = buffer;
    let attempts = 0;
    const maxAttempts = 10;

    while (compressedBuffer.length > TARGET_SIZE_BYTES && attempts < maxAttempts) {
      attempts++;
      
      // Reduce quality progressively
      quality = Math.max(50, quality - 5);
      
      // Reduce dimensions if still too large
      if (attempts > 3) {
        maxWidth = Math.max(800, maxWidth - 200);
        maxHeight = Math.max(800, maxHeight - 200);
      }

      try {
        let sharpInstance = sharp(buffer)
          .resize(maxWidth, maxHeight, {
            fit: 'inside',
            withoutEnlargement: true
          });

        if (outputFormat === 'jpeg') {
          sharpInstance = sharpInstance.jpeg({ quality, mozjpeg: true });
        } else if (outputFormat === 'png') {
          sharpInstance = sharpInstance.png({ 
            compressionLevel: Math.floor((100 - quality) / 10),
            quality 
          });
        } else if (outputFormat === 'webp') {
          sharpInstance = sharpInstance.webp({ quality });
        }

        compressedBuffer = await sharpInstance.toBuffer();
        
        // If compression made it larger, use original
        if (compressedBuffer.length >= originalSize) {
          compressedBuffer = buffer;
          break;
        }
      } catch (err) {
        console.error(`  ⚠️  Compression error (attempt ${attempts}):`, err.message);
        // If compression fails, return original
        if (attempts === maxAttempts) {
          return buffer;
        }
      }
    }

    // If still too large after all attempts, use more aggressive compression
    if (compressedBuffer.length > TARGET_SIZE_BYTES) {
      console.log(`  ⚠️  Image still ${(compressedBuffer.length / 1024).toFixed(2)}KB after compression, using aggressive mode`);
      
      // Very aggressive compression
      try {
        compressedBuffer = await sharp(buffer)
          .resize(800, 800, {
            fit: 'inside',
            withoutEnlargement: true
          })
          .jpeg({ quality: 60, mozjpeg: true })
          .toBuffer();
      } catch (err) {
        console.error(`  ❌ Aggressive compression failed:`, err.message);
        return buffer; // Return original if all compression fails
      }
    }

    return compressedBuffer;
  } catch (err) {
    console.error(`  ❌ Compression error:`, err.message);
    return buffer; // Return original on error
  }
}

/**
 * Process a single S3 object
 */
async function processImage(s3Client, key) {
  try {
    stats.total++;
    
    const ext = path.extname(key).toLowerCase();
    
    // Skip non-image files
    if (!SUPPORTED_FORMATS.includes(ext)) {
      console.log(`⏭️  Skipping non-image: ${key}`);
      stats.skipped++;
      return;
    }

    // Download image
    console.log(`\n📥 Downloading: ${key}`);
    const getCommand = new GetObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key
    });
    
    const response = await s3Client.send(getCommand);
    const chunks = [];
    
    for await (const chunk of response.Body) {
      chunks.push(chunk);
    }
    
    const originalBuffer = Buffer.concat(chunks);
    const originalSize = originalBuffer.length;
    stats.totalOriginalSize += originalSize;

    console.log(`   Original size: ${(originalSize / 1024).toFixed(2)}KB`);

    // If already under 50KB, skip
    if (originalSize <= TARGET_SIZE_BYTES) {
      console.log(`   ✅ Already under 50KB, skipping`);
      stats.skipped++;
      return;
    }

    // Compress image
    console.log(`   🔄 Compressing...`);
    const compressedBuffer = await compressImage(originalBuffer, key);
    const compressedSize = compressedBuffer.length;
    stats.totalCompressedSize += compressedSize;

    const reduction = ((originalSize - compressedSize) / originalSize * 100).toFixed(1);
    console.log(`   Compressed size: ${(compressedSize / 1024).toFixed(2)}KB (${reduction}% reduction)`);

    // Determine content type
    const contentTypes = {
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.gif': 'image/gif',
      '.webp': 'image/webp'
    };
    const contentType = contentTypes[ext] || 'image/jpeg';

    // Re-upload compressed image (same key)
    console.log(`   📤 Re-uploading compressed image...`);
    const putCommand = new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
      Body: compressedBuffer,
      ContentType: contentType
    });

    await s3Client.send(putCommand);
    
    console.log(`   ✅ Successfully compressed and re-uploaded`);
    stats.processed++;
    
    if (compressedSize < originalSize) {
      stats.compressed++;
    }
  } catch (err) {
    console.error(`   ❌ Error processing ${key}:`, err.message);
    stats.errors++;
  }
}

/**
 * List and process all images in a folder
 */
async function processFolder(s3Client, folder) {
  console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`📁 Processing folder: ${folder}/`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

  try {
    let continuationToken = null;
    let pageCount = 0;

    do {
      const listCommand = new ListObjectsV2Command({
        Bucket: BUCKET_NAME,
        Prefix: `${folder}/`,
        ContinuationToken: continuationToken,
        MaxKeys: 100
      });

      const response = await s3Client.send(listCommand);
      
      if (!response.Contents || response.Contents.length === 0) {
        console.log(`   No images found in ${folder}/`);
        break;
      }

      pageCount++;
      console.log(`\n   Page ${pageCount}: Found ${response.Contents.length} objects`);

      // Process each object
      for (const object of response.Contents) {
        // Skip if it's a folder (ends with /)
        if (object.Key.endsWith('/')) {
          continue;
        }

        await processImage(s3Client, object.Key);
        
        // Small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      continuationToken = response.NextContinuationToken;
    } while (continuationToken);

    console.log(`\n✅ Completed processing folder: ${folder}/`);
  } catch (err) {
    console.error(`❌ Error processing folder ${folder}:`, err.message);
  }
}

/**
 * Main function
 */
async function main() {
  console.log('🚀 S3 Image Compression Script');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`Target size: ${TARGET_SIZE_BYTES / 1024}KB`);
  console.log(`Bucket: ${BUCKET_NAME}`);
  console.log(`Folders: ${IMAGE_FOLDERS.join(', ')}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  try {
    const s3Client = getS3Client();

    // Process each folder
    for (const folder of IMAGE_FOLDERS) {
      await processFolder(s3Client, folder);
    }

    // Print summary
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📊 Compression Summary');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`Total images found: ${stats.total}`);
    console.log(`Processed: ${stats.processed}`);
    console.log(`Compressed: ${stats.compressed}`);
    console.log(`Skipped (already <50KB): ${stats.skipped}`);
    console.log(`Errors: ${stats.errors}`);
    console.log(`\nOriginal total size: ${(stats.totalOriginalSize / 1024 / 1024).toFixed(2)}MB`);
    console.log(`Compressed total size: ${(stats.totalCompressedSize / 1024 / 1024).toFixed(2)}MB`);
    const totalReduction = stats.totalOriginalSize > 0 
      ? ((stats.totalOriginalSize - stats.totalCompressedSize) / stats.totalOriginalSize * 100).toFixed(1)
      : 0;
    console.log(`Total reduction: ${totalReduction}%`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    console.log('✅ Image compression completed!');
    console.log('💡 All images maintain the same S3 keys, so DynamoDB references remain valid.');
  } catch (err) {
    console.error('❌ Fatal error:', err);
    process.exit(1);
  }
}

// Run the script
if (require.main === module) {
  main().catch(err => {
    console.error('❌ Unhandled error:', err);
    process.exit(1);
  });
}

module.exports = { compressImage, processImage, processFolder };

