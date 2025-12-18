/**
 * V2 Profile Service
 * Business logic for user profile management
 */

const User = require('../../models/User');
const Shop = require('../../models/Shop');
const DeliveryBoy = require('../../models/DeliveryBoy');
const Customer = require('../../models/Customer');
const RedisCache = require('../../utils/redisCache');

class V2ProfileService {
  /**
   * Get user profile
   * @param {string|number} userId - User ID
   * @returns {Promise<Object>} User profile data
   */
  static async getProfile(userId) {
    try {
      const user = await User.findById(userId);
      
      if (!user) {
        throw new Error('USER_NOT_FOUND');
      }

      // For deleted users (del_status = 2) or new users (user_type 'N'), return a minimal profile
      // BUT: Include delivery/shop data if it exists (for signup completion and approval status)
      // This allows them to access the profile API during signup/re-registration
      // Deleted users can re-register, so we allow them to see their profile
      // IMPORTANT: If user has completed signup (user_type is 'D', 'S', 'R', or 'SR'), respect the actual user_type
      // even if del_status = 2 (they may be re-registering but have already completed signup)
      if (user.del_status === 2 || user.user_type === 'N') {
        // Determine user_type to return:
        // - If user_type is 'N', always return 'N'
        // - If user_type is 'D', 'S', 'R', or 'SR' (completed signup), respect the actual user_type
        //   even if del_status = 2 (they've completed signup, just re-registering)
        const hasCompletedSignup = ['D', 'S', 'R', 'SR'].includes(user.user_type);
        const userType = hasCompletedSignup ? user.user_type : 'N';
        console.log(`✅ Returning profile for ${user.del_status === 2 ? 'deleted' : 'new'} user (ID: ${userId}, actual type: ${user.user_type}, returned type: ${userType}, del_status: ${user.del_status})`);
        
        let profileData = {
          id: user.id,
          name: user.name || '',
          email: user.email || '',
          phone: user.mob_num ? String(user.mob_num) : '',
          user_type: userType, // Return 'N' for deleted users to allow re-registration
          app_type: user.app_type || 'vendor_app',
          profile_image: user.profile_image || user.profile_photo || null,
          completion_percentage: 0, // New/deleted user has 0% completion initially
          created_at: user.created_at,
          updated_at: user.updated_at,
        };

        // Add user object for new/deleted users as well
        profileData.user = {
          id: user.id,
          name: user.name || '',
          email: user.email || '',
          phone: user.mob_num ? String(user.mob_num) : '',
          user_type: userType,
          app_type: user.app_type || 'vendor_app',
          app_version: user.app_version || 'v1',
          profile_image: user.profile_image || user.profile_photo || null,
          operating_categories: user.operating_categories || [],
          operating_subcategories: user.operating_subcategories || [],
          created_at: user.created_at,
          updated_at: user.updated_at,
        };
        
        // IMPORTANT: Check if delivery_boy or shop data exists even for new users
        // This allows them to see approval status during signup
        try {
          // Check for delivery_boy data (for delivery signup)
          const deliveryBoy = await DeliveryBoy.findByUserId(userId);
          if (deliveryBoy) {
            profileData.delivery = {
              id: deliveryBoy.id,
              name: deliveryBoy.name || '',
              address: deliveryBoy.address || '',
              contact: deliveryBoy.contact || '',
              delivery_mode: deliveryBoy.delivery_mode || 'deliver',
              is_online: deliveryBoy.is_online !== undefined ? deliveryBoy.is_online : false,
              aadhar_card: deliveryBoy.aadhar_card || null,
              driving_license: deliveryBoy.driving_license || null,
              vehicle_type: deliveryBoy.vehicle_type || null,
              vehicle_model: deliveryBoy.vehicle_model || null,
              vehicle_registration_number: deliveryBoy.vehicle_registration_number || null,
              approval_status: deliveryBoy.approval_status || null,
              rejection_reason: deliveryBoy.rejection_reason || null,
              application_submitted_at: deliveryBoy.application_submitted_at || null,
              documents_verified_at: deliveryBoy.documents_verified_at || null,
              review_initiated_at: deliveryBoy.review_initiated_at || null,
            };
            profileData.delivery_boy = profileData.delivery;
            console.log(`✅ Added delivery data to profile for new user (approval_status: ${deliveryBoy.approval_status || 'null'})`);
          }
          
          // Check for shop data (for B2B/B2C signup)
          const shop = await Shop.findByUserId(userId);
          if (shop) {
            profileData.shop = {
              id: shop.id,
              shopname: shop.shopname || '',
              ownername: shop.ownername || '',
              address: shop.address || '',
              contact: shop.contact || '',
              shop_type: shop.shop_type || '',
              aadhar_card: shop.aadhar_card || null,
              driving_license: shop.driving_license || null,
              company_name: shop.company_name || '',
              gst_number: shop.gst_number || '',
              pan_number: shop.pan_number || '',
              business_license_url: shop.business_license_url || '',
              gst_certificate_url: shop.gst_certificate_url || '',
              address_proof_url: shop.address_proof_url || '',
              kyc_owner_url: shop.kyc_owner_url || '',
              approval_status: shop.approval_status || null,
              rejection_reason: shop.rejection_reason || null,
              application_submitted_at: shop.application_submitted_at || null,
              documents_verified_at: shop.documents_verified_at || null,
              review_initiated_at: shop.review_initiated_at || null,
            };
            console.log(`✅ Added shop data to profile for new user (approval_status: ${shop.approval_status || 'null'})`);
          }

          // Check for customer data (for common users - user_type 'C')
          const customer = await Customer.findByUserId(userId);
          if (customer) {
            profileData.customer = {
              id: customer.id,
              name: customer.name || '',
              email: customer.email || '',
              contact: customer.contact ? String(customer.contact) : '',
              address: customer.address || '',
              location: customer.location || '',
              state: customer.state || '',
              place: customer.place || '',
              language: customer.language || '',
              profile_photo: customer.profile_photo || null,
              pincode: customer.pincode || '',
              lat_log: customer.lat_log || '',
              place_id: customer.place_id || '',
              created_at: customer.created_at,
              updated_at: customer.updated_at,
            };
            console.log(`✅ Added customer data to profile for new user`);
          }
        } catch (err) {
          console.error('❌ Error fetching delivery/shop/customer data for new user:', err);
          // Continue with minimal profile if there's an error
        }
        
        return profileData;
      }

      // Get additional profile data based on user type
      // Name will be updated based on user type (company_name for B2B, delivery name for Delivery)
      let profileData = {
        id: user.id,
        name: user.name || '', // Will be updated for B2B and Delivery users
        email: user.email || '',
        phone: user.mob_num ? String(user.mob_num) : '',
        user_type: user.user_type,
        app_type: user.app_type || 'vendor_app',
        profile_image: user.profile_image || user.profile_photo || null, // Support both field names
        created_at: user.created_at,
        updated_at: user.updated_at,
      };

      // Add user object for ALL user types (B2B, B2C, Delivery, and regular Users with category 'U')
      // This ensures all users have a consistent user object in the profile response
      profileData.user = {
        id: user.id,
        name: user.name || '',
        email: user.email || '',
        phone: user.mob_num ? String(user.mob_num) : '',
        user_type: user.user_type,
        app_type: user.app_type || 'vendor_app',
        app_version: user.app_version || 'v1',
        profile_image: user.profile_image || user.profile_photo || null,
        operating_categories: user.operating_categories || [],
        operating_subcategories: user.operating_subcategories || [],
        created_at: user.created_at,
        updated_at: user.updated_at,
      };

      // Add shop data for B2B/B2C users
      if (user.user_type === 'S' || user.user_type === 'R' || user.user_type === 'SR') {
        try {
          const shop = await Shop.findByUserId(userId);
          console.log(`🔍 Shop lookup for user ${userId}:`, shop ? `Found ID ${shop.id}` : 'Not found');
          
          if (shop) {
            profileData.shop = {
              id: shop.id,
              shopname: shop.shopname || '',
              ownername: shop.ownername || '',
              address: shop.address || '',
              contact: shop.contact || '',
              shop_type: shop.shop_type || '',
              aadhar_card: shop.aadhar_card || null,
              driving_license: shop.driving_license || null,
              // B2B signup fields
              company_name: shop.company_name || '',
              gst_number: shop.gst_number || '',
              pan_number: shop.pan_number || '',
              business_license_url: shop.business_license_url || '',
              gst_certificate_url: shop.gst_certificate_url || '',
              address_proof_url: shop.address_proof_url || '',
              kyc_owner_url: shop.kyc_owner_url || '',
              approval_status: shop.approval_status || null,
              rejection_reason: shop.rejection_reason || null,
              application_submitted_at: shop.application_submitted_at || null,
              documents_verified_at: shop.documents_verified_at || null,
              review_initiated_at: shop.review_initiated_at || null,
            };
            
            // For B2B users, use company_name as the display name
            if (shop.company_name && shop.company_name.trim() !== '') {
              profileData.name = shop.company_name;
              console.log(`✅ Using company_name as display name for B2B user: ${shop.company_name}`);
            }
            
            console.log(`✅ Shop data added to profile:`, profileData.shop);
          } else {
            // Always include shop object for B2B/B2C users, even if record doesn't exist
            profileData.shop = {
              id: null,
              shopname: user.name || '',
              ownername: '',
              address: '',
              contact: '',
              shop_type: '',
              aadhar_card: null,
              driving_license: null,
            };
            console.log(`⚠️ Shop record not found, using empty shop object`);
          }
        } catch (err) {
          console.error('❌ Error fetching shop data:', err);
          // Still include empty shop object on error
          profileData.shop = {
            id: null,
            shopname: user.name || '',
            ownername: '',
            address: '',
            contact: '',
            shop_type: '',
            aadhar_card: null,
            driving_license: null,
          };
        }
      }

      // Add customer data for regular users (user_type 'C' - common users)
      if (user.user_type === 'C') {
        try {
          const customer = await Customer.findByUserId(userId);
          console.log(`🔍 Customer lookup for user ${userId}:`, customer ? `Found ID ${customer.id}` : 'Not found');
          
          if (customer) {
            profileData.customer = {
              id: customer.id,
              name: customer.name || '',
              email: customer.email || '',
              contact: customer.contact ? String(customer.contact) : '',
              address: customer.address || '',
              location: customer.location || '',
              state: customer.state || '',
              place: customer.place || '',
              language: customer.language || '',
              profile_photo: customer.profile_photo || null,
              pincode: customer.pincode || '',
              lat_log: customer.lat_log || '',
              place_id: customer.place_id || '',
              created_at: customer.created_at,
              updated_at: customer.updated_at,
            };
            console.log(`✅ Customer data added to profile:`, profileData.customer);
          } else {
            // Always include customer object for regular users, even if record doesn't exist
            profileData.customer = {
              id: null,
              name: user.name || '',
              email: user.email || '',
              contact: user.mob_num ? String(user.mob_num) : '',
              address: '',
              location: '',
              state: '',
              place: '',
              language: '',
              profile_photo: null,
              pincode: '',
              lat_log: '',
              place_id: '',
            };
            console.log(`⚠️ Customer record not found, using empty customer object`);
          }
        } catch (err) {
          console.error('❌ Error fetching customer data:', err);
          // Still include empty customer object on error
          profileData.customer = {
            id: null,
            name: user.name || '',
            email: user.email || '',
            contact: user.mob_num ? String(user.mob_num) : '',
            address: '',
            location: '',
            state: '',
            place: '',
            language: '',
            profile_photo: null,
            pincode: '',
            lat_log: '',
            place_id: '',
          };
        }
      }

      // Add delivery boy data for Delivery users
      if (user.user_type === 'D') {
        try {
          const deliveryBoy = await DeliveryBoy.findByUserId(userId);
          console.log(`🔍 Delivery boy lookup for user ${userId}:`, deliveryBoy ? `Found ID ${deliveryBoy.id}` : 'Not found');
          
          if (deliveryBoy) {
            profileData.delivery = {
              id: deliveryBoy.id,
              name: deliveryBoy.name || '',
              address: deliveryBoy.address || '',
              contact: deliveryBoy.contact || '',
              delivery_mode: deliveryBoy.delivery_mode || 'deliver', // Default to 'deliver' if not set
              is_online: deliveryBoy.is_online !== undefined ? deliveryBoy.is_online : false, // Default to false if not set
              aadhar_card: deliveryBoy.aadhar_card || null,
              driving_license: deliveryBoy.driving_license || null,
              vehicle_type: deliveryBoy.vehicle_type || null,
              vehicle_model: deliveryBoy.vehicle_model || null,
              vehicle_registration_number: deliveryBoy.vehicle_registration_number || null,
              approval_status: deliveryBoy.approval_status || null,
              rejection_reason: deliveryBoy.rejection_reason || null,
              application_submitted_at: deliveryBoy.application_submitted_at || null,
              documents_verified_at: deliveryBoy.documents_verified_at || null,
              review_initiated_at: deliveryBoy.review_initiated_at || null,
            };
            // Also add as delivery_boy for backward compatibility
            profileData.delivery_boy = profileData.delivery;
            
            // For Delivery users, use delivery person name as the display name
            if (deliveryBoy.name && deliveryBoy.name.trim() !== '') {
              profileData.name = deliveryBoy.name;
              console.log(`✅ Using delivery person name as display name: ${deliveryBoy.name}`);
            }
            
            console.log(`✅ Delivery boy data added to profile:`, profileData.delivery);
          } else {
            // Always include delivery object for Delivery users, even if record doesn't exist
            profileData.delivery = {
              id: null,
              name: user.name || '',
              address: '',
              contact: '',
              delivery_mode: 'deliver', // Default to 'deliver' if record doesn't exist
              is_online: false, // Default to offline if record doesn't exist
              aadhar_card: null,
              driving_license: null,
              vehicle_type: null,
              vehicle_model: null,
              vehicle_registration_number: null,
              approval_status: null,
              rejection_reason: null,
            };
            // Also add as delivery_boy for backward compatibility
            profileData.delivery_boy = profileData.delivery;
            console.log(`⚠️ Delivery boy record not found, using empty delivery object`);
          }
        } catch (err) {
          console.error('❌ Error fetching delivery boy data:', err);
          // Still include empty delivery object on error
          profileData.delivery = {
            id: null,
            name: user.name || '',
            address: '',
            contact: '',
            delivery_mode: 'deliver',
            is_online: false,
            aadhar_card: null,
            driving_license: null,
          };
        }
      }

      // Calculate profile completion percentage
      profileData.completion_percentage = this.calculateCompletion(profileData);

      return profileData;
    } catch (error) {
      console.error('V2ProfileService.getProfile error:', error);
      throw error;
    }
  }

