/**
 * V2 Auth Service
 * Business logic for authentication operations
 */

const User = require('../../models/User');
const jwt = require('jsonwebtoken');
const V2ShopTypeService = require('../shop/v2ShopTypeService');
const RedisCache = require('../../utils/redisCache');

class V2AuthService {
  /**
   * Generate OTP for phone number
   * @param {string} phoneNumber - Phone number
   * @returns {Promise<{otp: string, isNewUser: boolean, userType: string|null, userId: number|null}>}
   */
  static async generateOtp(phoneNumber) {
    // Clean phone number (remove non-digits)
    const cleanedPhone = phoneNumber.replace(/\D/g, '');

    // Validate phone number (should be 10 digits for Indian numbers)
    if (cleanedPhone.length !== 10) {
      throw new Error('Invalid phone number. Please enter a valid 10-digit phone number');
    }

    // Generate OTP (6 digits)
    let otp = Math.floor(100000 + Math.random() * 900000).toString();

    // Special OTP for test numbers
    if (cleanedPhone === '9605056015' || cleanedPhone === '7994095833') {
      otp = '487600';
    }

    // Check for vendor app users first (app_type='vendor_app' or no app_type for vendor app)
    let user = await User.findByMobileAndAppType(cleanedPhone, 'vendor_app');
    let isCustomerAppUser = false;
    
    // If not found, check all users by mobile
    if (!user) {
      const allUsers = await User.findAllByMobile(cleanedPhone);
      
      if (allUsers && allUsers.length > 0) {
        // Find vendor app user (app_type='vendor_app' or no app_type for backward compatibility)
        user = allUsers.find(u => u.app_type === 'vendor_app' || (!u.app_type && u.user_type !== 'C'));
        
        // If no vendor app user found, check for customer app user
        if (!user) {
          const customerAppUser = allUsers.find(u => 
            u.user_type === 'C' && (u.app_type === 'customer_app' || !u.app_type)
          );
          
          if (customerAppUser) {
            // Customer app user exists - treat as new user for vendor app registration
            isCustomerAppUser = true;
            console.log(`📱 Customer app user (ID: ${customerAppUser.id}) found - will create new vendor app user`);
          } else {
            // For backward compatibility: use first user if not type 'C'
            user = allUsers.find(u => u.user_type !== 'C') || allUsers[0];
          }
        }
      }
    }

    // If customer app user exists, treat as new user (will create vendor app user in verifyOtpAndLogin)
    if (isCustomerAppUser) {
      return {
        otp,
        isNewUser: true,
        userType: null,
        userId: null
      };
    }

    if (user) {
      // User exists - check if admin/user type (not allowed for mobile app)
      if (user.user_type === 'A' || user.user_type === 'U') {
        throw new Error('This number is registered as admin. Please use web login.');
      }

      // Map user_type to dashboard type
      // For SC users, return 'b2b' as default (they can switch to b2c)
      const dashboardType = this.mapUserTypeToDashboard(user.user_type);

      return {
        otp,
        isNewUser: false,
        userType: dashboardType,
        userId: user.id
      };
    } else {
      // New user
      return {
        otp,
        isNewUser: true,
        userType: null,
        userId: null
      };
    }
  }

