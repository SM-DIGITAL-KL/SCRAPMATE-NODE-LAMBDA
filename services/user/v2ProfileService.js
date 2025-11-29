/**
 * V2 Profile Service
 * Business logic for user profile management
 */

const User = require('../../models/User');
const Shop = require('../../models/Shop');
const DeliveryBoy = require('../../models/DeliveryBoy');
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
            };
            
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
            };
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

      // Update shop data for B2B/B2C users
      if ((user.user_type === 'S' || user.user_type === 'R' || user.user_type === 'SR') && updateData.shop) {
        try {
          let shop = await Shop.findByUserId(userId);
          console.log(`🔍 Shop lookup for user ${userId}:`, shop ? `Found shop ${shop.id}` : 'Not found');
          
          // Create shop if it doesn't exist
          if (!shop) {
            console.log(`📝 Creating shop for user ${userId} with address:`, updateData.shop.address);
            const shopData = {
              user_id: userId,
              email: user.email || '',
              shopname: user.name || '',
              address: updateData.shop.address || '',
            };
            shop = await Shop.create(shopData);
            console.log(`✅ Shop created with ID ${shop.id}, address:`, shop.address);
          } else {
            // Update existing shop
            const shopUpdateData = {};
            if (updateData.shop.shopname !== undefined) shopUpdateData.shopname = updateData.shop.shopname;
            if (updateData.shop.ownername !== undefined) shopUpdateData.ownername = updateData.shop.ownername;
            if (updateData.shop.address !== undefined) {
              shopUpdateData.address = updateData.shop.address;
              console.log(`📝 Updating shop ${shop.id} address to:`, updateData.shop.address);
            }
            if (updateData.shop.contact !== undefined) shopUpdateData.contact = updateData.shop.contact;

            if (Object.keys(shopUpdateData).length > 0) {
              console.log(`🔄 Updating shop ${shop.id} with data:`, JSON.stringify(shopUpdateData, null, 2));
              await Shop.update(shop.id, shopUpdateData);
              console.log(`✅ Shop ${shop.id} updated successfully`);
              
              // Verify the update
              const updatedShop = await Shop.findById(shop.id);
              console.log(`✅ Verified shop ${shop.id} address after update:`, updatedShop?.address);
            } else {
              console.log(`⚠️ No shop data to update`);
            }
          }
        } catch (err) {
          console.error('❌ Error updating shop data:', err);
          throw err; // Re-throw to surface the error
        }
      }

      // Update delivery boy data for Delivery users (address, contact, and delivery_mode)
      if (user.user_type === 'D' && updateData.delivery) {
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
          
          console.log(`📝 Processing delivery update for user ${userId}`);
          console.log(`📝 Address value received:`, addressValue);
          console.log(`📝 Contact value received:`, contactValue);
          console.log(`📝 Delivery mode value received:`, modeValue);
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
}

module.exports = V2ProfileService;

