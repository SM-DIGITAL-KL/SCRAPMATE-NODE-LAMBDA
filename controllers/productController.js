const ProductCategory = require('../models/ProductCategory');
const Product = require('../models/Product');
const path = require('path');
const fs = require('fs');
const { getFileSize, deleteFile } = require('../utils/fileUpload');
const RedisCache = require('../utils/redisCache');
const { getImageUrl } = require('../utils/imageHelper');

class ProductController {
  // Shop category create
  static async shopCatCreate(req, res) {
    try {
      const { shop_id, cat_name, cat_img } = req.body;

      if (!shop_id || !cat_name) {
        return res.status(201).json({
          status: 'error',
          msg: 'empty param',
          data: ''
        });
      }

      const catNames = cat_name.split(',');
      const catImgs = cat_img ? cat_img.split(',') : [];

      const createdCategories = [];

      for (let i = 0; i < catNames.length; i++) {
        const category = await ProductCategory.create({
          shop_id: shop_id,
          cat_name: catNames[i].trim(),
          cat_img: catImgs[i] || '',
          filesize: ''
        });
        createdCategories.push(category);
      }

      const allCategories = await ProductCategory.findByShopId(shop_id);

      // Invalidate shop category list cache
      try {
        await RedisCache.delete(RedisCache.listKey('shop_categories', { shop_id }));
        console.log(`🗑️  Invalidated shop category cache for shop_id: ${shop_id}`);
      } catch (redisErr) {
        console.error('Redis cache invalidation error:', redisErr);
      }

      res.status(200).json({
        status: 'success',
        msg: 'Shop category created',
        data: { data: allCategories }
      });
    } catch (err) {
      console.error('Shop category create error:', err);
      
      // Log failed job (DynamoDB doesn't have failed_jobs table)
      try {
        console.error('Failed job:', {
          connection: 'shop_cat_create',
          queue: 'default',
          payload: req.body,
          exception: err.message,
          timestamp: new Date().toISOString()
        });
      } catch (logErr) {
        console.error('Failed to log failed job:', logErr);
      }

      res.status(201).json({
        status: 'error',
        msg: err.message,
        data: ''
      });
    }
  }

  // Shop category edit
  static async shopCatEdit(req, res) {
    try {
      const { category_id, cat_name } = req.body;
      const catImg = req.file;

      if (!category_id) {
        return res.status(201).json({
          status: 'error',
          msg: 'empty param',
          data: ''
        });
      }

      const productCat = await ProductCategory.findById(category_id);
      if (!productCat) {
        return res.status(201).json({
          status: 'error',
          msg: 'Category not found',
          data: ''
        });
      }

      const updateData = {};
      if (cat_name) {
        updateData.cat_name = cat_name;
      }

      if (catImg) {
        // Delete old image
        if (productCat.cat_img) {
          const oldImagePath = path.join(__dirname, '../public/assets/images/product_category', productCat.cat_img);
          deleteFile(oldImagePath);
        }

        const filename = catImg.filename;
        const filePath = path.join(__dirname, '../public/assets/images/product_category', filename);
        const fileSize = getFileSize(filePath);

        updateData.cat_img = filename;
        updateData.filesize = fileSize;
      }

      await ProductCategory.update(category_id, updateData);

      const updatedCategory = await ProductCategory.findById(category_id);

      // Invalidate category and shop category list cache
      try {
        await RedisCache.delete(RedisCache.categoryKey(category_id));
        if (productCat.shop_id) {
          await RedisCache.delete(RedisCache.listKey('shop_categories', { shop_id: productCat.shop_id }));
        }
        console.log(`🗑️  Invalidated category cache for category_id: ${category_id}`);
      } catch (redisErr) {
        console.error('Redis cache invalidation error:', redisErr);
      }

      res.json({
        status: 'success',
        msg: 'Shop category updated',
        data: updatedCategory
      });
    } catch (err) {
      console.error('Shop category edit error:', err);
      res.status(201).json({
        status: 'error',
        msg: 'Update failed',
        data: ''
      });
    }
  }

