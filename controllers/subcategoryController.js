const Subcategory = require('../models/Subcategory');
const CategoryImgKeywords = require('../models/CategoryImgKeywords');
const RedisCache = require('../utils/redisCache');

class SubcategoryController {
  // Get all subcategories
  static async getAllSubcategories(req, res) {
    try {
      const subcategories = await Subcategory.getAll();
      const mainCategories = await CategoryImgKeywords.getAll();

      // Create a map of main category ID to name
      const mainCategoryMap = {};
      mainCategories.forEach(cat => {
        mainCategoryMap[cat.id] = {
          id: cat.id,
          name: cat.category_name || cat.cat_name || '',
          image: cat.category_img || cat.cat_img || ''
        };
      });

      // Enrich subcategories with main category info
      const enriched = subcategories.map(sub => ({
        id: sub.id,
        subcategory_name: sub.subcategory_name,
        subcategory_img: sub.subcategory_img,
        default_price: sub.default_price,
        price_unit: sub.price_unit,
        main_category_id: sub.main_category_id,
        main_category: mainCategoryMap[sub.main_category_id] || null,
        created_at: sub.created_at,
        updated_at: sub.updated_at
      }));

      return res.json({
        status: 'success',
        msg: 'Subcategories list',
        data: enriched
      });
    } catch (err) {
      console.error('❌ Error fetching subcategories:', err);
      return res.status(500).json({
        status: 'error',
        msg: 'Error fetching subcategories',
        data: null
      });
    }
  }

  // Get subcategories by main category ID
  static async getSubcategoriesByMainCategory(req, res) {
    try {
      const { mainCategoryId } = req.params;

      if (!mainCategoryId) {
        return res.status(400).json({
          status: 'error',
          msg: 'Main category ID is required',
          data: null
        });
      }

      const subcategories = await Subcategory.findByMainCategoryId(mainCategoryId);
      const mainCategory = await CategoryImgKeywords.findById(parseInt(mainCategoryId));

      return res.json({
        status: 'success',
        msg: 'Subcategories list',
        data: {
          main_category: mainCategory ? {
            id: mainCategory.id,
            name: mainCategory.category_name || mainCategory.cat_name || '',
            image: mainCategory.category_img || mainCategory.cat_img || ''
          } : null,
          subcategories: subcategories.map(sub => ({
            id: sub.id,
            subcategory_name: sub.subcategory_name,
            subcategory_img: sub.subcategory_img,
            default_price: sub.default_price,
            price_unit: sub.price_unit,
            created_at: sub.created_at,
            updated_at: sub.updated_at
          }))
        }
      });
    } catch (err) {
      console.error('❌ Error fetching subcategories by main category:', err);
      return res.status(500).json({
        status: 'error',
        msg: 'Error fetching subcategories',
        data: null
      });
    }
  }

  // Get subcategories grouped by main category
  static async getSubcategoriesGrouped(req, res) {
    try {
      const subcategories = await Subcategory.getAll();
      const mainCategories = await CategoryImgKeywords.getAll();

      // Create a map of main category ID to name
      const mainCategoryMap = {};
      mainCategories.forEach(cat => {
        // Use the most recent image URL (prefer category_img, fallback to cat_img)
        const imageUrl = cat.category_img || cat.cat_img || '';
        mainCategoryMap[cat.id] = {
          id: cat.id,
          name: cat.category_name || cat.cat_name || '',
          image: imageUrl
        };
      });

      console.log(`📋 Category images in getSubcategoriesGrouped:`,
        Object.values(mainCategoryMap).map(c => ({ id: c.id, name: c.name, image: c.image }))
      );

      // Group subcategories by main category
      const grouped = {};
      subcategories.forEach(sub => {
        const mainCatId = sub.main_category_id;
        if (!grouped[mainCatId]) {
          grouped[mainCatId] = {
            main_category: mainCategoryMap[mainCatId] || null,
            subcategories: []
          };
        }
        grouped[mainCatId].subcategories.push({
          id: sub.id,
          subcategory_name: sub.subcategory_name,
          subcategory_img: sub.subcategory_img,
          default_price: sub.default_price,
          price_unit: sub.price_unit,
          created_at: sub.created_at,
          updated_at: sub.updated_at
        });
      });

      // Convert to array and sort by main category name
      const result = Object.values(grouped)
        .filter(group => group.main_category !== null)
        .sort((a, b) => {
          const nameA = a.main_category?.name || '';
          const nameB = b.main_category?.name || '';
          return nameA.localeCompare(nameB);
        });

      return res.json({
        status: 'success',
        msg: 'Subcategories grouped by main category',
        data: result
      });
    } catch (err) {
      console.error('❌ Error fetching grouped subcategories:', err);
      return res.status(500).json({
        status: 'error',
        msg: 'Error fetching subcategories',
        data: null
      });
    }
  }

