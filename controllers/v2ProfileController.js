/**
 * V2 Profile Controller
 * Handles HTTP requests for user profile management
 */

const V2ProfileService = require('../services/user/v2ProfileService');
const { profileUpload } = require('../utils/fileUpload');
const { compressImage } = require('../utils/imageCompression');
const { uploadBufferToS3 } = require('../utils/s3Upload');
const path = require('path');

class V2ProfileController {
  /**
   * GET /api/v2/profile/:userId
   * Get user profile
   */
  static async getProfile(req, res) {
    try {
      const { userId } = req.params;

      if (!userId) {
        return res.status(400).json({
          status: 'error',
          msg: 'User ID is required',
          data: null,
        });
      }

      const profile = await V2ProfileService.getProfile(userId);

      return res.json({
        status: 'success',
        msg: 'Profile retrieved successfully',
        data: profile,
      });
    } catch (error) {
      console.error('V2ProfileController.getProfile error:', error);

      if (error.message === 'USER_NOT_FOUND') {
        return res.status(404).json({
          status: 'error',
          msg: 'User not found',
          data: null,
        });
      }

      return res.status(500).json({
        status: 'error',
        msg: 'Failed to retrieve profile',
        data: null,
      });
    }
  }

  /**
   * PUT /api/v2/profile/:userId
   * Update user profile
   */
  static async updateProfile(req, res) {
    try {
      const { userId } = req.params;
      const updateData = req.body;

      if (!userId) {
        return res.status(400).json({
          status: 'error',
          msg: 'User ID is required',
          data: null,
        });
      }

      if (!updateData || Object.keys(updateData).length === 0) {
        return res.status(400).json({
          status: 'error',
          msg: 'Update data is required',
          data: null,
        });
      }

      const updatedProfile = await V2ProfileService.updateProfile(userId, updateData);

      return res.json({
        status: 'success',
        msg: 'Profile updated successfully',
        data: updatedProfile,
      });
    } catch (error) {
      console.error('V2ProfileController.updateProfile error:', error);

      if (error.message === 'USER_NOT_FOUND') {
        return res.status(404).json({
          status: 'error',
          msg: 'User not found',
          data: null,
        });
      }

      if (error.message === 'EMAIL_ALREADY_EXISTS') {
        return res.status(400).json({
          status: 'error',
          msg: 'Email already exists',
          data: null,
        });
      }

      return res.status(500).json({
        status: 'error',
        msg: 'Failed to update profile',
        data: null,
      });
    }
  }

  /**
   * PUT /api/v2/profile/:userId/delivery-mode
   * Update delivery mode for delivery boy
   * Body: { delivery_mode: 'deliver' | 'deliverPicking' | 'picker' }
   */
  static async updateDeliveryMode(req, res) {
    try {
      const { userId } = req.params;
      const { delivery_mode } = req.body;

      if (!userId) {
        return res.status(400).json({
          status: 'error',
          msg: 'User ID is required',
          data: null,
        });
      }

      if (!delivery_mode) {
        return res.status(400).json({
          status: 'error',
          msg: 'Delivery mode is required',
          data: null,
        });
      }

      const validModes = ['deliver', 'deliverPicking', 'picker'];
      if (!validModes.includes(delivery_mode)) {
        return res.status(400).json({
          status: 'error',
          msg: `Invalid delivery mode. Must be one of: ${validModes.join(', ')}`,
          data: null,
        });
      }

      const updatedDelivery = await V2ProfileService.updateDeliveryMode(userId, delivery_mode);

      return res.json({
        status: 'success',
        msg: 'Delivery mode updated successfully',
        data: updatedDelivery,
      });
    } catch (error) {
      console.error('V2ProfileController.updateDeliveryMode error:', error);

      if (error.message === 'USER_NOT_FOUND') {
        return res.status(404).json({
          status: 'error',
          msg: 'User not found',
          data: null,
        });
      }

      if (error.message === 'USER_NOT_DELIVERY_BOY') {
        return res.status(400).json({
          status: 'error',
          msg: 'User is not a delivery boy',
          data: null,
        });
      }

      if (error.message === 'INVALID_DELIVERY_MODE') {
        return res.status(400).json({
          status: 'error',
          msg: 'Invalid delivery mode',
          data: null,
        });
      }

      return res.status(500).json({
        status: 'error',
        msg: 'Failed to update delivery mode',
        data: null,
      });
    }
  }

  /**
   * PUT /api/v2/profile/:userId/online-status
   * Update online/offline status for delivery boy
   * Body: { is_online: boolean }
   */
  static async updateOnlineStatus(req, res) {
    try {
      const { userId } = req.params;
      const { is_online } = req.body;

      if (!userId) {
        return res.status(400).json({
          status: 'error',
          msg: 'User ID is required',
          data: null,
        });
      }

      if (typeof is_online !== 'boolean') {
        return res.status(400).json({
          status: 'error',
          msg: 'is_online must be a boolean value (true or false)',
          data: null,
        });
      }

      const updatedDelivery = await V2ProfileService.updateOnlineStatus(userId, is_online);

      return res.json({
        status: 'success',
        msg: `Delivery boy is now ${is_online ? 'online' : 'offline'}`,
        data: updatedDelivery,
      });
    } catch (error) {
      console.error('V2ProfileController.updateOnlineStatus error:', error);

      if (error.message === 'USER_NOT_FOUND') {
        return res.status(404).json({
          status: 'error',
          msg: 'User not found',
          data: null,
        });
      }

      if (error.message === 'USER_NOT_DELIVERY_BOY') {
        return res.status(400).json({
          status: 'error',
          msg: 'User is not a delivery boy',
          data: null,
        });
      }

      return res.status(500).json({
        status: 'error',
        msg: 'Failed to update online status',
        data: null,
      });
    }
  }

