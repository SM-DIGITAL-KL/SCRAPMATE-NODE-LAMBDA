const CategoryImgKeywords = require('../models/CategoryImgKeywords');
const Subcategory = require('../models/Subcategory');
const RedisCache = require('../utils/redisCache');
const { resolveRequestZone } = require('../utils/zoneRequestScope');
const { filterCategoriesForZone, filterSubcategoriesForZone } = require('../utils/zoneCategoryScope');

/**
 * V2 Category Controller
 * Provides categories and subcategories with B2B/B2C availability information
 */

class V2CategoryController {
  /**
   * Get all categories with B2B/B2C availability
   * GET /api/v2/categories
   * Query params: 
   *   - userType: 'b2b' | 'b2c' | 'all' (optional, filters by availability)
   */
  static async getCategories(req, res) {
    const startTime = Date.now();
    try {
      console.log('📋 [V2 Categories API] Request received');
      console.log('   Query params:', req.query);
      const { userType } = req.query;
      const requestZone = await resolveRequestZone(req, { allowQueryZone: true });
      const shouldUseCache = !requestZone;
      
      // Check Redis cache first
      const cacheKey = requestZone
        ? RedisCache.listKey('categories', { userType: userType || 'all', zone: requestZone })
        : RedisCache.listKey('categories', { userType: userType || 'all' });
      if (shouldUseCache) {
        try {
          const cached = await RedisCache.get(cacheKey);
          if (cached !== null && cached !== undefined) {
            console.log('⚡ Categories cache hit');
            const duration = Date.now() - startTime;
            console.log(`✅ [V2 Categories API] Cache hit - returned in ${duration}ms`);
            return res.json({
              ...cached,
              hitBy: 'Redis'
            });
          }
        } catch (err) {
          console.error('Redis get error:', err);
        }
      }
      
      // Get all categories
      console.log('🔍 [V2 Categories API] Fetching categories from DynamoDB...');
      const categories = filterCategoriesForZone(await CategoryImgKeywords.getAll(), requestZone);
      console.log(`✅ [V2 Categories API] Found ${categories.length} categories`);
      
      // Get B2B/B2C availability from cache (optimized - no full table scan)
      console.log('🔍 [V2 Categories API] Getting shop availability from cache...');
      const { hasB2B, hasB2C } = await V2CategoryController._getShopAvailability();
      console.log(`✅ [V2 Categories API] Shop availability - B2B: ${hasB2B}, B2C: ${hasB2C}`);
      
      // Format categories with B2B/B2C info and fresh presigned URLs
      const { getS3Url } = require('../utils/s3Upload');
      const formattedCategories = await Promise.all(categories.map(async (category) => {
        let imageUrl = category.category_img || category.cat_img || '';
        
        // Generate fresh presigned URL for S3 images to avoid expired URLs
        // Only convert to presigned URL if it's already a presigned URL (has query params)
        // Direct S3 URLs (without query params) are kept as-is for public access
        if (imageUrl && imageUrl.includes('scrapmate-images.s3')) {
          const isPresignedUrl = imageUrl.includes('X-Amz-Signature') || imageUrl.includes('X-Amz-Algorithm');
          
          if (isPresignedUrl) {
            try {
              // Extract S3 key from URL (works for both base URLs and presigned URLs)
              let urlMatch = imageUrl.match(/\/categories\/([^?\/]+)/);
              
              if (urlMatch && urlMatch[1]) {
                const filename = urlMatch[1];
                const s3Key = `categories/${filename}`;
                
                // Generate fresh presigned URL (1 hour expiration)
                const freshUrl = await getS3Url(s3Key, 3600);
                if (freshUrl) {
                  imageUrl = freshUrl;
                }
              }
            } catch (urlError) {
              console.warn(`   ⚠️  [V2 Categories API] Error generating presigned URL for category ${category.id}:`, urlError.message);
              // Continue with original URL if presigned URL generation fails
            }
          } else {
            // Direct S3 URL - keep as-is (assumes public access)
            console.log(`   ✅ [V2 Categories API] Direct S3 URL detected for category ${category.id}, keeping as-is`);
          }
        }
        
        return {
          id: category.id,
          name: category.category_name || category.cat_name || '',
          image: imageUrl,
          available_in: {
            b2b: hasB2B, // Available if B2B shops exist
            b2c: hasB2C  // Available if B2C shops exist
          },
          created_at: category.created_at,
          updated_at: category.updated_at
        };
      }));
      
      // Filter by userType if specified
      let filteredCategories = formattedCategories;
      if (userType === 'b2b') {
        filteredCategories = formattedCategories.filter(cat => cat.available_in.b2b);
        console.log(`🔍 [V2 Categories API] Filtered to ${filteredCategories.length} B2B categories`);
      } else if (userType === 'b2c') {
        filteredCategories = formattedCategories.filter(cat => cat.available_in.b2c);
        console.log(`🔍 [V2 Categories API] Filtered to ${filteredCategories.length} B2C categories`);
      }
      
      const duration = Date.now() - startTime;
      console.log(`✅ [V2 Categories API] Successfully returned ${filteredCategories.length} categories in ${duration}ms`);
      
      const response = {
        status: 'success',
        msg: 'Categories retrieved successfully',
        data: filteredCategories,
        meta: {
          total: filteredCategories.length,
          b2b_available: formattedCategories.filter(c => c.available_in.b2b).length,
          b2c_available: formattedCategories.filter(c => c.available_in.b2c).length
        },
        hitBy: 'DynamoDB'
      };

      // Cache the result (cache for 1 hour - categories don't change often)
      if (shouldUseCache) {
        console.log(`💾 [V2 Categories API] Attempting to cache with key: ${cacheKey}`);
        try {
          const setResult = await RedisCache.set(cacheKey, response, 'static');
          console.log(`💾 [V2 Categories API] Cache set result: ${setResult ? 'SUCCESS ✅' : 'FAILED ❌'}`);
          if (!setResult) {
            console.error('⚠️  [V2 Categories API] Cache set returned false - check Redis connection');
          }
        } catch (err) {
          console.error('❌ [V2 Categories API] Redis cache set error:', err);
          console.error('   Error message:', err.message);
          console.error('   Error stack:', err.stack);
        }
      }
      
      return res.json(response);
    } catch (err) {
      const duration = Date.now() - startTime;
      console.error('❌ [V2 Categories API] Error fetching categories:', err);
      console.error('   Error message:', err.message);
      console.error('   Error stack:', err.stack);
      console.error(`   Failed after ${duration}ms`);
      return res.status(500).json({
        status: 'error',
        msg: 'Error fetching categories: ' + err.message,
        data: null
      });
    }
  }