  // Create subcategory
  static async createSubcategory(req, res) {
    try {
      const { main_category_id, subcategory_name, default_price, price_unit, subcategory_img } = req.body;

      if (!main_category_id || !subcategory_name) {
        return res.status(400).json({
          status: 'error',
          msg: 'Main category ID and subcategory name are required',
          data: null
        });
      }

      const subcategoryData = {
        main_category_id: parseInt(main_category_id),
        subcategory_name: subcategory_name.trim(),
        default_price: default_price || '0',
        price_unit: price_unit || 'kg'
      };

      // Handle file upload if provided
      if (req.file) {
        try {
          console.log(`📤 Uploading subcategory image for new subcategory`);
          const { uploadFileToS3 } = require('../utils/fileUpload');
          const s3Result = await uploadFileToS3(req.file, 'subcategory-images');
          subcategoryData.subcategory_img = s3Result.s3Url;
          console.log(`✅ Subcategory image uploaded to S3: ${s3Result.s3Url}`);
        } catch (uploadError) {
          console.error('❌ Error uploading subcategory image to S3:', uploadError);
          return res.status(500).json({
            status: 'error',
            msg: 'Failed to upload subcategory image: ' + uploadError.message,
            data: null
          });
        }
      } else if (subcategory_img) {
        // If no file upload but URL provided, use the URL
        subcategoryData.subcategory_img = subcategory_img.trim();
      }

      const subcategory = await Subcategory.create(subcategoryData);

      // Invalidate v2 API caches
      try {
        await RedisCache.invalidateV2ApiCache('subcategories', null, { categoryId: main_category_id });
        await RedisCache.invalidateV2ApiCache('categories', null, {});
        // Invalidate all paginated subcategories for this category
        for (let page = 1; page <= 10; page++) {
          for (const limit of [20, 50, 100]) {
            await RedisCache.delete(RedisCache.listKey('subcategories_paginated', { page, limit, categoryId: main_category_id, userType: 'all' }));
            await RedisCache.delete(RedisCache.listKey('subcategories_paginated', { page, limit, categoryId: main_category_id, userType: 'b2b' }));
            await RedisCache.delete(RedisCache.listKey('subcategories_paginated', { page, limit, categoryId: main_category_id, userType: 'b2c' }));
          }
        }
        console.log(`🗑️  Invalidated v2 subcategories cache after creating subcategory`);
      } catch (err) {
        console.error('Cache invalidation error:', err);
      }

      return res.json({
        status: 'success',
        msg: 'Subcategory created successfully',
        data: subcategory
      });
    } catch (err) {
      console.error('❌ Error creating subcategory:', err);
      return res.status(500).json({
        status: 'error',
        msg: 'Error creating subcategory: ' + err.message,
        data: null
      });
    }
  }

