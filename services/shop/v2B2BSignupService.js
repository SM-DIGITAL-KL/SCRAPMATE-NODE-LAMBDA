/**
 * V2 B2B Signup Service
 * Business logic for B2B business signup
 */

const Shop = require('../../models/Shop');
const User = require('../../models/User');
const RedisCache = require('../../utils/redisCache');

class V2B2BSignupService {
  /**
   * Submit B2B signup data
   * @param {string|number} userId - User ID
   * @param {Object} signupData - Signup data
   * @param {string} signupData.companyName - Company name
   * @param {string} signupData.gstNumber - GST number
   * @param {string} signupData.panNumber - PAN number
   * @param {string} signupData.businessAddress - Business address
   * @param {string} signupData.contactPersonName - Contact person name
   * @param {string} signupData.contactNumber - Contact number
   * @param {string} signupData.contactEmail - Contact email
   * @param {string} signupData.businessLicenseUrl - Business license document URL
   * @param {string} signupData.gstCertificateUrl - GST certificate document URL
   * @param {string} signupData.addressProofUrl - Address proof document URL
   * @param {string} signupData.kycOwnerUrl - KYC owner document URL
   * @returns {Promise<Object>} Updated shop data
   */
  static async submitB2BSignup(userId, signupData) {
    try {
      console.log(`📝 Submitting B2B signup for user ${userId}`);
      console.log('📝 Signup data:', JSON.stringify(signupData, null, 2));

      // Validate user exists
      const user = await User.findById(userId);
      if (!user) {
        throw new Error('USER_NOT_FOUND');
      }

      // Allow B2C users (R) to convert to B2B+B2C (SR)
      // Also allow existing B2B (S) and B2B+B2C (SR) users
      // Block Delivery (D) and Customer app (C) users from B2B signup
      if (user.user_type === 'D') {
        throw new Error('INVALID_USER_TYPE');
      }

      // Convert B2C user (R) to B2B+B2C (SR) when they join B2B network
      let updatedUserType = user.user_type;
      if (user.user_type === 'R') {
        console.log(`🔄 Converting B2C user (R) to B2B+B2C (SR) for user ${userId}`);
        updatedUserType = 'SR';
        await User.updateProfile(userId, { user_type: 'SR' });
        console.log(`✅ User type updated from R to SR for user ${userId}`);
      }

      // Find or create shop
      let shop = await Shop.findByUserId(userId);
      
      // Check if any documents are uploaded
      const hasDocuments = !!(
        signupData.businessLicenseUrl ||
        signupData.gstCertificateUrl ||
        signupData.addressProofUrl ||
        signupData.kycOwnerUrl
      );
      
      // Set approval_status to 'pending' if documents are uploaded from RN app signup
      // If shop already exists with an admin-set status (approved/rejected), preserve it
      // Otherwise, set to 'pending' for new signups with documents
      let approvalStatus = shop?.approval_status || null;
      if (hasDocuments) {
        // Only set to 'pending' if there's no existing approval_status or it's null
        // This ensures new signups get 'pending', but admin decisions are preserved
        if (!approvalStatus || approvalStatus === null) {
          approvalStatus = 'pending';
          console.log(`📋 Documents uploaded from RN app - setting approval_status to 'pending' for user ${userId}`);
        } else {
          // Keep existing status (approved/rejected/pending) - don't override admin decisions
          console.log(`📋 Documents updated - keeping existing approval_status '${approvalStatus}' for user ${userId}`);
        }
      }
      
      const shopData = {
        user_id: userId,
        shopname: signupData.companyName || user.name || '',
        email: signupData.contactEmail || user.email || '',
        contact: signupData.contactNumber || '',
        address: signupData.businessAddress || '',
        shop_type: 1, // Industrial (B2B)
        // Additional B2B fields
        company_name: signupData.companyName || '',
        gst_number: signupData.gstNumber || '',
        pan_number: signupData.panNumber || '',
        contact_person_name: signupData.contactPersonName || '',
        contact_person_email: signupData.contactEmail || '',
        business_license_url: signupData.businessLicenseUrl || '',
        gst_certificate_url: signupData.gstCertificateUrl || '',
        address_proof_url: signupData.addressProofUrl || '',
        kyc_owner_url: signupData.kycOwnerUrl || '',
        approval_status: approvalStatus,
      };

      if (shop) {
        // Update existing shop
        console.log(`📝 Updating existing shop ${shop.id}`);
        await Shop.update(shop.id, shopData);
        shop = await Shop.findById(shop.id);
      } else {
        // Create new shop
        console.log(`📝 Creating new shop for user ${userId}`);
        shop = await Shop.create(shopData);
      }

      // Invalidate B2B users cache since a new B2B user/shop was created or updated
      try {
        await RedisCache.invalidateB2BUsersCache();
        console.log('🗑️  Invalidated B2B users cache after signup');
      } catch (err) {
        console.error('Redis cache invalidation error:', err);
      }

      console.log(`✅ B2B signup submitted successfully for shop ${shop.id}`);
      return shop;
    } catch (error) {
      console.error('❌ V2B2BSignupService.submitB2BSignup error:', error);
      throw error;
    }
  }
}

module.exports = V2B2BSignupService;