  // Shop category delete
  static async shopCatDelete(req, res) {
    try {
      const { id } = req.params;

      if (!id) {
        return res.status(201).json({
          status: 'error',
          msg: 'empty param',
          data: ''
        });
      }

      const category = await ProductCategory.findById(id);
      if (!category) {
        return res.status(404).json({
          status: 'error',
          msg: 'Category not found',
          data: ''
        });
      }

      // Check if products exist in this category
      const productCount = await Product.countByCategoryId(id);
      if (productCount > 0) {
        return res.json({
          status: 'success',
          msg: 'Cant Delete . Products Added Under This Category',
          data: ''
        });
      }

      await ProductCategory.delete(id);

      // Invalidate category and shop category list cache
      try {
        await RedisCache.delete(RedisCache.categoryKey(id));
        if (category.shop_id) {
          await RedisCache.delete(RedisCache.listKey('shop_categories', { shop_id: category.shop_id }));
        }
        console.log(`🗑️  Invalidated category cache for category_id: ${id}`);
      } catch (redisErr) {
        console.error('Redis cache invalidation error:', redisErr);
      }

      res.json({
        status: 'success',
        msg: 'Successfully Deleted',
        data: ''
      });
    } catch (err) {
      console.error('Shop category delete error:', err);
      res.status(201).json({
        status: 'error',
        msg: 'Delete failed',
        data: ''
      });
    }
  }

  // All product categories
  static async allProCategory(req, res) {
    try {
      console.log(`🔍 all_pro_category called`);
      const { shop_id } = req.query;
      console.log(`   shop_id: ${shop_id}`);

      // Check Redis cache first (only if previously successful)
      const cacheKey = RedisCache.listKey('all_pro_categories', { shop_id: shop_id || 'all' });
      const cached = await RedisCache.get(cacheKey);
      if (cached) {
        console.log(`⚡ Redis cache hit for all pro categories: ${cacheKey}`);
        return res.json({
          status: 'success',
          msg: 'success',
          data: cached
        });
      }

      // Use CategoryImgKeywords model to fetch from DynamoDB
      const CategoryImgKeywords = require('../models/CategoryImgKeywords');
      console.log(`🔎 Fetching all categories from DynamoDB`);
      let allCategories = await CategoryImgKeywords.getAll();
      console.log(`✅ Found ${allCategories.length} category(ies) in DynamoDB`);

      // If shop_id is provided, filter out categories already used by this shop
      if (shop_id) {
        try {
          // Get categories already used by this shop
          const usedCategories = await ProductCategory.findByShopId(shop_id);
          const usedCatNames = usedCategories.map(c => c.cat_name);
          console.log(`   Shop ${shop_id} already uses ${usedCatNames.length} categories:`, usedCatNames);
          
          // Filter out used categories
          allCategories = allCategories.filter(cat => {
            const catName = cat.cat_name || cat.category_name || '';
            return !usedCatNames.includes(catName);
          });
          console.log(`   After filtering: ${allCategories.length} available categories`);
        } catch (filterErr) {
          console.error('Error filtering categories by shop:', filterErr);
          // Continue with all categories if filtering fails
        }
      }

      // Format image URLs to ensure they point to S3 (with presigned URLs)
      // getImageUrl is already imported at the top of the file
      const categoryList = await Promise.all(allCategories.map(async (cat) => {
        let catImg = '';
        
        // Prefer cat_img field, fallback to category_img
        const imageUrl = cat.cat_img || cat.category_img || '';
        
        if (imageUrl) {
          // Use getImageUrl helper which handles both S3 and external URLs
          catImg = await getImageUrl(imageUrl, 'category');
        }

        return {
          id: cat.id,
          cat_name: cat.cat_name || cat.category_name || '',
          cat_img: catImg || '',
          category_img: catImg || '',
          keywords: cat.keywords || cat.keyword || ''
        };
      }));

      console.log(`✅ Returning ${categoryList.length} formatted categories`);

      // Cache the result only on success (365 days TTL)
      try {
        await RedisCache.set(cacheKey, categoryList, '365days');
        console.log(`💾 Redis cache set for all pro categories: ${cacheKey}`);
      } catch (redisErr) {
        console.error('Redis cache error:', redisErr);
        // Continue even if Redis fails
      }

      res.json({
        status: 'success',
        msg: 'success',
        data: categoryList
      });
    } catch (err) {
      console.error('All product category error:', err);
      console.error('Error stack:', err.stack);
      res.status(201).json({
        status: 'error',
        msg: `Failed to fetch categories: ${err.message}`,
        data: ''
      });
    }
  }

