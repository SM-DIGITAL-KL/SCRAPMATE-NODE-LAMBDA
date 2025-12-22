/**
 * V2 Notification Controller
 * Handles push notification sending via FCM
 */

const User = require('../models/User');
const { sendNotification } = require('../utils/fcmNotification');
const RedisCache = require('../utils/redisCache');

class V2NotificationController {
  /**
   * Send push notification by phone number or user_id
   * POST /api/v2/notifications/send
   * Body: { phone_number?: string, user_id?: number, title: string, body: string, data?: object }
   */
  static async sendNotification(req, res) {
    try {
      const { phone_number, user_id, title, body, data = {} } = req.body;

      console.log('📨 V2NotificationController.sendNotification called');
      console.log('   Request data:', {
        phone_number: phone_number ? phone_number.substring(0, 3) + '***' : null,
        user_id,
        hasTitle: !!title,
        hasBody: !!body
      });

      // Validate required fields
      if (!title || !body) {
        return res.status(400).json({
          status: 'error',
          msg: 'Title and body are required',
          data: null
        });
      }

      // Must provide either phone_number or user_id
      if (!phone_number && !user_id) {
        return res.status(400).json({
          status: 'error',
          msg: 'Either phone_number or user_id is required',
          data: null
        });
      }

      let user = null;

      // Find user by phone number or user_id
      if (phone_number) {
        console.log(`🔍 Finding user by phone number: ${phone_number}`);
        user = await User.findByMobile(phone_number);
        
        // Filter for customer_app users only
        if (user && user.app_type !== 'customer_app') {
          console.log(`⚠️ User ${user.id} is not a customer_app user (app_type: ${user.app_type})`);
          return res.status(400).json({
            status: 'error',
            msg: 'User is not a customer_app user',
            data: null
          });
        }
      } else if (user_id) {
        console.log(`🔍 Finding user by ID: ${user_id}`);
        user = await User.findById(user_id);
        
        // Filter for customer_app users only
        if (user && user.app_type !== 'customer_app') {
          console.log(`⚠️ User ${user.id} is not a customer_app user (app_type: ${user.app_type})`);
          return res.status(400).json({
            status: 'error',
            msg: 'User is not a customer_app user',
            data: null
          });
        }
      }

      if (!user) {
        return res.status(404).json({
          status: 'error',
          msg: 'User not found',
          data: null
        });
      }

      // Check if user has FCM token
      if (!user.fcm_token) {
        return res.status(400).json({
          status: 'error',
          msg: 'User does not have an FCM token registered',
          data: null
        });
      }

      console.log(`✅ Found user: ID=${user.id}, name=${user.name}, hasFcmToken=${!!user.fcm_token}`);

      // Send notification
      try {
        const notificationData = {
          type: data.type || 'general',
          ...data
        };

        const result = await sendNotification(
          user.fcm_token,
          title,
          body,
          notificationData
        );

        if (result.success) {
          console.log('✅ Notification sent successfully to user:', user.id);
          
          // Invalidate user cache
          try {
            await RedisCache.delete(RedisCache.userKey(user.id));
          } catch (redisErr) {
            console.error('Redis cache invalidation error:', redisErr);
          }

          return res.json({
            status: 'success',
            msg: 'Notification sent successfully',
            data: {
              user_id: user.id,
              phone_number: user.mob_num,
              messageId: result.messageId
            }
          });
        } else {
          return res.status(400).json({
            status: 'error',
            msg: result.message || 'Failed to send notification',
            data: null
          });
        }
      } catch (fcmError) {
        console.error('❌ FCM error:', fcmError);
        return res.status(500).json({
          status: 'error',
          msg: fcmError.message || 'Failed to send notification',
          data: null
        });
      }
    } catch (error) {
      console.error('❌ V2NotificationController.sendNotification error:', error);
      console.error('   Error stack:', error.stack);
      return res.status(500).json({
        status: 'error',
        msg: 'Internal server error',
        data: null
      });
    }
  }

  /**
   * Send push notification to multiple users
   * POST /api/v2/notifications/send-bulk
   * Body: { user_ids?: number[], phone_numbers?: string[], title: string, body: string, data?: object }
   */
  static async sendBulkNotification(req, res) {
    try {
      const { user_ids, phone_numbers, title, body, data = {} } = req.body;

      console.log('📨 V2NotificationController.sendBulkNotification called');
      console.log('   Request data:', {
        user_ids_count: user_ids ? user_ids.length : 0,
        phone_numbers_count: phone_numbers ? phone_numbers.length : 0,
        hasTitle: !!title,
        hasBody: !!body
      });

      // Validate required fields
      if (!title || !body) {
        return res.status(400).json({
          status: 'error',
          msg: 'Title and body are required',
          data: null
        });
      }

      // Must provide either user_ids or phone_numbers
      if ((!user_ids || user_ids.length === 0) && (!phone_numbers || phone_numbers.length === 0)) {
        return res.status(400).json({
          status: 'error',
          msg: 'Either user_ids or phone_numbers array is required',
          data: null
        });
      }

      const users = [];
      const fcmTokens = [];

      // Find users by phone numbers
      if (phone_numbers && phone_numbers.length > 0) {
        for (const phone of phone_numbers) {
          try {
            const user = await User.findByMobile(phone);
            if (user && user.app_type === 'customer_app' && user.fcm_token) {
              users.push(user);
              fcmTokens.push(user.fcm_token);
            }
          } catch (err) {
            console.error(`Error finding user by phone ${phone}:`, err);
          }
        }
      }

      // Find users by IDs
      if (user_ids && user_ids.length > 0) {
        for (const userId of user_ids) {
          try {
            const user = await User.findById(userId);
            if (user && user.app_type === 'customer_app' && user.fcm_token) {
              // Avoid duplicates
              if (!users.find(u => u.id === user.id)) {
                users.push(user);
                fcmTokens.push(user.fcm_token);
              }
            }
          } catch (err) {
            console.error(`Error finding user by ID ${userId}:`, err);
          }
        }
      }

      if (fcmTokens.length === 0) {
        return res.status(400).json({
          status: 'error',
          msg: 'No users found with valid FCM tokens',
          data: null
        });
      }

      console.log(`✅ Found ${users.length} users with FCM tokens`);

      // Send notifications using multicast
      const { sendMulticastNotification } = require('../utils/fcmNotification');
      const notificationData = {
        type: data.type || 'general',
        ...data
      };

      const result = await sendMulticastNotification(
        fcmTokens,
        title,
        body,
        notificationData
      );

      console.log('✅ Bulk notification sent:', {
        successCount: result.successCount,
        failureCount: result.failureCount
      });

      return res.json({
        status: 'success',
        msg: 'Bulk notification sent',
        data: {
          totalUsers: users.length,
          successCount: result.successCount,
          failureCount: result.failureCount
        }
      });
    } catch (error) {
      console.error('❌ V2NotificationController.sendBulkNotification error:', error);
      return res.status(500).json({
        status: 'error',
        msg: 'Internal server error',
        data: null
      });
    }
  }
}

module.exports = V2NotificationController;