  /**
   * POST /api/v2/profile/:userId/image
   * Upload profile image (compressed to 50KB and uploaded to S3)
   */
  static async uploadProfileImage(req, res) {
    try {
      const { userId } = req.params;

      if (!userId) {
        return res.status(400).json({
          status: 'error',
          msg: 'User ID is required',
          data: null,
        });
      }

      if (!req.file) {
        return res.status(400).json({
          status: 'error',
          msg: 'Image file is required',
          data: null,
        });
      }

      console.log(`📤 Uploading profile image for user ${userId}`);
      console.log(`📤 Original file size: ${(req.file.buffer.length / 1024).toFixed(2)}KB`);

      // Compress image to 50KB
      const compressedBuffer = await compressImage(req.file.buffer);
      console.log(`📤 Compressed file size: ${(compressedBuffer.length / 1024).toFixed(2)}KB`);

      // Generate unique filename
      const ext = path.extname(req.file.originalname).toLowerCase() || '.jpg';
      const filename = `profile-${userId}-${Date.now()}${ext}`;

      // Upload to S3
      const s3Result = await uploadBufferToS3(compressedBuffer, filename, 'profile');
      console.log(`✅ Profile image uploaded to S3: ${s3Result.s3Url}`);

      // Update user profile with image URL
      const updatedProfile = await V2ProfileService.updateProfile(userId, {
        profile_image: s3Result.s3Url
      });

      return res.json({
        status: 'success',
        msg: 'Profile image uploaded successfully',
        data: {
          image_url: s3Result.s3Url,
          profile: updatedProfile
        },
      });
    } catch (error) {
      console.error('V2ProfileController.uploadProfileImage error:', error);

      if (error.message === 'USER_NOT_FOUND') {
        return res.status(404).json({
          status: 'error',
          msg: 'User not found',
          data: null,
        });
      }

      return res.status(500).json({
        status: 'error',
        msg: 'Failed to upload profile image',
        data: null,
      });
    }
  }

  /**
   * POST /api/v2/profile/:userId/aadhar
   * Upload Aadhar card (compressed to 50KB and uploaded to S3)
   */
  static async uploadAadharCard(req, res) {
    try {
      const { userId } = req.params;

      if (!userId) {
        return res.status(400).json({
          status: 'error',
          msg: 'User ID is required',
          data: null,
        });
      }

      if (!req.file) {
        return res.status(400).json({
          status: 'error',
          msg: 'PDF file is required',
          data: null,
        });
      }

      // Verify it's a PDF file
      if (req.file.mimetype !== 'application/pdf') {
        return res.status(400).json({
          status: 'error',
          msg: 'Only PDF files are allowed',
          data: null,
        });
      }

      // Check if user exists BEFORE uploading to S3
      const User = require('../models/User');
      const user = await User.findById(userId);
      if (!user) {
        return res.status(404).json({
          status: 'error',
          msg: 'User not found',
          data: null,
        });
      }

      // Check if user is deleted (del_status = 2)
      // IMPORTANT: Allow users with user_type 'N' during registration even if del_status = 2
      // New users may have del_status = 2 from previous registration attempts
      if (user.del_status === 2 && user.user_type !== 'N') {
        return res.status(404).json({
          status: 'error',
          msg: 'User not found',
          data: null,
        });
      }
      
      // Log for debugging
      if (user.del_status === 2 && user.user_type === 'N') {
        console.log(`✅ Allowing Aadhar upload for new user (type N) with del_status = 2 (user ID: ${userId})`);
      }

      console.log(`📤 Uploading Aadhar card for user ${userId}`);
      console.log(`📤 Original file size: ${(req.file.buffer.length / 1024).toFixed(2)}KB`);

      // Generate unique filename
      const ext = path.extname(req.file.originalname).toLowerCase() || '.pdf';
      const filename = `aadhar-${userId}-${Date.now()}${ext}`;

      // Upload PDF directly to S3 (no compression for PDFs)
      const s3Result = await uploadBufferToS3(req.file.buffer, filename, 'documents');
      console.log(`✅ Aadhar card uploaded to S3: ${s3Result.s3Url}`);

      // Update profile based on user type
      let updatedProfile;
      if (user.user_type === 'D') {
        // For delivery users, update delivery_boy table
        const DeliveryBoy = require('../models/DeliveryBoy');
        const deliveryBoy = await DeliveryBoy.findByUserId(userId);
        const updateData = { aadhar_card: s3Result.s3Url };
        
        // If status is 'rejected', change it to 'pending' when user resubmits documents
        if (deliveryBoy && deliveryBoy.approval_status === 'rejected') {
          updateData.approval_status = 'pending';
          updateData.application_submitted_at = new Date().toISOString();
          console.log(`📋 Aadhar upload - changing approval_status from 'rejected' to 'pending' for delivery user ${userId} (resubmission)`);
        }
        
        if (deliveryBoy) {
          await DeliveryBoy.update(deliveryBoy.id, updateData);
        } else {
          // Create delivery boy record if it doesn't exist
          await DeliveryBoy.create({
            user_id: userId,
            name: user.name || '',
            aadhar_card: s3Result.s3Url,
          });
        }
      } else {
        // For B2B/B2C users, update shop table
        const Shop = require('../models/Shop');
        const shop = await Shop.findByUserId(userId);
        const updateData = { aadhar_card: s3Result.s3Url };
        
        // If status is 'rejected', change it to 'pending' when user resubmits documents
        if (shop && shop.approval_status === 'rejected') {
          updateData.approval_status = 'pending';
          updateData.application_submitted_at = new Date().toISOString();
          console.log(`📋 Aadhar upload - changing approval_status from 'rejected' to 'pending' for user ${userId} (resubmission)`);
        }
        
        if (shop) {
          await Shop.update(shop.id, updateData);
        } else {
          // Create shop record if it doesn't exist
          await Shop.create({
            user_id: userId,
            shopname: user.name || '',
            aadhar_card: s3Result.s3Url,
          });
        }
      }

      // Get updated profile
      // For new users (user_type 'N'), get profile without the user_type check
      // This allows registration flow to work
      try {
        updatedProfile = await V2ProfileService.getProfile(userId);
      } catch (profileError) {
        // If getProfile fails (e.g., user_type 'N'), return success with basic info
        if (profileError.message === 'USER_NOT_FOUND' && user.user_type === 'N') {
          updatedProfile = {
            id: user.id,
            name: user.name || '',
            email: user.email || '',
            phone: user.mob_num ? String(user.mob_num) : '',
            user_type: user.user_type,
            app_type: user.app_type || 'vendor_app',
          };
        } else {
          throw profileError;
        }
      }

      return res.json({
        status: 'success',
        msg: 'Aadhar card uploaded successfully',
        data: {
          image_url: s3Result.s3Url,
          profile: updatedProfile
        },
      });
    } catch (error) {
      console.error('V2ProfileController.uploadAadharCard error:', error);

      if (error.message === 'USER_NOT_FOUND') {
        return res.status(404).json({
          status: 'error',
          msg: 'User not found',
          data: null,
        });
      }

      return res.status(500).json({
        status: 'error',
        msg: 'Failed to upload Aadhar card',
        data: null,
      });
    }
  }