  // Category image list
  static async categoryImgList(req, res) {
    try {
      console.log(`🔍 category_img_list called`);
      
      // Check if cache should be bypassed (via clear_cache or bypass_cache parameter)
      const bypassCache = req.query.clear_cache === '1' || req.query.bypass_cache === '1' || req.query.clear_cache === 'true' || req.query.bypass_cache === 'true';

      // Define cache key outside the if block so it's available for setting cache later
      const cacheKey = RedisCache.listKey('category_img_list', { version: 's3' });

      // Check Redis cache first (only if previously successful and not bypassed)
      // Include version to bust old cache entries that used non-S3 URLs
      if (!bypassCache) {
        const cached = await RedisCache.get(cacheKey);
        if (cached) {
          console.log(`⚡ Redis cache hit for category img list: ${cacheKey}`);
          return res.json({
            status: 'success',
            msg: 'Category image list',
            data: cached
          });
        }
      } else {
        console.log(`🔄 Cache bypass requested - fetching fresh data from DynamoDB`);
      }

      const CategoryImgKeywords = require('../models/CategoryImgKeywords');
      console.log(`🔎 Fetching category image keywords from DynamoDB`);
      const categories = await CategoryImgKeywords.getAll();
      console.log(`✅ Found ${categories.length} category image keyword(s)`);

      // Format image URLs to ensure they point to S3 (with presigned URLs)
      // Convert S3 URLs to presigned URLs for secure access
      console.log(`\n${'='.repeat(80)}`);
      console.log(`🖼️  [PROCESSING CATEGORY IMAGES] Starting to process ${categories.length} categories...`);
      console.log(`${'='.repeat(80)}\n`);
      
      const categoryList = await Promise.all(categories.map(async (cat, index) => {
        let catImg = '';
        
        console.log(`\n📦 [CATEGORY ${index + 1}/${categories.length}]`);
        console.log(`   ID: ${cat.id}`);
        console.log(`   Name: ${cat.category_name || 'N/A'}`);
        
        // Prefer cat_img field, fallback to category_img
        const imageUrl = cat.cat_img || cat.category_img || '';
        
        console.log(`   Raw cat_img: ${cat.cat_img || 'N/A'}`);
        console.log(`   Raw category_img: ${cat.category_img || 'N/A'}`);
        console.log(`   Using imageUrl: ${imageUrl || 'N/A'}`);
        
        if (imageUrl) {
          console.log(`   Image URL length: ${imageUrl.length} characters`);
          console.log(`   Image URL preview: ${imageUrl.substring(0, Math.min(100, imageUrl.length))}${imageUrl.length > 100 ? '...' : ''}`);
          
          // Validate URL - allow external URLs and S3 URLs
          const isExternalUrl = imageUrl.startsWith('http://') || imageUrl.startsWith('https://');
          const isS3Url = imageUrl.includes('scrapmate-images.s3') || imageUrl.includes('s3.amazonaws.com');
          const hasValidLength = imageUrl.length >= 10; // Minimum reasonable URL length
          
          // IMPORTANT: Check if URL is already a presigned S3 URL
          // If it already has presigned parameters, use it as-is - don't generate a new one!
          const isAlreadyPresigned = imageUrl.includes('X-Amz-Signature') || imageUrl.includes('X-Amz-Algorithm');
          
          // Check for incomplete/corrupted URLs - only reject if URL is too short or not a valid HTTP(S) URL
          // Allow all valid HTTP(S) URLs, whether S3 or external
          if (!hasValidLength || !isExternalUrl) {
            console.warn(`   ⚠️  Invalid URL detected - skipping`);
            console.warn(`      URL: ${imageUrl}`);
            console.warn(`      Reason: ${!hasValidLength ? 'URL too short' : 'Not a valid HTTP(S) URL'}`);
            catImg = '';
          } else {
            // If it's an S3 URL
            if (isS3Url) {
              // IMPORTANT: Always generate a fresh presigned URL for S3 URLs
              // Presigned URLs expire after 1 hour - always generate fresh one to avoid expired URLs
              // This works for both base S3 URLs and existing presigned URLs
              
              if (isAlreadyPresigned) {
                console.log(`   ⚠️  Presigned URL detected in database - will generate fresh one`);
                console.log(`      Reason: Presigned URLs expire after 1 hour - need fresh URL for current request`);
              } else {
                console.log(`   ✅ Detected S3 URL (base URL) - will generate presigned URL`);
              }
              
              // Extract S3 key from URL (works for both base URLs and presigned URLs)
              // The filename is before the query parameters, so this works for both
              let urlMatch = imageUrl.match(/\/categories\/([^?\/]+)/);
              if (!urlMatch) {
                // Try category-images folder
                urlMatch = imageUrl.match(/\/category-images\/([^?\/]+)/);
              }
              if (!urlMatch && imageUrl.includes('/cate')) {
                // Handle truncated URLs - try to find any filename after /cate
                const truncatedMatch = imageUrl.match(/\/cate[^\/]*\/([^?\/]+)/);
                if (truncatedMatch) {
                  urlMatch = truncatedMatch;
                }
              }
              
              if (urlMatch && urlMatch[1] && urlMatch[1].length > 0) {
                const filename = urlMatch[1];
                console.log(`   ✅ Extracted filename: ${filename}`);
                
                // Validate filename has extension
                if (filename.includes('.') && filename.length > 4) {
                  // Use categories folder for consistency
                  const s3Key = `categories/${filename}`;
                  console.log(`   📁 S3 Key: ${s3Key}`);
                  console.log(`   🔑 Generating fresh presigned URL (valid for 1 hour)...`);
                  
                  // Generate fresh presigned URL (always generate new one, don't reuse expired ones)
                  const { getS3Url } = require('../utils/s3Upload');
                  catImg = await getS3Url(s3Key, 3600); // 1 hour expiration
                  
                  // If presigned URL generation failed, return empty to show "No Image"
                  if (!catImg) {
                    console.warn(`   ❌ Failed to generate presigned URL for ${s3Key}`);
                    console.warn(`      This might mean the file doesn't exist in S3`);
                    catImg = '';
                  } else {
                    console.log(`   ✅ Fresh presigned URL generated: ${catImg.substring(0, 100)}...`);
                    console.log(`      URL length: ${catImg.length} characters`);
                  }
                } else {
                  console.warn(`   ❌ Invalid filename: ${filename} (no extension or too short)`);
                  catImg = '';
                }
              } else {
                console.warn(`   ⚠️  Could not extract filename from S3 URL`);
                console.warn(`      URL: ${imageUrl.substring(0, 150)}...`);
                // If we can't extract, try using the URL as-is (might be a direct S3 URL)
                if (imageUrl.length > 50 && imageUrl.includes('http')) {
                  console.log(`   📝 Fallback: Using URL as-is (cannot extract S3 key)`);
                  catImg = imageUrl;
                } else {
                  console.warn(`   ❌ URL is also invalid - skipping`);
                  catImg = '';
                }
              }
            } else {
              // External URL (not S3) - use as-is
              console.log(`   🌐 External URL detected - using URL as-is`);
              console.log(`      URL is valid external URL, no processing needed`);
              catImg = imageUrl; // External URLs are used directly
              console.log(`   ✅ Using external URL: ${catImg.substring(0, Math.min(100, catImg.length))}${catImg.length > 100 ? '...' : ''}`);
            }
          }
        } else {
          console.log(`   ⚠️  No image URL found for this category`);
        }

        const finalCategory = {
          ...cat,
          category_img: catImg || '',
          cat_img: catImg || ''
        };
        
        console.log(`   ✅ Final category_img: ${finalCategory.category_img ? finalCategory.category_img.substring(0, 80) + '...' : 'EMPTY'}`);
        console.log(`   ✅ Final cat_img: ${finalCategory.cat_img ? finalCategory.cat_img.substring(0, 80) + '...' : 'EMPTY'}`);
        
        return finalCategory;
      }));

      // Summary of all category images
      console.log(`\n${'='.repeat(80)}`);
      console.log(`📊 [SUMMARY] All Category Images Processed`);
      console.log(`${'='.repeat(80)}`);
      console.log(`   Total categories: ${categoryList.length}`);
      
      let withImages = 0;
      let withoutImages = 0;
      let s3Images = 0;
      let externalImages = 0;
      let presignedS3Images = 0;
      let baseS3Images = 0;
      let expiredImages = 0;
      
      categoryList.forEach((cat, index) => {
        const hasImage = !!(cat.category_img || cat.cat_img);
        if (hasImage) {
          withImages++;
          const imgUrl = cat.category_img || cat.cat_img;
          if (imgUrl.includes('scrapmate-images.s3') || imgUrl.includes('s3.amazonaws.com')) {
            s3Images++;
            if (imgUrl.includes('X-Amz-Signature') || imgUrl.includes('X-Amz-Algorithm')) {
              presignedS3Images++;
            } else {
              baseS3Images++;
            }
          } else {
            externalImages++;
          }
        } else {
          withoutImages++;
        }
        
        const imagePreview = hasImage ? (cat.category_img || cat.cat_img) : 'NONE';
        const isPresigned = imagePreview.includes('X-Amz-Signature') || imagePreview.includes('X-Amz-Algorithm');
        const imageType = !hasImage ? 'NONE' : 
                         isPresigned ? 'PRESIGNED_S3' :
                         imagePreview.includes('scrapmate-images.s3') || imagePreview.includes('s3.amazonaws.com') ? 'BASE_S3' :
                         'EXTERNAL';
        
        console.log(`   ${index + 1}. ${cat.category_name || 'N/A'} (ID: ${cat.id}) [${imageType}]`);
        if (hasImage) {
          console.log(`      Image: ${imagePreview.substring(0, 100)}${imagePreview.length > 100 ? '...' : ''}`);
          if (isPresigned) {
            // Extract expiration info from presigned URL
            const expiresMatch = imagePreview.match(/X-Amz-Expires=(\d+)/);
            const dateMatch = imagePreview.match(/X-Amz-Date=(\d{8}T\d{6}Z)/);
            if (expiresMatch && dateMatch) {
              const expiresIn = parseInt(expiresMatch[1]);
              const dateStr = dateMatch[1];
              console.log(`      Presigned URL expires in: ${expiresIn} seconds (from ${dateStr})`);
            }
          }
        } else {
          console.log(`      Image: NONE`);
        }
      });
      
      console.log(`\n   📈 Statistics:`);
      console.log(`   - Total categories: ${categoryList.length}`);
      console.log(`   - Categories with images: ${withImages} (${((withImages/categoryList.length)*100).toFixed(1)}%)`);
      console.log(`   - Categories without images: ${withoutImages} (${((withoutImages/categoryList.length)*100).toFixed(1)}%)`);
      console.log(`   - S3 images (total): ${s3Images}`);
      console.log(`     • Presigned S3 URLs: ${presignedS3Images}`);
      console.log(`     • Base S3 URLs: ${baseS3Images}`);
      console.log(`   - External images: ${externalImages}`);
      console.log(`${'='.repeat(80)}\n`);

      // Cache the result only on success (1 hour TTL)
      try {
        await RedisCache.set(cacheKey, categoryList, '365days');
        console.log(`💾 Redis cache set for category img list: ${cacheKey}`);
      } catch (redisErr) {
        console.error(`\n❌ Redis cache error:`, redisErr.message);
        console.error(`   Error details:`, {
          name: redisErr.name,
          message: redisErr.message,
          stack: redisErr.stack
        });
        // Continue even if Redis fails
      }

      console.log(`\n✅ [SUCCESS] Returning category image list to client`);
      console.log(`   Total categories in response: ${categoryList.length}\n`);

      res.json({
        status: 'success',
        msg: 'Category image list',
        data: categoryList
      });
    } catch (err) {
      console.error('Category image list error:', err);
      console.error('Error stack:', err.stack);
      res.status(201).json({
        status: 'error',
        msg: `Failed to fetch categories: ${err.message}`,
        data: ''
      });
    }
  }