  // Update subcategory
  static async updateSubcategory(req, res) {
    try {
      const { id } = req.params;
      const { subcategory_name, default_price, price_unit, subcategory_img } = req.body;

      if (!id) {
        return res.status(400).json({
          status: 'error',
          msg: 'Subcategory ID is required',
          data: null
        });
      }

      const updateData = {};
      if (subcategory_name !== undefined) {
        updateData.subcategory_name = subcategory_name.trim();
      }
      if (default_price !== undefined) {
        updateData.default_price = default_price;
      }
      if (price_unit !== undefined) {
        updateData.price_unit = price_unit;
      }

      // Handle file upload if provided
      if (req.file) {
        try {
          console.log(`📤 Uploading subcategory image for subcategory ${id}`);
          const { uploadFileToS3 } = require('../utils/fileUpload');
          const s3Result = await uploadFileToS3(req.file, 'subcategory-images');
          updateData.subcategory_img = s3Result.s3Url;
          console.log(`✅ Subcategory image uploaded to S3: ${s3Result.s3Url}`);
        } catch (uploadError) {
          console.error('❌ Error uploading subcategory image to S3:', uploadError);
          return res.status(500).json({
            status: 'error',
            msg: 'Failed to upload subcategory image: ' + uploadError.message,
            data: null
          });
        }
      } else if (subcategory_img !== undefined) {
        // If no file upload but URL provided, use the URL
        updateData.subcategory_img = subcategory_img.trim();
      }

      if (Object.keys(updateData).length === 0) {
        return res.status(400).json({
          status: 'error',
          msg: 'No fields to update',
          data: null
        });
      }

      const result = await Subcategory.update(parseInt(id), updateData);

      if (result.affectedRows === 0) {
        return res.status(404).json({
          status: 'error',
          msg: 'Subcategory not found',
          data: null
        });
      }

      const updatedSubcategory = await Subcategory.findById(parseInt(id));

      // Invalidate v2 API caches
      try {
        const categoryId = updatedSubcategory?.main_category_id;
        await RedisCache.invalidateV2ApiCache('subcategories', null, { categoryId: categoryId || 'all' });
        await RedisCache.invalidateV2ApiCache('categories', null, {});
        // Invalidate all paginated subcategories for this category
        if (categoryId) {
          for (let page = 1; page <= 10; page++) {
            for (const limit of [20, 50, 100]) {
              await RedisCache.delete(RedisCache.listKey('subcategories_paginated', { page, limit, categoryId, userType: 'all' }));
              await RedisCache.delete(RedisCache.listKey('subcategories_paginated', { page, limit, categoryId, userType: 'b2b' }));
              await RedisCache.delete(RedisCache.listKey('subcategories_paginated', { page, limit, categoryId, userType: 'b2c' }));
            }
          }
        }
        console.log(`🗑️  Invalidated v2 subcategories cache after updating subcategory`);
      } catch (err) {
        console.error('Cache invalidation error:', err);
      }

      return res.json({
        status: 'success',
        msg: 'Subcategory updated successfully',
        data: updatedSubcategory
      });
    } catch (err) {
      console.error('❌ Error updating subcategory:', err);
      return res.status(500).json({
        status: 'error',
        msg: 'Error updating subcategory: ' + err.message,
        data: null
      });
    }
  }

  // Delete subcategory
  static async deleteSubcategory(req, res) {
    try {
      const { id } = req.params;

      if (!id) {
        return res.status(400).json({
          status: 'error',
          msg: 'Subcategory ID is required',
          data: null
        });
      }

      // Get subcategory before deletion to know which category to invalidate
      const subcategory = await Subcategory.findById(parseInt(id));
      if (!subcategory) {
        return res.status(404).json({
          status: 'error',
          msg: 'Subcategory not found',
          data: null
        });
      }

      // Check if already deleted
      if (subcategory.deleted) {
        return res.json({
          status: 'success',
          msg: 'Subcategory is already deleted',
          data: null
        });
      }

      const categoryId = subcategory.main_category_id;
      const result = await Subcategory.delete(parseInt(id));

      if (result.affectedRows === 0) {
        return res.status(404).json({
          status: 'error',
          msg: 'Subcategory not found',
          data: null
        });
      }

      // Invalidate v2 API caches
      try {
        await RedisCache.invalidateV2ApiCache('subcategories', null, { categoryId: categoryId || 'all' });
        await RedisCache.invalidateV2ApiCache('categories', null, {});
        // Invalidate all paginated subcategories for this category
        if (categoryId) {
          for (let page = 1; page <= 10; page++) {
            for (const limit of [20, 50, 100]) {
              await RedisCache.delete(RedisCache.listKey('subcategories_paginated', { page, limit, categoryId, userType: 'all' }));
              await RedisCache.delete(RedisCache.listKey('subcategories_paginated', { page, limit, categoryId, userType: 'b2b' }));
              await RedisCache.delete(RedisCache.listKey('subcategories_paginated', { page, limit, categoryId, userType: 'b2c' }));
            }
          }
        }
        console.log(`🗑️  Invalidated v2 subcategories cache after deleting subcategory`);
      } catch (err) {
        console.error('Cache invalidation error:', err);
      }

      return res.json({
        status: 'success',
        msg: 'Subcategory deleted successfully',
        data: null
      });
    } catch (err) {
      console.error('❌ Error deleting subcategory:', err);
      return res.status(500).json({
        status: 'error',
        msg: 'Error deleting subcategory: ' + err.message,
        data: null
      });
    }
  }