  /**
   * POST /api/v2/profile/:userId/driving-license
   * Upload driving license (compressed to 50KB and uploaded to S3)
   * Available for all users
   */
  static async uploadDrivingLicense(req, res) {
    try {
      const { userId } = req.params;

      if (!userId) {
        return res.status(400).json({
          status: 'error',
          msg: 'User ID is required',
          data: null,
        });
      }

      if (!req.file) {
        return res.status(400).json({
          status: 'error',
          msg: 'PDF file is required',
          data: null,
        });
      }

      // Verify it's a PDF file
      if (req.file.mimetype !== 'application/pdf') {
        return res.status(400).json({
          status: 'error',
          msg: 'Only PDF files are allowed',
          data: null,
        });
      }

      // Check if user exists BEFORE uploading to S3
      const User = require('../models/User');
      const user = await User.findById(userId);
      if (!user) {
        return res.status(404).json({
          status: 'error',
          msg: 'User not found',
          data: null,
        });
      }

      console.log(`📤 Uploading driving license for user ${userId}`);
      console.log(`📤 Original file size: ${(req.file.buffer.length / 1024).toFixed(2)}KB`);

      // Generate unique filename
      const ext = path.extname(req.file.originalname).toLowerCase() || '.pdf';
      const filename = `driving-license-${userId}-${Date.now()}${ext}`;

      // Upload PDF directly to S3 (no compression for PDFs)
      const s3Result = await uploadBufferToS3(req.file.buffer, filename, 'documents');
      console.log(`✅ Driving license uploaded to S3: ${s3Result.s3Url}`);

      // Update profile based on user type
      let updatedProfile;
      if (user.user_type === 'D') {
        // For delivery users, update delivery_boy table
        const DeliveryBoy = require('../models/DeliveryBoy');
        const deliveryBoy = await DeliveryBoy.findByUserId(userId);
        const updateData = { driving_license: s3Result.s3Url };
        
        // If status is 'rejected', change it to 'pending' when user resubmits documents
        if (deliveryBoy && deliveryBoy.approval_status === 'rejected') {
          updateData.approval_status = 'pending';
          updateData.application_submitted_at = new Date().toISOString();
          console.log(`📋 Driving license upload - changing approval_status from 'rejected' to 'pending' for delivery user ${userId} (resubmission)`);
        }
        
        if (deliveryBoy) {
          await DeliveryBoy.update(deliveryBoy.id, updateData);
        } else {
          // Create delivery boy record if it doesn't exist
          await DeliveryBoy.create({
            user_id: userId,
            name: user.name || '',
            driving_license: s3Result.s3Url,
          });
        }
      } else {
        // For B2B/B2C users, update shop table
        const Shop = require('../models/Shop');
        const shop = await Shop.findByUserId(userId);
        const updateData = { driving_license: s3Result.s3Url };
        
        // If status is 'rejected', change it to 'pending' when user resubmits documents
        if (shop && shop.approval_status === 'rejected') {
          updateData.approval_status = 'pending';
          updateData.application_submitted_at = new Date().toISOString();
          console.log(`📋 Driving license upload - changing approval_status from 'rejected' to 'pending' for user ${userId} (resubmission)`);
        }
        
        if (shop) {
          await Shop.update(shop.id, updateData);
        } else {
          // Create shop record if it doesn't exist
          await Shop.create({
            user_id: userId,
            shopname: user.name || '',
            driving_license: s3Result.s3Url,
          });
        }
      }

      // Get updated profile
      updatedProfile = await V2ProfileService.getProfile(userId);

      return res.json({
        status: 'success',
        msg: 'Driving license uploaded successfully',
        data: {
          image_url: s3Result.s3Url,
          profile: updatedProfile
        },
      });
    } catch (error) {
      console.error('V2ProfileController.uploadDrivingLicense error:', error);

      if (error.message === 'USER_NOT_FOUND') {
        return res.status(404).json({
          status: 'error',
          msg: 'User not found',
          data: null,
        });
      }

      return res.status(500).json({
        status: 'error',
        msg: 'Failed to upload driving license',
        data: null,
      });
    }
  }