  // Shop item create
  static async shopItemCreate(req, res) {
    try {
      const { shop_id, cat_id, name, amout, description, price, image } = req.body;

      if (!shop_id || !cat_id || !name || !amout) {
        return res.status(201).json({
          status: 'error',
          msg: 'empty param',
          data: ''
        });
      }

      const item = await Product.create({
        shop_id: shop_id,
        cat_id: cat_id,
        name: name,
        description: description || '',
        price: price || amout,
        image: image || '',
        filesize: ''
      });

      const createdItem = await Product.findById(item.id);

      // Invalidate product and shop item list cache
      try {
        await RedisCache.delete(RedisCache.productKey(item.id));
        await RedisCache.delete(RedisCache.listKey('shop_items', { shop_id }));
        if (cat_id) {
          await RedisCache.delete(RedisCache.listKey('shop_items', { shop_id, cat_id }));
        }
        console.log(`🗑️  Invalidated product cache for shop_id: ${shop_id}`);
      } catch (redisErr) {
        console.error('Redis cache invalidation error:', redisErr);
      }

      res.json({
        status: 'success',
        msg: 'Item Add Successfully',
        data: createdItem
      });
    } catch (err) {
      console.error('Shop item create error:', err);
      res.status(201).json({
        status: 'error',
        msg: 'Failed to create item',
        data: ''
      });
    }
  }

