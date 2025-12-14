const Subcategory = require('../models/Subcategory');
const CategoryImgKeywords = require('../models/CategoryImgKeywords');

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

      const result = await Subcategory.delete(parseInt(id));

      if (result.affectedRows === 0) {
        return res.status(404).json({
          status: 'error',
          msg: 'Subcategory not found',
          data: null
        });
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
}

module.exports = SubcategoryController;

