/**
 * V2 B2B Signup Controller
 * Handles B2B business signup requests
 */

const V2B2BSignupService = require('../services/shop/v2B2BSignupService');
const { uploadBufferToS3 } = require('../utils/s3Upload');
const RedisCache = require('../utils/redisCache');
const path = require('path');

class V2B2BSignupController {
  /**
   * POST /api/v2/b2b-signup/:userId/document
   * Upload B2B signup document (business license, GST certificate, address proof, KYC owner)
   * Body: multipart/form-data with 'file' field and 'documentType' field
   */
  static async uploadDocument(req, res) {
    try {
      const { userId } = req.params;
      const { documentType } = req.body; // 'business-license', 'gst-certificate', 'address-proof', 'kyc-owner'

      if (!userId) {
        return res.status(400).json({
          status: 'error',
          msg: 'User ID is required',
          data: null,
        });
      }

      if (!documentType) {
        return res.status(400).json({
          status: 'error',
          msg: 'Document type is required',
          data: null,
        });
      }

      if (!req.file) {
        return res.status(400).json({
          status: 'error',
          msg: 'File is required',
          data: null,
        });
      }

      console.log(`📤 Uploading ${documentType} for user ${userId}`);
      console.log(`📤 File size: ${(req.file.buffer.length / 1024).toFixed(2)}KB`);

      // Generate unique filename
      const ext = path.extname(req.file.originalname).toLowerCase() || '.pdf';
      const filename = `${documentType}-${userId}-${Date.now()}${ext}`;

      // Upload to S3
      const s3Result = await uploadBufferToS3(req.file.buffer, filename, 'b2b-documents');
      console.log(`✅ Document uploaded to S3: ${s3Result.s3Url}`);

      // Check if user has a shop with rejected status and change to pending on document resubmission
      const Shop = require('../models/Shop');
      const shop = await Shop.findByUserId(userId);
      if (shop && shop.approval_status === 'rejected') {
        const updateData = {
          approval_status: 'pending',
          application_submitted_at: new Date().toISOString()
        };
        await Shop.update(shop.id, updateData);
        console.log(`📋 B2B document upload (${documentType}) - changing approval_status from 'rejected' to 'pending' for user ${userId} (resubmission)`);
      }

      // Invalidate v2 API caches
      try {
        await RedisCache.invalidateV2ApiCache('profile', userId);
        console.log(`🗑️  Invalidated v2 profile cache for user ${userId} (B2B document upload)`);
      } catch (err) {
        console.error('Cache invalidation error:', err);
      }

      return res.json({
        status: 'success',
        msg: 'Document uploaded successfully',
        data: {
          document_url: s3Result.s3Url,
          document_type: documentType,
        },
      });
    } catch (error) {
      console.error('V2B2BSignupController.uploadDocument error:', error);

      return res.status(500).json({
        status: 'error',
        msg: error.message || 'Failed to upload document',
        data: null,
      });
    }
  }
  /**
   * POST /api/v2/b2b-signup/:userId
   * Submit B2B signup data
   */
  static async submitSignup(req, res) {
    try {
      const { userId } = req.params;
      const {
        companyName,
        gstNumber,
        panNumber,
        businessAddress,
        contactPersonName,
        contactNumber,
        contactEmail,
        businessLicenseUrl,
        gstCertificateUrl,
        addressProofUrl,
        kycOwnerUrl,
      } = req.body;

      if (!userId) {
        return res.status(400).json({
          status: 'error',
          msg: 'User ID is required',
          data: null,
        });
      }

      const signupData = {
        companyName,
        gstNumber,
        panNumber,
        businessAddress,
        contactPersonName,
        contactNumber,
        contactEmail,
        businessLicenseUrl,
        gstCertificateUrl,
        addressProofUrl,
        kycOwnerUrl,
      };

      const shop = await V2B2BSignupService.submitB2BSignup(userId, signupData);

      // Invalidate v2 API caches
      try {
        await RedisCache.invalidateV2ApiCache('profile', userId);
        await RedisCache.invalidateV2ApiCache('user_categories', userId);
        await RedisCache.invalidateV2ApiCache('user_subcategories', userId);
        console.log(`🗑️  Invalidated v2 profile cache for user ${userId} (B2B signup submitted)`);
      } catch (err) {
        console.error('Cache invalidation error:', err);
      }

      return res.json({
        status: 'success',
        msg: 'B2B signup submitted successfully',
        data: shop,
      });
    } catch (error) {
      console.error('V2B2BSignupController.submitSignup error:', error);

      if (error.message === 'USER_NOT_FOUND') {
        return res.status(404).json({
          status: 'error',
          msg: 'User not found',
          data: null,
        });
      }

      if (error.message === 'INVALID_USER_TYPE') {
        return res.status(400).json({
          status: 'error',
          msg: 'Delivery users cannot submit B2B signup',
          data: null,
        });
      }

      return res.status(500).json({
        status: 'error',
        msg: error.message || 'Failed to submit B2B signup',
        data: null,
      });
    }
  }
}

module.exports = V2B2BSignupController;

    } catch (error) {
      console.error('V2B2BSignupController.submitSignup error:', error);

      if (error.message === 'USER_NOT_FOUND') {
        return res.status(404).json({
          status: 'error',
          msg: 'User not found',
          data: null,
        });
      }

      if (error.message === 'INVALID_USER_TYPE') {
        return res.status(400).json({
          status: 'error',
          msg: 'Delivery users cannot submit B2B signup',
          data: null,
        });
      }

      return res.status(500).json({
        status: 'error',
        msg: error.message || 'Failed to submit B2B signup',
        data: null,
      });
    }
  }
}

module.exports = V2B2BSignupController;