  /**
   * Update user profile
   * @param {string|number} userId - User ID
   * @param {Object} updateData - Data to update
   * @returns {Promise<Object>} Updated user profile
   */
  static async updateProfile(userId, updateData) {
    try {
      const user = await User.findById(userId);
      
      if (!user) {
        throw new Error('USER_NOT_FOUND');
      }

      // Prepare user update data
      const userUpdateData = {};
      if (updateData.name !== undefined) userUpdateData.name = updateData.name;
      if (updateData.email !== undefined) {
        // Check email uniqueness if changing
        if (updateData.email !== user.email) {
          const emailExists = await User.emailExists(updateData.email);
          if (emailExists) {
            throw new Error('EMAIL_ALREADY_EXISTS');
          }
        }
        userUpdateData.email = updateData.email;
      }
      if (updateData.profile_image !== undefined) {
        userUpdateData.profile_image = updateData.profile_image;
        // Also update profile_photo for backward compatibility
        userUpdateData.profile_photo = updateData.profile_image;
      }

      // Update user if there's data to update
      if (Object.keys(userUpdateData).length > 0) {
        await User.updateProfile(userId, userUpdateData);
      }

      // Update shop data for B2B/B2C users (including new users 'N' who are completing signup)
      if ((user.user_type === 'S' || user.user_type === 'R' || user.user_type === 'SR' || user.user_type === 'N') && updateData.shop) {
        try {
          console.log(`📦 [updateProfile] Shop update data received:`, JSON.stringify(updateData.shop, null, 2));
          let shop = await Shop.findByUserId(userId);
          console.log(`🔍 Shop lookup for user ${userId}:`, shop ? `Found shop ${shop.id}` : 'Not found');
          
          // For B2C users (R): Check if required documents are uploaded before saving
          // For v1 or new users: Don't save if Aadhar card is not uploaded
          const isV1User = !user.app_version || user.app_version === 'v1' || user.app_version === 'v1.0';
          const isB2CUser = user.user_type === 'R';
          const isNewUser = !shop || !shop.id;
          
          // Create shop if it doesn't exist
          if (!shop) {
            console.log(`📝 Creating shop for user ${userId} with address:`, updateData.shop.address);
            const shopData = {
              user_id: userId,
              email: user.email || '',
              shopname: user.name || '',
              address: updateData.shop.address || '',
              contact: updateData.shop.contact || '',
            };
            
            // Determine shop_type based on user type and signup context
            // For B2C signup (user_type N or R), set shop_type = 3 (Retailer B2C)
            // For B2B signup (user_type S), set shop_type = 1 (Industrial) or 4 (Wholesaler)
            // For v1 users, shop_type = 2 (Retailer/Door Step Buyer)
            if (user.user_type === 'N' || user.user_type === 'R') {
              // B2C signup - use shop_type 3 (Retailer B2C) for v2 users
              if (!isV1User) {
                shopData.shop_type = 3; // Retailer B2C
                console.log(`📝 Setting shop_type = 3 (Retailer B2C) for B2C signup`);
              } else {
                shopData.shop_type = 2; // Retailer/Door Step Buyer for v1
                console.log(`📝 Setting shop_type = 2 (Retailer/Door Step Buyer) for v1 B2C signup`);
              }
            } else if (user.user_type === 'S' || user.user_type === 'SR') {
              // B2B signup - use shop_type 1 (Industrial) by default, or from updateData if provided
              shopData.shop_type = updateData.shop.shop_type || 1;
              console.log(`📝 Setting shop_type = ${shopData.shop_type} (B2B) for B2B signup`);
            } else {
              // Default to shop_type from updateData or 1
              shopData.shop_type = updateData.shop.shop_type || 1;
              console.log(`📝 Setting shop_type = ${shopData.shop_type} (default)`);
            }
            
            // Include documents if provided
            if (updateData.shop.aadhar_card) {
              shopData.aadhar_card = updateData.shop.aadhar_card;
            }
            if (updateData.shop.driving_license) {
              shopData.driving_license = updateData.shop.driving_license;
            }
            shop = await Shop.create(shopData);
            console.log(`✅ Shop created with ID ${shop.id}, shop_type: ${shop.shop_type}, address:`, shop.address);
          }
          
          // Update existing shop
          if (shop && shop.id) {
            const shopUpdateData = {};
            if (updateData.shop.shopname !== undefined) shopUpdateData.shopname = updateData.shop.shopname;
            if (updateData.shop.ownername !== undefined) shopUpdateData.ownername = updateData.shop.ownername;
            if (updateData.shop.address !== undefined && updateData.shop.address !== null && updateData.shop.address.trim() !== '') {
              shopUpdateData.address = updateData.shop.address.trim();
              console.log(`📝 Updating shop ${shop.id} address to:`, shopUpdateData.address);
            } else if (updateData.shop.address !== undefined) {
              console.log(`⚠️ Skipping empty address update for shop ${shop.id}`);
            }
            if (updateData.shop.contact !== undefined && updateData.shop.contact !== null && updateData.shop.contact !== '') {
              shopUpdateData.contact = updateData.shop.contact;
              console.log(`📝 Updating shop ${shop.id} contact to:`, shopUpdateData.contact);
            } else if (updateData.shop.contact !== undefined) {
              console.log(`⚠️ Skipping empty contact update for shop ${shop.id}`);
            }
            if (updateData.shop.aadhar_card !== undefined && updateData.shop.aadhar_card !== null && updateData.shop.aadhar_card !== '') {
              shopUpdateData.aadhar_card = updateData.shop.aadhar_card;
              console.log(`📝 Updating shop ${shop.id} aadhar_card:`, shopUpdateData.aadhar_card);
            } else if (updateData.shop.aadhar_card !== undefined) {
              console.log(`⚠️ Skipping empty aadhar_card update for shop ${shop.id}`);
            }
            if (updateData.shop.driving_license !== undefined) {
              shopUpdateData.driving_license = updateData.shop.driving_license;
              console.log(`📝 Updating shop ${shop.id} driving_license`);
            }
            
            // Update shop_type if user is completing B2C signup and shop_type is incorrect
            // For B2C signup (user_type N or R), ensure shop_type is 3 (Retailer B2C) for v2 or 2 for v1
            if ((user.user_type === 'N' || user.user_type === 'R') && shop.shop_type !== 3 && shop.shop_type !== 2) {
              if (!isV1User) {
                shopUpdateData.shop_type = 3; // Retailer B2C for v2
                console.log(`📝 Correcting shop_type from ${shop.shop_type} to 3 (Retailer B2C) for B2C signup`);
              } else {
                shopUpdateData.shop_type = 2; // Retailer/Door Step Buyer for v1
                console.log(`📝 Correcting shop_type from ${shop.shop_type} to 2 (Retailer/Door Step Buyer) for v1 B2C signup`);
              }
            }

            if (Object.keys(shopUpdateData).length > 0) {
              console.log(`🔄 Updating shop ${shop.id} with data:`, JSON.stringify(shopUpdateData, null, 2));
              await Shop.update(shop.id, shopUpdateData);
              console.log(`✅ Shop ${shop.id} updated successfully`);
              
              // Verify the update
              const updatedShop = await Shop.findById(shop.id);
              console.log(`✅ Verified shop ${shop.id} address after update:`, updatedShop?.address);
              
              // Update shop reference with latest data
              shop = updatedShop;
            } else {
              console.log(`⚠️ No shop data to update`);
            }
          }
          
          // After shop is created/updated, validate documents for B2C v1/new users or users completing B2C signup
          // This includes: users with type 'R' (B2C), 'N' (new user completing signup), or v1 users
          // For v2 users with type 'N', always validate B2C signup completion
          // For v1 users or users with type 'R', also validate
          const isCompletingB2CSignup = user.user_type === 'N' || user.user_type === 'R' || (isV1User && !user.user_type);
          // Always validate if user_type is 'N' (new user), or if it's a v1 user, or if shop is new
          const shouldValidateB2C = isCompletingB2CSignup && (user.user_type === 'N' || isV1User || isNewUser);
          
          console.log(`🔍 [B2C Signup Validation] Checking if should validate:`);
          console.log(`   user.user_type: ${user.user_type}`);
          console.log(`   isV1User: ${isV1User}`);
          console.log(`   isNewUser: ${isNewUser}`);
          console.log(`   isCompletingB2CSignup: ${isCompletingB2CSignup}`);
          console.log(`   shouldValidateB2C: ${shouldValidateB2C}`);
          
          if (shouldValidateB2C) {
            // Use the shop object that was just updated (to avoid DynamoDB eventual consistency issues)
            // If shop was just updated, use it; otherwise re-fetch
            let latestShop = shop;
            if (!latestShop || !latestShop.id) {
              latestShop = await Shop.findByUserId(userId);
            }
            console.log(`📦 [B2C Validation] Using shop data:`, {
              id: latestShop?.id,
              address: latestShop?.address,
              contact: latestShop?.contact,
              aadhar_card: latestShop?.aadhar_card ? 'present' : 'missing'
            });
            
            // Check if Aadhar card is uploaded (it's a URL, so just check if it exists and is not empty)
            const hasAadharCard = latestShop?.aadhar_card && String(latestShop.aadhar_card || '').trim() !== '';
            
            // Re-fetch user to get updated name (after userUpdateData was applied)
            const updatedUserForCheck = await User.findById(userId);
            
            // Check if all required fields are filled (use updated user name/email or updateData name/email)
            const currentName = updatedUserForCheck.name || updateData.name || '';
            const currentEmail = updatedUserForCheck.email || updateData.email || '';
            const hasName = currentName && currentName.trim() !== '';
            const hasEmail = currentEmail && currentEmail.trim() !== '' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(currentEmail.trim());
            const hasAddress = latestShop?.address && String(latestShop.address || '').trim() !== '';
            const hasContact = latestShop?.contact && String(latestShop.contact || '').trim() !== '';
            const isB2CComplete = hasName && hasEmail && hasAddress && hasContact && hasAadharCard;
            
            console.log(`🔍 [B2C Signup Check] Initial validation:`);
            console.log(`   Name: ${hasName} (${currentName})`);
            console.log(`   Email: ${hasEmail} (${currentEmail || 'missing'})`);
            console.log(`   Address: ${hasAddress} (${latestShop?.address || 'missing'})`);
            console.log(`   Contact: ${hasContact} (${latestShop?.contact || 'missing'}, type: ${typeof latestShop?.contact})`);
            console.log(`   Aadhar: ${hasAadharCard ? 'present' : 'missing'}`);
            console.log(`   Complete: ${isB2CComplete}`);
            
            // If user is trying to save profile but Aadhar card is missing, prevent save
            if (!hasAadharCard) {
              console.log(`❌ Incomplete B2C signup for v1/new user - Aadhar card not uploaded, preventing save`);
              throw new Error('INCOMPLETE_SIGNUP: Please upload your Aadhar card before submitting.');
            }
            
            console.log(`✅ B2C signup validation passed - Aadhar card uploaded`);
            
            // Re-fetch user to get updated name (after userUpdateData was applied)
            const updatedUser = await User.findById(userId);
            
            // Update user type ONLY after B2C signup is complete (name + email + address + contact + aadhar card)
            // Double-check that all required data is actually saved
            const savedName = updatedUser.name || updateData.name || '';
            const savedEmail = updatedUser.email || updateData.email || '';
            const hasNameSaved = savedName && String(savedName).trim() !== '';
            const hasEmailSaved = savedEmail && String(savedEmail).trim() !== '' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(savedEmail.trim());
            const hasAddressSaved = latestShop?.address && String(latestShop.address || '').trim() !== '';
            const hasContactSaved = latestShop?.contact && String(latestShop.contact || '').trim() !== '';
            const hasAadharSaved = latestShop?.aadhar_card && String(latestShop.aadhar_card || '').trim() !== '';
            const isB2CSignupTrulyComplete = hasNameSaved && hasEmailSaved && hasAddressSaved && hasContactSaved && hasAadharSaved;
            
            console.log(`🔍 [B2C Final Check] All fields validation:`);
            console.log(`   Name saved: ${hasNameSaved} (${savedName})`);
            console.log(`   Email saved: ${hasEmailSaved} (${savedEmail || 'missing'})`);
            console.log(`   Address saved: ${hasAddressSaved} (${latestShop?.address || 'missing'})`);
            console.log(`   Contact saved: ${hasContactSaved} (${latestShop?.contact || 'missing'}, type: ${typeof latestShop?.contact})`);
            console.log(`   Aadhar saved: ${hasAadharSaved} (${latestShop?.aadhar_card ? 'present' : 'missing'})`);
            console.log(`   User type before update: ${updatedUser.user_type}`);
            console.log(`   Will update to R: ${isB2CSignupTrulyComplete && updatedUser.user_type !== 'R' && updatedUser.user_type !== 'SR'}`);
            
            console.log(`🔍 B2C signup completion check:`);
            console.log(`   Name: ${hasNameSaved} (${updatedUser.name || updateData.name || 'missing'})`);
            console.log(`   Address: ${hasAddressSaved} (${latestShop?.address || 'missing'})`);
            console.log(`   Contact: ${hasContactSaved} (${latestShop?.contact || 'missing'})`);
            console.log(`   Aadhar: ${hasAadharSaved} (${latestShop?.aadhar_card ? 'present' : 'missing'})`);
            console.log(`   Complete: ${isB2CSignupTrulyComplete}`);
            
            if (!isB2CSignupTrulyComplete) {
              console.log(`❌ B2C signup verification failed - not all required data saved correctly`);
              console.log(`   Name: ${hasNameSaved}, Email: ${hasEmailSaved}, Address: ${hasAddressSaved}, Contact: ${hasContactSaved}, Aadhar: ${hasAadharSaved}`);
              throw new Error('INCOMPLETE_SIGNUP: Signup data was not saved correctly. Please ensure all fields (name, email, address, contact, Aadhar card) are filled. Please try again.');
            }
            
            // Only change user_type if signup is truly complete
            // Update from 'N' (new_user), 'S' (B2B), or other types to appropriate B2C type
            if (isB2CSignupTrulyComplete && updatedUser.user_type !== 'R' && updatedUser.user_type !== 'SR') {
              // Check if user has completed B2B signup (form + all documents)
              const hasB2BComplete = latestShop?.company_name && latestShop.company_name.trim() !== '' &&
                                     latestShop?.gst_number && latestShop.gst_number.trim() !== '' &&
                                     latestShop?.business_license_url && latestShop.business_license_url.trim() !== '' &&
                                     latestShop?.gst_certificate_url && latestShop.gst_certificate_url.trim() !== '' &&
                                     latestShop?.address_proof_url && latestShop.address_proof_url.trim() !== '' &&
                                     latestShop?.kyc_owner_url && latestShop.kyc_owner_url.trim() !== '';
              
              // Check if user is V1 and needs upgrade to V2
              const isV1User = !updatedUser.app_version || updatedUser.app_version === 'v1' || updatedUser.app_version === 'v1.0';
              
              if (hasB2BComplete) {
                // Both B2B and B2C complete - upgrade to SR
                console.log(`🔄 B2C signup complete - user already has B2B, upgrading to SR (B2B+B2C) for user ${userId}`);
                const updateData = { user_type: 'SR' };
                if (isV1User) {
                  updateData.app_version = 'v2';
                  console.log(`📱 Upgrading V1 user to V2 after signup completion`);
                }
                await User.updateProfile(userId, updateData);
                console.log(`✅ User type updated to SR for user ${userId}`);
              } else if (updatedUser.user_type === 'N') {
                // New user (N) completing B2C signup - set to R (B2C)
                console.log(`🔄 B2C signup complete - updating new user (N) to R (B2C) for user ${userId}`);
                const updateData = { user_type: 'R' };
                if (isV1User) {
                  updateData.app_version = 'v2';
                  console.log(`📱 Upgrading V1 user to V2 after signup completion`);
                }
                await User.updateProfile(userId, updateData);
                console.log(`✅ User type updated from N to R for user ${userId}`);
              } else if (updatedUser.user_type === 'S') {
                // B2B user completing B2C signup - upgrade to SR
                console.log(`🔄 B2C signup complete - B2B user (S) completing B2C, upgrading to SR (B2B+B2C) for user ${userId}`);
                const updateData = { user_type: 'SR' };
                if (isV1User) {
                  updateData.app_version = 'v2';
                  console.log(`📱 Upgrading V1 user to V2 after signup completion`);
                }
                await User.updateProfile(userId, updateData);
                console.log(`✅ User type updated from S to SR for user ${userId}`);
              } else {
                // Other type - set to R (B2C)
                console.log(`🔄 B2C signup complete - setting user type to R (B2C) for user ${userId} (from ${updatedUser.user_type})`);
                const updateData = { user_type: 'R' };
                if (isV1User) {
                  updateData.app_version = 'v2';
                  console.log(`📱 Upgrading V1 user to V2 after signup completion`);
                }
                await User.updateProfile(userId, updateData);
                console.log(`✅ User type updated to R for user ${userId}`);
              }
              
              // Invalidate B2B users cache after user type update
              try {
                await RedisCache.invalidateB2BUsersCache();
                console.log('🗑️  Invalidated B2B users cache after user type update');
              } catch (err) {
                console.error('Redis cache invalidation error:', err);
              }
              
              // Set approval_status to 'pending' for B2C users when signup is complete
              // This is done after user type update to ensure signup is truly complete
              if ((updatedUser.user_type === 'R' || updatedUser.user_type === 'SR') && latestShop && latestShop.id) {
                // Re-check if B2C signup is complete (name + email + address + contact + aadhar)
                const finalName = updatedUser.name || updateData.name || '';
                const finalEmail = updatedUser.email || updateData.email || '';
                const finalAddress = latestShop.address && String(latestShop.address || '').trim() !== '';
                const finalContact = latestShop.contact && String(latestShop.contact || '').trim() !== '';
                const finalAadhar = latestShop.aadhar_card && String(latestShop.aadhar_card || '').trim() !== '';
                const isB2CFinalComplete = finalName && finalEmail && finalAddress && finalContact && finalAadhar;
                
                if (isB2CFinalComplete) {
                const currentTime = new Date().toISOString();
                const updateData = { approval_status: 'pending' };
                let shouldSetApplicationSubmitted = false;
                
                // If status is 'rejected', change it back to 'pending' when user resubmits
                if (latestShop.approval_status === 'rejected') {
                  console.log(`📋 Complete B2C signup - changing approval_status from 'rejected' to 'pending' for user ${userId} (resubmission)`);
                  shouldSetApplicationSubmitted = true; // Resubmission counts as new application
                } else if (!latestShop.approval_status || latestShop.approval_status === null) {
                  // Set approval_status to 'pending' only if signup is complete and no status exists
                  console.log(`📋 Complete B2C signup - setting approval_status to 'pending' for user ${userId}`);
                  shouldSetApplicationSubmitted = true; // First time submission
                } else if (latestShop.approval_status === 'approved') {
                  // Keep approved status - don't override admin approval
                  console.log(`📋 Complete B2C signup - keeping existing approval_status 'approved' for user ${userId}`);
                  return; // Don't update if already approved
                } else {
                  // Status is 'pending' - keep it
                  console.log(`📋 Complete B2C signup - keeping existing approval_status 'pending' for user ${userId}`);
                }
                
                // Set application_submitted_at when signup is completed for the first time or resubmitted
                if (shouldSetApplicationSubmitted && !latestShop.application_submitted_at) {
                  updateData.application_submitted_at = currentTime;
                  console.log(`📋 Setting application_submitted_at for B2C user: ${userId}`);
                }
                
                // Set review_initiated_at when status is set to pending for the first time
                if (!latestShop.review_initiated_at) {
                  updateData.review_initiated_at = currentTime;
                  console.log(`📋 Setting review_initiated_at for B2C user: ${userId}`);
                }
                
                await Shop.update(latestShop.id, updateData);
                console.log(`✅ B2C approval_status updated for shop ${latestShop.id}`);
                }
              }
            }
          }
        } catch (err) {
          console.error('❌ Error updating shop data:', err);
          throw err; // Re-throw to surface the error
        }
      }

      // Update delivery boy data for Delivery users (address, contact, and delivery_mode)
      // Also handle new users (type 'N') completing delivery signup
      if ((user.user_type === 'D' || user.user_type === 'N') && updateData.delivery) {
        try {
          // Always use the address value, even if it's an empty string
          const addressValue = updateData.delivery.address !== undefined 
            ? String(updateData.delivery.address) 
            : undefined;
          
          // Get contact if provided
          const contactValue = updateData.delivery.contact !== undefined 
            ? String(updateData.delivery.contact) 
            : undefined;
          
          // Get delivery_mode if provided (valid values: 'deliver', 'deliverPicking', 'picker')
          const deliveryModeValue = updateData.delivery.delivery_mode;
          const validModes = ['deliver', 'deliverPicking', 'picker'];
          const modeValue = deliveryModeValue && validModes.includes(deliveryModeValue) 
            ? deliveryModeValue 
            : undefined;
          
          // Get vehicle information if provided
          const vehicleTypeValue = updateData.delivery.vehicle_type;
          const vehicleModelValue = updateData.delivery.vehicle_model;
          const vehicleRegValue = updateData.delivery.vehicle_registration_number;
          const aadharCardValue = updateData.delivery.aadhar_card;
          const drivingLicenseValue = updateData.delivery.driving_license;
          
          console.log(`📝 Processing delivery update for user ${userId}`);
          console.log(`📝 Address value received:`, addressValue);
          console.log(`📝 Contact value received:`, contactValue);
          console.log(`📝 Delivery mode value received:`, modeValue);
          console.log(`📝 Vehicle type value received:`, vehicleTypeValue);
          console.log(`📝 Vehicle model value received:`, vehicleModelValue);
          console.log(`📝 Vehicle registration value received:`, vehicleRegValue);
          console.log(`📝 Aadhar card value received:`, aadharCardValue ? 'Present' : 'Not provided');
          console.log(`📝 Driving license value received:`, drivingLicenseValue ? 'Present' : 'Not provided');
          console.log(`📝 Full updateData.delivery:`, JSON.stringify(updateData.delivery, null, 2));
          
          let deliveryBoy = await DeliveryBoy.findByUserId(userId);
          console.log(`🔍 Delivery boy lookup for user ${userId}:`, deliveryBoy ? `Found delivery ${deliveryBoy.id}` : 'Not found');
          
          // Create delivery boy record if it doesn't exist
          if (!deliveryBoy) {
            console.log(`📝 Creating delivery boy record for user ${userId} with address: "${addressValue || ''}" and mode: "${modeValue || 'deliver'}"`);
            // Ensure user_id is a number for DynamoDB (must match findByUserId query type)
            const userIdNum = typeof userId === 'string' && !isNaN(userId) ? parseInt(userId) : (typeof userId === 'number' ? userId : parseInt(userId));
            const deliveryData = {
              user_id: userIdNum, // Must be number, not string
              name: user.name || '',
              address: addressValue !== undefined ? addressValue : '',
              contact: contactValue !== undefined ? contactValue : '',
              delivery_mode: modeValue || 'deliver', // Default to 'deliver' if not provided
            };
            
            // Add vehicle information if provided
            if (vehicleTypeValue !== undefined) {
              deliveryData.vehicle_type = vehicleTypeValue;
            }
            if (vehicleModelValue !== undefined) {
              deliveryData.vehicle_model = vehicleModelValue;
            }
            if (vehicleRegValue !== undefined) {
              deliveryData.vehicle_registration_number = vehicleRegValue;
            }
            if (aadharCardValue !== undefined) {
              deliveryData.aadhar_card = aadharCardValue;
            }
            if (drivingLicenseValue !== undefined) {
              deliveryData.driving_license = drivingLicenseValue;
            }
            console.log(`📝 Delivery boy data to create:`, JSON.stringify(deliveryData, null, 2));
            console.log(`📝 user_id type:`, typeof deliveryData.user_id, `value:`, deliveryData.user_id);
            
            deliveryBoy = await DeliveryBoy.create(deliveryData);
            console.log(`✅ Delivery boy created with ID ${deliveryBoy.id}`);
            console.log(`✅ Created delivery boy address: "${deliveryBoy.address}"`);
            console.log(`✅ Created delivery boy contact: "${deliveryBoy.contact || ''}"`);
            console.log(`✅ Created delivery boy delivery_mode: "${deliveryBoy.delivery_mode}"`);
            console.log(`✅ Created delivery boy user_id:`, deliveryBoy.user_id, `type:`, typeof deliveryBoy.user_id);
            
            // Verify immediately after creation by ID
            const verifyDelivery = await DeliveryBoy.findById(deliveryBoy.id);
            console.log(`✅ Verified delivery ${deliveryBoy.id} address after creation: "${verifyDelivery?.address}"`);
            console.log(`✅ Verified delivery ${deliveryBoy.id} contact after creation: "${verifyDelivery?.contact || ''}"`);
            console.log(`✅ Verified delivery ${deliveryBoy.id} delivery_mode after creation: "${verifyDelivery?.delivery_mode}"`);
            console.log(`✅ Verified delivery user_id:`, verifyDelivery?.user_id, `type:`, typeof verifyDelivery?.user_id);
            
            // Also verify by user_id to ensure findByUserId will work
            const verifyByUserId = await DeliveryBoy.findByUserId(userIdNum);
            if (verifyByUserId) {
              console.log(`✅ Verified delivery by user_id ${userIdNum}: Found ID ${verifyByUserId.id}`);
            } else {
              console.log(`❌ WARNING: Delivery boy created but findByUserId(${userIdNum}) returned null!`);
              console.log(`   This suggests a type mismatch. Created with user_id type: ${typeof deliveryData.user_id}, value: ${deliveryData.user_id}`);
            }
            
            // Check if delivery signup is complete after creation
            const finalName = user.name || updateData.name || '';
            const finalEmail = user.email || updateData.email || '';
            const finalAddress = deliveryBoy.address && String(deliveryBoy.address || '').trim() !== '';
            const finalContact = deliveryBoy.contact && String(deliveryBoy.contact || '').trim() !== '';
            const finalAadhar = deliveryBoy.aadhar_card && String(deliveryBoy.aadhar_card || '').trim() !== '';
            const finalVehicleType = deliveryBoy.vehicle_type || '';
            const finalVehicleModel = deliveryBoy.vehicle_model && String(deliveryBoy.vehicle_model || '').trim() !== '';
            const finalVehicleReg = deliveryBoy.vehicle_registration_number && String(deliveryBoy.vehicle_registration_number || '').trim() !== '';
            const finalDrivingLicense = deliveryBoy.driving_license && String(deliveryBoy.driving_license || '').trim() !== '';
            
            // Vehicle details are required unless vehicle type is cycle
            const hasVehicleDetails = finalVehicleType === 'cycle' || (finalVehicleModel && finalVehicleReg);
            // Driving license is required unless vehicle type is cycle
            const hasDrivingLicense = finalVehicleType === 'cycle' || finalDrivingLicense;
            
            const isDeliveryFinalComplete = finalName && finalEmail && finalAddress && finalContact && finalAadhar && hasVehicleDetails && hasDrivingLicense;
            
            if (isDeliveryFinalComplete) {
              // Check if user is V1 and needs upgrade to V2
              const isV1User = !user.app_version || user.app_version === 'v1' || user.app_version === 'v1.0';
              
              // Update user_type from 'N' to 'D' if user is completing delivery signup
              // Also handle re-registration: if user_type = 'D' but del_status = 2, reset del_status
              if (user.user_type === 'N' || (user.user_type === 'D' && user.del_status === 2)) {
                const updateData = {};
                
                // If user_type is 'N', update to 'D'
              if (user.user_type === 'N') {
                  updateData.user_type = 'D';
                console.log(`🔄 Delivery signup complete - updating new user (N) to D (Delivery) for user ${userId}`);
                } else {
                  console.log(`🔄 Delivery signup complete - user ${userId} already has user_type 'D' (re-registering)`);
                }
                
                // If user has del_status = 2 (deleted), reset it to 1 (active) for re-registration
                if (user.del_status === 2) {
                  updateData.del_status = 1;
                  console.log(`🔄 Re-registering user ${userId} - resetting del_status from 2 to 1`);
                }
                
                if (isV1User) {
                  updateData.app_version = 'v2';
                  console.log(`📱 Upgrading V1 user to V2 after delivery signup completion`);
                }
                
                if (Object.keys(updateData).length > 0) {
                await User.updateProfile(userId, updateData);
                  if (updateData.user_type) {
                console.log(`✅ User type updated from N to D for user ${userId}`);
                  }
                  if (updateData.del_status) {
                    console.log(`✅ del_status reset from 2 to 1 for user ${userId}`);
                  }
                }
                
                // Invalidate user caches after user type update
                try {
                  const userIdStr = String(userId);
                  await RedisCache.delete(RedisCache.userKey(userIdStr, 'profile'));
                  await RedisCache.delete(RedisCache.userKey(userIdStr));
                  await RedisCache.delete(RedisCache.listKey('user_by_id', { user_id: userIdStr, table: 'users' }));
                  await RedisCache.delete(RedisCache.listKey('user_by_id', { user_id: userIdStr, table: 'delivery_boy' }));
                  await RedisCache.invalidateTableCache('users');
                  await RedisCache.invalidateTableCache('delivery_boy');
                  console.log('🗑️  Invalidated user caches after user type update');
                } catch (err) {
                  console.error('Redis cache invalidation error:', err);
                }
              }
              
              // Set approval_status to 'pending' for delivery users when signup is complete
              const currentTime = new Date().toISOString();
              const updateData = { approval_status: 'pending' };
              
              // Set application_submitted_at when signup is completed for the first time
              if (!deliveryBoy.application_submitted_at) {
                updateData.application_submitted_at = currentTime;
                console.log(`📋 Setting application_submitted_at for delivery user: ${userId}`);
              }
              
              // Set review_initiated_at when status is set to pending for the first time
              if (!deliveryBoy.review_initiated_at) {
                updateData.review_initiated_at = currentTime;
                console.log(`📋 Setting review_initiated_at for delivery user: ${userId}`);
              }
              
              console.log(`📋 Complete delivery signup - setting approval_status to 'pending' for user ${userId}`);
              await DeliveryBoy.update(deliveryBoy.id, updateData);
              console.log(`✅ Delivery approval_status set to 'pending' for delivery ${deliveryBoy.id}`);
            }
          } else {
            // Update existing delivery boy record - only update fields that are provided
            const deliveryUpdateData = {};
            if (addressValue !== undefined) {
              deliveryUpdateData.address = addressValue;
            }
            if (contactValue !== undefined) {
              deliveryUpdateData.contact = contactValue;
            }
            if (modeValue !== undefined) {
              deliveryUpdateData.delivery_mode = modeValue;
            }
            if (vehicleTypeValue !== undefined) {
              deliveryUpdateData.vehicle_type = vehicleTypeValue;
            }
            if (vehicleModelValue !== undefined) {
              deliveryUpdateData.vehicle_model = vehicleModelValue;
            }
            if (vehicleRegValue !== undefined) {
              deliveryUpdateData.vehicle_registration_number = vehicleRegValue;
            }
            if (aadharCardValue !== undefined && aadharCardValue !== null && aadharCardValue !== '') {
              deliveryUpdateData.aadhar_card = aadharCardValue;
            }
            if (drivingLicenseValue !== undefined && drivingLicenseValue !== null && drivingLicenseValue !== '') {
              deliveryUpdateData.driving_license = drivingLicenseValue;
            }
            
            console.log(`📝 Updating delivery boy ${deliveryBoy.id} with data:`, JSON.stringify(deliveryUpdateData, null, 2));
            console.log(`📝 Current delivery boy data before update:`, JSON.stringify(deliveryBoy, null, 2));
            
            if (Object.keys(deliveryUpdateData).length > 0) {
              await DeliveryBoy.update(deliveryBoy.id, deliveryUpdateData);
              console.log(`✅ Delivery boy ${deliveryBoy.id} update command executed`);
              
              // Verify the update
              const updatedDelivery = await DeliveryBoy.findById(deliveryBoy.id);
              console.log(`✅ Verified delivery ${deliveryBoy.id} address after update: "${updatedDelivery?.address || ''}"`);
              console.log(`✅ Verified delivery ${deliveryBoy.id} contact after update: "${updatedDelivery?.contact || ''}"`);
              console.log(`✅ Verified delivery ${deliveryBoy.id} delivery_mode after update: "${updatedDelivery?.delivery_mode}"`);
              console.log(`✅ Verified delivery ${deliveryBoy.id} full record:`, JSON.stringify(updatedDelivery, null, 2));
              
              // Set approval_status to 'pending' for delivery users when signup is complete
              // Check if delivery signup is complete (name + email + address + contact + aadhar + vehicle details + driving license if not cycle)
              const finalName = user.name || updateData.name || '';
              const finalEmail = user.email || updateData.email || '';
              const finalAddress = updatedDelivery.address && String(updatedDelivery.address || '').trim() !== '';
              const finalContact = updatedDelivery.contact && String(updatedDelivery.contact || '').trim() !== '';
              const finalAadhar = updatedDelivery.aadhar_card && String(updatedDelivery.aadhar_card || '').trim() !== '';
              const finalVehicleType = updatedDelivery.vehicle_type || '';
              const finalVehicleModel = updatedDelivery.vehicle_model && String(updatedDelivery.vehicle_model || '').trim() !== '';
              const finalVehicleReg = updatedDelivery.vehicle_registration_number && String(updatedDelivery.vehicle_registration_number || '').trim() !== '';
              const finalDrivingLicense = updatedDelivery.driving_license && String(updatedDelivery.driving_license || '').trim() !== '';
              
              // Vehicle details are required unless vehicle type is cycle
              const hasVehicleDetails = finalVehicleType === 'cycle' || (finalVehicleModel && finalVehicleReg);
              // Driving license is required unless vehicle type is cycle
              const hasDrivingLicense = finalVehicleType === 'cycle' || finalDrivingLicense;
              
              const isDeliveryFinalComplete = finalName && finalEmail && finalAddress && finalContact && finalAadhar && hasVehicleDetails && hasDrivingLicense;
              
              if (isDeliveryFinalComplete) {
                // Check if user is V1 and needs upgrade to V2
                const isV1User = !user.app_version || user.app_version === 'v1' || user.app_version === 'v1.0';
                
                // Update user_type from 'N' to 'D' if user is completing delivery signup
                if (user.user_type === 'N') {
                  console.log(`🔄 Delivery signup complete - updating new user (N) to D (Delivery) for user ${userId}`);
                  const updateData = { user_type: 'D' };
                  
                  // If user has del_status = 2 (deleted), reset it to 1 (active) for re-registration
                  if (user.del_status === 2) {
                    updateData.del_status = 1;
                    console.log(`🔄 Re-registering user ${userId} - resetting del_status from 2 to 1`);
                  }
                  
                  if (isV1User) {
                    updateData.app_version = 'v2';
                    console.log(`📱 Upgrading V1 user to V2 after delivery signup completion`);
                  }
                  await User.updateProfile(userId, updateData);
                  console.log(`✅ User type updated from N to D for user ${userId}`);
                  
                  // Invalidate user caches after user type update
                  try {
                    const userIdStr = String(userId);
                    await RedisCache.delete(RedisCache.userKey(userIdStr, 'profile'));
                    await RedisCache.delete(RedisCache.userKey(userIdStr));
                    await RedisCache.delete(RedisCache.listKey('user_by_id', { user_id: userIdStr, table: 'users' }));
                    await RedisCache.delete(RedisCache.listKey('user_by_id', { user_id: userIdStr, table: 'delivery_boy' }));
                    await RedisCache.invalidateTableCache('users');
                    await RedisCache.invalidateTableCache('delivery_boy');
                    console.log('🗑️  Invalidated user caches after user type update');
                  } catch (err) {
                    console.error('Redis cache invalidation error:', err);
                  }
                }
                
                const currentTime = new Date().toISOString();
                const updateData = { approval_status: 'pending' };
                let shouldSetApplicationSubmitted = false;
                
                // If status is 'rejected', change it back to 'pending' when user resubmits
                if (updatedDelivery.approval_status === 'rejected') {
                  console.log(`📋 Complete delivery signup - changing approval_status from 'rejected' to 'pending' for user ${userId} (resubmission)`);
                  shouldSetApplicationSubmitted = true; // Resubmission counts as new application
                } else if (!updatedDelivery.approval_status || updatedDelivery.approval_status === null) {
                  // Set approval_status to 'pending' only if signup is complete and no status exists
                  console.log(`📋 Complete delivery signup - setting approval_status to 'pending' for user ${userId}`);
                  shouldSetApplicationSubmitted = true; // First time submission
                } else if (updatedDelivery.approval_status === 'approved') {
                  // Keep approved status - don't override admin approval
                  console.log(`📋 Complete delivery signup - keeping existing approval_status 'approved' for user ${userId}`);
                  return; // Don't update if already approved
                } else {
                  // Status is 'pending' - keep it
                  console.log(`📋 Complete delivery signup - keeping existing approval_status 'pending' for user ${userId}`);
                }
                
                // Set application_submitted_at when signup is completed for the first time or resubmitted
                if (shouldSetApplicationSubmitted && !deliveryBoy.application_submitted_at) {
                  updateData.application_submitted_at = currentTime;
                  console.log(`📋 Setting application_submitted_at for delivery user: ${userId}`);
                }
                
                // Set review_initiated_at when status is set to pending for the first time
                if (!deliveryBoy.review_initiated_at) {
                  updateData.review_initiated_at = currentTime;
                  console.log(`📋 Setting review_initiated_at for delivery user: ${userId}`);
                }
                
                await DeliveryBoy.update(deliveryBoy.id, updateData);
                console.log(`✅ Delivery approval_status updated for delivery ${deliveryBoy.id}`);
              }
            } else {
              console.log(`⚠️ No delivery data to update`);
            }
          }
        } catch (err) {
          console.error('❌ Error updating delivery boy data:', err);
          console.error('❌ Error message:', err.message);
          console.error('❌ Error stack:', err.stack);
          throw err; // Re-throw to surface the error
        }
      } else if (user.user_type === 'D') {
        console.log(`⚠️ Delivery user but no delivery data in updateData`);
        console.log(`⚠️ Full updateData:`, JSON.stringify(updateData, null, 2));
      }

      // Invalidate all Redis caches related to this user
      try {
        const userIdStr = String(userId);
        console.log(`🗑️  Invalidating Redis caches for user ${userIdStr}`);
        
        // Invalidate user profile cache
        await RedisCache.delete(RedisCache.userKey(userIdStr, 'profile'));
        await RedisCache.delete(RedisCache.userKey(userIdStr));
        
        // Invalidate get_user_by_id cache
        await RedisCache.delete(RedisCache.listKey('user_by_id', { user_id: userIdStr, table: 'users' }));
        
        // Invalidate based on user type
        if (user.user_type === 'S' || user.user_type === 'R' || user.user_type === 'SR') {
          await RedisCache.delete(RedisCache.listKey('user_by_id', { user_id: userIdStr, table: 'shops' }));
          await RedisCache.invalidateTableCache('shops');
        } else if (user.user_type === 'D') {
          await RedisCache.delete(RedisCache.listKey('user_by_id', { user_id: userIdStr, table: 'delivery_boy' }));
          await RedisCache.invalidateTableCache('delivery_boy');
        }
        
        await RedisCache.invalidateTableCache('users');
        console.log(`✅ Redis caches invalidated for user ${userIdStr}`);
      } catch (redisErr) {
        console.error('❌ Redis cache invalidation error:', redisErr);
        // Continue even if Redis fails
      }

      // Return updated profile (fresh from database, no cache)
      const updatedProfile = await this.getProfile(userId);
      console.log('📤 Returning updated profile with address:', {
        shop_address: updatedProfile.shop?.address,
        delivery_address: updatedProfile.delivery?.address,
      });
      return updatedProfile;
    } catch (error) {
      console.error('V2ProfileService.updateProfile error:', error);
      throw error;
    }
  }