  /**
   * PUT /api/v2/profile/:userId/complete-delivery-signup
   * Manually complete delivery signup and update user_type to 'D'
   * This is a fallback endpoint if the regular updateProfile doesn't update user_type
   */
  static async completeDeliverySignup(req, res) {
    const { userId } = req.params;

    if (!userId) {
      return res.status(400).json({
        status: 'error',
        msg: 'User ID is required',
        data: null,
      });
    }

    try {
      console.log(`🔄 Manual delivery signup completion requested for user ${userId}`);

      const profile = await V2ProfileService.completeDeliverySignup(userId);

      return res.json({
        status: 'success',
        msg: 'Delivery signup completed successfully',
        data: profile,
      });
    } catch (error) {
      console.error('V2ProfileController.completeDeliverySignup error:', error);
      console.error('Error stack:', error.stack);

      if (error.message === 'USER_NOT_FOUND') {
        return res.status(404).json({
          status: 'error',
          msg: 'User not found',
          data: null,
        });
      }

      if (error.message === 'DELIVERY_RECORD_NOT_FOUND') {
        return res.status(404).json({
          status: 'error',
          msg: 'Delivery record not found. Please complete the delivery signup form first.',
          data: null,
        });
      }

      if (error.message === 'SIGNUP_NOT_COMPLETE') {
        return res.status(400).json({
          status: 'error',
          msg: 'Delivery signup is not complete. Please fill all required fields.',
          data: null,
        });
      }

      if (error.message === 'ALREADY_COMPLETE') {
        try {
          const profile = await V2ProfileService.getProfile(userId);
          return res.status(200).json({
            status: 'success',
            msg: 'Delivery signup is already complete',
            data: profile,
          });
        } catch (profileError) {
          console.error('Error fetching profile for ALREADY_COMPLETE:', profileError);
          return res.status(200).json({
            status: 'success',
            msg: 'Delivery signup is already complete',
            data: null,
          });
        }
      }

      return res.status(500).json({
        status: 'error',
        msg: error.message || 'Failed to complete delivery signup',
        data: null,
      });
    }
  }

  /**
   * DELETE /api/v2/profile/:userId
   * Delete user account (soft delete)
   */
  static async deleteAccount(req, res) {
    try {
      const { userId } = req.params;

      if (!userId) {
        return res.status(400).json({
          status: 'error',
          msg: 'User ID is required',
          data: null,
        });
      }

      const result = await V2ProfileService.deleteAccount(userId);

      return res.json({
        status: 'success',
        msg: 'Account deleted successfully',
        data: result,
      });
    } catch (error) {
      console.error('V2ProfileController.deleteAccount error:', error);

      if (error.message === 'USER_NOT_FOUND') {
        return res.status(404).json({
          status: 'error',
          msg: 'User not found',
          data: null,
        });
      }

      return res.status(500).json({
        status: 'error',
        msg: error.message || 'Failed to delete account',
        data: null,
      });
    }
  }

  /**
   * PUT /api/v2/profile/:userId/categories
   * Update user's operating categories
   */
  static async updateUserCategories(req, res) {
    try {
      const { userId } = req.params;
      const { categoryIds } = req.body;

      if (!userId) {
        return res.status(400).json({
          status: 'error',
          msg: 'User ID is required',
          data: null,
        });
      }

      if (!Array.isArray(categoryIds)) {
        return res.status(400).json({
          status: 'error',
          msg: 'categoryIds must be an array',
          data: null,
        });
      }

      // Validate category IDs are numbers
      const validCategoryIds = categoryIds
        .map(id => {
          const numId = typeof id === 'string' ? parseInt(id) : id;
          return isNaN(numId) ? null : numId;
        })
        .filter(id => id !== null);

      // Update user's operating categories
      const User = require('../models/User');
      const user = await User.findById(userId);
      
      if (!user) {
        return res.status(404).json({
          status: 'error',
          msg: 'User not found',
          data: null,
        });
      }

      // Update user with operating categories
      const updateData = {
        operating_categories: validCategoryIds
      };

      await User.updateProfile(userId, updateData);

      // Get updated user
      const updatedUser = await User.findById(userId);
      const { password: _, ...userWithoutPassword } = updatedUser;

      return res.json({
        status: 'success',
        msg: 'Operating categories updated successfully',
        data: {
          user_id: userId,
          operating_categories: validCategoryIds,
          categories_count: validCategoryIds.length
        },
      });
    } catch (error) {
      console.error('V2ProfileController.updateUserCategories error:', error);

      return res.status(500).json({
        status: 'error',
        msg: error.message || 'Failed to update operating categories',
        data: null,
      });
    }
  }