  /**
   * Verify OTP and complete login
   * @param {string} phoneNumber - Phone number
   * @param {string} otp - OTP code
   * @param {string} joinType - Join type for new users ('b2b' | 'b2c' | 'delivery')
   * @returns {Promise<{user: object, token: string, dashboardType: string}>}
   */
  static async verifyOtpAndLogin(phoneNumber, otp, joinType = null) {
    // Clean phone number
    const cleanedPhone = phoneNumber.replace(/\D/g, '');

    if (cleanedPhone.length !== 10) {
      throw new Error('Invalid phone number');
    }

    // Validate OTP format
    if (otp.length !== 6) {
      throw new Error('Invalid OTP format');
    }

    // For test numbers, accept specific OTP
    const isTestNumber = cleanedPhone === '9605056015' || cleanedPhone === '7994095833';
    // In production, verify OTP from your OTP service here
    // For now, we accept any 6-digit OTP for development

    // Check for vendor app users first
    let user = await User.findByMobileAndAppType(cleanedPhone, 'vendor_app');
    
    // If not found, check all users by mobile
    if (!user) {
      const allUsers = await User.findAllByMobile(cleanedPhone);
      
      if (allUsers && allUsers.length > 0) {
        // Find vendor app user (app_type='vendor_app' or no app_type for backward compatibility)
        user = allUsers.find(u => u.app_type === 'vendor_app' || (!u.app_type && u.user_type !== 'C'));
        
        // If no vendor app user found, check for customer app user
        const customerAppUser = allUsers.find(u => 
          u.user_type === 'C' && (u.app_type === 'customer_app' || !u.app_type)
        );
        
        // If customer app user exists, they can register as any type in vendor app
        // This will be handled in the registration logic below
        if (customerAppUser && !user) {
          console.log(`📱 Customer app user (ID: ${customerAppUser.id}) can register in vendor app`);
          user = null; // Will be handled in registration logic below
        } else if (!user) {
          // For backward compatibility: if user has no app_type and is not type 'C', treat as vendor app user
          // Otherwise, use the first user found
          user = allUsers.find(u => u.user_type !== 'C') || allUsers[0];
        }
      }
    }

    if (!user) {
      // New user registration - check if user exists in any app to prevent duplicates
      if (!joinType) {
        throw new Error('Join type is required for new users');
      }

      // Check if user exists with this phone number in any app
      const allUsersCheck = await User.findAllByMobile(cleanedPhone);
      
      if (allUsersCheck && allUsersCheck.length > 0) {
        // User exists - reuse existing user instead of creating duplicate
        // Find the most appropriate user to reuse
        let existingUser = null;
        
        // Priority 1: Find vendor app user with matching type
        const vendorUserWithMatchingType = allUsersCheck.find(u => {
          const targetType = this.mapJoinTypeToUserType(joinType);
          return (u.app_type === 'vendor_app' || (!u.app_type && u.user_type !== 'C')) && 
                 u.user_type === targetType;
        });
        
        if (vendorUserWithMatchingType) {
          existingUser = vendorUserWithMatchingType;
          console.log(`♻️  Reusing existing vendor app user (ID: ${existingUser.id}, Type: ${existingUser.user_type})`);
        } else {
          // Priority 2: Find any vendor app user
          const anyVendorUser = allUsersCheck.find(u => 
            u.app_type === 'vendor_app' || (!u.app_type && u.user_type !== 'C')
          );
          
          if (anyVendorUser) {
            // Check if trying to register incompatible type
            const targetType = this.mapJoinTypeToUserType(joinType);
            
            // V1 users can register as any type - no restrictions
            const isV1User = !anyVendorUser.app_version || anyVendorUser.app_version === 'v1';
            
            if (!isV1User) {
              // V2 users: Validate B2B/B2C and Delivery are mutually exclusive
              if (targetType === 'D' && (anyVendorUser.user_type === 'S' || anyVendorUser.user_type === 'R' || anyVendorUser.user_type === 'SR')) {
                throw new Error('B2B or B2C users cannot register as delivery partners. Please use your existing account.');
              }
              if ((targetType === 'S' || targetType === 'R') && anyVendorUser.user_type === 'D') {
                throw new Error('Delivery partners cannot register as B2B or B2C users. Please use your delivery account.');
              }
            } else {
              console.log(`📱 V1 user (ID: ${anyVendorUser.id}) - allowing registration as any type (no restrictions)`);
            }
            
            // Update existing user to new type if compatible (or if v1 user)
            existingUser = anyVendorUser;
            console.log(`♻️  Reusing existing vendor app user (ID: ${existingUser.id}, Type: ${existingUser.user_type}, Version: ${existingUser.app_version || 'v1'})`);
          } else {
            // Priority 3: Customer app user - can register as any type
            const customerAppUser = allUsersCheck.find(u => 
              u.user_type === 'C' && (u.app_type === 'customer_app' || !u.app_type)
            );
            
            if (customerAppUser) {
              // Customer app user registering in vendor app - update to vendor app type
              const vendorUserType = this.mapJoinTypeToUserType(joinType);
              console.log(`📱 Customer app user (ID: ${customerAppUser.id}) registering in vendor app as ${joinType}`);
              
              // Update customer app user to vendor app user type (v2)
              await User.updateProfile(customerAppUser.id, {
                user_type: vendorUserType,
                app_type: 'vendor_app',
                app_version: 'v2'
              });
              
              // Reload user
              existingUser = await User.findById(customerAppUser.id);
            }
          }
        }
        
        if (existingUser) {
          user = existingUser;
        } else {
          // No suitable existing user found - create new one (v2 user)
          const userType = this.mapJoinTypeToUserType(joinType);
          const tempName = `User_${cleanedPhone}`;
          const tempEmail = ''; // Don't auto-generate email
          user = await User.create(tempName, tempEmail, cleanedPhone, userType, cleanedPhone, 'vendor_app', 'v2');
          
          // Invalidate B2B users cache if B2B user is created
          if (userType === 'S' || userType === 'SR') {
            try {
              await RedisCache.invalidateB2BUsersCache();
              console.log('🗑️  Invalidated B2B users cache after new B2B user creation');
            } catch (err) {
              console.error('Redis cache invalidation error:', err);
            }
          }
        }
      } else {
        // No existing user - create new one (v2 user)
        const userType = this.mapJoinTypeToUserType(joinType);
        const tempName = `User_${cleanedPhone}`;
        const tempEmail = ''; // Don't auto-generate email
        user = await User.create(tempName, tempEmail, cleanedPhone, userType, cleanedPhone, 'vendor_app', 'v2');
        
        // Invalidate B2B users cache if B2B user is created
        if (userType === 'S' || userType === 'SR') {
          try {
            await RedisCache.invalidateB2BUsersCache();
            console.log('🗑️  Invalidated B2B users cache after new B2B user creation');
          } catch (err) {
            console.error('Redis cache invalidation error:', err);
          }
        }
      }
    } else {
      // Existing user - validate cross-login restrictions
      const userDashboardType = this.mapUserTypeToDashboard(user.user_type);
      
      // Check if user is v1 (no restrictions) or v2 (with restrictions)
      const isV1User = !user.app_version || user.app_version === 'v1';
      
      if (isV1User) {
        // V1 users can register/login as any type - no restrictions
        console.log(`📱 V1 user (ID: ${user.id}) - allowing login/registration as any type (no restrictions)`);
      } else {
        // V2 users: Strict validation - Prevent cross-login between incompatible types
        // Delivery users (D) cannot login as B2B or B2C
        if (user.user_type === 'D') {
          if (joinType && (joinType === 'b2b' || joinType === 'b2c')) {
            throw new Error('Delivery partners cannot login or register as B2B or B2C users. Please use your delivery account.');
          }
          // Force delivery login for delivery users
          // If joinType is delivery or not provided, allow it
        }
      }
      
      // Customer app users (type 'C') can register as ANY type in vendor app (B2B, B2C, or Delivery)
      // Check if user is from customer app (type 'C' with customer_app app_type or no app_type)
      if (user.user_type === 'C' && (user.app_type === 'customer_app' || !user.app_type)) {
        // Customer app user registering in vendor app - allow any joinType (B2B, B2C, or Delivery)
        if (joinType) {
          const vendorUserType = this.mapJoinTypeToUserType(joinType);
          console.log(`📱 Customer app user (ID: ${user.id}) registering in vendor app as ${joinType} (${vendorUserType})`);
          // Create new vendor app user with the selected type (v2)
          const tempName = `User_${cleanedPhone}`;
          const tempEmail = ''; // Don't auto-generate email
          user = await User.create(tempName, tempEmail, cleanedPhone, vendorUserType, cleanedPhone, 'vendor_app', 'v2');
          
          // Invalidate B2B users cache if B2B user is created
          if (vendorUserType === 'S' || vendorUserType === 'SR') {
            try {
              await RedisCache.invalidateB2BUsersCache();
              console.log('🗑️  Invalidated B2B users cache after customer app user registered as B2B');
            } catch (err) {
              console.error('Redis cache invalidation error:', err);
            }
          }
        } else {
          throw new Error('Join type is required for customer app users registering in vendor app');
        }
      }
      // V2 users: B2B/B2C users cannot login or register as delivery
      else if (!isV1User && (user.user_type === 'S' || user.user_type === 'R' || user.user_type === 'SR')) {
        if (joinType === 'delivery') {
          throw new Error('B2B or B2C users cannot login or register as delivery partners. Please use your registered account type.');
        }
      }
      // V2 users: Delivery users cannot login or register as B2B or B2C
      else if (!isV1User && user.user_type === 'D') {
        if (joinType && (joinType === 'b2b' || joinType === 'b2c')) {
          throw new Error('Delivery partners cannot login or register as B2B or B2C users. Please use your delivery account.');
        }
      }
      
      // Handle B2B <-> B2C registration/upgrade for vendor app users
      if (joinType && joinType !== userDashboardType && user.user_type !== 'C') {
        // If user is B2B (S) and registering as B2C, upgrade to SR
        if (user.user_type === 'S' && joinType === 'b2c') {
          console.log(`🔄 Upgrading B2B user (ID: ${user.id}) to SR (B2B + B2C)`);
          await User.updateProfile(user.id, { user_type: 'SR' });
          user.user_type = 'SR';
          
          // Invalidate B2B users cache when user is upgraded to SR
          try {
            await RedisCache.invalidateB2BUsersCache();
            console.log('🗑️  Invalidated B2B users cache after user upgrade to SR');
          } catch (err) {
            console.error('Redis cache invalidation error:', err);
          }
        }
        // If user is B2C (R) and registering as B2B, upgrade to SR
        else if (user.user_type === 'R' && joinType === 'b2b') {
          console.log(`🔄 Upgrading B2C user (ID: ${user.id}) to SR (B2B + B2C)`);
          await User.updateProfile(user.id, { user_type: 'SR' });
          user.user_type = 'SR';
          
          // Invalidate B2B users cache when user is upgraded to SR
          try {
            await RedisCache.invalidateB2BUsersCache();
            console.log('🗑️  Invalidated B2B users cache after user upgrade to SR');
          } catch (err) {
            console.error('Redis cache invalidation error:', err);
          }
        }
        // If user is already SR, allow switching between dashboards
        else if (user.user_type === 'SR' && (joinType === 'b2b' || joinType === 'b2c')) {
          // User is already SR, can access both - dashboard service will handle switching
          console.log(`✅ SR user (ID: ${user.id}) accessing ${joinType} dashboard`);
        }
        // Invalid cross-login attempt
        else {
          const userTypeName = user.user_type === 'S' ? 'B2B' : 
                              user.user_type === 'R' ? 'B2C' : 
                              user.user_type === 'SR' ? 'B2B+B2C' : 'Delivery';
          throw new Error(`This number is registered as ${userTypeName} user. Invalid login type.`);
        }
      }
    }

    // Check if admin/user type (not allowed)
    if (user.user_type === 'A' || user.user_type === 'U') {
      throw new Error('This number is registered as admin. Please use web login.');
    }

    // Map user_type to dashboard type (use joinType as preferred dashboard for SC users)
    const dashboardType = this.mapUserTypeToDashboard(user.user_type, joinType);

    // Generate JWT token
    const jwtSecret = process.env.JWT_SECRET || 'your-secret-key';
    const expiresIn = process.env.JWT_EXPIRES_IN || '30d';

    const token = jwt.sign(
      {
        id: user.id,
        mob_num: user.mob_num,
        user_type: user.user_type
      },
      jwtSecret,
      { expiresIn }
    );

    // Get user's allowed dashboards for permission checking
    let allowedDashboards = [];
    try {
      const dashboardInfo = await V2ShopTypeService.getUserDashboards(user.id);
      allowedDashboards = dashboardInfo.allowedDashboards || [];
    } catch (error) {
      console.error('Error getting user dashboards:', error);
      // Fallback: use dashboardType to determine allowed dashboards
      allowedDashboards = [dashboardType];
    }

    // Check B2B signup status for B2B users (S or SR)
    let b2bStatus = null;
    console.log(`🔍 Checking B2B status for user ${user.id}, user_type: ${user.user_type}`);
    
    if (user.user_type === 'S' || user.user_type === 'SR') {
      try {
        console.log(`📋 User is B2B (${user.user_type}), checking shop record...`);
        const Shop = require('../../models/Shop');
        const shop = await Shop.findByUserId(user.id);
        
        console.log(`📋 Shop lookup result:`, shop ? `Found shop ID ${shop.id}` : 'No shop found');
        
        if (!shop || !shop.id) {
          // No shop record - new user
          b2bStatus = 'new_user';
          console.log(`✅ B2B status set to: new_user (no shop record)`);
        } else {
          // Check if all required B2B signup fields are filled
          const hasCompanyName = shop.company_name && shop.company_name.trim() !== '';
          const hasGstNumber = shop.gst_number && shop.gst_number.trim() !== '';
          const hasAllDocuments = shop.business_license_url && shop.business_license_url.trim() !== '' &&
                                  shop.gst_certificate_url && shop.gst_certificate_url.trim() !== '' &&
                                  shop.address_proof_url && shop.address_proof_url.trim() !== '' &&
                                  shop.kyc_owner_url && shop.kyc_owner_url.trim() !== '';
          
          console.log(`📋 Shop fields check:`, {
            hasCompanyName,
            hasGstNumber,
            hasAllDocuments,
            approval_status: shop.approval_status
          });
          
          if (!hasCompanyName || !hasGstNumber || !hasAllDocuments) {
            // Signup incomplete - new user
            b2bStatus = 'new_user';
            console.log(`✅ B2B status set to: new_user (incomplete signup)`);
          } else {
            // All documents uploaded - check approval status
            if (shop.approval_status === 'approved') {
              b2bStatus = 'approved';
            } else if (shop.approval_status === 'rejected') {
              b2bStatus = 'rejected';
            } else {
              // pending or null
              b2bStatus = 'pending';
            }
            console.log(`✅ B2B status set to: ${b2bStatus} (approval_status: ${shop.approval_status})`);
          }
        }
      } catch (error) {
        console.error('❌ Error checking B2B signup status:', error);
        console.error('Error stack:', error.stack);
        // Default to new_user if error
        b2bStatus = 'new_user';
        console.log(`✅ B2B status set to: new_user (error fallback)`);
      }
    } else {
      console.log(`📋 User is not B2B (${user.user_type}), b2bStatus will be null`);
    }
    
    console.log(`📋 Final b2bStatus for user ${user.id}: ${b2bStatus}`);

    // Return user data without password
    const { password: _, ...userWithoutPassword } = user;

    const responseData = {
      user: userWithoutPassword,
      token,
      dashboardType,
      allowedDashboards,
      b2bStatus // 'new_user', 'pending', 'approved', or null (for non-B2B users)
    };
    
    console.log(`📋 Returning response data with b2bStatus: ${responseData.b2bStatus}`);
    console.log(`📋 Response data keys:`, Object.keys(responseData));
    
    return responseData;
  }