  /**
   * Update delivery mode for a delivery boy
   * @param {string|number} userId - User ID
   * @param {string} deliveryMode - Delivery mode: 'deliver', 'deliverPicking', or 'picker'
   * @returns {Promise<Object>} Updated delivery boy data
   */
  static async updateDeliveryMode(userId, deliveryMode) {
    try {
      const user = await User.findById(userId);
      
      if (!user) {
        throw new Error('USER_NOT_FOUND');
      }

      if (user.user_type !== 'D') {
        throw new Error('USER_NOT_DELIVERY_BOY');
      }

      // Validate delivery mode
      const validModes = ['deliver', 'deliverPicking', 'picker'];
      if (!validModes.includes(deliveryMode)) {
        throw new Error('INVALID_DELIVERY_MODE');
      }

      console.log(`📝 Updating delivery mode for user ${userId} to: ${deliveryMode}`);

      let deliveryBoy = await DeliveryBoy.findByUserId(userId);
      
      if (!deliveryBoy) {
        // Create delivery boy record if it doesn't exist
        console.log(`📝 Creating delivery boy record for user ${userId} with delivery_mode: "${deliveryMode}"`);
        const userIdNum = typeof userId === 'string' && !isNaN(userId) 
          ? parseInt(userId) 
          : (typeof userId === 'number' ? userId : parseInt(userId));
        
        const deliveryData = {
          user_id: userIdNum,
          name: user.name || '',
          address: '',
          delivery_mode: deliveryMode,
        };
        
        deliveryBoy = await DeliveryBoy.create(deliveryData);
        console.log(`✅ Delivery boy created with ID ${deliveryBoy.id} and delivery_mode: "${deliveryBoy.delivery_mode}"`);
      } else {
        // Update existing delivery boy record
        console.log(`📝 Updating delivery boy ${deliveryBoy.id} delivery_mode to: "${deliveryMode}"`);
        await DeliveryBoy.update(deliveryBoy.id, { delivery_mode: deliveryMode });
        
        // Verify the update
        const updatedDelivery = await DeliveryBoy.findById(deliveryBoy.id);
        console.log(`✅ Verified delivery ${deliveryBoy.id} delivery_mode after update: "${updatedDelivery?.delivery_mode}"`);
        deliveryBoy = updatedDelivery;
      }

      // Invalidate Redis caches
      try {
        const userIdStr = String(userId);
        await RedisCache.delete(RedisCache.userKey(userIdStr, 'profile'));
        await RedisCache.delete(RedisCache.userKey(userIdStr));
        await RedisCache.delete(RedisCache.listKey('user_by_id', { user_id: userIdStr, table: 'delivery_boy' }));
        await RedisCache.invalidateTableCache('delivery_boy');
        console.log(`✅ Redis caches invalidated for user ${userIdStr}`);
      } catch (redisErr) {
        console.error('❌ Redis cache invalidation error:', redisErr);
      }

      return {
        id: deliveryBoy.id,
        user_id: deliveryBoy.user_id,
        name: deliveryBoy.name || '',
        address: deliveryBoy.address || '',
        contact: deliveryBoy.contact || '',
        delivery_mode: deliveryBoy.delivery_mode || deliveryMode,
        is_online: deliveryBoy.is_online !== undefined ? deliveryBoy.is_online : false,
      };
    } catch (error) {
      console.error('V2ProfileService.updateDeliveryMode error:', error);
      throw error;
    }
  }

