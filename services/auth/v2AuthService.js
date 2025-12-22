/**
 * V2 Auth Service
 * Business logic for authentication operations
 */

const User = require('../../models/User');
const Customer = require('../../models/Customer');
const jwt = require('jsonwebtoken');
const V2ShopTypeService = require('../shop/v2ShopTypeService');
const RedisCache = require('../../utils/redisCache');
const { UpdateCommand } = require('@aws-sdk/lib-dynamodb');
const { getDynamoDBClient } = require('../../config/dynamodb');

class V2AuthService {
  /**
   * Find or update existing 'N' user instead of creating duplicate
   * @param {string} phoneNumber - Phone number
   * @param {string} appType - App type ('vendor_app' | 'customer_app')
   * @returns {Promise<Object|null>} Existing 'N' user or null
   */
  static async findOrUpdateNUser(phoneNumber, appType = 'vendor_app') {
    try {
      const allUsers = await User.findAllByMobile(phoneNumber);
      if (allUsers && allUsers.length > 0) {
        // Find existing 'N' user with matching app_type
        const nUser = allUsers.find(u => 
          u.user_type === 'N' && 
          (u.app_type === appType || (!u.app_type && appType === 'vendor_app')) &&
          (u.del_status !== 2 || !u.del_status)
        );
        
        if (nUser) {
          console.log(`♻️  Found existing 'N' user (ID: ${nUser.id}) - will reuse instead of creating duplicate`);
          // Update the user's updated_at timestamp
          const client = getDynamoDBClient();
          await client.send(new UpdateCommand({
            TableName: 'users',
            Key: { id: nUser.id },
            UpdateExpression: 'SET updated_at = :updated',
            ExpressionAttributeValues: {
              ':updated': new Date().toISOString()
            }
          }));
          return nUser;
        }
      }
      return null;
    } catch (error) {
      console.error('Error in findOrUpdateNUser:', error);
      return null;
    }
  }

  /**
   * Find or reuse existing vendor_app user to prevent duplicates
   * This prevents multiple vendor_app accounts for the same phone number
   * @param {string} phoneNumber - Phone number
   * @returns {Promise<Object|null>} Existing vendor_app user or null
   */
  static async findOrReuseVendorAppUser(phoneNumber) {
    try {
      const allUsers = await User.findAllByMobile(phoneNumber);
      if (allUsers && allUsers.length > 0) {
        // Find ANY existing vendor_app user (regardless of user_type)
        // Priority: completed types (S, R, SR, D) > 'N' type
        const activeUsers = allUsers.filter(u => (u.del_status !== 2 || !u.del_status));
        
        // First, try to find completed vendor_app users (S, R, SR, D)
        const completedVendorUsers = activeUsers.filter(u => 
          (u.app_type === 'vendor_app' || (!u.app_type && u.user_type !== 'C')) &&
          u.user_type && u.user_type !== 'N'
        );
        
        if (completedVendorUsers.length > 0) {
          // Use the most recently updated completed user
          completedVendorUsers.sort((a, b) => {
            const dateA = new Date(a.updated_at || a.created_at || 0);
            const dateB = new Date(b.updated_at || b.created_at || 0);
            return dateB - dateA;
          });
          const user = completedVendorUsers[0];
          console.log(`♻️  Found existing completed vendor_app user (ID: ${user.id}, type: ${user.user_type}) - reusing to prevent duplicate`);
          return user;
        }
        
        // If no completed users, find 'N' type vendor_app user
        const nVendorUser = activeUsers.find(u => 
          u.user_type === 'N' && 
          (u.app_type === 'vendor_app' || (!u.app_type && u.user_type !== 'C'))
        );
        
        if (nVendorUser) {
          console.log(`♻️  Found existing 'N' vendor_app user (ID: ${nVendorUser.id}) - reusing to prevent duplicate`);
          // Update the user's updated_at timestamp
          const client = getDynamoDBClient();
          await client.send(new UpdateCommand({
            TableName: 'users',
            Key: { id: nVendorUser.id },
            UpdateExpression: 'SET updated_at = :updated',
            ExpressionAttributeValues: {
              ':updated': new Date().toISOString()
            }
          }));
          return nVendorUser;
        }
        
        // Check for any other vendor_app user (backward compatibility)
        const anyVendorUser = activeUsers.find(u => 
          (u.app_type === 'vendor_app' || (!u.app_type && u.user_type !== 'C'))
        );
        
        if (anyVendorUser) {
          console.log(`♻️  Found existing vendor_app user (ID: ${anyVendorUser.id}, type: ${anyVendorUser.user_type}) - reusing to prevent duplicate`);
          return anyVendorUser;
        }
      }
      return null;
    } catch (error) {
      console.error('Error in findOrReuseVendorAppUser:', error);
      return null;
    }
  }