  /**
   * GET /api/v2/profile/:userId/categories
   * Get user's operating categories
   */
  static async getUserCategories(req, res) {
    try {
      const { userId } = req.params;

      if (!userId) {
        return res.status(400).json({
          status: 'error',
          msg: 'User ID is required',
          data: null,
        });
      }

      // Get user
      const User = require('../models/User');
      const user = await User.findById(userId);
      
      if (!user) {
        return res.status(404).json({
          status: 'error',
          msg: 'User not found',
          data: null,
        });
      }

      // Get category details if category IDs exist
      const categoryIds = user.operating_categories || [];
      let categories = [];

      if (categoryIds.length > 0) {
        const CategoryImgKeywords = require('../models/CategoryImgKeywords');
        
        // Fetch category details
        const categoryPromises = categoryIds.map(id => 
          CategoryImgKeywords.findById(id)
        );
        const categoryResults = await Promise.all(categoryPromises);
        
        categories = categoryResults
          .filter(cat => cat !== null)
          .map(cat => ({
            id: cat.id,
            name: cat.category_name || cat.cat_name || '',
            image: cat.category_img || cat.cat_img || ''
          }));
      }

      return res.json({
        status: 'success',
        msg: 'Operating categories retrieved successfully',
        data: {
          user_id: userId,
          category_ids: categoryIds,
          categories: categories,
          categories_count: categories.length
        },
      });
    } catch (error) {
      console.error('V2ProfileController.getUserCategories error:', error);

      return res.status(500).json({
        status: 'error',
        msg: error.message || 'Failed to retrieve operating categories',
        data: null,
      });
    }
  }

  /**
   * PUT /api/v2/profile/:userId/subcategories
   * Update user's operating subcategories with custom prices
   * Body: { subcategories: [{ subcategoryId: number, customPrice: string, priceUnit: string }] }
   */
  static async updateUserSubcategories(req, res) {
    try {
      const { userId } = req.params;
      const { subcategories } = req.body;

      if (!userId) {
        return res.status(400).json({
          status: 'error',
          msg: 'User ID is required',
          data: null,
        });
      }

      if (!Array.isArray(subcategories)) {
        return res.status(400).json({
          status: 'error',
          msg: 'subcategories must be an array',
          data: null,
        });
      }

      // Validate and format subcategories
      const validSubcategories = subcategories
        .map(item => {
          const subcategoryId = typeof item.subcategoryId === 'string' 
            ? parseInt(item.subcategoryId) 
            : item.subcategoryId;
          
          if (isNaN(subcategoryId)) return null;
          
          return {
            subcategory_id: subcategoryId,
            custom_price: item.customPrice || item.custom_price || '',
            price_unit: item.priceUnit || item.price_unit || 'kg'
          };
        })
        .filter(item => item !== null);

      // Update user with operating subcategories
      const User = require('../models/User');
      const user = await User.findById(userId);
      
      if (!user) {
        return res.status(404).json({
          status: 'error',
          msg: 'User not found',
          data: null,
        });
      }

      // Fetch subcategory details to get main_category_id for each subcategory
      const Subcategory = require('../models/Subcategory');
      const subcategoryPromises = validSubcategories.map(item => 
        Subcategory.findById(item.subcategory_id)
      );
      const subcategoryResults = await Promise.all(subcategoryPromises);
      
      // Extract unique main_category_ids from the subcategories
      const mainCategoryIds = new Set();
      subcategoryResults.forEach((subcat, index) => {
        if (subcat && subcat.main_category_id) {
          mainCategoryIds.add(subcat.main_category_id);
        }
      });
      
      // Get current user's operating subcategories and merge with new ones
      const currentOperatingSubcategories = user.operating_subcategories || [];
      console.log(`📊 [updateUserSubcategories] Current subcategories count: ${currentOperatingSubcategories.length}`);
      
      // Create a map of existing subcategories by subcategory_id to avoid duplicates
      const existingSubcategoriesMap = new Map();
      currentOperatingSubcategories.forEach(subcat => {
        const subcatId = subcat.subcategory_id || subcat.subcategoryId;
        if (subcatId) {
          existingSubcategoriesMap.set(subcatId, subcat);
        }
      });
      
      // First, fetch subcategory details for new subcategories to get their main_category_ids
      const newSubcategoryPromises = validSubcategories.map(item => 
        Subcategory.findById(item.subcategory_id)
      );
      const newSubcategoryResults = await Promise.all(newSubcategoryPromises);
      
      // Merge new subcategories with existing ones, preserving main_category_id
      validSubcategories.forEach((newSubcat, index) => {
        const subcatDetails = newSubcategoryResults[index];
        const mergedSubcat = {
          subcategory_id: newSubcat.subcategory_id,
          custom_price: newSubcat.custom_price || '',
          price_unit: newSubcat.price_unit || 'kg',
          main_category_id: subcatDetails?.main_category_id || null
        };
        existingSubcategoriesMap.set(newSubcat.subcategory_id, mergedSubcat);
      });
      
      // Get final merged subcategories with all data (including main_category_id)
      const finalMergedSubcategories = Array.from(existingSubcategoriesMap.values());
      console.log(`📊 [updateUserSubcategories] Merged subcategories count: ${finalMergedSubcategories.length} (${currentOperatingSubcategories.length} existing + ${validSubcategories.length} new)`);
      
      // Get current user's operating categories for comparison
      const currentOperatingCategories = user.operating_categories || [];
      
      // Get all main_category_ids from ALL merged subcategories (after removal)
      // This ensures we only keep categories that have at least one subcategory remaining
      const finalCategoryIdsSet = new Set();
      
      if (finalMergedSubcategories.length > 0) {
        // Extract unique main_category_ids from merged subcategories
        // First try to get from stored main_category_id, otherwise fetch from database
        finalMergedSubcategories.forEach((item) => {
          if (item.main_category_id) {
            finalCategoryIdsSet.add(item.main_category_id);
          }
        });
        
        // For any subcategories without main_category_id, fetch from database
        const subcategoriesNeedingFetch = finalMergedSubcategories.filter(item => !item.main_category_id);
        if (subcategoriesNeedingFetch.length > 0) {
          const fetchPromises = subcategoriesNeedingFetch.map(item => 
            Subcategory.findById(item.subcategory_id || item.subcategoryId)
          );
          const fetchResults = await Promise.all(fetchPromises);
          
          fetchResults.forEach((subcat, index) => {
            if (subcat && subcat.main_category_id) {
              finalCategoryIdsSet.add(subcat.main_category_id);
              // Update the merged subcategory with main_category_id for future use
              const originalItem = subcategoriesNeedingFetch[index];
              const mapKey = originalItem.subcategory_id || originalItem.subcategoryId;
              if (existingSubcategoriesMap.has(mapKey)) {
                existingSubcategoriesMap.get(mapKey).main_category_id = subcat.main_category_id;
              }
            }
          });
        }
      }
      // If finalMergedSubcategories is empty, finalCategoryIdsSet will be empty, removing all categories
      
      // Recreate finalMergedSubcategories after all updates to ensure it has the latest main_category_ids
      // Update the existing array reference by clearing and refilling it
      finalMergedSubcategories.splice(0, finalMergedSubcategories.length, ...Array.from(existingSubcategoriesMap.values()));
      
      // Convert back to array - this will only include categories that have at least one subcategory
      // Ensure it's always an array (empty array if no categories remain)
      const updatedCategoryIds = Array.from(finalCategoryIdsSet);
      
      console.log(`🔍 [updateUserSubcategories] Category removal check:`, {
        mergedSubcategoriesCount: finalMergedSubcategories.length,
        finalCategoryIdsSetSize: finalCategoryIdsSet.size,
        updatedCategoryIds: updatedCategoryIds,
        willRemoveAllCategories: finalMergedSubcategories.length === 0 && updatedCategoryIds.length === 0
      });
      
      console.log(`📊 [updateUserSubcategories] Category IDs after update:`, {
        before: currentOperatingCategories.length,
        after: updatedCategoryIds.length,
        removed: currentOperatingCategories.length - updatedCategoryIds.length,
        categoryIds: updatedCategoryIds
      });

      // Update user with merged operating subcategories and categories
      // Note: User.updateProfile automatically adds updated_at, so we don't include it here
      const updateData = {
        operating_subcategories: finalMergedSubcategories,
        operating_categories: updatedCategoryIds
      };

      console.log(`💾 [updateUserSubcategories] Updating user ${userId} with:`, {
        new_subcategories_count: validSubcategories.length,
        merged_subcategories_count: finalMergedSubcategories.length,
        categories_count: updatedCategoryIds.length,
        category_ids: updatedCategoryIds,
        new_subcategories: validSubcategories.map(s => ({
          subcategory_id: s.subcategory_id,
          custom_price: s.custom_price,
          price_unit: s.price_unit
        }))
      });

      await User.updateProfile(userId, updateData);
      
      // Verify the update by fetching the user again
      const updatedUser = await User.findById(userId);
      console.log(`✅ [updateUserSubcategories] Verification - User now has:`, {
        subcategories_count: updatedUser?.operating_subcategories?.length || 0,
        categories_count: updatedUser?.operating_categories?.length || 0,
        categories: updatedUser?.operating_categories || [],
        subcategories: updatedUser?.operating_subcategories?.map(s => ({
          id: s.subcategory_id || s.subcategoryId,
          category_id: s.main_category_id
        })) || []
      });

      return res.json({
        status: 'success',
        msg: 'Operating subcategories updated successfully',
        data: {
          user_id: userId,
          subcategories: finalMergedSubcategories,
          subcategories_count: finalMergedSubcategories.length,
          new_subcategories_count: validSubcategories.length,
          categories: updatedCategoryIds,
          total_categories: updatedCategoryIds.length
        },
      });
    } catch (error) {
      console.error('V2ProfileController.updateUserSubcategories error:', error);

      return res.status(500).json({
        status: 'error',
        msg: error.message || 'Failed to update operating subcategories',
        data: null,
      });
    }
  }