  /**
   * Update online/offline status for a delivery boy
   * @param {string|number} userId - User ID
   * @param {boolean} isOnline - Online status (true = online, false = offline)
   * @returns {Promise<Object>} Updated delivery boy data
   */
  static async updateOnlineStatus(userId, isOnline) {
    try {
      const user = await User.findById(userId);
      
      if (!user) {
        throw new Error('USER_NOT_FOUND');
      }

      if (user.user_type !== 'D') {
        throw new Error('USER_NOT_DELIVERY_BOY');
      }

      console.log(`📝 Updating online status for user ${userId} to: ${isOnline}`);

      let deliveryBoy = await DeliveryBoy.findByUserId(userId);
      
      if (!deliveryBoy) {
        // Create delivery boy record if it doesn't exist
        console.log(`📝 Creating delivery boy record for user ${userId} with is_online: ${isOnline}`);
        const userIdNum = typeof userId === 'string' && !isNaN(userId) 
          ? parseInt(userId) 
          : (typeof userId === 'number' ? userId : parseInt(userId));
        
        const deliveryData = {
          user_id: userIdNum,
          name: user.name || '',
          address: '',
          delivery_mode: 'deliver',
          is_online: isOnline,
        };
        
        deliveryBoy = await DeliveryBoy.create(deliveryData);
        console.log(`✅ Delivery boy created with ID ${deliveryBoy.id} and is_online: ${deliveryBoy.is_online}`);
      } else {
        // Update existing delivery boy record
        console.log(`📝 Updating delivery boy ${deliveryBoy.id} is_online to: ${isOnline}`);
        await DeliveryBoy.update(deliveryBoy.id, { is_online: isOnline });
        
        // Verify the update
        const updatedDelivery = await DeliveryBoy.findById(deliveryBoy.id);
        console.log(`✅ Verified delivery ${deliveryBoy.id} is_online after update: ${updatedDelivery?.is_online}`);
        deliveryBoy = updatedDelivery;
      }

      // Invalidate Redis caches
      try {
        const userIdStr = String(userId);
        await RedisCache.delete(RedisCache.userKey(userIdStr, 'profile'));
        await RedisCache.delete(RedisCache.userKey(userIdStr));
        await RedisCache.delete(RedisCache.listKey('user_by_id', { user_id: userIdStr, table: 'delivery_boy' }));
        await RedisCache.invalidateTableCache('delivery_boy');
        console.log(`✅ Redis caches invalidated for user ${userIdStr}`);
      } catch (redisErr) {
        console.error('❌ Redis cache invalidation error:', redisErr);
      }

      return {
        id: deliveryBoy.id,
        user_id: deliveryBoy.user_id,
        name: deliveryBoy.name || '',
        address: deliveryBoy.address || '',
        contact: deliveryBoy.contact || '',
        delivery_mode: deliveryBoy.delivery_mode || 'deliver',
        is_online: deliveryBoy.is_online !== undefined ? deliveryBoy.is_online : false,
      };
    } catch (error) {
      console.error('V2ProfileService.updateOnlineStatus error:', error);
      throw error;
    }
  }

