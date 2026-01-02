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
      // For R users, check ALL shops to find B2C shop (shop_type = 3) for R->SR conversion detection
      let shop = null;
      let allShops = [];
      
      if (user.user_type === 'R' || user.user_type === 'SR') {
        // For R/SR users, check all shops to find B2C and B2B shops
        allShops = await Shop.findAllByUserId(userId);
        console.log(`🔍 All shops lookup for user ${userId}:`, allShops.length > 0 ? `Found ${allShops.length} shops` : 'Not found');
        
        // Get the first shop for backward compatibility
        shop = allShops.length > 0 ? allShops[0] : null;
      } else {
        shop = await Shop.findByUserId(userId);
      }

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

      // For R users converting to SR, or SR users adding B2B: Check if they already have a B2C shop (shop_type = 3)
      // If so, we'll create a NEW B2B shop instead of updating the existing one
      // Use allShops if available, otherwise check the single shop
      let existingB2CShop = null;
      let existingB2BShop = null;
      if ((user.user_type === 'R' || user.user_type === 'SR') && allShops.length > 0) {
        existingB2CShop = allShops.find(s => s.shop_type === 3);
        existingB2BShop = allShops.find(s => s.shop_type === 1 || s.shop_type === 4);
        console.log(`🔍 R/SR->SR conversion check - found B2C shop:`, existingB2CShop ? `ID ${existingB2CShop.id}, shop_type ${existingB2CShop.shop_type}` : 'None');
        console.log(`🔍 R/SR->SR conversion check - found B2B shop:`, existingB2BShop ? `ID ${existingB2BShop.id}, shop_type ${existingB2BShop.shop_type}` : 'None');
      }
      const existingShopType = existingB2CShop?.shop_type || shop?.shop_type;
      // For R users: converting to SR (has B2C, creating B2B)
      // For SR users: adding B2B shop (has B2C, creating B2B if B2B doesn't exist)
      const isRUserConvertingToSR = user.user_type === 'R' && existingShopType === 3;
      const isSRUserAddingB2B = user.user_type === 'SR' && existingB2CShop && !existingB2BShop;
      const shouldCreateNewB2BShop = isRUserConvertingToSR || isSRUserAddingB2B;
      
      console.log(`🔍 R/SR->SR conversion check:`, {
        user_type: user.user_type,
        existingShopType,
        isRUserConvertingToSR,
        isSRUserAddingB2B,
        shouldCreateNewB2BShop,
        hasB2CShop: !!existingB2CShop,
        hasB2BShop: !!existingB2BShop,
        allShopsCount: allShops.length
      });
      
      // Set approval_status to 'pending' only if signup is complete (form + all documents)
      // If shop already exists with status 'rejected', change it back to 'pending' when resubmitting
      // Otherwise, preserve approved status
      let approvalStatus = null;
      const currentTime = new Date().toISOString();
      let shouldSetApplicationSubmitted = false;

      if (isCompleteB2BSignup) {
        // For R users converting to SR, always start with 'pending' for the new B2B shop
        if (isRUserConvertingToSR) {
          approvalStatus = 'pending';
          shouldSetApplicationSubmitted = true;
          console.log(`📋 R user converting to SR - setting approval_status to 'pending' for new B2B shop`);
        } else if (shop) {
          approvalStatus = shop.approval_status || null;
          // If status is 'rejected', change it back to 'pending' when user resubmits
          if (approvalStatus === 'rejected') {
            approvalStatus = 'pending';
            shouldSetApplicationSubmitted = true;
            console.log(`📋 Complete B2B signup (form + documents) - changing approval_status from 'rejected' to 'pending' for user ${userId} (resubmission)`);
          } else if (!approvalStatus || approvalStatus === null) {
            approvalStatus = 'pending';
            shouldSetApplicationSubmitted = true;
            console.log(`📋 Complete B2B signup (form + documents) - setting approval_status to 'pending' for user ${userId}`);
          } else if (approvalStatus === 'approved') {
            // Keep approved status - don't override admin approval
            console.log(`📋 Complete signup - keeping existing approval_status 'approved' for user ${userId}`);
          } else {
            // Status is 'pending' - keep it
            console.log(`📋 Complete signup - keeping existing approval_status 'pending' for user ${userId}`);
          }
        } else {
          // New shop - set to pending
          approvalStatus = 'pending';
          shouldSetApplicationSubmitted = true;
          console.log(`📋 Complete B2B signup (form + documents) - setting approval_status to 'pending' for user ${userId}`);
        }
      } else {
        // Incomplete signup - don't set approval_status and don't change user type
        console.log(`📋 Incomplete B2B signup - not setting approval_status or changing user type for user ${userId}`);
      }

      // Build lat_log from latitude and longitude if provided
      let latLog = null;
      if (signupData.latitude !== null && signupData.latitude !== undefined && 
          signupData.longitude !== null && signupData.longitude !== undefined) {
        latLog = `${signupData.latitude},${signupData.longitude}`;
        console.log(`📍 Setting shop location from signup data: ${latLog}`);
      }

      // Only include document URLs if they are provided (not empty strings)
      const shopData = {
        user_id: userId, // Always ensure user_id is set to link shop to user
        shopname: signupData.companyName || user.name || '',
        email: signupData.contactEmail || user.email || '',
        contact: signupData.contactNumber || shop?.contact || '',
        address: signupData.businessAddress || shop?.address || '',
        // For R->SR conversion, create new B2B shop with shop_type = 1 or 4
        // For other cases, use existing shop_type or default to 1
        shop_type: isRUserConvertingToSR ? (signupData.shopType || 1) : (shop?.shop_type || 1),
        // Additional B2B fields
        company_name: signupData.companyName || '',
        gst_number: signupData.gstNumber || '',
        pan_number: signupData.panNumber || '',
        contact_person_name: signupData.contactPersonName || '',
        contact_person_email: signupData.contactEmail || '',
        approval_status: approvalStatus,
      };

      // Add location fields from signup data (only if provided)
      if (latLog) {
        shopData.lat_log = latLog;
      }
      if (signupData.latitude !== null && signupData.latitude !== undefined) {
        shopData.latitude = signupData.latitude;
      }
      if (signupData.longitude !== null && signupData.longitude !== undefined) {
        shopData.longitude = signupData.longitude;
      }
      if (signupData.pincode) {
        shopData.pincode = signupData.pincode;
      }
      if (signupData.placeId) {
        shopData.place_id = signupData.placeId;
      }
      if (signupData.state) {
        shopData.state = signupData.state;
      }
      if (signupData.place) {
        shopData.place = signupData.place;
      }
      if (signupData.location) {
        shopData.location = signupData.location;
      }
      
      // Preserve existing shop fields that shouldn't be overwritten (only for non-R->SR conversion)
      if (shop && !isRUserConvertingToSR) {
        // Use new location data from signup if provided, otherwise preserve existing
        if (!latLog && shop.lat_log) shopData.lat_log = shop.lat_log;
        if (!signupData.latitude && shop.latitude) shopData.latitude = shop.latitude;
        if (!signupData.longitude && shop.longitude) shopData.longitude = shop.longitude;
        if (!signupData.location && shop.location) shopData.location = shop.location;
        if (!signupData.state && shop.state) shopData.state = shop.state;
        if (!signupData.place && shop.place) shopData.place = shop.place;
        if (!signupData.pincode && shop.pincode) shopData.pincode = shop.pincode;
        if (!signupData.placeId && shop.place_id) shopData.place_id = shop.place_id;
        // Use existing contact/address if not provided
        if (!shopData.contact && shop.contact) shopData.contact = shop.contact;
        if (!shopData.address && shop.address) shopData.address = shop.address;
      } else if (isRUserConvertingToSR && existingB2CShop) {
        // For R->SR conversion, use new location data from signup if provided, otherwise copy from B2C shop
        // Use existingB2CShop (the B2C shop) instead of shop (which might be the first shop)
        console.log(`📝 R->SR conversion - using location from signup or copying from B2C shop ${existingB2CShop.id}`);
        if (!signupData.businessAddress && existingB2CShop.address) shopData.address = existingB2CShop.address;
        if (!latLog && existingB2CShop.lat_log) {
          shopData.lat_log = existingB2CShop.lat_log;
        }
        if ((signupData.latitude === null || signupData.latitude === undefined) && existingB2CShop.latitude) {
          shopData.latitude = existingB2CShop.latitude;
        }
        if ((signupData.longitude === null || signupData.longitude === undefined) && existingB2CShop.longitude) {
          shopData.longitude = existingB2CShop.longitude;
        }
        if (!signupData.location && existingB2CShop.location) shopData.location = existingB2CShop.location;
        if (!signupData.state && existingB2CShop.state) shopData.state = existingB2CShop.state;
        if (!signupData.place && existingB2CShop.place) shopData.place = existingB2CShop.place;
        if (!signupData.pincode && existingB2CShop.pincode) shopData.pincode = existingB2CShop.pincode;
        if (!signupData.placeId && existingB2CShop.place_id) shopData.place_id = existingB2CShop.place_id;
      }

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

      // For R users converting to SR, or SR users adding B2B: Check if they already have a B2C shop (shop_type = 3)
      // If so, create a NEW B2B shop instead of updating the existing one
      // Note: shouldCreateNewB2BShop is already calculated above
      
      if (shop && !shouldCreateNewB2BShop) {
        // Update existing shop (for S users or SR users who already have B2B shop)
        console.log(`📝 Updating existing shop ${shop.id} for user ${userId}`);
        console.log(`📝 Shop data being updated:`, {
          user_id: shopData.user_id,
          company_name: shopData.company_name,
          gst_number: shopData.gst_number,
          approval_status: shopData.approval_status,
        });
        
        // Ensure user_id is always set to maintain the link
        shopData.user_id = userId;
        
        await Shop.update(shop.id, shopData);
        // Re-fetch to get updated data
        shop = await Shop.findById(shop.id);
        console.log(`✅ Shop updated, re-fetched shop:`, {
          id: shop.id,
          user_id: shop.user_id,
          company_name: shop.company_name,
          gst_number: shop.gst_number,
          business_license_url: shop.business_license_url ? '✅' : '❌',
          gst_certificate_url: shop.gst_certificate_url ? '✅' : '❌',
          address_proof_url: shop.address_proof_url ? '✅' : '❌',
          kyc_owner_url: shop.kyc_owner_url ? '✅' : '❌',
          approval_status: shop.approval_status,
        });
        
        // Verify user_id is correctly linked
        if (shop.user_id !== userId) {
          console.error(`❌ CRITICAL: Shop user_id mismatch! Shop user_id: ${shop.user_id}, Expected: ${userId}`);
          // Fix the user_id if it's wrong
          await Shop.update(shop.id, { user_id: userId });
          console.log(`✅ Fixed shop user_id to ${userId}`);
          // Re-fetch after fix
          shop = await Shop.findById(shop.id);
        }

        // Invalidate shops cache (used for B2B/B2C availability in categories)
        try {
          await RedisCache.invalidateV2ApiCache('shops', null, {});
          console.log('🗑️  Invalidated shops cache after shop update');
        } catch (err) {
          console.error('Redis cache invalidation error:', err);
        }
      } else {
        // Create new shop - either no shop exists, or R/SR user adding B2B shop (need separate B2B shop)
        if (shouldCreateNewB2BShop) {
          if (isRUserConvertingToSR) {
            console.log(`📝 R user converting to SR - creating NEW B2B shop (keeping existing B2C shop ${existingB2CShop?.id || 'unknown'} intact)`);
          } else if (isSRUserAddingB2B) {
            console.log(`📝 SR user adding B2B shop - creating NEW B2B shop (keeping existing B2C shop ${existingB2CShop?.id || 'unknown'} intact)`);
          }
        } else {
          console.log(`📝 Creating new shop for user ${userId}`);
        }
        
        // Create new shop - Check for duplicate shops with the same contact number
        // Skip this check for R->SR or SR->SR conversion since they're intentionally creating a second shop
        if (shopData.contact && !shouldCreateNewB2BShop) {
          const existingShops = await Shop.findByContact(shopData.contact, userId);
          if (existingShops.length > 0) {
            const errorMsg = `A shop with contact number ${shopData.contact} already exists. Please use your existing shop account or contact support.`;
            console.error(`❌ [submitB2BSignup] Duplicate shop detected:`, {
              contact: shopData.contact,
              existingShops: existingShops.map(s => ({ id: s.id, user_id: s.user_id, shopname: s.shopname }))
            });
            throw new Error(errorMsg);
          }
        }
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

        // Note: Admin panel cache will refresh on next load
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
          // B2C user completing B2B signup - upgrade to SR (B2B+B2C) ONLY if they have a B2C shop
          // For R->SR conversion, we should have created a new B2B shop while preserving the existing B2C shop
          if (isRUserConvertingToSR) {
            console.log(`🔄 B2B signup complete - upgrading B2C user (R) to SR (B2B+B2C) for user ${userId} (R->SR conversion)`);
            
            // Store original user details for verification
            const originalUserDetails = {
              id: user.id,
              name: user.name,
              email: user.email,
              mob_num: user.mob_num,
              app_type: user.app_type,
              app_version: user.app_version
            };
            
            // Store original B2C shop details for verification
            const originalB2CShopDetails = existingB2CShop ? {
              id: existingB2CShop.id,
              shopname: existingB2CShop.shopname,
              ownername: existingB2CShop.ownername,
              company_name: existingB2CShop.company_name,
              contact: existingB2CShop.contact,
              address: existingB2CShop.address,
              aadhar_card: existingB2CShop.aadhar_card,
              driving_license: existingB2CShop.driving_license,
              shop_type: existingB2CShop.shop_type,
              approval_status: existingB2CShop.approval_status,
              location: existingB2CShop.location,
              state: existingB2CShop.state,
              place: existingB2CShop.place,
              pincode: existingB2CShop.pincode,
              lat_log: existingB2CShop.lat_log,
              latitude: existingB2CShop.latitude,
              longitude: existingB2CShop.longitude
            } : null;
            
            console.log(`📋 Preserving user details during R->SR conversion:`, {
              id: originalUserDetails.id,
              name: originalUserDetails.name,
              email: originalUserDetails.email,
              mob_num: originalUserDetails.mob_num,
              app_type: originalUserDetails.app_type
            });
            
            if (originalB2CShopDetails) {
              console.log(`📋 Preserving B2C shop details during R->SR conversion:`, {
                shop_id: originalB2CShopDetails.id,
                shopname: originalB2CShopDetails.shopname,
                ownername: originalB2CShopDetails.ownername,
                contact: originalB2CShopDetails.contact,
                address: originalB2CShopDetails.address,
                shop_type: originalB2CShopDetails.shop_type
              });
            }
            
            updatedUserType = 'SR';
            const updateData = { user_type: 'SR' };
            if (isV1User) {
              updateData.app_version = 'v2';
              console.log(`📱 Upgrading V1 user to V2 after B2B signup completion`);
            }
            await User.updateProfile(userId, updateData);
            console.log(`✅ User type updated from R to SR for user ${userId}`);
            
            // Verify user details are preserved (only user_type should change)
            const updatedUser = await User.findById(userId);
            if (updatedUser) {
              const userDetailsPreserved = 
                updatedUser.id === originalUserDetails.id &&
                updatedUser.name === originalUserDetails.name &&
                updatedUser.email === originalUserDetails.email &&
                updatedUser.mob_num === originalUserDetails.mob_num &&
                updatedUser.app_type === originalUserDetails.app_type &&
                updatedUser.user_type === 'SR';
              
              if (userDetailsPreserved) {
                console.log(`✅ User details preserved during R->SR conversion`);
              } else {
                console.error(`❌ User details NOT preserved!`, {
                  original: originalUserDetails,
                  updated: {
                    id: updatedUser.id,
                    name: updatedUser.name,
                    email: updatedUser.email,
                    mob_num: updatedUser.mob_num,
                    app_type: updatedUser.app_type,
                    user_type: updatedUser.user_type
                  }
                });
              }
            }
            
            // Verify B2C shop is preserved (should not be modified)
            if (originalB2CShopDetails) {
              const preservedB2CShop = await Shop.findById(originalB2CShopDetails.id);
              if (preservedB2CShop) {
                const b2cShopPreserved = 
                  preservedB2CShop.id === originalB2CShopDetails.id &&
                  preservedB2CShop.shopname === originalB2CShopDetails.shopname &&
                  preservedB2CShop.ownername === originalB2CShopDetails.ownername &&
                  preservedB2CShop.contact === originalB2CShopDetails.contact &&
                  preservedB2CShop.address === originalB2CShopDetails.address &&
                  preservedB2CShop.aadhar_card === originalB2CShopDetails.aadhar_card &&
                  preservedB2CShop.driving_license === originalB2CShopDetails.driving_license &&
                  preservedB2CShop.shop_type === originalB2CShopDetails.shop_type;
                
                if (b2cShopPreserved) {
                  console.log(`✅ B2C shop details preserved during R->SR conversion (Shop ID: ${preservedB2CShop.id})`);
                } else {
                  console.error(`❌ B2C shop details NOT preserved!`, {
                    original: originalB2CShopDetails,
                    current: {
                      id: preservedB2CShop.id,
                      shopname: preservedB2CShop.shopname,
                      ownername: preservedB2CShop.ownername,
                      contact: preservedB2CShop.contact,
                      address: preservedB2CShop.address,
                      aadhar_card: preservedB2CShop.aadhar_card,
                      driving_license: preservedB2CShop.driving_license,
                      shop_type: preservedB2CShop.shop_type
                    }
                  });
                }
              } else {
                console.error(`❌ B2C shop not found after R->SR conversion! Shop ID: ${originalB2CShopDetails.id}`);
              }
            }
          } else {
            // R user without B2C shop - convert to S (B2B only), not SR
            console.log(`⚠️ R user completing B2B signup but no B2C shop found - converting to S (B2B) instead of SR`);
            updatedUserType = 'S';
            const updateData = { user_type: 'S' };
            if (isV1User) {
              updateData.app_version = 'v2';
              console.log(`📱 Upgrading V1 user to V2 after B2B signup completion`);
            }
            await User.updateProfile(userId, updateData);
            console.log(`✅ User type updated from R to S for user ${userId} (no B2C shop found)`);
          }
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

        // Invalidate profile cache to ensure fresh data is fetched
        try {
          await RedisCache.invalidateV2ApiCache('profile', userId, {});
          console.log(`🗑️  Invalidated profile cache for user ${userId} after B2B signup`);
        } catch (err) {
          console.error('Redis cache invalidation error:', err);
        }
        
        // Note: Admin panel cache will refresh on next load
      }

      // Note: Admin panel cache will refresh on next load

      console.log(`✅ B2B signup submitted successfully for shop ${shop.id}, user_id: ${shop.user_id}`);
      return shop;
    } catch (error) {
      console.error('❌ V2B2BSignupService.submitB2BSignup error:', error);
      throw error;
    }
  }
}

module.exports = V2B2BSignupService;
