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

      console.log(`📤 Uploading Aadhar card for user ${userId}`);
      console.log(`📤 Original file size: ${(req.file.buffer.length / 1024).toFixed(2)}KB`);

      // Generate unique filename
      const ext = path.extname(req.file.originalname).toLowerCase() || '.pdf';
      const filename = `aadhar-${userId}-${Date.now()}${ext}`;

      // Upload PDF directly to S3 (no compression for PDFs)
      const s3Result = await uploadBufferToS3(req.file.buffer, filename, 'documents');
      console.log(`✅ Aadhar card uploaded to S3: ${s3Result.s3Url}`);

      // Get user to determine type
      const User = require('../models/User');
      const user = await User.findById(userId);
      if (!user) {
        throw new Error('USER_NOT_FOUND');
      }

      // Update profile based on user type
      let updatedProfile;
      if (user.user_type === 'D') {
        // For delivery users, update delivery_boy table
        const DeliveryBoy = require('../models/DeliveryBoy');
        const deliveryBoy = await DeliveryBoy.findByUserId(userId);
        if (deliveryBoy) {
          await DeliveryBoy.update(deliveryBoy.id, { aadhar_card: s3Result.s3Url });
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
        if (shop) {
          await Shop.update(shop.id, { aadhar_card: s3Result.s3Url });
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
      updatedProfile = await V2ProfileService.getProfile(userId);

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

      console.log(`📤 Uploading driving license for user ${userId}`);
      console.log(`📤 Original file size: ${(req.file.buffer.length / 1024).toFixed(2)}KB`);

      // Generate unique filename
      const ext = path.extname(req.file.originalname).toLowerCase() || '.pdf';
      const filename = `driving-license-${userId}-${Date.now()}${ext}`;

      // Upload PDF directly to S3 (no compression for PDFs)
      const s3Result = await uploadBufferToS3(req.file.buffer, filename, 'documents');
      console.log(`✅ Driving license uploaded to S3: ${s3Result.s3Url}`);

      // Get user to determine type
      const User = require('../models/User');
      const user = await User.findById(userId);
      if (!user) {
        throw new Error('USER_NOT_FOUND');
      }

      // Update profile based on user type
      let updatedProfile;
      if (user.user_type === 'D') {
        // For delivery users, update delivery_boy table
        const DeliveryBoy = require('../models/DeliveryBoy');
        const deliveryBoy = await DeliveryBoy.findByUserId(userId);
        if (deliveryBoy) {
          await DeliveryBoy.update(deliveryBoy.id, { driving_license: s3Result.s3Url });
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
        if (shop) {
          await Shop.update(shop.id, { driving_license: s3Result.s3Url });
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
}

module.exports = V2ProfileController;

