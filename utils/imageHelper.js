const { getS3Url } = require('./s3Upload');

/**
 * Convert local image path to S3 presigned URL
 * If already an S3 URL or external URL, return as-is
 * If local path, try to convert to S3 presigned URL
 * If S3 file doesn't exist, return original URL or empty string
 */
async function getImageUrl(imagePath, type = 'images') {
  if (!imagePath) {
    return '';
  }
  
  // If already a full URL, check if it's an S3 URL
  if (imagePath.startsWith('http://') || imagePath.startsWith('https://')) {
    // Check if it's an S3 URL (scrapmate-images.s3 or s3.amazonaws.com)
    if (imagePath.includes('scrapmate-images.s3') || imagePath.includes('s3.amazonaws.com')) {
      // Extract S3 key from URL
      // URL format: https://scrapmate-images.s3.ap-south-1.amazonaws.com/orders/1754394361115.jpg
      // or: https://scrapmate-images.s3.ap-south-1.amazonaws.com/orders/1754394361115.jpg?query
      const urlMatch = imagePath.match(/\/orders\/([^?]+)/) || 
                       imagePath.match(/\/categories\/([^?]+)/) ||
                       imagePath.match(/\/profile\/([^?]+)/) ||
                       imagePath.match(/\/shops\/([^?]+)/) ||
                       imagePath.match(/\/deliveryboy\/([^?]+)/) ||
                       imagePath.match(/\/images\/([^?]+)/);
      
      if (urlMatch) {
        // Determine folder from URL path
        let folder = 'images';
        if (imagePath.includes('/orders/')) {
          folder = 'orders';
        } else if (imagePath.includes('/categories/')) {
          folder = 'categories';
        } else if (imagePath.includes('/profile/')) {
          folder = 'profile';
        } else if (imagePath.includes('/shops/')) {
          folder = 'shops';
        } else if (imagePath.includes('/deliveryboy/')) {
          folder = 'deliveryboy';
        } else {
          // Use type parameter if folder not found in URL
          if (type === 'order') folder = 'orders';
          else if (type === 'category') folder = 'categories';
          else if (type === 'profile') folder = 'profile';
          else if (type === 'shop') folder = 'shops';
          else if (type === 'deliveryboy') folder = 'deliveryboy';
        }
        
        const filename = urlMatch[1];
        const s3Key = `${folder}/${filename}`;
        
        // Generate presigned URL
        const s3Url = await getS3Url(s3Key);
        return s3Url || imagePath; // Fallback to original if presigned URL generation fails
      }
      
      // If S3 URL but couldn't extract key, return as-is (might be presigned already)
      return imagePath;
    }
    
    // External URL (not S3), return as-is
    return imagePath;
  }
  
  // Extract filename from local path
  const filename = imagePath.split('/').pop();
  
  // Determine S3 folder based on type or path
  let folder = 'images';
  if (imagePath.includes('profile') || type === 'profile') {
    folder = 'profile';
  } else if (imagePath.includes('shop') || type === 'shop') {
    folder = 'shops';
  } else if (imagePath.includes('deliveryboy') || type === 'deliveryboy') {
    folder = 'deliveryboy';
  } else if (imagePath.includes('category') || type === 'category') {
    folder = 'categories';
  } else if (imagePath.includes('order') || type === 'order') {
    folder = 'orders';
  }
  
  // Try to get S3 presigned URL
  const s3Url = await getS3Url(`${folder}/${filename}`);
  
  // If S3 URL is empty (file doesn't exist), return original path or empty
  // This allows fallback to original URLs stored in DynamoDB
  return s3Url || imagePath;
}

/**
 * Format image URLs in an object (async)
 */
async function formatImageUrls(data, imageFields) {
  if (!data || !imageFields) {
    return data;
  }
  
  const formatted = { ...data };
  
  for (const field of imageFields) {
    if (formatted[field]) {
      // Determine type from field name
      let type = 'images';
      if (field.includes('profile')) {
        type = 'profile';
      } else if (field.includes('shop')) {
        type = 'shop';
      } else if (field.includes('delivery') || field.includes('licence')) {
        type = 'deliveryboy';
      } else if (field.includes('cat')) {
        type = 'category';
      } else if (field.includes('image') || field.includes('order')) {
        type = 'order';
      }
      
      formatted[field] = await getImageUrl(formatted[field], type);
    }
  }
  
  return formatted;
}

module.exports = {
  getImageUrl,
  formatImageUrls
};