  // Shop item edit
  static async shopItemEdit(req, res) {
    try {
      const { id } = req.params;
      const { name, amout, description, price } = req.body;

      if (!id) {
        return res.status(201).json({
          status: 'error',
          msg: 'empty param',
          data: ''
        });
      }

      const item = await Product.findById(id);
      if (!item) {
        return res.status(201).json({
          status: 'error',
          msg: 'Not Found',
          data: ''
        });
      }

      const updateData = {};
      if (name) updateData.name = name;
      if (amout) updateData.price = amout;
      if (description) updateData.description = description;
      if (price) updateData.price = price;

      await Product.update(id, updateData);

      const updatedItem = await Product.findById(id);

      // Invalidate product and shop item list cache
      try {
        await RedisCache.delete(RedisCache.productKey(id));
        if (item.shop_id) {
          await RedisCache.delete(RedisCache.listKey('shop_items', { shop_id: item.shop_id }));
          if (item.cat_id) {
            await RedisCache.delete(RedisCache.listKey('shop_items', { shop_id: item.shop_id, cat_id: item.cat_id }));
          }
        }
        console.log(`🗑️  Invalidated product cache for product_id: ${id}`);
      } catch (redisErr) {
        console.error('Redis cache invalidation error:', redisErr);
      }

      res.json({
        status: 'success',
        msg: 'Updated Successfully',
        data: updatedItem
      });
    } catch (err) {
      console.error('Shop item edit error:', err);
      res.status(201).json({
        status: 'error',
        msg: 'Update failed',
        data: ''
      });
    }
  }