  /**
   * Get all subcategories with B2B/B2C availability
   * GET /api/v2/subcategories
   * Query params:
   *   - categoryId: filter by main category ID (optional)
   *   - userType: 'b2b' | 'b2c' | 'all' (optional, filters by availability)
   */
  static async getSubcategories(req, res) {
    try {
      const { categoryId, userType } = req.query;
      const requestZone = await resolveRequestZone(req, { allowQueryZone: true });
      const shouldUseCache = !requestZone;
      
      // Check Redis cache first
      const cacheKey = RedisCache.listKey('subcategories', { 
        categoryId: categoryId || 'all',
        userType: userType || 'all',
        ...(requestZone ? { zone: requestZone } : {})
      });
      if (shouldUseCache) {
        try {
          const cached = await RedisCache.get(cacheKey);
          if (cached !== null && cached !== undefined) {
            console.log('⚡ Subcategories cache hit');
            return res.json({
              ...cached,
              hitBy: 'Redis'
            });
          }
        } catch (err) {
          console.error('Redis get error:', err);
        }
      }
      
      // Get subcategories (only approved ones for regular users)
      // Admins can use includePending=true query param to see pending requests
      const includePending = req.query.includePending === 'true' && req.user?.isAdmin;
      let subcategoriesRaw;
      if (categoryId) {
        subcategoriesRaw = await Subcategory.findByMainCategoryId(categoryId, includePending);
      } else {
        subcategoriesRaw = await Subcategory.getAll(includePending);
      }
      
      // Get main categories for enrichment
      const categories = filterCategoriesForZone(await CategoryImgKeywords.getAll(), requestZone);
      const allowedCategoryIds = new Set(categories.map(cat => cat.id));
      const subcategories = filterSubcategoriesForZone(subcategoriesRaw, requestZone, allowedCategoryIds);
      const categoryMap = {};
      categories.forEach(cat => {
        categoryMap[cat.id] = {
          id: cat.id,
          name: cat.category_name || cat.cat_name || '',
          image: cat.category_img || cat.cat_img || ''
        };
      });
      
      // Get B2B/B2C availability from cache (optimized - no full table scan)
      const { hasB2B, hasB2C } = await V2CategoryController._getShopAvailability();
      
      // Format subcategories with B2B/B2C info
      const formattedSubcategories = subcategories.map(sub => {
        const mainCategory = categoryMap[sub.main_category_id] || null;
        
        return {
          id: sub.id,
          name: sub.subcategory_name || '',
          image: sub.subcategory_img || '',
          default_price: sub.default_price || '',
          price_unit: sub.price_unit || 'kg',
          main_category_id: sub.main_category_id,
          main_category: mainCategory,
          available_in: {
            b2b: hasB2B, // Available if B2B shops exist
            b2c: hasB2C  // Available if B2C shops exist
          },
          created_at: sub.created_at,
          updated_at: sub.updated_at
        };
      });
      
      // Filter by userType if specified
      let filteredSubcategories = formattedSubcategories;
      if (userType === 'b2b') {
        filteredSubcategories = formattedSubcategories.filter(sub => sub.available_in.b2b);
      } else if (userType === 'b2c') {
        filteredSubcategories = formattedSubcategories.filter(sub => sub.available_in.b2c);
      }
      
      const response = {
        status: 'success',
        msg: 'Subcategories retrieved successfully',
        data: filteredSubcategories,
        meta: {
          total: filteredSubcategories.length,
          b2b_available: formattedSubcategories.filter(s => s.available_in.b2b).length,
          b2c_available: formattedSubcategories.filter(s => s.available_in.b2c).length,
          category_id: categoryId || null
        },
        hitBy: 'DynamoDB'
      };

      // Cache the result (cache for 1 hour - subcategories don't change often)
      if (shouldUseCache) {
        try {
          await RedisCache.set(cacheKey, response, 'static');
          console.log('💾 Subcategories cached');
        } catch (err) {
          console.error('Redis cache set error:', err);
        }
      }
      
      return res.json(response);
    } catch (err) {
      console.error('❌ Error fetching subcategories:', err);
      return res.status(500).json({
        status: 'error',
        msg: 'Error fetching subcategories: ' + err.message,
        data: null
      });
    }
  }

