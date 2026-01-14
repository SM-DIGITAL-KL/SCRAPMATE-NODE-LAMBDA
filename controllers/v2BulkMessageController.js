/**
 * V2 Bulk Message Controller
 * Handles saving and retrieving bulk SMS notification records
 */

const BulkMessageNotification = require('../models/BulkMessageNotification');

class V2BulkMessageController {
  /**
   * POST /api/v2/bulk-message/notify
   * Save bulk message notification records
   * Body: {
   *   notifications: [
   *     {
   *       phone_number: string,
   *       business_data: {
   *         title: string,
   *         street: string,
   *         city?: string,
   *         state?: string,
   *         phone?: string,
   *         categoryName?: string,
   *         url?: string
   *       },
   *       message: string,
   *       status?: 'sent' | 'failed' | 'pending',
   *       language?: string
   *     }
   *   ]
   * }
   * 
   * OR single notification:
   * Body: {
   *   phone_number: string,
   *   business_data: {...},
   *   message: string,
   *   status?: string,
   *   language?: string
   * }
   */
  static async saveNotifications(req, res) {
    try {
      console.log('📨 [V2BulkMessageController.saveNotifications] Request received');
      console.log('   Body keys:', Object.keys(req.body || {}));

      const { notifications, phone_number, business_data, message, status, language } = req.body;

      // Handle batch notifications
      if (notifications && Array.isArray(notifications)) {
        if (notifications.length === 0) {
          return res.status(400).json({
            status: 'error',
            msg: 'Notifications array cannot be empty',
            data: null
          });
        }

        // Validate all notifications
        for (let i = 0; i < notifications.length; i++) {
          const notif = notifications[i];
          if (!notif.phone_number) {
            return res.status(400).json({
              status: 'error',
              msg: `Phone number is required for notification at index ${i}`,
              data: null
            });
          }
        }

        try {
          const result = await BulkMessageNotification.saveBatch(notifications);
          
          return res.status(200).json({
            status: 'success',
            msg: 'Bulk message notifications saved successfully',
            data: {
              total: result.total,
              success: result.success,
              failed: result.failed
            }
          });
        } catch (err) {
          console.error('Error saving batch notifications:', err);
          return res.status(500).json({
            status: 'error',
            msg: err.message || 'Failed to save bulk message notifications',
            data: null
          });
        }
      }

      // Handle single notification
      if (!phone_number) {
        return res.status(400).json({
          status: 'error',
          msg: 'Phone number is required. Use "phone_number" for single notification or "notifications" array for batch.',
          data: null
        });
      }

      try {
        const notification = await BulkMessageNotification.save({
          phone_number,
          business_data,
          message,
          status,
          language
        });

        return res.status(200).json({
          status: 'success',
          msg: 'Bulk message notification saved successfully',
          data: notification
        });
      } catch (err) {
        console.error('Error saving notification:', err);
        return res.status(500).json({
          status: 'error',
          msg: err.message || 'Failed to save bulk message notification',
          data: null
        });
      }
    } catch (err) {
      console.error('❌ [V2BulkMessageController.saveNotifications] Error:', err);
      return res.status(500).json({
        status: 'error',
        msg: 'Internal server error',
        data: null
      });
    }
  }

  /**
   * GET /api/v2/bulk-message/check/:phoneNumber
   * Check if a phone number has been notified
   * Returns: Array of notification records for this phone number
   */
  static async checkNotification(req, res) {
    try {
      const { phoneNumber } = req.params;

      if (!phoneNumber) {
        return res.status(400).json({
          status: 'error',
          msg: 'Phone number is required',
          data: null
        });
      }

      try {
        const notifications = await BulkMessageNotification.findByPhoneNumber(phoneNumber);
        
        return res.status(200).json({
          status: 'success',
          msg: notifications.length > 0 
            ? 'User has been notified' 
            : 'User has not been notified',
          data: {
            phone_number: phoneNumber,
            is_notified: notifications.length > 0,
            notification_count: notifications.length,
            notifications: notifications
          }
        });
      } catch (err) {
        console.error('Error checking notification:', err);
        return res.status(500).json({
          status: 'error',
          msg: err.message || 'Failed to check notification status',
          data: null
        });
      }
    } catch (err) {
      console.error('❌ [V2BulkMessageController.checkNotification] Error:', err);
      return res.status(500).json({
        status: 'error',
        msg: 'Internal server error',
        data: null
      });
    }
  }

  /**
   * POST /api/v2/bulk-message/check-batch
   * Check if multiple phone numbers have been notified
   * Body: {
   *   phone_numbers: string[]
   * }
   */
  static async checkNotificationsBatch(req, res) {
    try {
      const { phone_numbers } = req.body;

      if (!phone_numbers || !Array.isArray(phone_numbers) || phone_numbers.length === 0) {
        return res.status(400).json({
          status: 'error',
          msg: 'phone_numbers array is required and must not be empty',
          data: null
        });
      }

      try {
        const result = await BulkMessageNotification.findByPhoneNumbers(phone_numbers);
        
        // Transform result to include is_notified flag
        const transformedResult = {};
        phone_numbers.forEach(phone => {
          const normalizedPhone = phone.replace(/[\s+\-()]/g, '');
          const notifications = result[normalizedPhone] || [];
          transformedResult[normalizedPhone] = {
            phone_number: normalizedPhone,
            is_notified: notifications.length > 0,
            notification_count: notifications.length,
            notifications: notifications
          };
        });

        return res.status(200).json({
          status: 'success',
          msg: 'Notification status checked for all phone numbers',
          data: transformedResult
        });
      } catch (err) {
        console.error('Error checking batch notifications:', err);
        return res.status(500).json({
          status: 'error',
          msg: err.message || 'Failed to check notification status',
          data: null
        });
      }
    } catch (err) {
      console.error('❌ [V2BulkMessageController.checkNotificationsBatch] Error:', err);
      return res.status(500).json({
        status: 'error',
        msg: 'Internal server error',
        data: null
      });
    }
  }

  /**
   * GET /api/v2/bulk-message/notifications
   * Get all notifications with pagination
   * Query params: ?limit=100&lastKey=...
   */
  static async getAllNotifications(req, res) {
    try {
      const limit = parseInt(req.query.limit) || 100;
      const lastKey = req.query.lastKey ? JSON.parse(decodeURIComponent(req.query.lastKey)) : null;

      try {
        const result = await BulkMessageNotification.findAll(limit, lastKey);
        
        return res.status(200).json({
          status: 'success',
          msg: 'Notifications retrieved successfully',
          data: {
            items: result.items,
            count: result.items.length,
            has_more: !!result.lastKey,
            last_key: result.lastKey
          }
        });
      } catch (err) {
        console.error('Error getting all notifications:', err);
        return res.status(500).json({
          status: 'error',
          msg: err.message || 'Failed to retrieve notifications',
          data: null
        });
      }
    } catch (err) {
      console.error('❌ [V2BulkMessageController.getAllNotifications] Error:', err);
      return res.status(500).json({
        status: 'error',
        msg: 'Internal server error',
        data: null
      });
    }
  }
}

module.exports = V2BulkMessageController;