  /**
   * Calculate profile completion percentage
   * Based on: name, email, phone, and address
   * @param {Object} profileData - Profile data
   * @returns {number} Completion percentage (0-100)
   */
  static calculateCompletion(profileData) {
    let filledFields = 0;
    const totalFields = 4; // name, email, phone, address

    // User fields
    if (profileData.name) filledFields++;
    if (profileData.email) filledFields++;
    if (profileData.phone) filledFields++;

    // Address from shop or delivery
    const address = profileData.shop?.address || profileData.delivery?.address || '';
    if (address) filledFields++;

    return Math.round((filledFields / totalFields) * 100);
  }
  /**
   * Manually complete delivery signup and update user_type to 'D'
   * This is a fallback method if the regular updateProfile doesn't update user_type
   * @param {string|number} userId - User ID
   * @returns {Promise<ProfileData>} Updated profile
   */
  static async completeDeliverySignup(userId) {
    const User = require('../../models/User');
    const DeliveryBoy = require('../../models/DeliveryBoy');
    const RedisCache = require('../../utils/redisCache');

    // Get user
    const user = await User.findById(userId);
    if (!user) {
      throw new Error('USER_NOT_FOUND');
    }

    // Check if user_type is already 'D' and user is not deleted (del_status !== 2)
    // If user is deleted (del_status = 2), allow re-registration even if user_type = 'D'
    if (user.user_type === 'D' && user.del_status !== 2) {
      console.log(`✅ User ${userId} already has user_type 'D' and is not deleted`);
      throw new Error('ALREADY_COMPLETE');
    }
    
    // If user has user_type = 'D' but del_status = 2, allow re-registration
    if (user.user_type === 'D' && user.del_status === 2) {
      console.log(`🔄 User ${userId} has user_type 'D' but del_status = 2 - allowing re-registration`);
    }

    // Get delivery boy record
    const delivery = await DeliveryBoy.findByUserId(userId);
    if (!delivery) {
      console.log(`❌ No delivery_boy record found for user ${userId}`);
      throw new Error('DELIVERY_RECORD_NOT_FOUND');
    }

    // Check if signup is complete
    const finalName = user.name || '';
    const finalEmail = user.email || '';
    const finalAddress = delivery.address && String(delivery.address || '').trim() !== '';
    const finalContact = delivery.contact && String(delivery.contact || '').trim() !== '';
    const finalAadhar = delivery.aadhar_card && String(delivery.aadhar_card || '').trim() !== '';
    const finalVehicleType = delivery.vehicle_type || '';
    const finalVehicleModel = delivery.vehicle_model && String(delivery.vehicle_model || '').trim() !== '';
    const finalVehicleReg = delivery.vehicle_registration_number && String(delivery.vehicle_registration_number || '').trim() !== '';
    const finalDrivingLicense = delivery.driving_license && String(delivery.driving_license || '').trim() !== '';

    const hasVehicleDetails = finalVehicleType === 'cycle' || (finalVehicleModel && finalVehicleReg);
    const hasDrivingLicense = finalVehicleType === 'cycle' || finalDrivingLicense;
    const isComplete = finalName && finalEmail && finalAddress && finalContact && finalAadhar && hasVehicleDetails && hasDrivingLicense;

    if (!isComplete) {
      console.log(`❌ Delivery signup not complete for user ${userId}`);
      console.log(`   Missing:`, {
        name: !finalName,
        email: !finalEmail,
        address: !finalAddress,
        contact: !finalContact,
        aadhar: !finalAadhar,
        vehicleDetails: !hasVehicleDetails,
        drivingLicense: !hasDrivingLicense,
      });
      throw new Error('SIGNUP_NOT_COMPLETE');
    }

    // Update user_type to 'D' and reset del_status if user is re-registering
    // Handle both cases:
    // 1. user_type = 'N' -> update to 'D' and reset del_status if needed
    // 2. user_type = 'D' but del_status = 2 -> reset del_status to 1 (re-registration)
    if (user.user_type === 'N' || (user.user_type === 'D' && user.del_status === 2)) {
      const updateData = {};
      
      // If user_type is 'N', update to 'D'
    if (user.user_type === 'N') {
        updateData.user_type = 'D';
      console.log(`🔄 Manually updating user_type from N to D for user ${userId}`);
      } else {
        console.log(`🔄 User ${userId} already has user_type 'D' - keeping it`);
      }
      
      // If user has del_status = 2 (deleted), reset it to 1 (active) for re-registration
      if (user.del_status === 2) {
        updateData.del_status = 1;
        console.log(`🔄 Re-registering user ${userId} - resetting del_status from 2 to 1`);
      }
      
      if (Object.keys(updateData).length > 0) {
        await User.updateProfile(userId, updateData);
        if (updateData.user_type) {
      console.log(`✅ User type updated from N to D for user ${userId}`);
        }
        if (updateData.del_status) {
          console.log(`✅ del_status reset from 2 to 1 for user ${userId}`);
        }
      }

      // Invalidate user caches after user type update
      try {
        const userIdStr = String(userId);
        await RedisCache.delete(RedisCache.userKey(userIdStr, 'profile'));
        await RedisCache.delete(RedisCache.userKey(userIdStr));
        await RedisCache.delete(RedisCache.listKey('user_by_id', { user_id: userIdStr, table: 'users' }));
        await RedisCache.delete(RedisCache.listKey('user_by_id', { user_id: userIdStr, table: 'delivery_boy' }));
        await RedisCache.invalidateTableCache('users');
        await RedisCache.invalidateTableCache('delivery_boy');
        console.log('🗑️  Invalidated user caches after user type update');
      } catch (err) {
        console.error('Redis cache invalidation error:', err);
      }
    }

    // Set approval_status to 'pending' if not already set
    if (!delivery.approval_status) {
      const currentTime = new Date().toISOString();
      const updateData = { approval_status: 'pending' };
      
      // Set application_submitted_at when signup is completed for the first time
      if (!delivery.application_submitted_at) {
        updateData.application_submitted_at = currentTime;
        console.log(`📋 Setting application_submitted_at for delivery ${delivery.id}`);
      }
      
      // Set review_initiated_at when status is set to pending for the first time
      if (!delivery.review_initiated_at) {
        updateData.review_initiated_at = currentTime;
        console.log(`📋 Setting review_initiated_at for delivery ${delivery.id}`);
      }
      
      console.log(`📋 Setting approval_status to 'pending' for delivery ${delivery.id}`);
      await DeliveryBoy.update(delivery.id, updateData);
      console.log(`✅ Delivery approval_status set to 'pending' for delivery ${delivery.id}`);
    }

    // Return updated profile
    return await V2ProfileService.getProfile(userId);
  }