  // Request new subcategory (for B2B and B2C users)
  static async requestSubcategory(req, res) {
    try {
      const { main_category_id, subcategory_name, default_price, price_unit } = req.body;
      const userId = req.user?.id || req.body.user_id;

      if (!main_category_id || !subcategory_name) {
        return res.status(400).json({
          status: 'error',
          msg: 'Main category ID and subcategory name are required',
          data: null
        });
      }

      if (!userId) {
        return res.status(401).json({
          status: 'error',
          msg: 'User authentication required',
          data: null
        });
      }

      // Check if subcategory with same name already exists for this category
      const existingSubcategories = await Subcategory.findByMainCategoryId(main_category_id, true);
      const duplicate = existingSubcategories.find(
        sub => sub.subcategory_name.toLowerCase().trim() === subcategory_name.toLowerCase().trim()
      );

      if (duplicate) {
        return res.status(400).json({
          status: 'error',
          msg: 'A subcategory with this name already exists for this category',
          data: null
        });
      }

      const subcategoryData = {
        main_category_id: parseInt(main_category_id),
        subcategory_name: subcategory_name.trim(),
        default_price: default_price || '0',
        price_unit: price_unit || 'kg',
        approval_status: 'pending',
        requested_by_user_id: parseInt(userId)
      };

      // Handle file upload if provided
      if (req.file) {
        try {
          console.log(`📤 Uploading subcategory image for new subcategory request`);
          const { uploadFileToS3 } = require('../utils/fileUpload');
          const s3Result = await uploadFileToS3(req.file, 'subcategory-images');
          subcategoryData.subcategory_img = s3Result.s3Url;
          console.log(`✅ Subcategory image uploaded to S3: ${s3Result.s3Url}`);
        } catch (uploadError) {
          console.error('❌ Error uploading subcategory image to S3:', uploadError);
          return res.status(500).json({
            status: 'error',
            msg: 'Failed to upload subcategory image: ' + uploadError.message,
            data: null
          });
        }
      }

      const subcategory = await Subcategory.create(subcategoryData);

      // Invalidate v2 API caches
      try {
        await RedisCache.invalidateV2ApiCache('subcategories', null, { categoryId: main_category_id });
        console.log(`🗑️  Invalidated v2 subcategories cache after requesting subcategory`);
      } catch (err) {
        console.error('Cache invalidation error:', err);
      }

      return res.json({
        status: 'success',
        msg: 'Subcategory request submitted successfully. It will be reviewed by admin.',
        data: subcategory
      });
    } catch (err) {
      console.error('❌ Error requesting subcategory:', err);
      return res.status(500).json({
        status: 'error',
        msg: 'Error requesting subcategory: ' + err.message,
        data: null
      });
    }
  }

  // Get pending subcategory requests (for admin)
  static async getPendingRequests(req, res) {
    try {
      const pendingRequests = await Subcategory.findPendingRequests();
      const mainCategories = await CategoryImgKeywords.getAll();

      // Create a map of main category ID to name
      const mainCategoryMap = {};
      mainCategories.forEach(cat => {
        mainCategoryMap[cat.id] = {
          id: cat.id,
          name: cat.category_name || cat.cat_name || '',
          image: cat.category_img || cat.cat_img || ''
        };
      });

      // Enrich with main category info and user info
      const enriched = await Promise.all(pendingRequests.map(async (sub) => {
        let requesterInfo = null;
        if (sub.requested_by_user_id) {
          try {
            const User = require('../models/User');
            const requester = await User.findById(sub.requested_by_user_id);
            if (requester) {
              requesterInfo = {
                id: requester.id,
                name: requester.name,
                contact: requester.contact,
                email: requester.email
              };
            }
          } catch (err) {
            console.error('Error fetching requester info:', err);
          }
        }

        return {
          id: sub.id,
          subcategory_name: sub.subcategory_name,
          subcategory_img: sub.subcategory_img,
          default_price: sub.default_price,
          price_unit: sub.price_unit,
          main_category_id: sub.main_category_id,
          main_category: mainCategoryMap[sub.main_category_id] || null,
          approval_status: sub.approval_status,
          requested_by_user_id: sub.requested_by_user_id,
          requester: requesterInfo,
          created_at: sub.created_at,
          updated_at: sub.updated_at
        };
      }));

      return res.json({
        status: 'success',
        msg: 'Pending subcategory requests',
        data: enriched
      });
    } catch (err) {
      console.error('❌ Error fetching pending subcategory requests:', err);
      return res.status(500).json({
        status: 'error',
        msg: 'Error fetching pending requests: ' + err.message,
        data: null
      });
    }
  }