  /**
   * DELETE /api/v2/profile/:userId/categories/:categoryId
   * Remove a category and all its subcategories from user's operating categories/subcategories
   */
  static async removeUserCategory(req, res) {
    try {
      const { userId, categoryId } = req.params;

      if (!userId) {
        return res.status(400).json({
          status: 'error',
          msg: 'User ID is required',
          data: null,
        });
      }

      if (!categoryId) {
        return res.status(400).json({
          status: 'error',
          msg: 'Category ID is required',
          data: null,
        });
      }

      const categoryIdNum = Number(categoryId);
      if (isNaN(categoryIdNum)) {
        return res.status(400).json({
          status: 'error',
          msg: 'Invalid category ID',
          data: null,
        });
      }

      // Get user
      const User = require('../models/User');
      const user = await User.findById(userId);
      
      if (!user) {
        return res.status(404).json({
          status: 'error',
          msg: 'User not found',
          data: null,
        });
      }

      // Get current operating subcategories
      const currentOperatingSubcategories = user.operating_subcategories || [];
      const currentOperatingCategories = user.operating_categories || [];

      console.log(`🗑️ [removeUserCategory] Removing category ${categoryIdNum} for user ${userId}`);
      console.log(`📊 [removeUserCategory] Before: ${currentOperatingSubcategories.length} subcategories, ${currentOperatingCategories.length} categories`);

      // Filter out subcategories that belong to this category
      // We need to fetch subcategory details to check main_category_id
      const Subcategory = require('../models/Subcategory');
      const subcategoryPromises = currentOperatingSubcategories.map(item => 
        Subcategory.findById(item.subcategory_id || item.subcategoryId)
      );
      const subcategoryResults = await Promise.all(subcategoryPromises);

      // Filter subcategories - keep only those that don't belong to the removed category
      const subcategoriesToKeep = [];
      currentOperatingSubcategories.forEach((userSubcat, index) => {
        const subcatDetails = subcategoryResults[index];
        if (subcatDetails && Number(subcatDetails.main_category_id) !== categoryIdNum) {
          subcategoriesToKeep.push(userSubcat);
        }
      });

      // Get unique category IDs from remaining subcategories
      const remainingCategoryIdsSet = new Set();
      if (subcategoriesToKeep.length > 0) {
        const remainingSubcatPromises = subcategoriesToKeep.map(item => 
          Subcategory.findById(item.subcategory_id || item.subcategoryId)
        );
        const remainingSubcatResults = await Promise.all(remainingSubcatPromises);
        
        remainingSubcatResults.forEach((subcat) => {
          if (subcat && subcat.main_category_id) {
            remainingCategoryIdsSet.add(Number(subcat.main_category_id));
          }
        });
      }

      const updatedCategoryIds = Array.from(remainingCategoryIdsSet);
      const removedSubcategoriesCount = currentOperatingSubcategories.length - subcategoriesToKeep.length;

      console.log(`📊 [removeUserCategory] After: ${subcategoriesToKeep.length} subcategories, ${updatedCategoryIds.length} categories`);
      console.log(`🗑️ [removeUserCategory] Removed: ${removedSubcategoriesCount} subcategories, category ${categoryIdNum}`);

      // Update user with remaining subcategories and categories
      const updateData = {
        operating_subcategories: subcategoriesToKeep,
        operating_categories: updatedCategoryIds
      };

      await User.updateProfile(userId, updateData);
      
      // Verify the update
      const updatedUser = await User.findById(userId);
      console.log(`✅ [removeUserCategory] Verification - User now has:`, {
        subcategories_count: updatedUser?.operating_subcategories?.length || 0,
        categories_count: updatedUser?.operating_categories?.length || 0,
        categories: updatedUser?.operating_categories || []
      });

      return res.json({
        status: 'success',
        msg: 'Category and subcategories removed successfully',
        data: {
          user_id: userId,
          removed_category_id: categoryIdNum,
          removed_subcategories_count: removedSubcategoriesCount,
          remaining_subcategories_count: subcategoriesToKeep.length,
          remaining_categories: updatedCategoryIds,
          remaining_categories_count: updatedCategoryIds.length
        },
      });
    } catch (error) {
      console.error('V2ProfileController.removeUserCategory error:', error);

      return res.status(500).json({
        status: 'error',
        msg: error.message || 'Failed to remove category',
        data: null,
      });
    }
  }