  /**
   * Delete user account (soft delete)
   * @param {string|number} userId - User ID
   * @returns {Promise<Object>} Deletion result
   */
  static async deleteAccount(userId) {
    try {
      const user = await User.findById(userId);
      
      if (!user) {
        throw new Error('USER_NOT_FOUND');
      }

      // Soft delete based on user type
      if (user.user_type === 'S' || user.user_type === 'R' || user.user_type === 'SR') {
        const shop = await Shop.findByUserId(userId);
        if (shop) {
          await Shop.update(shop.id, { del_status: 2 });
          console.log(`✅ Soft deleted shop ${shop.id} for user ${userId}`);
        }
      } else if (user.user_type === 'D') {
        const deliveryBoy = await DeliveryBoy.findByUserId(userId);
        if (deliveryBoy) {
          await DeliveryBoy.update(deliveryBoy.id, { del_status: 2 });
          console.log(`✅ Soft deleted delivery boy ${deliveryBoy.id} for user ${userId}`);
        }
      } else if (user.user_type === 'C') {
        const customer = await Customer.findByUserId(userId);
        if (customer) {
          await Customer.update(customer.id, { del_status: 2 });
          console.log(`✅ Soft deleted customer ${customer.id} for user ${userId}`);
        }
      }

      // Reset user to new/unregistered state by setting user_type to 'N'
      await User.updateProfile(userId, { user_type: 'N', del_status: 2 });
      console.log(`✅ Reset user ${userId} to type 'N' (new/unregistered)`);

      // Invalidate all user-related caches
      try {
        const userIdStr = String(userId);
        await RedisCache.delete(RedisCache.userKey(userIdStr, 'profile'));
        await RedisCache.delete(RedisCache.userKey(userIdStr));
        
        // Invalidate get_user_by_id cache for all possible tables
        await RedisCache.delete(RedisCache.listKey('user_by_id', { user_id: userIdStr, table: 'users' }));
        if (user.user_type === 'S' || user.user_type === 'R' || user.user_type === 'SR') {
          await RedisCache.delete(RedisCache.dashboardKey('shop', userIdStr));
          await RedisCache.delete(RedisCache.listKey('user_by_id', { user_id: userIdStr, table: 'shops' }));
        } else if (user.user_type === 'D') {
          await RedisCache.delete(RedisCache.dashboardKey('deliveryboy', userIdStr));
          await RedisCache.delete(RedisCache.listKey('user_by_id', { user_id: userIdStr, table: 'delivery_boy' }));
        }
        
        // Invalidate name-based cache if user had a name
        if (user.name) {
          await RedisCache.delete(RedisCache.userKey(`name:${user.name}`, 'search'));
          await RedisCache.delete(RedisCache.userKey(`name:${user.name}`, 'exact'));
        }
        
        console.log(`🗑️  Invalidated all user caches for user_id: ${userIdStr}`);
      } catch (redisErr) {
        console.error('Redis cache invalidation error:', redisErr);
      }

      return {
        userId: userId,
        deleted: true,
        message: 'Account deleted successfully'
      };
    } catch (error) {
      console.error('V2ProfileService.deleteAccount error:', error);
      throw error;
    }
  }
}