  /**
   * Get categories with their subcategories grouped
   * GET /api/v2/categories/with-subcategories
   * Query params:
   *   - userType: 'b2b' | 'b2c' | 'all' (optional, filters by availability)
   */
  static async getCategoriesWithSubcategories(req, res) {
    try {
      const { userType } = req.query;
      const requestZone = await resolveRequestZone(req, { allowQueryZone: true });
      const shouldUseCache = !requestZone;
      
      // Check Redis cache first
      const cacheKey = RedisCache.listKey('categories_with_subcategories', { 
        userType: userType || 'all',
        ...(requestZone ? { zone: requestZone } : {})
      });
      if (shouldUseCache) {
        try {
          const cached = await RedisCache.get(cacheKey);
          if (cached !== null && cached !== undefined) {
            console.log('⚡ Categories with subcategories cache hit');
            return res.json({
              ...cached,
              hitBy: 'Redis'
            });
          }
        } catch (err) {
          console.error('Redis get error:', err);
        }
      }
      
      // Get all categories and subcategories
      const categories = filterCategoriesForZone(await CategoryImgKeywords.getAll(), requestZone);
      const allowedCategoryIds = new Set(categories.map(cat => cat.id));
      const subcategories = filterSubcategoriesForZone(await Subcategory.getAll(), requestZone, allowedCategoryIds);
      
      // Get B2B/B2C availability from cache (optimized - no full table scan)
      const { hasB2B, hasB2C } = await V2CategoryController._getShopAvailability();
      
      // Group subcategories by main category
      const subcategoriesByCategory = {};
      subcategories.forEach(sub => {
        const catId = sub.main_category_id;
        if (!subcategoriesByCategory[catId]) {
          subcategoriesByCategory[catId] = [];
        }
        subcategoriesByCategory[catId].push({
          id: sub.id,
          name: sub.subcategory_name || '',
          image: sub.subcategory_img || '',
          default_price: sub.default_price || '',
          price_unit: sub.price_unit || 'kg',
          available_in: {
            b2b: hasB2B,
            b2c: hasB2C
          },
          created_at: sub.created_at,
          updated_at: sub.updated_at
        });
      });
      
      // Format categories with their subcategories
      const formattedCategories = categories.map(category => {
        const imageUrl = category.category_img || category.cat_img || '';
        const categorySubcategories = subcategoriesByCategory[category.id] || [];
        
        // Filter subcategories by userType if specified
        let filteredSubcategories = categorySubcategories;
        if (userType === 'b2b') {
          filteredSubcategories = categorySubcategories.filter(sub => sub.available_in.b2b);
        } else if (userType === 'b2c') {
          filteredSubcategories = categorySubcategories.filter(sub => sub.available_in.b2c);
        }
        
        return {
          id: category.id,
          name: category.category_name || category.cat_name || '',
          image: imageUrl,
          available_in: {
            b2b: hasB2B,
            b2c: hasB2C
          },
          subcategories: filteredSubcategories,
          subcategory_count: filteredSubcategories.length,
          created_at: category.created_at,
          updated_at: category.updated_at
        };
      });
      
      // Filter categories by userType if specified
      let filteredCategories = formattedCategories;
      if (userType === 'b2b') {
        filteredCategories = formattedCategories.filter(cat => cat.available_in.b2b);
      } else if (userType === 'b2c') {
        filteredCategories = formattedCategories.filter(cat => cat.available_in.b2c);
      }
      
      // Sort by category name
      filteredCategories.sort((a, b) => a.name.localeCompare(b.name));
      
      const response = {
        status: 'success',
        msg: 'Categories with subcategories retrieved successfully',
        data: filteredCategories,
        meta: {
          total_categories: filteredCategories.length,
          total_subcategories: filteredCategories.reduce((sum, cat) => sum + cat.subcategory_count, 0),
          b2b_available: formattedCategories.filter(c => c.available_in.b2b).length,
          b2c_available: formattedCategories.filter(c => c.available_in.b2c).length
        },
        hitBy: 'DynamoDB'
      };

      // Cache the result (cache for 1 hour - categories don't change often)
      if (shouldUseCache) {
        try {
          await RedisCache.set(cacheKey, response, 'static');
          console.log('💾 Categories with subcategories cached');
        } catch (err) {
          console.error('Redis cache set error:', err);
        }
      }
      
      return res.json(response);
    } catch (err) {
      console.error('❌ Error fetching categories with subcategories:', err);
      return res.status(500).json({
        status: 'error',
        msg: 'Error fetching categories with subcategories: ' + err.message,
        data: null
      });
    }
  }

