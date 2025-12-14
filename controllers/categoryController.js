const CategoryImgKeywords = require('../models/CategoryImgKeywords');
const { uploadFileToS3 } = require('../utils/fileUpload');

class CategoryController {
  // Update category
  static async updateCategory(req, res) {
    try {
      const { id } = req.params;

      console.log(`\n${'='.repeat(80)}`);
      console.log(`🔄 [CATEGORY UPDATE] Starting update process for category ID: ${id}`);
      console.log(`${'='.repeat(80)}`);
      console.log(`📥 [REQUEST RECEIVED]`);
      console.log(`   Method: ${req.method}`);
      console.log(`   URL: ${req.originalUrl || req.url}`);
      console.log(`   Headers:`, {
        'content-type': req.headers['content-type'],
        'content-length': req.headers['content-length'],
        'user-agent': req.headers['user-agent']?.substring(0, 50) + '...'
      });

      // For multipart/form-data, body fields are available after multer processes the request
      const category_name = req.body?.category_name;
      const category_img = req.body?.category_img;

      if (!id) {
        console.error(`❌ [VALIDATION ERROR] Category ID is required`);
        return res.status(400).json({
          status: 'error',
          msg: 'Category ID is required',
          data: null
        });
      }

      console.log(`\n📋 [REQUEST DATA]`);
      console.log(`   Category ID: ${id}`);
      console.log(`   Request body keys:`, req.body ? Object.keys(req.body) : 'no body');
      console.log(`   Request body values:`, req.body ? {
        category_name: req.body.category_name || 'not provided',
        category_img: req.body.category_img ? `${req.body.category_img.substring(0, 50)}...` : 'not provided'
      } : 'no body');

      // Detailed file information
      if (req.file) {
        console.log(`\n�🔥🔥 [IMAGE UPLOAD DEBUG] 🔥🔥🔥`);
        console.log(`   👉 FILE RECEIVED: ${req.file.originalname}`);
        console.log(`   👉 SIZE: ${req.file.size} bytes`);
        console.log(`   👉 MIMETYPE: ${req.file.mimetype}`);
        console.log(`   👉 BUFFER LENGTH: ${req.file.buffer ? req.file.buffer.length : 0}`);
        console.log(`🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥\n`);

        console.log(`\n�📎 [FILE RECEIVED]`);
        console.log(`   ✅ File uploaded successfully!`);
        console.log(`   Original name: ${req.file.originalname}`);
        console.log(`   File size: ${req.file.size} bytes (${(req.file.size / 1024 / 1024).toFixed(2)} MB)`);
        console.log(`   MIME type: ${req.file.mimetype}`);
        console.log(`   Encoding: ${req.file.encoding || 'N/A'}`);
        console.log(`   Has buffer: ${!!req.file.buffer}`);
        console.log(`   Buffer size: ${req.file.buffer ? req.file.buffer.length : 0} bytes`);
        console.log(`   Buffer type: ${req.file.buffer ? req.file.buffer.constructor.name : 'N/A'}`);
      } else {
        console.log(`\n❄️❄️❄️ [IMAGE UPLOAD DEBUG] ❄️❄️❄️`);
        console.log(`   👉 NO FILE RECEIVED in req.file`);
        console.log(`   👉 Body keys: ${Object.keys(req.body || {}).join(', ')}`);
        console.log(`❄️❄️❄️❄️❄️❄️❄️❄️❄️❄️❄️❄️❄️❄️❄️❄️❄️❄️\n`);

        console.log(`\n📎 [FILE STATUS]`);
        console.log(`   ⚠️  No file uploaded`);
        console.log(`   Will use URL if provided: ${category_img ? 'Yes' : 'No'}`);
      }

      console.log(`   category_name:`, category_name || 'not provided');
      console.log(`   category_img URL:`, category_img ? `${category_img.substring(0, 80)}...` : 'not provided');

      const updateData = {};

      // Handle category name if provided
      if (category_name !== undefined && category_name !== null && category_name !== '') {
        updateData.category_name = String(category_name).trim();
      }

      // Store the new S3 URL here so we can use it in response (bypass database eventual consistency)
      let uploadedS3Url = null;

      // Handle file upload if provided
      if (req.file) {
        try {
          console.log(`\n📤 [S3 UPLOAD] Starting upload process...`);
          console.log(`   Category ID: ${id}`);
          console.log(`   File name: ${req.file.originalname}`);
          console.log(`   File size: ${req.file.size} bytes (${(req.file.size / 1024 / 1024).toFixed(2)} MB)`);
          console.log(`   MIME type: ${req.file.mimetype}`);
          console.log(`   Buffer ready: ${!!req.file.buffer}`);

          const uploadStartTime = Date.now();
          const s3Result = await uploadFileToS3(req.file, 'categories');
          const uploadDuration = Date.now() - uploadStartTime;

          const imageUrl = s3Result.s3Url;

          // Store the new S3 URL to use in response (bypass database eventual consistency)
          uploadedS3Url = imageUrl;

          console.log(`\n✅ [S3 UPLOAD SUCCESS]`);
          console.log(`   Upload duration: ${uploadDuration}ms`);
          console.log(`   S3 Key: ${s3Result.s3Key}`);
          console.log(`   S3 URL: ${imageUrl}`);
          console.log(`   URL length: ${imageUrl.length} characters`);
          console.log(`   Filename: ${s3Result.filename}`);
          console.log(`   💾 Stored new S3 URL for response: ${imageUrl.substring(0, 100)}...`);

          // Update both fields for consistency
          updateData.category_img = imageUrl;
          updateData.cat_img = imageUrl;

          console.log(`✅ Category image URL stored in update data`);
          console.log(`   💾 New S3 URL will be used in response: ${imageUrl.substring(0, 100)}...`);
        } catch (uploadError) {
          console.error(`\n❌ [S3 UPLOAD FAILED]`);
          console.error(`   Category ID: ${id}`);
          console.error(`   Error message: ${uploadError.message}`);
          console.error(`   Error name: ${uploadError.name}`);
          console.error(`   Error code: ${uploadError.code || 'N/A'}`);
          console.error(`   Error stack:`, uploadError.stack);
          console.error(`   File that failed:`, {
            originalname: req.file?.originalname,
            size: req.file?.size,
            mimetype: req.file?.mimetype,
            hasBuffer: !!req.file?.buffer
          });
          return res.status(500).json({
            status: 'error',
            msg: 'Failed to upload category image: ' + uploadError.message,
            data: null
          });
        }
      } else if (category_img !== undefined && category_img !== null && category_img !== '') {
        // If no file upload but URL provided, use the URL
        const imageUrl = String(category_img).trim();
        console.log(`\n📝 [USING PROVIDED URL]`);
        console.log(`   URL: ${imageUrl.substring(0, 100)}${imageUrl.length > 100 ? '...' : ''}`);
        console.log(`   URL length: ${imageUrl.length} characters`);
        // Update both fields for consistency
        updateData.category_img = imageUrl;
        updateData.cat_img = imageUrl;
        console.log(`✅ Using provided image URL (no file upload)`);
      }

      if (Object.keys(updateData).length === 0) {
        console.error(`\n❌ [VALIDATION ERROR] No fields to update`);
        return res.status(400).json({
          status: 'error',
          msg: 'No fields to update. Please provide category_name, category_image file, or category_img URL.',
          data: null
        });
      }

      console.log(`\n📝 [DATABASE UPDATE] Preparing to update category in DynamoDB...`);
      console.log(`   Category ID: ${id}`);
      console.log(`   Update data keys:`, Object.keys(updateData));
      console.log(`   Update data:`, {
        category_name: updateData.category_name || 'not updating',
        category_img: updateData.category_img ? `${updateData.category_img.substring(0, 80)}...` : 'not updating',
        cat_img: updateData.cat_img ? `${updateData.cat_img.substring(0, 80)}...` : 'not updating'
      });

      // Validate category ID is a number
      const categoryIdNum = parseInt(id);
      if (isNaN(categoryIdNum)) {
        console.error(`\n❌ [VALIDATION ERROR] Invalid category ID format`);
        console.error(`   Provided ID: ${id}`);
        console.error(`   Parsed as: ${categoryIdNum}`);
        return res.status(400).json({
          status: 'error',
          msg: 'Invalid category ID format',
          data: null
        });
      }

      console.log(`   Validated category ID: ${categoryIdNum} (number)`);

      const dbUpdateStartTime = Date.now();
      const result = await CategoryImgKeywords.update(categoryIdNum, updateData);
      const dbUpdateDuration = Date.now() - dbUpdateStartTime;

      console.log(`\n📊 [DATABASE UPDATE RESULT]`);
      console.log(`   Update duration: ${dbUpdateDuration}ms`);
      console.log(`   Affected rows: ${result.affectedRows}`);
      console.log(`   Success: ${result.affectedRows > 0 ? 'Yes' : 'No'}`);

      if (result.affectedRows === 0) {
        return res.status(404).json({
          status: 'error',
          msg: 'Category not found',
          data: null
        });
      }

      // Wait longer to ensure DynamoDB update is fully propagated before returning
      // DynamoDB eventual consistency can take a moment, especially after cache clear
      console.log(`\n⏳ [WAITING] Waiting for DynamoDB update to propagate...`);
      await new Promise(resolve => setTimeout(resolve, 2000)); // Increased to 2 seconds for better consistency
      console.log(`   ✅ Wait complete (2s) - proceeding with cache clear and verification`);

      // Clear Redis cache for category list to ensure updated image is shown
      try {
        const RedisCache = require('../utils/redisCache');
        // Use the same cache key format as categoryImgList
        const cacheKey = RedisCache.listKey('category_img_list', { version: 's3' });
        await RedisCache.delete(cacheKey);
        console.log(`✅ Redis cache cleared for category_img_list: ${cacheKey}`);

        // Also clear subcategories grouped cache since it uses category data
        const subcategoriesCacheKey = RedisCache.listKey('subcategories_grouped', {});
        await RedisCache.delete(subcategoriesCacheKey);
        console.log(`✅ Redis cache cleared for subcategories_grouped: ${subcategoriesCacheKey}`);
      } catch (cacheError) {
        console.warn('⚠️  Failed to clear Redis cache:', cacheError.message);
        // Continue even if cache clear fails
      }

      // Fetch updated category to verify the update - retry if needed
      let updatedCategory = null;
      let retries = 3;
      while (retries > 0 && !updatedCategory) {
        updatedCategory = await CategoryImgKeywords.findById(parseInt(id));
        if (!updatedCategory) {
          console.warn(`⚠️  Category not found, retrying... (${retries} attempts left)`);
          await new Promise(resolve => setTimeout(resolve, 200));
          retries--;
        }
      }

      if (updatedCategory) {
        console.log(`\n📋 [VERIFICATION] Successfully fetched updated category from database`);
        console.log(`   Category ID: ${updatedCategory?.id}`);
        // ... (logging continues)
      } else {
        console.error(`\n❌ [VERIFICATION FAILED]`);
        console.error(`   Failed to fetch updated category after 3 retries`);
        console.error(`   Category ID: ${id}`);

        // Construct fallback object if DB fetch fails but we have update data
        if (Object.keys(updateData).length > 0) {
          console.log(`   ⚠️  Creating fallback response object from update data`);
          updatedCategory = {
            id: parseInt(id),
            ...updateData,
            // Preserve existing values if we have them (we don't, but we have the new ones)
          };

          if (uploadedS3Url) {
            updatedCategory.category_img = uploadedS3Url;
            updatedCategory.cat_img = uploadedS3Url;
          }
        }
      }

      // Prepare response - ensure new S3 URL is used if file was uploaded
      // If database still has old URL (eventual consistency), use the new S3 URL we just uploaded
      if (updatedCategory && uploadedS3Url) {
        const dbUrl = updatedCategory.category_img || updatedCategory.cat_img || '';
        const isDbUrlOld = dbUrl && !dbUrl.includes('s3') && dbUrl.includes('app.scrapmate.co.in');

        console.log(`\n🔄 [RESPONSE FIX] Ensuring new S3 URL is used in response (bypassing database eventual consistency)`);
        console.log(`   Database URL: ${dbUrl.substring(0, 100)}${dbUrl.length > 100 ? '...' : ''}`);
        console.log(`   Database URL is old external URL: ${isDbUrlOld}`);
        console.log(`   New S3 URL (from upload): ${uploadedS3Url.substring(0, 100)}...`);

        // Always override with the new S3 URL we just uploaded
        updatedCategory.category_img = uploadedS3Url;
        updatedCategory.cat_img = uploadedS3Url;

        console.log(`   ✅ Response will use NEW S3 URL: ${uploadedS3Url.substring(0, 100)}...`);
        console.log(`   ✅ OLD URL removed from response`);
      }

      // Prepare response BEFORE logging
      const response = {
        status: 'success',
        msg: 'Category updated successfully',
        data: updatedCategory
      };

      const timestamp = new Date().toISOString();

      // Log all success information BEFORE sending response - FORCE IMMEDIATE OUTPUT
      console.log(`\n${'='.repeat(80)}`);
      console.log(`📤 [RESPONSE] ${timestamp} - Preparing success response...`);
      console.log(`   Response status: ${response.status}`);
      console.log(`   Response message: ${response.msg}`);
      console.log(`   Has data: ${!!response.data}`);

      if (response.data) {
        console.log(`   Data contains:`);
        console.log(`     - Category ID: ${response.data.id || 'N/A'}`);
        console.log(`     - Category Name: ${response.data.category_name || 'N/A'}`);
        console.log(`     - Has category_img: ${!!response.data.category_img}`);
        console.log(`     - Has cat_img: ${!!response.data.cat_img}`);
        if (response.data.category_img) {
          const imgUrl = response.data.category_img;
          console.log(`     - category_img URL: ${imgUrl.substring(0, Math.min(100, imgUrl.length))}${imgUrl.length > 100 ? '...' : ''}`);
          console.log(`     - category_img length: ${imgUrl.length} characters`);
          console.log(`     - Full category_img URL: ${imgUrl}`);
        }
        if (response.data.cat_img) {
          const catImgUrl = response.data.cat_img;
          console.log(`     - cat_img URL: ${catImgUrl.substring(0, Math.min(100, catImgUrl.length))}${catImgUrl.length > 100 ? '...' : ''}`);
          console.log(`     - cat_img length: ${catImgUrl.length} characters`);
          console.log(`     - Full cat_img URL: ${catImgUrl}`);
        }
      } else {
        console.log(`   ⚠️  WARNING: Response data is null or undefined!`);
      }

      console.log(`\n✅ [SUCCESS] ${timestamp} - Category update completed successfully!`);
      console.log(`   Category ID: ${id}`);
      console.log(`   Timestamp: ${timestamp}`);
      console.log(`   Response will be sent to client now...`);
      console.log(`${'='.repeat(80)}`);

      // CRITICAL: Force immediate output with multiple methods
      process.stdout.write('\n🚀 [FINAL] About to send response to client...\n\n');

      // Log the exact response object
      console.log(`📦 [RESPONSE OBJECT]`, JSON.stringify({
        status: response.status,
        msg: response.msg,
        hasData: !!response.data,
        dataKeys: response.data ? Object.keys(response.data) : [],
        timestamp: timestamp
      }, null, 2));

      // FINAL SUCCESS SUMMARY - This should ALWAYS be visible
      console.log(`\n`);
      console.log(`${'='.repeat(80)}`);
      console.log(`✅✅✅ SUCCESS: Category Update Completed ✅✅✅`);
      console.log(`${'='.repeat(80)}`);
      console.log(`   Timestamp: ${timestamp}`);
      console.log(`   Category ID: ${id}`);
      console.log(`   Status: ${response.status}`);
      console.log(`   Message: ${response.msg}`);
      console.log(`   Response Has Data: ${!!response.data}`);

      if (response.data) {
        console.log(`   ────────────────────────────────────────────────────────────────`);
        console.log(`   Response Data Details:`);
        console.log(`     • Category ID: ${response.data.id || 'N/A'}`);
        console.log(`     • Category Name: ${response.data.category_name || 'N/A'}`);
        console.log(`     • Has category_img: ${!!response.data.category_img}`);
        console.log(`     • Has cat_img: ${!!response.data.cat_img}`);

        if (response.data.category_img) {
          const imgUrl = response.data.category_img;
          console.log(`     • category_img URL (first 100 chars): ${imgUrl.substring(0, Math.min(100, imgUrl.length))}${imgUrl.length > 100 ? '...' : ''}`);
          console.log(`     • category_img full length: ${imgUrl.length} characters`);
          console.log(`     • category_img FULL URL: ${imgUrl}`);
        }

        if (response.data.cat_img) {
          const catImgUrl = response.data.cat_img;
          console.log(`     • cat_img URL (first 100 chars): ${catImgUrl.substring(0, Math.min(100, catImgUrl.length))}${catImgUrl.length > 100 ? '...' : ''}`);
          console.log(`     • cat_img full length: ${catImgUrl.length} characters`);
          console.log(`     • cat_img FULL URL: ${catImgUrl}`);
        }
      } else {
        console.log(`   ⚠️  WARNING: Response data is null or undefined!`);
      }

      console.log(`${'='.repeat(80)}`);
      console.log(`🚀 Sending JSON response to client now...`);
      console.log(`${'='.repeat(80)}\n`);

      // Force immediate output flush
      if (typeof process !== 'undefined' && process.stdout) {
        process.stdout.write(`\n[SUCCESS LOG COMPLETE - RESPONSE BEING SENT]\n\n`);
      }

      // Send the response
      return res.json(response);
    } catch (err) {
      console.error(`\n${'='.repeat(80)}`);
      console.error(`❌ [CATEGORY UPDATE ERROR] Unexpected error occurred!`);
      console.error(`${'='.repeat(80)}`);
      console.error(`   Category ID: ${id}`);
      console.error(`   Error name: ${err.name || 'N/A'}`);
      console.error(`   Error message: ${err.message || 'N/A'}`);
      console.error(`   Error code: ${err.code || 'N/A'}`);
      console.error(`   Error stack:`, err.stack);
      console.error(`   Error details:`, {
        name: err.name,
        message: err.message,
        code: err.code,
        statusCode: err.statusCode,
        requestId: err.requestId
      });
      console.error(`${'='.repeat(80)}\n`);

      return res.status(500).json({
        status: 'error',
        msg: 'Error updating category: ' + err.message,
        data: null
      });
    }
  }
}

module.exports = CategoryController;

