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
      console.log('📝 Document URLs check:', {
        businessLicenseUrl: signupData.businessLicenseUrl ? '✅' : '❌',
        gstCertificateUrl: signupData.gstCertificateUrl ? '✅' : '❌',
        addressProofUrl: signupData.addressProofUrl ? '✅' : '❌',
        kycOwnerUrl: signupData.kycOwnerUrl ? '✅' : '❌',
      });

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

      // Update user type only after B2B signup is complete
      // Don't change user type during signup - only after completion
      let updatedUserType = user.user_type;

      // Find or create shop
      let shop = await Shop.findByUserId(userId);
      
      // Check if all required documents are uploaded
      const hasAllDocuments = !!(
        signupData.businessLicenseUrl &&
        signupData.gstCertificateUrl &&
        signupData.addressProofUrl &&
        signupData.kycOwnerUrl
      );
      
      // Check if all required form fields are filled
      const hasCompanyName = signupData.companyName && signupData.companyName.trim() !== '';
      const hasGstNumber = signupData.gstNumber && signupData.gstNumber.trim() !== '';
      const hasCompleteForm = hasCompanyName && hasGstNumber;
      
      // User is only considered a B2B user if BOTH form is complete AND all documents are uploaded
      const isCompleteB2BSignup = hasCompleteForm && hasAllDocuments;
      
      console.log(`📋 B2B signup completeness check:`, {
        hasCompanyName,
        hasGstNumber,
        hasCompleteForm,
        hasAllDocuments,
        isCompleteB2BSignup
      });
      
      // For v1 or new users: Don't save/register if signup is incomplete
      const isV1User = !user.app_version || user.app_version === 'v1' || user.app_version === 'v1.0';
      const isNewUser = !shop || !shop.id;
      
      if ((isV1User || isNewUser) && !isCompleteB2BSignup) {
        console.log(`❌ Incomplete B2B signup for v1/new user - preventing save`);
        throw new Error('INCOMPLETE_SIGNUP: Please complete all required fields and upload all documents before submitting.');
      }
      
      // Set approval_status to 'pending' only if signup is complete (form + all documents)
      // If shop already exists with status 'rejected', change it back to 'pending' when resubmitting
      // Otherwise, preserve approved status
      let approvalStatus = shop?.approval_status || null;
      const currentTime = new Date().toISOString();
      let shouldSetApplicationSubmitted = false;
      
      if (isCompleteB2BSignup) {
        // If status is 'rejected', change it back to 'pending' when user resubmits
        if (approvalStatus === 'rejected') {
          approvalStatus = 'pending';
          shouldSetApplicationSubmitted = true; // Resubmission counts as new application
          console.log(`📋 Complete B2B signup (form + documents) - changing approval_status from 'rejected' to 'pending' for user ${userId} (resubmission)`);
        } else if (!approvalStatus || approvalStatus === null) {
          approvalStatus = 'pending';
          shouldSetApplicationSubmitted = true; // First time submission
          console.log(`📋 Complete B2B signup (form + documents) - setting approval_status to 'pending' for user ${userId}`);
        } else if (approvalStatus === 'approved') {
          // Keep approved status - don't override admin approval
          console.log(`📋 Complete signup - keeping existing approval_status 'approved' for user ${userId}`);
        } else {
          // Status is 'pending' - keep it
          console.log(`📋 Complete signup - keeping existing approval_status 'pending' for user ${userId}`);
        }
        
      } else {
        // Incomplete signup - don't set approval_status and don't change user type
        console.log(`📋 Incomplete B2B signup - not setting approval_status or changing user type for user ${userId}`);
      }
      
      // Only include document URLs if they are provided (not empty strings)
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
        approval_status: approvalStatus,
      };
      
      // Set application_submitted_at when signup is completed for the first time or resubmitted
      if (shouldSetApplicationSubmitted && !shop?.application_submitted_at) {
        shopData.application_submitted_at = currentTime;
        console.log(`📋 Setting application_submitted_at for B2B user: ${userId}`);
      }
      
      // Set review_initiated_at when status is set to pending for the first time
      if (approvalStatus === 'pending' && !shop?.review_initiated_at) {
        shopData.review_initiated_at = currentTime;
        console.log(`📋 Setting review_initiated_at for B2B user: ${userId}`);
      }
      
      // Only add document URLs if they are provided and not empty
      if (signupData.businessLicenseUrl && signupData.businessLicenseUrl.trim() !== '') {
        shopData.business_license_url = signupData.businessLicenseUrl;
      }
      if (signupData.gstCertificateUrl && signupData.gstCertificateUrl.trim() !== '') {
        shopData.gst_certificate_url = signupData.gstCertificateUrl;
      }
      if (signupData.addressProofUrl && signupData.addressProofUrl.trim() !== '') {
        shopData.address_proof_url = signupData.addressProofUrl;
      }
      if (signupData.kycOwnerUrl && signupData.kycOwnerUrl.trim() !== '') {
        shopData.kyc_owner_url = signupData.kycOwnerUrl;
      }

      console.log(`📝 Shop data to save:`, {
        company_name: shopData.company_name,
        gst_number: shopData.gst_number,
        business_license_url: shopData.business_license_url ? '✅' : '❌',
        gst_certificate_url: shopData.gst_certificate_url ? '✅' : '❌',
        address_proof_url: shopData.address_proof_url ? '✅' : '❌',
        kyc_owner_url: shopData.kyc_owner_url ? '✅' : '❌',
        approval_status: shopData.approval_status,
      });
      console.log(`📝 Full shopData object:`, JSON.stringify(shopData, null, 2));

      if (shop) {
        // Update existing shop
        console.log(`📝 Updating existing shop ${shop.id}`);
        await Shop.update(shop.id, shopData);
        // Re-fetch to get updated data
        shop = await Shop.findById(shop.id);
        console.log(`✅ Shop updated, re-fetched shop:`, {
          id: shop.id,
          company_name: shop.company_name,
          gst_number: shop.gst_number,
          business_license_url: shop.business_license_url ? '✅' : '❌',
          gst_certificate_url: shop.gst_certificate_url ? '✅' : '❌',
          address_proof_url: shop.address_proof_url ? '✅' : '❌',
          kyc_owner_url: shop.kyc_owner_url ? '✅' : '❌',
        });
        
        // Invalidate B2B users cache immediately after shop update
        try {
          await RedisCache.invalidateB2BUsersCache();
          // Also invalidate shops cache (used for B2B/B2C availability in categories)
          await RedisCache.invalidateV2ApiCache('shops', null, {});
          console.log('🗑️  Invalidated B2B users cache and shops cache after shop update');
        } catch (err) {
          console.error('Redis cache invalidation error:', err);
        }
      } else {
        // Create new shop
        console.log(`📝 Creating new shop for user ${userId}`);
        shop = await Shop.create(shopData);
        // Re-fetch to ensure we have all fields (including document URLs)
        shop = await Shop.findById(shop.id);
        console.log(`✅ Created shop ${shop.id} for user ${userId}`);
        console.log(`✅ Created shop data:`, {
          id: shop.id,
          company_name: shop.company_name,
          gst_number: shop.gst_number,
          business_license_url: shop.business_license_url ? '✅' : '❌',
          gst_certificate_url: shop.gst_certificate_url ? '✅' : '❌',
          address_proof_url: shop.address_proof_url ? '✅' : '❌',
          kyc_owner_url: shop.kyc_owner_url ? '✅' : '❌',
        });
        
        // Invalidate B2B users cache immediately after shop creation
        try {
          await RedisCache.invalidateB2BUsersCache();
          console.log('🗑️  Invalidated B2B users cache after shop creation');
        } catch (err) {
          console.error('Redis cache invalidation error:', err);
        }
      }
      
      // AFTER saving the shop, verify that all data was saved correctly
      // Only verify if signup was supposed to be complete
      // Use the shop object we just saved/updated instead of re-fetching
      if (isCompleteB2BSignup) {
        // Use the shop object we just saved/updated (already fetched after save)
        // This avoids DynamoDB eventual consistency issues
        if (!shop) {
          console.log(`❌ B2B signup verification failed - shop not found after save`);
          throw new Error('INCOMPLETE_SIGNUP: Shop was not created. Please try again.');
        }
        
        console.log(`🔍 Verifying saved shop data:`, {
          id: shop.id,
          company_name: shop.company_name,
          gst_number: shop.gst_number,
          business_license_url: shop.business_license_url || 'missing',
          gst_certificate_url: shop.gst_certificate_url || 'missing',
          address_proof_url: shop.address_proof_url || 'missing',
          kyc_owner_url: shop.kyc_owner_url || 'missing',
        });
        
        const hasAllB2BDocuments = shop.business_license_url && shop.business_license_url.trim() !== '' &&
                                  shop.gst_certificate_url && shop.gst_certificate_url.trim() !== '' &&
                                  shop.address_proof_url && shop.address_proof_url.trim() !== '' &&
                                  shop.kyc_owner_url && shop.kyc_owner_url.trim() !== '';
        const hasAllB2BFields = shop.company_name && shop.company_name.trim() !== '' &&
                                shop.gst_number && shop.gst_number.trim() !== '';
        const isB2BSignupTrulyComplete = hasAllB2BDocuments && hasAllB2BFields;
        
        if (!isB2BSignupTrulyComplete) {
          console.log(`❌ B2B signup verification failed - not all documents/fields saved correctly`);
          console.log(`   Shop ID: ${shop.id}`);
          console.log(`   Documents check: ${hasAllB2BDocuments}`);
          console.log(`     business_license_url: ${shop.business_license_url ? '✅' : '❌'} (${shop.business_license_url || 'missing'})`);
          console.log(`     gst_certificate_url: ${shop.gst_certificate_url ? '✅' : '❌'} (${shop.gst_certificate_url || 'missing'})`);
          console.log(`     address_proof_url: ${shop.address_proof_url ? '✅' : '❌'} (${shop.address_proof_url || 'missing'})`);
          console.log(`     kyc_owner_url: ${shop.kyc_owner_url ? '✅' : '❌'} (${shop.kyc_owner_url || 'missing'})`);
          console.log(`   Fields check: ${hasAllB2BFields}`);
          console.log(`     company_name: ${shop.company_name ? '✅' : '❌'} (${shop.company_name || 'missing'})`);
          console.log(`     gst_number: ${shop.gst_number ? '✅' : '❌'} (${shop.gst_number || 'missing'})`);
          console.log(`   Full shop object keys:`, Object.keys(shop));
          console.log(`   Full shop object:`, JSON.stringify(shop, null, 2));
          throw new Error('INCOMPLETE_SIGNUP: Signup data was not saved correctly. Please try again.');
        }
        
        console.log(`✅ B2B signup verification passed - all documents and fields saved correctly`);
        
        // Check if user is V1 and needs upgrade to V2
        const isV1User = !user.app_version || user.app_version === 'v1' || user.app_version === 'v1.0';
        
        // Only change user_type if signup is truly complete and verified
        // Update from 'N' (new_user), 'R' (B2C), or other types to appropriate B2B type
        if (user.user_type === 'R') {
          // B2C user completing B2B signup - upgrade to SR (B2B+B2C)
          console.log(`🔄 B2B signup complete - upgrading B2C user (R) to SR (B2B+B2C) for user ${userId}`);
          updatedUserType = 'SR';
          const updateData = { user_type: 'SR' };
          if (isV1User) {
            updateData.app_version = 'v2';
            console.log(`📱 Upgrading V1 user to V2 after B2B signup completion`);
          }
          await User.updateProfile(userId, updateData);
          console.log(`✅ User type updated from R to SR for user ${userId}`);
        } else if (user.user_type === 'N') {
          // New user (N) completing B2B signup - set to B2B (S)
          console.log(`🔄 B2B signup complete - updating new user (N) to S (B2B) for user ${userId}`);
          updatedUserType = 'S';
          const updateData = { user_type: 'S' };
          if (isV1User) {
            updateData.app_version = 'v2';
            console.log(`📱 Upgrading V1 user to V2 after B2B signup completion`);
          }
          await User.updateProfile(userId, updateData);
          console.log(`✅ User type updated from N to S for user ${userId}`);
        } else if (user.user_type !== 'S' && user.user_type !== 'SR') {
          // Other type - set to B2B (S)
          console.log(`🔄 B2B signup complete - setting user type to S (B2B) for user ${userId}`);
          updatedUserType = 'S';
          const updateData = { user_type: 'S' };
          if (isV1User) {
            updateData.app_version = 'v2';
            console.log(`📱 Upgrading V1 user to V2 after B2B signup completion`);
          }
          await User.updateProfile(userId, updateData);
          console.log(`✅ User type updated to S for user ${userId}`);
        }
        
        // Invalidate B2B users cache after user type update
        try {
          await RedisCache.invalidateB2BUsersCache();
          console.log('🗑️  Invalidated B2B users cache after user type update');
        } catch (err) {
          console.error('Redis cache invalidation error:', err);
        }
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


          if (isV1User) {
            updateData.app_version = 'v2';
            console.log(`📱 Upgrading V1 user to V2 after B2B signup completion`);
          }
          await User.updateProfile(userId, updateData);
          console.log(`✅ User type updated to S for user ${userId}`);
        }
        
        // Invalidate B2B users cache after user type update
        try {
          await RedisCache.invalidateB2BUsersCache();
          console.log('🗑️  Invalidated B2B users cache after user type update');
        } catch (err) {
          console.error('Redis cache invalidation error:', err);
        }
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

