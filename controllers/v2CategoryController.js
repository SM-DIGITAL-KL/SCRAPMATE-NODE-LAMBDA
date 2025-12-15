const CategoryImgKeywords = require('../models/CategoryImgKeywords');
const Subcategory = require('../models/Subcategory');

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
      
      // Get all categories
      console.log('🔍 [V2 Categories API] Fetching categories from DynamoDB...');
      const categories = await CategoryImgKeywords.getAll();
      console.log(`✅ [V2 Categories API] Found ${categories.length} categories`);
      
      // Get all shops to determine B2B/B2C availability
      console.log('🔍 [V2 Categories API] Fetching shops from DynamoDB...');
      const shops = await V2CategoryController._getAllShops();
      console.log(`✅ [V2 Categories API] Found ${shops.length} shops`);
      
      // Determine B2B/B2C availability for each category
      // B2B shops: shop_type = 1 (Industrial) or 4 (Wholesaler)
      // B2C shops: shop_type = 3 (Retailer)
      const b2bShopTypes = [1, 4];
      const b2cShopTypes = [3];
      
      // Count shops by type
      const b2bShops = shops.filter(shop => 
        shop.del_status === 1 && b2bShopTypes.includes(shop.shop_type)
      );
      const b2cShops = shops.filter(shop => 
        shop.del_status === 1 && b2cShopTypes.includes(shop.shop_type)
      );
      
      // For now, mark categories as available for both if shops exist
      // In future, this can be enhanced to check actual category usage
      const hasB2B = b2bShops.length > 0;
      const hasB2C = b2cShops.length > 0;
      
      // Format categories with B2B/B2C info
      const formattedCategories = categories.map(category => {
        const imageUrl = category.category_img || category.cat_img || '';
        
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
      });
      
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
      
      return res.json({
        status: 'success',
        msg: 'Categories retrieved successfully',
        data: filteredCategories,
        meta: {
          total: filteredCategories.length,
          b2b_available: formattedCategories.filter(c => c.available_in.b2b).length,
          b2c_available: formattedCategories.filter(c => c.available_in.b2c).length
        }
      });
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
      
      // Get subcategories
      let subcategories;
      if (categoryId) {
        subcategories = await Subcategory.findByMainCategoryId(categoryId);
      } else {
        subcategories = await Subcategory.getAll();
      }
      
      // Get main categories for enrichment
      const categories = await CategoryImgKeywords.getAll();
      const categoryMap = {};
      categories.forEach(cat => {
        categoryMap[cat.id] = {
          id: cat.id,
          name: cat.category_name || cat.cat_name || '',
          image: cat.category_img || cat.cat_img || ''
        };
      });
      
      // Get shops to determine B2B/B2C availability
      // Scan shops table to get all shops
      const { getDynamoDBClient } = require('../config/dynamodb');
      const { ScanCommand } = require('@aws-sdk/lib-dynamodb');
      const client = getDynamoDBClient();
      let lastKey = null;
      const shops = [];
      
      do {
        const params = {
          TableName: 'shops'
        };
        if (lastKey) {
          params.ExclusiveStartKey = lastKey;
        }
        const command = new ScanCommand(params);
        const response = await client.send(command);
        if (response.Items) {
          shops.push(...response.Items);
        }
        lastKey = response.LastEvaluatedKey;
      } while (lastKey);
      const b2bShopTypes = [1, 4];
      const b2cShopTypes = [3];
      
      const b2bShops = shops.filter(shop => 
        shop.del_status === 1 && b2bShopTypes.includes(shop.shop_type)
      );
      const b2cShops = shops.filter(shop => 
        shop.del_status === 1 && b2cShopTypes.includes(shop.shop_type)
      );
      
      const hasB2B = b2bShops.length > 0;
      const hasB2C = b2cShops.length > 0;
      
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
      
      return res.json({
        status: 'success',
        msg: 'Subcategories retrieved successfully',
        data: filteredSubcategories,
        meta: {
          total: filteredSubcategories.length,
          b2b_available: formattedSubcategories.filter(s => s.available_in.b2b).length,
          b2c_available: formattedSubcategories.filter(s => s.available_in.b2c).length,
          category_id: categoryId || null
        }
      });
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
      
      // Get all categories and subcategories
      const categories = await CategoryImgKeywords.getAll();
      const subcategories = await Subcategory.getAll();
      
      // Get shops to determine B2B/B2C availability
      // Scan shops table to get all shops
      const { getDynamoDBClient } = require('../config/dynamodb');
      const { ScanCommand } = require('@aws-sdk/lib-dynamodb');
      const client = getDynamoDBClient();
      let lastKey = null;
      const shops = [];
      
      do {
        const params = {
          TableName: 'shops'
        };
        if (lastKey) {
          params.ExclusiveStartKey = lastKey;
        }
        const command = new ScanCommand(params);
        const response = await client.send(command);
        if (response.Items) {
          shops.push(...response.Items);
        }
        lastKey = response.LastEvaluatedKey;
      } while (lastKey);
      const b2bShopTypes = [1, 4];
      const b2cShopTypes = [3];
      
      const b2bShops = shops.filter(shop => 
        shop.del_status === 1 && b2bShopTypes.includes(shop.shop_type)
      );
      const b2cShops = shops.filter(shop => 
        shop.del_status === 1 && b2cShopTypes.includes(shop.shop_type)
      );
      
      const hasB2B = b2bShops.length > 0;
      const hasB2C = b2cShops.length > 0;
      
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
      
      return res.json({
        status: 'success',
        msg: 'Categories with subcategories retrieved successfully',
        data: filteredCategories,
        meta: {
          total_categories: filteredCategories.length,
          total_subcategories: filteredCategories.reduce((sum, cat) => sum + cat.subcategory_count, 0),
          b2b_available: formattedCategories.filter(c => c.available_in.b2b).length,
          b2c_available: formattedCategories.filter(c => c.available_in.b2c).length
        }
      });
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
   * Helper method to get all shops
   * @private
   */
  static async _getAllShops() {
    try {
      console.log('🔍 [V2 Categories API] _getAllShops: Initializing DynamoDB client...');
      const { getDynamoDBClient } = require('../config/dynamodb');
      const { ScanCommand } = require('@aws-sdk/lib-dynamodb');
      const client = getDynamoDBClient();
      let lastKey = null;
      const shops = [];
      const maxIterations = 100; // Prevent infinite loops
      let iterations = 0;
      
      console.log('🔍 [V2 Categories API] _getAllShops: Starting scan of shops table...');
      do {
        const params = {
          TableName: 'shops'
        };
        if (lastKey) {
          params.ExclusiveStartKey = lastKey;
        }
        const command = new ScanCommand(params);
        const response = await client.send(command);
        if (response.Items) {
          shops.push(...response.Items);
          console.log(`   📦 [V2 Categories API] _getAllShops: Scanned ${shops.length} shops so far...`);
        }
        lastKey = response.LastEvaluatedKey;
        iterations++;
        
        // Safety check to prevent infinite loops
        if (iterations >= maxIterations) {
          console.warn('⚠️  [V2 Categories API] _getAllShops: Reached max iterations while scanning shops table');
          break;
        }
      } while (lastKey);
      
      console.log(`✅ [V2 Categories API] _getAllShops: Completed scan, found ${shops.length} total shops`);
      return shops;
    } catch (err) {
      console.error('❌ [V2 Categories API] _getAllShops: Error fetching shops:', err);
      console.error('   Error message:', err.message);
      console.error('   Error stack:', err.stack);
      return []; // Return empty array on error to prevent 502
    }
  }

  /**
   * Get paginated subcategories
   * GET /api/v2/subcategories/paginated
   * Query params:
   *   - page: page number (default: 1)
   *   - limit: items per page (default: 20)
   *   - categoryId: optional filter by main category ID
   *   - userType: 'b2b' | 'b2c' | 'all' (optional, filters by availability)
   */
  static async getSubcategoriesPaginated(req, res) {
    try {
      const { page = 1, limit = 20, categoryId, userType } = req.query;
      const pageNumber = parseInt(page) || 1;
      const pageSize = parseInt(limit) || 20;

      console.log('📋 [V2 Subcategories Paginated API] Request received');
      console.log('   Query params:', { page: pageNumber, limit: pageSize, categoryId, userType });

      // Get paginated subcategories
      const categoryIdNum = categoryId ? parseInt(categoryId) : null;
      const paginatedResult = await Subcategory.getPaginated(pageNumber, pageSize, categoryIdNum);
      
      console.log(`✅ [V2 Subcategories Paginated API] Found ${paginatedResult.total} total subcategories, returning page ${pageNumber}`);

      // Get main categories for enrichment
      const categories = await CategoryImgKeywords.getAll();
      const categoryMap = {};
      categories.forEach(cat => {
        categoryMap[cat.id] = {
          id: cat.id,
          name: cat.category_name || cat.cat_name || '',
          image: cat.category_img || cat.cat_img || ''
        };
      });

      // Get shops to determine B2B/B2C availability
      const shops = await V2CategoryController._getAllShops();
      const b2bShopTypes = [1, 4];
      const b2cShopTypes = [3];
      
      const b2bShops = shops.filter(shop => 
        shop.del_status === 1 && b2bShopTypes.includes(shop.shop_type)
      );
      const b2cShops = shops.filter(shop => 
        shop.del_status === 1 && b2cShopTypes.includes(shop.shop_type)
      );
      
      const hasB2B = b2bShops.length > 0;
      const hasB2C = b2cShops.length > 0;

      // Format subcategories with B2B/B2C info
      const formattedSubcategories = paginatedResult.items.map(sub => {
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
            b2b: hasB2B,
            b2c: hasB2C
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

      return res.json({
        status: 'success',
        msg: 'Subcategories retrieved successfully',
        data: filteredSubcategories,
        meta: {
          total: paginatedResult.total,
          page: paginatedResult.page,
          limit: paginatedResult.limit,
          totalPages: paginatedResult.totalPages,
          hasMore: paginatedResult.hasMore,
          b2b_available: formattedSubcategories.filter(s => s.available_in.b2b).length,
          b2c_available: formattedSubcategories.filter(s => s.available_in.b2c).length,
          category_id: categoryIdNum
        }
      });
    } catch (err) {
      console.error('❌ [V2 Subcategories Paginated API] Error:', err);
      return res.status(500).json({
        status: 'error',
        msg: 'Error fetching paginated subcategories: ' + err.message,
        data: null
      });
    }
  }
}

module.exports = V2CategoryController;
