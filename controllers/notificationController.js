const Notifications = require('../models/Notifications');
const RedisCache = require('../utils/redisCache');

class NotificationController {
  // Notification by ID
  static async notiById(req, res) {
    try {
      const { id, offset = 0 } = req.params;

      if (!id) {
        return res.status(201).json({
          status: 'error',
          msg: 'empty param',
          data: ''
        });
      }

      const offsetValue = offset ? parseInt(offset) : 0;
      
      // Check Redis cache first
      const cacheKey = RedisCache.notificationKey(id, `offset:${offsetValue}`);
      try {
        const cached = await RedisCache.get(cacheKey);
        if (cached) {
          console.log('⚡ Notifications cache hit:', cacheKey);
          return res.json({
            status: 'success',
            msg: 'Notifications',
            data: cached
          });
        }
      } catch (err) {
        console.error('Redis get error:', err);
      }
      
      const notifications = await Notifications.findByUserId(id, offsetValue, 10);

      // Cache notifications for 5 minutes
      try {
        await RedisCache.set(cacheKey, notifications, '365days');
        console.log('💾 Notifications cached:', cacheKey);
      } catch (err) {
        console.error('Redis cache set error:', err);
      }

      res.json({
        status: 'success',
        msg: 'Notifications',
        data: notifications
      });
    } catch (err) {
      console.error('Notification by ID error:', err);
      res.status(201).json({
        status: 'error',
        msg: 'Failed to fetch notifications',
        data: ''
      });
    }
  }

  // Notification read
  static async notifRead(req, res) {
    try {
      const { user_id, notification_id } = req.body;

      if (!user_id || !notification_id) {
        return res.status(201).json({
          status: 'error',
          msg: 'empty param',
          data: ''
        });
      }

      const notification = await Notifications.getById(notification_id);
      if (!notification) {
        return res.status(201).json({
          status: 'error',
          msg: 'Notification not found',
          data: ''
        });
      }

      await Notifications.setReadAt(notification_id);
      const updatedNotification = await Notifications.getById(notification_id);

      // Invalidate notification cache for this user
      try {
        await RedisCache.invalidateTableCache('notifications');
        await RedisCache.delete(RedisCache.notificationKey(user_id));
        console.log('🗑️  Invalidated notification caches after read');
      } catch (err) {
        console.error('Redis cache invalidation error:', err);
      }

      res.json({
        status: 'success',
        msg: 'Successfull',
        data: updatedNotification
      });
    } catch (err) {
      console.error('Notification read error:', err);
      res.status(201).json({
        status: 'error',
        msg: 'Failed to mark as read',
        data: ''
      });
    }
  }
}

module.exports = NotificationController;

