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

      // Check Redis cache first (only if previously successful)
      // Include version to bust old cache entries that used non-S3 URLs
      const cacheKey = RedisCache.listKey('category_img_list', { version: 's3' });
      const cached = await RedisCache.get(cacheKey);
      if (cached) {
        console.log(`⚡ Redis cache hit for category img list: ${cacheKey}`);
        return res.json({
          status: 'success',
          msg: 'Category image list',
          data: cached
        });
      }

      const CategoryImgKeywords = require('../models/CategoryImgKeywords');
      console.log(`🔎 Fetching category image keywords from DynamoDB`);
      const categories = await CategoryImgKeywords.getAll();
      console.log(`✅ Found ${categories.length} category image keyword(s)`);

      // Format image URLs to ensure they point to S3 (with presigned URLs)
      // Convert S3 URLs to presigned URLs for secure access
      const categoryList = await Promise.all(categories.map(async (cat) => {
        let catImg = '';
        
        // Prefer cat_img field, fallback to category_img
        const imageUrl = cat.cat_img || cat.category_img || '';
        
        if (imageUrl) {
          // If it's already an S3 URL (scrapmate-images.s3), extract key and generate presigned URL
          if (imageUrl.includes('scrapmate-images.s3') || imageUrl.includes('s3.amazonaws.com')) {
            // Extract S3 key from URL
            // URL format: https://scrapmate-images.s3.ap-south-1.amazonaws.com/categories/c205.png
            const urlMatch = imageUrl.match(/\/categories\/([^?]+)/);
            if (urlMatch) {
              const filename = urlMatch[1];
              const s3Key = `categories/${filename}`;
              // Generate presigned URL
              const { getS3Url } = require('../utils/s3Upload');
              catImg = await getS3Url(s3Key);
            } else {
              // Fallback to original URL if key extraction fails
              catImg = imageUrl;
            }
          } else {
            // Use getImageUrl helper which handles both S3 and external URLs
            catImg = await getImageUrl(imageUrl, 'category');
          }
        }

        return {
          ...cat,
          category_img: catImg || '',
          cat_img: catImg || ''
        };
      }));

      // Cache the result only on success (1 hour TTL)
      try {
        await RedisCache.set(cacheKey, categoryList, '365days');
        console.log(`💾 Redis cache set for category img list: ${cacheKey}`);
      } catch (redisErr) {
        console.error('Redis cache error:', redisErr);
        // Continue even if Redis fails
      }

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