  // Shop item delete
  static async shopItemDelete(req, res) {
    try {
      const { id } = req.params;

      if (!id) {
        return res.status(201).json({
          status: 'error',
          msg: 'empty param',
          data: ''
        });
      }

      const result = await Product.delete(id);

      if (result.affectedRows > 0) {
        // Invalidate product and shop item list cache
        try {
          const product = await Product.findById(id);
          if (product) {
            await RedisCache.delete(RedisCache.productKey(id));
            if (product.shop_id) {
              await RedisCache.delete(RedisCache.listKey('shop_items', { shop_id: product.shop_id }));
              if (product.cat_id) {
                await RedisCache.delete(RedisCache.listKey('shop_items', { shop_id: product.shop_id, cat_id: product.cat_id }));
              }
            }
            console.log(`🗑️  Invalidated product cache for product_id: ${id}`);
          }
        } catch (redisErr) {
          console.error('Redis cache invalidation error:', redisErr);
        }

        res.json({
          status: 'success',
          msg: 'Deleted Successfully',
          data: []
        });
      } else {
        res.status(201).json({
          status: 'error',
          msg: 'Not Found',
          data: ''
        });
      }
    } catch (err) {
      console.error('Shop item delete error:', err);
      res.status(201).json({
        status: 'error',
        msg: 'Delete failed',
        data: ''
      });
    }
  }