  /**
   * Find or reuse existing customer_app user to prevent duplicates
   * @param {string} phoneNumber - Phone number
   * @returns {Promise<Object|null>} Existing customer_app user or null
   */
  static async findOrReuseCustomerAppUser(phoneNumber) {
    try {
      const allUsers = await User.findAllByMobile(phoneNumber);
      if (allUsers && allUsers.length > 0) {
        // Find ANY existing customer_app user (regardless of user_type)
        // Priority: user_type='C' > user_type='N' > any other
        const customerAppUserC = allUsers.find(u => 
          u.app_type === 'customer_app' && 
          u.user_type === 'C' && 
          (u.del_status !== 2 || !u.del_status)
        );
        
        if (customerAppUserC) {
          console.log(`♻️  Found existing customer_app user with user_type='C' (ID: ${customerAppUserC.id}) - reusing to prevent duplicate`);
          return customerAppUserC;
        }
        
        const customerAppUserN = allUsers.find(u => 
          u.app_type === 'customer_app' && 
          u.user_type === 'N' && 
          (u.del_status !== 2 || !u.del_status)
        );
        
        if (customerAppUserN) {
          console.log(`♻️  Found existing customer_app user with user_type='N' (ID: ${customerAppUserN.id}) - will update to 'C' and reuse`);
          // Update to 'C' type
          const client = getDynamoDBClient();
          await client.send(new UpdateCommand({
            TableName: 'users',
            Key: { id: customerAppUserN.id },
            UpdateExpression: 'SET user_type = :userType, updated_at = :updated',
            ExpressionAttributeValues: {
              ':userType': 'C',
              ':updated': new Date().toISOString()
            }
          }));
          return { ...customerAppUserN, user_type: 'C' };
        }
        
        // Check for any other customer_app user (shouldn't happen, but just in case)
        const anyCustomerAppUser = allUsers.find(u => 
          u.app_type === 'customer_app' && 
          (u.del_status !== 2 || !u.del_status)
        );
        
        if (anyCustomerAppUser) {
          console.log(`♻️  Found existing customer_app user (ID: ${anyCustomerAppUser.id}, user_type: ${anyCustomerAppUser.user_type}) - reusing to prevent duplicate`);
          return anyCustomerAppUser;
        }
      }
      return null;
    } catch (error) {
      console.error('Error in findOrReuseCustomerAppUser:', error);
      return null;
    }
  }
  /**
   * Generate OTP for phone number
   * @param {string} phoneNumber - Phone number
   * @param {string} appType - App type ('customer_app' | 'vendor_app')
   * @returns {Promise<{otp: string, isNewUser: boolean, userType: string|null, userId: number|null}>}
   */
  static async generateOtp(phoneNumber, appType = null) {
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

    // Determine target app type: if appType is provided, use it; otherwise default to vendor_app
    const targetAppType = appType || 'vendor_app';
    console.log(`📱 generateOtp: targetAppType=${targetAppType}`);

    let user = null;
    
    try {
      if (targetAppType === 'customer_app') {
        // For customer app, look for customer app users first
        try {
          user = await User.findByMobileAndAppType(cleanedPhone, 'customer_app');
        } catch (err) {
          console.error('Error finding customer app user by app type:', err);
          // Continue to check all users
        }
        
        // If not found, check all users by mobile
        if (!user) {
          try {
            const allUsers = await User.findAllByMobile(cleanedPhone);
            
            if (allUsers && allUsers.length > 0) {
              // Find customer app user (user_type='C' with customer_app app_type, not deleted)
              user = allUsers.find(u => 
                u.user_type === 'C' && 
                (u.app_type === 'customer_app' || (!u.app_type && u.user_type === 'C')) &&
                (u.del_status !== 2 || !u.del_status)
              );
            }
          } catch (err) {
            console.error('Error finding all users by mobile:', err);
            // Continue - will treat as new user
          }
        }
      } else {
        // For vendor app, check for vendor app users first
        try {
          user = await User.findByMobileAndAppType(cleanedPhone, 'vendor_app');
        } catch (err) {
          console.error('Error finding vendor app user by app type:', err);
          // Continue to check all users
        }
        
        // If not found, check all users by mobile
        if (!user) {
          try {
            const allUsers = await User.findAllByMobile(cleanedPhone);
            
            if (allUsers && allUsers.length > 0) {
              // IMPORTANT: Prioritize users with completed user types (not 'N')
              // Filter out deleted users first
              const activeUsers = allUsers.filter(u => (u.del_status !== 2 || !u.del_status));
              
              // Find vendor app users with completed types first (not 'N')
              const completedVendorUsers = activeUsers.filter(u => 
                (u.app_type === 'vendor_app' || (!u.app_type && u.user_type !== 'C')) &&
                u.user_type && u.user_type !== 'N'
              );
              
              if (completedVendorUsers.length > 0) {
                // Use the most recently updated completed user
                completedVendorUsers.sort((a, b) => {
                  const dateA = new Date(a.updated_at || a.created_at || 0);
                  const dateB = new Date(b.updated_at || b.created_at || 0);
                  return dateB - dateA;
                });
                user = completedVendorUsers[0];
                console.log(`✅ generateOtp: Found completed vendor app user (ID: ${user.id}, type: ${user.user_type})`);
              } else {
                // If no completed users, find any vendor app user (including 'N')
                user = activeUsers.find(u => 
                  (u.app_type === 'vendor_app' || (!u.app_type && u.user_type !== 'C'))
              );
              }
            }
          } catch (err) {
            console.error('Error finding all users by mobile:', err);
            // Continue - will treat as new user
          }
        } else {
          // If user was found by app_type, check if there's a better (completed) user
          try {
            const allUsers = await User.findAllByMobile(cleanedPhone);
            if (allUsers && allUsers.length > 0) {
              const activeUsers = allUsers.filter(u => (u.del_status !== 2 || !u.del_status));
              const completedVendorUsers = activeUsers.filter(u => 
                (u.app_type === 'vendor_app' || (!u.app_type && u.user_type !== 'C')) &&
                u.user_type && u.user_type !== 'N' &&
                u.id !== user.id // Exclude the already found user
              );
              
              if (completedVendorUsers.length > 0) {
                // Use the most recently updated completed user
                completedVendorUsers.sort((a, b) => {
                  const dateA = new Date(a.updated_at || a.created_at || 0);
                  const dateB = new Date(b.updated_at || b.created_at || 0);
                  return dateB - dateA;
                });
                const betterUser = completedVendorUsers[0];
                console.log(`✅ generateOtp: Found better completed vendor app user (ID: ${betterUser.id}, type: ${betterUser.user_type}) - switching from ID: ${user.id}`);
                user = betterUser;
              }
            }
          } catch (err) {
            console.error('Error checking for better user in generateOtp:', err);
            // Continue with existing user
          }
        }
      }
    } catch (err) {
      console.error('Unexpected error in generateOtp user lookup:', err);
      console.error('Error stack:', err.stack);
      // Continue - will treat as new user
    }

    if (user) {
      // User exists - check if admin/user type (not allowed for mobile app)
      if (user.user_type === 'A' || user.user_type === 'U') {
        throw new Error('This number is registered as admin. Please use web login.');
      }

      // Map user_type to dashboard type (returns null for customer app users)
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
   * @param {string} appType - App type ('customer_app' | 'vendor_app')
   * @param {string} fcmToken - FCM token for push notifications (optional)
   * @returns {Promise<{user: object, token: string, dashboardType: string}>}
   */
  static async verifyOtpAndLogin(phoneNumber, otp, joinType = null, appType = null, fcmToken = null) {
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

    // Determine target app type: if appType is provided, use it; otherwise default to vendor_app
    const targetAppType = appType || 'vendor_app';
    console.log(`📱 verifyOtpAndLogin: targetAppType=${targetAppType}, joinType=${joinType}`);

    // Check for users based on target app type
    let user = null;
    
    if (targetAppType === 'customer_app') {
      // For customer app, look for customer app users first
      user = await User.findByMobileAndAppType(cleanedPhone, 'customer_app');
      
      // If found, prioritize user_type='C' over user_type='N'
      if (user) {
        const allUsers = await User.findAllByMobile(cleanedPhone);
        if (allUsers && allUsers.length > 0) {
          // Prefer customer_app user with user_type='C' (completed customer)
          const customerAppUserC = allUsers.find(u => 
            u.app_type === 'customer_app' && 
            u.user_type === 'C' && 
            (u.del_status !== 2 || !u.del_status)
          );
          if (customerAppUserC) {
            console.log(`✅ Found customer_app user with user_type='C' (ID: ${customerAppUserC.id}) - using instead of user_type='N' user`);
            user = customerAppUserC;
          }
        }
      }
      
      // If not found, check all users by mobile
      if (!user) {
        const allUsers = await User.findAllByMobile(cleanedPhone);
        
        if (allUsers && allUsers.length > 0) {
          // Find customer app user (user_type='C' with customer_app app_type, not deleted)
          user = allUsers.find(u => 
            u.user_type === 'C' && 
            (u.app_type === 'customer_app' || (!u.app_type && u.user_type === 'C')) &&
            (u.del_status !== 2 || !u.del_status)
          );
          
          // If no customer app user found, check if there's a vendor app user
          // Customer app should create SEPARATE account - different user ID
          if (!user) {
            const vendorAppUser = allUsers.find(u => 
              (u.app_type === 'vendor_app' || (!u.app_type && u.user_type !== 'C')) &&
              (u.del_status !== 2 || !u.del_status)
            );
            
            if (vendorAppUser) {
              console.log(`⚠️  Found vendor app user (ID: ${vendorAppUser.id}) but request is from customer app - will create separate customer app user`);
              user = null; // Will create new customer app user below with different user ID
            }
          }
        }
      }
    } else {
      // For vendor app, check for vendor app users first
      user = await User.findByMobileAndAppType(cleanedPhone, 'vendor_app');
      
      // If not found, check all users by mobile
      if (!user) {
        const allUsers = await User.findAllByMobile(cleanedPhone);
        
        if (allUsers && allUsers.length > 0) {
          // IMPORTANT: Prioritize users with completed user types (not 'N')
          // Filter out deleted users first
          const activeUsers = allUsers.filter(u => (u.del_status !== 2 || !u.del_status));
          
          // Find vendor app users with completed types first (not 'N')
          const completedVendorUsers = activeUsers.filter(u => 
            (u.app_type === 'vendor_app' || (!u.app_type && u.user_type !== 'C')) &&
            u.user_type && u.user_type !== 'N'
          );
          
          if (completedVendorUsers.length > 0) {
            // Use the most recently updated completed user
            completedVendorUsers.sort((a, b) => {
              const dateA = new Date(a.updated_at || a.created_at || 0);
              const dateB = new Date(b.updated_at || b.created_at || 0);
              return dateB - dateA;
            });
            user = completedVendorUsers[0];
            console.log(`✅ Found completed vendor app user (ID: ${user.id}, type: ${user.user_type}) - using for login`);
          } else {
            // If no completed users, find any vendor app user (including 'N')
            user = activeUsers.find(u => u.app_type === 'vendor_app' || (!u.app_type && u.user_type !== 'C'));
          
          // If no vendor app user found, check for customer app user
            const customerAppUser = activeUsers.find(u => 
            u.user_type === 'C' && (u.app_type === 'customer_app' || !u.app_type)
          );
          
          // If customer app user exists, they can register as any type in vendor app
          // This will create a SEPARATE vendor app account with different user ID
          // This will be handled in the registration logic below
          if (customerAppUser && !user) {
            console.log(`📱 Customer app user (ID: ${customerAppUser.id}) can register in vendor app - will create separate vendor app account`);
            user = null; // Will be handled in registration logic below - creates separate account
          } else if (!user) {
            // For backward compatibility: if user has no app_type and is not type 'C', treat as vendor app user
            // Otherwise, use the first user found
              user = activeUsers.find(u => u.user_type !== 'C') || activeUsers[0];
            }
          }
        }
      } else {
        // If user was found by app_type, check if there's a better (completed) user
        const allUsers = await User.findAllByMobile(cleanedPhone);
        if (allUsers && allUsers.length > 0) {
          const activeUsers = allUsers.filter(u => (u.del_status !== 2 || !u.del_status));
          const completedVendorUsers = activeUsers.filter(u => 
            (u.app_type === 'vendor_app' || (!u.app_type && u.user_type !== 'C')) &&
            u.user_type && u.user_type !== 'N' &&
            u.id !== user.id // Exclude the already found user
          );
          
          if (completedVendorUsers.length > 0) {
            // Use the most recently updated completed user
            completedVendorUsers.sort((a, b) => {
              const dateA = new Date(a.updated_at || a.created_at || 0);
              const dateB = new Date(b.updated_at || b.created_at || 0);
              return dateB - dateA;
            });
            const betterUser = completedVendorUsers[0];
            console.log(`✅ Found better completed vendor app user (ID: ${betterUser.id}, type: ${betterUser.user_type}) - switching from ID: ${user.id}`);
            user = betterUser;
          }
        }
      }
    }

    // IMPORTANT: If user is found but has del_status === 2 (deleted), reset them for re-registration
    if (user && user.del_status === 2) {
      console.log(`♻️  Found deleted user (ID: ${user.id}) - resetting for re-registration`);
      
      // Determine reset user type and app type based on target app
      let resetUserType, resetAppType;
      if (targetAppType === 'customer_app') {
        resetUserType = 'C';
        resetAppType = 'customer_app';
      } else {
        resetUserType = 'N'; // All re-registering vendor app users start as 'N' regardless of join type
        resetAppType = 'vendor_app';
      }
      
      // Use UpdateCommand to remove del_status attribute and update user
      const { UpdateCommand } = require('@aws-sdk/lib-dynamodb');
      const { getDynamoDBClient } = require('../../config/dynamodb');
      const client = getDynamoDBClient();
      
      const updateParams = {
        TableName: 'users',
        Key: { id: user.id },
        UpdateExpression: 'SET user_type = :userType, app_type = :appType, app_version = :appVersion, updated_at = :updated REMOVE del_status',
        ExpressionAttributeValues: {
          ':userType': resetUserType,
          ':appType': resetAppType,
          ':appVersion': 'v2',
          ':updated': new Date().toISOString()
        }
      };
      
      await client.send(new UpdateCommand(updateParams));
      console.log(`✅ Reset deleted user (ID: ${user.id}) to type '${resetUserType}' for ${resetAppType} re-registration`);
      
      // Update the user object to reflect the changes
      user = { ...user, del_status: undefined, user_type: resetUserType, app_type: resetAppType, app_version: 'v2' };
    }
    
    // IMPORTANT: customer_app and vendor_app are SEPARATE accounts with different user IDs
    // Even with the same phone number, they should have different user accounts
    // Only prevent duplicates WITHIN the same app type
    if (user && targetAppType === 'customer_app' && user.app_type !== 'customer_app' && user.app_type !== null) {
      // User exists but is from vendor app - create separate customer app user
      console.log(`⚠️  Found vendor app user (ID: ${user.id}, app_type: ${user.app_type}) but request is from customer app - creating separate customer app user`);
      
      // Check if customer app user already exists - use helper to prevent duplicates
      const existingCustomerAppUser = await this.findOrReuseCustomerAppUser(cleanedPhone);
      
      if (existingCustomerAppUser) {
        user = existingCustomerAppUser;
        console.log(`✅ Using existing customer app user (ID: ${user.id}) to prevent duplicate`);
      } else {
        // No existing customer_app user found - create new one with different user ID
        const tempName = `User_${cleanedPhone}`;
        const tempEmail = '';
        user = await User.create(tempName, tempEmail, cleanedPhone, 'C', cleanedPhone, 'customer_app', 'v2');
        console.log(`📝 Created new customer app user (ID: ${user.id}) - separate from vendor app user`);
      }
    } else if (user && targetAppType === 'vendor_app' && user.app_type === 'customer_app' && !joinType) {
      // User exists but is from customer app and no joinType provided - this shouldn't happen for vendor app
      // But if it does, we'll handle it in the registration logic below
      console.log(`⚠️  Found customer app user (ID: ${user.id}) but request is from vendor app without joinType`);
    }

    if (!user) {
      // New user registration
      // For customer app, no joinType is needed - create user with user_type 'C'
      if (targetAppType === 'customer_app') {
        // Check if user exists with this phone number in any app
        const allUsersCheck = await User.findAllByMobile(cleanedPhone);
        
        if (allUsersCheck && allUsersCheck.length > 0) {
          // Check for deleted users first - allow them to re-register
          const deletedUser = allUsersCheck.find(u => u.del_status === 2);
          if (deletedUser) {
            console.log(`♻️  Found deleted user (ID: ${deletedUser.id}) - resetting for customer app re-registration`);
            // Reset deleted user - clear del_status and set user_type to 'C' for customer app
            const { UpdateCommand } = require('@aws-sdk/lib-dynamodb');
            const { getDynamoDBClient } = require('../../config/dynamodb');
            const client = getDynamoDBClient();
            
            const updateParams = {
              TableName: 'users',
              Key: { id: deletedUser.id },
              UpdateExpression: 'SET user_type = :userType, app_type = :appType, app_version = :appVersion, updated_at = :updated REMOVE del_status',
              ExpressionAttributeValues: {
                ':userType': 'C',
                ':appType': 'customer_app',
                ':appVersion': 'v2',
                ':updated': new Date().toISOString()
              }
            };
            
            await client.send(new UpdateCommand(updateParams));
            console.log(`✅ Reset deleted user (ID: ${deletedUser.id}) to customer app user`);
            
            user = { ...deletedUser, del_status: undefined, user_type: 'C', app_type: 'customer_app', app_version: 'v2' };
          } else {
            // User exists but is not deleted - check if it's a vendor app user
            const vendorAppUser = allUsersCheck.find(u => 
              u.app_type === 'vendor_app' || (!u.app_type && u.user_type !== 'C')
            );
            
            if (vendorAppUser) {
              // Vendor app user exists - create SEPARATE customer app user with different user ID
              console.log(`📱 Vendor app user exists (ID: ${vendorAppUser.id}) - creating separate customer app user`);
              const existingCustomerAppUser = await this.findOrReuseCustomerAppUser(cleanedPhone);
              
              if (existingCustomerAppUser) {
                user = existingCustomerAppUser;
                console.log(`✅ Using existing customer app user (ID: ${user.id}) to prevent duplicate`);
              } else {
                // Create separate customer app user with different user ID
                const tempName = `User_${cleanedPhone}`;
                const tempEmail = '';
                user = await User.create(tempName, tempEmail, cleanedPhone, 'C', cleanedPhone, 'customer_app', 'v2');
                console.log(`📝 Created new customer app user (ID: ${user.id}) - separate from vendor app user (ID: ${vendorAppUser.id})`);
              }
            } else {
              // No vendor app user - check for existing customer app user first
              const existingCustomerAppUser = await this.findOrReuseCustomerAppUser(cleanedPhone);
              
              if (existingCustomerAppUser) {
                user = existingCustomerAppUser;
                console.log(`✅ Using existing customer app user (ID: ${user.id}) to prevent duplicate`);
              } else {
                // Create customer app user
                const tempName = `User_${cleanedPhone}`;
                const tempEmail = '';
                user = await User.create(tempName, tempEmail, cleanedPhone, 'C', cleanedPhone, 'customer_app', 'v2');
                console.log(`📝 Created new customer app user (ID: ${user.id})`);
              }
            }
          }
        } else {
          // No existing user - check for existing customer app user first (shouldn't happen, but safety check)
          const existingCustomerAppUser = await this.findOrReuseCustomerAppUser(cleanedPhone);
          
          if (existingCustomerAppUser) {
            user = existingCustomerAppUser;
            console.log(`✅ Found existing customer app user (ID: ${user.id}) - reusing to prevent duplicate`);
          } else {
            // Create new customer app user
            const tempName = `User_${cleanedPhone}`;
            const tempEmail = '';
            user = await User.create(tempName, tempEmail, cleanedPhone, 'C', cleanedPhone, 'customer_app', 'v2');
            console.log(`📝 Created new customer app user (ID: ${user.id})`);
          }
        }
      } else if (!joinType) {
        // For vendor app, joinType is required
        throw new Error('Join type is required for new users');
      } else {
        // Check if user exists with this phone number in any app
      const allUsersCheck = await User.findAllByMobile(cleanedPhone);
      
      if (allUsersCheck && allUsersCheck.length > 0) {
        // User exists - reuse existing user instead of creating duplicate
        // Find the most appropriate user to reuse
        let existingUser = null;
        
        // Check for deleted users first - allow them to re-register as any type
        const deletedUser = allUsersCheck.find(u => u.del_status === 2);
        if (deletedUser) {
          console.log(`♻️  Found deleted user (ID: ${deletedUser.id}) - allowing re-registration as ${joinType}`);
          // Reset deleted user - clear del_status and set user_type to 'N' (new user)
          // All users (including delivery) should start as 'N' until signup is complete
          const resetUserType = 'N'; // All re-registering users start as 'N' regardless of join type
          
          // Use UpdateCommand to remove del_status attribute and update user
          const { UpdateCommand } = require('@aws-sdk/lib-dynamodb');
          const { getDynamoDBClient } = require('../../config/dynamodb');
          const client = getDynamoDBClient();
          
          const updateParams = {
            TableName: 'users',
            Key: { id: deletedUser.id },
            UpdateExpression: 'SET user_type = :userType, app_type = :appType, app_version = :appVersion, updated_at = :updated REMOVE del_status',
            ExpressionAttributeValues: {
              ':userType': resetUserType,
              ':appType': 'vendor_app',
              ':appVersion': 'v2',
              ':updated': new Date().toISOString()
            }
          };
          
          await client.send(new UpdateCommand(updateParams));
          console.log(`✅ Reset deleted user (ID: ${deletedUser.id}) to type '${resetUserType}' for re-registration`);
          
          existingUser = { ...deletedUser, del_status: undefined, user_type: resetUserType, app_type: 'vendor_app', app_version: 'v2' };
        }
        
        // Priority 1: Find vendor app user with matching type (if not using deleted user)
        if (!existingUser) {
          const vendorUserWithMatchingType = allUsersCheck.find(u => {
            const targetType = this.mapJoinTypeToUserType(joinType);
            return (u.app_type === 'vendor_app' || (!u.app_type && u.user_type !== 'C')) && 
                   u.user_type === targetType &&
                   (u.del_status !== 2); // Exclude deleted users
          });
          
          if (vendorUserWithMatchingType) {
            existingUser = vendorUserWithMatchingType;
            console.log(`♻️  Reusing existing vendor app user (ID: ${existingUser.id}, Type: ${existingUser.user_type})`);
          } else {
            // Priority 2: Find any vendor app user (excluding deleted)
            const anyVendorUser = allUsersCheck.find(u => 
              (u.app_type === 'vendor_app' || (!u.app_type && u.user_type !== 'C')) &&
              (u.del_status !== 2) // Exclude deleted users
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
                // Customer app user registering in vendor app - check for existing 'N' user first
                // IMPORTANT: All new users (including delivery) should start as 'N' until signup is complete
                const vendorUserType = 'N'; // All new users start as 'N' regardless of join type
                console.log(`📱 Customer app user (ID: ${customerAppUser.id}) registering in vendor app as ${joinType} (${vendorUserType})`);
                
                // Check for existing vendor_app user to avoid duplicates
                let newVendorUser = await this.findOrReuseVendorAppUser(cleanedPhone);
                
                if (!newVendorUser) {
                // Create new vendor app user with type 'N' (will be updated to S/R/SR/D after signup completion)
                const tempName = `User_${cleanedPhone}`;
                const tempEmail = ''; // Don't auto-generate email
                  newVendorUser = await User.create(tempName, tempEmail, cleanedPhone, vendorUserType, cleanedPhone, 'vendor_app', 'v2');
                console.log(`📝 Created new vendor app user (ID: ${newVendorUser.id}) with type '${vendorUserType}' - will be updated after signup completion`);
                } else {
                  console.log(`♻️  Reusing existing vendor_app user (ID: ${newVendorUser.id}, type: ${newVendorUser.user_type}) instead of creating duplicate`);
                }
                
                // Use the existing or newly created user
                existingUser = newVendorUser;
              }
            }
          }
        }
        
        if (existingUser) {
          user = existingUser;
        } else {
          // No suitable existing user found - check for existing vendor_app user first
          const userType = 'N'; // New user - prevents access until signup is complete
          let existingVendorUser = await this.findOrReuseVendorAppUser(cleanedPhone);
          
          if (existingVendorUser) {
            console.log(`♻️  Reusing existing vendor_app user (ID: ${existingVendorUser.id}, type: ${existingVendorUser.user_type}) instead of creating duplicate`);
            user = existingVendorUser;
          } else {
            // Create new one (v2 user)
          // IMPORTANT: Create as 'N' (new_user) - DO NOT create as 'S' or 'R' until signup is complete
          // User type will be changed to 'S' (B2B), 'R' (B2C), or 'SR' (B2B+B2C) only after signup completion
          const tempName = `User_${cleanedPhone}`;
          const tempEmail = ''; // Don't auto-generate email
          user = await User.create(tempName, tempEmail, cleanedPhone, userType, cleanedPhone, 'vendor_app', 'v2');
          console.log(`📝 Created new user (ID: ${user.id}) with type 'N' (new_user) - will be updated to S/R/SR after signup completion`);
          }
        }
      } else {
        // No existing user - check for existing vendor_app user first
        const userType = 'N'; // New user - prevents access until signup is complete
        let existingVendorUser = await this.findOrReuseVendorAppUser(cleanedPhone);
        
        if (existingVendorUser) {
          console.log(`♻️  Reusing existing vendor_app user (ID: ${existingVendorUser.id}, type: ${existingVendorUser.user_type}) instead of creating duplicate`);
          user = existingVendorUser;
        } else {
          // Create new one (v2 user)
        // IMPORTANT: Create as 'N' (new_user) - DO NOT create as 'S' or 'R' until signup is complete
        // User type will be changed to 'S' (B2B), 'R' (B2C), or 'SR' (B2B+B2C) only after signup completion
        const tempName = `User_${cleanedPhone}`;
        const tempEmail = ''; // Don't auto-generate email
        user = await User.create(tempName, tempEmail, cleanedPhone, userType, cleanedPhone, 'vendor_app', 'v2');
        console.log(`📝 Created new user (ID: ${user.id}) with type 'N' (new_user) - will be updated to S/R/SR after signup completion`);
        }
      }
      }
    } else {
      // Existing user - validate cross-login restrictions
      const userDashboardType = this.mapUserTypeToDashboard(user.user_type);
      
      // Check if user is v1 (no restrictions) or v2 (with restrictions)
      const isV1User = !user.app_version || user.app_version === 'v1' || user.app_version === 'v1.0';
      
      if (isV1User) {
        // V1 users should be treated as new users and directed to signup screens
        // Change user_type to 'N' (new user) so they go through signup flow
        // This will upgrade them to V2 after signup completion
        if (user.user_type !== 'N' && user.user_type !== 'D') {
          console.log(`📱 V1 user (ID: ${user.id}, current type: ${user.user_type}) - converting to 'N' (new user) to trigger signup flow`);
          await User.updateProfile(user.id, { user_type: 'N' });
          user.user_type = 'N';
          console.log(`✅ V1 user converted to 'N' - will be routed to signup screen`);
        } else if (user.user_type === 'D') {
          // Delivery users keep their type but still need to complete signup
          console.log(`📱 V1 Delivery user (ID: ${user.id}) - will be routed to delivery signup screen`);
        }
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
          // IMPORTANT: All new users (including delivery) should start as 'N' until signup is complete
          const vendorUserType = 'N'; // All new users start as 'N' regardless of join type
          console.log(`📱 Customer app user (ID: ${user.id}) registering in vendor app as ${joinType} (${vendorUserType})`);
          
          // Check for existing vendor_app user to avoid duplicates
          let existingVendorUser = await this.findOrReuseVendorAppUser(cleanedPhone);
          
          if (existingVendorUser) {
            console.log(`♻️  Reusing existing vendor_app user (ID: ${existingVendorUser.id}, type: ${existingVendorUser.user_type}) instead of creating duplicate`);
            user = existingVendorUser;
          } else {
          // Create new vendor app user with type 'N' (will be updated to S/R/SR/D after signup completion)
          const tempName = `User_${cleanedPhone}`;
          const tempEmail = ''; // Don't auto-generate email
          user = await User.create(tempName, tempEmail, cleanedPhone, vendorUserType, cleanedPhone, 'vendor_app', 'v2');
          console.log(`📝 Created new vendor app user (ID: ${user.id}) with type '${vendorUserType}' - will be updated after signup completion`);
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
      // Allow users to switch between B2B and B2C signup screens until signup is complete
      // IMPORTANT: Do NOT change user_type during OTP - only after signup completion
      if (joinType && joinType !== userDashboardType && user.user_type !== 'C') {
        // Check if user has completed signup for their current type
        const Shop = require('../../models/Shop');
        const shop = await Shop.findByUserId(user.id);
        
        // Check if B2B signup is complete (form + all documents)
        const isB2BComplete = shop && 
                              shop.company_name && shop.company_name.trim() !== '' &&
                              shop.gst_number && shop.gst_number.trim() !== '' &&
                              shop.business_license_url && shop.business_license_url.trim() !== '' &&
                              shop.gst_certificate_url && shop.gst_certificate_url.trim() !== '' &&
                              shop.address_proof_url && shop.address_proof_url.trim() !== '' &&
                              shop.kyc_owner_url && shop.kyc_owner_url.trim() !== '';
        
        // Check if B2C signup is complete (name + address + contact + aadhar card)
        const isB2CComplete = user.name && user.name.trim() !== '' &&
                              shop && shop.address && shop.address.trim() !== '' &&
                              shop.contact && String(shop.contact || '').trim() !== '' &&
                              shop.aadhar_card && shop.aadhar_card.trim() !== '';
        
        // IMPORTANT: NEVER change user_type in auth service
        // User type changes should ONLY happen in signup services after complete signup verification
        // This service only allows/denies access to signup screens
        
        // New users (type 'N') - always allow access to signup screens
        if (user.user_type === 'N') {
          console.log(`✅ New user (ID: ${user.id}, type: N) - allowing access to ${joinType} signup screen`);
        }
        // If user is already SR and both signups are complete, allow access
        else if (user.user_type === 'SR' && isB2BComplete && isB2CComplete) {
          console.log(`✅ SR user (ID: ${user.id}) with complete signups - allowing access to ${joinType} dashboard`);
        }
        // If user is S (B2B) and B2B signup is complete, allow B2B access
        else if (user.user_type === 'S' && isB2BComplete && joinType === 'b2b') {
          console.log(`✅ B2B user (ID: ${user.id}) with complete signup - allowing access to B2B dashboard`);
        }
        // If user is R (B2C) and B2C signup is complete, allow B2C access
        else if (user.user_type === 'R' && isB2CComplete && joinType === 'b2c') {
          console.log(`✅ B2C user (ID: ${user.id}) with complete signup - allowing access to B2C dashboard`);
        }
        // If user has incomplete signup or wrong user_type, allow access to signup screens
        // Don't block access - let them complete signup first
        else {
          // Allow access to signup screens for incomplete signups
          // User type will be updated in signup services after complete signup
          console.log(`✅ User (ID: ${user.id}, type: ${user.user_type}) - allowing access to ${joinType} signup screen`);
          console.log(`   B2B complete: ${isB2BComplete}, B2C complete: ${isB2CComplete}`);
          
          // If user_type doesn't match signup completion, log warning but don't block
          if ((user.user_type === 'S' || user.user_type === 'SR') && !isB2BComplete) {
            console.log(`⚠️  WARNING: User type is ${user.user_type} but B2B signup is incomplete`);
          }
          if ((user.user_type === 'R' || user.user_type === 'SR') && !isB2CComplete) {
            console.log(`⚠️  WARNING: User type is ${user.user_type} but B2C signup is incomplete`);
          }
        }
      }
    }

    // Check if admin/user type (not allowed)
    if (user.user_type === 'A' || user.user_type === 'U') {
      throw new Error('This number is registered as admin. Please use web login.');
    }

    // Check signup completion before determining dashboard type
    // Users should not be treated as registered B2B or B2C until signup is complete
    const Shop = require('../../models/Shop');
    const shop = await Shop.findByUserId(user.id);
    
    // Check if B2B signup is complete
    const isB2BComplete = shop && shop.company_name && shop.company_name.trim() !== '' &&
                          shop.gst_number && shop.gst_number.trim() !== '' &&
                          shop.business_license_url && shop.business_license_url.trim() !== '' &&
                          shop.gst_certificate_url && shop.gst_certificate_url.trim() !== '' &&
                          shop.address_proof_url && shop.address_proof_url.trim() !== '' &&
                          shop.kyc_owner_url && shop.kyc_owner_url.trim() !== '';
    
    // Check if B2C signup is complete
    const isB2CComplete = user.name && user.name.trim() !== '' &&
                          shop && shop.address && shop.address.trim() !== '' &&
                          shop.contact && String(shop.contact || '').trim() !== '' &&
                          shop.aadhar_card && shop.aadhar_card.trim() !== '';
    
    // Determine dashboard type based on signup completion
    // If signup is not complete, use joinType to direct to signup screen
    // If signup is complete, use the appropriate dashboard
    // For customer app requests, no dashboard type is needed (regardless of user_type in DB)
    let dashboardType;
    let allowedDashboards = [];
    
    // Customer app requests - no dashboard needed (even if DB has vendor_app data)
    if (targetAppType === 'customer_app') {
      dashboardType = null; // Customer app doesn't use dashboards
      allowedDashboards = []; // No dashboards for customer app
      console.log(`📋 Customer app request (ID: ${user.id}) - no dashboard type needed (DB user_type: ${user.user_type}, DB app_type: ${user.app_type})`);
    } else {
      // Vendor app users - determine dashboard type
      // New users (type 'N') - always use joinType to direct to signup screen
      if (user.user_type === 'N') {
        dashboardType = joinType || 'b2c'; // Default to b2c if no joinType
      } else if (joinType) {
        // Use joinType if provided (user selected B2B or B2C)
        // This will direct them to the signup screen if incomplete, or dashboard if complete
        dashboardType = joinType;
      } else if (isB2BComplete && isB2CComplete && user.user_type === 'SR') {
        // Both complete - default to b2b
        dashboardType = 'b2b';
      } else if (isB2BComplete && (user.user_type === 'S' || user.user_type === 'SR')) {
        // B2B signup complete - can access B2B dashboard
        dashboardType = 'b2b';
      } else if (isB2CComplete && (user.user_type === 'R' || user.user_type === 'SR')) {
        // B2C signup complete - can access B2C dashboard
        dashboardType = 'b2c';
      } else {
        // Signup not complete - use joinType if provided, otherwise map from user_type
        // This will direct to signup screen
        dashboardType = joinType || this.mapUserTypeToDashboard(user.user_type, joinType);
      }
      
      console.log(`📋 Dashboard type determined: ${dashboardType} (B2B complete: ${isB2BComplete}, B2C complete: ${isB2CComplete}, user_type: ${user.user_type}, joinType: ${joinType})`);
      
      // Get user's allowed dashboards for permission checking (only for vendor app)
      try {
        console.log(`🔍 Getting user dashboards for user ${user.id}, user_type: ${user.user_type}`);
        const dashboardInfo = await V2ShopTypeService.getUserDashboards(user.id);
        console.log(`📋 getUserDashboards returned:`, JSON.stringify(dashboardInfo, null, 2));
        allowedDashboards = dashboardInfo.allowedDashboards || [];
        console.log(`✅ Final allowedDashboards:`, allowedDashboards);
      } catch (error) {
        console.error('❌ Error getting user dashboards:', error);
        console.error('Error stack:', error.stack);
        // Fallback: use dashboardType to determine allowed dashboards
        allowedDashboards = dashboardType ? [dashboardType] : [];
        console.log(`⚠️  Using fallback allowedDashboards:`, allowedDashboards);
      }
    }

    // Create Customer record for customer_app users if it doesn't exist
    if (targetAppType === 'customer_app' && user && user.id && user.app_type === 'customer_app') {
      try {
        console.log(`🔍 Checking for Customer record for customer_app user ${user.id}`);
        let customer = await Customer.findByUserId(user.id);
        
        if (!customer) {
          console.log(`📝 No Customer record found for user ${user.id} - creating one...`);
          const customerData = {
            user_id: user.id,
            email: user.email || '',
            name: user.name || `User_${cleanedPhone}`,
            contact: cleanedPhone,
            address: '',
            location: '',
            state: '',
            place: '',
            language: 'en',
            profile_photo: null,
            pincode: '',
            lat_log: '',
            place_id: ''
          };
          
          customer = await Customer.create(customerData);
          console.log(`✅ Created Customer record (ID: ${customer.id}) for customer_app user ${user.id}`);
        } else {
          console.log(`✅ Customer record already exists (ID: ${customer.id}) for user ${user.id}`);
        }
      } catch (customerError) {
        console.error('❌ Error creating/finding Customer record:', customerError);
        // Don't fail login if Customer creation fails - user can still proceed
      }
    }

    // Save FCM token for customer_app users if provided
    if (fcmToken && targetAppType === 'customer_app' && user && user.id) {
      try {
        console.log(`💾 Saving FCM token for customer_app user ${user.id}`);
        console.log(`   User details: app_type=${user.app_type}, user_type=${user.user_type}, name=${user.name}`);
        console.log(`   FCM token preview: ${fcmToken.substring(0, 30)}...`);
        
        // Verify user is actually customer_app before saving
        if (user.app_type !== 'customer_app') {
          console.error(`❌ ERROR: Attempting to save FCM token to non-customer_app user! User ID: ${user.id}, app_type: ${user.app_type}`);
          throw new Error(`Cannot save FCM token to non-customer_app user (app_type: ${user.app_type})`);
        }
        
        await User.updateFcmToken(user.id, fcmToken);
        // Update fcm_token_time
        await User.updateProfile(user.id, { fcm_token_time: Math.floor(Date.now() / 1000) });
        console.log(`✅ FCM token saved successfully for customer_app user ${user.id} (user_type: ${user.user_type})`);
      } catch (fcmError) {
        console.error('❌ Error saving FCM token:', fcmError);
        // Don't fail login if FCM token save fails
      }
    }

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

    // Check B2B signup status for B2B users (S or SR) - only for vendor app requests
    // Don't check B2B status for customer_app requests
    let b2bStatus = null;
    if (targetAppType === 'vendor_app' && (user.user_type === 'S' || user.user_type === 'SR')) {
      console.log(`🔍 Checking B2B status for user ${user.id}, user_type: ${user.user_type}`);
      try {
        console.log(`📋 User is B2B (${user.user_type}), checking shop record...`);
        const Shop = require('../../models/Shop');
        const shop = await Shop.findByUserId(user.id);
        
        console.log(`📋 Shop lookup result:`, shop ? `Found shop ID ${shop.id}` : 'No shop found');
        
        if (!shop || !shop.id) {
          // No shop record - new user (even if v1 user with user_type S or SR)
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
          
          // User is only considered a B2B user if BOTH form is complete AND all documents are uploaded
          const isCompleteB2BSignup = hasCompanyName && hasGstNumber && hasAllDocuments;
          
          console.log(`📋 Shop fields check:`, {
            hasCompanyName,
            hasGstNumber,
            hasAllDocuments,
            isCompleteB2BSignup,
            approval_status: shop.approval_status
          });
          
          if (!isCompleteB2BSignup) {
            // Signup incomplete - new user (even if v1 user with user_type S or SR)
            b2bStatus = 'new_user';
            console.log(`✅ B2B status set to: new_user (incomplete signup - missing form fields or documents)`);
          } else {
            // Complete B2B signup (form + all documents) - check approval status
            if (shop.approval_status === 'approved') {
              b2bStatus = 'approved';
            } else if (shop.approval_status === 'rejected') {
              b2bStatus = 'rejected';
            } else {
              // pending or null - user is a B2B user but awaiting approval
              b2bStatus = 'pending';
            }
            console.log(`✅ B2B status set to: ${b2bStatus} (complete signup, approval_status: ${shop.approval_status})`);
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

    // For customer_app requests, override app_type and user_type in response
    // This ensures customer_app only sees customer data, not vendor data
    if (targetAppType === 'customer_app') {
      // Override app_type to customer_app and user_type to 'C' for customer_app requests
      userWithoutPassword.app_type = 'customer_app';
      // Only set user_type to 'C' if it's not already 'C' (preserve 'C' if exists)
      if (userWithoutPassword.user_type !== 'C') {
        userWithoutPassword.user_type = 'C';
      }
      console.log(`🔒 Customer app request - overriding app_type to 'customer_app' and user_type to 'C' (original: app_type=${user.app_type}, user_type=${user.user_type})`);
    }

    const responseData = {
      user: userWithoutPassword,
      token,
    };

    // Only include vendor-specific fields for vendor_app requests
    if (targetAppType === 'vendor_app') {
      responseData.dashboardType = dashboardType;
      responseData.allowedDashboards = allowedDashboards;
      responseData.b2bStatus = b2bStatus;
    } else {
      // For customer_app, don't include vendor-specific fields
      console.log(`🔒 Customer app request - excluding dashboardType, allowedDashboards, and b2bStatus from response`);
    }
    
    console.log(`📋 Returning response data - app_type: ${targetAppType}, keys:`, Object.keys(responseData));
    
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
      case 'N': // New user - not yet registered, use preferred dashboard or default to b2c
        return preferredDashboard && (preferredDashboard === 'b2b' || preferredDashboard === 'b2c') 
          ? preferredDashboard 
          : 'b2c';
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
      case 'C': // Customer (customer app - common users)
        // Customer app users don't use dashboards - return null
        return null;
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