  /**
   * DELETE /api/v2/profile/:userId/subcategories
   * Remove specific subcategories from user's operating subcategories
   * Body: { subcategoryIds: [number] }
   */
  static async removeUserSubcategories(req, res) {
    try {
      const { userId } = req.params;
      const { subcategoryIds } = req.body;

      if (!userId) {
        return res.status(400).json({
          status: 'error',
          msg: 'User ID is required',
          data: null,
        });
      }

      if (!Array.isArray(subcategoryIds) || subcategoryIds.length === 0) {
        return res.status(400).json({
          status: 'error',
          msg: 'subcategoryIds must be a non-empty array',
          data: null,
        });
      }

      // Validate subcategory IDs are numbers
      const validSubcategoryIds = subcategoryIds
        .map(id => {
          const numId = typeof id === 'string' ? parseInt(id) : id;
          return isNaN(numId) ? null : numId;
        })
        .filter(id => id !== null);

      if (validSubcategoryIds.length === 0) {
        return res.status(400).json({
          status: 'error',
          msg: 'No valid subcategory IDs provided',
          data: null,
        });
      }

      // Get user
      const User = require('../models/User');
      const user = await User.findById(userId);
      
      if (!user) {
        return res.status(404).json({
          status: 'error',
          msg: 'User not found',
          data: null,
        });
      }

      // Get current operating subcategories
      const currentOperatingSubcategories = user.operating_subcategories || [];
      const currentOperatingCategories = user.operating_categories || [];

      console.log(`🗑️ [removeUserSubcategories] Removing ${validSubcategoryIds.length} subcategories for user ${userId}`);
      console.log(`📊 [removeUserSubcategories] Before: ${currentOperatingSubcategories.length} subcategories, ${currentOperatingCategories.length} categories`);

      // Filter out the subcategories to be removed
      const subcategoriesToKeep = currentOperatingSubcategories.filter(subcat => {
        const subcatId = subcat.subcategory_id || subcat.subcategoryId;
        return !validSubcategoryIds.includes(Number(subcatId));
      });

      // Get unique category IDs from remaining subcategories
      const Subcategory = require('../models/Subcategory');
      const remainingCategoryIdsSet = new Set();
      
      if (subcategoriesToKeep.length > 0) {
        const remainingSubcatPromises = subcategoriesToKeep.map(item => 
          Subcategory.findById(item.subcategory_id || item.subcategoryId)
        );
        const remainingSubcatResults = await Promise.all(remainingSubcatPromises);
        
        remainingSubcatResults.forEach((subcat) => {
          if (subcat && subcat.main_category_id) {
            remainingCategoryIdsSet.add(Number(subcat.main_category_id));
          }
        });
      }

      const updatedCategoryIds = Array.from(remainingCategoryIdsSet);
      const removedCount = currentOperatingSubcategories.length - subcategoriesToKeep.length;

      console.log(`📊 [removeUserSubcategories] After: ${subcategoriesToKeep.length} subcategories, ${updatedCategoryIds.length} categories`);
      console.log(`🗑️ [removeUserSubcategories] Removed: ${removedCount} subcategories`);

      // Update user with remaining subcategories and categories
      const updateData = {
        operating_subcategories: subcategoriesToKeep,
        operating_categories: updatedCategoryIds
      };

      await User.updateProfile(userId, updateData);
      
      // Verify the update
      const updatedUser = await User.findById(userId);
      console.log(`✅ [removeUserSubcategories] Verification - User now has:`, {
        subcategories_count: updatedUser?.operating_subcategories?.length || 0,
        categories_count: updatedUser?.operating_categories?.length || 0,
        categories: updatedUser?.operating_categories || []
      });

      return res.json({
        status: 'success',
        msg: 'Subcategories removed successfully',
        data: {
          user_id: userId,
          removed_subcategory_ids: validSubcategoryIds,
          removed_count: removedCount,
          remaining_subcategories_count: subcategoriesToKeep.length,
          remaining_categories: updatedCategoryIds,
          remaining_categories_count: updatedCategoryIds.length
        },
      });
    } catch (error) {
      console.error('V2ProfileController.removeUserSubcategories error:', error);

      return res.status(500).json({
        status: 'error',
        msg: error.message || 'Failed to remove subcategories',
        data: null,
      });
    }
  }