  // Shop item list
  static async shopItemList(req, res) {
    try {
      const { shop_id, cat_id } = req.params;

      if (!shop_id) {
        return res.status(201).json({
          status: 'error',
          msg: 'empty param',
          data: ''
        });
      }

      // Check Redis cache first (only if previously successful)
      const cacheKey = RedisCache.listKey('shop_items', { shop_id, cat_id: cat_id || 'all' });
      const cached = await RedisCache.get(cacheKey);
      if (cached) {
        return res.json({
          status: 'success',
          msg: 'Successfull',
          data: cached
        });
      }

      // Get products by shop_id and optionally by cat_id
      const products = await Product.findByShopId(shop_id, cat_id || null);

      if (products.length === 0) {
        return res.json({
          status: 'success',
          msg: 'Empty List',
          data: []
        });
      }

      // Format product images
      const formattedProducts = products.map(product => ({
        ...product,
        image: product.image ? `${req.protocol}://${req.get('host')}/assets/images/products/${product.image}` : ''
      }));

      // Cache the result only on success (1 hour TTL)
      try {
        await RedisCache.set(cacheKey, formattedProducts, '365days');
        console.log(`💾 Redis cache set for shop items: ${cacheKey}`);
      } catch (redisErr) {
        console.error('Redis cache error:', redisErr);
        // Continue even if Redis fails
      }

      res.json({
        status: 'success',
        msg: 'Successfull',
        data: formattedProducts
      });
    } catch (err) {
      console.error('Shop item list error:', err);
      res.status(201).json({
        status: 'error',
        msg: 'Failed to fetch items',
        data: ''
      });
    }
  }

