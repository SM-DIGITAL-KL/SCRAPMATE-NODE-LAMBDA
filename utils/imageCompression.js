/**
 * Image Compression Utility
 * Compresses images to target size (default 50KB)
 * 
 * Note: sharp is lazy-loaded to avoid Lambda initialization errors
 * when the package has macOS binaries but Lambda runs on Linux
 */

// Lazy-load sharp only when needed
let sharp = null;
let sharpAvailable = null; // Cache availability check
function getSharp() {
  if (sharpAvailable === false) {
    return null; // Already determined it's not available
  }
  
  if (!sharp) {
    try {
      sharp = require('sharp');
      sharpAvailable = true;
    } catch (error) {
      console.error('❌ Failed to load sharp module:', error.message);
      console.error('   Image compression will be disabled. This may be due to platform mismatch (macOS vs Linux).');
      sharpAvailable = false;
      return null;
    }
  }
  return sharp;
}

// Target size: 50KB
const TARGET_SIZE_BYTES = 50 * 1024; // 50KB

/**
 * Compress image buffer to under target size (default 50KB)
 * @param {Buffer} buffer - Image buffer
 * @param {number} targetSizeBytes - Target size in bytes (default 50KB)
 * @returns {Promise<Buffer>} Compressed image buffer
 */
async function compressImage(buffer, targetSizeBytes = TARGET_SIZE_BYTES) {
  try {
    const originalSize = buffer.length;
    
    // If already under target size, return original
    if (originalSize <= targetSizeBytes) {
      console.log(`✅ Image already under ${targetSizeBytes / 1024}KB (${(originalSize / 1024).toFixed(2)}KB)`);
      return buffer;
    }

    console.log(`📦 Compressing image from ${(originalSize / 1024).toFixed(2)}KB to under ${targetSizeBytes / 1024}KB...`);

    // Lazy-load sharp
    const sharpLib = getSharp();
    
    // If sharp is not available, return original buffer
    if (!sharpLib) {
      console.warn('⚠️  Sharp not available, returning original image without compression');
      return buffer;
    }

    // Detect image format
    const metadata = await sharpLib(buffer).metadata();
    const format = metadata.format; // 'jpeg', 'png', 'webp', etc.

    // Determine output format (prefer JPEG for better compression)
    let outputFormat = 'jpeg';
    let quality = 85;
    let maxWidth = 1920;
    let maxHeight = 1920;

    if (format === 'png') {
      outputFormat = 'png';
      quality = 90; // PNG uses compression level
    } else if (format === 'webp') {
      outputFormat = 'webp';
      quality = 85;
    }

    // Try to compress with different quality levels
    let compressedBuffer = buffer;
    let attempts = 0;
    const maxAttempts = 10;

    while (compressedBuffer.length > targetSizeBytes && attempts < maxAttempts) {
      attempts++;
      
      // Reduce quality progressively
      quality = Math.max(50, quality - 5);
      
      // Reduce dimensions if still too large
      if (attempts > 3) {
        maxWidth = Math.max(800, maxWidth - 200);
        maxHeight = Math.max(800, maxHeight - 200);
      }

      try {
        let sharpInstance = sharpLib(buffer)
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
        
        const compressedSize = compressedBuffer.length;
        console.log(`   Attempt ${attempts}: ${(compressedSize / 1024).toFixed(2)}KB (quality: ${quality}, size: ${maxWidth}x${maxHeight})`);
        
        // If we got it under target, break
        if (compressedSize <= targetSizeBytes) {
          console.log(`✅ Successfully compressed to ${(compressedSize / 1024).toFixed(2)}KB`);
          break;
        }
      } catch (err) {
        console.error(`   Error in compression attempt ${attempts}:`, err.message);
        // If compression fails, return the best we have
        if (attempts === 1) {
          return buffer; // Return original if first attempt fails
        }
        break; // Return last successful compression
      }
    }

    const finalSize = compressedBuffer.length;
    const compressionRatio = ((1 - finalSize / originalSize) * 100).toFixed(1);
    
    if (finalSize > targetSizeBytes) {
      console.log(`⚠️  Could not compress below ${targetSizeBytes / 1024}KB. Final size: ${(finalSize / 1024).toFixed(2)}KB (${compressionRatio}% reduction)`);
    } else {
      console.log(`✅ Compressed successfully: ${(originalSize / 1024).toFixed(2)}KB → ${(finalSize / 1024).toFixed(2)}KB (${compressionRatio}% reduction)`);
    }

    return compressedBuffer;
  } catch (error) {
    console.error('❌ Error compressing image:', error);
    // Return original buffer if compression fails
    return buffer;
  }
}

module.exports = {
  compressImage,
  TARGET_SIZE_BYTES
};