  /**
   * GET /api/v2/profile/:userId/subcategories
   * Get user's operating subcategories with custom prices
   */
  static async getUserSubcategories(req, res) {
    try {
      const { userId } = req.params;

      if (!userId) {
        return res.status(400).json({
          status: 'error',
          msg: 'User ID is required',
          data: null,
        });
      }

      console.log(`🔍 [getUserSubcategories] Fetching subcategories for user ID: ${userId}`);

      // Get user
      const User = require('../models/User');
      const user = await User.findById(userId);
      
      if (!user) {
        console.log(`❌ [getUserSubcategories] User not found: ${userId}`);
        return res.status(404).json({
          status: 'error',
          msg: 'User not found',
          data: null,
        });
      }

      // Get subcategory details if subcategory IDs exist
      const userSubcategories = user.operating_subcategories || [];
      console.log(`📊 [getUserSubcategories] User has ${userSubcategories.length} operating subcategories stored`);
      console.log(`📋 [getUserSubcategories] Raw operating_subcategories:`, JSON.stringify(userSubcategories, null, 2));
      
      let subcategories = [];

      if (userSubcategories.length > 0) {
        const Subcategory = require('../models/Subcategory');
        
        // Fetch subcategory details
        console.log(`🔍 [getUserSubcategories] Fetching ${userSubcategories.length} subcategory details...`);
        const subcategoryPromises = userSubcategories.map((item, index) => {
          const subcatId = item.subcategory_id || item.subcategoryId;
          console.log(`  [${index}] Fetching subcategory ID: ${subcatId} (type: ${typeof subcatId})`);
          return Subcategory.findById(subcatId);
        });
        const subcategoryResults = await Promise.all(subcategoryPromises);
        
        console.log(`✅ [getUserSubcategories] Fetched ${subcategoryResults.length} subcategory results`);
        console.log(`📊 [getUserSubcategories] Null results: ${subcategoryResults.filter(r => r === null).length}`);
        
        // Map results while preserving the relationship with user subcategories
        // Use the original index to match userSubcat correctly, even after filtering
        subcategories = subcategoryResults
          .map((subcat, originalIndex) => {
            if (subcat === null) {
              const userSubcat = userSubcategories[originalIndex];
              const subcatId = userSubcat?.subcategory_id || userSubcat?.subcategoryId;
              console.log(`⚠️ [getUserSubcategories] Subcategory ID ${subcatId} not found in database`);
              return null;
            }
            
            const userSubcat = userSubcategories[originalIndex];
            const result = {
              subcategory_id: subcat.id,
              name: subcat.subcategory_name || subcat.name || '',
              image: subcat.subcategory_img || subcat.image || '',
              main_category_id: subcat.main_category_id,
              default_price: subcat.default_price || '',
              price_unit: subcat.price_unit || 'kg',
              custom_price: userSubcat?.custom_price || userSubcat?.customPrice || '',
              // Use custom price if available, otherwise default price
              display_price: userSubcat?.custom_price || userSubcat?.customPrice || subcat.default_price || '',
              display_price_unit: userSubcat?.price_unit || userSubcat?.priceUnit || subcat.price_unit || 'kg'
            };
            
            console.log(`✅ [getUserSubcategories] Mapped subcategory: ${result.name} (ID: ${result.subcategory_id}, main_category_id: ${result.main_category_id})`);
            return result;
          })
          .filter(subcat => subcat !== null); // Filter out null entries after mapping
        
        console.log(`📊 [getUserSubcategories] Final subcategories count: ${subcategories.length}`);
      } else {
        console.log(`⚠️ [getUserSubcategories] No operating subcategories found for user ${userId}`);
      }

      return res.json({
        status: 'success',
        msg: 'Operating subcategories retrieved successfully',
        data: {
          user_id: userId,
          subcategories: subcategories,
          subcategories_count: subcategories.length
        },
      });
    } catch (error) {
      console.error('❌ [getUserSubcategories] Error:', error);
      console.error('❌ [getUserSubcategories] Error stack:', error.stack);

      return res.status(500).json({
        status: 'error',
        msg: error.message || 'Failed to retrieve operating subcategories',
        data: null,
      });
    }
  }
}

module.exports = V2ProfileController;