module.exports = V2ProfileService;


      // Invalidate user caches after user type update
      try {
        const userIdStr = String(userId);
        await RedisCache.delete(RedisCache.userKey(userIdStr, 'profile'));
        await RedisCache.delete(RedisCache.userKey(userIdStr));
        await RedisCache.delete(RedisCache.listKey('user_by_id', { user_id: userIdStr, table: 'users' }));
        await RedisCache.delete(RedisCache.listKey('user_by_id', { user_id: userIdStr, table: 'delivery_boy' }));
        await RedisCache.invalidateTableCache('users');
        await RedisCache.invalidateTableCache('delivery_boy');
        console.log('🗑️  Invalidated user caches after user type update');
      } catch (err) {
        console.error('Redis cache invalidation error:', err);
      }
    }

    // Set approval_status to 'pending' if not already set
    if (!delivery.approval_status) {
      const currentTime = new Date().toISOString();
      const updateData = { approval_status: 'pending' };
      
      // Set application_submitted_at when signup is completed for the first time
      if (!delivery.application_submitted_at) {
        updateData.application_submitted_at = currentTime;
        console.log(`📋 Setting application_submitted_at for delivery ${delivery.id}`);
      }
      
      // Set review_initiated_at when status is set to pending for the first time
      if (!delivery.review_initiated_at) {
        updateData.review_initiated_at = currentTime;
        console.log(`📋 Setting review_initiated_at for delivery ${delivery.id}`);
      }
      
      console.log(`📋 Setting approval_status to 'pending' for delivery ${delivery.id}`);
      await DeliveryBoy.update(delivery.id, updateData);
      console.log(`✅ Delivery approval_status set to 'pending' for delivery ${delivery.id}`);
    }

    // Return updated profile
    return await V2ProfileService.getProfile(userId);
  }

  /**
   * Delete user account (soft delete)
   * @param {string|number} userId - User ID
   * @returns {Promise<Object>} Deletion result
   */
  static async deleteAccount(userId) {
    try {
      const user = await User.findById(userId);
      
      if (!user) {
        throw new Error('USER_NOT_FOUND');
      }

      // Soft delete based on user type
      if (user.user_type === 'S' || user.user_type === 'R' || user.user_type === 'SR') {
        const shop = await Shop.findByUserId(userId);
        if (shop) {
          await Shop.update(shop.id, { del_status: 2 });
          console.log(`✅ Soft deleted shop ${shop.id} for user ${userId}`);
        }
      } else if (user.user_type === 'D') {
        const deliveryBoy = await DeliveryBoy.findByUserId(userId);
        if (deliveryBoy) {
          await DeliveryBoy.update(deliveryBoy.id, { del_status: 2 });
          console.log(`✅ Soft deleted delivery boy ${deliveryBoy.id} for user ${userId}`);
        }
      } else if (user.user_type === 'C') {
        const customer = await Customer.findByUserId(userId);
        if (customer) {
          await Customer.update(customer.id, { del_status: 2 });
          console.log(`✅ Soft deleted customer ${customer.id} for user ${userId}`);
        }
      }

      // Reset user to new/unregistered state by setting user_type to 'N'
      await User.updateProfile(userId, { user_type: 'N', del_status: 2 });
      console.log(`✅ Reset user ${userId} to type 'N' (new/unregistered)`);

      // Invalidate all user-related caches
      try {
        const userIdStr = String(userId);
        await RedisCache.delete(RedisCache.userKey(userIdStr, 'profile'));
        await RedisCache.delete(RedisCache.userKey(userIdStr));
        
        // Invalidate get_user_by_id cache for all possible tables
        await RedisCache.delete(RedisCache.listKey('user_by_id', { user_id: userIdStr, table: 'users' }));
        if (user.user_type === 'S' || user.user_type === 'R' || user.user_type === 'SR') {
          await RedisCache.delete(RedisCache.dashboardKey('shop', userIdStr));
          await RedisCache.delete(RedisCache.listKey('user_by_id', { user_id: userIdStr, table: 'shops' }));
        } else if (user.user_type === 'D') {
          await RedisCache.delete(RedisCache.dashboardKey('deliveryboy', userIdStr));
          await RedisCache.delete(RedisCache.listKey('user_by_id', { user_id: userIdStr, table: 'delivery_boy' }));
        }
        
        // Invalidate name-based cache if user had a name
        if (user.name) {
          await RedisCache.delete(RedisCache.userKey(`name:${user.name}`, 'search'));
          await RedisCache.delete(RedisCache.userKey(`name:${user.name}`, 'exact'));
        }
        
        console.log(`🗑️  Invalidated all user caches for user_id: ${userIdStr}`);
      } catch (redisErr) {
        console.error('Redis cache invalidation error:', redisErr);
      }

      return {
        userId: userId,
        deleted: true,
        message: 'Account deleted successfully'
      };
    } catch (error) {
      console.error('V2ProfileService.deleteAccount error:', error);
      throw error;
    }
  }
}

module.exports = V2ProfileService;