  /**
   * Map user_type to dashboard type
   * @param {string} userType - User type ('S', 'R', 'C', 'D', 'SR', etc.)
   * @param {string} preferredDashboard - Preferred dashboard if user has multiple access ('b2b' | 'b2c')
   * @returns {string} Dashboard type ('b2b', 'b2c', 'delivery')
   */
  static mapUserTypeToDashboard(userType, preferredDashboard = null) {
    switch (userType) {
      case 'S': // Shop owner (B2B)
        return 'b2b';
      case 'D': // Delivery boy
        return 'delivery';
      case 'SR': // Shop owner + Retailer (B2B + B2C in vendor app)
        // If preferred dashboard is provided, use it; otherwise default to B2B
        return preferredDashboard && (preferredDashboard === 'b2b' || preferredDashboard === 'b2c') 
          ? preferredDashboard 
          : 'b2b';
      case 'R': // Retailer (B2C in vendor app)
        return 'b2c';
      case 'C': // Customer (customer app - Flutter)
        // Customer app users can register in vendor app as any type
        // This is handled in verifyOtpAndLogin
        return 'b2c'; // Default, but will be overridden based on joinType
      default:
        return 'b2c';
    }
  }

  /**
   * Map joinType to user_type
   * @param {string} joinType - Join type ('b2b', 'b2c', 'delivery')
   * @returns {string} User type ('S', 'R', 'D')
   * Note: 'C' is reserved for customer app (Flutter), 'R' is for B2C in vendor app
   */
  static mapJoinTypeToUserType(joinType) {
    switch (joinType) {
      case 'b2b':
        return 'S'; // Shop owner (B2B)
      case 'delivery':
        return 'D'; // Delivery boy
      case 'b2c':
      default:
        return 'R'; // Retailer (B2C in vendor app) - separate from 'C' (customer app)
    }
  }
}

module.exports = V2AuthService;