  // Approve or reject subcategory request (for admin)
  static async approveRejectSubcategory(req, res) {
    try {
      const { id } = req.params;
      const { action, approval_notes } = req.body; // action: 'approve' or 'reject'
      const adminUserId = req.user?.id || req.body.admin_user_id;

      if (!id) {
        return res.status(400).json({
          status: 'error',
          msg: 'Subcategory ID is required',
          data: null
        });
      }

      if (!action || !['approve', 'reject'].includes(action)) {
        return res.status(400).json({
          status: 'error',
          msg: 'Action must be either "approve" or "reject"',
          data: null
        });
      }

      const subcategory = await Subcategory.findById(parseInt(id));
      if (!subcategory) {
        return res.status(404).json({
          status: 'error',
          msg: 'Subcategory not found',
          data: null
        });
      }

      if (subcategory.approval_status !== 'pending') {
        return res.status(400).json({
          status: 'error',
          msg: `Subcategory is already ${subcategory.approval_status}`,
          data: null
        });
      }

      const updateData = {
        approval_status: action === 'approve' ? 'approved' : 'rejected',
        approved_by_user_id: adminUserId ? parseInt(adminUserId) : null,
        approval_notes: approval_notes || null
      };

      const result = await Subcategory.update(parseInt(id), updateData);

      if (result.affectedRows === 0) {
        return res.status(404).json({
          status: 'error',
          msg: 'Subcategory not found',
          data: null
        });
      }

      const updatedSubcategory = await Subcategory.findById(parseInt(id));

      // Invalidate v2 API caches
      try {
        const categoryId = updatedSubcategory?.main_category_id;
        await RedisCache.invalidateV2ApiCache('subcategories', null, { categoryId: categoryId || 'all' });
        await RedisCache.invalidateV2ApiCache('categories', null, {});
        console.log(`🗑️  Invalidated v2 subcategories cache after ${action}ing subcategory`);
      } catch (err) {
        console.error('Cache invalidation error:', err);
      }

      return res.json({
        status: 'success',
        msg: `Subcategory ${action === 'approve' ? 'approved' : 'rejected'} successfully`,
        data: updatedSubcategory
      });
    } catch (err) {
      console.error('❌ Error approving/rejecting subcategory:', err);
      return res.status(500).json({
        status: 'error',
        msg: `Error ${req.body.action === 'approve' ? 'approving' : 'rejecting'} subcategory: ` + err.message,
        data: null
      });
    }
  }

  // Get subcategory requests by user ID (for B2C users to see their requests)
  static async getUserSubcategoryRequests(req, res) {
    try {
      const { userId } = req.params;
      const userIdNum = parseInt(userId);

      if (!userId || isNaN(userIdNum)) {
        return res.status(400).json({
          status: 'error',
          msg: 'Valid user ID is required',
          data: null
        });
      }

      // Get all subcategory requests by this user
      const userRequests = await Subcategory.findByRequestedByUserId(userIdNum);
      const mainCategories = await CategoryImgKeywords.getAll();

      // Create a map of main category ID to name
      const mainCategoryMap = {};
      mainCategories.forEach(cat => {
        mainCategoryMap[cat.id] = {
          id: cat.id,
          name: cat.category_name || cat.cat_name || '',
          image: cat.category_img || cat.cat_img || ''
        };
      });

      // Enrich with main category info
      const enriched = userRequests.map(sub => ({
        id: sub.id,
        subcategory_name: sub.subcategory_name,
        subcategory_img: sub.subcategory_img || '',
        default_price: sub.default_price || '0',
        price_unit: sub.price_unit || 'kg',
        main_category_id: sub.main_category_id,
        main_category: mainCategoryMap[sub.main_category_id] || null,
        approval_status: sub.approval_status || 'pending',
        requested_by_user_id: sub.requested_by_user_id,
        approved_by_user_id: sub.approved_by_user_id || null,
        approval_notes: sub.approval_notes || null,
        created_at: sub.created_at,
        updated_at: sub.updated_at
      }));

      // Sort by created_at descending (most recent first)
      enriched.sort((a, b) => {
        const dateA = a.created_at ? new Date(a.created_at).getTime() : 0;
        const dateB = b.created_at ? new Date(b.created_at).getTime() : 0;
        return dateB - dateA;
      });

      return res.json({
        status: 'success',
        msg: 'User subcategory requests retrieved successfully',
        data: enriched,
        count: enriched.length
      });
    } catch (err) {
      console.error('❌ Error fetching user subcategory requests:', err);
      return res.status(500).json({
        status: 'error',
        msg: 'Error fetching user subcategory requests: ' + err.message,
        data: null
      });
    }
  }
}

module.exports = SubcategoryController;