  // Items list for sale
  static async itemsListForSale(req, res) {
    try {
      console.log(`🔍 [itemsListForSale] Request received`);
      console.log(`   Body:`, req.body);
      
      const { shop_id, category } = req.body;

      if (!shop_id || !category) {
        console.log(`❌ [itemsListForSale] Missing params: shop_id=${shop_id}, category=${category}`);
        return res.status(201).json({
          status: 'error',
          msg: 'empty param',
          data: ''
        });
      }

      // Category can be comma-separated list
      const categoryNames = category.split(',').map(c => c.trim());
      console.log(`📝 [itemsListForSale] shop_id=${shop_id}, categoryNames=${JSON.stringify(categoryNames)}`);
      
      // Get category IDs using model method
      const categories = await ProductCategory.getByCategoryNames(shop_id, categoryNames);
      console.log(`📝 [itemsListForSale] Found ${categories.length} category(ies) for shop ${shop_id}`);

      if (categories.length === 0) {
        console.log(`⚠️  [itemsListForSale] No categories found, returning empty grouped data`);
        // Return grouped data with empty arrays for each category
        const groupedData = {};
        categoryNames.forEach(catName => {
          groupedData[catName] = [];
        });
        return res.json({
          status: 'success',
          msg: 'Empty List',
          data: groupedData
        });
      }

      const categoryIds = categories.map(c => c.id);
      console.log(`📝 [itemsListForSale] Category IDs: ${JSON.stringify(categoryIds)}`);
      
      // Get products for each category ID and combine
      // Since DynamoDB doesn't support IN operator well, we'll get products for each category
      let allProducts = [];
      for (const catId of categoryIds) {
        const productsForCategory = await Product.findByShopId(shop_id, catId);
        allProducts.push(...productsForCategory);
      }
      
      // Remove duplicates (in case a product appears in multiple categories)
      const uniqueProducts = [];
      const seenIds = new Set();
      allProducts.forEach(product => {
        if (!seenIds.has(product.id)) {
          seenIds.add(product.id);
          uniqueProducts.push(product);
        }
      });
      
      console.log(`📝 [itemsListForSale] Found ${uniqueProducts.length} unique product(s)`);
      const products = uniqueProducts;

      // Format product images and ensure correct field names/types for Flutter
      const { getImageUrl } = require('../utils/imageHelper');
      const formattedProducts = await Promise.all(products.map(async (product) => {
        let imageUrl = '';
        if (product.image) {
          imageUrl = await getImageUrl(product.image, 'product');
        }
        
        // Ensure all fields match Flutter model expectations
        // Flutter expects: id (int), shop_id (int), cat_id (int), name (String), 
        // amout (String - note typo), created_at (String ISO), updated_at (String ISO)
        return {
          id: typeof product.id === 'number' ? product.id : parseInt(product.id) || 0,
          shop_id: typeof product.shop_id === 'number' ? product.shop_id : parseInt(product.shop_id) || 0,
          cat_id: typeof product.cat_id === 'number' ? product.cat_id : parseInt(product.cat_id) || 0,
          name: String(product.name || ''),
          amout: String(product.price || product.amout || product.amount || '0'), // Flutter expects "amout" (typo)
          image: imageUrl,
          // Ensure dates are ISO strings
          created_at: product.created_at ? 
            (typeof product.created_at === 'string' ? product.created_at : new Date(product.created_at).toISOString()) :
            new Date().toISOString(),
          updated_at: product.updated_at ? 
            (typeof product.updated_at === 'string' ? product.updated_at : new Date(product.updated_at).toISOString()) :
            new Date().toISOString()
        };
      }));

      // Group by category name
      const groupedData = {};
      categoryNames.forEach(catName => {
        groupedData[catName] = [];
      });

      formattedProducts.forEach(product => {
        const category = categories.find(c => c.id === product.cat_id);
        if (category) {
          const catName = category.cat_name;
          // Match category name (case-insensitive)
          const matchingKey = Object.keys(groupedData).find(key => 
            key.toLowerCase() === catName.toLowerCase()
          );
          if (matchingKey) {
            groupedData[matchingKey].push(product);
          }
        }
      });

      console.log(`✅ [itemsListForSale] Returning grouped data with ${formattedProducts.length} product(s)`);

      if (formattedProducts.length === 0) {
        return res.json({
          status: 'success',
          msg: 'Empty List',
          data: groupedData
        });
      } else {
        return res.json({
          status: 'success',
          msg: 'Successfull',
          data: groupedData
        });
      }
    } catch (err) {
      console.error('❌ [itemsListForSale] Error:', err);
      console.error('❌ [itemsListForSale] Stack:', err.stack);
      res.status(201).json({
        status: 'error',
        msg: `Failed to fetch items: ${err.message}`,
        data: ''
      });
    }
  }
}

module.exports = ProductController;

