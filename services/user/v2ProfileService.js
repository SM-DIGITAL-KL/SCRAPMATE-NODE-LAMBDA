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
   * @param {string} requestingAppType - App type making the request ('customer_app' | 'vendor_app' | null)
   * @returns {Promise<Object>} User profile data
   */
  static async getProfile(userId, requestingAppType = null) {
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
        // BUT: Only include this data for vendor_app users, not customer_app
        const isVendorAppForNewUser = (user.app_type || 'vendor_app') === 'vendor_app';
        try {
          // Check for delivery_boy data (for delivery signup) - ONLY for vendor_app
          if (isVendorAppForNewUser) {
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
          }

          // Check for shop data (for B2B/B2C signup) - ONLY for vendor_app
          if (isVendorAppForNewUser) {
            // For SR users, check all shops and merge them
            let shop = null;
            if (user.user_type === 'SR') {
              const allShops = await Shop.findAllByUserId(userId);
              if (allShops.length > 0) {
                const b2cShop = allShops.find(s => s.shop_type === 3);
                const b2bShop = allShops.find(s => s.shop_type === 1 || s.shop_type === 4);
                
                if (b2cShop && b2bShop) {
                  // Merge both shops
                  shop = {
                    ...b2cShop,
                    company_name: b2bShop.company_name || b2cShop.company_name || '',
                    gst_number: b2bShop.gst_number || b2cShop.gst_number || '',
                    pan_number: b2bShop.pan_number || b2cShop.pan_number || '',
                    business_license_url: b2bShop.business_license_url || b2cShop.business_license_url || '',
                    gst_certificate_url: b2bShop.gst_certificate_url || b2cShop.gst_certificate_url || '',
                    address_proof_url: b2bShop.address_proof_url || b2cShop.address_proof_url || '',
                    kyc_owner_url: b2bShop.kyc_owner_url || b2cShop.kyc_owner_url || '',
                    approval_status: b2bShop.approval_status || b2cShop.approval_status || null,
                    rejection_reason: b2bShop.rejection_reason || b2cShop.rejection_reason || null,
                    application_submitted_at: b2bShop.application_submitted_at || b2cShop.application_submitted_at || null,
                    documents_verified_at: b2bShop.documents_verified_at || b2cShop.documents_verified_at || null,
                    review_initiated_at: b2bShop.review_initiated_at || b2cShop.review_initiated_at || null,
                    id: b2bShop.id,
                  };
                } else {
                  shop = b2cShop || b2bShop || allShops[0];
                }
              }
            } else {
              shop = await Shop.findByUserId(userId);
            }
            
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
          }

          // Check for customer data (for common users - user_type 'C')
          // Customer data should be available for both vendor_app and customer_app
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
      // IMPORTANT: Use requestingAppType if provided, otherwise fall back to database app_type
      // This ensures customer_app requests get customer data even if DB has vendor_app
      const userAppType = user.app_type || 'vendor_app';
      // Use requesting app type if provided (from request header/query), otherwise use DB app_type
      const effectiveAppType = requestingAppType || userAppType;
      // For customer_app requests, always treat as user_type 'C' regardless of database value
      const effectiveUserType = effectiveAppType === 'customer_app' ? 'C' : user.user_type;

      let profileData = {
        id: user.id,
        name: user.name || '', // Will be updated for B2B and Delivery users
        email: user.email || '',
        phone: user.mob_num ? String(user.mob_num) : '',
        user_type: effectiveUserType, // Use 'C' for customer_app requests, actual type for vendor_app
        app_type: effectiveAppType, // Use requesting app type, not DB app_type
        profile_image: user.profile_image || user.profile_photo || null, // Support both field names
        created_at: user.created_at,
        updated_at: user.updated_at,
      };

      // Add user object for ALL user types (B2B, B2C, Delivery, and regular Users with category 'U')
      // This ensures all users have a consistent user object in the profile response
      // For customer_app requests, use effectiveUserType ('C') instead of actual user_type
      profileData.user = {
        id: user.id,
        name: user.name || '',
        email: user.email || '',
        phone: user.mob_num ? String(user.mob_num) : '',
        user_type: effectiveUserType, // Use 'C' for customer_app requests
        app_type: effectiveAppType, // Use requesting app type
        app_version: user.app_version || 'v1',
        profile_image: user.profile_image || user.profile_photo || null,
        operating_categories: user.operating_categories || [],
        operating_subcategories: user.operating_subcategories || [],
        created_at: user.created_at,
        updated_at: user.updated_at,
      };

      // Add shop data for B2B/B2C users - ONLY for vendor_app requests
      // Don't show shop data in customer_app even if user_type is S/R/SR
      // Use effectiveAppType and effectiveUserType to ensure customer_app requests never get shop data
      const isVendorApp = effectiveAppType === 'vendor_app';
      if ((effectiveUserType === 'S' || effectiveUserType === 'R' || effectiveUserType === 'SR') && isVendorApp) {
        try {
          let shop = null;
          let b2cShop = null;
          let b2bShop = null;

          // For SR users, find all shops and merge B2C and B2B shop data
          if (effectiveUserType === 'SR') {
            const allShops = await Shop.findAllByUserId(userId);
            console.log(`🔍 All shops lookup for SR user ${userId}:`, allShops.length > 0 ? `Found ${allShops.length} shops` : 'Not found');

            if (allShops.length > 0) {
              // Find B2C shop (shop_type = 3) and B2B shop (shop_type = 1 or 4)
              b2cShop = allShops.find(s => s.shop_type === 3);
              b2bShop = allShops.find(s => s.shop_type === 1 || s.shop_type === 4);
              
              console.log(`🔍 Profile Service: Found shops - b2cShop: ${b2cShop ? `ID ${b2cShop.id}, type ${b2cShop.shop_type}` : 'null'}, b2bShop: ${b2bShop ? `ID ${b2bShop.id}, type ${b2bShop.shop_type}` : 'null'}`);

              // If we have both B2C and B2B shops, merge them
              if (b2cShop && b2bShop) {
                console.log(`✅ Found both B2C shop (ID: ${b2cShop.id}) and B2B shop (ID: ${b2bShop.id}) for SR user, merging data`);
                // Merge shops: use B2C for basic fields, B2B for business fields
                // Use B2B shop ID as primary (or B2C if B2B doesn't exist)
                shop = {
                  ...b2cShop,
                  // Override with B2B fields where they exist
                  company_name: b2bShop.company_name || b2cShop.company_name || '',
                  gst_number: b2bShop.gst_number || b2cShop.gst_number || '',
                  pan_number: b2bShop.pan_number || b2cShop.pan_number || '',
                  business_license_url: b2bShop.business_license_url || b2cShop.business_license_url || '',
                  gst_certificate_url: b2bShop.gst_certificate_url || b2cShop.gst_certificate_url || '',
                  address_proof_url: b2bShop.address_proof_url || b2cShop.address_proof_url || '',
                  kyc_owner_url: b2bShop.kyc_owner_url || b2cShop.kyc_owner_url || '',
                  // Use B2B approval status if available, otherwise B2C
                  approval_status: b2bShop.approval_status || b2cShop.approval_status || null,
                  rejection_reason: b2bShop.rejection_reason || b2cShop.rejection_reason || null,
                  application_submitted_at: b2bShop.application_submitted_at || b2cShop.application_submitted_at || null,
                  documents_verified_at: b2bShop.documents_verified_at || b2cShop.documents_verified_at || null,
                  review_initiated_at: b2bShop.review_initiated_at || b2cShop.review_initiated_at || null,
                  // Use B2B shop ID as primary (since B2B is typically created later)
                  id: b2bShop.id,
                };
              } else if (b2cShop) {
                console.log(`✅ Found B2C shop (ID: ${b2cShop.id}) for SR user`);
                shop = b2cShop;
              } else if (b2bShop) {
                console.log(`✅ Found B2B shop (ID: ${b2bShop.id}) for SR user`);
                shop = b2bShop;
              } else {
                // Use first shop if type doesn't match expected patterns
                shop = allShops[0];
                console.log(`⚠️ Using first shop (ID: ${shop.id}, shop_type: ${shop.shop_type}) for SR user`);
              }
            }
          } else {
            // For S and R users, use the existing findByUserId method
            shop = await Shop.findByUserId(userId);
            console.log(`🔍 Shop lookup for user ${userId}:`, shop ? `Found ID ${shop.id}` : 'Not found');
          }

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
              // Subscription fields (for B2C shops)
              is_subscribed: shop.is_subscribed !== undefined ? shop.is_subscribed : undefined,
              subscription_ends_at: shop.subscription_ends_at || null,
              is_subscription_ends: shop.is_subscription_ends !== undefined ? shop.is_subscription_ends : undefined,
              subscribed_duration: shop.subscribed_duration || null,
              // Location fields
              lat_log: shop.lat_log || '',
              location: shop.location || '',
              latitude: shop.latitude || null,
              longitude: shop.longitude || null,
            };

            // For B2B users, use company_name as the display name
            if (shop.company_name && shop.company_name.trim() !== '') {
              profileData.name = shop.company_name;
              console.log(`✅ Using company_name as display name for B2B user: ${shop.company_name}`);
            }

            // For SR users, also include separate b2bShop and b2cShop objects for easier approval status checking
            // IMPORTANT: Always set b2bShop and b2cShop if they exist, regardless of whether both exist
            console.log(`🔍 Profile Service: Checking b2bShop and b2cShop for SR user - effectiveUserType: ${effectiveUserType}, b2bShop exists: ${!!b2bShop}, b2cShop exists: ${!!b2cShop}`);
            console.log(`🔍 Profile Service: b2bShop details:`, b2bShop ? {id: b2bShop.id, shop_type: b2bShop.shop_type, approval_status: b2bShop.approval_status} : 'null');
            console.log(`🔍 Profile Service: b2cShop details:`, b2cShop ? {id: b2cShop.id, shop_type: b2cShop.shop_type, approval_status: b2cShop.approval_status} : 'null');
            
            if (effectiveUserType === 'SR') {
              // Set b2bShop if it exists
              if (b2bShop) {
                profileData.b2bShop = {
                  id: b2bShop.id,
                  shopname: b2bShop.shopname || '',
                  ownername: b2bShop.ownername || '',
                  address: b2bShop.address || '',
                  contact: b2bShop.contact || '',
                  company_name: b2bShop.company_name || '',
                  gst_number: b2bShop.gst_number || '',
                  pan_number: b2bShop.pan_number || '',
                  business_license_url: b2bShop.business_license_url || '',
                  gst_certificate_url: b2bShop.gst_certificate_url || '',
                  address_proof_url: b2bShop.address_proof_url || '',
                  kyc_owner_url: b2bShop.kyc_owner_url || '',
                  approval_status: b2bShop.approval_status || null,
                  rejection_reason: b2bShop.rejection_reason || null,
                  shop_type: b2bShop.shop_type,
                  // Location fields
                  lat_log: b2bShop.lat_log || '',
                  location: b2bShop.location || '',
                  latitude: b2bShop.latitude || null,
                  longitude: b2bShop.longitude || null,
                };
                console.log(`✅ Added b2bShop to profile for SR user`);
              }
              
              // Set b2cShop if it exists
              if (b2cShop) {
                profileData.b2cShop = {
                  id: b2cShop.id,
                  shopname: b2cShop.shopname || '',
                  address: b2cShop.address || '',
                  contact: b2cShop.contact || '',
                  aadhar_card: b2cShop.aadhar_card || null,
                  driving_license: b2cShop.driving_license || null,
                  approval_status: b2cShop.approval_status || null,
                  rejection_reason: b2cShop.rejection_reason || null,
                  shop_type: b2cShop.shop_type,
                  // Subscription fields (for B2C shops)
                  is_subscribed: b2cShop.is_subscribed !== undefined ? b2cShop.is_subscribed : undefined,
                  subscription_ends_at: b2cShop.subscription_ends_at || null,
                  is_subscription_ends: b2cShop.is_subscription_ends !== undefined ? b2cShop.is_subscription_ends : undefined,
                  subscribed_duration: b2cShop.subscribed_duration || null,
                  // Location fields
                  lat_log: b2cShop.lat_log || '',
                  location: b2cShop.location || '',
                  latitude: b2cShop.latitude || null,
                  longitude: b2cShop.longitude || null,
                };
                console.log(`✅ Added b2cShop to profile for SR user with subscription fields:`, {
                  is_subscribed: b2cShop.is_subscribed,
                  subscription_ends_at: b2cShop.subscription_ends_at,
                  is_subscription_ends: b2cShop.is_subscription_ends,
                  subscribed_duration: b2cShop.subscribed_duration
                });
              }
              
              if (b2bShop && b2cShop) {
                console.log(`✅ Added both b2bShop and b2cShop to profile for SR user`);
              }
            }
            
            // Legacy code - keeping for backward compatibility but should not be reached
            if (false && effectiveUserType === 'SR' && b2bShop && b2cShop) {
              profileData.b2bShop = {
                id: b2bShop.id,
                shopname: b2bShop.shopname || '',
                ownername: b2bShop.ownername || '',
                address: b2bShop.address || '',
                contact: b2bShop.contact || '',
                company_name: b2bShop.company_name || '',
                gst_number: b2bShop.gst_number || '',
                pan_number: b2bShop.pan_number || '',
                business_license_url: b2bShop.business_license_url || '',
                gst_certificate_url: b2bShop.gst_certificate_url || '',
                address_proof_url: b2bShop.address_proof_url || '',
                kyc_owner_url: b2bShop.kyc_owner_url || '',
                approval_status: b2bShop.approval_status || null,
                rejection_reason: b2bShop.rejection_reason || null,
                shop_type: b2bShop.shop_type,
              };
              profileData.b2cShop = {
                id: b2cShop.id,
                shopname: b2cShop.shopname || '',
                address: b2cShop.address || '',
                contact: b2cShop.contact || '',
                aadhar_card: b2cShop.aadhar_card || null,
                driving_license: b2cShop.driving_license || null,
                approval_status: b2cShop.approval_status || null,
                rejection_reason: b2cShop.rejection_reason || null,
                shop_type: b2cShop.shop_type,
              };
              console.log(`✅ Added separate b2bShop and b2cShop to profile for SR user (legacy code)`);
            }

            console.log(`✅ Shop data added to profile:`, profileData.shop);
          } else {
            // Only include empty shop object for vendor_app users, not customer_app
            if (isVendorApp) {
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
          }
        } catch (err) {
          console.error('❌ Error fetching shop data:', err);
          // Only include empty shop object for vendor_app users, not customer_app
          if (isVendorApp) {
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
      }

      // Add customer data for regular users (user_type 'C' - common users)
      // For customer_app, always show customer data (effectiveUserType will be 'C')
      if (effectiveUserType === 'C') {
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

      // Add delivery boy data for Delivery users - ONLY for vendor_app requests
      // Don't show delivery data in customer_app even if user_type is D
      // Use effectiveAppType and effectiveUserType to ensure customer_app requests never get delivery data
      if (effectiveUserType === 'D' && isVendorApp) {
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
            // Only include empty delivery object for vendor_app users, not customer_app
            if (isVendorApp) {
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
          }
        } catch (err) {
          console.error('❌ Error fetching delivery boy data:', err);
          // Only include empty delivery object for vendor_app users, not customer_app
          if (isVendorApp) {
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
            profileData.delivery_boy = profileData.delivery;
          }
        }
      }

      // Calculate profile completion percentage
      profileData.completion_percentage = this.calculateCompletion(profileData);

      // Fetch invoices for vendor_app users (for subscription management)
      if (isVendorApp) {
        try {
          const Invoice = require('../../models/Invoice');
          const invoices = await Invoice.findByUserId(userId);
          // Sort by id descending (most recent first)
          invoices.sort((a, b) => (b.id || 0) - (a.id || 0));
          profileData.invoices = invoices;
          console.log(`✅ Added ${invoices.length} invoices to profile for user ${userId}`);
        } catch (invoiceError) {
          console.error('❌ Error fetching invoices for profile:', invoiceError);
          profileData.invoices = [];
        }
      }

      // Final safety check: Remove shop/delivery data if app_type is customer_app
      // This ensures no vendor data leaks to customer_app even if something went wrong above
      // Also ensure user_type is 'C' for customer_app requests (even if DB has 'D' or other types)
      const finalAppType = profileData.app_type || 'vendor_app';
      if (finalAppType !== 'vendor_app') {
        // Remove vendor-specific data for customer_app
        delete profileData.shop;
        delete profileData.delivery;
        delete profileData.delivery_boy;
        delete profileData.invoices;
        // Force user_type to 'C' for customer_app (override any 'D', 'S', 'R', 'SR' from DB)
        profileData.user_type = 'C';
        if (profileData.user) {
          profileData.user.user_type = 'C';
        }
        console.log(`🔒 Service: Removed vendor data and set user_type to 'C' for ${finalAppType} request (DB user_type: ${user.user_type}, DB app_type: ${userAppType}, requesting app: ${requestingAppType || 'none'})`);
      }

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
   * @param {string} requestingAppType - App type making the request ('customer_app' | 'vendor_app' | null)
   * @returns {Promise<Object>} Updated user profile
   */
  static async updateProfile(userId, updateData, requestingAppType = null) {
    try {
      const user = await User.findById(userId);

      if (!user) {
        throw new Error('USER_NOT_FOUND');
      }

      // Prepare user update data
      const userUpdateData = {};
      if (updateData.name !== undefined) {
        userUpdateData.name = updateData.name;
        console.log(`📝 [updateProfile] Updating name for user ${userId}:`, updateData.name);
      }
      if (updateData.email !== undefined) {
        // Check email uniqueness if changing
        if (updateData.email !== user.email) {
          const emailExists = await User.emailExists(updateData.email);
          if (emailExists) {
            throw new Error('EMAIL_ALREADY_EXISTS');
          }
        }
        userUpdateData.email = updateData.email;
        console.log(`📝 [updateProfile] Updating email for user ${userId}:`, updateData.email);
      }
      if (updateData.profile_image !== undefined) {
        userUpdateData.profile_image = updateData.profile_image;
        // Also update profile_photo for backward compatibility
        userUpdateData.profile_photo = updateData.profile_image;
      }

      // Update user if there's data to update
      if (Object.keys(userUpdateData).length > 0) {
        console.log(`💾 [updateProfile] Saving user update data for user ${userId}:`, JSON.stringify(userUpdateData, null, 2));
        await User.updateProfile(userId, userUpdateData);
        console.log(`✅ [updateProfile] User ${userId} updated successfully`);

        // Verify the update
        const updatedUser = await User.findById(userId);
        console.log(`✅ [updateProfile] Verified user ${userId} after update - name: ${updatedUser?.name}, email: ${updatedUser?.email}`);
      } else {
        console.log(`⚠️ [updateProfile] No user data to update for user ${userId}`);
      }

      // Update shop data for B2B/B2C users (including new users 'N' who are completing signup)
      if ((user.user_type === 'S' || user.user_type === 'R' || user.user_type === 'SR' || user.user_type === 'N') && updateData.shop) {
        try {
          console.log(`📦 [updateProfile] Shop update data received:`, JSON.stringify(updateData.shop, null, 2));
          
          // For SR users or potential SR conversions, check all shops
          let shop = null;
          let allShops = [];
          
          if (user.user_type === 'S' || user.user_type === 'R' || user.user_type === 'SR') {
            allShops = await Shop.findAllByUserId(userId);
            console.log(`🔍 All shops lookup for user ${userId}:`, allShops.length > 0 ? `Found ${allShops.length} shops` : 'Not found');
            
            // Get the first shop for backward compatibility (or use findByUserId for single shop)
            shop = allShops.length > 0 ? allShops[0] : null;
          } else {
            shop = await Shop.findByUserId(userId);
          }
          
          console.log(`🔍 Shop lookup for user ${userId}:`, shop ? `Found shop ${shop.id} (shop_type: ${shop.shop_type}, del_status: ${shop.del_status || 1})` : 'Not found');

          // Check if S user is converting to SR (has B2B shop and creating B2C shop)
          // For S/SR users, find B2B and B2C shops separately
          let existingB2BShop = null;
          let existingB2CShop = null;
          if ((user.user_type === 'S' || user.user_type === 'SR') && allShops.length > 0) {
            existingB2BShop = allShops.find(s => s.shop_type === 1 || s.shop_type === 4);
            existingB2CShop = allShops.find(s => s.shop_type === 3);
            console.log(`🔍 S/SR->SR conversion check - found B2B shop:`, existingB2BShop ? `ID ${existingB2BShop.id}, shop_type ${existingB2BShop.shop_type}` : 'None');
            console.log(`🔍 S/SR->SR conversion check - found B2C shop:`, existingB2CShop ? `ID ${existingB2CShop.id}, shop_type ${existingB2CShop.shop_type}` : 'None');
          }
          const existingShopType = shop?.shop_type;
          // For S users: converting to SR (has B2B, creating B2C)
          // For SR users: adding B2C shop (has B2B, creating B2C if B2C doesn't exist)
          const isSUserConvertingToSR = user.user_type === 'S' && existingB2BShop && !existingB2CShop;
          const isSRUserAddingB2C = user.user_type === 'SR' && existingB2BShop && !existingB2CShop;
          const shouldCreateNewB2CShop = isSUserConvertingToSR || isSRUserAddingB2C;
          const isRUserConvertingToSR = user.user_type === 'R' && existingShopType === 3;
          
          // For B2C users (R): Check if required documents are uploaded before saving
          // For v1 or new users: Don't save if Aadhar card is not uploaded
          const isV1User = !user.app_version || user.app_version === 'v1' || user.app_version === 'v1.0';
          const isB2CUser = user.user_type === 'R';
          const isNewUser = !shop || !shop.id;

          // Log if shop was deleted - will be reactivated during update
          if (shop && shop.del_status === 2) {
            console.log(`⚠️  [updateProfile] Shop ${shop.id} has del_status = 2 (deleted). Will be reactivated (del_status = 1) during this update.`);
          }

          // Create shop if it doesn't exist OR if S/SR user is converting to SR (create new B2C shop)
          if (!shop || shouldCreateNewB2CShop) {
            if (shouldCreateNewB2CShop) {
              if (isSUserConvertingToSR) {
                console.log(`📝 S user converting to SR - creating new B2C shop (shop_type = 3) while preserving existing B2B shop ${existingB2BShop?.id || 'unknown'}`);
              } else if (isSRUserAddingB2C) {
                console.log(`📝 SR user adding B2C shop - creating new B2C shop (shop_type = 3) while preserving existing B2B shop ${existingB2BShop?.id || 'unknown'}`);
              }
            } else {
              console.log(`📝 Creating shop for user ${userId} with address:`, updateData.shop.address);
            }
            
            const shopData = {
              user_id: userId,
              email: user.email || '',
              shopname: user.name || '',
              address: updateData.shop.address || '',
              contact: updateData.shop.contact || '',
            };

            // Check for duplicate shops with the same contact number (excluding current user)
            // Skip this check for S->SR or SR->SR conversion since they're intentionally creating a second shop
            if (shopData.contact && !shouldCreateNewB2CShop) {
              const existingShops = await Shop.findByContact(shopData.contact, userId);
              if (existingShops.length > 0) {
                const errorMsg = `A shop with contact number ${shopData.contact} already exists. Please use your existing shop account or contact support.`;
                console.error(`❌ [updateProfile] Duplicate shop detected:`, {
                  contact: shopData.contact,
                  existingShops: existingShops.map(s => ({ id: s.id, user_id: s.user_id, shopname: s.shopname }))
                });
                throw new Error(errorMsg);
              }
            }
            
            // For S->SR or SR->SR conversion, copy location fields from existing B2B shop if not provided
            if (shouldCreateNewB2CShop && existingB2BShop) {
              console.log(`📝 S/SR->SR conversion - copying location fields from B2B shop ${existingB2BShop.id}`);
              if (!updateData.shop.address && existingB2BShop.address) shopData.address = existingB2BShop.address;
              if (existingB2BShop.location && !updateData.shop.location) shopData.location = existingB2BShop.location;
              if (existingB2BShop.state && !updateData.shop.state) shopData.state = existingB2BShop.state;
              if (existingB2BShop.place && !updateData.shop.place) shopData.place = existingB2BShop.place;
              if (existingB2BShop.pincode && !updateData.shop.pincode) shopData.pincode = existingB2BShop.pincode;
              if (existingB2BShop.lat_log && !updateData.shop.lat_log) shopData.lat_log = existingB2BShop.lat_log;
              if (existingB2BShop.place_id && !updateData.shop.place_id) shopData.place_id = existingB2BShop.place_id;
              if (existingB2BShop.latitude && !updateData.shop.latitude) shopData.latitude = existingB2BShop.latitude;
              if (existingB2BShop.longitude && !updateData.shop.longitude) shopData.longitude = existingB2BShop.longitude;
            }

            // Include location fields if provided
            // Include location fields if provided
            if (updateData.shop.lat_log !== undefined && updateData.shop.lat_log !== null && updateData.shop.lat_log !== '') {
              shopData.lat_log = updateData.shop.lat_log;
              console.log(`📝 Setting shop lat_log:`, shopData.lat_log);
            }
            if (updateData.shop.latitude !== undefined && updateData.shop.latitude !== null) {
              const lat = typeof updateData.shop.latitude === 'string' ? parseFloat(updateData.shop.latitude) : updateData.shop.latitude;
              if (!isNaN(lat)) {
                shopData.latitude = lat;
                console.log(`📝 Setting shop latitude:`, lat);
              }
            }
            if (updateData.shop.longitude !== undefined && updateData.shop.longitude !== null) {
              const lng = typeof updateData.shop.longitude === 'string' ? parseFloat(updateData.shop.longitude) : updateData.shop.longitude;
              if (!isNaN(lng)) {
                shopData.longitude = lng;
                console.log(`📝 Setting shop longitude:`, lng);
              }
            }

            // Ensure lat_log is created from latitude/longitude if not provided
            if (!shopData.lat_log && shopData.latitude !== undefined && shopData.longitude !== undefined) {
              shopData.lat_log = `${shopData.latitude},${shopData.longitude}`;
              console.log(`📝 Created lat_log from latitude/longitude: ${shopData.lat_log}`);
            }

            // Include other location-related fields
            if (updateData.shop.pincode !== undefined) shopData.pincode = updateData.shop.pincode || '';
            if (updateData.shop.place_id !== undefined) shopData.place_id = updateData.shop.place_id || '';
            if (updateData.shop.state !== undefined) shopData.state = updateData.shop.state || '';
            if (updateData.shop.language !== undefined) shopData.language = updateData.shop.language || '';
            if (updateData.shop.place !== undefined) shopData.place = updateData.shop.place || '';
            if (updateData.shop.location !== undefined) shopData.location = updateData.shop.location || '';

            // Determine shop_type based on user type and signup context
            // For B2C signup (user_type N or R), set shop_type = 3 (Retailer B2C)
            // For S->SR or SR->SR conversion, create new B2C shop with shop_type = 3
            // For B2B signup (user_type S), set shop_type = 1 (Industrial) or 4 (Wholesaler)
            // For v1 users, shop_type = 2 (Retailer/Door Step Buyer)
            if (shouldCreateNewB2CShop) {
              // S/SR user converting to SR - create new B2C shop with shop_type = 3
              shopData.shop_type = 3; // Retailer B2C
              console.log(`📝 Setting shop_type = 3 (Retailer B2C) for S/SR->SR conversion`);
            } else if (user.user_type === 'N' || user.user_type === 'R') {
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

            // Ensure del_status is always set to 1 (active) when creating a shop
            shopData.del_status = 1;
            console.log(`📝 Setting del_status = 1 for new shop creation`);

            shop = await Shop.create(shopData);
            console.log(`✅ Shop created with ID ${shop.id}, shop_type: ${shop.shop_type}, del_status: ${shop.del_status || 1}, address:`, shop.address);
            if (shopData.lat_log) {
              console.log(`✅ Shop location set: ${shopData.lat_log}`);
            }
            
            // For S->SR conversion, verify the existing B2B shop is preserved
            if (shouldCreateNewB2CShop && existingB2BShop) {
              const verifyB2BShop = await Shop.findById(existingB2BShop.id);
              if (verifyB2BShop && verifyB2BShop.id === existingB2BShop.id) {
                console.log(`✅ Verified B2B shop ${existingB2BShop.id} is preserved (shop_type: ${verifyB2BShop.shop_type})`);
              } else {
                console.error(`❌ CRITICAL: B2B shop ${existingB2BShop.id} was not preserved during S->SR conversion!`);
              }
            }
          }

          // Update existing shop
          // For S->SR conversion: we just created a new B2C shop, so we can update it with additional fields
          // The existing B2B shop is preserved and won't be touched (it's not in the `shop` variable)
          if (shop && shop.id) {
            // If shop was previously deleted (del_status = 2) and vendor is re-registering/updating shop info,
            // reset del_status back to 1 (active) to reactivate the shop
            // This should happen regardless of which fields are being updated, as long as shop update section is entered
            const shouldReactivateShop = shop.del_status === 2;

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

            // Update location fields - lat_log, latitude, longitude
            let parsedLatitude = undefined;
            let parsedLongitude = undefined;

            if (updateData.shop.latitude !== undefined && updateData.shop.latitude !== null && updateData.shop.latitude !== '') {
              parsedLatitude = typeof updateData.shop.latitude === 'string' ? parseFloat(updateData.shop.latitude) : updateData.shop.latitude;
              if (!isNaN(parsedLatitude)) {
                shopUpdateData.latitude = parsedLatitude;
                console.log(`📝 Updating shop ${shop.id} latitude to:`, parsedLatitude);
              }
            }

            if (updateData.shop.longitude !== undefined && updateData.shop.longitude !== null && updateData.shop.longitude !== '') {
              parsedLongitude = typeof updateData.shop.longitude === 'string' ? parseFloat(updateData.shop.longitude) : updateData.shop.longitude;
              if (!isNaN(parsedLongitude)) {
                shopUpdateData.longitude = parsedLongitude;
                console.log(`📝 Updating shop ${shop.id} longitude to:`, parsedLongitude);
              }
            }

            // Handle lat_log: if provided, use it; otherwise create from latitude/longitude
            if (updateData.shop.lat_log !== undefined && updateData.shop.lat_log !== null && updateData.shop.lat_log !== '') {
              if (updateData.shop.lat_log.includes(',')) {
                shopUpdateData.lat_log = updateData.shop.lat_log.trim();
                console.log(`📝 Updating shop ${shop.id} lat_log to:`, shopUpdateData.lat_log);

                // If lat_log is provided but latitude/longitude are not, parse from lat_log
                if (parsedLatitude === undefined && parsedLongitude === undefined) {
                  const [lat, lng] = updateData.shop.lat_log.split(',').map(Number);
                  if (!isNaN(lat) && !isNaN(lng)) {
                    shopUpdateData.latitude = lat;
                    shopUpdateData.longitude = lng;
                    console.log(`📝 Parsed latitude/longitude from lat_log: ${lat}, ${lng}`);
                  }
                }
              } else {
                console.log(`⚠️ Invalid lat_log format for shop ${shop.id}, skipping`);
              }
            } else if (parsedLatitude !== undefined && parsedLongitude !== undefined) {
              // If latitude/longitude are provided but lat_log is not, create lat_log from them
              shopUpdateData.lat_log = `${parsedLatitude},${parsedLongitude}`;
              console.log(`📝 Created lat_log from latitude/longitude: ${shopUpdateData.lat_log}`);
            }

            // Update other location-related fields
            if (updateData.shop.pincode !== undefined) {
              shopUpdateData.pincode = updateData.shop.pincode || '';
              console.log(`📝 Updating shop ${shop.id} pincode to:`, shopUpdateData.pincode);
            }
            if (updateData.shop.place_id !== undefined) {
              shopUpdateData.place_id = updateData.shop.place_id || '';
              console.log(`📝 Updating shop ${shop.id} place_id to:`, shopUpdateData.place_id);
            }
            if (updateData.shop.state !== undefined) {
              shopUpdateData.state = updateData.shop.state || '';
              console.log(`📝 Updating shop ${shop.id} state to:`, shopUpdateData.state);
            }
            if (updateData.shop.language !== undefined) {
              shopUpdateData.language = updateData.shop.language || '';
              console.log(`📝 Updating shop ${shop.id} language to:`, shopUpdateData.language);
            }
            if (updateData.shop.place !== undefined) {
              shopUpdateData.place = updateData.shop.place || '';
              console.log(`📝 Updating shop ${shop.id} place to:`, shopUpdateData.place);
            }
            if (updateData.shop.location !== undefined) {
              shopUpdateData.location = updateData.shop.location || '';
              console.log(`📝 Updating shop ${shop.id} location to:`, shopUpdateData.location);
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

            // If shop was previously deleted (del_status = 2) and vendor is re-registering/updating shop info,
            // reset del_status back to 1 (active) to reactivate the shop
            // Always reactivate if shop is deleted, regardless of other update fields
            if (shouldReactivateShop) {
              shopUpdateData.del_status = 1;
              console.log(`🔄 Shop ${shop.id} was deleted (del_status = 2), reactivating to del_status = 1 due to re-registration/update`);
            }

            // Always update shop if del_status needs to be reset (even if no other fields are being updated)
            // OR if there are other fields to update
            if (shouldReactivateShop || Object.keys(shopUpdateData).length > 0) {
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
            // For S->SR conversion, we need to get the newly created B2C shop (shop_type = 3)
            let latestShop = shop;
            if (!latestShop || !latestShop.id) {
              // For S users, find the B2C shop (shop_type = 3) if it exists
              if (user.user_type === 'S') {
                const allShopsForB2C = await Shop.findAllByUserId(userId);
                const b2cShop = allShopsForB2C.find(s => s.shop_type === 3);
                latestShop = b2cShop || await Shop.findByUserId(userId);
              } else {
                latestShop = await Shop.findByUserId(userId);
              }
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
              // For S->SR conversion, check the B2B shop (shop_type = 1 or 4), not the newly created B2C shop
              let b2bShop = null;
              if (updatedUser.user_type === 'S') {
                // Find the B2B shop (shop_type = 1 or 4) for S users who are converting to SR
                const allShopsForCheck = await Shop.findAllByUserId(userId);
                b2bShop = allShopsForCheck.find(s => s.shop_type === 1 || s.shop_type === 4);
                console.log(`🔍 S->SR conversion check - found B2B shop:`, b2bShop ? `ID ${b2bShop.id}, shop_type ${b2bShop.shop_type}` : 'None');
              }
              
              // Use B2B shop if found, otherwise use latestShop (for R users or other cases)
              const shopToCheckB2B = b2bShop || latestShop;
              const hasB2BComplete = shopToCheckB2B?.company_name && shopToCheckB2B.company_name.trim() !== '' &&
                shopToCheckB2B?.gst_number && shopToCheckB2B.gst_number.trim() !== '' &&
                shopToCheckB2B?.business_license_url && shopToCheckB2B.business_license_url.trim() !== '' &&
                shopToCheckB2B?.gst_certificate_url && shopToCheckB2B.gst_certificate_url.trim() !== '' &&
                shopToCheckB2B?.address_proof_url && shopToCheckB2B.address_proof_url.trim() !== '' &&
                shopToCheckB2B?.kyc_owner_url && shopToCheckB2B.kyc_owner_url.trim() !== '';

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

                // Check if user has any orders before - if not, auto-select all B2C categories and subcategories
                // Note: We do this check but don't block the user type update if it fails
                try {
                  const Order = require('../../models/Order');
                  // Check if user has any orders as a customer (customer_id = userId)
                  const customerOrders = await Order.findByCustomerId(userId);

                  // Also check if user has any orders as a vendor (shop_id matches their shop)
                  let vendorOrders = [];
                  if (latestShop && latestShop.id) {
                    vendorOrders = await Order.findByShopId(latestShop.id);
                  }

                  const hasOrders = (customerOrders && customerOrders.length > 0) || (vendorOrders && vendorOrders.length > 0);

                  if (!hasOrders) {
                    console.log(`📦 New B2C vendor (no previous orders) - will auto-select all B2C categories and subcategories after user type update`);

                    // Schedule category selection to run after user type update completes
                    // Use process.nextTick to ensure it runs after the current operation
                    process.nextTick(async () => {
                      try {
                        // Get all B2C categories and subcategories
                        const CategoryImgKeywords = require('../../models/CategoryImgKeywords');
                        const Subcategory = require('../../models/Subcategory');
                        const V2CategoryController = require('../../controllers/v2CategoryController');

                        // Get all categories
                        const allCategories = await CategoryImgKeywords.getAll();
                        const shops = await V2CategoryController._getAllShops();

                        // Determine B2C availability (shop_type = 3 is Retailer B2C)
                        const b2cShopTypes = [3];
                        const b2cShops = shops.filter(shop =>
                          shop.del_status === 1 && b2cShopTypes.includes(shop.shop_type)
                        );
                        const hasB2C = b2cShops.length > 0;

                        // Get all B2C categories
                        const b2cCategories = allCategories
                          .filter(cat => !cat.deleted && hasB2C)
                          .map(cat => cat.id);

                        // Get all B2C subcategories
                        const allSubcategories = await Subcategory.getAll();
                        const b2cSubcategories = allSubcategories
                          .filter(sub => !sub.deleted && hasB2C)
                          .map(sub => ({
                            subcategory_id: sub.id,
                            custom_price: '', // No custom price initially
                            price_unit: sub.price_unit || 'kg'
                          }));

                        // Update user with categories and subcategories
                        const categoryUpdateData = {
                          operating_categories: b2cCategories,
                          operating_subcategories: b2cSubcategories
                        };
                        await User.updateProfile(userId, categoryUpdateData);

                        // Invalidate cache
                        try {
                          await RedisCache.invalidateV2ApiCache('user_categories', userId);
                          await RedisCache.invalidateV2ApiCache('user_subcategories', userId);
                        } catch (cacheErr) {
                          console.error('Cache invalidation error:', cacheErr);
                        }

                        console.log(`✅ Auto-selected ${b2cCategories.length} categories and ${b2cSubcategories.length} subcategories for new B2C vendor`);
                      } catch (err) {
                        console.error('⚠️  Error auto-selecting categories (non-blocking):', err.message);
                        console.error('⚠️  Error stack:', err.stack);
                      }
                    });
                  } else {
                    const totalOrders = (customerOrders?.length || 0) + (vendorOrders?.length || 0);
                    console.log(`ℹ️  User has ${totalOrders} previous order(s) (${customerOrders?.length || 0} as customer, ${vendorOrders?.length || 0} as vendor) - skipping auto-selection of categories`);
                  }
                } catch (err) {
                  console.error('⚠️  Error checking orders (non-blocking):', err.message);
                  console.error('⚠️  Error stack:', err.stack);
                  // Continue with user type update even if order check fails
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


              // Note: Admin panel cache will refresh on next load

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

      // Update customer data for Customer users (user_type 'C')
      if (user.user_type === 'C' && (updateData.name !== undefined || updateData.email !== undefined || updateData.customer || updateData.address)) {
        try {
          const Customer = require('../models/Customer');
          let customer = await Customer.findByUserId(userId);

          if (customer) {
            // Update existing customer record
            const customerUpdateData = {};

            // Sync name from user to customer
            if (updateData.name !== undefined) {
              customerUpdateData.name = updateData.name;
              console.log(`📝 [updateProfile] Updating customer ${customer.id} name to:`, updateData.name);
            }

            // Sync email from user to customer
            if (updateData.email !== undefined) {
              customerUpdateData.email = updateData.email;
              console.log(`📝 [updateProfile] Updating customer ${customer.id} email to:`, updateData.email);
            }

            // Update customer-specific fields if provided in customer object
            if (updateData.customer) {
              if (updateData.customer.address !== undefined) {
                customerUpdateData.address = updateData.customer.address;
              }
              if (updateData.customer.contact !== undefined) {
                customerUpdateData.contact = updateData.customer.contact;
              }
              if (updateData.customer.pincode !== undefined) {
                customerUpdateData.pincode = updateData.customer.pincode;
              }
              if (updateData.customer.state !== undefined) {
                customerUpdateData.state = updateData.customer.state;
              }
              if (updateData.customer.place !== undefined) {
                customerUpdateData.place = updateData.customer.place;
              }
              if (updateData.customer.location !== undefined) {
                customerUpdateData.location = updateData.customer.location;
              }
              if (updateData.customer.language !== undefined) {
                customerUpdateData.language = updateData.customer.language;
              }
              if (updateData.customer.place_id !== undefined) {
                customerUpdateData.place_id = updateData.customer.place_id;
              }
              if (updateData.customer.lat_log !== undefined) {
                customerUpdateData.lat_log = updateData.customer.lat_log;
              }
              if (updateData.customer.latitude !== undefined) {
                customerUpdateData.latitude = updateData.customer.latitude;
              }
              if (updateData.customer.longitude !== undefined) {
                customerUpdateData.longitude = updateData.customer.longitude;
              }
            }

            // Fallback: Handle top-level address field for customer_app users (backward compatibility)
            if (updateData.address !== undefined && !updateData.customer?.address) {
              customerUpdateData.address = updateData.address;
              console.log(`📝 [updateProfile] Updating customer ${customer.id} address from top-level field:`, updateData.address);
            }

            if (Object.keys(customerUpdateData).length > 0) {
              await Customer.update(customer.id, customerUpdateData);
              console.log(`✅ Customer ${customer.id} updated successfully`);

              // Verify the update
              const updatedCustomer = await Customer.findById(customer.id);
              console.log(`✅ Verified customer ${customer.id} after update - name: ${updatedCustomer?.name}, email: ${updatedCustomer?.email}`);
            }
          } else {
            console.log(`⚠️ Customer record not found for user ${userId}, skipping customer update`);
          }
        } catch (err) {
          console.error('❌ Error updating customer data:', err);
          // Don't throw - allow user update to proceed even if customer update fails
        }
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
        } else if (user.user_type === 'C') {
          await RedisCache.delete(RedisCache.listKey('user_by_id', { user_id: userIdStr, table: 'customer' }));
          await RedisCache.invalidateTableCache('customer');
        }

        await RedisCache.invalidateTableCache('users');
        console.log(`✅ Redis caches invalidated for user ${userIdStr}`);
      } catch (redisErr) {
        console.error('❌ Redis cache invalidation error:', redisErr);
        // Continue even if Redis fails
      }

      // Return updated profile (fresh from database, no cache)
      // Pass requestingAppType to ensure correct data filtering
      const updatedProfile = await this.getProfile(userId, requestingAppType);
      console.log('📤 Returning updated profile with address:', {
        shop_address: updatedProfile.shop?.address,
        delivery_address: updatedProfile.delivery?.address,
        name: updatedProfile.name,
        email: updatedProfile.email,
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