  /**
   * Get incremental updates for categories and subcategories
   * GET /api/v2/categories/incremental-updates
   * Query params:
   *   - userType: 'b2b' | 'b2c' | 'all' (optional)
   *   - lastUpdatedOn: ISO timestamp string (optional, if not provided returns all)
   */
  static async getIncrementalUpdates(req, res) {
    try {
      const { userType, lastUpdatedOn, userId, type = 'customer' } = req.query;
      const requestZone = await resolveRequestZone(req, { allowQueryZone: true });
      
      console.log(`\n🔄 [getIncrementalUpdates] Request received:`);
      console.log(`   userType: ${userType || 'all'}`);
      console.log(`   lastUpdatedOn: ${lastUpdatedOn || 'not provided (will return all)'}`);
      console.log(`   userId: ${userId || 'not provided (stats will not be included)'}`);
      console.log(`   type: ${type || 'customer'}`);
      
      // If lastUpdatedOn is provided, log the comparison window
      if (lastUpdatedOn) {
        const lastUpdatedDate = new Date(lastUpdatedOn);
        const bufferedDate = new Date(lastUpdatedDate.getTime() - 30000); // 30 second buffer
        console.log(`   📅 Timestamp comparison window:`);
        console.log(`      Original: ${lastUpdatedOn}`);
        console.log(`      Buffered (30s): ${bufferedDate.toISOString()}`);
        console.log(`      Will find categories with updated_at > ${bufferedDate.toISOString()}`);
      }
      
      // Get updated categories and subcategories
      const updatedCategories = filterCategoriesForZone(
        await CategoryImgKeywords.getUpdatedAfter(lastUpdatedOn),
        requestZone,
        { includeDeleted: true }
      );
      const visibleCategories = filterCategoriesForZone(
        await CategoryImgKeywords.getAll(),
        requestZone,
        { includeDeleted: true }
      );
      const allowedCategoryIds = new Set(visibleCategories.map(cat => cat.id));
      const updatedSubcategories = filterSubcategoriesForZone(
        await Subcategory.getUpdatedAfter(lastUpdatedOn),
        requestZone,
        allowedCategoryIds,
        { includeDeleted: true }
      );
      
      console.log(`📊 [getIncrementalUpdates] Found updates:`);
      console.log(`   Categories: ${updatedCategories.length}`);
      console.log(`   Subcategories: ${updatedSubcategories.length}`);
      
      // If no updates found but lastUpdatedOn was provided, log recent categories for debugging
      if (updatedCategories.length === 0 && lastUpdatedOn) {
        console.log(`   ⚠️  No categories found. Checking recent categories for debugging...`);
        try {
          const allCategories = await CategoryImgKeywords.getAll();
          const recentCategories = allCategories
            .filter(cat => {
              if (!cat.updated_at) return false;
              const catUpdated = new Date(cat.updated_at);
              const lastUpdated = new Date(lastUpdatedOn);
              return catUpdated > lastUpdated;
            })
            .slice(0, 5) // Show top 5 recent
            .map(cat => ({
              id: cat.id,
              name: cat.category_name || cat.cat_name || 'N/A',
              updated_at: cat.updated_at,
              image: cat.category_img || cat.cat_img ? 'has image' : 'no image'
            }));
          
          if (recentCategories.length > 0) {
            console.log(`   📋 Recent categories (updated after lastUpdatedOn):`, recentCategories);
          } else {
            console.log(`   ℹ️  No categories found with updated_at > ${lastUpdatedOn}`);
          }
        } catch (debugError) {
          console.warn(`   ⚠️  Could not fetch recent categories for debugging:`, debugError.message);
        }
      }
      
      // Get B2B/B2C availability from cache (optimized - no full table scan)
      const { hasB2B, hasB2C } = await V2CategoryController._getShopAvailability();
      
      // Format updated categories with fresh presigned URLs
      const { getS3Url } = require('../utils/s3Upload');
      const formattedCategories = await Promise.all(updatedCategories.map(async (category) => {
        let imageUrl = category.category_img || category.cat_img || '';
        
        // Generate fresh presigned URL for S3 images to avoid expired URLs
        // Only convert to presigned URL if it's already a presigned URL (has query params) or if bucket is private
        // If it's a direct S3 URL (no query params), keep it as-is
        if (imageUrl && imageUrl.includes('scrapmate-images.s3')) {
          const isPresignedUrl = imageUrl.includes('X-Amz-Signature') || imageUrl.includes('X-Amz-Algorithm');
          
          // Only generate presigned URL if the current URL is already presigned (expired) or if we need private access
          // Direct S3 URLs (without query params) are kept as-is for public access
          if (isPresignedUrl) {
            try {
              // Extract S3 key from URL (works for both base URLs and presigned URLs)
              let urlMatch = imageUrl.match(/\/categories\/([^?\/]+)/);
              if (!urlMatch) {
                urlMatch = imageUrl.match(/\/subcategories\/([^?\/]+)/);
              }
              
              if (urlMatch && urlMatch[1]) {
                const filename = urlMatch[1];
                // Determine folder based on URL path
                const folder = imageUrl.includes('/categories/') ? 'categories' : 'subcategories';
                const s3Key = `${folder}/${filename}`;
                
                console.log(`   🔄 [Incremental Updates] Generating fresh presigned URL for category ${category.id}`);
                console.log(`      S3 Key: ${s3Key}`);
                
                // Generate fresh presigned URL (1 hour expiration)
                const freshUrl = await getS3Url(s3Key, 3600);
                if (freshUrl) {
                  imageUrl = freshUrl;
                  console.log(`      ✅ Fresh presigned URL generated`);
                } else {
                  console.warn(`      ⚠️  Failed to generate presigned URL, using original URL`);
                }
              }
            } catch (urlError) {
              console.warn(`   ⚠️  [Incremental Updates] Error generating presigned URL for category ${category.id}:`, urlError.message);
              // Continue with original URL if presigned URL generation fails
            }
          } else {
            // Direct S3 URL - keep as-is (assumes public access)
            console.log(`   ✅ [Incremental Updates] Direct S3 URL detected for category ${category.id}, keeping as-is`);
          }
        }
        
        return {
          id: category.id,
          name: category.category_name || category.cat_name || '',
          image: imageUrl,
          available_in: {
            b2b: hasB2B,
            b2c: hasB2C
          },
          created_at: category.created_at,
          updated_at: category.updated_at,
          deleted: category.deleted || false
        };
      }));
      
      // Format updated subcategories with fresh presigned URLs
      const formattedSubcategories = await Promise.all(updatedSubcategories.map(async (sub) => {
        let imageUrl = sub.subcategory_img || '';
        
        // Generate fresh presigned URL for S3 images to avoid expired URLs
        // Only convert to presigned URL if it's already a presigned URL (has query params)
        // Direct S3 URLs (without query params) are kept as-is for public access
        if (imageUrl && imageUrl.includes('scrapmate-images.s3')) {
          const isPresignedUrl = imageUrl.includes('X-Amz-Signature') || imageUrl.includes('X-Amz-Algorithm');
          
          if (isPresignedUrl) {
            try {
              // Extract S3 key from URL
              const urlMatch = imageUrl.match(/\/subcategories\/([^?\/]+)/);
              
              if (urlMatch && urlMatch[1]) {
                const filename = urlMatch[1];
                const s3Key = `subcategories/${filename}`;
                
                console.log(`   🔄 [Incremental Updates] Generating fresh presigned URL for subcategory ${sub.id}`);
                console.log(`      S3 Key: ${s3Key}`);
                
                // Generate fresh presigned URL (1 hour expiration)
                const freshUrl = await getS3Url(s3Key, 3600);
                if (freshUrl) {
                  imageUrl = freshUrl;
                  console.log(`      ✅ Fresh presigned URL generated`);
                } else {
                  console.warn(`      ⚠️  Failed to generate presigned URL, using original URL`);
                }
              }
            } catch (urlError) {
              console.warn(`   ⚠️  [Incremental Updates] Error generating presigned URL for subcategory ${sub.id}:`, urlError.message);
              // Continue with original URL if presigned URL generation fails
            }
          } else {
            // Direct S3 URL - keep as-is (assumes public access)
            console.log(`   ✅ [Incremental Updates] Direct S3 URL detected for subcategory ${sub.id}, keeping as-is`);
          }
        }
        
        return {
          id: sub.id,
          name: sub.subcategory_name || '',
          image: imageUrl,
          default_price: sub.default_price || '',
          price_unit: sub.price_unit || 'kg',
          main_category_id: sub.main_category_id,
          available_in: {
            b2b: hasB2B,
            b2c: hasB2C
          },
          created_at: sub.created_at,
          updated_at: sub.updated_at,
          deleted: sub.deleted || false
        };
      }));
      
      // Separate deleted items from updated items
      const deletedCategories = formattedCategories.filter(cat => cat.deleted).map(cat => ({ id: cat.id, deleted: true }));
      const deletedSubcategories = formattedSubcategories.filter(sub => sub.deleted).map(sub => ({ id: sub.id, deleted: true }));
      const activeCategories = formattedCategories.filter(cat => !cat.deleted);
      const activeSubcategories = formattedSubcategories.filter(sub => !sub.deleted);
      
      // Filter by userType if specified (only for active items)
      let filteredCategories = activeCategories;
      let filteredSubcategories = activeSubcategories;
      
      if (userType === 'b2b') {
        filteredCategories = activeCategories.filter(cat => cat.available_in.b2b);
        filteredSubcategories = activeSubcategories.filter(sub => sub.available_in.b2b);
      } else if (userType === 'b2c') {
        filteredCategories = activeCategories.filter(cat => cat.available_in.b2c);
        filteredSubcategories = activeSubcategories.filter(sub => sub.available_in.b2c);
      }
      
      // Get current timestamp for lastUpdatedOn
      const currentTimestamp = new Date().toISOString();
      
      // Fetch user stats if userId is provided (from Redis cache or calculate on-the-fly)
      let userStats = null;
      if (userId) {
        try {
          const userIdNum = parseInt(userId);
          const userTypeForStats = type || 'customer'; // customer, shop, or delivery
          
          console.log(`📊 [getIncrementalUpdates] Fetching user stats for userId: ${userIdNum}, type: ${userTypeForStats}`);
          
          // Try to get stats from Redis cache (they're cached by the recycling and earnings controllers)
          const recyclingCacheKey = RedisCache.userKey(userIdNum, `recycling_stats_${userTypeForStats}`);
          const earningsCacheKey = RedisCache.userKey(userIdNum, `earnings_monthly_${userTypeForStats}_6`);
          
          try {
            let recyclingData = await RedisCache.get(recyclingCacheKey);
            let earningsData = await RedisCache.get(earningsCacheKey);
            
            // If stats not in cache, calculate them on-the-fly by directly calling the calculation logic
            if (!recyclingData) {
              console.log(`📊 [getIncrementalUpdates] Recycling stats not in cache, calculating on-the-fly...`);
              try {
                const Order = require('../models/Order');
                // Directly calculate recycling stats for customer
                if (userTypeForStats === 'customer') {
                  const allOrders = await Order.findByCustomerId(userIdNum);
                  const completedOrders = allOrders.filter(order => order.status === 5);
                  
                  // Calculate basic stats
                  let totalRecycledWeight = 0;
                  for (const order of completedOrders) {
                    const orderWeight = parseFloat(order.estim_weight || 0);
                    totalRecycledWeight += orderWeight;
                  }
                  
                  recyclingData = {
                    total_orders_completed: completedOrders.length,
                    total_recycled_weight_kg: parseFloat(totalRecycledWeight.toFixed(2)),
                    total_carbon_offset_kg: 0,
                    category_breakdown: [],
                    monthly_breakdown: [],
                    trees_equivalent: 0,
                    cars_off_road_days: 0
                  };
                  
                  // Cache the calculated stats
                  await RedisCache.set(recyclingCacheKey, recyclingData, 'long');
                  console.log(`✅ [getIncrementalUpdates] Recycling stats calculated:`, recyclingData);
                }
              } catch (calcError) {
                console.warn(`⚠️ [getIncrementalUpdates] Error calculating recycling stats:`, calcError.message);
                recyclingData = {
                  total_orders_completed: 0,
                  total_recycled_weight_kg: 0,
                  total_carbon_offset_kg: 0
                };
              }
            }
            
            if (!earningsData) {
              console.log(`📊 [getIncrementalUpdates] Earnings stats not in cache, calculating on-the-fly...`);
              try {
                const Order = require('../models/Order');
                // Directly calculate earnings stats for customer
                if (userTypeForStats === 'customer') {
                  const allOrders = await Order.findByCustomerId(userIdNum);
                  const completedOrders = allOrders.filter(order => order.status === 5);
                  
                  // Calculate total earnings
                  let totalEarnings = 0;
                  for (const order of completedOrders) {
                    const earnings = parseFloat(order.estim_price || 0);
                    totalEarnings += earnings;
                  }
                  
                  earningsData = {
                    totalOrders: completedOrders.length,
                    totalEarnings: parseFloat(totalEarnings.toFixed(2)),
                    monthlyBreakdown: [],
                    currency: 'INR',
                    period: 'Last 6 months'
                  };
                  
                  // Cache the calculated stats
                  await RedisCache.set(earningsCacheKey, earningsData, 'long');
                  console.log(`✅ [getIncrementalUpdates] Earnings stats calculated:`, earningsData);
                }
              } catch (calcError) {
                console.warn(`⚠️ [getIncrementalUpdates] Error calculating earnings stats:`, calcError.message);
                earningsData = {
                  totalOrders: 0,
                  totalEarnings: 0
                };
              }
            }
            
            // Build stats from available data (always include stats, even if zero)
            userStats = {
              totalOrders: recyclingData?.total_orders_completed || earningsData?.totalOrders || 0,
              totalEarned: earningsData?.totalEarnings || 0,
              totalRecycled: recyclingData?.total_recycled_weight_kg || 0
            };
            console.log(`✅ [getIncrementalUpdates] User stats prepared:`, userStats);
          } catch (cacheError) {
            console.warn(`⚠️ [getIncrementalUpdates] Error fetching/calculating stats:`, cacheError.message);
            // Return zero stats on error
            userStats = {
              totalOrders: 0,
              totalEarned: 0,
              totalRecycled: 0
            };
          }
        } catch (statsError) {
          console.warn(`⚠️ [getIncrementalUpdates] Error processing user stats:`, statsError.message);
          // Return zero stats on error
          userStats = {
            totalOrders: 0,
            totalEarned: 0,
            totalRecycled: 0
          };
        }
      }
      
      // Always include stats in response if userId was provided
      const responseData = {
        categories: filteredCategories,
        subcategories: filteredSubcategories,
        deleted: {
          categories: deletedCategories,
          subcategories: deletedSubcategories
        }
      };
      
      // Always include stats if userId was provided (even if zero)
      if (userId) {
        responseData.stats = userStats || {
          totalOrders: 0,
          totalEarned: 0,
          totalRecycled: 0
        };
      }
      
      const response = {
        status: 'success',
        msg: 'Incremental updates retrieved successfully',
        data: responseData,
        meta: {
          categories_count: filteredCategories.length,
          subcategories_count: filteredSubcategories.length,
          deleted_categories_count: deletedCategories.length,
          deleted_subcategories_count: deletedSubcategories.length,
          lastUpdatedOn: currentTimestamp,
          hasUpdates: filteredCategories.length > 0 || filteredSubcategories.length > 0 || deletedCategories.length > 0 || deletedSubcategories.length > 0
        },
        hitBy: 'DynamoDB'
      };
      
      return res.json(response);
    } catch (err) {
      console.error('❌ Error fetching incremental updates:', err);
      return res.status(500).json({
        status: 'error',
        msg: 'Error fetching incremental updates: ' + err.message,
        data: null
      });
    }
  }

  /**
   * Helper method to get all shops
   * @private
   */
  /**
   * Get shop availability (B2B/B2C) from cache
   * OPTIMIZED: Uses cached shop type counts instead of scanning entire table
   * Cache is refreshed every 5 minutes or when shops are updated
   * @returns {Promise<{hasB2B: boolean, hasB2C: boolean}>}
   */
  static async _getShopAvailability() {
    const cacheKey = 'shop_availability:b2b_b2c';
    
    try {
      // Check Redis cache first
      const cached = await RedisCache.get(cacheKey);
      if (cached !== null && cached !== undefined) {
        console.log('⚡ [Shop Availability] Cache hit - returning cached availability');
        return cached;
      }
    } catch (err) {
      console.warn('⚠️  [Shop Availability] Redis cache get error:', err.message);
    }
    
    // Cache miss - scan shops table ONCE and cache the result
    console.log('🔍 [Shop Availability] Cache miss - scanning shops table...');
    try {
      const { getDynamoDBClient } = require('../config/dynamodb');
      const { ScanCommand } = require('@aws-sdk/lib-dynamodb');
      const client = getDynamoDBClient();
      
      let lastKey = null;
      let b2bCount = 0;
      let b2cCount = 0;
      const b2bShopTypes = [1, 4]; // Industrial, Wholesaler
      const b2cShopTypes = [3]; // Retailer
      const maxIterations = 100;
      let iterations = 0;
      
      // Only scan for shop_type and del_status to minimize read capacity
      do {
        const params = {
          TableName: 'shops',
          ProjectionExpression: 'shop_type, del_status' // Only fetch needed attributes
        };
        
        if (lastKey) {
          params.ExclusiveStartKey = lastKey;
        }
        
        const command = new ScanCommand(params);
        const response = await client.send(command);
        
        if (response.Items) {
          // Count shops by type (only active shops: del_status = 1)
          response.Items.forEach(shop => {
            if (shop.del_status === 1) {
              if (b2bShopTypes.includes(shop.shop_type)) {
                b2bCount++;
              }
              if (b2cShopTypes.includes(shop.shop_type)) {
                b2cCount++;
              }
            }
          });
        }
        
        lastKey = response.LastEvaluatedKey;
        iterations++;
        
        if (iterations >= maxIterations) {
          console.warn('⚠️  [Shop Availability] Reached max iterations');
          break;
        }
      } while (lastKey);
      
      const result = {
        hasB2B: b2bCount > 0,
        hasB2C: b2cCount > 0
      };
      
      console.log(`✅ [Shop Availability] Scanned shops - B2B: ${b2bCount}, B2C: ${b2cCount}`);
      
      // Cache the result for 5 minutes (300 seconds)
      // This balances freshness with performance - shop availability doesn't change frequently
      try {
        await RedisCache.set(cacheKey, result, 300); // 5 minutes
        console.log('💾 [Shop Availability] Cached availability for 5 minutes');
      } catch (cacheErr) {
        console.warn('⚠️  [Shop Availability] Failed to cache result:', cacheErr.message);
      }
      
      return result;
    } catch (err) {
      console.error('❌ [Shop Availability] Error scanning shops:', err);
      // Return default values on error (assume both available to prevent breaking the API)
      return { hasB2B: true, hasB2C: true };
    }
  }

  /**
   * @deprecated Use _getShopAvailability() instead - this method scans entire table
   * Kept for backward compatibility but should not be used
   */
  static async _getAllShops() {
    console.warn('⚠️  [V2 Categories API] _getAllShops() is deprecated - use _getShopAvailability() instead');
    // Return empty array to prevent errors, but log warning
    return [];
  }

  /**
   * Refresh image URL for a category or subcategory
   * POST /api/v2/categories/refresh-image
   * Body: { categoryId?: number, subcategoryId?: number }
   * Returns: { image: string (fresh presigned URL) }
   */
  static async refreshImage(req, res) {
    try {
      const { categoryId, subcategoryId } = req.body;
      
      if (!categoryId && !subcategoryId) {
        return res.status(400).json({
          status: 'error',
          msg: 'Either categoryId or subcategoryId must be provided',
          data: null
        });
      }

      const { getS3Url } = require('../utils/s3Upload');
      let imageUrl = '';
      let entityType = '';
      let entityId = null;

      if (categoryId) {
        // Get category from DynamoDB
        const category = await CategoryImgKeywords.findById(categoryId);
        if (!category) {
          return res.status(404).json({
            status: 'error',
            msg: `Category with ID ${categoryId} not found`,
            data: null
          });
        }
        
        imageUrl = category.category_img || category.cat_img || '';
        entityType = 'category';
        entityId = categoryId;
      } else if (subcategoryId) {
        // Get subcategory from DynamoDB
        const subcategory = await Subcategory.findById(subcategoryId);
        if (!subcategory) {
          return res.status(404).json({
            status: 'error',
            msg: `Subcategory with ID ${subcategoryId} not found`,
            data: null
          });
        }
        
        imageUrl = subcategory.subcategory_img || '';
        entityType = 'subcategory';
        entityId = subcategoryId;
      }

      if (!imageUrl) {
        return res.json({
          status: 'success',
          msg: 'No image URL found for this entity',
          data: {
            image: '',
            entityType,
            entityId
          }
        });
      }

      // Extract S3 key from URL
      // URL format: https://scrapmate-images.s3.ap-south-1.amazonaws.com/categories/1765259344519-214985317.png
      // or presigned URL with query params
      let s3Key = '';
      const urlMatch = imageUrl.match(/\/categories\/([^?]+)/) || 
                       imageUrl.match(/\/subcategories\/([^?]+)/);
      
      if (urlMatch && urlMatch[1]) {
        const filename = urlMatch[1];
        // Determine folder based on entity type
        const folder = entityType === 'category' ? 'categories' : 'subcategories';
        s3Key = `${folder}/${filename}`;
      } else {
        // Try to extract from full S3 URL path
        const fullUrlMatch = imageUrl.match(/scrapmate-images\.s3[^\/]+\/([^?]+)/);
        if (fullUrlMatch && fullUrlMatch[1]) {
          s3Key = fullUrlMatch[1];
        }
      }

      if (!s3Key) {
        console.warn(`⚠️ [Refresh Image] Could not extract S3 key from URL: ${imageUrl.substring(0, 100)}...`);
        return res.json({
          status: 'success',
          msg: 'Could not extract S3 key from existing URL',
          data: {
            image: imageUrl, // Return original URL
            entityType,
            entityId
          }
        });
      }

      console.log(`🔄 [Refresh Image] Generating fresh presigned URL for ${entityType} ID ${entityId}`);
      console.log(`   S3 Key: ${s3Key}`);
      console.log(`   Original URL: ${imageUrl.substring(0, 150)}...`);
      
      // Generate fresh presigned URL (1 hour expiration)
      const freshImageUrl = await getS3Url(s3Key, 3600);
      
      if (!freshImageUrl) {
        console.error(`❌ [Refresh Image] Failed to generate presigned URL for ${s3Key}`);
        // Return original URL if presigned URL generation fails
        return res.json({
          status: 'success',
          msg: 'Could not generate fresh presigned URL, returning original URL',
          data: {
            image: imageUrl,
            entityType,
            entityId,
            expiresIn: 0
          }
        });
      }

      console.log(`✅ [Refresh Image] Fresh presigned URL generated for ${entityType} ID ${entityId}`);
      console.log(`   Fresh URL: ${freshImageUrl.substring(0, 150)}...`);
      
      return res.json({
        status: 'success',
        msg: 'Image URL refreshed successfully',
        data: {
          image: freshImageUrl,
          entityType,
          entityId,
          expiresIn: 3600 // 1 hour in seconds
        }
      });
    } catch (err) {
      console.error('❌ Error refreshing image:', err);
      return res.status(500).json({
        status: 'error',
        msg: 'Error refreshing image: ' + err.message,
        data: null
      });
    }
  }

}

module.exports = V2CategoryController;
